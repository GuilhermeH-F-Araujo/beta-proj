import { pesquisarFabricantes, baixarFotoFabricante } from './fabricantes.js';
import {
  buscarFotosAbertas,
  aceitaReferenciaModelo,
  citaOutroModelo,
  licencaFotoAberta,
  tituloFotoDaMoto,
  urlImagemPermitida,
} from './buscaFotos.js';
import { pesquisarCatalogos } from './fontesPublicas.js';
import { pesquisarMotocicleta } from '../pesquisaModelo.js';
import type { RegistroProgressoMiniatura } from './progresso.js';
import { normalizarModelo } from './identidade.js';
import { limparNomeModelo, variacoesModelo } from './variacoesModelo.js';
export type FontePesquisa = {
  titulo: string;
  url: string;
  resumo: string;
  imagem?: string;
  imagemOriginal?: string;
  licenca?: string;
  autor?: string;
  licencaUrl?: string;
  correspondencia?: 'exata' | 'familia';
  // Usados so para escolher as melhores referencias (foto deitada e recente).
  largura?: number;
  altura?: number;
  anoFoto?: number;
};
export type Pesquisa = {
  consulta: string;
  progresso?: RegistroProgressoMiniatura[];
  fontes: FontePesquisa[];
  avisos: string[];
  feita_em: string;
  usadas?: FontePesquisa[];
  etapa?: 'pesquisando' | 'gerando' | 'conferindo' | 'concluida';
  semFoto?: boolean;
  identidadeNaoConfirmada?: boolean;
};
const memoria = new Map<string, { expira: number; pesquisa: Pesquisa }>();
function texto(valor: unknown) {
  return String(valor || '')
    .replace(/<[^>]*>/g, '')
    .slice(0, 1800);
}
export function correspondeModelo(modelo: string, descricao: string) {
  const tokens = normalizarModelo(modelo).match(/[a-z]+|\d+/g) || [];
  const encontrados = new Set(normalizarModelo(descricao).match(/[a-z]+|\d+/g) || []);
  return tokens.length > 1 && tokens.every((token) => encontrados.has(token));
}
export async function pesquisarReferencias(
  modelo: string,
  ano: number | null = null,
  renovar = false,
): Promise<Pesquisa> {
  ({ modelo, ano } = limparNomeModelo(modelo, ano));
  const chave = `${normalizarModelo(modelo)}:${ano || ''}`;
  const pronta = memoria.get(chave);
  if (!renovar && pronta && pronta.expira > Date.now()) return pronta.pesquisa;
  const pesquisa: Pesquisa = {
    consulta: modelo,
    fontes: [],
    avisos: [],
    feita_em: new Date().toISOString(),
  };
  const modeloBase = ano ? modelo.replace(new RegExp(`\\s+${ano}$`), '') : modelo;
  const consulta = ano ? `${modeloBase} ${ano}` : modeloBase;
  const [fabricantes, fotos, commons, wikidata] = await Promise.allSettled([
    pesquisarFabricantes(consulta, ano),
    buscarFotosAbertas(modeloBase),
    buscarCommons(modeloBase, ano),
    buscarWikidata(modeloBase, ano),
  ]);
  if (ano && fotos.status === 'fulfilled') {
    fotos.value = fotos.value.map((fonte) => ({ ...fonte, correspondencia: 'familia' }));
  }
  for (const resultado of [fabricantes, fotos, commons, wikidata]) {
    if (resultado.status === 'fulfilled') pesquisa.fontes.push(...resultado.value);
  }
  const ampliadas = await Promise.allSettled([
    buscarArtigosComFotos(modeloBase, ano),
    ...[`${modeloBase} side view`, `${modeloBase} motorcycle`, `${modeloBase} motocicleta`].map(q => buscarFotosAbertas(modeloBase, q).then(fontes => ano ? fontes.map(fonte => ({ ...fonte, correspondencia: 'familia' as const })) : fontes)),
    buscarCategoriasComFotos(modeloBase, ano),
    pesquisarCatalogos(consulta, ano),
    ...(ano ? [pesquisarCatalogos(modeloBase, null).then(fontes => fontes.map(fonte => ({ ...fonte, correspondencia: 'familia' as const })))] : []),
  ]);
  for (const resultado of ampliadas)
    if (resultado.status === 'fulfilled') pesquisa.fontes.push(...resultado.value);
  if (fotosExatas(pesquisa.fontes) < MINIMO_FOTOS_EXATAS)
    pesquisa.fontes.push(...(await ampliarComVariacoes(modeloBase, ano)));
  if (!pesquisa.fontes.some(fonte => fonte.correspondencia !== 'familia')) {
    const wiki = await pesquisarMotocicleta(modeloBase).catch(() => null);
    if (wiki?.matched)
      pesquisa.fontes.push({
        titulo: wiki.title,
        url: wiki.url,
        resumo: wiki.summary,
        correspondencia: ano ? 'familia' : 'exata',
      });
  }
  pesquisa.fontes.sort((a, b) => prioridadeFonte(b, ano) - prioridadeFonte(a, ano));
  const vistos = new Set<string>();
  pesquisa.fontes = pesquisa.fontes.filter((fonte) => {
    const chaveFonte = fonte.imagem || fonte.url;
    if (vistos.has(chaveFonte)) return false;
    vistos.add(chaveFonte);
    return true;
  });
  if (
    pesquisa.fontes.some((fonte) => fonte.imagem && fonte.correspondencia === 'familia') &&
    !pesquisa.fontes.some((fonte) => fonte.imagem && fonte.correspondencia !== 'familia')
  )
    pesquisa.avisos.push(
      'Foram encontradas fotos da família. O ano ou a edição exata ainda precisa de confirmação.',
    );
  if (!pesquisa.fontes.length)
    pesquisa.avisos.push(
      'Nenhuma referencia exata foi confirmada. Envie uma foto ou detalhe o modelo.',
    );
  pesquisa.avisos.push(
    'Fabricantes, fotos abertas e catalogos consultados. Origem e autoria registradas; fotos de referencia permanecem privadas.',
  );
  if (!pesquisa.fontes.some((fonte) => fonte.imagem))
    pesquisa.avisos.push(
      'Sem foto de comparacao disponivel. Uma fonte textual confirmada pode orientar a geracao, com revisao obrigatoria.',
    );
  if (memoria.size > 100) memoria.delete(memoria.keys().next().value!);
  memoria.set(chave, {
    expira: Date.now() + (pesquisa.fontes.some((fonte) => fonte.imagem) ? 3600_000 : 60_000),
    pesquisa,
  });
  return pesquisa;
}
const MINIMO_FOTOS_EXATAS = 3;
function fotosExatas(fontes: FontePesquisa[]) {
  return fontes.filter((fonte) => fonte.imagem && fonte.correspondencia !== 'familia').length;
}
// Segunda rodada: outras grafias do mesmo modelo (CG160, sem marca) e a familia
// (sem acabamento ou cilindrada). So roda quando a primeira achou poucas fotos.
async function ampliarComVariacoes(modelo: string, ano: number | null) {
  const variacoes = variacoesModelo(modelo).slice(0, 4);
  const buscas = variacoes.flatMap(({ consulta, familia }, indice) => [
    buscarCommons(consulta, familia ? null : ano, familia),
    buscarArtigosComFotos(consulta, familia ? null : ano, familia),
    buscarWikidata(consulta, familia ? null : ano, familia),
    // Openverse limita consultas anonimas; uma ou duas chamadas extras bastam.
    ...(indice < 2 ? [buscarFotosAbertas(consulta, `${consulta} motorcycle`, familia || !!ano)] : []),
  ]);
  const resultados = await Promise.allSettled(buscas);
  return resultados.flatMap((resultado) =>
    resultado.status === 'fulfilled' ? resultado.value : [],
  );
}
// Referencia boa = moto de lado, inteira e da geracao certa. A proporcao da foto denuncia
// closes de painel/carenagem (fotos em pe); a data separa a Tiger 900 atual da T400 dos anos 90.
export function prioridadeFonte(fonte: FontePesquisa, ano: number | null = null) {
  const titulo = fonte.titulo;
  let pontos =
    (fonte.correspondencia === 'familia' ? 0 : 10) +
    (fonte.imagem ? 4 : 0) +
    (/lateral|side view|side profile|perfil|seitenansicht|studio|estudio|\b(?:l|r)hs?\b|left|right/i.test(titulo) ? 3 : 0) -
    (/detail|detalhe|engine|motor\b|cockpit|dashboard|rear view|traseira|crash|accident|race|racing|track day|salon|show|expo|tuning|custom/i.test(titulo) ? 2 : 0);
  // Foto oficial do fabricante: estudio, moto de lado e geracao atual.
  if (/Referencia do fabricante/i.test(fonte.licenca || '')) pontos += 5;
  if (fonte.largura && fonte.altura) {
    const proporcao = fonte.largura / fonte.altura;
    pontos += proporcao >= 1.3 ? 3 : proporcao >= 1.1 ? 1 : -5;
  }
  if (fonte.anoFoto) {
    const atual = new Date().getFullYear();
    if (ano) pontos -= Math.min(6, Math.abs(fonte.anoFoto - ano) / 2);
    else if (fonte.anoFoto >= atual - 7) pontos += 2;
    else if (fonte.anoFoto < atual - 15) pontos -= 4;
  }
  return pontos;
}

