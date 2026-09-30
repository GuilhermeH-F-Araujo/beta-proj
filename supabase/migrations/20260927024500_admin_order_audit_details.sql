-- Mantém a razão da exclusão e um resumo da OS no log privado.
drop function if exists public.admin_order_delete(integer,uuid);

create function public.admin_order_delete(p_id_os integer, p_actor uuid, p_reason text)
returns void language plpgsql security invoker set search_path = public as $$
declare snapshot jsonb;
begin
  select jsonb_build_object('status',o.status,'cliente',c.nome,'moto',m.modelo,'placa',m.placa)
    into snapshot from public.ordem_servico o
    join public.moto m on m.id_moto=o.id_moto
    join public.cliente c on c.id_cliente=m.id_cliente
    where o.id_os=p_id_os for update of o;
  if not found then raise exception 'OS não encontrada'; end if;
  if length(btrim(coalesce(p_reason,''))) > 500 then raise exception 'Motivo muito longo'; end if;

  delete from public.foto_os where id_os=p_id_os;
  delete from public.notificacao where id_os=p_id_os;
  delete from public.os_peca where id_os=p_id_os;
  delete from public.os_servico where id_os=p_id_os;
  delete from public.orcamento where id_os=p_id_os;
  delete from public.ordem_servico where id_os=p_id_os;
  insert into public.order_admin_audit(order_id,action,admin_user_id,details)
    values (p_id_os,'delete',p_actor,jsonb_build_object('permanent',true,'motivo',nullif(btrim(p_reason),''),'os',snapshot));
end $$;
revoke all on function public.admin_order_delete(integer,uuid,text) from public, anon, authenticated;
grant execute on function public.admin_order_delete(integer,uuid,text) to service_role;

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
  update public.ordem_servico set status=p_status,
    observacoes=case when nullif(btrim(p_observation),'') is null then observacoes
      else concat_ws(E'\n',nullif(observacoes,''),'[Mudança de status] ' || btrim(p_observation)) end
    where id_os=p_id_os;
  insert into public.order_admin_audit(order_id,action,admin_user_id,details)
    values (p_id_os,'status',p_actor,jsonb_build_object('antes',old_status,'depois',p_status,'observacao',nullif(btrim(p_observation),'')));
end $$;
revoke all on function public.admin_order_status(integer,text,text,uuid) from public, anon, authenticated;
grant execute on function public.admin_order_status(integer,text,text,uuid) to service_role;
