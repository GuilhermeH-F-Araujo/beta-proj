begin;
set local lock_timeout = '10s';
set local statement_timeout = '90s';
lock table public.seguranca_auditoria,public.os_historico,public.cliente_historico,
  public.admin_solicitacao,public.funcionario_nota,public.cargo_acesso,public.cargo_vinculo,
  public.cargo_historico,recuperacao.os_auditoria,recuperacao.os_status,
  recuperacao.os_observacao,recuperacao.os_backup in access exclusive mode;

-- The security audit becomes the single append-only event store.
alter table public.seguranca_auditoria rename to logs;
alter sequence public.seguranca_auditoria_id_seq rename to logs_id_seq;
alter table public.logs rename constraint seguranca_auditoria_pkey to logs_pkey;
alter table public.logs
  add column categoria text not null default 'seguranca',
  add column entidade text,
  add column entidade_id text,
  add column id_os integer,
  add column id_cliente integer,
  add column nome text,
  add column tipo text,
  add column acao text,
  add column motivo text,
  add column anterior text,
  add column novo text,
  add column texto text,
  add column dados jsonb not null default '{}'::jsonb,
  add column origem text,
  add column id_origem bigint,
  add column origem_tabela text,
  add column id_origem_tabela bigint,
  add column id_auditoria bigint,
  add column metodo text,
  add column rota text,
  add column status_http integer,
  add column ip inet,
  add column user_agent text,
  add column request_id uuid,
  add column resumo text,
  add column ator_nome text,
  add column ator_cargo text,
  add column alvo_nome text,
  add column dia date generated always as ((criado_em at time zone 'America/Sao_Paulo')::date) stored;
alter table public.logs add constraint logs_categoria_check
  check (categoria in ('seguranca','atividade','requisicao'));
alter table public.logs add constraint logs_status_http_check
  check (status_http is null or status_http between 100 and 599);
alter table public.logs alter column evento set default 'atividade_registrada';
create index logs_criado_em_idx on public.logs(criado_em desc,id desc);
create index logs_dia_idx on public.logs(dia desc,id desc);
create index logs_categoria_idx on public.logs(categoria,criado_em desc,id desc);
create index logs_entidade_idx on public.logs(entidade,entidade_id,criado_em desc,id desc);
create index logs_ator_idx on public.logs(id_usuario,criado_em desc,id desc);
create unique index logs_origem_idx on public.logs(entidade,origem,id_origem)
  where origem is not null and id_origem is not null;
alter table public.logs enable row level security;
revoke all on public.logs from public,anon,authenticated,service_role;
grant select,insert on public.logs to service_role;
grant usage,select on sequence public.logs_id_seq to service_role;

create function app_private.preencher_identidade_log() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.entidade is null and new.id_os is not null then
    new.categoria:='atividade';
    new.entidade:='ordem_servico';
    new.entidade_id:=new.id_os::text;
  elsif new.entidade is null and new.id_cliente is not null then
    new.categoria:='atividade';
    new.entidade:='cliente';
    new.entidade_id:=new.id_cliente::text;
  end if;
  if new.evento='atividade_registrada' then
    new.evento:=coalesce(new.tipo,new.acao,'atividade_registrada');
  end if;
  if new.resumo is null then
    new.resumo:=case
      when new.entidade='ordem_servico' and new.tipo='status' then 'Status da OS alterado'
      when new.entidade='ordem_servico' and new.tipo='edicao' then 'OS editada'
      when new.entidade='ordem_servico' and new.tipo='exclusao' then 'OS excluida'
      when new.entidade='cliente' then 'Cliente arquivado'
      else new.evento end;
  end if;
  if new.id_usuario is not null and (new.ator_nome is null or new.ator_cargo is null) then
    select f.nome,f.cargo into new.ator_nome,new.ator_cargo
      from public.funcionario f where f.auth_user_id=new.id_usuario;
  end if;
  if new.alvo is not null and new.alvo_nome is null then
    select f.nome into new.alvo_nome from public.funcionario f where f.auth_user_id=new.alvo;
  end if;
  return new;
end $$;
create trigger logs_identidade before insert on public.logs
for each row execute function app_private.preencher_identidade_log();
update public.logs l set ator_nome=f.nome,ator_cargo=f.cargo
from public.funcionario f where f.auth_user_id=l.id_usuario
  and (l.ator_nome is null or l.ator_cargo is null);