type PaginaWiki = {
  title: string;
  images?: { title: string }[];
  fullurl?: string;
  extract?: string;
  pageimage?: string;
  imageinfo?: {
    url: string;
    thumburl?: string;
    descriptionurl: string;
    width?: number;
    height?: number;
    extmetadata?: Record<string, { value: string }>;
  }[];
};

async function paginasWiki(host: string, campos: Record<string, string>) {
  const dados = (await consultarApiWiki(host, { action: 'query', ...campos })) as {
    query?: { pages?: PaginaWiki[] | Record<string, PaginaWiki> };
  } | null;
  return Object.values(dados?.query?.pages || {});
}

// A politica da Wikimedia exige User-Agent identificavel e poucas requisicoes simultaneas;
// rajadas de dezenas de consultas sem identificacao recebem 403/429 e a busca volta vazia.
// WIKIMEDIA_CONTATO pode trazer um e-mail ou site da oficina, como pede a politica.
export const AGENTE_WIKIMEDIA = `EstacaoMotosMiniaturas/1.0 (${
  process.env.WIKIMEDIA_CONTATO || process.env.CLIENT_URL || 'sistema de oficina Estacao Motos'
}) node-fetch`;
const CONSULTAS_SIMULTANEAS_WIKI = 3;
let consultasWikiAtivas = 0;
const esperaWiki: (() => void)[] = [];
export const estatisticasWiki = { ok: 0, limitadas: 0, falhas: 0 };
async function comVagaWiki<T>(tarefa: () => Promise<T>) {
  if (consultasWikiAtivas >= CONSULTAS_SIMULTANEAS_WIKI)
    await new Promise<void>((liberar) => esperaWiki.push(liberar));
  consultasWikiAtivas++;
  try {
    return await tarefa();
  } finally {
    consultasWikiAtivas--;
    esperaWiki.shift()?.();
  }
}
async function consultarApiWiki(host: string, campos: Record<string, string>) {
  const parametros = new URLSearchParams({
    format: 'json',
    formatversion: '2',
    maxlag: '5',
    ...campos,
  });
  const endereco = `https://${host}/w/api.php?${parametros}`;
  const consultar = () =>
    comVagaWiki(() =>
      fetch(endereco, {
        signal: AbortSignal.timeout(12000),
        headers: { 'User-Agent': AGENTE_WIKIMEDIA, 'Api-User-Agent': AGENTE_WIKIMEDIA, Accept: 'application/json' },
        redirect: 'error',
      }),
    );
  let resposta = await consultar().catch(() => null);
  for (let tentativa = 0; tentativa < 2 && (!resposta || [429, 502, 503, 504].includes(resposta.status)); tentativa++) {
    if (resposta?.status === 429) estatisticasWiki.limitadas++;
    const espera = Number(resposta?.headers.get('retry-after')) || 0;
    if (espera > 5) break;
    if (resposta?.body) await resposta.body.cancel().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, espera ? espera * 1000 : 800 * (tentativa + 1)));
    resposta = await consultar().catch(() => null);
  }
  if (!resposta?.ok) {
    estatisticasWiki.falhas++;
    return null;
  }
  const dados = (await resposta.json().catch(() => null)) as { error?: { code?: string } } | null;
  if (dados?.error) {
    estatisticasWiki.falhas++;
    return null;
  }
  estatisticasWiki.ok++;
  return dados as unknown;
}

