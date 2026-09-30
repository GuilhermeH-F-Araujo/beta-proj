-- Exclusão lógica e registro atômico do motivo no log administrativo privado.
create table if not exists public.client_admin_audit (
  id bigserial primary key,
  client_id integer not null references public.cliente(id_cliente),
  client_name text not null,
  admin_user_id uuid not null,
  action text not null check (action = 'archive'),
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  occurred_at timestamptz not null default now()
);
alter table public.client_admin_audit enable row level security;
revoke all on public.client_admin_audit from public, anon, authenticated;
grant select, insert on public.client_admin_audit to service_role;
grant usage, select on sequence public.client_admin_audit_id_seq to service_role;

create or replace function public.admin_client_archive(p_client_id integer, p_actor uuid, p_reason text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare previous_name text;
begin
  if p_actor is null then raise exception 'Administrador não identificado'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 5 and 500 then
    raise exception 'Informe um motivo de 5 a 500 caracteres';
  end if;
  update public.cliente set excluido_em = now()
    where id_cliente = p_client_id and excluido_em is null
    returning nome into previous_name;
  if not found then return false; end if;
  insert into public.client_admin_audit (client_id, client_name, admin_user_id, action, reason)
    values (p_client_id, previous_name, p_actor, 'archive', btrim(p_reason));
  return true;
end $$;
revoke all on function public.admin_client_archive(integer,uuid,text) from public, anon, authenticated;
grant execute on function public.admin_client_archive(integer,uuid,text) to service_role;
