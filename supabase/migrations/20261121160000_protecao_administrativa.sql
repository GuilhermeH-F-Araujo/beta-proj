begin;

create table if not exists public.admin_autoridade (
  id_usuario uuid primary key references auth.users(id) on delete cascade,
  nivel text not null check (nivel in ('superadministrador','dono')),
  criado_em timestamptz not null default now()
);
create table if not exists public.admin_solicitacao (
  id_usuario uuid primary key references auth.users(id) on delete cascade,
  solicitado_por uuid not null references auth.users(id),
  estado text not null default 'pendente' check (estado in ('pendente','aprovado','recusado')),
  decidido_por uuid references auth.users(id),
  solicitado_em timestamptz not null default now(),
  decidido_em timestamptz
);
create table if not exists public.admin_confirmacao (
  hash text primary key check (length(hash)=64),
  id_usuario uuid not null references auth.users(id) on delete cascade,
  id_sessao uuid not null references auth.sessions(id) on delete cascade,
  nivel text,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '10 minutes'
);
create index if not exists admin_confirmacao_sessao_idx on public.admin_confirmacao(id_usuario,id_sessao);
create table if not exists public.admin_tentativa (
  id_usuario uuid primary key references auth.users(id) on delete cascade,
  falhas integer not null default 0,
  bloqueado_ate timestamptz,
  reserva uuid,
  reservada_em timestamptz,
  inicio_em timestamptz not null default now()
);
create table if not exists public.seguranca_auditoria (
  id bigint generated always as identity primary key,
  id_usuario uuid references auth.users(id) on delete set null,
  alvo uuid references auth.users(id) on delete set null,
  evento text not null,
  criado_em timestamptz not null default now()
);
alter table public.admin_autoridade enable row level security;
alter table public.admin_solicitacao enable row level security;
alter table public.admin_confirmacao enable row level security;
alter table public.admin_tentativa enable row level security;
alter table public.seguranca_auditoria enable row level security;
revoke all on public.admin_autoridade,public.admin_solicitacao,public.admin_confirmacao,
  public.admin_tentativa,public.seguranca_auditoria from public,anon,authenticated,service_role;
grant select on public.admin_autoridade,public.admin_solicitacao to service_role;
grant select,delete on public.admin_confirmacao to service_role;
grant select on public.seguranca_auditoria to service_role;

create or replace function public.consultar_nivel_administrativo(p_usuario uuid)
returns text language sql security definer set search_path='' as $$
  select coalesce(a.nivel,'administrador')
  from public.funcionario f
  join auth.users u on u.id=f.auth_user_id
  left join public.admin_autoridade a on a.id_usuario=f.auth_user_id
  where f.auth_user_id=p_usuario and f.cargo='Administrador' and f.perfil_acesso='Administrador'
    and coalesce(f.situacao,'ativo')='ativo'
    and (u.banned_until is null or u.banned_until < now())
    and not exists(select 1 from public.admin_solicitacao s where s.id_usuario=p_usuario and s.estado<>'aprovado');
$$;
revoke all on function public.consultar_nivel_administrativo(uuid) from public,anon,authenticated;
grant execute on function public.consultar_nivel_administrativo(uuid) to service_role;

create or replace function app_private.peso_admin(p_usuario uuid)
returns integer language sql security definer set search_path='' as $$
 select case public.consultar_nivel_administrativo(p_usuario)
   when 'dono' then 3 when 'superadministrador' then 2 when 'administrador' then 1 else 0 end;
$$;
revoke all on function app_private.peso_admin(uuid) from public,anon,authenticated;

