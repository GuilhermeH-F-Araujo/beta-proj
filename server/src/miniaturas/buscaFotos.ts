import type { FontePesquisa } from './pesquisa.js';
import { normalizarModelo } from './identidade.js';
const licencas = new Set(['by', 'cc0', 'pdm']);
export function aceitaReferenciaModelo(modelo: string, descricao: string, titulo = descricao) {
  const tokens = (valor: string): string[] => normalizarModelo(valor).match(/[a-z]+|\d+/g) || [];
  const solicitados = tokens(modelo);
  const encontrados = new Set(tokens(descricao));
  if (solicitados.length < 2 || !solicitados.every((parte) => encontrados.has(parte))) return false;
  const variantes = ['adventure', 'rallye', 'sport', 'titan', 'fan', 'spyder', 'gsa'];
  const identificacao = new Set(tokens(titulo));
  return !variantes.some((parte) => identificacao.has(parte) && !solicitados.includes(parte));
}
export function fonteOpenverse(item: unknown, modelo: string): FontePesquisa | null {
  if (!item || typeof item !== 'object') return null;
  const foto = item as Record<string, unknown>;
  if (
    foto.mature ||
    !licencas.has(String(foto.license)) ||
    !aceitaReferenciaModelo(modelo, String(foto.title || ''))
  )
    return null;
  const url = String(foto.url || '');
  const origem = String(foto.foreign_landing_url || '');
  try {
    if (!urlImagemPermitida(url) || new URL(origem).protocol !== 'https:') return null;
  } catch {
    return null;
  }
  if (foto.license === 'by' && !foto.creator) return null;
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
    correspondencia: 'exata',
  };
}
export function urlImagemPermitida(valor: string) {
  const url = new URL(valor);
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
export async function buscarFotosAbertas(modelo: string): Promise<FontePesquisa[]> {
  if (retoma > Date.now()) return [];
  const parametros = new URLSearchParams({
    q: modelo,
    license: 'by,cc0,pdm',
    page_size: '12',
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
      .map((item) => fonteOpenverse(item, modelo))
      .filter((item): item is FontePesquisa => !!item)
      .slice(0, 4);
  } catch {
    return [];
  }
}