-- Preserve the existing OS/client history in logs before replacing the old tables.
insert into public.logs
  (id_usuario,evento,criado_em,categoria,entidade,entidade_id,id_os,tipo,
   anterior,novo,texto,dados,origem,id_origem,origem_tabela,id_origem_tabela,id_auditoria,resumo)
select h.id_usuario,h.tipo,h.criado_em,'atividade','ordem_servico',h.id_os::text,h.id_os,h.tipo,
       h.anterior,h.novo,h.texto,h.dados,h.origem,h.id_origem,'os_historico',h.id,h.id_auditoria,
       case h.tipo when 'status' then 'Status da OS alterado'
         when 'edicao' then 'OS editada' when 'exclusao' then 'OS excluida'
         when 'observacao_anterior' then 'Observacao anterior da OS registrada'
         when 'nota_status' then 'Nota de status da OS registrada'
         else 'Evento da OS registrado' end
from public.os_historico h;

insert into public.logs
  (id_usuario,evento,criado_em,categoria,entidade,entidade_id,id_cliente,nome,acao,motivo,dados,origem,id_origem,origem_tabela,id_origem_tabela,resumo)
select h.id_usuario,h.acao,h.criado_em,'atividade','cliente',h.id_cliente::text,h.id_cliente,
       h.nome,h.acao,h.motivo,jsonb_build_object('nome',h.nome),null,null,'cliente_historico',h.id,'Cliente arquivado'
from public.cliente_historico h;

-- Carry admin access requests and their final decisions into the event stream.
insert into public.logs
  (id_usuario,alvo,evento,criado_em,categoria,entidade,entidade_id,origem_tabela,dados,resumo)
select solicitado_por,id_usuario,
       case when estado='pendente' then 'administrador_solicitado'
            else 'solicitacao_administrador_'||estado end,
       solicitado_em,'seguranca','solicitacao_administrador',id_usuario::text,'admin_solicitacao',
       jsonb_build_object('estado',estado,'solicitado_por',solicitado_por,
         'solicitado_em',solicitado_em,'decidido_por',decidido_por,'decidido_em',decidido_em),
       'Solicitacao de acesso administrativo: '||estado
from public.admin_solicitacao;

do $$
begin
  if (select count(*) from public.logs where origem_tabela='os_historico') <>
     (select count(*) from public.os_historico) then
    raise exception 'Historico de OS nao foi preservado integralmente em logs';
  end if;
  if (select count(*) from public.logs where origem_tabela='cliente_historico') <>
     (select count(*) from public.cliente_historico) then
    raise exception 'Historico de clientes nao foi preservado integralmente em logs';
  end if;
  if (select count(*) from public.logs where origem_tabela='admin_solicitacao') <>
     (select count(*) from public.admin_solicitacao) then
    raise exception 'Solicitacoes administrativas nao foram preservadas integralmente em logs';
  end if;
  if exists(select 1 from public.cargo_vinculo) then
    raise exception 'Ha funcionarios ligados a cargos rejeitados; revise as permissoes antes de removelos';
  end if;
  if exists(select 1 from recuperacao.os_auditoria) or exists(select 1 from recuperacao.os_status)
    or exists(select 1 from recuperacao.os_observacao) or exists(select 1 from recuperacao.os_backup) then
    raise exception 'O arquivo de recuperacao possui dados; consolide-os em logs antes de remover';
  end if;
end $$;

-- The previous role tables had no active links. Preserve their seeded access policy by role.
create or replace function permissoes_privadas.pode_ler_ordem(p_moto integer) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); f record;
begin
 if u is null or not exists(select 1 from auth.users where id=u and (banned_until is null or banned_until<=now())) then return false; end if;
 select cargo,perfil_acesso,situacao into f from public.funcionario where auth_user_id=u;
 if found then
  if f.cargo='Administrador' and f.perfil_acesso='Administrador' then return true; end if;
  return f.situacao='ativo' and f.cargo in ('Gerente','Mecânico');
 end if;
 return exists(select 1 from public.moto m join public.cliente cli on cli.id_cliente=m.id_cliente
   where m.id_moto=p_moto and cli.auth_user_id=u and cli.excluido_em is null);
end $$;

