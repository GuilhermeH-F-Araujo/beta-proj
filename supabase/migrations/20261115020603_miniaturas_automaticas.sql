create or replace function public.reservar_pedido_miniatura(p_executor uuid,p_limite integer default 30)
returns setof public.miniatura_pedidos language plpgsql set search_path = public as $$
declare tarefa public.miniatura_pedidos; consumo integer;
begin
 -- Serializa o orcamento entre instancias antes de reservar uma tarefa.
 perform pg_advisory_xact_lock(71822401);
 insert into miniatura_consumo(dia) values ((now() at time zone 'utc')::date) on conflict do nothing;
 select geracoes into consumo from miniatura_consumo where dia=(now() at time zone 'utc')::date for update;
 if consumo >= greatest(1,least(p_limite,500)) then return; end if;
 update miniatura_pedidos set status='falhou', erro='Processamento interrompido repetidamente. Revise antes de tentar novamente.', executor=null
 where status='processando' and travado_em < now()-interval '15 minutes' and (falhas>=3 or tentativas>=6);
 select * into tarefa from miniatura_pedidos
 where (status='pendente' and tentar_em<=now() or status='processando' and travado_em<now()-interval '15 minutes')
 and tentativas<6 order by criado_em for update skip locked limit 1;
 if not found then return; end if;
 update miniatura_consumo set geracoes=geracoes+1 where dia=(now() at time zone 'utc')::date;
 update miniatura_pedidos set status='processando',executor=p_executor,travado_em=now(),
 tentativas=tentativas+1, falhas=falhas+case when tarefa.status='processando' then 1 else 0 end, atualizado_em=now()
 where id=tarefa.id returning * into tarefa;
 return next tarefa;
end $$;

create or replace function public.enfileirar_miniaturas_lote(p_modelos jsonb,p_admin uuid)
returns jsonb language plpgsql set search_path=public as $$
declare entrada jsonb; catalogo public.miniatura_catalogo; pedido public.miniatura_pedidos; resultado jsonb:='[]';
begin
 if jsonb_typeof(p_modelos)<>'array' or jsonb_array_length(p_modelos)>100 then raise exception 'Lote invalido'; end if;
 for entrada in select * from jsonb_array_elements(p_modelos) loop
  if length(entrada->>'modelo') not between 3 and 100 or length(entrada->>'chave')<>64 then raise exception 'Modelo invalido'; end if;
  insert into miniatura_catalogo(chave,modelo) values(entrada->>'chave',entrada->>'modelo') on conflict(chave) do nothing;
  select * into catalogo from miniatura_catalogo where chave=entrada->>'chave' for update;
  if catalogo.publicada is not null then resultado:=resultado||jsonb_build_array(jsonb_build_object('modelo',catalogo.modelo,'status','pronta')); continue; end if;
  select * into pedido from miniatura_pedidos where catalogo_id=catalogo.id and status<>'descartada' order by criado_em desc limit 1;
  if found then resultado:=resultado||jsonb_build_array(jsonb_build_object('modelo',catalogo.modelo,'status',pedido.status,'id',pedido.id)); continue; end if;
  insert into miniatura_pedidos(catalogo_id,admin_id,status) values(catalogo.id,p_admin,'pendente') returning * into pedido;
  resultado:=resultado||jsonb_build_array(jsonb_build_object('modelo',catalogo.modelo,'status','pendente','id',pedido.id));
 end loop;
 return resultado;
end $$;
revoke all on function public.enfileirar_miniaturas_lote(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.enfileirar_miniaturas_lote(jsonb,uuid) to service_role;
