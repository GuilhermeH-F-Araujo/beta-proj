begin;

alter table public.admin_confirmacao
  add column if not exists mfa_confirmada boolean not null default false;

drop function if exists public.decidir_administrador(uuid,uuid,text);
create function public.decidir_administrador(
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
  agora timestamptz:=now();
begin
  perform pg_advisory_xact_lock(74120802);
  if app_private.peso_admin(p_actor)<>3 then
    raise exception using errcode='42501',message='Somente o dono pode aprovar administradores.';
  end if;
  if p_nivel not in ('administrador','superadministrador','recusado') or p_alvo=p_actor then
    raise exception 'Decisao invalida';
  end if;
  if exists(select 1 from public.admin_autoridade where id_usuario=p_alvo and nivel='dono') then
    raise exception 'O dono permanece protegido.';
  end if;
  if not exists(select 1 from public.funcionario where auth_user_id=p_alvo and cargo='Administrador'
    and perfil_acesso='Administrador' and coalesce(situacao,'ativo')='ativo') then
    raise exception 'Selecione um administrador com cadastro ativo.';
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
revoke all on function public.decidir_administrador(uuid,uuid,text,inet,text,uuid)
  from public,anon,authenticated;
grant execute on function public.decidir_administrador(uuid,uuid,text,inet,text,uuid)
  to service_role;

drop function if exists public.finalizar_confirmacao_admin(uuid,uuid,uuid,boolean,text);

create function public.finalizar_confirmacao_admin(
  p_usuario uuid,
  p_sessao uuid,
  p_tentativa uuid,
  p_sucesso boolean,
  p_hash text,
  p_mfa_confirmada boolean,
  p_ip inet,
  p_user_agent text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  tentativa public.admin_tentativa;
  novas_falhas integer;
  bloqueio timestamptz;
begin
  select * into tentativa
  from public.admin_tentativa
  where id_usuario=p_usuario
  for update;

  if not found or tentativa.reserva is distinct from p_tentativa
    or tentativa.reservada_em<now()-interval '30 seconds' then
    return jsonb_build_object('confirmado',false,'espera',30);
  end if;

  update public.admin_tentativa
  set reserva=null,reservada_em=null
  where id_usuario=p_usuario;

  if p_sucesso is null then
    return jsonb_build_object('confirmado',false);
  end if;

  if p_sucesso then
    if p_hash is null or length(p_hash)<>64 then
      raise exception 'Confirmacao invalida';
    end if;

    delete from public.admin_confirmacao
    where id_usuario=p_usuario and (id_sessao=p_sessao or expira_em<=now());

    insert into public.admin_confirmacao(hash,id_usuario,id_sessao,nivel,mfa_confirmada,expira_em)
    values(
      p_hash,
      p_usuario,
      p_sessao,
      public.consultar_nivel_administrativo(p_usuario),
      coalesce(p_mfa_confirmada,false),
      now()+case when coalesce(p_mfa_confirmada,false)
        then interval '20 minutes' else interval '3 minutes' end
    );

    update public.admin_tentativa
    set falhas=0,bloqueado_ate=null,inicio_em=now()
    where id_usuario=p_usuario;

    insert into public.logs(id_usuario,alvo,evento,categoria,entidade,entidade_id,dados,resumo,ip,user_agent,request_id)
    values(
      p_usuario,
      p_usuario,
      'identidade_confirmada',
      'seguranca',
      'conta',
      p_usuario::text,
      jsonb_build_object(
        'sessao',p_sessao,
        'nivel',public.consultar_nivel_administrativo(p_usuario),
        'autenticador',coalesce(p_mfa_confirmada,false)
      ),
      case when p_mfa_confirmada
        then 'Identidade confirmada com senha e autenticador'
        else 'Identidade confirmada com senha' end,
      p_ip,p_user_agent,p_request_id
    );

    return jsonb_build_object('confirmado',true);
  end if;

  novas_falhas:=tentativa.falhas+1;
  bloqueio:=case when novas_falhas>=5 then now()+interval '5 minutes' else null end;
  update public.admin_tentativa
  set falhas=novas_falhas,bloqueado_ate=bloqueio
  where id_usuario=p_usuario;
  delete from public.admin_confirmacao where id_usuario=p_usuario and id_sessao=p_sessao;

  insert into public.logs(id_usuario,alvo,evento,categoria,entidade,entidade_id,dados,resumo,ip,user_agent,request_id)
  values(
    p_usuario,
    p_usuario,
    'confirmacao_identidade_recusada',
    'seguranca',
    'conta',
    p_usuario::text,
    jsonb_build_object(
      'sessao',p_sessao,
      'falhas',novas_falhas,
      'bloqueado_ate',bloqueio,
      'tentativas_restantes',greatest(0,5-novas_falhas),
      'autenticador',coalesce(p_mfa_confirmada,false)
    ),
    case when bloqueio is null
      then 'Senha ou código de segurança incorreto'
      else 'Conta temporariamente bloqueada após falhas de confirmação' end,
    p_ip,p_user_agent,p_request_id
  );

  return jsonb_build_object(
    'confirmado',false,
    'restantes',greatest(0,5-novas_falhas),
    'espera',case when novas_falhas>=5 then 300 else 0 end
  );
end;
$$;

revoke all on function public.finalizar_confirmacao_admin(uuid,uuid,uuid,boolean,text,boolean,inet,text,uuid)
  from public,anon,authenticated;
grant execute on function public.finalizar_confirmacao_admin(uuid,uuid,uuid,boolean,text,boolean,inet,text,uuid)
  to service_role;

create or replace function public.validar_confirmacao_admin(p_usuario uuid,p_sessao uuid,p_hash text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  update public.admin_confirmacao c
  set expira_em=least(
    now()+case when c.mfa_confirmada then interval '20 minutes' else interval '3 minutes' end,
    c.criado_em+case when c.mfa_confirmada then interval '1 hour' else interval '3 minutes' end
  )
  where c.hash in (
    select v.hash from app_private.prova_administrativa_valida(p_usuario,p_sessao,p_hash) v
  );
  return found;
end;
$$;
revoke all on function public.validar_confirmacao_admin(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.validar_confirmacao_admin(uuid,uuid,text) to service_role;

notify pgrst,'reload schema';
commit;
