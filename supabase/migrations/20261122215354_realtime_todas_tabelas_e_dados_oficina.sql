begin;

create table if not exists public.configuracao_oficina (
  id boolean primary key default true check (id),
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);

alter table public.configuracao_oficina enable row level security;
revoke all on public.configuracao_oficina from public, anon, authenticated;
grant select, insert, update on public.configuracao_oficina to service_role;
comment on table public.configuracao_oficina is
  'Dados compartilhados de perfil, endereço e horário da oficina; acesso pela API autenticada do painel.';

do $$
declare
  tabela record;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'A publicação supabase_realtime não existe neste projeto.';
  end if;

  for tabela in
    select n.nspname as esquema, c.relname as nome
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not exists (
        select 1
        from pg_publication_tables p
        where p.pubname = 'supabase_realtime'
          and p.schemaname = n.nspname
          and p.tablename = c.relname
      )
    order by c.relname
  loop
    execute format('alter publication supabase_realtime add table %I.%I', tabela.esquema, tabela.nome);
  end loop;
end
$$;

commit;
