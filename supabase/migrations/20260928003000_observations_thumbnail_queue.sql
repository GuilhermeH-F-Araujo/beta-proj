-- Execute após as migrations anteriores. Todas as mutações da fila ocorrem no servidor.
create table if not exists public.order_observation_history (
  id bigint generated always as identity primary key,
  order_id integer not null,
  kind text not null check (kind in ('previous_observation','status_note')),
  body text not null,
  actor_user_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists order_observation_history_order_time on public.order_observation_history(order_id,created_at desc,id desc);
alter table public.order_observation_history enable row level security;
revoke all on public.order_observation_history from public, anon, authenticated;
grant select, insert on public.order_observation_history to service_role;
grant usage, select on sequence public.order_observation_history_id_seq to service_role;

-- Cópia privada integral antes de limpar o campo legado. Não contém senhas.
create table if not exists public.order_observation_migration_backup (
  order_id integer primary key,
  original_body text not null,
  saved_at timestamptz not null default now()
);
alter table public.order_observation_migration_backup enable row level security;
revoke all on public.order_observation_migration_backup from public,anon,authenticated;
grant select on public.order_observation_migration_backup to service_role;
insert into public.order_observation_migration_backup(order_id,original_body)
select id_os,observacoes from public.ordem_servico
where observacoes like '%[Mudança de status]%'
on conflict (order_id) do nothing;

-- As notas antigas de status já estão em order_status_history. Remover só as linhas
-- adicionadas pela função antiga, mantendo a observação principal intacta.
update public.ordem_servico
set observacoes = nullif(btrim(regexp_replace(observacoes, E'(^|\\n)\\[Mudança de status\\][^\\n]*', '', 'g')), '')
where observacoes like '%[Mudança de status]%';

create or replace function app_private.capture_order_observation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.observacoes is distinct from new.observacoes and nullif(btrim(old.observacoes),'') is not null then
    insert into public.order_observation_history(order_id,kind,body,actor_user_id)
      values (old.id_os,'previous_observation',old.observacoes,
        coalesce(nullif(current_setting('app.order_actor',true),'')::uuid,auth.uid()));
  end if;
  return new;
end $$;
revoke all on function app_private.capture_order_observation() from public, anon, authenticated;
drop trigger if exists capture_order_observation on public.ordem_servico;
create trigger capture_order_observation after update of observacoes on public.ordem_servico
  for each row when (old.observacoes is distinct from new.observacoes)
  execute function app_private.capture_order_observation();

create or replace function public.admin_order_status(p_id_os integer,p_status text,p_observation text,p_actor uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare old_status text;
begin
  if p_status not in ('aguardando','em andamento','aguardando peça','pronto','entregue','cancelada') then raise exception 'Status inválido'; end if;
  if length(coalesce(p_observation,'')) > 500 then raise exception 'Observação muito longa'; end if;
  select status into old_status from public.ordem_servico where id_os=p_id_os for update;
  if not found then raise exception 'OS não encontrada'; end if;
  if old_status=p_status then raise exception 'A OS já está nesse status'; end if;
  perform set_config('app.order_actor',p_actor::text,true);
  perform set_config('app.order_note',coalesce(p_observation,''),true);
  update public.ordem_servico set status=p_status where id_os=p_id_os;
  insert into public.order_admin_audit(order_id,action,admin_user_id,details)
    values (p_id_os,'status',p_actor,jsonb_build_object('antes',old_status,'depois',p_status,'observacao',nullif(btrim(p_observation),'')));
end $$;
revoke all on function public.admin_order_status(integer,text,text,uuid) from public,anon,authenticated;
grant execute on function public.admin_order_status(integer,text,text,uuid) to service_role;

create table if not exists public.motorcycle_thumbnail_jobs (
  id bigint generated always as identity primary key,
  model_key text not null unique,
  model text not null,
  status text not null default 'pending' check (status in ('pending','processing','waiting_quota','retry','done')),
  attempts integer not null default 0,
  next_retry_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by uuid,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists motorcycle_thumbnail_jobs_ready on public.motorcycle_thumbnail_jobs(next_retry_at,created_at) where status in ('pending','retry','waiting_quota');
alter table public.motorcycle_thumbnail_jobs enable row level security;
revoke all on public.motorcycle_thumbnail_jobs from public,anon,authenticated;
grant select,insert,update on public.motorcycle_thumbnail_jobs to service_role;
grant usage,select on sequence public.motorcycle_thumbnail_jobs_id_seq to service_role;

create or replace function app_private.motorcycle_model_key(p_model text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(translate(lower(btrim(p_model)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '\s+', ' ', 'g')
$$;
revoke all on function app_private.motorcycle_model_key(text) from public,anon,authenticated;
-- A RPC de reconciliação usa esta função sob service_role.
grant usage on schema app_private to service_role;
grant execute on function app_private.motorcycle_model_key(text) to service_role;

-- O gatilho alcança também OS criadas diretamente pelo aplicativo móvel.
create or replace function app_private.enqueue_motorcycle_model(p_model text) returns void
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  k := app_private.motorcycle_model_key(p_model);
  if k is null or length(k)<2 or length(k)>100 or k like '%não encontrada%' then return; end if;
  insert into public.motorcycle_thumbnail_jobs(model_key,model)
    values (k,btrim(p_model)) on conflict (model_key) do nothing;
end $$;
revoke all on function app_private.enqueue_motorcycle_model(text) from public,anon,authenticated;
create or replace function app_private.enqueue_order_motorcycle() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m text;
begin
  if tg_table_name='moto' then m:=new.modelo;
  else select modelo into m from public.moto where id_moto=new.id_moto; end if;
  perform app_private.enqueue_motorcycle_model(m);
  return new;
end $$;
revoke all on function app_private.enqueue_order_motorcycle() from public,anon,authenticated;
drop trigger if exists enqueue_motorcycle_on_order on public.ordem_servico;
create trigger enqueue_motorcycle_on_order after insert or update of id_moto on public.ordem_servico
  for each row execute function app_private.enqueue_order_motorcycle();
drop trigger if exists enqueue_motorcycle_on_model on public.moto;
create trigger enqueue_motorcycle_on_model after update of modelo on public.moto
  for each row when (old.modelo is distinct from new.modelo)
  execute function app_private.enqueue_order_motorcycle();

-- Retoma jobs interrompidos por encerramento abrupto do processo.
create or replace function public.claim_motorcycle_thumbnail_job(p_worker uuid)
returns setof public.motorcycle_thumbnail_jobs language plpgsql security invoker set search_path = public as $$
begin
  return query
  update public.motorcycle_thumbnail_jobs j
  set status='processing',attempts=j.attempts+1,locked_at=now(),locked_by=p_worker,updated_at=now()
  where j.id=(select q.id from public.motorcycle_thumbnail_jobs q
    where (q.status in ('pending','retry','waiting_quota') and q.next_retry_at<=now())
      or (q.status='processing' and q.locked_at<now()-interval '5 minutes')
    order by q.next_retry_at,q.created_at for update skip locked limit 1)
  returning j.*;
end $$;
revoke all on function public.claim_motorcycle_thumbnail_job(uuid) from public,anon,authenticated;
grant execute on function public.claim_motorcycle_thumbnail_job(uuid) to service_role;

-- O token de posse impede que um worker antigo finalize um job retomado por outro.
create or replace function public.finish_motorcycle_thumbnail_job(p_id bigint,p_worker uuid,p_status text,p_retry_at timestamptz,p_error text)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  if p_status not in ('done','retry','waiting_quota') then raise exception 'Estado inválido'; end if;
  update public.motorcycle_thumbnail_jobs set status=p_status,
    next_retry_at=coalesce(p_retry_at,now()),last_error=left(p_error,500),locked_at=null,locked_by=null,updated_at=now()
  where id=p_id and status='processing' and locked_by=p_worker;
  return found;
end $$;
revoke all on function public.finish_motorcycle_thumbnail_job(bigint,uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.finish_motorcycle_thumbnail_job(bigint,uuid,text,timestamptz,text) to service_role;

-- Backfill completo, paginado pelo banco, inclusive OS antigas. Idempotente.
insert into public.motorcycle_thumbnail_jobs(model_key,model)
select distinct on (app_private.motorcycle_model_key(m.modelo)) app_private.motorcycle_model_key(m.modelo),btrim(m.modelo)
from public.ordem_servico o join public.moto m on m.id_moto=o.id_moto
where m.modelo is not null and length(app_private.motorcycle_model_key(m.modelo)) between 2 and 100
  and app_private.motorcycle_model_key(m.modelo) not like '%não encontrada%'
order by app_private.motorcycle_model_key(m.modelo),o.id_os desc
on conflict (model_key) do nothing;

create or replace function public.scan_motorcycle_thumbnail_jobs() returns integer
language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  insert into public.motorcycle_thumbnail_jobs(model_key,model)
  select distinct on (app_private.motorcycle_model_key(m.modelo)) app_private.motorcycle_model_key(m.modelo),btrim(m.modelo)
  from public.ordem_servico o join public.moto m on m.id_moto=o.id_moto
  where m.modelo is not null and length(app_private.motorcycle_model_key(m.modelo)) between 2 and 100
    and app_private.motorcycle_model_key(m.modelo) not like '%não encontrada%'
  order by app_private.motorcycle_model_key(m.modelo),o.id_os desc
  on conflict (model_key) do update set status='pending',next_retry_at=now(),updated_at=now()
    where motorcycle_thumbnail_jobs.status='done';
  get diagnostics n=row_count;
  return n;
end $$;
revoke all on function public.scan_motorcycle_thumbnail_jobs() from public,anon,authenticated;
grant execute on function public.scan_motorcycle_thumbnail_jobs() to service_role;

-- A edição existente preserva o autor no histórico da observação anterior.
create or replace function public.admin_order_edit(
  p_id_os integer, p_name text, p_phone text, p_email text, p_cpf text,
  p_model text, p_plate text, p_year integer, p_color text,
  p_problem text, p_observations text, p_actor uuid
) returns void language plpgsql security invoker set search_path = public as $$
declare moto_id integer; client_id integer; previous jsonb;
begin
  select o.id_moto, m.id_cliente,
    jsonb_build_object('cliente',c.nome,'telefone',c.telefone,'email',c.email,'cpf',c.cpf,
      'modelo',m.modelo,'placa',m.placa,'ano',m.ano,'cor',m.cor,
      'problema',o.problema_relatado,'observacoes',o.observacoes)
    into moto_id, client_id, previous
    from public.ordem_servico o
    join public.moto m on m.id_moto=o.id_moto
    join public.cliente c on c.id_cliente=m.id_cliente
    where o.id_os=p_id_os for update of o,m,c;
  if not found then raise exception 'OS não encontrada'; end if;
  perform set_config('app.order_actor',p_actor::text,true);
  update public.cliente set nome=p_name, telefone=nullif(p_phone,''), email=nullif(p_email,''), cpf=nullif(p_cpf,'') where id_cliente=client_id;
  update public.moto set modelo=p_model, placa=p_plate, ano=p_year, cor=nullif(p_color,'') where id_moto=moto_id;
  update public.ordem_servico set problema_relatado=nullif(p_problem,''), observacoes=nullif(p_observations,'') where id_os=p_id_os;
  insert into public.order_admin_audit(order_id,action,admin_user_id,details)
    values (p_id_os,'edit',p_actor,jsonb_build_object('antes',previous,'depois',jsonb_build_object(
      'cliente',p_name,'telefone',p_phone,'email',p_email,'cpf',p_cpf,'modelo',p_model,
      'placa',p_plate,'ano',p_year,'cor',p_color,'problema',p_problem,'observacoes',p_observations)));
end $$;
