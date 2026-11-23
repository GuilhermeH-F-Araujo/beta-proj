import type { SupabaseClient } from '@supabase/supabase-js';
import { ACERVO } from './identidade.js';
import { conferirErro, obterCatalogo, publicacaoAtual } from './repositorio.js';
export async function consultarPublicada(
  db: SupabaseClient,
  modelo: string,
  ano: number | null = null,
  motoId: number | null = null,
) {
  let catalogo = null;
  if (motoId) {
    const { data, error } = await db
      .from('miniatura_catalogo')
      .select('*')
      .eq('moto_id', motoId)
      .not('publicada', 'is', null)
      .order('atualizado_em', { ascending: false })
      .limit(1)
      .maybeSingle();
    conferirErro(error);
    catalogo = data;
  }
  if (!catalogo && ano)
    catalogo = await obterCatalogo(db, { modelo, ano, variante: '', motoId: null });
  if (!catalogo?.publicada)
    catalogo = await obterCatalogo(db, { modelo, ano: null, variante: '', motoId: null });
  const publicacao = catalogo && (await publicacaoAtual(db, catalogo));
  return { catalogo, publicacao };
}
export async function lerPublicada(
  db: SupabaseClient,
  modelo: string,
  ano: number | null = null,
  motoId: number | null = null,
) {
  const { publicacao } = await consultarPublicada(db, modelo, ano, motoId);
  if (!publicacao) return null;
  const { data, error } = await db.storage
    .from(ACERVO)
    .download(publicacao.caminho.replace('original.png', 'card.webp'));
  conferirErro(error);
  return data
    ? { bytes: Buffer.from(await data.arrayBuffer()), mime: 'image/webp', origin: 'published' }
    : null;
}

export async function podeConsultarMoto(
  db: SupabaseClient,
  motoId: number,
  clienteId: number,
  acesso: { administrador: boolean; cliente: number | null; funcionario: number | null },
) {
  if (acesso.administrador || acesso.cliente === clienteId) return true;
  if (!acesso.funcionario) return false;
  const { data, error } = await db
    .from('ordem_servico')
    .select('id_os')
    .eq('id_moto', motoId)
    .eq('id_mecanico', acesso.funcionario)
    .limit(1);
  conferirErro(error);
  return !!data?.length;
}
