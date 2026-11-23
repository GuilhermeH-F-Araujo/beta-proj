import type { SupabaseClient } from '@supabase/supabase-js';
import type { Request } from 'express';

type Atividade = {
  id_usuario: string;
  evento: string;
  categoria: 'atividade' | 'seguranca';
  entidade: string;
  entidade_id: string;
  id_cliente?: number;
  id_os?: number;
  nome?: string;
  acao?: string;
  motivo?: string;
  dados?: Record<string, unknown>;
  resumo: string;
};

export async function registrarAtividade(
  db: SupabaseClient,
  atividade: Atividade,
  req?: Request,
) {
  try {
    const requestId = (req as (Request & { requestId?: string }) | undefined)?.requestId;
    const ip = req?.ip;
    const userAgent = req?.get('user-agent');
    const { error } = await db.from('logs').insert({
      ...atividade,
      ...(ip ? { ip } : {}),
      ...(userAgent ? { user_agent: userAgent.slice(0, 1000) } : {}),
      ...(requestId ? { request_id: requestId } : {}),
    });
    if (error) console.error('[logs/activity]', error.message);
  } catch (erro) {
    console.error(
      '[logs/activity]',
      erro instanceof Error ? erro.message : 'Falha ao registrar atividade.',
    );
  }
}
