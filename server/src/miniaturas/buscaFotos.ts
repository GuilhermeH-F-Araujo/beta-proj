import type { FontePesquisa } from './pesquisa.js';
import { normalizarModelo } from './identidade.js';
const licencas = new Set(['by', 'by-sa', 'cc0', 'pdm']);
const variantes = new Set([
  'adventure',
  'rallye',
  'rally',
  'sport',
  'titan',
  'fan',
  'spyder',
  'gsa',
  'abs',
  'sp',
  'lc',
  'special',
  'goan',
  'factory',
  'racing',
  'stealth',
  'urban',
  'touring',
]);
function palavras(valor: string): string[] {
  return (
    normalizarModelo(valor)
      .normalize('NFKC')
      .match(/[a-z]+|\d+/g) || []
  );
}
// familia=true aceita outra versao do mesmo modelo (ex.: Titan para uma Fan); o
// resultado entra so como referencia de silhueta, nunca como identidade exata.
export function aceitaReferenciaModelo(
  modelo: string,
  descricao: string,
  titulo = descricao,
  familia = false,
) {
  const solicitados = palavras(modelo);
  const identificacao = palavras(titulo);
  const encontrados = palavras(descricao);
  const sequencia = solicitados.some((parte) => /^\d+$/.test(parte));
  if (solicitados.length < 2) return false;
  if (
    !familia &&
    identificacao.some((parte) => variantes.has(parte) && !solicitados.includes(parte))
  )
    return false;
  // Codigos de modelo tem ordem: CG 150 nao equivale a uma legenda com CG 125 e outra moto 150.
  return sequencia
    ? encontrados.some((_, i) => solicitados.every((parte, j) => encontrados[i + j] === parte))
    : solicitados.every((parte) => encontrados.includes(parte));
}
// Codigos de modelo ("s1000", "cg160", "mt09"): letra(s) seguida(s) de numero, sem anos.
function codigosModelo(valor: string) {
  const partes = palavras(valor);
  const codigos = new Set<string>();
  partes.forEach((parte, i) => {
    const seguinte = partes[i + 1];
    if (/^[a-z]{1,4}$/.test(parte) && seguinte && /^\d{2,4}$/.test(seguinte) && !/^(?:19|20)\d{2}$/.test(seguinte))
      codigos.add(parte + seguinte);
  });
  return codigos;
}
// Uma foto da categoria certa ainda pode ser de outro modelo da marca ("BMW M1000R" na
// categoria da S 1000 RR). Se o arquivo cita codigos e nenhum e o pedido, fica de fora.
export function citaOutroModelo(modelo: string, titulo: string) {
  const pedidos = codigosModelo(modelo);
  const citados = codigosModelo(titulo);
  if (!pedidos.size || !citados.size) return false;
  return ![...citados].some((codigo) => pedidos.has(codigo));
}
export function tituloFotoDaMoto(titulo: string) {
  return !/\b(?:dash(?:board)?|instrument cluster|speedometer|tachometer|odometro|painel|detalhe|close[ -]?up|petrol.cap|fuel.cap|keyless|schematic|diagrama|logo)\b/i.test(
    normalizarModelo(titulo),
  );
}
export function licencaFotoAberta(licenca: string) {
  return /^(?:CC0(?:\s+1\.0)?|Public domain(?: mark)?|CC BY(?:-SA)? [234](?:\.\d)?(?: [a-z ]+)?)$/i.test(
    licenca.trim(),
  );
}
export function fonteOpenverse(item: unknown, modelo: string, familia = false): FontePesquisa | null {
  if (!item || typeof item !== 'object') return null;
  const foto = item as Record<string, unknown>;
  if (
    foto.mature ||
    !tituloFotoDaMoto(String(foto.title || '')) ||
    !licencas.has(String(foto.license)) ||
    !aceitaReferenciaModelo(modelo, String(foto.title || ''), undefined, familia)
  )
    return null;
  const url = String(foto.url || '');
  const origem = String(foto.foreign_landing_url || '');
  try {
    if (!urlImagemPermitida(url) || new URL(origem).protocol !== 'https:') return null;
  } catch {
    return null;
  }
  if (['by', 'by-sa'].includes(String(foto.license)) && !foto.creator) return null;
  return {
    titulo: String(foto.title).slice(0, 200),
    url: origem,
    resumo:
      'Fotografia aberta encontrada automaticamente; identidade sujeita a conferencia visual.',
    imagem: url,
    licenca: String(foto.license),
    autor: String(foto.creator || 'Dominio publico').slice(0, 160),
    licencaUrl: String(foto.license_url || '').startsWith('https://creativecommons.org/')
      ? String(foto.license_url)
      : '',
    correspondencia: familia ? 'familia' : 'exata',
    largura: Number(foto.width) || undefined,
    altura: Number(foto.height) || undefined,
  };
}
export function urlImagemPermitida(valor: string) {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    !url.port &&
    (['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(url.hostname) ||
      /^(live|farm\d+)\.staticflickr\.com$/.test(url.hostname))
  );
}
let retoma = 0;
export async function buscarFotosAbertas(
  modelo: string,
  consulta = modelo,
  familia = false,
): Promise<FontePesquisa[]> {
  if (retoma > Date.now()) return [];
  const parametros = new URLSearchParams({
    q: consulta,
    license: 'by,by-sa,cc0,pdm',
    page_size: '60',
    mature: 'false',
  });
  try {
    const response = await fetch(`https://api.openverse.org/v1/images/?${parametros}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'EstacaoMotosReference' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      retoma = Date.now() + (response.status === 429 ? 3600_000 : 60_000);
      return [];
    }
    const dados = (await response.json()) as { results?: unknown[] };
    return (dados.results || [])
      .map((item) => fonteOpenverse(item, modelo, familia))
      .filter((item): item is FontePesquisa => !!item)
      .slice(0, 8);
  } catch {
    return [];
  }
}
