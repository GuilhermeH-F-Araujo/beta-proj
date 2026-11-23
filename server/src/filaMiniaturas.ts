import { criarPedido, obterCatalogo, conferirErro } from './miniaturas/repositorio.js';
import type { SupabaseClient } from '@supabase/supabase-js';
export function chaveModelo(modeloLocal: string) {
  return modeloLocal
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
export async function enfileirarModelo(db: SupabaseClient, modeloLocal: string) {
  const chaveLocal = chaveModelo(modeloLocal);
  if (chaveLocal.length < 2 || chaveLocal.length > 100 || /[\r\n<>]/.test(modeloLocal))
    throw new Error('Modelo invalido.');
  const identidade = { modelo: modeloLocal, ano: null, variante: '', motoId: null };
  const catalogo = await obterCatalogo(db, identidade);
  if (catalogo?.publicada) return { status: 'concluido', nextRetryAt: null };
  if (catalogo) {
    const { data, error } = await db
      .from('miniatura_pedidos')
      .select('status,tentar_em')
      .eq('catalogo_id', catalogo.id)
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle();
    conferirErro(error);
    return {
      status:
        data?.status === 'revisao'
          ? 'aguardando_revisao'
          : ['informacao', 'falhou'].includes(data?.status)
            ? 'aguardando_revisao'
            : data?.status || 'pendente',
      nextRetryAt: data?.tentar_em || null,
    };
  }
  const pedido = await criarPedido(db, identidade, null);
  const { error } = await db
    .from('miniatura_pedidos')
    .update({ status: 'pendente' })
    .eq('id', pedido.id);
  conferirErro(error);
  return { status: 'pendente', nextRetryAt: null };
}