// Wikidata liga o nome do modelo a fotos curadas no Commons por tres caminhos:
// P18 (foto principal), P373 (categoria oficial do modelo) e P180 "retrata" nos dados
// estruturados de cada arquivo. Sao marcacoes humanas, entao a identidade e confiavel.
type EntidadeModelo = { id: string; rotulo: string; fotos: string[]; categoria?: string };
type Reivindicacao = { mainsnak?: { datavalue?: { value?: unknown } } }[];
async function entidadesWikidata(modelo: string, familia: boolean): Promise<EntidadeModelo[]> {
  const busca = (await consultarApiWiki('www.wikidata.org', {
    action: 'wbsearchentities',
    search: modelo,
    language: 'en',
    uselang: 'pt-br',
    type: 'item',
    limit: '8',
  })) as { search?: { id: string; label?: string; description?: string }[] } | null;
  const itens = (busca?.search || []).filter(
    (item) =>
      /motorcycle|motocicleta|motorbike|scooter|moto\b|motoneta|motorrad|motocyclette/i.test(item.description || '') &&
      aceitaReferenciaModelo(modelo, item.label || '', item.label || '', familia),
  );
  if (!itens.length) return [];
  const resposta = (await consultarApiWiki('www.wikidata.org', {
    action: 'wbgetentities',
    ids: itens.map((item) => item.id).join('|'),
    props: 'claims|labels',
    languages: 'en|pt',
  })) as {
    entities?: Record<string, { claims?: { P18?: Reivindicacao; P373?: Reivindicacao }; labels?: Record<string, { value: string }> }>;
  } | null;
  return Object.entries(resposta?.entities || {}).map(([id, entidade]) => ({
    id,
    rotulo: entidade.labels?.en?.value || entidade.labels?.pt?.value || modelo,
    fotos: (entidade.claims?.P18 || [])
      .map((claim) => claim.mainsnak?.datavalue?.value)
      .filter((nome): nome is string => typeof nome === 'string'),
    categoria: (entidade.claims?.P373 || [])
      .map((claim) => claim.mainsnak?.datavalue?.value)
      .find((nome): nome is string => typeof nome === 'string'),
  }));
}
async function buscarWikidata(modelo: string, ano: number | null, familia = false) {
  const entidades = (await entidadesWikidata(modelo, familia)).slice(0, 3);
  if (!entidades.length) return [];
  const comRotulo = (rotulo: string) => (pagina: PaginaWiki) =>
    fotoCommons(pagina, modelo, ano, rotulo, familia, true);
  const buscas = entidades.flatMap((entidade) => [
    entidade.fotos.length
      ? paginasWiki('commons.wikimedia.org', {
          titles: entidade.fotos.map((nome) => `File:${nome}`).join('|'),
          ...metadadosFoto,
        }).then((paginas) => paginas.flatMap(comRotulo(entidade.rotulo)))
      : Promise.resolve([]),
    // Arquivos marcados no Commons como "retrata" este modelo.
    paginasWiki('commons.wikimedia.org', {
      generator: 'search',
      gsrsearch: `haswbstatement:P180=${entidade.id}`,
      gsrnamespace: '6',
      gsrlimit: '40',
      ...metadadosFoto,
    }).then((paginas) => paginas.flatMap(comRotulo(entidade.rotulo))),
    entidade.categoria
      ? arquivosDaCategoria(`Category:${entidade.categoria}`, modelo, ano, familia, true)
      : Promise.resolve([]),
  ]);
  const resultados = await Promise.allSettled(buscas);
  return resultados.flatMap((resultado) => (resultado.status === 'fulfilled' ? resultado.value : []));
}
// Arquivos de uma categoria e de ate 4 subcategorias (por cor, ano, evento) com o mesmo modelo.
async function arquivosDaCategoria(
  categoria: string,
  modelo: string,
  ano: number | null,
  familia: boolean,
  categoriaConfirmada: boolean,
): Promise<FontePesquisa[]> {
  const subcategorias = (
    await paginasWiki('commons.wikimedia.org', {
      generator: 'categorymembers',
      gcmtitle: categoria,
      gcmtype: 'subcat',
      gcmlimit: '20',
    })
  )
    .map((pagina) => pagina.title)
    .filter((titulo) => aceitaReferenciaModelo(modelo, titulo, titulo, true))
    .filter((titulo) => !/\b(?:details?|engines?|dashboards?|interiors?|racing|race|crash)/i.test(titulo))
    .slice(0, 4);
  const resultados = await Promise.allSettled(
    [categoria, ...subcategorias].map(async (titulo, indice) => {
      const arquivos = await paginasWiki('commons.wikimedia.org', {
        generator: 'categorymembers',
        gcmtitle: titulo,
        gcmtype: 'file',
        gcmnamespace: '6',
        gcmlimit: indice === 0 ? '40' : '20',
        ...metadadosFoto,
      });
      return arquivos.flatMap((arquivo) =>
        fotoCommons(arquivo, modelo, ano, titulo, familia, categoriaConfirmada),
      );
    }),
  );
  return resultados.flatMap((resultado) => (resultado.status === 'fulfilled' ? resultado.value : []));
}

