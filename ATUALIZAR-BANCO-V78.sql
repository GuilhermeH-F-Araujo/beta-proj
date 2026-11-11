-- Complemento separado do logradouro; preserva os dados e as políticas existentes.
begin;
alter table public.cliente add column if not exists complemento text;
comment on column public.cliente.complemento is 'Complemento opcional do endereço (apartamento, bloco, sala).';
commit;
begin;
create table if not exists public.oficina_painel (
  chave text primary key check (chave in ('catalogo','agenda')),
  dados jsonb not null,
  versao integer not null default 1 check (versao > 0),
  atualizado_em timestamptz not null default now()
);
alter table public.oficina_painel enable row level security;
revoke all on public.oficina_painel from public,anon,authenticated;
grant select,insert,update,delete on public.oficina_painel to service_role;
comment on table public.oficina_painel is 'Cadastros compartilhados do painel; acesso apenas pela API autenticada e autorizada.';
commit;
