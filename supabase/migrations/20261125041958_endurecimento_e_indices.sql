-- APLICADA em 25/11/2026 (aprovada pelo responsavel). Origem: avisos de seguranca e desempenho do Supabase.
-- Nada aqui apaga dados.
begin;

-- 1) Funcoes de gatilho expostas na API: anon e usuarios logados podiam chama-las via
--    /rest/v1/rpc. Gatilhos continuam funcionando normalmente apos o revoke.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.criar_cliente_ao_cadastrar() from public, anon, authenticated;

-- 2) search_path fixo nas funcoes que ainda herdavam o do chamador.
alter function public.bloquear_redecisao_orcamento() set search_path = public;
alter function public.formatar_prazo(timestamp without time zone) set search_path = public;
alter function public.prazo_efetivo(timestamp without time zone) set search_path = public;
alter function public.status_os_permite_alterar_orcamento(character varying) set search_path = public;
alter function public.status_para_bd(character varying) set search_path = public;
alter function public.status_para_exibicao(character varying) set search_path = public;

-- 3) Indices para chaves estrangeiras sem indice (joins e exclusoes em cascata mais rapidos).
create index if not exists admin_confirmacao_id_sessao_idx on public.admin_confirmacao (id_sessao);
create index if not exists admin_notify_id_os_idx on public.admin_notify (id_os);
create index if not exists configuracao_oficina_atualizado_por_idx on public.configuracao_oficina (atualizado_por);
create index if not exists foto_os_id_os_idx on public.foto_os (id_os);
create index if not exists funcionario_solicitacao_auth_user_idx on public.funcionario_solicitacao (auth_user_id);
create index if not exists funcionario_solicitacao_decidido_por_idx on public.funcionario_solicitacao (decidido_por);
create index if not exists funcionario_solicitacao_solicitado_por_idx on public.funcionario_solicitacao (solicitado_por);
create index if not exists miniatura_envios_pedido_idx on public.miniatura_envios (pedido_id);
create index if not exists miniatura_pedidos_admin_idx on public.miniatura_pedidos (admin_id);
create index if not exists miniatura_publicacoes_admin_idx on public.miniatura_publicacoes (admin_id);
create index if not exists miniatura_publicacoes_catalogo_idx on public.miniatura_publicacoes (catalogo_id);
create index if not exists miniatura_publicacoes_pedido_idx on public.miniatura_publicacoes (pedido_id);
create index if not exists moto_id_cliente_idx on public.moto (id_cliente);
create index if not exists notificacao_id_os_idx on public.notificacao (id_os);
create index if not exists notificacao_mecanico_agendamento_idx on public.notificacao_mecanico (id_agendamento);
create index if not exists notificacao_mecanico_id_os_idx on public.notificacao_mecanico (id_os);
create index if not exists notificacao_sem_dest_agendamento_idx on public.notificacao_sem_destinatario (id_agendamento);
create index if not exists notificacao_sem_dest_id_os_idx on public.notificacao_sem_destinatario (id_os);
create index if not exists ordem_servico_id_mecanico_idx on public.ordem_servico (id_mecanico);
create index if not exists os_peca_id_os_idx on public.os_peca (id_os);
create index if not exists os_servico_id_os_idx on public.os_servico (id_os);
create index if not exists pagamento_os_confirmado_por_idx on public.pagamento_os (confirmado_por);

commit;

-- 4) Fora do SQL (painel do Supabase > Authentication > Policies/Passwords):
--    ativar "Leaked password protection" (checagem HaveIBeenPwned).