function fotoCommons(
  pagina: PaginaWiki,
  modelo: string,
  ano: number | null,
  contexto?: string,
  familia = false,
  // Foto principal de um artigo (ou P18 do Wikidata) cujo titulo ja confirmou o modelo:
  // a curadoria da Wikipedia vale mais que o nome do arquivo ("EX400 verde.jpg").
  contextoConfirmado = false,
): FontePesquisa[] {
  const info = pagina.imageinfo?.[0];
  if (!info || !/^File:/i.test(pagina.title)) return [];
  const titulo = pagina.title.replace(/^File:/i, '').replaceAll('_', ' ');
  if (!tituloFotoDaMoto(titulo) || citaOutroModelo(modelo, titulo)) return [];
  const descricao = `${titulo} ${texto(info.extmetadata?.ImageDescription?.value)}`;
  const licenca = texto(info.extmetadata?.LicenseShortName?.value);
  const autor = texto(info.extmetadata?.Artist?.value);
  if (!licencaFotoAberta(licenca) || (/^CC BY/i.test(licenca) && !autor)) return [];
  const mesmaIdentidade =
    contextoConfirmado ||
    aceitaReferenciaModelo(modelo, descricao, titulo, familia) ||
    (contexto &&
      aceitaReferenciaModelo(modelo, contexto, titulo, familia) &&
      aceitaReferenciaModelo(modelo, `${modelo.split(/\s+/)[0]} ${descricao}`, titulo, familia));
  if (!mesmaIdentidade) return [];
  const imagem = [info.thumburl, info.url].find((valor) => valor && urlImagemPermitida(valor));
  if (!imagem) return [];
  // Ano da fotografia ou do upload nao comprova ano-modelo.
  const anoDeclarado =
    ano &&
    (new RegExp(
      `(?:\\b${ano}\\b.{0,18}\\b(?:model year|modelo|edition|edicao)\\b|\\b(?:model year|ano.modelo|modelo)\\b.{0,18}\\b${ano}\\b)`,
      'i',
    ).test(normalizarModelo(descricao)) ||
      descricao.split(/[.!?;\n]/).some((trecho) => {
        const rotulo = trecho.match(new RegExp(`^(.+?)\\s*\\(${ano}\\)`, 'i'));
        return !!rotulo && aceitaReferenciaModelo(modelo, rotulo[1], titulo);
      }));
  return [
    {
      titulo,
      resumo: descricao,
      url: `https://commons.wikimedia.org/wiki/${encodeURIComponent(pagina.title.replaceAll(' ', '_'))}`,
      imagem,
      imagemOriginal: info.url !== imagem && urlImagemPermitida(info.url) ? info.url : undefined,
      licenca,
      autor: autor || 'Dominio publico',
      licencaUrl: String(info.extmetadata?.LicenseUrl?.value || ''),
      correspondencia: familia || (ano && !anoDeclarado) ? 'familia' : 'exata',
      largura: info.width,
      altura: info.height,
      anoFoto: anoDaFoto(titulo, texto(info.extmetadata?.DateTimeOriginal?.value)),
    },
  ];
}
// O ano escrito no nome do arquivo costuma ser o do modelo; senao, vale a data da foto.
function anoDaFoto(titulo: string, dataOriginal: string) {
  const limite = new Date().getFullYear() + 1;
  const valido = (valor?: string) => {
    const numero = Number(valor);
    return numero >= 1950 && numero <= limite ? numero : undefined;
  };
  return valido(titulo.match(/\b(19[5-9]\d|20\d{2})\b/)?.[1]) ?? valido(dataOriginal.match(/\b(19[5-9]\d|20\d{2})\b/)?.[1]);
}

