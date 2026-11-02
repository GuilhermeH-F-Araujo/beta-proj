-- Registro remoto: 20261030215141 / simplificar_admin.
-- Transição atômica; os comentários abaixo identificam as etapas preparadas.
begin;
set local lock_timeout='10s';
set local statement_timeout='90s';
-- 20261030121000_unificar_historico.sql
-- Transição direta das 24 migrations originais. Requer API e workers parados.
-- Nenhuma alteração em entidades preexistentes fora do escopo das migrations.

lock table public.order_admin_audit, public.order_status_history, public.order_observation_history,
  public.order_observation_migration_backup, public.admin_notifications,
  public.admin_notification_receipts, public.client_admin_audit,
  public.motorcycle_thumbnail_jobs in access exclusive mode;

alter table public.admin_notifications rename to admin_notify;
alter table public.admin_notify drop constraint admin_notifications_kind_check;
alter table public.admin_notify rename column kind to tipo;
alter table public.admin_notify rename column order_id to id_os;
alter table public.admin_notify rename column title to titulo;
alter table public.admin_notify rename column body to mensagem;
alter table public.admin_notify rename column created_at to criado_em;
update public.admin_notify set tipo=case tipo
  when 'new_order' then 'nova_os' when 'waiting_part' then 'aguardando_peca'
  when 'ready' then 'pronta' when 'cancelled' then 'cancelada' else tipo end;
alter table public.admin_notify add constraint admin_notify_tipo_check
  check(tipo in ('nova_os','aguardando_peca','pronta','cancelada'));
alter table public.admin_notification_receipts rename to admin_leitura;
alter table public.admin_leitura rename column notification_id to id_aviso;
alter table public.admin_leitura rename column admin_user_id to id_usuario;
alter table public.admin_leitura rename column read_at to lido_em;
alter table public.admin_leitura rename column dismissed_at to dispensado_em;

alter table public.client_admin_audit rename to cliente_historico;
alter table public.cliente_historico drop constraint client_admin_audit_action_check;
alter table public.cliente_historico rename column client_id to id_cliente;
alter table public.cliente_historico rename column client_name to nome;
alter table public.cliente_historico rename column admin_user_id to id_usuario;
alter table public.cliente_historico rename column action to acao;
alter table public.cliente_historico rename column reason to motivo;
alter table public.cliente_historico rename column occurred_at to criado_em;
update public.cliente_historico set acao='arquivar' where acao='archive';
alter table public.cliente_historico add constraint cliente_historico_acao_check check(acao='arquivar');

alter table public.motorcycle_thumbnail_jobs rename to miniaturas_motos;
alter table public.miniaturas_motos drop constraint motorcycle_thumbnail_jobs_status_check;
alter table public.miniaturas_motos rename column model_key to chave;
alter table public.miniaturas_motos rename column model to modelo;
alter table public.miniaturas_motos rename column attempts to tentativas;
alter table public.miniaturas_motos rename column next_retry_at to tentar_em;
alter table public.miniaturas_motos rename column locked_at to travado_em;
alter table public.miniaturas_motos rename column locked_by to id_executor;
alter table public.miniaturas_motos rename column last_error to erro;
alter table public.miniaturas_motos rename column created_at to criado_em;
alter table public.miniaturas_motos rename column updated_at to atualizado_em;
update public.miniaturas_motos set status=case status
  when 'pending' then 'pendente' when 'processing' then 'processando'
  when 'waiting_quota' then 'aguardando_cota' when 'retry' then 'tentar_novamente'
  when 'needs_review' then 'aguardando_revisao' when 'done' then 'concluido' else status end;
alter table public.miniaturas_motos alter column status set default 'pendente';
alter table public.miniaturas_motos add constraint miniaturas_motos_status_check
  check(status in ('pendente','processando','aguardando_cota','tentar_novamente','aguardando_revisao','concluido'));
-- O predicado antigo contém valores literais em inglês: deve ser recriado.
drop index public.motorcycle_thumbnail_jobs_ready;
create index miniaturas_motos_fila_idx on public.miniaturas_motos(tentar_em,criado_em)
  where status in ('pendente','tentar_novamente','aguardando_cota');

