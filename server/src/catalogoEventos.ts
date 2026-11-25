import type { SupabaseClient } from '@supabase/supabase-js';
import type { Response } from 'express';

const conexoes = new Set<Response>();
let inscricaoIniciada = false;
let envioPendente: ReturnType<typeof setTimeout> | undefined;
let catalogoPendente = false;

export function conectarEventosCatalogo(res: Response) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write('retry: 8000\n\n');
  conexoes.add(res);

  const manterConexao = setInterval(() => {
    if (!res.writableEnded) res.write(': keep-alive\n\n');
  }, 25_000);
  const encerrar = () => {
    clearInterval(manterConexao);
    conexoes.delete(res);
  };
  res.on('close', encerrar);
}

function publicarEvento(nome: 'catalogo-atualizado' | 'dados-atualizados') {
  for (const conexao of conexoes) {
    if (conexao.writableEnded || conexao.destroyed) {
      conexoes.delete(conexao);
      continue;
    }
    conexao.write(`event: ${nome}\ndata: {}\n\n`);
  }
}

function agendarAvisoDados(mudouCatalogo = false) {
  catalogoPendente ||= mudouCatalogo;
  if (envioPendente) return;
  envioPendente = setTimeout(() => {
    envioPendente = undefined;
    if (catalogoPendente) publicarEvento('catalogo-atualizado');
    catalogoPendente = false;
    publicarEvento('dados-atualizados');
  }, 120);
}

export function avisarCatalogoAtualizado() {
  agendarAvisoDados(true);
}

export function iniciarEventosCatalogo(db: SupabaseClient) {
  if (inscricaoIniciada) return;
  inscricaoIniciada = true;
  db.channel('tabelas-publicas-alteracoes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
      },
      (payload) =>
        agendarAvisoDados(
          ['categorias_servico', 'servicos', 'servicos_catalogo_versao'].includes(payload.table),
        ),
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn(`[catalogo-realtime] Assinatura do banco: ${status}.`);
      }
    });
}
