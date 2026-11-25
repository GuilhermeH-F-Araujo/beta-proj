begin;

alter table public.admin_notify drop constraint if exists admin_notify_tipo_check;
alter table public.admin_notify add constraint admin_notify_tipo_check check (tipo in (
  'novo_cliente', 'cliente_atualizado', 'nova_os', 'os_atualizada', 'status_os',
  'aguardando_peca', 'pronta', 'entregue', 'cancelada',
  'nova_moto', 'moto_atualizada', 'novo_funcionario', 'funcionario_atualizado',
  'novo_agendamento', 'agendamento_atualizado', 'agendamento_confirmado',
  'agendamento_concluido', 'agendamento_cancelado', 'agendamento_removido',
  'catalogo_atualizado', 'novo_modelo_miniatura', 'miniatura_em_revisao',
  'miniatura_precisa_informacao', 'miniatura_falhou', 'miniatura_publicada'
));

create or replace function app_private.avisar_miniatura()
returns trigger language plpgsql security definer set search_path = '' as $$
declare tipo_aviso text; titulo_aviso text; modelo_aviso text;
begin
  if tg_table_name = 'miniatura_catalogo' then
    tipo_aviso := 'novo_modelo_miniatura';
    titulo_aviso := 'Novo modelo para miniatura';
    modelo_aviso := new.modelo;
  elsif tg_table_name = 'miniatura_pedidos' then
    if old.status is not distinct from new.status then return new; end if;
    case new.status
      when 'revisao' then
        tipo_aviso := 'miniatura_em_revisao'; titulo_aviso := 'Miniatura pronta para revisão';
      when 'informacao' then
        tipo_aviso := 'miniatura_precisa_informacao'; titulo_aviso := 'Miniatura precisa de informações';
      when 'falhou' then
        tipo_aviso := 'miniatura_falhou'; titulo_aviso := 'Falha na geração de miniatura';
      when 'aprovada' then
        tipo_aviso := 'miniatura_publicada'; titulo_aviso := 'Miniatura publicada';
      else return new;
    end case;
    select modelo into modelo_aviso from public.miniatura_catalogo where id = new.catalogo_id;
  else return new;
  end if;
  insert into public.admin_notify(tipo,titulo,mensagem)
    values (tipo_aviso,titulo_aviso,coalesce(modelo_aviso,''));
  return new;
end;
$$;

revoke all on function app_private.avisar_miniatura() from public,anon,authenticated;
drop trigger if exists avisar_modelo_miniatura on public.miniatura_catalogo;
create trigger avisar_modelo_miniatura after insert on public.miniatura_catalogo
  for each row execute function app_private.avisar_miniatura();
drop trigger if exists avisar_status_miniatura on public.miniatura_pedidos;
create trigger avisar_status_miniatura after update of status on public.miniatura_pedidos
  for each row execute function app_private.avisar_miniatura();

commit;