alter table public.order_admin_audit rename to os_auditoria;
create table public.os_historico (
  id bigint generated always as identity primary key,
  id_os integer not null,
  tipo text not null check(tipo in ('status','edicao','exclusao','observacao_anterior','nota_status','auditoria_status')),
  id_usuario uuid,
  criado_em timestamptz not null default now(),
  anterior text,
  novo text,
  texto text,
  dados jsonb not null default '{}'::jsonb,
  origem text check(origem in ('auditoria','status','observacao')),
  id_origem bigint,
  id_auditoria bigint,
  constraint os_historico_rastreio_check check((origem is null)=(id_origem is null)),
  constraint os_historico_origem_unique unique(origem,id_origem)
);
create index os_historico_ordem_idx on public.os_historico(id_os,criado_em desc,id desc);
create index os_historico_tipo_idx on public.os_historico(id_os,tipo,criado_em desc,id desc);
alter table public.os_historico enable row level security;
revoke all on public.os_historico from public,anon,authenticated;
grant select,insert on public.os_historico to service_role;
grant usage,select on sequence public.os_historico_id_seq to service_role;

-- audit_id explícito é a única prova de duplicidade. A cópia vinculada completa
-- permanece em dados.auditoria, inclusive autor/data diferentes se houver.
do $$
begin
  if exists (
    select 1 from public.order_status_history s join public.os_auditoria a on a.id=s.audit_id
    where a.action<>'status' or a.order_id<>s.order_id
      or s.previous_status<>coalesce(a.details->>'antes','Desconhecido')
      or s.next_status<>coalesce(a.details->>'depois','Desconhecido')
  ) then raise exception 'audit_id incompatível com a OS ou transição: revisar sem descartar os registros'; end if;
end $$;
insert into public.os_historico
  (id_os,tipo,id_usuario,criado_em,anterior,novo,texto,dados,origem,id_origem,id_auditoria)
select * from (
  select a.order_id,
    case a.action when 'status' then 'auditoria_status' when 'edit' then 'edicao' when 'delete' then 'exclusao' end,
    a.admin_user_id,a.occurred_at,null::text,null::text,null::text,
    a.details,'auditoria'::text,a.id,null::bigint
  from public.os_auditoria a
  where not (a.action='status' and exists(select 1 from public.order_status_history s where s.audit_id=a.id))
  union all
  select s.order_id,'status',s.actor_user_id,s.changed_at,s.previous_status,s.next_status,s.note,
    case when a.id is null then '{}'::jsonb else jsonb_build_object('auditoria',to_jsonb(a)) end,
    'status',s.id,s.audit_id
  from public.order_status_history s left join public.os_auditoria a on a.id=s.audit_id
  union all
  select o.order_id,case o.kind when 'previous_observation' then 'observacao_anterior' when 'status_note' then 'nota_status' end,
    o.actor_user_id,o.created_at,null,null,o.body,'{}'::jsonb,'observacao',o.id,null
  from public.order_observation_history o
) eventos order by 4,9,10;

-- Conferência antes de liberar qualquer consumidor. Reutilizada na retirada.
create or replace function app_private.conferir_historico() returns void
language plpgsql security invoker set search_path='' as $$
begin
  if (select count(*) from public.os_historico where origem is not null) <>
     (select count(*) from public.os_auditoria a where not(a.action='status' and exists(select 1 from public.order_status_history s where s.audit_id=a.id))) +
     (select count(*) from public.order_status_history) +
     (select count(*) from public.order_observation_history)
  then raise exception 'Quantidade divergente na unificação'; end if;
  if exists (
    select 1 from public.os_auditoria a where not exists (
      select 1 from public.os_historico h where
      (h.origem='auditoria' and h.id_origem=a.id and h.id_os=a.order_id
        and h.id_usuario is not distinct from a.admin_user_id and h.criado_em=a.occurred_at
        and h.dados=a.details and h.tipo=case a.action when 'status' then 'auditoria_status' when 'edit' then 'edicao' when 'delete' then 'exclusao' end)
      or (a.action='status' and h.origem='status' and h.id_auditoria=a.id and h.dados->'auditoria'=to_jsonb(a))
    )
  ) then raise exception 'Auditoria não preservada integralmente'; end if;
  if exists (
    select 1 from public.order_status_history s where not exists (
      select 1 from public.os_historico h where h.origem='status' and h.id_origem=s.id
        and h.id_os=s.order_id and h.tipo='status' and h.criado_em=s.changed_at
        and h.id_usuario is not distinct from s.actor_user_id
        and h.anterior=s.previous_status and h.novo=s.next_status
        and h.texto is not distinct from s.note and h.id_auditoria is not distinct from s.audit_id
    )
  ) then raise exception 'Status não preservado integralmente'; end if;
  if exists (
    select 1 from public.order_observation_history o where not exists (
      select 1 from public.os_historico h where h.origem='observacao' and h.id_origem=o.id
        and h.id_os=o.order_id and h.criado_em=o.created_at and h.texto=o.body
        and h.id_usuario is not distinct from o.actor_user_id
        and h.tipo=case o.kind when 'previous_observation' then 'observacao_anterior' when 'status_note' then 'nota_status' end
    )
  ) then raise exception 'Observação não preservada integralmente'; end if;
