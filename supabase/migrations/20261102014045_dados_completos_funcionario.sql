begin;

alter table public.funcionario
  add column if not exists cep varchar(12),
  add column if not exists complemento varchar(120),
  add column if not exists tipo_contrato varchar(40),
  add column if not exists comissao_servico numeric(5,2) check(comissao_servico between 0 and 100),
  add column if not exists observacoes_profissionais varchar(2000);

create unique index if not exists funcionario_email_unico_idx
  on public.funcionario (lower(email)) where email is not null and btrim(email) <> '';

grant insert(data_nascimento,data_admissao,departamento,especialidade,endereco,situacao,cep,complemento,tipo_contrato,comissao_servico,observacoes_profissionais)
  on public.funcionario to service_role;
grant select(data_nascimento,data_admissao,departamento,especialidade,endereco,situacao,cep,complemento,tipo_contrato,comissao_servico,observacoes_profissionais)
  on public.funcionario to service_role;

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
comment on column public.funcionario.cep is 'CEP do endereço do funcionário.';
comment on column public.funcionario.complemento is 'Complemento do endereço do funcionário.';
comment on column public.funcionario.tipo_contrato is 'Tipo de contratação do funcionário: CLT, PJ, autônomo ou temporário.';
comment on column public.funcionario.comissao_servico is 'Percentual de comissão do funcionário por serviço, de 0 a 100.';
comment on column public.funcionario.observacoes_profissionais is 'Observações, experiência e certificações profissionais do funcionário.';
notify pgrst,'reload schema';
commit;
