-- Mantém os dados pessoais e o cargo em uma única gravação administrativa.
begin;

grant select (id_funcionario, auth_user_id, cargo, perfil_acesso)
  on public.funcionario to service_role;
grant update (cargo, perfil_acesso)
  on public.funcionario to service_role;

create or replace function public.admin_update_employee(
  p_id integer,
  p_payload jsonb,
  p_actor uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_auth_user_id uuid;
  v_current_role text;
  v_role text := p_payload->>'cargo';
  v_admin_count integer;
begin
  if v_role not in ('Administrador', 'Gerente', 'Mecânico', 'Cliente') then
    raise exception 'Cargo inválido';
  end if;

  select auth_user_id, cargo
    into v_auth_user_id, v_current_role
    from public.funcionario
    where id_funcionario = p_id
    for update;

  if not found then return false; end if;

  if v_auth_user_id = p_actor and v_role <> 'Administrador' then
    raise exception 'Não é possível remover seu próprio acesso de administrador.';
  end if;

  if v_current_role = 'Administrador' and v_role <> 'Administrador' then
    select count(*) into v_admin_count
      from public.funcionario
      where cargo = 'Administrador' and perfil_acesso = 'Administrador';
    if v_admin_count <= 1 then
      raise exception 'Não é possível remover o único administrador do sistema.';
    end if;
  end if;

  update public.funcionario
    set nome = btrim(p_payload->>'nome'),
        telefone = nullif(btrim(p_payload->>'telefone'), ''),
        cpf = p_payload->>'cpf',
        data_nascimento = nullif(p_payload->>'nascimento', '')::date,
        data_admissao = nullif(p_payload->>'admissao', '')::date,
        departamento = nullif(btrim(p_payload->>'departamento'), ''),
        especialidade = nullif(btrim(p_payload->>'especialidade'), ''),
        endereco = nullif(btrim(p_payload->>'endereco'), ''),
        situacao = nullif(p_payload->>'situacao', 'nao_informado'),
        cargo = v_role,
        perfil_acesso = v_role
    where id_funcionario = p_id;

  if v_role = 'Mecânico' then
    insert into public.mecanico (id_funcionario)
      values (p_id)
      on conflict (id_funcionario) do nothing;
  end if;

  return true;
end;
$$;

revoke all on function public.admin_update_employee(integer, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_update_employee(integer, jsonb, uuid)
  to service_role;

notify pgrst, 'reload schema';

commit;
