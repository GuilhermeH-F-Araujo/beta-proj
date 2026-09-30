-- Os IDs já usam identidade BY DEFAULT, com sequências sincronizadas.
grant usage on sequence public.cliente_id_cliente_seq,public.moto_id_moto_seq,
  public.ordem_servico_id_os_seq,public.foto_os_id_foto_seq,
  public.funcionario_id_funcionario_seq to service_role;
grant insert (id_cliente,nome,telefone,email,cpf) on public.cliente to service_role;
grant select (id_cliente,nome,excluido_em) on public.cliente to service_role;
grant insert (id_moto,id_cliente,modelo,placa,ano,cor,quilometragem) on public.moto to service_role;
grant select (id_moto,id_cliente,placa) on public.moto to service_role;
grant insert (id_funcionario,nome,email,telefone,cpf,cargo,perfil_acesso,auth_user_id)
  on public.funcionario to service_role;
grant select (id_funcionario,email,cpf) on public.funcionario to service_role;
grant insert (id_funcionario) on public.mecanico to service_role;
grant select (id_funcionario) on public.mecanico to service_role;

-- A função é invocada somente pelo backend depois da checagem de administrador.
-- Todas as inserções do cliente, moto, OS e metadados de fotos estão na mesma transação.
create or replace function public.admin_create_order(p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_client_id integer;
  v_moto_id integer;
  v_os_id integer;
  v_mechanic_id integer;
  v_photo jsonb;
begin
  v_client_id := nullif(p_payload->>'clientId','')::integer;
  if v_client_id is not null then
    perform 1 from public.cliente where id_cliente=v_client_id and excluido_em is null;
    if not found then raise exception 'Cliente não encontrado ou excluído'; end if;
  else
    if char_length(btrim(coalesce(p_payload->>'clientName',''))) < 2
      then raise exception 'Informe o nome do cliente'; end if;
    insert into public.cliente (nome,telefone,email,cpf)
      values (btrim(p_payload->>'clientName'),nullif(btrim(p_payload->>'clientPhone'),''),
              nullif(btrim(p_payload->>'clientEmail'),''),
              nullif(btrim(p_payload->>'clientCpf'),''))
      returning id_cliente into v_client_id;
  end if;

  v_moto_id := nullif(p_payload->>'motorcycleId','')::integer;
  if v_moto_id is not null then
    perform 1 from public.moto where id_moto=v_moto_id and id_cliente=v_client_id;
    if not found then raise exception 'Esta moto não pertence ao cliente selecionado'; end if;
  else
    if char_length(btrim(coalesce(p_payload->>'model',''))) < 2
      then raise exception 'Informe o modelo da moto'; end if;
    if btrim(coalesce(p_payload->>'plate','')) = ''
      then raise exception 'Informe a placa da moto'; end if;
    insert into public.moto (id_cliente,modelo,placa,ano,cor,quilometragem)
      values (v_client_id,btrim(p_payload->>'model'),upper(btrim(p_payload->>'plate')),
              nullif(p_payload->>'year','')::integer,
              nullif(btrim(p_payload->>'color'),''),
              nullif(p_payload->>'mileage','')::integer)
      returning id_moto into v_moto_id;
  end if;

  v_mechanic_id := nullif(p_payload->>'mechanicId','')::integer;
  if v_mechanic_id is not null then
    perform 1 from public.mecanico where id_funcionario=v_mechanic_id;
    if not found then raise exception 'Mecânico não cadastrado'; end if;
  end if;
  if nullif(p_payload->>'forecastAt','') is not null
    and (p_payload->>'forecastAt')::timestamp < (p_payload->>'entryAt')::timestamp
    then raise exception 'A previsão não pode ser anterior à entrada'; end if;

  insert into public.ordem_servico
    (id_moto,id_mecanico,status,data_entrada,previsao_entrega,
     quilometragem_entrada,problema_relatado,observacoes)
    values
    (v_moto_id,v_mechanic_id,'aguardando',(p_payload->>'entryAt')::timestamp,
     nullif(p_payload->>'forecastAt','')::timestamp,
     nullif(p_payload->>'mileage','')::integer,
     nullif(btrim(p_payload->>'problem'),''),
     nullif(btrim(p_payload->>'observations'),''))
    returning id_os into v_os_id;

  for v_photo in select value from jsonb_array_elements(coalesce(p_payload->'photos','[]'::jsonb)) loop
    insert into public.foto_os (id_os,tipo,url)
      values (v_os_id,'entrada',v_photo->>'url');
  end loop;
  return jsonb_build_object('id',v_os_id,'clientId',v_client_id,'motorcycleId',v_moto_id);
end $$;
revoke all on function public.admin_create_order(jsonb) from public,anon,authenticated;
grant execute on function public.admin_create_order(jsonb) to service_role;

create or replace function public.admin_register_employee(p_payload jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_id integer; v_role text;
begin
  v_role := p_payload->>'profile';
  if v_role not in ('Administrador','Gerente','Mecânico')
    or p_payload->>'position' <> v_role
    then raise exception 'Cargo e perfil incompatíveis'; end if;
  if nullif(p_payload->>'authUserId','') is null then raise exception 'Conta Auth ausente'; end if;
  insert into public.funcionario (nome,email,telefone,cpf,cargo,perfil_acesso,auth_user_id)
    values (btrim(p_payload->>'name'),lower(btrim(p_payload->>'email')),
            btrim(p_payload->>'phone'),p_payload->>'cpf',v_role,v_role,
            (p_payload->>'authUserId')::uuid)
    returning id_funcionario into v_id;
  if v_role='Mecânico' then insert into public.mecanico (id_funcionario) values (v_id); end if;
  return v_id;
end $$;
revoke all on function public.admin_register_employee(jsonb) from public,anon,authenticated;
grant execute on function public.admin_register_employee(jsonb) to service_role;