create or replace function app_private.proteger_funcionario_admin()
returns trigger language plpgsql security definer set search_path='' as $$
declare autor uuid; nivel_autor integer; nivel_alvo integer;
begin
  if tg_op = 'UPDATE' then
    if row(old.cargo,old.perfil_acesso,old.auth_user_id,old.email,old.situacao)
      is not distinct from row(new.cargo,new.perfil_acesso,new.auth_user_id,new.email,new.situacao)
    then return new; end if;
  end if;
  if (tg_op <> 'INSERT' and old.cargo='Administrador' and old.perfil_acesso='Administrador')
    or (tg_op <> 'DELETE' and new.cargo='Administrador' and new.perfil_acesso='Administrador') then
    perform pg_advisory_xact_lock(74120802);
    autor := nullif(current_setting('app.admin_actor',true),'')::uuid;
    nivel_autor := app_private.peso_admin(autor);
    if tg_op <> 'INSERT' and old.cargo='Administrador' and old.perfil_acesso='Administrador' then
      select case nivel when 'dono' then 3 else 2 end into nivel_alvo
        from public.admin_autoridade where id_usuario=old.auth_user_id;
      nivel_alvo := coalesce(nivel_alvo,1);
      if nivel_autor <= nivel_alvo then
        raise exception using errcode='42501', message='Este administrador exige uma autoridade superior.';
      end if;
    end if;
    if tg_op <> 'DELETE' and new.cargo='Administrador' and new.perfil_acesso='Administrador'
      and nivel_autor < 3
      and (tg_op='INSERT' or old.cargo<>'Administrador' or old.perfil_acesso<>'Administrador') then
      if tg_op <> 'INSERT' or nivel_autor < 1 or not exists(
        select 1 from public.admin_solicitacao where id_usuario=new.auth_user_id
          and solicitado_por=autor and estado='pendente'
      ) then
        raise exception using errcode='42501', message='Somente o dono pode conceder administração.';
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
end;
$$;
revoke all on function app_private.proteger_funcionario_admin() from public,anon,authenticated;
drop trigger if exists proteger_funcionario_admin on public.funcionario;
create trigger proteger_funcionario_admin before insert or update or delete on public.funcionario
  for each row execute function app_private.proteger_funcionario_admin();

