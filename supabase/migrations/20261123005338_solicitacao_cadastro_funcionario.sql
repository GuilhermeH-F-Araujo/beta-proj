begin;

alter table public.funcionario
  add column if not exists duracao_contrato_meses integer
  check (duracao_contrato_meses between 1 and 120);

create table if not exists public.funcionario_solicitacao (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  estado text not null default 'pendente' check (estado in ('pendente','aprovado','recusado')),
  solicitado_por uuid not null references auth.users(id) on delete restrict,
  solicitado_em timestamptz not null default now(),
  decidido_por uuid references auth.users(id) on delete set null,
  decidido_em timestamptz,
  auth_user_id uuid references auth.users(id) on delete set null
);
create index if not exists funcionario_solicitacao_pendente_idx
  on public.funcionario_solicitacao (solicitado_em desc) where estado = 'pendente';
create unique index if not exists funcionario_solicitacao_email_pendente_idx
  on public.funcionario_solicitacao (lower(payload->>'email')) where estado = 'pendente';
create unique index if not exists funcionario_solicitacao_cpf_pendente_idx
  on public.funcionario_solicitacao ((payload->>'cpf')) where estado = 'pendente';
alter table public.funcionario_solicitacao enable row level security;
revoke all on public.funcionario_solicitacao from public, anon, authenticated;
grant select, insert, update on public.funcionario_solicitacao to service_role;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'funcionario_solicitacao') then
    alter publication supabase_realtime add table public.funcionario_solicitacao;
  end if;
end $$;

grant insert(duracao_contrato_meses) on public.funcionario to service_role;
grant select(duracao_contrato_meses) on public.funcionario to service_role;

create or replace function public.cadastrar_funcionario(p_payload jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_id integer; v_role text;
begin
  v_role := p_payload->>'cargo';
  if v_role not in ('Administrador','Mecânico','Atendente') then raise exception 'Cargo inválido'; end if;
  insert into public.funcionario
    (nome,email,telefone,cpf,cargo,perfil_acesso,auth_user_id,data_nascimento,data_admissao,
     departamento,especialidade,endereco,situacao,cep,complemento,tipo_contrato,comissao_servico,
     observacoes_profissionais,duracao_contrato_meses)
  values
    (btrim(p_payload->>'nome'),lower(btrim(p_payload->>'email')),btrim(p_payload->>'telefone'),p_payload->>'cpf',v_role,v_role,
     nullif(p_payload->>'id_usuario_autenticacao','')::uuid,nullif(p_payload->>'data_nascimento','')::date,nullif(p_payload->>'data_admissao','')::date,
     nullif(btrim(p_payload->>'departamento'),''),nullif(btrim(p_payload->>'especialidade'),''),nullif(btrim(p_payload->>'endereco'),''),
     coalesce(nullif(p_payload->>'situacao',''),'ativo'),nullif(btrim(p_payload->>'cep'),''),nullif(btrim(p_payload->>'complemento'),''),
     nullif(btrim(p_payload->>'tipo_contrato'),''),nullif(p_payload->>'comissao_servico','')::numeric,
     nullif(btrim(p_payload->>'observacoes_profissionais'),''),nullif(p_payload->>'duracao_contrato_meses','')::integer)
  returning id_funcionario into v_id;
  if v_role='Mecânico' then insert into public.mecanico (id_funcionario) values (v_id); end if;
  return v_id;
end $$;
revoke all on function public.cadastrar_funcionario(jsonb) from public,anon,authenticated;
grant execute on function public.cadastrar_funcionario(jsonb) to service_role;

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

create or replace function public.admin_update_employee(p_id integer,p_payload jsonb,p_actor uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare alvo public.funcionario; papel text := p_payload->>'cargo'; nivel_alvo integer;
begin
  perform pg_advisory_xact_lock(74120802);
  if app_private.peso_admin(p_actor)<1 then raise exception 'Acesso administrativo necessário'; end if;
  select * into alvo from public.funcionario where id_funcionario=p_id for update;
  if not found then return false; end if;
  if papel not in ('Administrador','Gerente','Mecânico','Atendente','Cliente') then raise exception 'Cargo inválido'; end if;
  if alvo.cargo='Administrador' and alvo.perfil_acesso='Administrador' then
    select case nivel when 'dono' then 3 else 2 end into nivel_alvo from public.admin_autoridade where id_usuario=alvo.auth_user_id;
    if app_private.peso_admin(p_actor)<=coalesce(nivel_alvo,1) then raise exception using errcode='42501',message='Este administrador exige uma autoridade superior.'; end if;
  end if;
  if papel='Administrador' and alvo.cargo<>'Administrador' and app_private.peso_admin(p_actor)<3 then
    raise exception using errcode='42501',message='Somente o dono pode conceder administração.';
  end if;
  perform set_config('app.admin_actor',p_actor::text,true);
  update public.funcionario set nome=btrim(p_payload->>'nome'),telefone=nullif(btrim(p_payload->>'telefone'),''),
    cpf=p_payload->>'cpf',data_nascimento=nullif(p_payload->>'nascimento','')::date,
    data_admissao=nullif(p_payload->>'admissao','')::date,departamento=nullif(btrim(p_payload->>'departamento'),''),
    especialidade=nullif(btrim(p_payload->>'especialidade'),''),endereco=nullif(btrim(p_payload->>'endereco'),''),
    situacao=nullif(p_payload->>'situacao','nao_informado'),cargo=papel,perfil_acesso=papel where id_funcionario=p_id;
  if papel='Mecânico' then insert into public.mecanico(id_funcionario) values(p_id) on conflict(id_funcionario) do nothing; end if;
  insert into public.seguranca_auditoria(id_usuario,alvo,evento) values(p_actor,alvo.auth_user_id,'funcionario_alterado');
  return true;
end;
$$;
revoke all on function public.admin_update_employee(integer,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.admin_update_employee(integer,jsonb,uuid) to service_role;

comment on table public.funcionario_solicitacao is 'Solicitações de cadastro de funcionário; conta de acesso só é criada após aprovação da dona.';
comment on column public.funcionario.duracao_contrato_meses is 'Duração em meses para contratos temporários.';
notify pgrst,'reload schema';
commit;
