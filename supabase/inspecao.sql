-- SOMENTE LEITURA. Executar antes de solicitar a aplicação no banco real.
-- Não consulta linhas de auth.users nem configurações ou chaves do projeto.
begin read only;
-- Quantidade e impressão do conteúdo sem retornar dados pessoais das linhas.
-- A impressão usa todos os registros; em bases grandes, executar na janela de leitura.
with alvos(nome) as (select unnest(array[
  'admin_notifications','admin_notification_receipts','client_admin_audit','motorcycle_thumbnail_jobs',
  'order_admin_audit','order_status_history','order_observation_history','order_observation_migration_backup','pagamento_os',
  'admin_aviso','admin_leitura','cliente_historico','moto_miniatura','os_historico','os_status','os_observacao'
]))
select nome,query_to_xml(format(
  'select count(*) as quantidade,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' order by md5(to_jsonb(t)::text)),'''')) as impressao from public.%I t',nome
),true,true,'') as resumo
from alvos where to_regclass(format('public.%I',nome)) is not null order by nome;

select table_schema,table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns
where table_schema='public' and table_name in (
  'admin_notifications','admin_notification_receipts','client_admin_audit',
  'motorcycle_thumbnail_jobs','order_admin_audit','order_status_history',
  'order_observation_history','order_observation_migration_backup','pagamento_os',
  'admin_aviso','admin_leitura','cliente_historico','moto_miniatura','os_historico','os_status','os_observacao'
) order by table_name,ordinal_position;

select n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl,
  a.attname,a.attacl
from pg_class c join pg_namespace n on n.oid=c.relnamespace
left join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped and a.attacl is not null
where n.nspname='public' and c.relkind='r' and c.relname in (
  'admin_notifications','admin_notification_receipts','client_admin_audit','motorcycle_thumbnail_jobs',
  'order_admin_audit','order_status_history','order_observation_history','order_observation_migration_backup','pagamento_os',
  'admin_aviso','admin_leitura','cliente_historico','moto_miniatura','os_historico','os_status','os_observacao'
) order by c.relname,a.attname;

select c.conrelid::regclass as tabela,c.conname,pg_get_constraintdef(c.oid) as definicao
from pg_constraint c where c.conrelid in (
  select oid from pg_class where relnamespace='public'::regnamespace and relname in (
    'admin_notifications','admin_notification_receipts','client_admin_audit','motorcycle_thumbnail_jobs',
    'order_admin_audit','order_status_history','order_observation_history','order_observation_migration_backup','pagamento_os',
    'admin_aviso','admin_leitura','cliente_historico','moto_miniatura','os_historico','os_status','os_observacao'
  )
) order by 1,2;

select schemaname,tablename,indexname,indexdef from pg_indexes
where schemaname='public' and tablename in (
  'admin_notifications','admin_notification_receipts','client_admin_audit','motorcycle_thumbnail_jobs',
  'order_admin_audit','order_status_history','order_observation_history','order_observation_migration_backup','pagamento_os',
  'admin_aviso','admin_leitura','cliente_historico','moto_miniatura','os_historico','os_status','os_observacao'
) order by tablename,indexname;

select p.oid::regprocedure as funcao,pg_get_functiondef(p.oid) as definicao,p.proacl as permissoes
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','app_private') and p.proname in (
  'admin_order_status','admin_order_edit','admin_order_delete','admin_client_archive',
  'claim_motorcycle_thumbnail_job','finish_motorcycle_thumbnail_job','scan_motorcycle_thumbnail_jobs',
  'capture_order_status','capture_order_observation','capture_admin_order_notification',
  'require_cancellation_reason','enqueue_order_motorcycle','enqueue_motorcycle_model','motorcycle_model_key'
) order by 1;

select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename in (
  'admin_notifications','admin_notification_receipts','client_admin_audit','motorcycle_thumbnail_jobs',
  'order_admin_audit','order_status_history','order_observation_history','order_observation_migration_backup','pagamento_os',
  'admin_aviso','admin_leitura','cliente_historico','moto_miniatura','os_historico','os_status','os_observacao'
) order by tablename,policyname;

select tgrelid::regclass as tabela,tgname,pg_get_triggerdef(oid) as definicao
from pg_trigger where not tgisinternal and tgrelid in ('public.ordem_servico'::regclass,'public.moto'::regclass);

-- Dependentes externos devem ser avaliados. Não serão apagados por CASCADE.
select distinct refobjid::regclass as tabela,pg_describe_object(classid,objid,objsubid) as dependente
from pg_depend where refclassid='pg_class'::regclass and refobjid in (
  select oid from pg_class where relnamespace='public'::regnamespace and relname in (
    'admin_notifications','admin_notification_receipts','client_admin_audit','motorcycle_thumbnail_jobs',
    'order_admin_audit','order_status_history','order_observation_history','order_observation_migration_backup',
    'admin_aviso','admin_leitura','cliente_historico','moto_miniatura','os_historico','os_status','os_observacao'
  )
) order by 1,2;
commit;

-- Distribuição dos tipos/estados, nas tabelas efetivamente encontradas.
begin read only;
with alvos(nome,coluna) as (values
 ('admin_notifications','kind'),('admin_aviso','kind'),
 ('client_admin_audit','action'),('cliente_historico','action'),
 ('motorcycle_thumbnail_jobs','status'),('moto_miniatura','status'),
 ('order_admin_audit','action'),('os_historico','action'),
 ('order_observation_history','kind'),('os_observacao','kind')
)
select nome,query_to_xml(format('select %I as tipo,count(*) as quantidade from public.%I group by 1 order by 1',coluna,nome),true,true,'') as resumo
from alvos where exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=nome and c.column_name=coluna)
order by nome;
commit;
-- Não executar SQL das migrations como forma de descobrir o estado do banco.