const metadadosFoto = {
  prop: 'imageinfo',
  iiprop: 'url|extmetadata|size',
  iiurlwidth: '960',
  iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|ImageDescription|DateTimeOriginal',
};

async function buscarCommons(modelo: string, ano: number | null, familia = false) {
  const consultas = ano
    ? [`${modelo} ${ano} motorcycle`, `${modelo} motorcycle`]
    : [`${modelo} motorcycle`, modelo];
  if (!familia) consultas.push(`${modelo} side view`, `${modelo} motorcycle right side`, `${modelo} motocicleta perfil lateral`, `${modelo.replace(/([a-z]) (\d)/gi, '$1$2')} motorcycle`);
  if (ano && !familia) consultas.push(`${modelo} ${ano} side profile`, `${modelo} ${ano} motocicleta`);
  const tentativas = consultas.map((gsrsearch) =>
    paginasWiki('commons.wikimedia.org', {
      generator: 'search',
      gsrsearch,
      gsrnamespace: '6',
      gsrlimit: '24',
      ...metadadosFoto,
    }),
  );
  tentativas.push(
    paginasWiki('commons.wikimedia.org', {
      titles: [`File:${modelo}.jpg`, `File:${modelo.replace(/([a-z]) (\d)/gi, '$1$2')}.jpg`].join(
        '|',
      ),
      redirects: '1',
      ...metadadosFoto,
    }),
  );
  const resultados = await Promise.allSettled(tentativas);
  return resultados
    .flatMap((resultado) =>
      resultado.status === 'fulfilled'
        ? resultado.value.flatMap((pagina) => fotoCommons(pagina, modelo, ano, undefined, familia))
        : [],
    )
    .sort((a, b) => prioridadeFonte(b, ano) - prioridadeFonte(a, ano))
    .slice(0, 24);
}