-- Repoint stored procedures that wrote the former histories/audit table to logs.
do $$
declare func record; definicao text;
begin
  for func in
    select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','app_private') and p.prokind='f'
      and (pg_get_functiondef(p.oid) like '%public.os_historico%'
        or pg_get_functiondef(p.oid) like '%public.cliente_historico%'
        or pg_get_functiondef(p.oid) like '%public.seguranca_auditoria%')
  loop
    definicao:=pg_get_functiondef(func.oid);
    definicao:=replace(definicao,'public.os_historico','public.logs');
    definicao:=replace(definicao,'public.cliente_historico','public.logs');
    definicao:=replace(definicao,'public.seguranca_auditoria','public.logs');
    execute definicao;
  end loop;
end $$;

create or replace function public.consultar_nivel_administrativo(p_usuario uuid)
returns text language sql security definer set search_path='' as $$
  select coalesce(a.nivel,'administrador')
  from public.funcionario f
  join auth.users u on u.id=f.auth_user_id
  left join public.admin_autoridade a on a.id_usuario=f.auth_user_id
  where f.auth_user_id=p_usuario and f.cargo='Administrador' and f.perfil_acesso='Administrador'
    and coalesce(f.situacao,'ativo')='ativo'
    and (u.banned_until is null or u.banned_until<now())
    and coalesce((select l.dados->>'estado' from public.logs l
      where l.entidade='solicitacao_administrador' and l.entidade_id=p_usuario::text
      order by l.criado_em desc,l.id desc limit 1),'aprovado')='aprovado';
$$;
revoke all on function public.consultar_nivel_administrativo(uuid) from public,anon,authenticated;
grant execute on function public.consultar_nivel_administrativo(uuid) to service_role;

create or replace function app_private.proteger_funcionario_admin()
returns trigger language plpgsql security definer set search_path='' as $$
declare autor uuid; nivel_autor integer; nivel_alvo integer; pedido jsonb;
begin
  if tg_op='UPDATE' and row(old.cargo,old.perfil_acesso,old.auth_user_id,old.email,old.situacao)
    is not distinct from row(new.cargo,new.perfil_acesso,new.auth_user_id,new.email,new.situacao) then return new; end if;
  if (tg_op<>'DELETE' and old.cargo='Administrador' and old.perfil_acesso='Administrador')
    or (tg_op<>'INSERT' and new.cargo='Administrador' and new.perfil_acesso='Administrador') then
    perform pg_advisory_xact_lock(74120802);
    autor:=nullif(current_setting('app.admin_actor',true),'')::uuid;
    nivel_autor:=app_private.peso_admin(autor);
    if tg_op<>'INSERT' and old.cargo='Administrador' and old.perfil_acesso='Administrador' then
      select case nivel when 'dono' then 3 else 2 end into nivel_alvo
        from public.admin_autoridade where id_usuario=old.auth_user_id;
      nivel_alvo:=coalesce(nivel_alvo,1);
      if nivel_autor<=nivel_alvo then raise exception using errcode='42501',message='Este administrador exige uma autoridade superior.'; end if;
    end if;
    if tg_op<>'DELETE' and new.cargo='Administrador' and new.perfil_acesso='Administrador'
      and nivel_autor<3 and (tg_op='INSERT' or old.cargo<>'Administrador' or old.perfil_acesso<>'Administrador') then
      select l.dados into pedido from public.logs l
       where l.entidade='solicitacao_administrador' and l.entidade_id=new.auth_user_id::text
       order by l.criado_em desc,l.id desc limit 1;
      if tg_op<>'INSERT' or nivel_autor<1 or coalesce(pedido->>'estado','')<>'pendente'
        or pedido->>'solicitado_por' is distinct from autor::text then
        raise exception using errcode='42501',message='Somente o dono pode conceder administração.';
      end if;
    end if;
    if tg_op='DELETE' then return old; end if;
    if tg_op='UPDATE' and (new.cargo<>'Administrador' or new.perfil_acesso<>'Administrador') then
      delete from public.admin_autoridade where id_usuario=old.auth_user_id;
      delete from public.admin_confirmacao where id_usuario=old.auth_user_id;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

