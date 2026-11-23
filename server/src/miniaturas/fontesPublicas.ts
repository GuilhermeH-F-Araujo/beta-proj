import { load } from 'cheerio';
import { normalizarModelo } from './identidade.js';
import type { FontePesquisa } from './pesquisa.js';

const dominios = new Set([
  'bikez.com',
  'www.motorcyclespecs.co.za',
  'www.honda.com.br',
  'saladeimprensa.honda.com.br',
  'hondanews.eu',
  'www.press.bmwgroup.com',
  'www.bmw-motorrad.com.br',
  'www.harley-davidson.com',
  'www.yamaha-motor.com.br',
  'stgmkpeus.blob.core.windows.net',
  'global.yamaha-motor.com',
  'www.triumphmotorcycles.com.br',
  'www.kawasaki.com.br',
  'www.ducati.com',
  'www.suzukimotos.com.br',
  'www.ktm.com',
  'www.royalenfield.com',
]);
const agente = 'EstacaoMotosReference';
const paginas = new Map<string, { expira: number; html: string }>();
const pendentes = new Map<string, Promise<string>>();
const robots = new Map<string, { expira: number; regras: string }>();
export function urlFontePermitida(valor: string) {
  const url = new URL(valor);
  if (
    url.protocol !== 'https:' ||
    url.port ||
    url.username ||
    url.password ||
    !dominios.has(url.hostname)
  )
    throw new Error('Use uma fonte especializada ou um fabricante autorizado.');
  url.hash = '';
  return url;
}
export function caminhoPermitidoRobots(conteudo: string, caminho: string) {
  const grupos: { agentes: string[]; regras: { caminho: string; permitir: boolean }[] }[] = [];
  let grupo = { agentes: [] as string[], regras: [] as { caminho: string; permitir: boolean }[] };
  for (const linha of conteudo.split(/\r?\n/)) {
    const correspondencia = /^\s*(user-agent|allow|disallow)\s*:\s*([^#]*)/i.exec(linha);
    if (!correspondencia) continue;
    const [, tipo, valorBruto] = correspondencia;
    const valor = valorBruto.trim();
    if (tipo.toLowerCase() === 'user-agent') {
      if (grupo.regras.length) {
        grupos.push(grupo);
        grupo = { agentes: [], regras: [] };
      }
      grupo.agentes.push(valor.toLowerCase());
    } else if (grupo.agentes.length && valor)
      grupo.regras.push({ caminho: valor, permitir: tipo.toLowerCase() === 'allow' });
  }
  grupos.push(grupo);
  const especificos = grupos.filter((item) => item.agentes.includes(agente.toLowerCase()));
  const ativos = especificos.length
    ? especificos
    : grupos.filter((item) => item.agentes.includes('*'));
  const regras = ativos
    .flatMap((item) => item.regras)
    .filter((regra) => {
      const padrao = regra.caminho
        .split('*')
        .map((parte) => parte.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*')
        .replace(/\\\$$/, '$');
      return new RegExp(`^${padrao}`).test(caminho);
    })
    .sort((a, b) => b.caminho.length - a.caminho.length || Number(b.permitir) - Number(a.permitir));
  return regras[0]?.permitir ?? true;
}
async function lerResposta(response: Response, limite: number) {
  if (!response.body) throw new Error('Fonte sem conteudo.');
  const partes: Uint8Array[] = [];
  let tamanho = 0;
  for await (const parte of response.body) {
    tamanho += parte.length;
    if (tamanho > limite) throw new Error('Fonte excede o tamanho permitido.');
    partes.push(parte);
  }
  return Buffer.concat(partes);
}
export async function consultarRobots(url: URL) {
  let registro = robots.get(url.origin);
  if (!registro || registro.expira < Date.now()) {
    const resposta = await fetch(`${url.origin}/robots.txt`, {
      headers: { 'User-Agent': agente },
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (!resposta.ok && resposta.status !== 404)
      throw new Error('Fonte temporariamente indisponivel.');
    registro = {
      expira: Date.now() + 3600_000,
      regras: resposta.status === 404 ? '' : (await lerResposta(resposta, 200_000)).toString(),
    };
    robots.set(url.origin, registro);
  }
  if (!caminhoPermitidoRobots(registro.regras, url.pathname + url.search))
    throw new Error('A fonte nao permite consulta automatica deste caminho.');
}
export async function consultarPaginaPublica(endereco: string) {
  const url = urlFontePermitida(endereco);
  const chave = url.href;
  const pronta = paginas.get(chave);
  if (pronta && pronta.expira > Date.now()) return pronta.html;
  if (pendentes.has(chave)) return pendentes.get(chave)!;
  const consulta = (async () => {
    await consultarRobots(url);
    const response = await fetch(url, {
      headers: { 'User-Agent': agente, Accept: 'text/html' },
      redirect: 'manual',
      signal: AbortSignal.timeout(12000),
    });
    // So seguimos uma canonicalizacao do proprio dominio, nunca um destino arbitrario.
    if ([301, 302, 307, 308].includes(response.status)) {
      const destino = urlFontePermitida(new URL(response.headers.get('location') || '', url).href);
      if (destino.origin !== url.origin || destino.href === url.href)
        throw new Error('Redirecionamento nao autorizado.');
      await consultarRobots(destino);
      const seguinte = await fetch(destino, {
        headers: { 'User-Agent': agente },
        redirect: 'error',
        signal: AbortSignal.timeout(12000),
      });
      if (!seguinte.ok) throw new Error('Fonte indisponivel.');
      return (await lerResposta(seguinte, 2_000_000)).toString();
    }
    if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html'))
      throw new Error('Fonte indisponivel.');
    return (await lerResposta(response, 2_000_000)).toString();
  })();
  pendentes.set(chave, consulta);
  try {
    const html = await consulta;
    if (paginas.size >= 48) paginas.delete(paginas.keys().next().value!);
    paginas.set(chave, { html, expira: Date.now() + 12 * 3600_000 });
    return html;
  } finally {
    pendentes.delete(chave);
  }
}
export function extrairLinks(html: string, base: string) {
  const $ = load(html);
  const links: { titulo: string; url: string; contexto: string }[] = [];
  $('a[href]').each((_i, elemento) => {
    const titulo = $(elemento).text().trim().replace(/\s+/g, ' ');
    if (!titulo || titulo.length > 180) return;
    try {
      const url = urlFontePermitida(new URL($(elemento).attr('href')!, base).href);
      if (url.origin !== new URL(base).origin) return;
      let contexto = '';
      let proximo = elemento.nextSibling;
      for (
        let i = 0;
        proximo && i < 6 && !$(proximo).is('a,br') && !$(proximo).find('a').length;
        i++, proximo = proximo.nextSibling
      )
        contexto += $(proximo).text();
      links.push({ titulo, url: url.href, contexto: contexto.replace(/\s+/g, ' ').slice(0, 120) });
    } catch {
      /* Links externos nao fazem parte deste indice. */
    }
  });
  return links;
}
function tokens(valor: string): string[] {
  return normalizarModelo(valor).match(/[a-z]+|\d+/g) || [];
}
export function mesmoModeloDoIndice(
  modelo: string,
  titulo: string,
  contexto: string,
  url: string,
  marca: string,
  anoModelo: number | null = null,
) {
  const ano = anoModelo ? [String(anoModelo)] : [];
  const solicitados = tokens(modelo).filter(
    (parte) => !tokens(marca).includes(parte) && !ano.includes(parte),
  );
  const encontrados = tokens(titulo).filter((parte) => !tokens(marca).includes(parte));
  return (
    solicitados.length > 0 &&
    solicitados.every((parte) => encontrados.includes(parte)) &&
    encontrados.every((parte) => solicitados.includes(parte)) &&
    ano.every((parte) => tokens(url + ' ' + contexto).includes(parte))
  );
}

export async function pesquisarCatalogos(
  modelo: string,
  anoModelo: number | null = null,
): Promise<FontePesquisa[]> {
  const normal = normalizarModelo(modelo);
  const bases = ['https://bikez.com/brands/index.php', 'https://www.motorcyclespecs.co.za/'];
  const respostas = await Promise.allSettled(
    bases.map(async (base) => extrairLinks(await consultarPaginaPublica(base), base)),
  );
  const indices = respostas.map((resposta) =>
    resposta.status === 'fulfilled' ? resposta.value : [],
  );
  const marcas = indices
    .flat()
    .filter((link) => /\/brand\/|\/bikes\//.test(link.url))
    .map((link) => normalizarModelo(link.titulo));
  const marca = marcas
    .filter((nome) => normal === nome || normal.startsWith(nome + ' '))
    .sort((a, b) => b.length - a.length)[0];
  if (!marca) return [];
  const procurados = tokens(normal.slice(marca.length)).filter(
    (parte) => parte !== String(anoModelo),
  );
  if (!procurados.length) return [];
  const fontes: FontePesquisa[] = [];
  const sugestoes: FontePesquisa[] = [];
  const prazo = Date.now() + 45_000;
  await Promise.allSettled([
    (async () => {
      const indice = indices[0];
      const link = indice.find((item) => normalizarModelo(item.titulo) === marca);
      if (!link) return;
      const html = await consultarPaginaPublica(link.url);
      const paginasMarca = [
        ...new Set([
          link.url,
          ...extrairLinks(html, link.url)
            .filter(
              (item) =>
                /^\d+$/.test(item.titulo) &&
                new URL(item.url).pathname === new URL(link.url).pathname,
            )
            .map((item) => item.url),
        ]),
      ].slice(0, 20);
      let quantidade = 0;
      for (const pagina of paginasMarca) {
        if (Date.now() > prazo) break;
        const links = extrairLinks(
          pagina === link.url ? html : await consultarPaginaPublica(pagina),
          pagina,
        );
        for (const item of links) {
          if (!item.url.includes('/motorcycles/')) continue;
          if (
            !mesmoModeloDoIndice(modelo, item.titulo, item.contexto, item.url, marca, anoModelo)
          ) {
            const parciais = new Set(tokens(item.titulo));
            if (
              sugestoes.length < 4 &&
              procurados.every((parte) => parciais.has(parte)) &&
              (anoModelo ? [String(anoModelo)] : []).every((parte) =>
                tokens(item.url + ' ' + item.contexto).includes(parte),
              )
            )
              sugestoes.push({
                titulo: item.titulo,
                url: item.url,
                resumo:
                  'Possivel variacao da familia. Nao confirma a versao solicitada; confira antes de usar.',
                correspondencia: 'familia',
              });
            continue;
          }
          fontes.push({
            titulo: item.titulo,
            url: item.url,
            resumo: `Catalogo Bikez: identificador ${item.titulo}. Confira ano, versao e mercado na fonte antes de aprovar.`,
          });
          quantidade++;
          if (quantidade >= 4) return;
        }
      }
    })(),
    (async () => {
      const indice = indices[1];
      const link = indice.find((item) => normalizarModelo(item.titulo) === marca);
      if (!link) return;
      const html = await consultarPaginaPublica(link.url);
      const paginasMarca = [
        ...new Set([
          link.url,
          ...extrairLinks(html, link.url)
            .filter((item) => /^\d+$/.test(item.titulo) && item.url.includes('/bikes/'))
            .map((item) => item.url),
        ]),
      ].slice(0, 20);
      for (const pagina of paginasMarca) {
        if (Date.now() > prazo) break;
        const links = extrairLinks(
          pagina === link.url ? html : await consultarPaginaPublica(pagina),
          pagina,
        );
        for (const item of links) {
          if (!item.url.includes('/model/')) continue;
          if (
            !mesmoModeloDoIndice(modelo, item.titulo, item.contexto, item.url, marca, anoModelo)
          ) {
            const parciais = new Set(tokens(item.titulo));
            if (
              sugestoes.length < 4 &&
              procurados.every((parte) => parciais.has(parte)) &&
              (anoModelo ? [String(anoModelo)] : []).every((parte) =>
                tokens(item.url + ' ' + item.contexto).includes(parte),
              )
            )
              sugestoes.push({
                titulo: item.titulo,
                url: item.url,
                resumo:
                  'Possivel variacao da familia. Nao confirma a versao solicitada; confira antes de usar.',
                correspondencia: 'familia',
              });
            continue;
          }
          fontes.push({
            titulo: `${marca.toUpperCase()} ${item.titulo}`,
            url: item.url,
            resumo: `Catalogo MotorcycleSpecs: ${marca.toUpperCase()} ${item.titulo}. Fonte de identificacao; nao confirma sozinha ano ou variante.`,
          });
          if (fontes.length >= 8) return;
        }
        if (fontes.filter((item) => item.url.includes('motorcyclespecs')).length >= 3) return;
      }
    })(),
  ]);
  return [
    ...new Map(
      [...fontes, ...(fontes.length ? [] : sugestoes)].map((fonte) => [fonte.url, fonte]),
    ).values(),
  ].slice(0, 8);
}

export async function importarFotoFabricante(endereco: string) {
  const pagina = urlFontePermitida(endereco);
  if (['bikez.com', 'www.motorcyclespecs.co.za'].includes(pagina.hostname))
    throw new Error(
      'Esse catalogo e usado somente para identificacao. Envie uma foto autorizada ou um link do fabricante.',
    );
  const $ = load(await consultarPaginaPublica(pagina.href));
  const candidatos = [
    $('meta[property="og:image"]').attr('content'),
    ...$('img')
      .toArray()
      .filter((img) => /moto|motorcycle|bike/i.test($(img).attr('alt') || ''))
      .map((img) => $(img).attr('src')),
  ].filter((valor): valor is string => !!valor);
  for (const candidato of candidatos.slice(0, 5)) {
    let imagem: URL;
    try {
      imagem = urlFontePermitida(new URL(candidato, pagina).href);
    } catch {
      continue;
    }
    if (/logo|favicon|icon|placeholder/i.test(imagem.pathname)) continue;
    await consultarRobots(imagem);
    const resposta = await fetch(imagem, {
      headers: { 'User-Agent': agente },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!resposta.ok || !/^image\/(jpeg|png|webp)/.test(resposta.headers.get('content-type') || ''))
      continue;
    return { bytes: await lerResposta(resposta, 10 * 1024 * 1024), url: pagina.href };
  }
  throw new Error(
    'Nao foi encontrada uma foto importavel neste link. Baixe a foto autorizada e envie pelo computador ou celular.',
  );
}