create or replace function public.registrar_funcionario_protegido(p_payload jsonb,p_actor uuid,p_completo boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare usuario uuid; papel text; cadastro integer; pendente boolean;
begin
  perform pg_advisory_xact_lock(74120802);
  if app_private.peso_admin(p_actor)<1 then raise exception 'Acesso administrativo necessário'; end if;
  usuario := coalesce(p_payload->>'id_usuario_autenticacao',p_payload->>'authUserId')::uuid;
  papel := coalesce(p_payload->>'cargo',p_payload->>'profile');
  pendente := papel='Administrador' and app_private.peso_admin(p_actor)<3;
  perform set_config('app.admin_actor',p_actor::text,true);
  if pendente then
    insert into public.admin_solicitacao(id_usuario,solicitado_por) values(usuario,p_actor);
  end if;
  if p_completo then
    cadastro := public.cadastrar_funcionario(p_payload);
  else
    cadastro := public.admin_register_employee(p_payload);
  end if;
  insert into public.seguranca_auditoria(id_usuario,alvo,evento)
    values(p_actor,usuario,case when pendente then 'administrador_solicitado' else 'funcionario_cadastrado' end);
  return jsonb_build_object('id',cadastro,'approvalPending',pendente);
end;
$$;
revoke all on function public.registrar_funcionario_protegido(jsonb,uuid,boolean) from public,anon,authenticated;
grant execute on function public.registrar_funcionario_protegido(jsonb,uuid,boolean) to service_role;

-- A edicao antiga e substituida para validar a autoridade dentro da transacao.
create or replace function public.admin_update_employee(p_id integer,p_payload jsonb,p_actor uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare alvo public.funcionario; papel text := p_payload->>'cargo'; nivel_alvo integer;
begin
  perform pg_advisory_xact_lock(74120802);
  if app_private.peso_admin(p_actor)<1 then raise exception 'Acesso administrativo necessário'; end if;
  select * into alvo from public.funcionario where id_funcionario=p_id for update;
  if not found then return false; end if;
  if papel not in ('Administrador','Gerente','Mecânico','Cliente') then raise exception 'Cargo inválido'; end if;
  if alvo.cargo='Administrador' and alvo.perfil_acesso='Administrador' then
    select case nivel when 'dono' then 3 else 2 end into nivel_alvo
      from public.admin_autoridade where id_usuario=alvo.auth_user_id;
    if app_private.peso_admin(p_actor)<=coalesce(nivel_alvo,1) then
      raise exception using errcode='42501',message='Este administrador exige uma autoridade superior.';
    end if;
  end if;
  if papel='Administrador' and alvo.cargo<>'Administrador' and app_private.peso_admin(p_actor)<3 then
    raise exception using errcode='42501',message='Somente o dono pode conceder administração.';
  end if;
  perform set_config('app.admin_actor',p_actor::text,true);
  update public.funcionario set
    nome=btrim(p_payload->>'nome'),telefone=nullif(btrim(p_payload->>'telefone'),''),
    cpf=p_payload->>'cpf',data_nascimento=nullif(p_payload->>'nascimento','')::date,
    data_admissao=nullif(p_payload->>'admissao','')::date,
    departamento=nullif(btrim(p_payload->>'departamento'),''),
    especialidade=nullif(btrim(p_payload->>'especialidade'),''),
    endereco=nullif(btrim(p_payload->>'endereco'),''),
    situacao=nullif(p_payload->>'situacao','nao_informado'),cargo=papel,perfil_acesso=papel
  where id_funcionario=p_id;
  if papel='Mecânico' then
    insert into public.mecanico(id_funcionario) values(p_id) on conflict(id_funcionario) do nothing;
  end if;
  insert into public.seguranca_auditoria(id_usuario,alvo,evento) values(p_actor,alvo.auth_user_id,'funcionario_alterado');
  return true;
end;
$$;
revoke all on function public.admin_update_employee(integer,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.admin_update_employee(integer,jsonb,uuid) to service_role;

create or replace function public.decidir_administrador(p_actor uuid,p_alvo uuid,p_nivel text)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(74120802);
  if app_private.peso_admin(p_actor)<>3 then
    raise exception using errcode='42501',message='Somente o dono pode aprovar administradores.';
  end if;
  if p_nivel not in ('administrador','superadministrador','recusado') or p_alvo=p_actor then
    raise exception 'Decisão inválida';
  end if;
  if exists(select 1 from public.admin_autoridade where id_usuario=p_alvo and nivel='dono') then
    raise exception 'O dono permanece protegido.';
  end if;
  if not exists(select 1 from public.funcionario where auth_user_id=p_alvo and cargo='Administrador'
    and perfil_acesso='Administrador' and coalesce(situacao,'ativo')='ativo') then
    raise exception 'Selecione um administrador com cadastro ativo.';
  end if;
  if p_nivel='recusado' and not exists(
    select 1 from public.admin_solicitacao where id_usuario=p_alvo and estado='pendente'
  ) then raise exception 'Não há solicitação pendente.'; end if;
  update public.admin_solicitacao set
    estado=case when p_nivel='recusado' then 'recusado' else 'aprovado' end,
    decidido_por=p_actor,decidido_em=now() where id_usuario=p_alvo;
  delete from public.admin_autoridade where id_usuario=p_alvo;
  if p_nivel='superadministrador' then
    insert into public.admin_autoridade(id_usuario,nivel) values(p_alvo,'superadministrador');
  end if;
  delete from public.admin_confirmacao where id_usuario=p_alvo;
  insert into public.seguranca_auditoria(id_usuario,alvo,evento) values(p_actor,p_alvo,'nivel_'||p_nivel);
end;
$$;
revoke all on function public.decidir_administrador(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.decidir_administrador(uuid,uuid,text) to service_role;

create or replace function public.validar_confirmacao_admin(p_usuario uuid,p_sessao uuid,p_hash text)
returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from public.admin_confirmacao c join auth.sessions s
   on s.id=c.id_sessao and s.user_id=c.id_usuario
   where c.hash=p_hash and c.id_usuario=p_usuario and c.id_sessao=p_sessao
     and c.expira_em>now() and (s.not_after is null or s.not_after>now())
     and c.nivel is not distinct from public.consultar_nivel_administrativo(p_usuario)
     and not exists(select 1 from public.admin_tentativa t where t.id_usuario=p_usuario and t.bloqueado_ate>now()));
$$;

create or replace function public.reservar_confirmacao_admin(p_usuario uuid,p_sessao uuid,p_tentativa uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tentativa public.admin_tentativa;
begin
  if not exists(select 1 from auth.sessions where id=p_sessao and user_id=p_usuario
    and (not_after is null or not_after>now())) then return jsonb_build_object('permitido',false,'espera',30); end if;
  insert into public.admin_tentativa(id_usuario) values(p_usuario) on conflict do nothing;
  select * into tentativa from public.admin_tentativa where id_usuario=p_usuario for update;
  if tentativa.bloqueado_ate>now() then
    return jsonb_build_object('permitido',false,'espera',ceil(extract(epoch from tentativa.bloqueado_ate-now())));
  end if;
  if tentativa.reservada_em>now()-interval '30 seconds' then
    return jsonb_build_object('permitido',false,'espera',30);
  end if;
  update public.admin_tentativa set reserva=p_tentativa,reservada_em=now(),
    falhas=case when bloqueado_ate is not null or inicio_em<now()-interval '15 minutes' then 0 else falhas end,
    inicio_em=case when bloqueado_ate is not null or inicio_em<now()-interval '15 minutes' then now() else inicio_em end,
    bloqueado_ate=null where id_usuario=p_usuario;
  return jsonb_build_object('permitido',true);
end;
$$;

create or replace function public.finalizar_confirmacao_admin(
  p_usuario uuid,p_sessao uuid,p_tentativa uuid,p_sucesso boolean,p_hash text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare tentativa public.admin_tentativa; novas_falhas integer;
begin
  select * into tentativa from public.admin_tentativa where id_usuario=p_usuario for update;
  if not found or tentativa.reserva is distinct from p_tentativa or tentativa.reservada_em<now()-interval '30 seconds' then
    return jsonb_build_object('confirmado',false,'espera',30);
  end if;
  update public.admin_tentativa set reserva=null,reservada_em=null where id_usuario=p_usuario;
  if p_sucesso is null then return jsonb_build_object('confirmado',false); end if;
  if p_sucesso then
    if p_hash is null or length(p_hash)<>64 then raise exception 'Confirmação inválida'; end if;
    delete from public.admin_confirmacao where id_usuario=p_usuario and (id_sessao=p_sessao or expira_em<=now());
    insert into public.admin_confirmacao(hash,id_usuario,id_sessao,nivel)
      values(p_hash,p_usuario,p_sessao,public.consultar_nivel_administrativo(p_usuario));
    update public.admin_tentativa set falhas=0,bloqueado_ate=null,inicio_em=now() where id_usuario=p_usuario;
    insert into public.seguranca_auditoria(id_usuario,evento) values(p_usuario,'senha_confirmada');
    return jsonb_build_object('confirmado',true);
  end if;
  novas_falhas:=tentativa.falhas+1;
  update public.admin_tentativa set falhas=novas_falhas,
    bloqueado_ate=case when novas_falhas>=5 then now()+interval '5 minutes' else null end
    where id_usuario=p_usuario;
  delete from public.admin_confirmacao where id_usuario=p_usuario and id_sessao=p_sessao;
  insert into public.seguranca_auditoria(id_usuario,evento) values(p_usuario,'senha_confirmacao_incorreta');
  return jsonb_build_object('confirmado',false,'restantes',greatest(0,5-novas_falhas),'espera',case when novas_falhas>=5 then 300 else 0 end);
end;
$$;
revoke all on function public.validar_confirmacao_admin(uuid,uuid,text),
  public.reservar_confirmacao_admin(uuid,uuid,uuid),
  public.finalizar_confirmacao_admin(uuid,uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.validar_confirmacao_admin(uuid,uuid,text),
  public.reservar_confirmacao_admin(uuid,uuid,uuid),
  public.finalizar_confirmacao_admin(uuid,uuid,uuid,boolean,text) to service_role;

commit;
