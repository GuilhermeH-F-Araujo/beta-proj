/** Pesquisa textual de apoio. Um titulo semelhante nao prova que uma imagem esteja correta. */
export type PesquisaMotocicleta = {
  title: string;
  summary: string;
  url: string;
  matched: boolean;
  warning: string;
} | null;
export type SugestaoMotocicleta = { name: string; source: 'catalog' | 'wikipedia'; url?: string };
const artigos = new Set(['de', 'da', 'do', 'das', 'dos']);
const marcas = new Map(
  Object.entries({
    honda: 'Honda',
    yamaha: 'Yamaha',
    kawasaki: 'Kawasaki',
    suzuki: 'Suzuki',
    bmw: 'BMW',
    ducati: 'Ducati',
    triumph: 'Triumph',
    harley: 'Harley',
    royal: 'Royal',
    enfield: 'Enfield',
    ktm: 'KTM',
    bajaj: 'Bajaj',
    shineray: 'Shineray',
    haojue: 'Haojue',
    dafra: 'Dafra',
  }),
);
const codigos = new Set([
  'cg',
  'nxr',
  'crf',
  'trx',
  'xre',
  'gs',
  'cb',
  'cbr',
  'mt',
  'fz',
  'xt',
  'yz',
  'r',
  'z',
  'zx',
  'xr',
  'wr',
]);
export function formatarNomeModeloMoto(entrada: string) {
  return entrada
    .normalize('NFKC')
    .replace(/[\u0000-\u001f<>]/g, ' ')
    .replace(/[_]+/g, ' ')
    .replace(/\b(pop|biz|bros|fan|titan|cg|xre|nxr|cb)(?=\d)/gi, '$1 ')
    .replace(/\s*([/-])\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((palavra, indice) => {
      const minusculo = palavra.toLocaleLowerCase('pt-BR');
      if (marcas.has(minusculo)) return marcas.get(minusculo)!;
      if (codigos.has(minusculo)) return minusculo.toUpperCase();
      if (indice > 0 && artigos.has(minusculo)) return minusculo;
      if (/^[a-z]{1,4}[\s-]?\d/i.test(palavra)) return palavra.toUpperCase();
      return minusculo.replace(
        /(^|[-/])([a-zà-ÿ])/g,
        (_MesAtual, separador, letra) => separador + letra.toLocaleUpperCase('pt-BR'),
      );
    })
    .join(' ');
}
export function normalizado(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
const termos = (valor: string) => normalizado(valor).split(' ').filter(Boolean);
function limparTrecho(valor: string) {
  return valor
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:quot|#34);/g, '"')
    .replace(/&(?:amp|#38);/g, '&')
    .replace(/&(?:lt|gt|nbsp);/g, ' ')
    .replace(/\[\d+\]/g, ' ')
    .split(/(?:==\s*refer[eê]ncias\s*==|==\s*references\s*==)/i)[0]
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 330);
}
function generico(titulo: string) {
  return /^(?:lista de|list of|category|categoria|comparison of|anexo)/i.test(normalizado(titulo));
}
function tituloCorrespondencias(modelo: string, titulo: string) {
  if (generico(titulo)) return false;
  const textoPesquisado = termos(titulo);
  const solicitado = termos(modelo);
  return solicitado.length > 0 && solicitado.every((termo) => textoPesquisado.includes(termo));
}
function semelhanca(consulta: string, titulo: string) {
  const solicitado = termos(consulta);
  const candidato = termos(titulo);
  const correspondencias = solicitado.filter((token) => candidato.includes(token)).length;
  const distintivo = solicitado.filter((token) => !marcas.has(token));
  const solicitadoMarca = solicitado.find((token) => marcas.has(token));
  const candidatoMarcas = candidato.filter((token) => marcas.has(token));
  if (
    !correspondencias ||
    generico(titulo) ||
    !distintivo.length ||
    !distintivo.every((token) => candidato.includes(token)) ||
    (solicitadoMarca && candidatoMarcas.length > 0 && !candidatoMarcas.includes(solicitadoMarca))
  )
    return 0;
  return correspondencias / solicitado.length + (tituloCorrespondencias(consulta, titulo) ? 2 : 0);
}
function editarDistancia(primeiroElemento: string, segundoElemento: string) {
  if (Math.abs(primeiroElemento.length - segundoElemento.length) > 2) return 3;
  let linha = Array.from({ length: segundoElemento.length + 1 }, (_, indiceLocal) => indiceLocal);
  for (let indiceLocal = 1; indiceLocal <= primeiroElemento.length; indiceLocal++) {
    const continuar = [indiceLocal];
    for (let indiceSecundario = 1; indiceSecundario <= segundoElemento.length; indiceSecundario++)
      continuar[indiceSecundario] = Math.min(
        linha[indiceSecundario] + 1,
        continuar[indiceSecundario - 1] + 1,
        linha[indiceSecundario - 1] +
          Number(primeiroElemento[indiceLocal - 1] !== segundoElemento[indiceSecundario - 1]),
      );
    linha = continuar;
  }
  return linha[segundoElemento.length];
}
export function sugestoesCatalogo(consulta: string, modelos: string[]): SugestaoMotocicleta[] {
  const busca = termos(consulta);
  const solicitadoMarca = busca.find((token) => marcas.has(token));
  const familia = busca.filter((token) => !marcas.has(token));
  if (!familia.length) return [];
  return modelos
    .map((nome) => {
      const candidato = termos(nome);
      const candidatoMarcas = candidato.filter((token) => marcas.has(token));
      if (solicitadoMarca && candidatoMarcas.length && !candidatoMarcas.includes(solicitadoMarca))
        return { name: nome, score: 0 };
      if (
        !familia.every((token) =>
          candidato.some(
            (parte) =>
              parte === token ||
              (!/[0-9]/.test(token + parte) &&
                token.length >= 4 &&
                parte.length >= 4 &&
                editarDistancia(token, parte) <= 2),
          ),
        )
      )
        return { name: nome, score: 0 };
      const pontuacao = busca.reduce(
        (soma, token) =>
          soma +
          (candidato.some((parte) => parte === token)
            ? 3
            : candidato.some((parte) => parte.startsWith(token) || token.startsWith(parte))
              ? 2
              : candidato.some(
                    (parte) => !/[0-9]/.test(token + parte) && editarDistancia(token, parte) <= 2,
                  )
                ? 1
                : 0),
        0,
      );
      const numeros = busca.filter((token) => /\d/.test(token));
      return {
        name: nome,
        score: numeros.some((numero) => !candidato.includes(numero)) ? 0 : pontuacao,
      };
    })
    .filter((item) => item.score > 0)
    .sort(
      (primeiroElemento, segundoElemento) =>
        segundoElemento.score - primeiroElemento.score ||
        primeiroElemento.name.localeCompare(segundoElemento.name),
    )
    .slice(0, 5)
    .map(({ name: nome }) => ({ name: formatarNomeModeloMoto(nome), source: 'catalog' }));
}
type BuscaEncontrado = { title: string; snippet: string };
const memoria = new Map<string, { expires: number; result: BuscaEncontrado[] }>();
async function wikiBusca(idioma: 'pt' | 'en', consulta: string): Promise<BuscaEncontrado[]> {
  const chave = `${idioma}:${normalizado(consulta)}`;
  const emMemoria = memoria.get(chave);
  if (emMemoria && emMemoria.expires > Date.now()) return emMemoria.result;
  try {
    const parametros = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: consulta,
      srnamespace: '0',
      srlimit: '7',
      srprop: 'snippet',
      format: 'json',
      formatversion: '2',
    });
    const response = await fetch(`https://${idioma}.wikipedia.org/w/api.php?${parametros}`, {
      headers: { 'User-Agent': 'EstacaoMotosPreview/1.0 (model-research)' },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return [];
    const conteudoEnviado = (await response.json()) as {
      query?: { search?: BuscaEncontrado[] };
    };
    const resultado = conteudoEnviado.query?.search ?? [];
    if (memoria.size >= 200) memoria.delete(memoria.keys().next().value!);
    memoria.set(chave, { expires: Date.now() + 10 * 60_000, result: resultado });
    return resultado;
  } catch {
    return [];
  }
}
export async function verificarModeloMotocicleta(
  entrada: string,
  cadastrado: string[] = [],
): Promise<{
  formattedModel: string;
  research: PesquisaMotocicleta;
  suggestions: SugestaoMotocicleta[];
}> {
  const formatadoModelo = formatarNomeModeloMoto(entrada);
  const solicitado = termos(formatadoModelo);
  if (formatadoModelo.length < 3 || formatadoModelo.length > 100)
    return { formattedModel: formatadoModelo, research: null, suggestions: [] };
  const variantes =
    solicitado.length > 2 ? [solicitado.slice(0, 2).join(' '), solicitado.slice(-2).join(' ')] : [];
  const consultas = [...new Set([formatadoModelo, ...variantes].filter(Boolean))];
  const buscas = await Promise.all(
    consultas.flatMap((termoConsulta) =>
      ['pt', 'en'].map(async (idioma) => ({
        language: idioma,
        results: await wikiBusca(idioma as 'pt' | 'en', termoConsulta),
      })),
    ),
  );
  const ocorrencias = buscas
    .flatMap(({ language: idioma, results: resultados }) =>
      resultados.map((item) => ({
        ...item,
        language: idioma,
        score: semelhanca(formatadoModelo, item.title),
      })),
    )
    .filter((item) => item.score > 0)
    .sort((primeiroElemento, segundoElemento) => segundoElemento.score - primeiroElemento.score);
  const exato = ocorrencias.find((item) => tituloCorrespondencias(formatadoModelo, item.title));
  const pesquisa: PesquisaMotocicleta = exato
    ? {
        title: exato.title,
        summary: limparTrecho(exato.snippet),
        url: `https://${exato.language}.wikipedia.org/wiki/${encodeURIComponent(exato.title.replace(/ /g, '_'))}`,
        matched: true,
        warning: 'Título correspondente encontrado. Confira a variante e a aparência na prévia.',
      }
    : null;
  const sugestoes = sugestoesCatalogo(formatadoModelo, cadastrado);
  const encontrados = new Set(sugestoes.map((item) => normalizado(item.name)));
  for (const encontrado of ocorrencias) {
    if (sugestoes.length >= 7) break;
    const nome = formatarNomeModeloMoto(encontrado.title);
    if (encontrados.has(normalizado(nome)) || nome.length > 80) continue;
    sugestoes.push({
      name: nome,
      source: 'wikipedia',
      url: `https://${encontrado.language}.wikipedia.org/wiki/${encodeURIComponent(encontrado.title.replace(/ /g, '_'))}`,
    });
    encontrados.add(normalizado(nome));
  }
  return { formattedModel: formatadoModelo, research: pesquisa, suggestions: sugestoes };
}
export async function pesquisarMotocicleta(modelo: string): Promise<PesquisaMotocicleta> {
  return (await verificarModeloMotocicleta(modelo)).research;
}
