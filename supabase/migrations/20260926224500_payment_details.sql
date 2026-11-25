-- Metadados do registro manual de pagamento da OS.
alter table public.pagamento_os
  add column if not exists forma text check (forma in ('pix', 'credito', 'debito')),
  add column if not exists parcelas smallint check (parcelas between 1 and 12),
  add column if not exists maquininha text check (maquininha in ('rede', 'stone')),
  add column if not exists valor numeric(12,2) check (valor > 0),
  add column if not exists confirmado_por uuid references auth.users(id);
grant select, insert, update on public.pagamento_os to service_role;
