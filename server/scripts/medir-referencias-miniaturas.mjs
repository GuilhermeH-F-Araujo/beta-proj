import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { baixarFotoDaFonte, pesquisarReferencias } from '../src/miniaturas/pesquisa.ts';
import {
  imagemParaModelo,
  prepararReferencia,
  recortarMiniatura,
  verificarImagem,
} from '../src/miniaturas/imagens.ts';
import { geracaoConfigurada, gerarImagem, montarInstrucao } from '../src/miniaturas/provedor.ts';

const testarGeracao = process.argv.includes('--gerar');
if (testarGeracao) {
  config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
  if (!geracaoConfigurada()) {
    console.error('Configure o Cloudflare no server/.env e verifique se a geracao esta ativa.');
    process.exit(1);
  }
}

const amostra = [
  ['Honda CG 125', null],
  ['Yamaha MT-07', null],
  ['Kawasaki Ninja 400', 2018],
  ['Suzuki Hayabusa', null],
  ['Royal Enfield Himalayan', null],
  ['Ducati Monster 900', null],
  ['BMW R 1250 GS Adventure', null],
  ['Honda XRE 300 Rally', 2023],
  ['Yamaha RD 350', null],
  ['Triumph Street Triple RS', 2020],
];
const arquivo = process.argv.find((arg) => arg.startsWith('--lista='))?.slice(8);
const entradas = arquivo ? JSON.parse(await readFile(arquivo, 'utf8')) : amostra;
if (
  !Array.isArray(entradas) ||
  !entradas.length ||
  !entradas.every(
    (item) =>
      Array.isArray(item) &&
      item.length === 2 &&
      typeof item[0] === 'string' &&
      item[0].trim() &&
      (item[1] === null || (Number.isInteger(item[1]) && item[1] >= 1900 && item[1] <= 2100)),
  )
)
  throw new Error('Use uma lista JSON de pares [modelo com edicao, ano ou null].');
async function medir([modelo, ano]) {
  const pesquisa = await pesquisarReferencias(modelo, ano);
  const fotos = pesquisa.fontes.filter(
    (fonte) => fonte.imagem && fonte.correspondencia !== 'familia',
  );
  let acerto = null;
  let foto;
  for (const fonte of fotos.slice(0, 4)) {
    try {
      foto = await prepararReferencia(await baixarFotoDaFonte(fonte));
      acerto = fonte;
      break;
    } catch {
      // Conta apenas fotos que o backend conseguiu baixar e preparar.
    }
  }
  const status = acerto
    ? `OK · ${acerto.url}`
    : `FALHOU · ${fotos.length} candidatos exatos · ${pesquisa.fontes.length} fontes totais`;
  console.log(`${modelo}${ano ? ` (${ano})` : ''} · ${status}`);
  if (!acerto || !testarGeracao) return Boolean(acerto);
  try {
    const identidade = [modelo, ano].filter(Boolean).join(' ');
    const referencia = await imagemParaModelo(foto);
    const instrucao = montarInstrucao({
      modelo: identidade,
      modo: 'referencia',
      observacoes: '',
      correcao: '',
      pesquisa: `${acerto.titulo}: ${acerto.resumo}`,
    });
    const candidata = await recortarMiniatura(await gerarImagem(instrucao, [referencia], 1));
    const verificacao = await verificarImagem(candidata, identidade, referencia);
    const aprovada =
      verificacao.automatica &&
      verificacao.direcao === 'direita' &&
      verificacao.inteira &&
      verificacao.problemas.length === 0;
    console.log(
      `${identidade} · ${aprovada ? 'Passou na conferencia automatica' : verificacao.problemas.join(' ') || 'Revisao manual necessaria'}`,
    );
    return aprovada;
  } catch (erro) {
    console.log(`${modelo} · Geracao falhou (${erro.codigo || erro.name}).`);
    return false;
  }
}
let acertos = 0;
const simultaneos = testarGeracao ? 1 : 3;
for (let i = 0; i < entradas.length; i += simultaneos) {
  const resultados = await Promise.all(entradas.slice(i, i + simultaneos).map(medir));
  acertos += resultados.filter(Boolean).length;
}
const percentual = (acertos * 100) / entradas.length;
console.log(
  `${testarGeracao ? 'Geracao com conferencia automatica' : 'Cobertura fotografica'}: ${acertos}/${entradas.length} (${percentual.toFixed(1)}%). Meta: 70%.`,
);
process.exitCode = percentual >= 70 ? 0 : 1;
