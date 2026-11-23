begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

create index if not exists agendamento_cliente_idx on public.agendamento(id_cliente);
create index if not exists agendamento_moto_idx on public.agendamento(id_moto);
create index if not exists agendamento_mecanico_idx on public.agendamento(id_mecanico);
create index if not exists logs_alvo_idx on public.logs(alvo) where alvo is not null;

notify pgrst,'reload schema';
commit;