end $$;
revoke all on function app_private.conferir_historico() from public,anon,authenticated,service_role;
select app_private.conferir_historico();

-- Funções e triggers atualizados abaixo; nenhum consumidor operacional usa as
-- tabelas de origem após esta transação. A retirada fica na migration seguinte.

create or replace function public.alterar_status_os(p_id_os integer,p_status text,p_texto text,p_usuario uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare status_anterior text;
begin
  if p_status not in ('aguardando','em andamento','aguardando peça','pronto','entregue','cancelada') then raise exception 'Status inválido'; end if;
  if length(coalesce(p_texto,'')) > 500 then raise exception 'Observação muito longa'; end if;
  select status into status_anterior from public.ordem_servico where id_os=p_id_os for update;
  if not found then raise exception 'OS não encontrada'; end if;
  if status_anterior=p_status then raise exception 'A OS já está nesse status'; end if;
  perform set_config('app.order_actor',p_usuario::text,true);
  perform set_config('app.order_note',coalesce(p_texto,''),true);
  update public.ordem_servico set status=p_status where id_os=p_id_os;
end $$;

create or replace function public.editar_os(
  p_id_os integer, p_nome text, p_telefone text, p_email text, p_cpf text,
  p_modelo text, p_placa text, p_ano integer, p_cor text,
  p_problema text, p_observacoes text, p_usuario uuid
) returns void language plpgsql security invoker set search_path = public as $$
declare v_moto integer; v_cliente integer; anterior jsonb;
begin
  select o.id_moto, m.id_cliente,
    jsonb_build_object('cliente',c.nome,'telefone',c.telefone,'email',c.email,'cpf',c.cpf,
      'modelo',m.modelo,'placa',m.placa,'ano',m.ano,'cor',m.cor,
      'problema',o.problema_relatado,'observacoes',o.observacoes)
    into v_moto, v_cliente, anterior
    from public.ordem_servico o
    join public.moto m on m.id_moto=o.id_moto
    join public.cliente c on c.id_cliente=m.id_cliente
    where o.id_os=p_id_os for update of o,m,c;
  if not found then raise exception 'OS não encontrada'; end if;
  perform set_config('app.order_actor',p_usuario::text,true);
  update public.cliente set nome=p_nome, telefone=nullif(p_telefone,''), email=nullif(p_email,''), cpf=nullif(p_cpf,'') where id_cliente=v_cliente;
  update public.moto set modelo=p_modelo, placa=p_placa, ano=p_ano, cor=nullif(p_cor,'') where id_moto=v_moto;
  update public.ordem_servico set problema_relatado=nullif(p_problema,''), observacoes=nullif(p_observacoes,'') where id_os=p_id_os;
  insert into public.os_historico(id_os,tipo,id_usuario,dados)
    values (p_id_os,'edicao',p_usuario,jsonb_build_object('antes',anterior,'depois',jsonb_build_object(
      'cliente',p_nome,'telefone',p_telefone,'email',p_email,'cpf',p_cpf,'modelo',p_modelo,
      'placa',p_placa,'ano',p_ano,'cor',p_cor,'problema',p_problema,'observacoes',p_observacoes)));
end $$;

create or replace function public.excluir_os(p_id_os integer, p_usuario uuid, p_motivo text)
returns void language plpgsql security invoker set search_path = public as $$
declare resumo jsonb;
begin
  select jsonb_build_object('status',o.status,'cliente',c.nome,'moto',m.modelo,'placa',m.placa)
    into resumo from public.ordem_servico o
    join public.moto m on m.id_moto=o.id_moto
    join public.cliente c on c.id_cliente=m.id_cliente
    where o.id_os=p_id_os for update of o;
  if not found then raise exception 'OS não encontrada'; end if;
  if length(btrim(coalesce(p_motivo,''))) > 500 then raise exception 'Motivo muito longo'; end if;

  delete from public.foto_os where id_os=p_id_os;
  delete from public.notificacao where id_os=p_id_os;
  delete from public.os_peca where id_os=p_id_os;
  delete from public.os_servico where id_os=p_id_os;
  delete from public.orcamento where id_os=p_id_os;
  delete from public.ordem_servico where id_os=p_id_os;
  insert into public.os_historico(id_os,tipo,id_usuario,dados)
    values (p_id_os,'exclusao',p_usuario,jsonb_build_object('permanente',true,'motivo',nullif(btrim(p_motivo),''),'ordem',resumo));
end $$;

create or replace function public.arquivar_cliente(p_id_cliente integer, p_usuario uuid, p_motivo text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare nome_anterior text;
begin
  if p_usuario is null then raise exception 'Administrador não identificado'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 5 and 500 then
    raise exception 'Informe um motivo de 5 a 500 caracteres';
  end if;
  update public.cliente set excluido_em = now()
    where id_cliente = p_id_cliente and excluido_em is null
    returning nome into nome_anterior;
  if not found then return false; end if;
  insert into public.cliente_historico (id_cliente, nome, id_usuario, acao, motivo)
    values (p_id_cliente, nome_anterior, p_usuario, 'arquivar', btrim(p_motivo));
  return true;
end $$;

create or replace function public.reservar_miniatura(p_executor uuid)
returns setof public.miniaturas_motos language plpgsql security invoker set search_path = public as $$
begin
  return query
  update public.miniaturas_motos j
  set status='processando',tentativas=j.tentativas+1,travado_em=now(),id_executor=p_executor,atualizado_em=now()
  where j.id=(select q.id from public.miniaturas_motos q
    where (q.status in ('pendente','tentar_novamente','aguardando_cota') and q.tentar_em<=now())
      or (q.status='processando' and q.travado_em<now()-interval '5 minutes')
    order by q.tentar_em,q.criado_em for update skip locked limit 1)
  returning j.*;
end $$;

create or replace function public.finalizar_miniatura(p_id bigint,p_executor uuid,p_status text,p_tentar_em timestamptz,p_erro text)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  if p_status not in ('concluido','tentar_novamente','aguardando_cota','aguardando_revisao') then raise exception 'Estado inválido'; end if;
  update public.miniaturas_motos set status=p_status,
    tentar_em=coalesce(p_tentar_em,now()),erro=left(p_erro,500),travado_em=null,id_executor=null,atualizado_em=now()
  where id=p_id and status='processando' and id_executor=p_executor;
  return found;
end $$;

create or replace function public.revisar_miniaturas() returns integer
language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  insert into public.miniaturas_motos(chave,modelo)
  select distinct on (app_private.chave_modelo(m.modelo)) app_private.chave_modelo(m.modelo),btrim(m.modelo)
  from public.ordem_servico o join public.moto m on m.id_moto=o.id_moto
  where m.modelo is not null and length(app_private.chave_modelo(m.modelo)) between 2 and 100
    and app_private.chave_modelo(m.modelo) not like '%não encontrada%'
  order by app_private.chave_modelo(m.modelo),o.id_os desc
  on conflict (chave) do update set status='pendente',tentar_em=now(),atualizado_em=now()
    where miniaturas_motos.status='concluido';
  get diagnostics n=row_count;
  return n;
end $$;

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
      when 'cancelada' then v_tipo := 'cancelada'; v_titulo := 'OS #' || new.id_os || ' cancelada';
      else return new;
    end case;
  else return new;
  end if;
  select m.modelo,c.nome into v_modelo,v_cliente from public.moto m
    join public.cliente c on c.id_cliente=m.id_cliente where m.id_moto=new.id_moto;
  insert into public.admin_notify(tipo,id_os,titulo,mensagem)
    values(v_tipo,new.id_os,v_titulo,concat_ws(' · ',v_cliente,v_modelo));
  return new;
end $$;

create or replace function app_private.enfileirar_modelo(p_modelo text) returns void
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  k := app_private.chave_modelo(p_modelo);
  if k is null or length(k)<2 or length(k)>100 or k like '%não encontrada%' then return; end if;
  insert into public.miniaturas_motos(chave,modelo)
    values (k,btrim(p_modelo)) on conflict (chave) do nothing;
end $$;

create or replace function app_private.enfileirar_moto() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m text;
begin
  if tg_table_name='moto' then m:=new.modelo;
  else select modelo into m from public.moto where id_moto=new.id_moto; end if;
  perform app_private.enfileirar_modelo(m);
  return new;
end $$;

create or replace function app_private.chave_modelo(p_modelo text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(translate(lower(btrim(p_modelo)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '\s+', ' ', 'g')
$$;

create or replace function app_private.registrar_status_os() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.status is distinct from new.status then
    insert into public.os_historico(id_os,tipo,anterior,novo,id_usuario,texto)
    values(new.id_os,'status',old.status,new.status,
      coalesce(nullif(current_setting('app.order_actor',true),'')::uuid,auth.uid()),
      nullif(current_setting('app.order_note',true),''));
  end if;
  return new;
end $$;
create or replace function app_private.registrar_observacao_os() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.observacoes is distinct from new.observacoes and nullif(btrim(old.observacoes),'') is not null then
    insert into public.os_historico(id_os,tipo,texto,id_usuario)
    values(old.id_os,'observacao_anterior',old.observacoes,
      coalesce(nullif(current_setting('app.order_actor',true),'')::uuid,auth.uid()));
  end if;
  return new;
end $$;
create or replace function app_private.exigir_motivo_cancelamento() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.status='cancelada' and old.status is distinct from new.status
    and nullif(btrim(current_setting('app.order_note',true)),'') is null then
    raise exception 'Informe o motivo do cancelamento.' using errcode='23514';
  end if;
  return new;
end $$;

-- Os nomes são novos: revogar o EXECUTE público padrão de cada função.
revoke all on function public.alterar_status_os(integer,text,text,uuid),
  public.editar_os(integer,text,text,text,text,text,text,integer,text,text,text,uuid),
  public.excluir_os(integer,uuid,text),public.arquivar_cliente(integer,uuid,text),
  public.reservar_miniatura(uuid),public.finalizar_miniatura(bigint,uuid,text,timestamptz,text),
  public.revisar_miniaturas() from public,anon,authenticated;
grant execute on function public.alterar_status_os(integer,text,text,uuid),
  public.editar_os(integer,text,text,text,text,text,text,integer,text,text,text,uuid),
  public.excluir_os(integer,uuid,text),public.arquivar_cliente(integer,uuid,text),
  public.reservar_miniatura(uuid),public.finalizar_miniatura(bigint,uuid,text,timestamptz,text),
  public.revisar_miniaturas() to service_role;
revoke all on function app_private.registrar_status_os(),app_private.registrar_observacao_os(),
  app_private.exigir_motivo_cancelamento(),app_private.avisar_admin(),
  app_private.enfileirar_modelo(text),app_private.enfileirar_moto(),app_private.chave_modelo(text)
  from public,anon,authenticated;
grant execute on function app_private.chave_modelo(text) to service_role;

drop trigger capture_order_status on public.ordem_servico;
create trigger registrar_status_os after update of status on public.ordem_servico
  for each row when(old.status is distinct from new.status) execute function app_private.registrar_status_os();
drop trigger capture_order_observation on public.ordem_servico;
create trigger registrar_observacao_os after update of observacoes on public.ordem_servico
  for each row when(old.observacoes is distinct from new.observacoes) execute function app_private.registrar_observacao_os();
drop trigger require_cancellation_reason on public.ordem_servico;
create trigger exigir_motivo_cancelamento before update of status on public.ordem_servico
  for each row when(old.status is distinct from new.status) execute function app_private.exigir_motivo_cancelamento();
drop trigger notify_admin_order on public.ordem_servico;
create trigger avisar_admin after insert or update of status on public.ordem_servico
  for each row execute function app_private.avisar_admin();
drop trigger enqueue_motorcycle_on_order on public.ordem_servico;
create trigger enfileirar_moto_os after insert or update of id_moto on public.ordem_servico
  for each row execute function app_private.enfileirar_moto();
drop trigger enqueue_motorcycle_on_model on public.moto;
create trigger enfileirar_moto_modelo after update of modelo on public.moto
  for each row when(old.modelo is distinct from new.modelo) execute function app_private.enfileirar_moto();

-- Os originais ficam congelados até a retirada, impedindo escritas pelo servidor antigo.
revoke all on public.os_auditoria,public.order_status_history,public.order_observation_history from service_role;
alter sequence public.admin_notifications_id_seq rename to admin_notify_id_seq;
alter sequence public.client_admin_audit_id_seq rename to cliente_historico_id_seq;
alter sequence public.motorcycle_thumbnail_jobs_id_seq rename to miniaturas_motos_id_seq;
alter table public.admin_notify rename constraint admin_notifications_pkey to admin_notify_pkey;
alter table public.admin_notify rename constraint admin_notifications_order_id_fkey to admin_notify_os_fk;
alter index public.admin_notifications_recent_idx rename to admin_notify_data_idx;
alter table public.admin_leitura rename constraint admin_notification_receipts_pkey to admin_leitura_pkey;
alter table public.admin_leitura rename constraint admin_notification_receipts_notification_id_fkey to admin_leitura_aviso_fk;
alter table public.admin_leitura rename constraint admin_notification_receipts_admin_user_id_fkey to admin_leitura_usuario_fk;
alter index public.admin_notification_receipts_admin_idx rename to admin_leitura_usuario_idx;
alter table public.cliente_historico rename constraint client_admin_audit_pkey to cliente_historico_pkey;
alter table public.cliente_historico rename constraint client_admin_audit_client_id_fkey to cliente_historico_cliente_fk;
alter table public.cliente_historico rename constraint client_admin_audit_reason_check to cliente_historico_motivo_check;
alter table public.miniaturas_motos rename constraint motorcycle_thumbnail_jobs_pkey to miniaturas_motos_pkey;
alter table public.miniaturas_motos rename constraint motorcycle_thumbnail_jobs_model_key_key to miniaturas_motos_chave_key;
notify pgrst,'reload schema';

-- 20261030121500_adaptar_consulta_temporal.sql
-- Autorizado: adaptar somente a consulta ao histórico unificado.
-- Corpo real preservado; nenhuma tabela do mecânico é alterada.

CREATE OR REPLACE FUNCTION public.gerar_notificacoes_temporais(p_limite_atraso interval DEFAULT '30 days'::interval)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_agora timestamp := now() at time zone 'America/Sao_Paulo';
  v_hoje  date      := (now() at time zone 'America/Sao_Paulo')::date;
  r        record;
  v_pronto date;
  v_ag int := 0; v_prazo int := 0; v_atraso int := 0; v_pronta int := 0; v_sem_hist int := 0;
begin
  -- 4) Agendamento confirmado que começa em até 24h
  for r in
    select a.id_agendamento, a.data_hora,
           public.mecanico_do_agendamento(a.id_agendamento) as id_mecanico,
           c.nome as cliente, mo.modelo
    from public.agendamento a
    join public.cliente c  on c.id_cliente = a.id_cliente
    join public.moto    mo on mo.id_moto   = a.id_moto
    where a.status = 'confirmado'
      and a.data_hora >  v_agora
      and a.data_hora <= v_agora + interval '24 hours'
  loop
    if public.criar_notificacao_mecanico(
         r.id_mecanico, null, r.id_agendamento, 'agendamento', 'agendamento_proximo',
         'Agendamento próximo',
         'O agendamento AG-' || lpad(r.id_agendamento::text, 5, '0') || ' de ' || r.cliente ||
           ' (' || r.modelo || ') é em ' || to_char(r.data_hora, 'DD/MM/YYYY') || ' às ' ||
           to_char(r.data_hora, 'HH24:MI') || '.',
         'agendamento_proximo:' || r.id_agendamento || ':' || coalesce(r.id_mecanico::text, 'sem')
       ) then v_ag := v_ag + 1; end if;
  end loop;

  -- 5) Prazo de entrega em até 1h (OS em andamento)
  for r in
    select os.id_os, os.id_mecanico, os.previsao_entrega, mo.modelo, c.nome as cliente
    from public.ordem_servico os
    join public.moto    mo on mo.id_moto   = os.id_moto
    join public.cliente c  on c.id_cliente = mo.id_cliente
    where os.status = 'em andamento'
      and os.previsao_entrega is not null
      and public.prazo_efetivo(os.previsao_entrega) >  v_agora
      and public.prazo_efetivo(os.previsao_entrega) <= v_agora + interval '1 hour'
  loop
    if public.criar_notificacao_mecanico(
         r.id_mecanico, r.id_os, null, 'servico', 'prazo_proximo',
         'Prazo de entrega próximo',
         'O prazo de entrega da OS #' || r.id_os || ' (' || r.modelo || ', ' || r.cliente ||
           ') termina em ' || public.formatar_prazo(r.previsao_entrega) || '.',
         'prazo_proximo:' || r.id_os || ':' || to_char(r.previsao_entrega, 'YYYYMMDDHH24MI')
       ) then v_prazo := v_prazo + 1; end if;
  end loop;

  -- 6) OS atrasada (prazo expirado e ainda não pronta/entregue/cancelada)
  for r in
    select os.id_os, os.id_mecanico, os.previsao_entrega, mo.modelo, c.nome as cliente
    from public.ordem_servico os
    join public.moto    mo on mo.id_moto   = os.id_moto
    join public.cliente c  on c.id_cliente = mo.id_cliente
    where os.status in ('aguardando', 'em andamento', 'aguardando peça')
      and os.previsao_entrega is not null
      and public.prazo_efetivo(os.previsao_entrega) <  v_agora
      and public.prazo_efetivo(os.previsao_entrega) >= v_agora - p_limite_atraso
  loop
    if public.criar_notificacao_mecanico(
         r.id_mecanico, r.id_os, null, 'servico', 'os_atrasada',
         'OS atrasada',
         'O prazo de entrega da OS #' || r.id_os || ' (' || r.modelo || ', ' || r.cliente ||
           ') foi ultrapassado em ' || public.formatar_prazo(r.previsao_entrega) || '.',
         'os_atrasada:' || r.id_os || ':' || to_char(r.previsao_entrega, 'YYYYMMDDHH24MI')
       ) then v_atraso := v_atraso + 1; end if;
  end loop;

  -- 7) Moto pronta há mais de 3 dias úteis e não retirada
  if to_regclass('public.os_historico') is null then
    raise warning 'os_historico ausente: item 7 não pode ser calculado.';
  else
    for r in
      select os.id_os, os.id_mecanico, mo.modelo, c.nome as cliente,
             (select max(h.criado_em)
                from public.os_historico h
               where h.id_os = os.id_os
                 and h.tipo = 'status'
                 and lower(h.novo) in ('pronto', 'pronta')) as pronto_em
      from public.ordem_servico os
      join public.moto    mo on mo.id_moto   = os.id_moto
      join public.cliente c  on c.id_cliente = mo.id_cliente
      where os.status = 'pronto'
    loop
      if r.pronto_em is null then
        -- Sem histórico não se estima pela previsão: registra e segue.
        insert into public.notificacao_sem_destinatario (evento, id_os, motivo, chave)
        values ('moto_pronta', r.id_os, 'sem_data_pronto', 'moto_pronta:' || r.id_os || ':sem_data_pronto')
        on conflict (chave) do nothing;
        v_sem_hist := v_sem_hist + 1;
        continue;
      end if;

      v_pronto := (r.pronto_em at time zone 'America/Sao_Paulo')::date;
      if public.dias_uteis_apos(v_pronto, v_hoje) > 3 then
        if public.criar_notificacao_mecanico(
             r.id_mecanico, r.id_os, null, 'servico', 'moto_pronta_nao_retirada',
             'Moto pronta não retirada',
             'A moto da OS #' || r.id_os || ' (' || r.modelo || ', ' || r.cliente ||
               ') está pronta desde ' || to_char(v_pronto, 'DD/MM/YYYY') ||
               ' e ainda não foi retirada.',
             'moto_pronta:' || r.id_os
           ) then v_pronta := v_pronta + 1; end if;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'agendamento_proximo', v_ag, 'prazo_proximo', v_prazo,
    'os_atrasada', v_atraso, 'moto_pronta_nao_retirada', v_pronta,
    'moto_pronta_sem_data', v_sem_hist
  );
