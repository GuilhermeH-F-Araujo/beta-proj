import { load } from 'cheerio';
import { consultarPaginaPublica, consultarRobots, urlFontePermitida } from './fontesPublicas.js';
import { normalizarModelo } from './identidade.js';
import type { FontePesquisa } from './pesquisa.js';

// Indices de marcas, nunca uma lista fixa de modelos. Os modelos sao descobertos no site.
const indices: Record<string, string[]> = {
  honda: [
    'https://www.honda.com.br/motos/modelos',
    'https://saladeimprensa.honda.com.br/motocicletas',
  ],
  yamaha: ['https://www.yamaha-motor.com.br/'],
  bmw: ['https://www.bmw-motorrad.com.br/pt/models.html'],
  kawasaki: ['https://www.kawasaki.com.br'],
  suzuki: ['https://www.suzukimotos.com.br'],
  triumph: [
    'https://www.triumphmotorcycles.com.br',
    'https://www.triumphmotorcycles.com/motorcycles',
  ],
  ducati: ['https://www.ducati.com/br/pt/motos'],
  ktm: ['https://www.ktm.com/pt-br.html'],
  'royal enfield': ['https://www.royalenfield.com/br/pt/motorcycles/'],
  'harley davidson': ['https://www.harley-davidson.com/br/pt/motorcycles.html'],
};
function decodificarEndereco(valor: string) {
  try {
    return decodeURIComponent(valor);
  } catch {
    return valor;
  }
}
const palavras = (texto: string) => normalizarModelo(texto).match(/[a-z]+|\d+/g) || [];
export function correspondeFabricante(
  modelo: string,
  descricao: string,
  marca: string,
  ano: number | null,
) {
  const ignorar = new Set([...palavras(marca), ...(ano ? [String(ano)] : [])]);
  const procurados = palavras(modelo).filter((parte) => !ignorar.has(parte));
  const encontrados = new Set(palavras(descricao));
  const anos: string[] = descricao.match(/\b(?:19|20)\d{2}\b/g) || [];
  return (
    procurados.length > 0 &&
    procurados.every((parte) => encontrados.has(parte)) &&
    (!ano || anos.includes(String(ano)))
  );
}
export function extrairReferenciaFabricante(
  html: string,
  pagina: string,
  modelo: string,
  marca: string,
  ano: number | null,
): FontePesquisa | null {
  return extrairReferenciasFabricante(html, pagina, modelo, marca, ano)[0] ?? null;
}
// Uma pagina de produto costuma ter varias fotos uteis (cores, lado, og:image). Ate 3
// viram referencias separadas, para o modelo ter mais de um angulo do fabricante.
const FOTOS_POR_PAGINA = 3;
export function extrairReferenciasFabricante(
  html: string,
  pagina: string,
  modelo: string,
  marca: string,
  ano: number | null,
): FontePesquisa[] {
  const $ = load(html);
  const titulo = $('title').text().trim() || $('h1').first().text().trim();
  if (!correspondeFabricante(modelo, titulo, marca, ano)) return [];
  const fotos: { imagem: string; pontos: number }[] = [];
  $('main img, article img, .main-container img, picture img').each((_i, elemento) => {
    const img = $(elemento);
    if (img.parents('nav, header, footer').length) return;
    const origem = img.attr('src') || img.attr('data-src');
    if (!origem) return;
    const descricao = `${img.attr('alt') || ''} ${decodificarEndereco(origem).replace(/[_/-]/g, ' ')}`;
    if (/logo|favicon|icon|\/styles\/product_112|placeholder|condicao/i.test(origem)) return;
    // Nome do arquivo e alt precisam apontar ao produto, nao a um banner generico.
    if (!correspondeFabricante(modelo, descricao, marca, null)) return;
    try {
      const imagem = urlFontePermitida(new URL(origem, pagina).href).href;
      const pontos =
        (/lateral|side|perfil/i.test(descricao) ? 8 : 0) +
        (/home|modelo|moto|motorcycle/i.test(descricao) ? 3 : 0) -
        (/banner|detalhe|motor |punho|freio|usb|feature/i.test(descricao) ? 5 : 0);
      fotos.push({ imagem, pontos });
    } catch {
      /* CDNs nao cadastradas nao sao acessadas. */
    }
  });
  // A imagem de compartilhamento da pagina e quase sempre a foto principal do produto.
  const destaque = $('meta[property="og:image"]').attr('content');
  if (destaque && !/logo|favicon|icon|placeholder/i.test(destaque)) {
    try {
      fotos.push({ imagem: urlFontePermitida(new URL(destaque, pagina).href).href, pontos: 4 });
    } catch {
      /* CDN fora da lista autorizada. */
    }
  }
  const melhores = [...new Map(fotos.sort((a, b) => b.pontos - a.pontos).map((f) => [f.imagem, f])).values()]
    .slice(0, FOTOS_POR_PAGINA);
  const resumo =
    $('meta[name="description"]').attr('content') || $('main h1').first().text() || titulo;
  const base = {
    titulo,
    url: pagina,
    resumo: `${titulo}. ${resumo.slice(0, 400)}`,
    autor: marca,
    licenca: 'Referencia do fabricante; direitos reservados. Original nao redistribuido.',
    correspondencia: 'exata' as const,
  };
  return melhores.length ? melhores.map((foto) => ({ ...base, imagem: foto.imagem })) : [base];
}
export async function pesquisarFabricantes(
  modelo: string,
  ano: number | null,
): Promise<FontePesquisa[]> {
  const modeloBusca = ano ? modelo.replace(new RegExp(`\\b${ano}\\b`, 'g'), '').trim() : modelo;
  const nome = normalizarModelo(modelo).replace(/-/g, ' ');
  const marca = Object.keys(indices).find((marca) => nome.startsWith(marca + ' '));
  if (!marca) return [];
  const fontes: FontePesquisa[] = [];
  for (const base of indices[marca]) {
    try {
      const html = await consultarPaginaPublica(base);
      const $ = load(html);
      const links = new Map<string, number>();
      const procurados = new Set([...palavras(modeloBusca), ...palavras(marca)]);
      $('a[href]').each((_i, elemento) => {
        const href = $(elemento).attr('href')!;
        const descricao = `${$(elemento).text()} ${decodificarEndereco(href).replace(/[-_/]/g, ' ')}`;
        if (!correspondeFabricante(modeloBusca, descricao, marca, null)) return;
        try {
          const url = urlFontePermitida(new URL(href, base).href);
          if (url.origin === new URL(base).origin) {
            const texto = $(elemento).text().trim();
            const excedentes = texto
              ? palavras(texto).filter((parte) => !procurados.has(parte)).length
              : 30;
            const chave = url.href.split('#')[0];
            links.set(chave, Math.min(excedentes, links.get(chave) ?? Infinity));
          }
        } catch {
          /* Fora do indice. */
        }
      });
      // No maximo duas paginas; a fila de 100 modelos reutiliza o cache do indice.
      for (const [link] of [...links].sort((a, b) => a[1] - b[1]).slice(0, 2)) {
        const pagina = await consultarPaginaPublica(link).catch(() => null);
        if (!pagina) continue;
        const encontradas = extrairReferenciasFabricante(pagina, link, modelo, marca, ano);
        if (encontradas.some((fonte) => fonte.imagem)) return encontradas;
        fontes.push(...encontradas);
      }
    } catch {
      /* As outras fontes continuam independentes. */
    }
  }
  return fontes.slice(0, 2);
}
export async function baixarFotoFabricante(endereco: string) {
  const url = urlFontePermitida(endereco);
  // Esse CDN publica objetos, sem um site ou indice robots consultavel.
  if (url.hostname !== 'stgmkpeus.blob.core.windows.net') await consultarRobots(url);
  const resposta = await fetch(url, {
    headers: { 'User-Agent': 'EstacaoMotosReference' },
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!resposta.ok || !/^image\/(jpeg|png|webp)/.test(resposta.headers.get('content-type') || ''))
    throw new Error('Foto do fabricante indisponivel.');
  if (!resposta.body) throw new Error('Foto vazia.');
  const partes: Uint8Array[] = [];
  let tamanho = 0;
  for await (const parte of resposta.body) {
    tamanho += parte.length;
    if (tamanho > 10 * 1024 * 1024) throw new Error('Foto excede 10 MB.');
    partes.push(parte);
  }
  return Buffer.concat(partes);
}
