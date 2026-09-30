-- Dados que aparecem em Corrigir informações e registro de ações administrativas.
alter table public.cliente add column if not exists cpf varchar(14);
grant select (cpf), update (nome, telefone, email, cpf) on public.cliente to service_role;
grant update (modelo, placa, ano, cor) on public.moto to service_role;
grant delete on public.foto_os, public.notificacao, public.os_peca, public.os_servico, public.orcamento to service_role;
grant select (id_os) on public.foto_os, public.notificacao, public.os_peca, public.os_servico, public.orcamento to service_role;

create table if not exists public.order_admin_audit (
  id bigint generated always as identity primary key,
  order_id integer not null,
  action text not null check (action in ('status','edit','delete')),
  admin_user_id uuid not null,
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);
alter table public.order_admin_audit enable row level security;
revoke all on public.order_admin_audit from public, anon, authenticated;
grant select, insert on public.order_admin_audit to service_role;
grant usage, select on sequence public.order_admin_audit_id_seq to service_role;

create or replace function public.admin_order_status(
  p_id_os integer, p_status text, p_observation text, p_actor uuid
) returns void language plpgsql security invoker set search_path = public as $$
declare old_status text;
begin
  if p_status not in ('aguardando','em andamento','aguardando peça','pronto','entregue','cancelada') then
    raise exception 'Status inválido';
  end if;
  select status into old_status from public.ordem_servico where id_os = p_id_os for update;
  if not found then raise exception 'OS não encontrada'; end if;
  update public.ordem_servico set status = p_status,
    observacoes = case when nullif(btrim(p_observation),'') is null then observacoes
      else concat_ws(E'\n', nullif(observacoes,''), '[Mudança de status] ' || btrim(p_observation)) end
    where id_os = p_id_os;
  insert into public.order_admin_audit(order_id,action,admin_user_id,details)
    values (p_id_os,'status',p_actor,jsonb_build_object('antes',old_status,'depois',p_status,'observacao',nullif(btrim(p_observation),'')));
end $$;
revoke all on function public.admin_order_status(integer,text,text,uuid) from public, anon, authenticated;
grant execute on function public.admin_order_status(integer,text,text,uuid) to service_role;

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
  update public.cliente set nome=p_name, telefone=nullif(p_phone,''), email=nullif(p_email,''), cpf=nullif(p_cpf,'') where id_cliente=client_id;
  update public.moto set modelo=p_model, placa=p_plate, ano=p_year, cor=nullif(p_color,'') where id_moto=moto_id;
  update public.ordem_servico set problema_relatado=nullif(p_problem,''), observacoes=nullif(p_observations,'') where id_os=p_id_os;
  insert into public.order_admin_audit(order_id,action,admin_user_id,details)
    values (p_id_os,'edit',p_actor,jsonb_build_object('antes',previous,'depois',jsonb_build_object(
      'cliente',p_name,'telefone',p_phone,'email',p_email,'cpf',p_cpf,'modelo',p_model,
      'placa',p_plate,'ano',p_year,'cor',p_color,'problema',p_problem,'observacoes',p_observations)));
end $$;
revoke all on function public.admin_order_edit(integer,text,text,text,text,text,text,integer,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.admin_order_edit(integer,text,text,text,text,text,text,integer,text,text,text,uuid) to service_role;

create or replace function public.admin_order_delete(p_id_os integer, p_actor uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  perform 1 from public.ordem_servico where id_os=p_id_os for update;
  if not found then raise exception 'OS não encontrada'; end if;
  delete from public.foto_os where id_os=p_id_os;
  delete from public.notificacao where id_os=p_id_os;
  delete from public.os_peca where id_os=p_id_os;
  delete from public.os_servico where id_os=p_id_os;
  delete from public.orcamento where id_os=p_id_os;
  delete from public.ordem_servico where id_os=p_id_os;
  insert into public.order_admin_audit(order_id,action,admin_user_id,details)
    values (p_id_os,'delete',p_actor,jsonb_build_object('permanent',true));
end $$;
revoke all on function public.admin_order_delete(integer,uuid) from public, anon, authenticated;
grant execute on function public.admin_order_delete(integer,uuid) to service_role;
