create or replace function public.cadastrar_funcionario(p_payload jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_id integer; v_role text;
begin
  v_role := p_payload->>'cargo';
  if v_role not in ('Administrador','Gerente','Mecânico') then raise exception 'Cargo inválido'; end if;
  insert into public.funcionario
    (nome,email,telefone,cpf,cargo,perfil_acesso,auth_user_id,data_nascimento,data_admissao,
     departamento,especialidade,endereco,situacao,cep,complemento,tipo_contrato,comissao_servico,observacoes_profissionais)
  values
    (btrim(p_payload->>'nome'),lower(btrim(p_payload->>'email')),btrim(p_payload->>'telefone'),p_payload->>'cpf',v_role,v_role,
     nullif(p_payload->>'id_usuario_autenticacao','')::uuid,nullif(p_payload->>'data_nascimento','')::date,nullif(p_payload->>'data_admissao','')::date,
     nullif(btrim(p_payload->>'departamento'),''),nullif(btrim(p_payload->>'especialidade'),''),nullif(btrim(p_payload->>'endereco'),''),
     coalesce(nullif(p_payload->>'situacao',''),'ativo'),nullif(btrim(p_payload->>'cep'),''),nullif(btrim(p_payload->>'complemento'),''),
     nullif(btrim(p_payload->>'tipo_contrato'),''),nullif(p_payload->>'comissao_servico','')::numeric,
     nullif(btrim(p_payload->>'observacoes_profissionais'),''))
  returning id_funcionario into v_id;
  if v_role='Mecânico' then insert into public.mecanico (id_funcionario) values (v_id); end if;
  return v_id;
end $$;

revoke all on function public.cadastrar_funcionario(jsonb) from public,anon,authenticated;
grant execute on function public.cadastrar_funcionario(jsonb) to service_role;
comment on function public.cadastrar_funcionario(jsonb) is 'Cadastra funcionário com campos pessoais e profissionais em português; cria vínculo em mecanico quando o cargo for Mecânico.';
