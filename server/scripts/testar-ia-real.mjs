// Bateria real da IA de miniaturas: busca referencias, gera com a Cloudflare, recorta,
// separa a pintura, confere com a IA de visao e salva tudo lado a lado para revisao.
// Uso:
//   npm --prefix server run testar:ia-real                       (lista padrao, gera imagens)
//   npm --prefix server run testar:ia-real -- --so-busca          (so mede o buscador, sem gastar tokens)
//   npm --prefix server run testar:ia-real -- --modelos="BMW R 1250 GS;Ducati Panigale V4 S|2023"
//   npm --prefix server run testar:ia-real -- --saida=C:\caminho\da\pasta
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import sharp from 'sharp';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
const { baixarFotoDaFonte, estatisticasWiki, pesquisarReferencias } = await import(
  '../src/miniaturas/pesquisa.ts'
);
const {
  gerarMiniaturaComIa,
  imagemParaModelo,
  prepararReferencia,
  separarPinturaMiniatura,
  verificarImagem,
  espelharMiniatura,
} = await import('../src/miniaturas/imagens.ts');
const { montarInstrucao, montarInstrucaoCompacta, situacaoGeracao } = await import(
  '../src/miniaturas/provedor.ts'
);
const { limparNomeModelo } = await import('../src/miniaturas/variacoesModelo.ts');

const PADRAO = [
  'Honda CG 160 Fan',
  'Honda Biz 125',
  'Yamaha Fazer FZ25',
  'Kawasaki Ninja 400',
  'Suzuki GSX-R 1000 R',
  'BMW R 1250 GS',
  'BMW S 1000 RR',
  'Ducati Panigale V4 S',
  'Ducati Monster',
  'Harley-Davidson Fat Boy 114',
  'Triumph Tiger 900',
  'KTM 390 Duke',
];
const argumento = (nome) => process.argv.find((arg) => arg.startsWith(`--${nome}=`))?.split('=').slice(1).join('=');
const soBusca = process.argv.includes('--so-busca');
const lista = (argumento('modelos')?.split(';') ?? PADRAO)
  .map((item) => item.trim())
  .filter(Boolean)
  .map((item) => {
    const [nome, ano] = item.split('|');
    return limparNomeModelo(nome, ano ? Number(ano) : null);
  });
const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const saida = argumento('saida') || fileURLToPath(new URL(`../../.teste-ia/${carimbo}/`, import.meta.url));
await mkdir(saida, { recursive: true });

if (!soBusca) {
  const situacao = situacaoGeracao();
  if (!situacao.disponivel) {
    console.error(`Geração indisponível: ${situacao.mensagem}`);
    console.error('Use --so-busca para medir só o buscador.');
    process.exit(1);
  }
}

const pasta = (nome) => nome.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

async function pintarPrevia(base, mascara, rgb) {
  const a = await sharp(base).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const m = await sharp(mascara).ensureAlpha().raw().toBuffer();
  const px = a.data;
  for (let i = 0; i < px.length; i += 4) {
    if (!m[i + 3]) continue;
    const luz = m[i] / 200;
    for (let c = 0; c < 3; c++) px[i + c] = Math.min(255, Math.round(rgb[c] * luz));
    px[i + 3] = Math.max(px[i + 3], m[i + 3]);
  }
  return sharp(px, { raw: a.info }).png().toBuffer();
}

async function ladoALado(referencia, gerada) {
  const altura = 480;
  const esquerda = await sharp(referencia).resize({ height: altura, width: 640, fit: 'contain', background: '#ffffff' }).png().toBuffer();
  const direita = await sharp(gerada).flatten({ background: '#ffffff' }).resize({ height: altura, width: 640, fit: 'contain', background: '#ffffff' }).png().toBuffer();
  return sharp({ create: { width: 1280, height: altura, channels: 3, background: '#ffffff' } })
    .composite([{ input: esquerda, left: 0, top: 0 }, { input: direita, left: 640, top: 0 }])
    .jpeg({ quality: 88 })
    .toBuffer();
}