end;
$function$
;
notify pgrst,'reload schema';

-- 20261030122000_retirar_estruturas_antigas.sql
-- Executar somente após a transição e sua validação. API e workers ainda parados.

lock table public.os_auditoria,public.order_status_history,public.order_observation_history,
  public.order_observation_migration_backup,public.os_historico in access exclusive mode;
select app_private.conferir_historico();

-- Não transportar dependentes externos para um arquivo privado sem revisão.
do $$
begin
  if exists (
    select 1 from pg_catalog.pg_depend d
      join pg_catalog.pg_rewrite r on d.classid='pg_catalog.pg_rewrite'::regclass and r.oid=d.objid
    where d.refclassid='pg_catalog.pg_class'::regclass
      and d.refobjid in ('public.os_auditoria'::regclass,'public.order_status_history'::regclass,'public.order_observation_history'::regclass,'public.order_observation_migration_backup'::regclass)
      and r.ev_class<>d.refobjid
  ) or exists (
    select 1 from pg_catalog.pg_constraint where contype='f'
      and confrelid in ('public.os_auditoria'::regclass,'public.order_status_history'::regclass,'public.order_observation_history'::regclass,'public.order_observation_migration_backup'::regclass)
  ) then raise exception 'Dependências externas no histórico: revisar antes de retirar'; end if;
