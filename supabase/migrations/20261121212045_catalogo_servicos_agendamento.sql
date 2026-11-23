begin;
set local lock_timeout = '10s';
set local statement_timeout = '90s';
lock table public.oficina_painel, public.agendamento in access exclusive mode;

do $$
declare catalogo jsonb; agenda jsonb;
begin
  select dados into catalogo from public.oficina_painel where chave='catalogo';
  select dados into agenda from public.oficina_painel where chave='agenda';
  if catalogo is null or jsonb_typeof(catalogo->'servicos') <> 'array'
    or jsonb_typeof(catalogo->'categorias') <> 'array' then
    raise exception 'O catalogo atual nao possui o formato esperado; nenhuma tabela foi alterada';
  end if;
  if coalesce(jsonb_array_length(agenda),0) > 0 then
    raise exception 'A chave agenda ainda possui registros; migre-os para agendamento antes de continuar';
  end if;
end $$;

create table public.categorias_servico (
  id text primary key,
  nome text not null check (length(trim(nome)) between 1 and 150),
  descricao text not null default '',
  cor text not null check (cor ~ '^#[A-Fa-f0-9]{6}$'),
  icone text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.servicos (
  id text primary key,
  nome text not null check (length(trim(nome)) between 1 and 150),
  categoria_id text not null references public.categorias_servico(id) on update cascade on delete restrict,
  descricao text not null default '',
  preco numeric(12,2) not null check (preco >= 0),
  custo numeric(12,2) not null check (custo >= 0),
  duracao text not null default '',
  ativo boolean not null default true,
  icone text not null default '',
  adicional text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index servicos_categoria_ativo_idx on public.servicos(categoria_id,ativo,nome);
create index servicos_nome_idx on public.servicos using gin (to_tsvector('simple',nome));

create table public.servicos_catalogo_versao (
  id boolean primary key default true check (id),
  versao integer not null check (versao > 0),
  atualizado_em timestamptz not null default now()
);

insert into public.categorias_servico (id,nome,descricao,cor,icone)
select categoria->>'id',categoria->>'nome',coalesce(categoria->>'descricao',''),
       categoria->>'cor',coalesce(categoria->>'icone','')
from public.oficina_painel p
cross join lateral jsonb_array_elements(p.dados->'categorias') categoria
where p.chave='catalogo';

insert into public.servicos
  (id,nome,categoria_id,descricao,preco,custo,duracao,ativo,icone,adicional)
select servico->>'id',servico->>'nome',servico->>'categoriaId',
       coalesce(servico->>'descricao',''),(servico->>'preco')::numeric,
       (servico->>'custo')::numeric,coalesce(servico->>'duracao',''),
       coalesce((servico->>'ativo')::boolean,true),coalesce(servico->>'icone',''),
       coalesce(servico->>'adicional','')
from public.oficina_painel p
cross join lateral jsonb_array_elements(p.dados->'servicos') servico
where p.chave='catalogo';

insert into public.servicos_catalogo_versao(id,versao,atualizado_em)
select true,versao,atualizado_em from public.oficina_painel where chave='catalogo';

do $$
declare quantidade_servicos integer; quantidade_categorias integer;
begin
  select count(*) into quantidade_servicos from public.servicos;
  select count(*) into quantidade_categorias from public.categorias_servico;
  if quantidade_servicos <> jsonb_array_length(
    (select dados->'servicos' from public.oficina_painel where chave='catalogo')) then
    raise exception 'A migracao do catalogo nao preservou todos os servicos';
  end if;
  if quantidade_categorias <> jsonb_array_length(
    (select dados->'categorias' from public.oficina_painel where chave='catalogo')) then
    raise exception 'A migracao do catalogo nao preservou todas as categorias';
  end if;
end $$;

create function public.substituir_catalogo_servicos(
  p_versao integer,
  p_categorias jsonb,
  p_servicos jsonb,
  p_actor uuid
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare versao_atual integer;
begin
  if jsonb_typeof(p_categorias) <> 'array' or jsonb_typeof(p_servicos) <> 'array'
    or jsonb_array_length(p_categorias) > 1000 or jsonb_array_length(p_servicos) > 10000 then
    raise exception using errcode='22023',message='Formato de catalogo invalido';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_categorias) item
    group by item->>'id' having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(p_servicos) item
    group by item->>'id' having count(*) > 1
  ) then
    raise exception using errcode='22023',message='IDs duplicados no catalogo';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_servicos) item
    where not exists (
      select 1 from jsonb_array_elements(p_categorias) categoria
      where categoria->>'id'=item->>'categoria_id'
    )
  ) then
    raise exception using errcode='23503',message='Servico aponta para categoria inexistente';
  end if;

  select versao into versao_atual
  from public.servicos_catalogo_versao where id=true for update;
  if versao_atual is distinct from p_versao then
    raise exception using errcode='40001',message='Catalogo atualizado por outra sessao';
  end if;

  insert into public.categorias_servico(id,nome,descricao,cor,icone,atualizado_em)
  select item.id,item.nome,item.descricao,item.cor,item.icone,now()
  from jsonb_to_recordset(p_categorias) as item(
    id text,nome text,descricao text,cor text,icone text
  )
  on conflict(id) do update set nome=excluded.nome,descricao=excluded.descricao,
    cor=excluded.cor,icone=excluded.icone,atualizado_em=now();

  delete from public.servicos s where not exists (
    select 1 from jsonb_array_elements(p_servicos) item where item->>'id'=s.id
  );
  insert into public.servicos
    (id,nome,categoria_id,descricao,preco,custo,duracao,ativo,icone,adicional,atualizado_em)
  select item.id,item.nome,item.categoria_id,item.descricao,item.preco,item.custo,
         item.duracao,item.ativo,item.icone,item.adicional,now()
  from jsonb_to_recordset(p_servicos) as item(
    id text,nome text,categoria_id text,descricao text,preco numeric,custo numeric,
    duracao text,ativo boolean,icone text,adicional text
  )
  on conflict(id) do update set nome=excluded.nome,categoria_id=excluded.categoria_id,
    descricao=excluded.descricao,preco=excluded.preco,custo=excluded.custo,
    duracao=excluded.duracao,ativo=excluded.ativo,icone=excluded.icone,
    adicional=excluded.adicional,atualizado_em=now();

  delete from public.categorias_servico c where not exists (
    select 1 from jsonb_array_elements(p_categorias) item where item->>'id'=c.id
  );
  update public.servicos_catalogo_versao
  set versao=versao_atual+1,atualizado_em=now() where id=true;
  insert into public.logs(id_usuario,evento,categoria,entidade,entidade_id,acao,dados,resumo)
  values(p_actor,'catalogo_servicos_atualizado','atividade','servicos','catalogo','editar',
    jsonb_build_object('versao_anterior',versao_atual,'versao_nova',versao_atual+1,
      'quantidade_categorias',jsonb_array_length(p_categorias),
      'quantidade_servicos',jsonb_array_length(p_servicos)),
    'Catalogo de servicos atualizado');
  return versao_atual+1;
