import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { pesquisarReferencias, baixarReferenciaPublica } from '../src/miniaturas/pesquisa.ts';
import {
  prepararReferencia,
  imagemParaModelo,
  verificarImagem,
} from '../src/miniaturas/imagens.ts';
import { gerarImagem, geracaoConfigurada, montarInstrucao } from '../src/miniaturas/provedor.ts';
config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
const modelo = process.argv.find((arg) => arg.startsWith('--modelo='))?.slice(9);
const gerar = process.argv.includes('--gerar');
if (!modelo) {
  console.log('Uso: npm run doctor:image -- --modelo="Marca Modelo" [--gerar]');
  console.log('Sem --gerar: testa apenas pesquisa e download, sem consumir a cota da IA.');
  process.exit(0);
}
try {
  const inicio = Date.now();
  const pesquisa = await pesquisarReferencias(modelo);
  console.log(
    `Pesquisa: ${pesquisa.fontes.length} fontes em ${((Date.now() - inicio) / 1000).toFixed(1)}s.`,
  );
  for (const fonte of pesquisa.fontes) console.log(`- ${fonte.titulo}: ${fonte.url}`);
  const referencias = [];
  for (const fonte of pesquisa.fontes
    .filter((f) => f.imagem && f.correspondencia !== 'familia')
    .slice(0, 4)) {
    try {
      referencias.push(
        await imagemParaModelo(
          await prepararReferencia(await baixarReferenciaPublica(fonte.imagem)),
        ),
      );
      console.log('Foto de referencia baixada e decodificada.');
      break;
    } catch {
      console.log('Foto indisponivel; tentando a proxima fonte.');
    }
  }
  if (!referencias.length && !pesquisa.fontes.some((f) => f.correspondencia !== 'familia'))
    throw new Error('Modelo nao confirmado nas fontes consultadas.');
  if (!gerar) {
    console.log(
      referencias.length
        ? 'Pesquisa e foto verificadas. Geracao nao executada.'
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
    observacoes: '',
    correcao: '',
    pesquisa: pesquisa.fontes
      .filter((f) => f.correspondencia !== 'familia')
      .map((f) => `${f.titulo}: ${f.resumo}`)
      .join('\n'),
  });
  const imagem = await gerarImagem(instrucao, referencias, 1);
  const verificacao = await verificarImagem(imagem, modelo, referencias[0]);
  const pasta = new URL('../.verificacao/miniaturas/', import.meta.url);
  await mkdir(pasta, { recursive: true });
  await writeFile(new URL('candidata.png', pasta), imagem);
  console.log(
    'Imagem real salva em server/.verificacao/miniaturas/candidata.png. Nao foi publicada.',
  );
  console.log(JSON.stringify(verificacao));
} catch (erro) {
  console.error(erro.message);
  process.exitCode = 1;
}
