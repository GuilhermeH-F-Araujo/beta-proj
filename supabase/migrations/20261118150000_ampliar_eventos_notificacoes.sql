begin;

alter table public.admin_notify drop constraint if exists admin_notify_tipo_check;
alter table public.admin_notify add constraint admin_notify_tipo_check check (tipo in (
  'novo_cliente', 'cliente_atualizado', 'nova_os', 'os_atualizada', 'status_os',
  'aguardando_peca', 'pronta', 'entregue', 'cancelada',
  'nova_moto', 'moto_atualizada', 'novo_funcionario', 'funcionario_atualizado',
  'novo_agendamento', 'agendamento_atualizado', 'agendamento_confirmado',
  'agendamento_concluido', 'agendamento_cancelado', 'agendamento_removido',
  'catalogo_atualizado'
));

create or replace function app_private.avisar_cadastro_oficina()
returns trigger language plpgsql security definer set search_path = '' as $$
declare tipo_aviso text; titulo_aviso text; descricao text;
begin
  if tg_table_name = 'moto' then
    if tg_op = 'UPDATE' and
      (to_jsonb(old) - array['atualizado_em','foto','imagem','thumbnail_url','miniatura_id']) is not distinct from
      (to_jsonb(new) - array['atualizado_em','foto','imagem','thumbnail_url','miniatura_id'])
    then return new; end if;
    tipo_aviso := case when tg_op = 'INSERT' then 'nova_moto' else 'moto_atualizada' end;
    titulo_aviso := case when tg_op = 'INSERT' then 'Nova motocicleta' else 'Motocicleta atualizada' end;
    descricao := new.modelo;
  elsif tg_table_name = 'funcionario' then
    if tg_op = 'UPDATE' and
      row(old.nome, old.cargo, old.situacao) is not distinct from row(new.nome, new.cargo, new.situacao)
    then return new; end if;
    tipo_aviso := case when tg_op = 'INSERT' then 'novo_funcionario' else 'funcionario_atualizado' end;
    titulo_aviso := case when tg_op = 'INSERT' then 'Novo funcionário' else 'Funcionário atualizado' end;
    descricao := new.nome;
  else return new;
  end if;
  insert into public.admin_notify(tipo, titulo, mensagem)
    values(tipo_aviso, titulo_aviso, coalesce(descricao, ''));
  return new;
end;
$$;

revoke all on function app_private.avisar_cadastro_oficina() from public, anon, authenticated;
drop trigger if exists avisar_cadastro_oficina on public.moto;
create trigger avisar_cadastro_oficina after insert or update on public.moto
  for each row execute function app_private.avisar_cadastro_oficina();
drop trigger if exists avisar_cadastro_oficina on public.funcionario;
create trigger avisar_cadastro_oficina after insert or update of nome, cargo, situacao on public.funcionario
  for each row execute function app_private.avisar_cadastro_oficina();

create or replace function app_private.avisar_dados_oficina()
returns trigger language plpgsql security definer set search_path = '' as $$
declare dados_anteriores jsonb := '[]'::jsonb;
begin
  if tg_op = 'UPDATE' then
    if old.dados is not distinct from new.dados then return new; end if;
    dados_anteriores := old.dados;
  end if;
  if new.chave = 'catalogo' then
    insert into public.admin_notify(tipo, titulo, mensagem)
      values('catalogo_atualizado', 'Catálogo de serviços atualizado', 'Alterações em serviços ou categorias.');
  elsif new.chave = 'agenda' then
    with anteriores as (
      select distinct on (item->>'id') item->>'id' as id, item
      from jsonb_array_elements(dados_anteriores) item
      where item ? 'id'
      order by item->>'id', item
    ), atuais as (
      select distinct on (item->>'id') item->>'id' as id, item
      from jsonb_array_elements(new.dados) item
      where item ? 'id'
      order by item->>'id', item
    ), alteracoes as (
      select case
        when anteriores.id is null then 'novo_agendamento'
        when atuais.id is null then 'agendamento_removido'
        when anteriores.item->>'status' is distinct from atuais.item->>'status' then
          case atuais.item->>'status'
            when 'Confirmado' then 'agendamento_confirmado'
            when 'Concluído' then 'agendamento_concluido'
            when 'Cancelado' then 'agendamento_cancelado'
            else 'agendamento_atualizado'
          end
        else 'agendamento_atualizado'
      end as tipo, coalesce(atuais.item, anteriores.item) as item
      from anteriores full join atuais using (id)
      where anteriores.item is distinct from atuais.item
    )
    insert into public.admin_notify(tipo, titulo, mensagem)
    select tipo, case tipo
      when 'novo_agendamento' then 'Novo agendamento'
      when 'agendamento_removido' then 'Agendamento removido'
      when 'agendamento_confirmado' then 'Agendamento confirmado'
      when 'agendamento_concluido' then 'Agendamento concluído'
      when 'agendamento_cancelado' then 'Agendamento cancelado'
      else 'Agendamento atualizado'
    end, concat_ws(' · ', item->>'cliente', item->>'data', item->>'hora')
    from alteracoes;
  end if;
  return new;
end;
$$;

revoke all on function app_private.avisar_dados_oficina() from public, anon, authenticated;
drop trigger if exists avisar_dados_oficina on public.oficina_painel;
create trigger avisar_dados_oficina after insert or update of dados on public.oficina_painel
  for each row execute function app_private.avisar_dados_oficina();

commit;
