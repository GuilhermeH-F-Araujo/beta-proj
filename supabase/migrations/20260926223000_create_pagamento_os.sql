-- Estado de pagamento confirmado manualmente por um administrador.
-- A ausência de registro significa pendente, sem inferir a partir da entrega.
create table if not exists public.pagamento_os (
  id_os integer primary key references public.ordem_servico(id_os) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente', 'pago')),
  pago_em timestamptz,
  atualizado_em timestamptz not null default now(),
  constraint pagamento_os_pago_em_consistente check (status = 'pago' or pago_em is null)
);
alter table public.pagamento_os enable row level security;
revoke all on public.pagamento_os from anon, authenticated;
grant select, insert, update on public.pagamento_os to service_role;
