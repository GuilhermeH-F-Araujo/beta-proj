begin;

-- O fluxo usa as tabelas de autoridade, solicitacoes, tentativas e confirmacoes que ja existem.
do $$
declare tabela record;
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    for tabela in
      select t.tablename from pg_tables t
      where t.schemaname='public'
        and not exists(
          select 1 from pg_publication_tables p
          where p.pubname='supabase_realtime' and p.schemaname='public' and p.tablename=t.tablename
        )
    loop
      execute format('alter publication supabase_realtime add table public.%I',tabela.tablename);
    end loop;
  end if;
end;
$$;

alter table public.admin_confirmacao
  add column if not exists mfa_confirmada boolean not null default false;
alter table public.admin_tentativa
  add column if not exists aprovacao_funcionario_creditos integer not null default 0,
  add column if not exists aprovacao_funcionario_sessao uuid;

create or replace function app_private.proteger_funcionario_admin()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  autor uuid;
  nivel_autor integer;
  nivel_alvo integer;
  existe_pedido boolean := false;
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
    if nivel_autor < 1 then
      raise exception using errcode='42501',message='Acesso administrativo necessario.';
    end if;

    if tg_op <> 'INSERT' and old.cargo='Administrador' and old.perfil_acesso='Administrador' then
      select case nivel when 'dono' then 3 else 2 end into nivel_alvo
        from public.admin_autoridade where id_usuario=old.auth_user_id;
      nivel_alvo := coalesce(nivel_alvo,1);
      if nivel_autor <= nivel_alvo and not (nivel_autor=3 and nivel_alvo=3 and autor<>old.auth_user_id) then
        raise exception using errcode='42501',message='Este administrador exige uma autoridade superior.';
      end if;
    end if;

    if tg_op <> 'DELETE' and new.cargo='Administrador' and new.perfil_acesso='Administrador'
      and (tg_op='INSERT' or old.cargo<>'Administrador' or old.perfil_acesso<>'Administrador') then
      if nivel_autor = 1 then
        select exists(
          select 1 from public.admin_solicitacao s
          where s.id_usuario=new.auth_user_id and s.solicitado_por=autor and s.estado='pendente'
        ) or exists(
          select 1 from public.logs l
          where l.entidade='solicitacao_administrador' and l.entidade_id=new.auth_user_id::text
            and l.id_usuario=autor and l.dados->>'estado'='pendente'
        ) into existe_pedido;
        if not existe_pedido then
          raise exception using errcode='42501',message='Um administrador precisa de aprovacao antes de criar outro administrador.';
        end if;
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