async function buscarCategoriasComFotos(modelo: string, ano: number | null) {
  const nomes = [...new Set([modelo, modelo.replace(/([a-z]) (\d)/gi, '$1$2')])];
  const tentativas = await Promise.allSettled([
    paginasWiki('commons.wikimedia.org', {
      generator: 'search',
      gsrsearch: modelo,
      gsrnamespace: '14',
      gsrlimit: '8',
    }),
    paginasWiki('commons.wikimedia.org', {
      titles: nomes.map((nome) => `Category:${nome}`).join('|'),
      redirects: '1',
    }),
  ]);
  const categorias = [
    ...new Set(
      tentativas.flatMap((resultado) =>
        resultado.status === 'fulfilled' ? resultado.value.map((categoria) => categoria.title) : [],
      ),
    ),
  ]
    .filter((titulo) => /^Category:/i.test(titulo) && aceitaReferenciaModelo(modelo, titulo))
    .slice(0, 3);
  // Categoria com o nome exato do modelo (ex.: "Category:BMW R 1250 GS") e curadoria
  // humana: seus arquivos e subcategorias valem como identidade, mesmo com nomes genericos.
  const resultados = await Promise.allSettled(
    categorias.map((titulo) =>
      arquivosDaCategoria(titulo, modelo, ano, false, categoriaDoModelo(modelo, titulo)),
    ),
  );
  return resultados.flatMap((resultado) =>
    resultado.status === 'fulfilled' ? resultado.value : [],
  );
}
function categoriaDoModelo(modelo: string, categoria: string) {
  const nome = (valor: string) => normalizarModelo(valor).replace(/[^a-z0-9]/g, '');
  return nome(categoria.replace(/^Category:/i, '')) === nome(modelo);
}

