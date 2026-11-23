import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ACERVO, chaveCatalogo, type Identidade, type Referencia } from './identidade.js';
import { prepararReferencia } from './imagens.js';
export function conferirErro(erro: unknown) {
  if (erro) throw erro;
}
export async function obterCatalogo(db: SupabaseClient, identidade: Identidade) {
  const { data, error } = await db
    .from('miniatura_catalogo')
    .select('*')
    .eq('chave', chaveCatalogo(identidade))
    .maybeSingle();
  conferirErro(error);
  return data;
}
export async function criarPedido(
  db: SupabaseClient,
  identidade: Identidade,
  adminId: string | null,
  modo = 'referencia',
  observacoes = '',
) {
  let catalogo = await obterCatalogo(db, identidade);
  if (!catalogo) {
    const { error } = await db.from('miniatura_catalogo').upsert(
      {
        chave: chaveCatalogo(identidade),
        modelo: identidade.modelo,
        ano: identidade.ano,
        variante: identidade.variante,
        moto_id: identidade.motoId,
      },
      { onConflict: 'chave', ignoreDuplicates: true },
    );
    conferirErro(error);
    catalogo = await obterCatalogo(db, identidade);
  }
  const { data, error } = await db
    .from('miniatura_pedidos')
    .insert({ catalogo_id: catalogo.id, admin_id: adminId, modo, observacoes })
    .select('*')
    .single();
  conferirErro(error);
  return data;
}
export async function pedidoCompleto(db: SupabaseClient, id: string) {
  const { data, error } = await db
    .from('miniatura_pedidos')
    .select('*,catalogo:miniatura_catalogo(*)')
    .eq('id', id)
    .maybeSingle();
  conferirErro(error);
  return data;
}
export async function urlArquivo(db: SupabaseClient, caminho?: string | null) {
  if (!caminho) return null;
  const { data, error } = await db.storage.from(ACERVO).createSignedUrl(caminho, 600);
  conferirErro(error);
  return data?.signedUrl || null;
}
export async function salvarReferencia(
  db: SupabaseClient,
  pedidoId: string,
  bytes: Buffer,
  origem: Referencia['origem'],
  fonte: Pick<Referencia, 'url' | 'licenca'> = {},
) {
  const preparada = await prepararReferencia(bytes);
  const caminho = `referencias/${pedidoId}/${randomUUID()}.jpg`;
  const { error } = await db.storage
    .from(ACERVO)
    .upload(caminho, preparada, { contentType: 'image/jpeg', upsert: false });
  conferirErro(error);
  const referencia: Referencia = {
    caminho,
    nome: `Foto ${new Date().toLocaleTimeString('pt-BR')}`,
    origem,
    ...fonte,
  };
  const resultado = await db.rpc('adicionar_referencia_miniatura', {
    p_pedido: pedidoId,
    p_referencia: referencia,
  });
  if (resultado.error || !resultado.data) {
    await db.storage.from(ACERVO).remove([caminho]);
    throw new Error('Pedido em processamento ou limite de quatro fotos atingido.');
  }
  return referencia;
}
export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
export async function criarEnvio(db: SupabaseClient, pedidoId: string) {
  const token = randomBytes(32).toString('base64url');
  const expira = new Date(Date.now() + 20 * 60_000).toISOString();
  conferirErro(
    (await db.from('miniatura_envios').update({ cancelado: true }).eq('pedido_id', pedidoId)).error,
  );
  conferirErro(
    (
      await db
        .from('miniatura_envios')
        .insert({ pedido_id: pedidoId, token_hash: hashToken(token), expira_em: expira })
    ).error,
  );
  return { token, expira };
}
export async function envioValido(db: SupabaseClient, token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const { data, error } = await db
    .from('miniatura_envios')
    .select('id,pedido_id')
    .eq('token_hash', hashToken(token))
    .eq('cancelado', false)
    .gt('expira_em', new Date().toISOString())
    .maybeSingle();
  conferirErro(error);
  return data;
}
export async function publicacaoAtual(db: SupabaseClient, catalogo: { publicada?: string | null }) {
  if (!catalogo.publicada) return null;
  const { data, error } = await db
    .from('miniatura_publicacoes')
    .select('*')
    .eq('id', catalogo.publicada)
    .maybeSingle();
  conferirErro(error);
  return data;
}