create or replace function public.decidir_administrador(
  p_actor uuid,
  p_alvo uuid,
  p_nivel text,
  p_ip inet,
  p_user_agent text,
  p_request_id uuid
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  pedido jsonb;
  estado_atual text;
  peso_autor integer;
  agora timestamptz:=now();
begin
  perform pg_advisory_xact_lock(74120802);
  peso_autor:=app_private.peso_admin(p_actor);
  if peso_autor<2 then
    raise exception using errcode='42501',message='Somente superadministrador ou dono pode decidir acessos administrativos.';
  end if;
  if p_nivel not in ('administrador','superadministrador','recusado') or p_alvo=p_actor then
    raise exception 'Decisao invalida';
  end if;
  if p_nivel='superadministrador' and peso_autor<>3 then
    raise exception using errcode='42501',message='Somente o dono pode promover alguem a superadministrador.';
  end if;
  if exists(select 1 from public.admin_autoridade where id_usuario=p_alvo and nivel='dono') then
    raise exception 'O dono permanece protegido.';
  end if;
  if not exists(select 1 from public.funcionario where auth_user_id=p_alvo and cargo='Administrador'
    and perfil_acesso='Administrador' and coalesce(situacao,'ativo')='ativo') then
    raise exception 'Selecione um administrador com cadastro ativo.';
  end if;
  if exists(select 1 from public.admin_autoridade where id_usuario=p_alvo and nivel='superadministrador')
    and peso_autor<3 then
    raise exception using errcode='42501',message='Somente o dono pode alterar o acesso de um superadministrador.';
  end if;

  select l.dados into pedido from public.logs l where l.entidade='solicitacao_administrador'
    and l.entidade_id=p_alvo::text order by l.criado_em desc,l.id desc limit 1;
  if p_nivel='recusado' and pedido->>'estado' is distinct from 'pendente' then
    raise exception 'Nao ha solicitacao pendente.';
  end if;
  estado_atual:=case when p_nivel='recusado' then 'recusado' else 'aprovado' end;
  if pedido is not null then
    insert into public.logs(id_usuario,alvo,evento,criado_em,categoria,entidade,entidade_id,dados,resumo,ip,user_agent,request_id)
    values(p_actor,p_alvo,'solicitacao_administrador_'||estado_atual,agora,'seguranca',
      'solicitacao_administrador',p_alvo::text,
      pedido||jsonb_build_object('estado',estado_atual,'decidido_por',p_actor,'decidido_em',agora),
      'Solicitacao de acesso administrativo: '||estado_atual,p_ip,p_user_agent,p_request_id);
  end if;
  update public.admin_solicitacao set estado=estado_atual,decidido_por=p_actor,decidido_em=agora
    where id_usuario=p_alvo and estado='pendente';
  delete from public.admin_autoridade where id_usuario=p_alvo;
  if p_nivel='superadministrador' then
    insert into public.admin_autoridade(id_usuario,nivel) values(p_alvo,'superadministrador');
  end if;
  delete from public.admin_confirmacao where id_usuario=p_alvo;
  insert into public.logs(id_usuario,alvo,evento,categoria,entidade,entidade_id,resumo,ip,user_agent,request_id)
  values(p_actor,p_alvo,'nivel_'||p_nivel,'seguranca','conta',p_alvo::text,
    'Nivel administrativo definido: '||p_nivel,p_ip,p_user_agent,p_request_id);
end;
$$;
revoke all on function public.decidir_administrador(uuid,uuid,text,inet,text,uuid) from public,anon,authenticated;
grant execute on function public.decidir_administrador(uuid,uuid,text,inet,text,uuid) to service_role;

create or replace function public.registrar_funcionario_protegido(p_payload jsonb,p_actor uuid,p_completo boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare usuario uuid; papel text; cadastro integer; pendente boolean; agora timestamptz:=now();
begin
  perform pg_advisory_xact_lock(74120802);
  if app_private.peso_admin(p_actor)<1 then raise exception 'Acesso administrativo necessario'; end if;
  usuario:=coalesce(p_payload->>'id_usuario_autenticacao',p_payload->>'authUserId')::uuid;
  papel:=coalesce(p_payload->>'cargo',p_payload->>'profile');
  pendente:=papel='Administrador' and app_private.peso_admin(p_actor)=1;
  perform set_config('app.admin_actor',p_actor::text,true);
  if pendente then
    insert into public.admin_solicitacao(id_usuario,solicitado_por,estado)
    values(usuario,p_actor,'pendente')
    on conflict(id_usuario) do update set solicitado_por=excluded.solicitado_por,estado='pendente',
      decidido_por=null,decidido_em=null,solicitado_em=agora;
    insert into public.logs(id_usuario,alvo,evento,criado_em,categoria,entidade,entidade_id,dados,resumo)
    values(p_actor,usuario,'administrador_solicitado',agora,'seguranca','solicitacao_administrador',usuario::text,
      jsonb_build_object('estado','pendente','solicitado_por',p_actor,'solicitado_em',agora,'decidido_por',null,'decidido_em',null),
      'Solicitacao de acesso administrativo');
  end if;
  if p_completo then cadastro:=public.cadastrar_funcionario(p_payload);
  else cadastro:=public.admin_register_employee(p_payload); end if;
  insert into public.logs(id_usuario,alvo,evento,categoria,entidade,entidade_id,dados,resumo)
  values(p_actor,usuario,'funcionario_cadastrado','atividade','funcionario',usuario::text,
    jsonb_build_object('approvalPending',pendente),
    case when pendente then 'Funcionario cadastrado; aguardando aprovacao administrativa' else 'Funcionario cadastrado' end);
  return jsonb_build_object('id',cadastro,'approvalPending',pendente);
end;
$$;
revoke all on function public.registrar_funcionario_protegido(jsonb,uuid,boolean) from public,anon,authenticated;
grant execute on function public.registrar_funcionario_protegido(jsonb,uuid,boolean) to service_role;

-- Ajusta a validade, sem renovar o prazo a cada chamada protegida.
create or replace function public.finalizar_confirmacao_admin(
  p_usuario uuid,p_sessao uuid,p_tentativa uuid,p_sucesso boolean,p_hash text,
  p_mfa_confirmada boolean,p_ip inet,p_user_agent text,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare tentativa public.admin_tentativa; novas_falhas integer; bloqueio timestamptz;
begin
  select * into tentativa from public.admin_tentativa where id_usuario=p_usuario for update;
  if not found or tentativa.reserva is distinct from p_tentativa or tentativa.reservada_em<now()-interval '30 seconds' then
    return jsonb_build_object('confirmado',false,'espera',30);
  end if;
  update public.admin_tentativa set reserva=null,reservada_em=null where id_usuario=p_usuario;
  if p_sucesso is null then return jsonb_build_object('confirmado',false); end if;
  if p_sucesso then
    if p_hash is null or length(p_hash)<>64 then raise exception 'Confirmacao invalida'; end if;
    delete from public.admin_confirmacao where id_usuario=p_usuario and (id_sessao=p_sessao or expira_em<=now());
    insert into public.admin_confirmacao(hash,id_usuario,id_sessao,nivel,mfa_confirmada,expira_em)
    values(p_hash,p_usuario,p_sessao,public.consultar_nivel_administrativo(p_usuario),coalesce(p_mfa_confirmada,false),
      now()+case when coalesce(p_mfa_confirmada,false) then interval '30 minutes' else interval '15 minutes' end);
    update public.admin_tentativa set falhas=0,bloqueado_ate=null,inicio_em=now() where id_usuario=p_usuario;
    insert into public.logs(id_usuario,alvo,evento,categoria,entidade,entidade_id,dados,resumo,ip,user_agent,request_id)
    values(p_usuario,p_usuario,'identidade_confirmada','seguranca','conta',p_usuario::text,
      jsonb_build_object('sessao',p_sessao,'nivel',public.consultar_nivel_administrativo(p_usuario),'autenticador',coalesce(p_mfa_confirmada,false)),
      case when p_mfa_confirmada then 'Identidade confirmada com autenticador' else 'Identidade confirmada com senha' end,
      p_ip,p_user_agent,p_request_id);
    return jsonb_build_object('confirmado',true);
  end if;
  novas_falhas:=tentativa.falhas+1;
  bloqueio:=case when novas_falhas>=5 then now()+interval '5 minutes' else null end;
  update public.admin_tentativa set falhas=novas_falhas,bloqueado_ate=bloqueio where id_usuario=p_usuario;
  delete from public.admin_confirmacao where id_usuario=p_usuario and id_sessao=p_sessao;
  insert into public.logs(id_usuario,alvo,evento,categoria,entidade,entidade_id,dados,resumo,ip,user_agent,request_id)
  values(p_usuario,p_usuario,'confirmacao_identidade_recusada','seguranca','conta',p_usuario::text,
    jsonb_build_object('sessao',p_sessao,'falhas',novas_falhas,'bloqueado_ate',bloqueio,'tentativas_restantes',greatest(0,5-novas_falhas),'autenticador',coalesce(p_mfa_confirmada,false)),
    case when bloqueio is null then 'Senha ou codigo de seguranca incorreto' else 'Conta temporariamente bloqueada apos falhas de confirmacao' end,
    p_ip,p_user_agent,p_request_id);
  return jsonb_build_object('confirmado',false,'restantes',greatest(0,5-novas_falhas),'espera',case when novas_falhas>=5 then 300 else 0 end);
end;
$$;
revoke all on function public.finalizar_confirmacao_admin(uuid,uuid,uuid,boolean,text,boolean,inet,text,uuid) from public,anon,authenticated;
grant execute on function public.finalizar_confirmacao_admin(uuid,uuid,uuid,boolean,text,boolean,inet,text,uuid) to service_role;

create or replace function public.validar_confirmacao_admin(p_usuario uuid,p_sessao uuid,p_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  return exists(select 1 from app_private.prova_administrativa_valida(p_usuario,p_sessao,p_hash));
end;
$$;
revoke all on function public.validar_confirmacao_admin(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.validar_confirmacao_admin(uuid,uuid,text) to service_role;

-- Armazena dados complementares do perfil usando o funcionario e a tabela de contatos atuais.
create or replace function public.atualizar_meu_perfil_funcionario(p_actor uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare id_func integer;
begin
  select id_funcionario into id_func from public.funcionario
    where auth_user_id=p_actor for update;
  if id_func is null then raise exception using errcode='P0002',message='Perfil de funcionario nao encontrado.'; end if;
  update public.funcionario set
    nome=case when p_payload ? 'name' then btrim(p_payload->>'name') else nome end,
    telefone=case when p_payload ? 'phone' then nullif(btrim(p_payload->>'phone'),'') else telefone end,
    cpf=case when p_payload ? 'cpf' then nullif(regexp_replace(coalesce(p_payload->>'cpf',''), '[^0-9]', '', 'g'),'') else cpf end,
    data_nascimento=case when p_payload ? 'birthDate' then nullif(p_payload->>'birthDate','')::date else data_nascimento end,
    endereco=case when p_payload ? 'address' then nullif(btrim(p_payload->>'address'),'') else endereco end,
    cep=case when p_payload ? 'zipCode' then nullif(regexp_replace(coalesce(p_payload->>'zipCode',''), '[^0-9]', '', 'g'),'') else cep end,
    tipo_contrato=case when p_payload ? 'contractType' then nullif(btrim(p_payload->>'contractType'),'') else tipo_contrato end,
    duracao_contrato_meses=case when p_payload ? 'contractDuration' then nullif(p_payload->>'contractDuration','')::integer else duracao_contrato_meses end,
    especialidade=case when p_payload ? 'specialty' then nullif(btrim(p_payload->>'specialty'),'') else especialidade end,
    observacoes_profissionais=case when p_payload ? 'professionalNotes' then nullif(btrim(p_payload->>'professionalNotes'),'') else observacoes_profissionais end,
    departamento=case when p_payload ? 'department' then nullif(btrim(p_payload->>'department'),'') else departamento end,
    data_admissao=case when p_payload ? 'admissionDate' then nullif(p_payload->>'admissionDate','')::date else data_admissao end
  where id_funcionario=id_func;
  if p_payload ?| array['secondaryPhone','emergencyContact','emergencyRelationship','emergencyPhone'] then
    insert into public.funcionario_contato
      (id_funcionario,telefone_secundario,contato_emergencia,parentesco_emergencia,telefone_emergencia,atualizado_em)
    values(id_func,
      case when p_payload ? 'secondaryPhone' then nullif(btrim(p_payload->>'secondaryPhone'),'') else null end,
      case when p_payload ? 'emergencyContact' then nullif(btrim(p_payload->>'emergencyContact'),'') else null end,
      case when p_payload ? 'emergencyRelationship' then nullif(btrim(p_payload->>'emergencyRelationship'),'') else null end,
      case when p_payload ? 'emergencyPhone' then nullif(btrim(p_payload->>'emergencyPhone'),'') else null end,now())
    on conflict(id_funcionario) do update set
      telefone_secundario=case when p_payload ? 'secondaryPhone' then excluded.telefone_secundario else public.funcionario_contato.telefone_secundario end,
      contato_emergencia=case when p_payload ? 'emergencyContact' then excluded.contato_emergencia else public.funcionario_contato.contato_emergencia end,
      parentesco_emergencia=case when p_payload ? 'emergencyRelationship' then excluded.parentesco_emergencia else public.funcionario_contato.parentesco_emergencia end,
      telefone_emergencia=case when p_payload ? 'emergencyPhone' then excluded.telefone_emergencia else public.funcionario_contato.telefone_emergencia end,
      atualizado_em=now();
  end if;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.atualizar_meu_perfil_funcionario(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.atualizar_meu_perfil_funcionario(uuid,jsonb) to service_role;

create or replace function public.conceder_creditos_aprovacao_funcionario(p_usuario uuid,p_sessao uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare creditos integer;
begin
  if app_private.peso_admin(p_usuario)<2
    or not exists(select 1 from auth.sessions where id=p_sessao and user_id=p_usuario) then
    raise exception using errcode='42501',message='Confirmacao nao autorizada para aprovar funcionarios.';
  end if;
  insert into public.admin_tentativa(id_usuario,aprovacao_funcionario_creditos,aprovacao_funcionario_sessao)
  values(p_usuario,3,p_sessao)
  on conflict(id_usuario) do update set
    aprovacao_funcionario_creditos=3,
    aprovacao_funcionario_sessao=p_sessao;
  select aprovacao_funcionario_creditos into creditos from public.admin_tentativa where id_usuario=p_usuario;
  return creditos;
end;
$$;
revoke all on function public.conceder_creditos_aprovacao_funcionario(uuid,uuid) from public,anon,authenticated;
grant execute on function public.conceder_creditos_aprovacao_funcionario(uuid,uuid) to service_role;

create or replace function public.consumir_credito_aprovacao_funcionario(p_usuario uuid,p_sessao uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.admin_tentativa set aprovacao_funcionario_creditos=aprovacao_funcionario_creditos-1
  where id_usuario=p_usuario and aprovacao_funcionario_sessao=p_sessao and aprovacao_funcionario_creditos>0;
  return found;
end;
$$;
revoke all on function public.consumir_credito_aprovacao_funcionario(uuid,uuid) from public,anon,authenticated;
grant execute on function public.consumir_credito_aprovacao_funcionario(uuid,uuid) to service_role;

notify pgrst,'reload schema';
commit;
