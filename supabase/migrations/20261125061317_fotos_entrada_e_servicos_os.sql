alter table public.foto_os
  add column if not exists posicao text;

alter table public.foto_os
  drop constraint if exists foto_os_posicao_check;
alter table public.foto_os
  add constraint foto_os_posicao_check
  check (posicao is null or posicao in ('front','left','rear','right','extra'));

grant select (posicao) on public.foto_os to service_role;
grant insert (id_os,tipo,url,posicao) on public.foto_os to service_role;
grant insert (id_os,descricao,preco) on public.os_servico to service_role;
grant usage, select on sequence public.os_servico_id_os_servico_seq to service_role;

create or replace function public.admin_create_order(p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_client_id integer;
  v_moto_id integer;
  v_os_id integer;
  v_mechanic_id integer;
  v_photo jsonb;
  v_service jsonb;
  v_photos jsonb := coalesce(p_payload->'photos','[]'::jsonb);
  v_services jsonb := coalesce(p_payload->'services','[]'::jsonb);
begin
  if jsonb_typeof(v_photos) is distinct from 'array' then
    raise exception 'A lista de fotos da OS está inválida';
  end if;
  if jsonb_array_length(v_photos) > 8 then
    raise exception 'A OS aceita no máximo oito fotos';
  end if;
  if p_payload->>'photoCaptureVersion'='2' then
    if jsonb_array_length(v_photos) < 4 then
      raise exception 'A OS precisa das quatro fotos obrigatórias e aceita até quatro extras';
    end if;
    if exists (
      select 1 from (values ('front'),('left'),('rear'),('right')) required(position)
      where (select count(*) from jsonb_array_elements(v_photos) as item(value)
             where item.value->>'position'=required.position) <> 1
    ) or (select count(*) from jsonb_array_elements(v_photos) as item(value)
          where item.value->>'position'='extra') > 4
      or exists (select 1 from jsonb_array_elements(v_photos) as item(value)
                 where item.value->>'position' is null
                   or item.value->>'position' not in ('front','left','rear','right','extra')) then
      raise exception 'Envie uma foto obrigatória de cada lado da motocicleta';
    end if;
    if jsonb_typeof(v_services) is distinct from 'array' then
      raise exception 'A lista de serviços da OS está inválida';
    end if;
    if jsonb_array_length(v_services) < 1 or jsonb_array_length(v_services) > 50 then
      raise exception 'Selecione ao menos um serviço previsto';
    end if;
    if nullif(p_payload->>'forecastAt','') is null
      and coalesce((p_payload->>'noForecastConfirmed')::boolean,false) is not true then
      raise exception 'Informe uma previsão ou confirme que ela será comunicada depois';
    end if;
  elsif jsonb_typeof(v_services) is distinct from 'array' then
    raise exception 'A lista de serviços da OS está inválida';
  end if;

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

  for v_photo in select value from jsonb_array_elements(v_photos) loop
    insert into public.foto_os (id_os,tipo,url,posicao)
      values (v_os_id,'entrada',v_photo->>'url',v_photo->>'position');
  end loop;
  for v_service in select value from jsonb_array_elements(v_services) loop
    if nullif(btrim(v_service->>'name'),'') is null
      or nullif(v_service->>'price','') is null
      or (v_service->>'price')::numeric < 0 then
      raise exception 'Há um serviço inválido no pedido';
    end if;
    insert into public.os_servico (id_os,descricao,preco)
      values (v_os_id,btrim(v_service->>'name'),(v_service->>'price')::numeric);
  end loop;
  return jsonb_build_object('id',v_os_id,'clientId',v_client_id,'motorcycleId',v_moto_id);
end $$;

revoke all on function public.admin_create_order(jsonb) from public,anon,authenticated;
grant execute on function public.admin_create_order(jsonb) to service_role;
