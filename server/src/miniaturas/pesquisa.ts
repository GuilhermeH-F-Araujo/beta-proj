import { pesquisarFabricantes, baixarFotoFabricante } from './fabricantes.js';
import { buscarFotosAbertas, aceitaReferenciaModelo, urlImagemPermitida } from './buscaFotos.js';
import { pesquisarCatalogos } from './fontesPublicas.js';
import { pesquisarMotocicleta } from '../pesquisaModelo.js';
import { normalizarModelo } from './identidade.js';
export type FontePesquisa = {
  titulo: string;
  url: string;
  resumo: string;
  imagem?: string;
  licenca?: string;
  autor?: string;
  licencaUrl?: string;
  correspondencia?: 'exata' | 'familia';
};
export type Pesquisa = {
  consulta: string;
  fontes: FontePesquisa[];
  avisos: string[];
  feita_em: string;
  usadas?: FontePesquisa[];
  etapa?: 'pesquisando' | 'gerando' | 'conferindo' | 'concluida';
  semFoto?: boolean;
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
): Promise<Pesquisa> {
  const chave = `${normalizarModelo(modelo)}:${ano || ''}`;
  const pronta = memoria.get(chave);
  if (pronta && pronta.expira > Date.now()) return pronta.pesquisa;
  const pesquisa: Pesquisa = {
    consulta: modelo,
    fontes: [],
    avisos: [],
    feita_em: new Date().toISOString(),
  };
  const [fabricantes, fotos, commons] = await Promise.allSettled([
    pesquisarFabricantes(modelo, ano),
    buscarFotosAbertas(modelo),
    buscarCommons(modelo),
  ]);
  if (fabricantes.status === 'fulfilled') pesquisa.fontes.push(...fabricantes.value);
  if (fotos.status === 'fulfilled') pesquisa.fontes.push(...fotos.value);
  if (commons.status === 'fulfilled') pesquisa.fontes.push(...commons.value);

  if (!pesquisa.fontes.some((fonte) => fonte.imagem))
    pesquisa.fontes.push(...(await pesquisarCatalogos(modelo, ano).catch(() => [])));
  if (!pesquisa.fontes.length) {
    const wiki = await pesquisarMotocicleta(modelo).catch(() => null);
    if (wiki?.matched)
      pesquisa.fontes.push({ titulo: wiki.title, url: wiki.url, resumo: wiki.summary });
  }
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
async function buscarCommons(modelo: string): Promise<FontePesquisa[]> {
  const parametros = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: `${modelo} motorcycle`,
    gsrnamespace: '6',
    gsrlimit: '16',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: '1600',
    format: 'json',
  });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${parametros}`, {
    signal: AbortSignal.timeout(12_000),
    headers: { 'User-Agent': 'EstacaoMotos/ReferenceResearch' },
  });
  if (!response.ok) return [];
  const dados = (await response.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          title: string;
          imageinfo?: {
            url: string;
            thumburl?: string;
            descriptionurl: string;
            extmetadata?: Record<string, { value: string }>;
          }[];
        }
      >;
    };
  };
  return Object.values(dados.query?.pages || {})
    .flatMap((pagina) => {
      const info = pagina.imageinfo?.[0];
      if (!info) return [];
      const descricao = `${pagina.title} ${texto(info.extmetadata?.ImageDescription?.value)}`;
      const licenca = texto(info.extmetadata?.LicenseShortName?.value);
      // Usamos fontes abertas com autoria e creditos preservados.
      if (
        !/^(CC0|Public domain|CC BY [234])/i.test(licenca) ||
        !aceitaReferenciaModelo(modelo, descricao, pagina.title)
      )
        return [];
      const url = info.thumburl || info.url;
      if (!urlImagemPermitida(url)) return [];
      return [
        {
          titulo: pagina.title.replace(/^File:/, ''),
          resumo: descricao,
          url: info.descriptionurl,
          imagem: url,
          licenca,
          autor: texto(info.extmetadata?.Artist?.value) || 'Autor indicado na fonte',
          licencaUrl: String(info.extmetadata?.LicenseUrl?.value || ''),
        },
      ];
    })
    .slice(0, 3);
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
