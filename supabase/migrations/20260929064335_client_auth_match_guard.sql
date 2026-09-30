-- Vincular cliente existente somente se CPF e e-mail forem compatíveis.
grant update (email,cpf,telefone) on public.cliente to service_role;
create or replace function public.admin_register_client(p_payload jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_email text := lower(btrim(p_payload->>'email'));
  v_cpf text := p_payload->>'cpf';
  v_id_cpf integer;
  v_id_email integer;
  v_id integer;
  v_existing_email text;
  v_existing_cpf text;
  v_auth uuid := nullif(p_payload->>'authUserId','')::uuid;
begin
  if v_auth is null or length(v_cpf) <> 11 or length(v_email) < 5
    then raise exception 'Dados obrigatórios do cliente ausentes'; end if;
  select id_cliente into v_id_cpf from public.cliente where cpf = v_cpf and excluido_em is null limit 1;
  select id_cliente into v_id_email from public.cliente where lower(email) = v_email and excluido_em is null limit 1;
  if v_id_cpf is not null and v_id_email is not null and v_id_cpf <> v_id_email
    then raise exception 'CPF e e-mail pertencem a clientes diferentes'; end if;
  v_id := coalesce(v_id_cpf,v_id_email);
  if v_id is not null then
    select email,cpf into v_existing_email,v_existing_cpf
      from public.cliente where id_cliente=v_id;
    if (v_existing_email is not null and lower(v_existing_email) <> v_email)
      or (v_existing_cpf is not null and v_existing_cpf <> v_cpf)
      then raise exception 'CPF ou e-mail não confere com o cadastro existente'; end if;
    update public.cliente set auth_user_id = v_auth,
      email = coalesce(email,v_email), cpf = coalesce(cpf,v_cpf),
      telefone = coalesce(telefone,nullif(btrim(p_payload->>'phone'),''))
      where id_cliente = v_id and auth_user_id is null;
    if not found then raise exception 'Este cliente já tem uma conta vinculada'; end if;
  else
    insert into public.cliente (nome,email,telefone,cpf,auth_user_id)
      values (btrim(p_payload->>'name'),v_email,btrim(p_payload->>'phone'),v_cpf,v_auth)
      returning id_cliente into v_id;
  end if;
  return v_id;
end $$;
