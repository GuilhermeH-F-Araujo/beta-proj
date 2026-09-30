-- Registra mudanças de status feitas no painel, no app móvel ou por outras rotas.
create table if not exists public.order_status_history (
  id bigint generated always as identity primary key,
  order_id integer not null,
  previous_status text not null,
  next_status text not null,
  changed_at timestamptz not null default now(),
  actor_user_id uuid,
  note text,
  audit_id bigint unique
);
alter table public.order_status_history enable row level security;
revoke all on public.order_status_history from public, anon, authenticated;
grant select on public.order_status_history to service_role;

-- Preserva o horário dos eventos administrativos registrados antes do gatilho.
insert into public.order_status_history(order_id,previous_status,next_status,changed_at,actor_user_id,note,audit_id)
select a.order_id, coalesce(a.details->>'antes','Desconhecido'),
  coalesce(a.details->>'depois','Desconhecido'),a.occurred_at,a.admin_user_id,
  a.details->>'observacao',a.id
from public.order_admin_audit a
where a.action='status'
on conflict (audit_id) do nothing;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
create or replace function app_private.capture_order_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  if old.status is distinct from new.status then
    actor := coalesce(nullif(current_setting('app.order_actor',true),'')::uuid,auth.uid());
    insert into public.order_status_history(order_id,previous_status,next_status,actor_user_id,note)
      values (new.id_os,old.status,new.status,actor,nullif(current_setting('app.order_note',true),''));
  end if;
  return new;
end $$;
revoke all on function app_private.capture_order_status() from public, anon, authenticated;
drop trigger if exists capture_order_status on public.ordem_servico;
create trigger capture_order_status after update of status on public.ordem_servico
  for each row when (old.status is distinct from new.status)
  execute function app_private.capture_order_status();

create or replace function public.admin_order_status(
  p_id_os integer, p_status text, p_observation text, p_actor uuid
) returns void language plpgsql security invoker set search_path = public as $$
declare old_status text;
begin
  if p_status not in ('aguardando','em andamento','aguardando peça','pronto','entregue','cancelada') then
    raise exception 'Status inválido';
  end if;
  select status into old_status from public.ordem_servico where id_os=p_id_os for update;
  if not found then raise exception 'OS não encontrada'; end if;
  if old_status=p_status then raise exception 'A OS já está nesse status'; end if;
  perform set_config('app.order_actor',p_actor::text,true);
  perform set_config('app.order_note',coalesce(p_observation,''),true);
  update public.ordem_servico set status=p_status,
    observacoes=case when nullif(btrim(p_observation),'') is null then observacoes
      else concat_ws(E'\n',nullif(observacoes,''),'[Mudança de status] ' || btrim(p_observation)) end
    where id_os=p_id_os;
  insert into public.order_admin_audit(order_id,action,admin_user_id,details)
    values (p_id_os,'status',p_actor,jsonb_build_object('antes',old_status,'depois',p_status,'observacao',nullif(btrim(p_observation),'')));
end $$;
revoke all on function public.admin_order_status(integer,text,text,uuid) from public, anon, authenticated;
grant execute on function public.admin_order_status(integer,text,text,uuid) to service_role;
