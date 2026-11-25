import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pesquisarReferencias, baixarFotoDaFonte } from '../src/miniaturas/pesquisa.ts';
import {
  prepararReferencia,
  gerarMiniaturaComIa,
  recortarMiniatura,
  imagemParaModelo,
  verificarImagem,
} from '../src/miniaturas/imagens.ts';
import { geracaoConfigurada, montarInstrucao } from '../src/miniaturas/provedor.ts';
config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
const modelo = process.argv.find((arg) => arg.startsWith('--modelo='))?.slice(9);
const gerar = process.argv.includes('--gerar');
const semFoto = process.argv.includes('--sem-foto');
const fundoChave = process.argv.includes('--magenta') ? 'magenta' : 'verde';
const ficha = process.argv.find((arg) => arg.startsWith('--ficha='))?.slice(8) || '';
const foto = process.argv.find((arg) => arg.startsWith('--foto='))?.slice(7);
const reprocessar = process.argv.find((arg) => arg.startsWith('--reprocessar='))?.slice('--reprocessar='.length);
const bruto = process.argv.find((arg) => arg.startsWith('--bruto='))?.slice(8);
const arquivo = process.argv.find((arg) => arg.startsWith('--saida='))?.slice(8);
if (reprocessar) {
  if (!arquivo) throw new Error('Informe --saida=CAMINHO.png para salvar o recorte.');
  await writeFile(arquivo, await recortarMiniatura(await readFile(reprocessar), fundoChave));
  console.log(`Recorte salvo em ${arquivo} sem nova geracao.`);
  process.exit(0);
}
if (!modelo) {
  console.log('Uso: npm run doctor:image -- --modelo="Marca Modelo" [--gerar]');
  console.log('Use --bruto=CAMINHO com --gerar para salvar a resposta anterior ao recorte.');
  console.log('Use --reprocessar=CAMINHO --saida=CAMINHO.png para repetir so o recorte.');
  console.log('Sem --gerar: testa apenas pesquisa e download, sem consumir a cota da IA.');
  process.exit(0);
}
try {
  const inicio = Date.now();
  const pesquisa = semFoto || foto ? { fontes: [] } : await pesquisarReferencias(modelo);
  console.log(
    `Pesquisa: ${pesquisa.fontes.length} fontes em ${((Date.now() - inicio) / 1000).toFixed(1)}s.`,
  );
  for (const fonte of pesquisa.fontes) console.log(`- ${fonte.titulo}: ${fonte.url}`);
  const referencias = foto && !semFoto ? [await imagemParaModelo(await readFile(foto))] : [];
  for (const fonte of pesquisa.fontes
    .filter((f) => f.imagem && f.correspondencia !== 'familia')
    .slice(0, 4)) {
    try {
      referencias.push(
        await imagemParaModelo(await prepararReferencia(await baixarFotoDaFonte(fonte))),
      );
      console.log('Foto de referencia baixada e decodificada.');
      break;
    } catch {
      console.log('Foto indisponivel; tentando a proxima fonte.');
    }
  }
  const identidadeNaoConfirmada =
    !referencias.length && !pesquisa.fontes.some((f) => f.correspondencia !== 'familia');
  if (identidadeNaoConfirmada)
    console.log('Modelo sem fonte confirmada. Se gerar, a previa sera estimada.');
  if (!gerar) {
    console.log(
      referencias.length
        ? 'Pesquisa e foto verificadas. Geracao nao executada.'
        : identidadeNaoConfirmada
          ? 'Pesquisa concluida sem fonte confirmada. Geracao nao executada.'
          : 'Identificacao textual verificada; sem foto de comparacao. Geracao nao executada.',
    );
    process.exit(0);
  }
  if (!geracaoConfigurada())
    throw new Error(
      'Configure CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_API_TOKEN em server/.env para testar a geracao real.',
    );
  const instrucao = montarInstrucao({
    modelo,
    modo: 'referencia',
    identidadeNaoConfirmada,
    observacoes: '',
    correcao: '',
    fundoChave,
    pesquisa: ficha || pesquisa.fontes
      .filter((f) => f.correspondencia !== 'familia')
      .map((f) => `${f.titulo}: ${f.resumo}`)
      .join('\n'),
  });
  const imagem = await gerarMiniaturaComIa(instrucao, referencias, 1, fundoChave, bruto ? (bytes) => writeFile(bruto, bytes) : undefined);
  const pasta = new URL('../.verificacao/miniaturas/', import.meta.url);
  await mkdir(pasta, { recursive: true });
  const destino = arquivo || new URL('candidata.png', pasta);
  await writeFile(destino, imagem);
  console.log(
    `Imagem salva em ${destino}.`,
  );
  const verificacao = await verificarImagem(imagem, modelo, referencias[0]);
  console.log(JSON.stringify(verificacao));
} catch (erro) {
  console.error(erro.message);
  process.exitCode = 1;
}