end;
$$;

revoke all on function public.substituir_catalogo_servicos(integer,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.substituir_catalogo_servicos(integer,jsonb,jsonb,uuid) to service_role;

alter table public.categorias_servico enable row level security;
alter table public.servicos enable row level security;
alter table public.servicos_catalogo_versao enable row level security;
revoke all on public.categorias_servico,public.servicos,public.servicos_catalogo_versao from public,anon,authenticated;
grant select,insert,update,delete on public.categorias_servico,public.servicos to service_role;
grant select on public.servicos_catalogo_versao to service_role;

alter table public.agendamento add column duracao text not null default '1 hora';
select setval(pg_get_serial_sequence('public.agendamento','id_agendamento')::regclass,
  coalesce((select max(id_agendamento) from public.agendamento),0)+1,false);

create function app_private.registrar_log_agendamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare ator uuid:=coalesce(nullif(current_setting('app.admin_actor',true),'')::uuid,auth.uid());
begin
  if tg_op='INSERT' then
    insert into public.logs(id_usuario,evento,categoria,entidade,entidade_id,acao,dados,resumo)
    values(ator,'agendamento_criado','atividade','agendamento',new.id_agendamento::text,'criar',
      jsonb_build_object('id_cliente',new.id_cliente,'id_moto',new.id_moto,
        'id_mecanico',new.id_mecanico,'data_hora',new.data_hora,'servico',new.servico_solicitado,
        'status',new.status,'duracao',new.duracao),'Agendamento criado');
    return new;
  elsif tg_op='UPDATE' then
    insert into public.logs(id_usuario,evento,categoria,entidade,entidade_id,acao,dados,resumo)
    values(ator,'agendamento_atualizado','atividade','agendamento',new.id_agendamento::text,'editar',
      jsonb_build_object('id_cliente_anterior',old.id_cliente,'id_cliente',new.id_cliente,
        'id_moto_anterior',old.id_moto,'id_moto',new.id_moto,
        'id_mecanico_anterior',old.id_mecanico,'id_mecanico',new.id_mecanico,
        'data_hora_anterior',old.data_hora,'data_hora',new.data_hora,
        'servico_anterior',old.servico_solicitado,'servico',new.servico_solicitado,
        'status_anterior',old.status,'status',new.status,
        'duracao_anterior',old.duracao,'duracao',new.duracao),'Agendamento atualizado');
    return new;
  end if;
  insert into public.logs(id_usuario,evento,categoria,entidade,entidade_id,acao,dados,resumo)
  values(ator,'agendamento_removido','atividade','agendamento',old.id_agendamento::text,'excluir',
    jsonb_build_object('id_cliente',old.id_cliente,'id_moto',old.id_moto,
      'id_mecanico',old.id_mecanico,'data_hora',old.data_hora,'servico',old.servico_solicitado,
      'status',old.status,'duracao',old.duracao),'Agendamento removido');
  return old;
end;
$$;
revoke all on function app_private.registrar_log_agendamento() from public,anon,authenticated;
grant execute on function app_private.registrar_log_agendamento() to service_role;
create trigger logs_agendamento after insert or update or delete on public.agendamento
for each row execute function app_private.registrar_log_agendamento();

create function public.criar_agendamento_admin(
  p_cliente integer,p_moto integer,p_mecanico integer,p_data_hora timestamp,
  p_servico text,p_observacoes text,p_duracao text,p_status text,p_actor uuid
) returns integer
language plpgsql security definer set search_path = '' as $$
declare novo_id integer;
begin
  perform set_config('app.admin_actor',p_actor::text,true);
  insert into public.agendamento
    (id_cliente,id_moto,id_mecanico,data_hora,servico_solicitado,problema_descricao,
     observacoes,duracao,status)
  values(p_cliente,p_moto,p_mecanico,p_data_hora,p_servico,'',p_observacoes,p_duracao,p_status)
  returning id_agendamento into novo_id;
  return novo_id;
end;
$$;

create function public.editar_agendamento_admin(
  p_id integer,p_cliente integer,p_moto integer,p_mecanico integer,p_data_hora timestamp,
  p_servico text,p_observacoes text,p_duracao text,p_status text,p_actor uuid
) returns integer
language plpgsql security definer set search_path = '' as $$
declare alterado_id integer;
begin
  perform set_config('app.admin_actor',p_actor::text,true);
  update public.agendamento set id_cliente=p_cliente,id_moto=p_moto,id_mecanico=p_mecanico,
    data_hora=p_data_hora,servico_solicitado=p_servico,observacoes=p_observacoes,
    duracao=p_duracao,status=p_status
  where id_agendamento=p_id returning id_agendamento into alterado_id;
  if alterado_id is null then
    raise exception using errcode='P0002',message='Agendamento nao encontrado';
  end if;
  return alterado_id;
end;
$$;

create function public.excluir_agendamento_admin(p_id integer,p_actor uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare removido integer;
begin
  perform set_config('app.admin_actor',p_actor::text,true);
  delete from public.agendamento where id_agendamento=p_id
  returning id_agendamento into removido;
  return removido is not null;
end;
$$;
revoke all on function public.criar_agendamento_admin(integer,integer,integer,timestamp,text,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.editar_agendamento_admin(integer,integer,integer,integer,timestamp,text,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.excluir_agendamento_admin(integer,uuid) from public,anon,authenticated;
grant execute on function public.criar_agendamento_admin(integer,integer,integer,timestamp,text,text,text,text,uuid) to service_role;
grant execute on function public.editar_agendamento_admin(integer,integer,integer,integer,timestamp,text,text,text,text,uuid) to service_role;
grant execute on function public.excluir_agendamento_admin(integer,uuid) to service_role;

drop table public.oficina_painel;
comment on table public.servicos is 'Catalogo de servicos ativos e inativos da oficina.';
comment on table public.categorias_servico is 'Categorias do catalogo de servicos.';
comment on table public.agendamento is 'Agendamentos vinculados a clientes, motos e mecanicos cadastrados.';
notify pgrst,'reload schema';
commit;
