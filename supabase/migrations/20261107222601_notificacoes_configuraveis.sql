-- Eventos persistentes: preferencias nunca impedem o registro do evento.
-- Cada administrador decide como receber os avisos no seu navegador.
alter table public.admin_notify add column if not exists id_cliente integer references public.cliente(id_cliente) on delete set null;
alter table public.admin_notify drop constraint if exists admin_notify_tipo_check;
alter table public.admin_notify add constraint admin_notify_tipo_check check(tipo in ('nova_os','os_atualizada','status_os','aguardando_peca','pronta','entregue','cancelada','novo_cliente','cliente_atualizado'));

create or replace function app_private.avisar_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_tipo text; v_titulo text; v_modelo text; v_cliente text;
begin
  if tg_op = 'INSERT' then
    v_tipo := 'nova_os'; v_titulo := 'Nova OS #' || new.id_os;
  elsif old.status is distinct from new.status then
    case new.status
      when 'aguardando peça' then v_tipo := 'aguardando_peca'; v_titulo := 'OS #' || new.id_os || ' aguardando peça';
      when 'pronto' then v_tipo := 'pronta'; v_titulo := 'OS #' || new.id_os || ' pronta para entrega';
      when 'entregue' then v_tipo := 'entregue'; v_titulo := 'OS #' || new.id_os || ' entregue';
      when 'cancelada' then v_tipo := 'cancelada'; v_titulo := 'OS #' || new.id_os || ' cancelada';
      else v_tipo := 'status_os'; v_titulo := 'OS #' || new.id_os || ' · ' || new.status;
    end case;
  elsif to_jsonb(old) is distinct from to_jsonb(new) then
    v_tipo := 'os_atualizada'; v_titulo := 'OS #' || new.id_os || ' atualizada';
  else return new;
  end if;
  select m.modelo,c.nome into v_modelo,v_cliente from public.moto m join public.cliente c on c.id_cliente=m.id_cliente where m.id_moto=new.id_moto;
  insert into public.admin_notify(tipo,id_os,titulo,mensagem) values(v_tipo,new.id_os,v_titulo,concat_ws(' · ',v_cliente,v_modelo));
  return new;
end $$;
revoke all on function app_private.avisar_admin() from public,anon,authenticated;
drop trigger if exists avisar_admin on public.ordem_servico;
create trigger avisar_admin after insert or update on public.ordem_servico for each row execute function app_private.avisar_admin();

create or replace function app_private.avisar_cliente_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_tipo text; v_titulo text;
begin
  if new.excluido_em is not null then return new; end if;
  if tg_op = 'INSERT' then v_tipo := 'novo_cliente'; v_titulo := 'Novo cliente cadastrado';
  elsif (to_jsonb(old) - array['auth_user_id','excluido_em','foto']) is distinct from (to_jsonb(new) - array['auth_user_id','excluido_em','foto']) then
    v_tipo := 'cliente_atualizado'; v_titulo := 'Cadastro de cliente atualizado';
  else return new;
  end if;
  insert into public.admin_notify(tipo,id_cliente,titulo,mensagem) values(v_tipo,new.id_cliente,v_titulo,new.nome);
  return new;
end $$;
revoke all on function app_private.avisar_cliente_admin() from public,anon,authenticated;
drop trigger if exists avisar_cliente_admin on public.cliente;
create trigger avisar_cliente_admin after insert or update on public.cliente for each row execute function app_private.avisar_cliente_admin();
create index if not exists admin_notify_cliente_idx on public.admin_notify(id_cliente) where id_cliente is not null;
create index if not exists os_historico_data_idx on public.os_historico(criado_em desc,id desc);
create index if not exists cliente_historico_data_idx on public.cliente_historico(criado_em desc,id desc);
