-- Parte da hierarquia que faltava no banco: creditos de aprovacao e edicao do proprio perfil.
-- As funcoes de confirmacao e cadastro ja tinham versao mais nova no banco e nao sao recriadas aqui.
alter table public.admin_tentativa
  add column if not exists aprovacao_funcionario_creditos integer not null default 0,
  add column if not exists aprovacao_funcionario_sessao uuid;

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