end $$;

-- Não se apagam os dados de origem. Saem do schema operacional e ficam privados.
create schema recuperacao;
revoke all on schema recuperacao from public,anon,authenticated,service_role;
alter table public.os_auditoria set schema recuperacao;
alter table public.order_status_history set schema recuperacao;
alter table recuperacao.order_status_history rename to os_status;
alter table public.order_observation_history set schema recuperacao;
alter table recuperacao.order_observation_history rename to os_observacao;
-- Conferência integral antes/depois de retirar o backup do schema operacional.
do $$
declare antes jsonb; depois jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id_os',order_id,'texto',original_body,'salvo_em',saved_at) order by order_id),'[]'::jsonb)
    into antes from public.order_observation_migration_backup;
  alter table public.order_observation_migration_backup set schema recuperacao;
  alter table recuperacao.order_observation_migration_backup rename to os_backup;
  alter table recuperacao.os_backup rename column order_id to id_os;
  alter table recuperacao.os_backup rename column original_body to texto;
  alter table recuperacao.os_backup rename column saved_at to salvo_em;
  select coalesce(jsonb_agg(jsonb_build_object('id_os',id_os,'texto',texto,'salvo_em',salvo_em) order by id_os),'[]'::jsonb)
    into depois from recuperacao.os_backup;
  if antes is distinct from depois then raise exception 'Conteúdo do backup não preservado'; end if;
