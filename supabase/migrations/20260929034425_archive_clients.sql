-- Exclusão lógica: preserva motos, OS, avaliações, agendamentos e notificações
-- referenciados por id_cliente. A listagem administrativa ignora registros
-- com excluido_em preenchido.
alter table public.cliente add column if not exists excluido_em timestamptz;
grant select (excluido_em), update (excluido_em) on public.cliente to service_role;
create index if not exists idx_cliente_excluido_em on public.cliente (excluido_em);