async function buscarArtigosComFotos(modelo: string, ano: number | null, familia = false) {
  // Portugues e ingles primeiro; os outros idiomas so quando nenhum artigo trouxe foto.
  const principais = await artigosNosIdiomas(['pt', 'en'], modelo, ano, familia);
  if (familia || principais.some((fonte) => fonte.imagem)) return principais;
  return [...principais, ...(await artigosNosIdiomas(['es', 'de', 'fr', 'it', 'ja', 'id'], modelo, ano, familia))];
}
async function artigosNosIdiomas(idiomas: string[], modelo: string, ano: number | null, familia: boolean) {
  const resultados = await Promise.allSettled(
    idiomas.map(async (idioma) => {
      const host = `${idioma}.wikipedia.org`;
      const artigos = (
        await paginasWiki(host, {
          generator: 'search',
          gsrsearch: modelo,
          gsrnamespace: '0',
          gsrlimit: '6',
          prop: 'extracts|pageimages',
          exintro: '1',
          explaintext: '1',
          exchars: '450',
          pilicense: 'free',
          piprop: 'name',
        })
      ).filter((artigo) => aceitaReferenciaModelo(modelo, artigo.title, artigo.title, familia));
      const arquivos = artigos.filter((artigo) => artigo.pageimage);
      const fotos = arquivos.length
        ? await paginasWiki('commons.wikimedia.org', {
            titles: arquivos.map((artigo) => `File:${artigo.pageimage}`).join('|'),
            ...metadadosFoto,
          }).catch(() => [])
        : [];
      const galeria = await fotosDoArtigo(host, artigos[0]?.title, modelo, ano, familia);
      return [...galeria, ...artigos.flatMap((artigo): FontePesquisa[] => {
        const nome = `File:${artigo.pageimage}`.replaceAll('_', ' ');
        const arquivo = fotos.find((foto) => foto.title.replaceAll('_', ' ') === nome);
        const imagens = arquivo ? fotoCommons(arquivo, modelo, ano, artigo.title, familia, true) : [];
        return imagens.length
          ? imagens
          : [
              {
                titulo: artigo.title,
                url: `https://${host}/wiki/${encodeURIComponent(artigo.title.replaceAll(' ', '_'))}`,
                resumo: texto(artigo.extract),
                correspondencia: familia || ano ? 'familia' : 'exata',
              },
            ];
      })];
    }),
  );
  return resultados.flatMap((resultado) =>
    resultado.status === 'fulfilled' ? resultado.value : [],
  );
}
// Alem da foto principal, o artigo do modelo costuma trazer uma galeria por geracao/cor.
// Cada arquivo ainda precisa citar o modelo (ou a marca + descricao) para entrar.
async function fotosDoArtigo(
  host: string,
  artigo: string | undefined,
  modelo: string,
  ano: number | null,
  familia: boolean,
) {
  if (!artigo || !/^(?:pt|en)\./.test(host)) return [];
  const [pagina] = await paginasWiki(host, { titles: artigo, prop: 'images', imlimit: '30' });
  const arquivos = (pagina?.images || [])
    .map((imagem) => imagem.title.replace(/^[^:]+:/, 'File:'))
    .filter((titulo) => /\.(?:jpe?g|png|webp)$/i.test(titulo))
    .slice(0, 25);
  if (!arquivos.length) return [];
  const paginas = await paginasWiki('commons.wikimedia.org', {
    titles: arquivos.join('|'),
    ...metadadosFoto,
  });
  return paginas.flatMap((foto) => fotoCommons(foto, modelo, ano, artigo, familia));
}
export async function baixarFotoDaFonte(fonte: Pick<FontePesquisa, 'imagem' | 'imagemOriginal'>) {
  if (!fonte.imagem) throw new Error('Fonte sem fotografia.');
  try {
    return await baixarReferenciaPublica(fonte.imagem);
  } catch (erro) {
    if (!fonte.imagemOriginal || fonte.imagemOriginal === fonte.imagem) throw erro;
    return baixarReferenciaPublica(fonte.imagemOriginal);
  }
}

export async function baixarReferenciaPublica(url: string) {
  if (!urlImagemPermitida(url)) {
    try {
      return await baixarFotoFabricante(url);
    } catch {
      throw new Error('Origem da referencia nao autorizada ou indisponivel.');
    }
  }
  const endereco = new URL(url);
  if (!urlImagemPermitida(url)) throw new Error('Origem da referencia nao autorizada.');
  const response = await fetch(endereco, {
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
    // upload.wikimedia.org recusa downloads sem User-Agent identificavel.
    headers: { 'User-Agent': AGENTE_WIKIMEDIA, Accept: 'image/jpeg,image/png,image/webp' },
  });
  if (!response.ok || !/^image\/(jpeg|png|webp)/.test(response.headers.get('content-type') || ''))
    throw new Error('Referencia indisponivel.');
  const partes: Uint8Array[] = [];
  let tamanho = 0;
  for await (const parte of response.body!) {
    tamanho += parte.length;
    if (tamanho > 10 * 1024 * 1024) throw new Error('Referencia excede 10 MB.');
    partes.push(parte);
  }
  return Buffer.concat(partes);
}