end $$;
revoke all on all tables in schema recuperacao from public,anon,authenticated,service_role;
revoke all on all sequences in schema recuperacao from public,anon,authenticated,service_role;

-- O backup não é conteúdo visível. Seus campos seguem o dicionário em português.
alter table recuperacao.os_observacao drop constraint order_observation_history_kind_check;
alter table recuperacao.os_observacao rename column order_id to id_os;
alter table recuperacao.os_observacao rename column kind to tipo;
alter table recuperacao.os_observacao rename column body to texto;
alter table recuperacao.os_observacao rename column actor_user_id to id_usuario;
alter table recuperacao.os_observacao rename column created_at to criado_em;
update recuperacao.os_observacao set tipo=case tipo
  when 'previous_observation' then 'observacao_anterior'
  when 'status_note' then 'nota_status' else tipo end;
alter table recuperacao.os_observacao add constraint os_observacao_tipo_check
  check(tipo in ('observacao_anterior','nota_status'));
-- RESTRICT é intencional. Dependências externas impedem a retirada; nunca CASCADE.
drop function app_private.conferir_historico();
drop function public.admin_order_status(integer,text,text,uuid);
drop function public.admin_order_edit(integer,text,text,text,text,text,text,integer,text,text,text,uuid);
drop function public.admin_order_delete(integer,uuid,text);
drop function public.admin_client_archive(integer,uuid,text);
drop function public.claim_motorcycle_thumbnail_job(uuid);
drop function public.finish_motorcycle_thumbnail_job(bigint,uuid,text,timestamptz,text);
drop function public.scan_motorcycle_thumbnail_jobs();
drop function app_private.capture_order_status();
drop function app_private.capture_order_observation();
drop function app_private.capture_admin_order_notification();
drop function app_private.require_cancellation_reason();
drop function app_private.enqueue_order_motorcycle();
drop function app_private.enqueue_motorcycle_model(text);
drop function app_private.motorcycle_model_key(text);
notify pgrst,'reload schema';

commit;