async function testar({ modelo, ano }) {
  const nome = [modelo, ano].filter(Boolean).join(' ');
  const destino = join(saida, pasta(nome));
  await mkdir(destino, { recursive: true });
  const inicio = Date.now();
  const resultado = { modelo: nome, fontes: 0, fotosExatas: 0, fotosFamilia: 0, referencias: [], etapas: [] };
  try {
    const pesquisa = await pesquisarReferencias(modelo, ano, true);
    const comFoto = pesquisa.fontes.filter((fonte) => fonte.imagem);
    resultado.fontes = pesquisa.fontes.length;
    resultado.listaFontes = pesquisa.fontes.map((fonte) => ({
      titulo: fonte.titulo,
      url: fonte.url,
      foto: Boolean(fonte.imagem),
      correspondencia: fonte.correspondencia || 'exata',
    }));
    resultado.fotosExatas = comFoto.filter((fonte) => fonte.correspondencia !== 'familia').length;
    resultado.fotosFamilia = comFoto.length - resultado.fotosExatas;
    resultado.etapas.push(`busca ${Math.round((Date.now() - inicio) / 1000)}s`);
    const referencias = [];
    const ordenadas = [...comFoto].sort(
      (a, b) => Number(a.correspondencia === 'familia') - Number(b.correspondencia === 'familia'),
    );
    for (const fonte of ordenadas) {
      if (referencias.length >= 4) break;
      try {
        const preparada = await prepararReferencia(await baixarFotoDaFonte(fonte));
        referencias.push(preparada);
        resultado.referencias.push({ titulo: fonte.titulo, url: fonte.url, correspondencia: fonte.correspondencia || 'exata' });
        await writeFile(join(destino, `referencia-${referencias.length}.jpg`), preparada);
      } catch {
        // Fonte indisponivel nao interrompe a bateria.
      }
    }
    if (soBusca) return resultado;
    if (!referencias.length) {
      resultado.erro = 'Sem referência baixável: o sistema pediria uma foto ao usuário.';
      return resultado;
    }
    const paraModelo = await Promise.all(referencias.map((foto) => imagemParaModelo(foto)));
    const familia = resultado.referencias.every((ref) => ref.correspondencia === 'familia');
    const instrucao = montarInstrucao({
      modelo: nome,
      modo: 'referencia',
      observacoes: '',
      correcao: '',
      referenciaFamilia: familia,
      pesquisa: pesquisa.fontes
        .filter((fonte) => fonte.correspondencia !== 'familia')
        .map((fonte) => `${fonte.titulo}: ${fonte.resumo}`)
        .join('\n'),
    });
    const geracao = Date.now();
    const recortada = await gerarMiniaturaComIa(
      instrucao,
      paraModelo,
      1,
      'magenta',
      (bruta) => writeFile(join(destino, 'gerada-bruta.png'), bruta),
      montarInstrucaoCompacta({ modelo: nome, modo: 'referencia', fundoChave: 'magenta' }),
    );
    resultado.etapas.push(`geracao ${Math.round((Date.now() - geracao) / 1000)}s`);
    let pintura = await separarPinturaMiniatura(recortada);
    const verificacao = await verificarImagem(pintura.imagem, nome, paraModelo[0]);
    // Mesma regra da fila: com o farol a esquerda, espelha em vez de gastar outra geracao.
    if (verificacao.automatica && verificacao.direcao === 'esquerda') {
      const [imagem, mascara] = await Promise.all([pintura.imagem, pintura.mascara].map((b) => espelharMiniatura(b)));
      pintura = { ...pintura, imagem, mascara };
      verificacao.direcao = 'direita (espelhada)';
    }
    resultado.verificacao = verificacao;
    await writeFile(join(destino, 'final-neutra.png'), pintura.imagem);
    await writeFile(join(destino, 'mascara.png'), pintura.mascara);
    await writeFile(join(destino, 'pintada-vermelha.png'), await pintarPrevia(pintura.imagem, pintura.mascara, [220, 30, 42]));
    await writeFile(join(destino, 'pintada-azul.png'), await pintarPrevia(pintura.imagem, pintura.mascara, [30, 83, 193]));
    await writeFile(join(destino, 'comparacao.jpg'), await ladoALado(referencias[0], pintura.imagem));
  } catch (erro) {
    resultado.erro = erro instanceof Error ? `${erro.constructor.name}: ${erro.message}` : String(erro);
  } finally {
    resultado.segundos = Math.round((Date.now() - inicio) / 1000);
    await writeFile(join(destino, 'relatorio.json'), JSON.stringify(resultado, null, 2));
  }
  return resultado;
}

const resultados = [];
for (const item of lista) {
  const resultado = await testar(item);
  resultados.push(resultado);
  const v = resultado.verificacao;
  console.log(
    `${resultado.modelo} · fotos exatas ${resultado.fotosExatas} · família ${resultado.fotosFamilia} · refs usadas ${resultado.referencias.length}` +
      (v ? ` · direção ${v.direcao} · inteira ${v.inteira} · fidelidade ${v.fidelidade ?? '-'} (${v.pontuacaoFidelidade ?? '-'})` : '') +
      (resultado.erro ? ` · ERRO ${resultado.erro}` : ''),
  );
}
const linhas = resultados
  .map((r) => {
    const dir = pasta(r.modelo);
    const v = r.verificacao;
    return `<section><h2>${r.modelo}</h2><p>Fontes ${r.fontes} · fotos exatas ${r.fotosExatas} · família ${r.fotosFamilia} · ${r.segundos}s${r.erro ? ` · <b>${r.erro}</b>` : ''}</p>${
      v ? `<p>Direção ${v.direcao} · inteira ${v.inteira} · lateral ${v.vistaLateral ?? '-'} · fidelidade ${v.fidelidade ?? '-'} (${v.pontuacaoFidelidade ?? '-'})<br>${(v.problemas || []).join(' · ')}</p>` : ''
    }<div class="g">${['comparacao.jpg', 'pintada-vermelha.png', 'pintada-azul.png', 'gerada-bruta.png']
      .map((arquivo) => `<img src="${dir}/${arquivo}" onerror="this.remove()">`)
      .join('')}</div></section>`;
  })
  .join('');
await writeFile(
  join(saida, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Teste IA miniaturas</title><style>body{font:16px system-ui;margin:24px;background:#f4f6fa}section{background:#fff;padding:16px;margin:0 0 16px;border-radius:12px}.g{display:flex;gap:8px;flex-wrap:wrap}.g img{max-height:260px;background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0/16px 16px}</style><h1>Teste real da IA de miniaturas</h1>${linhas}`,
);
await writeFile(join(saida, 'resumo.json'), JSON.stringify(resultados, null, 2));
console.log(`\nConsultas Wikimedia: ${estatisticasWiki.ok} ok · ${estatisticasWiki.limitadas} limitadas (429) · ${estatisticasWiki.falhas} falhas`);
console.log(`Resultado salvo em ${saida} (abra index.html).`);