create or replace function public.registrar_funcionario_protegido(p_payload jsonb,p_actor uuid,p_completo boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare usuario uuid; papel text; cadastro integer; pendente boolean; agora timestamptz:=now();
begin
  perform pg_advisory_xact_lock(74120802);
  if app_private.peso_admin(p_actor)<1 then raise exception 'Acesso administrativo necessario'; end if;
  usuario:=coalesce(p_payload->>'id_usuario_autenticacao',p_payload->>'authUserId')::uuid;
  papel:=coalesce(p_payload->>'cargo',p_payload->>'profile');
  pendente:=papel='Administrador' and app_private.peso_admin(p_actor)<3;
  perform set_config('app.admin_actor',p_actor::text,true);
  if pendente then
    insert into public.logs(id_usuario,alvo,evento,criado_em,categoria,entidade,entidade_id,dados,resumo)
    values(p_actor,usuario,'administrador_solicitado',agora,'seguranca','solicitacao_administrador',usuario::text,
      jsonb_build_object('estado','pendente','solicitado_por',p_actor,'solicitado_em',agora,
        'decidido_por',null,'decidido_em',null),'Solicitacao de acesso administrativo');
  end if;
  if p_completo then cadastro:=public.cadastrar_funcionario(p_payload);
  else cadastro:=public.admin_register_employee(p_payload); end if;
  insert into public.logs(id_usuario,alvo,evento,categoria,entidade,entidade_id,dados,resumo)
  values(p_actor,usuario,'funcionario_cadastrado','atividade','funcionario',usuario::text,
    jsonb_build_object('approvalPending',pendente),
    case when pendente then 'Funcionario cadastrado; aguardando aprovacao administrativa'
      else 'Funcionario cadastrado' end);
  return jsonb_build_object('id',cadastro,'approvalPending',pendente);
end;
$$;
revoke all on function public.registrar_funcionario_protegido(jsonb,uuid,boolean) from public,anon,authenticated;
grant execute on function public.registrar_funcionario_protegido(jsonb,uuid,boolean) to service_role;

create or replace function public.decidir_administrador(p_actor uuid,p_alvo uuid,p_nivel text)
returns void language plpgsql security definer set search_path='' as $$
declare pedido jsonb; estado_atual text; agora timestamptz:=now();
begin
  perform pg_advisory_xact_lock(74120802);
  if app_private.peso_admin(p_actor)<>3 then raise exception using errcode='42501',message='Somente o dono pode aprovar administradores.'; end if;
  if p_nivel not in ('administrador','superadministrador','recusado') or p_alvo=p_actor then raise exception 'Decisao invalida'; end if;
  if exists(select 1 from public.admin_autoridade where id_usuario=p_alvo and nivel='dono') then raise exception 'O dono permanece protegido.'; end if;
  if not exists(select 1 from public.funcionario where auth_user_id=p_alvo and cargo='Administrador'
    and perfil_acesso='Administrador' and coalesce(situacao,'ativo')='ativo') then raise exception 'Selecione um administrador com cadastro ativo.'; end if;
  select l.dados into pedido from public.logs l where l.entidade='solicitacao_administrador'
    and l.entidade_id=p_alvo::text order by l.criado_em desc,l.id desc limit 1;
  if p_nivel='recusado' and pedido->>'estado' is distinct from 'pendente' then raise exception 'Nao ha solicitacao pendente.'; end if;
  estado_atual:=case when p_nivel='recusado' then 'recusado' else 'aprovado' end;
  if pedido is not null then
    insert into public.logs(id_usuario,alvo,evento,criado_em,categoria,entidade,entidade_id,dados,resumo)
    values(p_actor,p_alvo,'solicitacao_administrador_'||estado_atual,agora,'seguranca',
      'solicitacao_administrador',p_alvo::text,
      pedido||jsonb_build_object('estado',estado_atual,'decidido_por',p_actor,'decidido_em',agora),
      'Solicitacao de acesso administrativo: '||estado_atual);
  end if;
  delete from public.admin_autoridade where id_usuario=p_alvo;
  if p_nivel='superadministrador' then insert into public.admin_autoridade(id_usuario,nivel) values(p_alvo,'superadministrador'); end if;
  delete from public.admin_confirmacao where id_usuario=p_alvo;
  insert into public.logs(id_usuario,alvo,evento,categoria,entidade,entidade_id,resumo)
  values(p_actor,p_alvo,'nivel_'||p_nivel,'seguranca','conta',p_alvo::text,'Nivel administrativo definido: '||p_nivel);
end;
$$;
revoke all on function public.decidir_administrador(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.decidir_administrador(uuid,uuid,text) to service_role;

create or replace function public.finalizar_confirmacao_admin(
  p_usuario uuid,p_sessao uuid,p_tentativa uuid,p_sucesso boolean,p_hash text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare tentativa public.admin_tentativa; novas_falhas integer; bloqueio timestamptz;
begin
  select * into tentativa from public.admin_tentativa where id_usuario=p_usuario for update;
  if not found or tentativa.reserva is distinct from p_tentativa
    or tentativa.reservada_em<now()-interval '30 seconds' then
    return jsonb_build_object('confirmado',false,'espera',30);
  end if;
  update public.admin_tentativa set reserva=null,reservada_em=null where id_usuario=p_usuario;
  if p_sucesso is null then return jsonb_build_object('confirmado',false); end if;
  if p_sucesso then
    if p_hash is null or length(p_hash)<>64 then raise exception 'Confirmacao invalida'; end if;
    delete from public.admin_confirmacao where id_usuario=p_usuario and (id_sessao=p_sessao or expira_em<=now());
    insert into public.admin_confirmacao(hash,id_usuario,id_sessao,nivel)
      values(p_hash,p_usuario,p_sessao,public.consultar_nivel_administrativo(p_usuario));
    update public.admin_tentativa set falhas=0,bloqueado_ate=null,inicio_em=now() where id_usuario=p_usuario;
    insert into public.logs(id_usuario,alvo,evento,categoria,entidade,entidade_id,dados,resumo)
      values(p_usuario,p_usuario,'senha_confirmada','seguranca','conta',p_usuario::text,
        jsonb_build_object('sessao',p_sessao,'nivel',public.consultar_nivel_administrativo(p_usuario)),
        'Senha administrativa confirmada');
    return jsonb_build_object('confirmado',true);
  end if;
  novas_falhas:=tentativa.falhas+1;
  bloqueio:=case when novas_falhas>=5 then now()+interval '5 minutes' else null end;
  update public.admin_tentativa set falhas=novas_falhas,bloqueado_ate=bloqueio
    where id_usuario=p_usuario;
  delete from public.admin_confirmacao where id_usuario=p_usuario and id_sessao=p_sessao;
  insert into public.logs(id_usuario,alvo,evento,categoria,entidade,entidade_id,dados,resumo)
    values(p_usuario,p_usuario,'senha_confirmacao_incorreta','seguranca','conta',p_usuario::text,
      jsonb_build_object('sessao',p_sessao,'falhas',novas_falhas,'bloqueado_ate',bloqueio,
        'tentativas_restantes',greatest(0,5-novas_falhas)),
      case when bloqueio is null then 'Senha de confirmacao incorreta'
        else 'Conta temporariamente bloqueada apos falhas de confirmacao' end);
  return jsonb_build_object('confirmado',false,'restantes',greatest(0,5-novas_falhas),
    'espera',case when novas_falhas>=5 then 300 else 0 end);
end;
$$;
revoke all on function public.finalizar_confirmacao_admin(uuid,uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.finalizar_confirmacao_admin(uuid,uuid,uuid,boolean,text) to service_role;

drop table public.os_historico;
drop table public.cliente_historico;
drop table public.admin_solicitacao;

-- These features were not approved and have no active linked users.
drop function public.salvar_cargo_acesso(uuid,text,text,jsonb,boolean,integer[],integer,uuid);
insert into public.logs(id_usuario,evento,criado_em,categoria,entidade,entidade_id,dados,resumo)
select id_usuario,'cargo_permissao_alterado',criado_em,'atividade','cargo_acesso',id_cargo::text,dados,
  'Alteracao historica de cargo migrada para logs'
from public.cargo_historico;
do $$
begin
  if (select count(*) from public.logs where evento='cargo_permissao_alterado') <>
     (select count(*) from public.cargo_historico) then
    raise exception 'Historico dos cargos removidos nao foi preservado em logs';
  end if;
end $$;
drop table public.cargo_historico;
drop table public.cargo_vinculo;
drop table public.cargo_acesso;
insert into public.logs(id_usuario,evento,categoria,entidade,entidade_id,dados,resumo,criado_em)
select id_usuario,'funcionario_nota_removida','atividade','funcionario',id_funcionario::text,
  jsonb_build_object('id_anotacao',id,'criada_em',criado_em),
  'Anotacao removida durante a limpeza do percurso',now()
from public.funcionario_nota;
do $$
begin
  if (select count(*) from public.logs where evento='funcionario_nota_removida') <>
     (select count(*) from public.funcionario_nota) then
    raise exception 'Metadados das anotacoes removidas nao foram preservados em logs';
  end if;
end $$;
drop table public.funcionario_nota;

-- Old source archives were already consolidated and verified by prior migrations.
drop table if exists recuperacao.os_status;
drop table if exists recuperacao.os_observacao;
drop table if exists recuperacao.os_backup;
drop table if exists recuperacao.os_auditoria;

notify pgrst,'reload schema';

commit;
