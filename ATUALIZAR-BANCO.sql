-- Complemento separado do logradouro; preserva os dados e as politicas existentes.
begin;
alter table public.cliente add column if not exists complemento text;
comment on column public.cliente.complemento is 'Complemento opcional do endereço (apartamento, bloco, sala).';
-- Mantem o complemento acessivel ao perfil e a edicao pela API administrativa.
grant select (complemento), update (complemento) on public.cliente to service_role;

commit;
begin;
create table if not exists public.oficina_painel (
  chave text primary key check (chave in ('catalogo','agenda')),
  dados jsonb not null,
  versao integer not null default 1 check (versao > 0),
  atualizado_em timestamptz not null default now()
);
alter table public.oficina_painel enable row level security;
revoke all on public.oficina_painel from public,anon,authenticated;
grant select,insert,update,delete on public.oficina_painel to service_role;
comment on table public.oficina_painel is 'Cadastros compartilhados do painel; acesso apenas pela API autenticada e autorizada.';
commit;

-- Central de miniaturas: tabelas privadas, fila e publicacao revisada.
begin;
-- Catalogo e candidatos privados. Somente a API autorizada publica imagens.
create table if not exists public.miniatura_catalogo (
 id uuid primary key default gen_random_uuid(), chave text not null unique,
 modelo text not null, ano integer, variante text not null default '',
 moto_id integer, publicada uuid, revisao integer not null default 0,
 atualizado_em timestamptz not null default now()
);
create table if not exists public.miniatura_pedidos (
 id uuid primary key default gen_random_uuid(), catalogo_id uuid not null references public.miniatura_catalogo(id),
 admin_id uuid references auth.users(id), modo text not null default 'referencia' check (modo in ('referencia','preservar')),
 status text not null default 'rascunho' check (status in ('rascunho','pendente','processando','revisao','informacao','falhou','aprovada','descartada')),
 observacoes text not null default '', referencias jsonb not null default '[]', pesquisa jsonb,
 verificacao jsonb, candidato text, correcao text not null default '', tentativas integer not null default 0,
 falhas integer not null default 0, executor uuid, travado_em timestamptz, tentar_em timestamptz not null default now(),
 erro text, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create unique index if not exists miniatura_trabalho_unico on public.miniatura_pedidos(catalogo_id) where status in ('pendente','processando');
create index if not exists miniatura_fila on public.miniatura_pedidos(status,tentar_em);
create table if not exists public.miniatura_envios (
 id uuid primary key default gen_random_uuid(), pedido_id uuid not null references public.miniatura_pedidos(id),
 token_hash text not null unique, expira_em timestamptz not null, cancelado boolean not null default false,
 criado_em timestamptz not null default now()
);
create table if not exists public.miniatura_publicacoes (
 id uuid primary key default gen_random_uuid(), catalogo_id uuid not null references public.miniatura_catalogo(id),
 pedido_id uuid not null references public.miniatura_pedidos(id), caminho text not null,
 admin_id uuid references auth.users(id), criado_em timestamptz not null default now()
);
create table if not exists public.miniatura_consumo (dia date primary key, geracoes integer not null default 0);
alter table public.miniatura_catalogo enable row level security;
alter table public.miniatura_pedidos enable row level security;
alter table public.miniatura_envios enable row level security;
alter table public.miniatura_publicacoes enable row level security;
alter table public.miniatura_consumo enable row level security;
revoke all on public.miniatura_catalogo,public.miniatura_pedidos,public.miniatura_envios,public.miniatura_publicacoes,public.miniatura_consumo from anon,authenticated;
grant all on public.miniatura_catalogo,public.miniatura_pedidos,public.miniatura_envios,public.miniatura_publicacoes,public.miniatura_consumo to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('miniaturas-acervo','miniaturas-acervo',false,12582912,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
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
 where status='processando' and travado_em < now()-interval '15 minutes' and (falhas>=3 or tentativas>=3);
 select * into tarefa from miniatura_pedidos
 where (status='pendente' and tentar_em<=now() or status='processando' and travado_em<now()-interval '15 minutes')
 and tentativas<3 order by criado_em for update skip locked limit 1;
 if not found then return; end if;
 update miniatura_consumo set geracoes=geracoes+1 where dia=(now() at time zone 'utc')::date;
 update miniatura_pedidos set status='processando',executor=p_executor,travado_em=now(),
 tentativas=tentativas+1, falhas=falhas+case when tarefa.status='processando' then 1 else 0 end, atualizado_em=now()
 where id=tarefa.id returning * into tarefa;
 return next tarefa;
end $$;
create or replace function public.adicionar_referencia_miniatura(p_pedido uuid,p_referencia jsonb)
returns boolean language plpgsql set search_path=public as $$
declare tarefa public.miniatura_pedidos;
begin
 select * into tarefa from miniatura_pedidos where id=p_pedido for update;
 if not found or tarefa.status not in ('rascunho','informacao','falhou','revisao') or jsonb_array_length(tarefa.referencias)>=4 then return false; end if;
 update miniatura_pedidos set referencias=referencias||jsonb_build_array(p_referencia),atualizado_em=now() where id=p_pedido;
 return true;
end $$;
create or replace function public.publicar_miniatura(p_pedido uuid,p_admin uuid,p_revisao integer)
returns uuid language plpgsql set search_path=public as $$
declare tarefa public.miniatura_pedidos; catalogo public.miniatura_catalogo; publicacao uuid;
begin
 select * into tarefa from miniatura_pedidos where id=p_pedido for update;
 if not found or tarefa.status<>'revisao' or tarefa.candidato is null then raise exception 'Candidata indisponivel'; end if;
 if coalesce(tarefa.verificacao->>'direcao','')<>'direita' or coalesce(tarefa.verificacao->>'inteira','')<>'true' then raise exception 'Enquadramento nao confirmado'; end if;
 select * into catalogo from miniatura_catalogo where id=tarefa.catalogo_id for update;
 if catalogo.revisao<>p_revisao then raise exception 'A imagem publicada mudou. Atualize a revisao'; end if;
 insert into miniatura_publicacoes(catalogo_id,pedido_id,caminho,admin_id) values(catalogo.id,tarefa.id,tarefa.candidato,p_admin) returning id into publicacao;
 update miniatura_catalogo set publicada=publicacao,revisao=revisao+1,atualizado_em=now() where id=catalogo.id;
 update miniatura_pedidos set status='aprovada',atualizado_em=now() where id=tarefa.id;
 return publicacao;
end $$;
create or replace function public.restaurar_miniatura(p_publicacao uuid,p_admin uuid,p_revisao integer)
returns uuid language plpgsql set search_path=public as $$
declare anterior public.miniatura_publicacoes; catalogo public.miniatura_catalogo; nova uuid;
begin
 select * into anterior from miniatura_publicacoes where id=p_publicacao;
 if not found then raise exception 'Publicacao inexistente'; end if;
 select * into catalogo from miniatura_catalogo where id=anterior.catalogo_id for update;
 if catalogo.revisao<>p_revisao then raise exception 'A imagem publicada mudou'; end if;
 insert into miniatura_publicacoes(catalogo_id,pedido_id,caminho,admin_id) values(catalogo.id,anterior.pedido_id,anterior.caminho,p_admin) returning id into nova;
 update miniatura_catalogo set publicada=nova,revisao=revisao+1,atualizado_em=now() where id=catalogo.id;
 return nova;
end $$;
revoke all on function public.reservar_pedido_miniatura(uuid,integer),public.adicionar_referencia_miniatura(uuid,jsonb),public.publicar_miniatura(uuid,uuid,integer),public.restaurar_miniatura(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.reservar_pedido_miniatura(uuid,integer),public.adicionar_referencia_miniatura(uuid,jsonb),public.publicar_miniatura(uuid,uuid,integer),public.restaurar_miniatura(uuid,uuid,integer) to service_role;

commit;

-- Geracao automatica, lote e limite de seis tentativas.
begin;
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

commit;
begin;

alter table public.admin_notify drop constraint if exists admin_notify_tipo_check;
alter table public.admin_notify add constraint admin_notify_tipo_check check (tipo in (
  'novo_cliente', 'cliente_atualizado', 'nova_os', 'os_atualizada', 'status_os',
  'aguardando_peca', 'pronta', 'entregue', 'cancelada',
  'nova_moto', 'moto_atualizada', 'novo_funcionario', 'funcionario_atualizado',
  'novo_agendamento', 'agendamento_atualizado', 'agendamento_confirmado',
  'agendamento_concluido', 'agendamento_cancelado', 'agendamento_removido',
  'catalogo_atualizado'
));

create or replace function app_private.avisar_cadastro_oficina()
returns trigger language plpgsql security definer set search_path = '' as $$
declare tipo_aviso text; titulo_aviso text; descricao text;
begin
  if tg_table_name = 'moto' then
    if tg_op = 'UPDATE' and
      (to_jsonb(old) - array['atualizado_em','foto','imagem','thumbnail_url','miniatura_id']) is not distinct from
      (to_jsonb(new) - array['atualizado_em','foto','imagem','thumbnail_url','miniatura_id'])
    then return new; end if;
    tipo_aviso := case when tg_op = 'INSERT' then 'nova_moto' else 'moto_atualizada' end;
    titulo_aviso := case when tg_op = 'INSERT' then 'Nova motocicleta' else 'Motocicleta atualizada' end;
    descricao := new.modelo;
  elsif tg_table_name = 'funcionario' then
    if tg_op = 'UPDATE' and
      row(old.nome, old.cargo, old.situacao) is not distinct from row(new.nome, new.cargo, new.situacao)
    then return new; end if;
    tipo_aviso := case when tg_op = 'INSERT' then 'novo_funcionario' else 'funcionario_atualizado' end;
    titulo_aviso := case when tg_op = 'INSERT' then 'Novo funcionário' else 'Funcionário atualizado' end;
    descricao := new.nome;
  else return new;
  end if;
  insert into public.admin_notify(tipo, titulo, mensagem)
    values(tipo_aviso, titulo_aviso, coalesce(descricao, ''));
  return new;
end;
$$;

revoke all on function app_private.avisar_cadastro_oficina() from public, anon, authenticated;
drop trigger if exists avisar_cadastro_oficina on public.moto;
create trigger avisar_cadastro_oficina after insert or update on public.moto
  for each row execute function app_private.avisar_cadastro_oficina();
drop trigger if exists avisar_cadastro_oficina on public.funcionario;
create trigger avisar_cadastro_oficina after insert or update of nome, cargo, situacao on public.funcionario
  for each row execute function app_private.avisar_cadastro_oficina();

create or replace function app_private.avisar_dados_oficina()
returns trigger language plpgsql security definer set search_path = '' as $$
declare dados_anteriores jsonb := '[]'::jsonb;
begin
  if tg_op = 'UPDATE' then
    if old.dados is not distinct from new.dados then return new; end if;
    dados_anteriores := old.dados;
  end if;
  if new.chave = 'catalogo' then
    insert into public.admin_notify(tipo, titulo, mensagem)
      values('catalogo_atualizado', 'Catálogo de serviços atualizado', 'Alterações em serviços ou categorias.');
  elsif new.chave = 'agenda' then
    with anteriores as (
      select distinct on (item->>'id') item->>'id' as id, item
      from jsonb_array_elements(dados_anteriores) item
      where item ? 'id'
      order by item->>'id', item
    ), atuais as (
      select distinct on (item->>'id') item->>'id' as id, item
      from jsonb_array_elements(new.dados) item
      where item ? 'id'
      order by item->>'id', item
    ), alteracoes as (
      select case
        when anteriores.id is null then 'novo_agendamento'
        when atuais.id is null then 'agendamento_removido'
        when anteriores.item->>'status' is distinct from atuais.item->>'status' then
          case atuais.item->>'status'
            when 'Confirmado' then 'agendamento_confirmado'
            when 'Concluído' then 'agendamento_concluido'
            when 'Cancelado' then 'agendamento_cancelado'
            else 'agendamento_atualizado'
          end
        else 'agendamento_atualizado'
      end as tipo, coalesce(atuais.item, anteriores.item) as item
      from anteriores full join atuais using (id)
      where anteriores.item is distinct from atuais.item
    )
    insert into public.admin_notify(tipo, titulo, mensagem)
    select tipo, case tipo
      when 'novo_agendamento' then 'Novo agendamento'
      when 'agendamento_removido' then 'Agendamento removido'
      when 'agendamento_confirmado' then 'Agendamento confirmado'
      when 'agendamento_concluido' then 'Agendamento concluído'
      when 'agendamento_cancelado' then 'Agendamento cancelado'
      else 'Agendamento atualizado'
    end, concat_ws(' · ', item->>'cliente', item->>'data', item->>'hora')
    from alteracoes;
  end if;
  return new;
end;
$$;

revoke all on function app_private.avisar_dados_oficina() from public, anon, authenticated;
drop trigger if exists avisar_dados_oficina on public.oficina_painel;
create trigger avisar_dados_oficina after insert or update of dados on public.oficina_painel
  for each row execute function app_private.avisar_dados_oficina();

commit;

begin;

alter table public.admin_notify drop constraint if exists admin_notify_tipo_check;
alter table public.admin_notify add constraint admin_notify_tipo_check check (tipo in (
  'novo_cliente', 'cliente_atualizado', 'nova_os', 'os_atualizada', 'status_os',
  'aguardando_peca', 'pronta', 'entregue', 'cancelada',
  'nova_moto', 'moto_atualizada', 'novo_funcionario', 'funcionario_atualizado',
  'novo_agendamento', 'agendamento_atualizado', 'agendamento_confirmado',
  'agendamento_concluido', 'agendamento_cancelado', 'agendamento_removido',
  'catalogo_atualizado', 'novo_modelo_miniatura', 'miniatura_em_revisao',
  'miniatura_precisa_informacao', 'miniatura_falhou', 'miniatura_publicada'
));

create or replace function app_private.avisar_miniatura()
returns trigger language plpgsql security definer set search_path = '' as $$
declare tipo_aviso text; titulo_aviso text; modelo_aviso text;
begin
  if tg_table_name = 'miniatura_catalogo' then
    tipo_aviso := 'novo_modelo_miniatura';
    titulo_aviso := 'Novo modelo para miniatura';
    modelo_aviso := new.modelo;
  elsif tg_table_name = 'miniatura_pedidos' then
    if old.status is not distinct from new.status then return new; end if;
    case new.status
      when 'revisao' then
        tipo_aviso := 'miniatura_em_revisao'; titulo_aviso := 'Miniatura pronta para revisão';
      when 'informacao' then
        tipo_aviso := 'miniatura_precisa_informacao'; titulo_aviso := 'Miniatura precisa de informações';
      when 'falhou' then
        tipo_aviso := 'miniatura_falhou'; titulo_aviso := 'Falha na geração de miniatura';
      when 'aprovada' then
        tipo_aviso := 'miniatura_publicada'; titulo_aviso := 'Miniatura publicada';
      else return new;
    end case;
    select modelo into modelo_aviso from public.miniatura_catalogo where id = new.catalogo_id;
  else return new;
  end if;
  insert into public.admin_notify(tipo,titulo,mensagem)
    values (tipo_aviso,titulo_aviso,coalesce(modelo_aviso,''));
  return new;
end;
$$;

revoke all on function app_private.avisar_miniatura() from public,anon,authenticated;
drop trigger if exists avisar_modelo_miniatura on public.miniatura_catalogo;
create trigger avisar_modelo_miniatura after insert on public.miniatura_catalogo
  for each row execute function app_private.avisar_miniatura();
drop trigger if exists avisar_status_miniatura on public.miniatura_pedidos;
create trigger avisar_status_miniatura after update of status on public.miniatura_pedidos
  for each row execute function app_private.avisar_miniatura();

commit;
begin;

create table if not exists public.admin_autoridade (
  id_usuario uuid primary key references auth.users(id) on delete cascade,
  nivel text not null check (nivel in ('superadministrador','dono')),
  criado_em timestamptz not null default now()
);
create table if not exists public.admin_solicitacao (
  id_usuario uuid primary key references auth.users(id) on delete cascade,
  solicitado_por uuid not null references auth.users(id),
  estado text not null default 'pendente' check (estado in ('pendente','aprovado','recusado')),
  decidido_por uuid references auth.users(id),
  solicitado_em timestamptz not null default now(),
  decidido_em timestamptz
);
create table if not exists public.admin_confirmacao (
  hash text primary key check (length(hash)=64),
  id_usuario uuid not null references auth.users(id) on delete cascade,
  id_sessao uuid not null references auth.sessions(id) on delete cascade,
  nivel text,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '10 minutes'
);
create index if not exists admin_confirmacao_sessao_idx on public.admin_confirmacao(id_usuario,id_sessao);
create table if not exists public.admin_tentativa (
  id_usuario uuid primary key references auth.users(id) on delete cascade,
  falhas integer not null default 0,
  bloqueado_ate timestamptz,
  reserva uuid,
  reservada_em timestamptz,
  inicio_em timestamptz not null default now()
);
create table if not exists public.seguranca_auditoria (
  id bigint generated always as identity primary key,
  id_usuario uuid references auth.users(id) on delete set null,
  alvo uuid references auth.users(id) on delete set null,
  evento text not null,
  criado_em timestamptz not null default now()
);
alter table public.admin_autoridade enable row level security;
alter table public.admin_solicitacao enable row level security;
alter table public.admin_confirmacao enable row level security;
alter table public.admin_tentativa enable row level security;
alter table public.seguranca_auditoria enable row level security;
revoke all on public.admin_autoridade,public.admin_solicitacao,public.admin_confirmacao,
  public.admin_tentativa,public.seguranca_auditoria from public,anon,authenticated,service_role;
grant select on public.admin_autoridade,public.admin_solicitacao to service_role;
grant select,delete on public.admin_confirmacao to service_role;
grant select on public.seguranca_auditoria to service_role;

create or replace function public.consultar_nivel_administrativo(p_usuario uuid)
returns text language sql security definer set search_path='' as $$
  select coalesce(a.nivel,'administrador')
  from public.funcionario f
  join auth.users u on u.id=f.auth_user_id
  left join public.admin_autoridade a on a.id_usuario=f.auth_user_id
  where f.auth_user_id=p_usuario and f.cargo='Administrador' and f.perfil_acesso='Administrador'
    and coalesce(f.situacao,'ativo')='ativo'
    and (u.banned_until is null or u.banned_until < now())
    and not exists(select 1 from public.admin_solicitacao s where s.id_usuario=p_usuario and s.estado<>'aprovado');
$$;
revoke all on function public.consultar_nivel_administrativo(uuid) from public,anon,authenticated;
grant execute on function public.consultar_nivel_administrativo(uuid) to service_role;

create or replace function app_private.peso_admin(p_usuario uuid)
returns integer language sql security definer set search_path='' as $$
 select case public.consultar_nivel_administrativo(p_usuario)
   when 'dono' then 3 when 'superadministrador' then 2 when 'administrador' then 1 else 0 end;
$$;
revoke all on function app_private.peso_admin(uuid) from public,anon,authenticated;

create or replace function app_private.proteger_funcionario_admin()
returns trigger language plpgsql security definer set search_path='' as $$
declare autor uuid; nivel_autor integer; nivel_alvo integer;
begin
  if tg_op = 'UPDATE' then
    if row(old.cargo,old.perfil_acesso,old.auth_user_id,old.email,old.situacao)
      is not distinct from row(new.cargo,new.perfil_acesso,new.auth_user_id,new.email,new.situacao)
    then return new; end if;
  end if;
  if (tg_op <> 'INSERT' and old.cargo='Administrador' and old.perfil_acesso='Administrador')
    or (tg_op <> 'DELETE' and new.cargo='Administrador' and new.perfil_acesso='Administrador') then
    perform pg_advisory_xact_lock(74120802);
    autor := nullif(current_setting('app.admin_actor',true),'')::uuid;
    nivel_autor := app_private.peso_admin(autor);
    if tg_op <> 'INSERT' and old.cargo='Administrador' and old.perfil_acesso='Administrador' then
      select case nivel when 'dono' then 3 else 2 end into nivel_alvo
        from public.admin_autoridade where id_usuario=old.auth_user_id;
      nivel_alvo := coalesce(nivel_alvo,1);
      if nivel_autor <= nivel_alvo then
        raise exception using errcode='42501', message='Este administrador exige uma autoridade superior.';
      end if;
    end if;
    if tg_op <> 'DELETE' and new.cargo='Administrador' and new.perfil_acesso='Administrador'
      and nivel_autor < 3
      and (tg_op='INSERT' or old.cargo<>'Administrador' or old.perfil_acesso<>'Administrador') then
      if tg_op <> 'INSERT' or nivel_autor < 1 or not exists(
        select 1 from public.admin_solicitacao where id_usuario=new.auth_user_id
          and solicitado_por=autor and estado='pendente'
      ) then
        raise exception using errcode='42501', message='Somente o dono pode conceder administração.';
      end if;
    end if;
    if tg_op='DELETE' then return old; end if;
    if tg_op='UPDATE' and (new.cargo<>'Administrador' or new.perfil_acesso<>'Administrador') then
      delete from public.admin_autoridade where id_usuario=old.auth_user_id;
      delete from public.admin_confirmacao where id_usuario=old.auth_user_id;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function app_private.proteger_funcionario_admin() from public,anon,authenticated;
drop trigger if exists proteger_funcionario_admin on public.funcionario;
create trigger proteger_funcionario_admin before insert or update or delete on public.funcionario
  for each row execute function app_private.proteger_funcionario_admin();

create or replace function public.registrar_funcionario_protegido(p_payload jsonb,p_actor uuid,p_completo boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare usuario uuid; papel text; cadastro integer; pendente boolean;
begin
  perform pg_advisory_xact_lock(74120802);
  if app_private.peso_admin(p_actor)<1 then raise exception 'Acesso administrativo necessário'; end if;
  usuario := coalesce(p_payload->>'id_usuario_autenticacao',p_payload->>'authUserId')::uuid;
  papel := coalesce(p_payload->>'cargo',p_payload->>'profile');
  pendente := papel='Administrador' and app_private.peso_admin(p_actor)<3;
  perform set_config('app.admin_actor',p_actor::text,true);
  if pendente then
    insert into public.admin_solicitacao(id_usuario,solicitado_por) values(usuario,p_actor);
  end if;
  if p_completo then
    cadastro := public.cadastrar_funcionario(p_payload);
  else
    cadastro := public.admin_register_employee(p_payload);
  end if;
  insert into public.seguranca_auditoria(id_usuario,alvo,evento)
    values(p_actor,usuario,case when pendente then 'administrador_solicitado' else 'funcionario_cadastrado' end);
  return jsonb_build_object('id',cadastro,'approvalPending',pendente);
end;
$$;
revoke all on function public.registrar_funcionario_protegido(jsonb,uuid,boolean) from public,anon,authenticated;
grant execute on function public.registrar_funcionario_protegido(jsonb,uuid,boolean) to service_role;

-- A edicao antiga e substituida para validar a autoridade dentro da transacao.
create or replace function public.admin_update_employee(p_id integer,p_payload jsonb,p_actor uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare alvo public.funcionario; papel text := p_payload->>'cargo'; nivel_alvo integer;
begin
  perform pg_advisory_xact_lock(74120802);
  if app_private.peso_admin(p_actor)<1 then raise exception 'Acesso administrativo necessário'; end if;
  select * into alvo from public.funcionario where id_funcionario=p_id for update;
  if not found then return false; end if;
  if papel not in ('Administrador','Gerente','Mecânico','Cliente') then raise exception 'Cargo inválido'; end if;
  if alvo.cargo='Administrador' and alvo.perfil_acesso='Administrador' then
    select case nivel when 'dono' then 3 else 2 end into nivel_alvo
      from public.admin_autoridade where id_usuario=alvo.auth_user_id;
    if app_private.peso_admin(p_actor)<=coalesce(nivel_alvo,1) then
      raise exception using errcode='42501',message='Este administrador exige uma autoridade superior.';
    end if;
  end if;
  if papel='Administrador' and alvo.cargo<>'Administrador' and app_private.peso_admin(p_actor)<3 then
    raise exception using errcode='42501',message='Somente o dono pode conceder administração.';
  end if;
  perform set_config('app.admin_actor',p_actor::text,true);
  update public.funcionario set
    nome=btrim(p_payload->>'nome'),telefone=nullif(btrim(p_payload->>'telefone'),''),
    cpf=p_payload->>'cpf',data_nascimento=nullif(p_payload->>'nascimento','')::date,
    data_admissao=nullif(p_payload->>'admissao','')::date,
    departamento=nullif(btrim(p_payload->>'departamento'),''),
    especialidade=nullif(btrim(p_payload->>'especialidade'),''),
    endereco=nullif(btrim(p_payload->>'endereco'),''),
    situacao=nullif(p_payload->>'situacao','nao_informado'),cargo=papel,perfil_acesso=papel
  where id_funcionario=p_id;
  if papel='Mecânico' then
    insert into public.mecanico(id_funcionario) values(p_id) on conflict(id_funcionario) do nothing;
  end if;
  insert into public.seguranca_auditoria(id_usuario,alvo,evento) values(p_actor,alvo.auth_user_id,'funcionario_alterado');
  return true;
end;
$$;
revoke all on function public.admin_update_employee(integer,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.admin_update_employee(integer,jsonb,uuid) to service_role;

create or replace function public.decidir_administrador(p_actor uuid,p_alvo uuid,p_nivel text)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(74120802);
  if app_private.peso_admin(p_actor)<>3 then
    raise exception using errcode='42501',message='Somente o dono pode aprovar administradores.';
  end if;
  if p_nivel not in ('administrador','superadministrador','recusado') or p_alvo=p_actor then
    raise exception 'Decisão inválida';
  end if;
  if exists(select 1 from public.admin_autoridade where id_usuario=p_alvo and nivel='dono') then
    raise exception 'O dono permanece protegido.';
  end if;
  if not exists(select 1 from public.funcionario where auth_user_id=p_alvo and cargo='Administrador'
    and perfil_acesso='Administrador' and coalesce(situacao,'ativo')='ativo') then
    raise exception 'Selecione um administrador com cadastro ativo.';
  end if;
  if p_nivel='recusado' and not exists(
    select 1 from public.admin_solicitacao where id_usuario=p_alvo and estado='pendente'
  ) then raise exception 'Não há solicitação pendente.'; end if;
  update public.admin_solicitacao set
    estado=case when p_nivel='recusado' then 'recusado' else 'aprovado' end,
    decidido_por=p_actor,decidido_em=now() where id_usuario=p_alvo;
  delete from public.admin_autoridade where id_usuario=p_alvo;
  if p_nivel='superadministrador' then
    insert into public.admin_autoridade(id_usuario,nivel) values(p_alvo,'superadministrador');
  end if;
  delete from public.admin_confirmacao where id_usuario=p_alvo;
  insert into public.seguranca_auditoria(id_usuario,alvo,evento) values(p_actor,p_alvo,'nivel_'||p_nivel);
end;
$$;
revoke all on function public.decidir_administrador(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.decidir_administrador(uuid,uuid,text) to service_role;

create or replace function public.validar_confirmacao_admin(p_usuario uuid,p_sessao uuid,p_hash text)
returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from public.admin_confirmacao c join auth.sessions s
   on s.id=c.id_sessao and s.user_id=c.id_usuario
   where c.hash=p_hash and c.id_usuario=p_usuario and c.id_sessao=p_sessao
     and c.expira_em>now() and (s.not_after is null or s.not_after>now())
     and c.nivel is not distinct from public.consultar_nivel_administrativo(p_usuario)
     and not exists(select 1 from public.admin_tentativa t where t.id_usuario=p_usuario and t.bloqueado_ate>now()));
$$;

create or replace function public.reservar_confirmacao_admin(p_usuario uuid,p_sessao uuid,p_tentativa uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tentativa public.admin_tentativa;
begin
  if not exists(select 1 from auth.sessions where id=p_sessao and user_id=p_usuario
    and (not_after is null or not_after>now())) then return jsonb_build_object('permitido',false,'espera',30); end if;
  insert into public.admin_tentativa(id_usuario) values(p_usuario) on conflict do nothing;
  select * into tentativa from public.admin_tentativa where id_usuario=p_usuario for update;
  if tentativa.bloqueado_ate>now() then
    return jsonb_build_object('permitido',false,'espera',ceil(extract(epoch from tentativa.bloqueado_ate-now())));
  end if;
  if tentativa.reservada_em>now()-interval '30 seconds' then
    return jsonb_build_object('permitido',false,'espera',30);
  end if;
  update public.admin_tentativa set reserva=p_tentativa,reservada_em=now(),
    falhas=case when bloqueado_ate is not null or inicio_em<now()-interval '15 minutes' then 0 else falhas end,
    inicio_em=case when bloqueado_ate is not null or inicio_em<now()-interval '15 minutes' then now() else inicio_em end,
    bloqueado_ate=null where id_usuario=p_usuario;
  return jsonb_build_object('permitido',true);
end;
$$;

create or replace function public.finalizar_confirmacao_admin(
  p_usuario uuid,p_sessao uuid,p_tentativa uuid,p_sucesso boolean,p_hash text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare tentativa public.admin_tentativa; novas_falhas integer;
begin
  select * into tentativa from public.admin_tentativa where id_usuario=p_usuario for update;
  if not found or tentativa.reserva is distinct from p_tentativa or tentativa.reservada_em<now()-interval '30 seconds' then
    return jsonb_build_object('confirmado',false,'espera',30);
  end if;
  update public.admin_tentativa set reserva=null,reservada_em=null where id_usuario=p_usuario;
  if p_sucesso is null then return jsonb_build_object('confirmado',false); end if;
  if p_sucesso then
    if p_hash is null or length(p_hash)<>64 then raise exception 'Confirmação inválida'; end if;
    delete from public.admin_confirmacao where id_usuario=p_usuario and (id_sessao=p_sessao or expira_em<=now());
    insert into public.admin_confirmacao(hash,id_usuario,id_sessao,nivel)
      values(p_hash,p_usuario,p_sessao,public.consultar_nivel_administrativo(p_usuario));
    update public.admin_tentativa set falhas=0,bloqueado_ate=null,inicio_em=now() where id_usuario=p_usuario;
    insert into public.seguranca_auditoria(id_usuario,evento) values(p_usuario,'senha_confirmada');
    return jsonb_build_object('confirmado',true);
  end if;
  novas_falhas:=tentativa.falhas+1;
  update public.admin_tentativa set falhas=novas_falhas,
    bloqueado_ate=case when novas_falhas>=5 then now()+interval '5 minutes' else null end
    where id_usuario=p_usuario;
  delete from public.admin_confirmacao where id_usuario=p_usuario and id_sessao=p_sessao;
  insert into public.seguranca_auditoria(id_usuario,evento) values(p_usuario,'senha_confirmacao_incorreta');
  return jsonb_build_object('confirmado',false,'restantes',greatest(0,5-novas_falhas),'espera',case when novas_falhas>=5 then 300 else 0 end);
end;
$$;
revoke all on function public.validar_confirmacao_admin(uuid,uuid,text),
  public.reservar_confirmacao_admin(uuid,uuid,uuid),
  public.finalizar_confirmacao_admin(uuid,uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.validar_confirmacao_admin(uuid,uuid,text),
  public.reservar_confirmacao_admin(uuid,uuid,uuid),
  public.finalizar_confirmacao_admin(uuid,uuid,uuid,boolean,text) to service_role;

commit;
begin;
do $$
declare usuario uuid; quantidade integer;
begin
  select count(*), (array_agg(f.auth_user_id))[1] into quantidade,usuario
    from public.funcionario f join auth.users u on u.id=f.auth_user_id
    where lower(f.email)='ednalourdes74@gmail.com' and lower(u.email)='ednalourdes74@gmail.com'
      and f.cargo='Administrador' and f.perfil_acesso='Administrador'
      and coalesce(f.situacao,'ativo')='ativo';
  if quantidade<>1 then raise exception 'A conta de dono deve corresponder a um único administrador ativo.'; end if;
  insert into public.admin_autoridade(id_usuario,nivel) values(usuario,'dono')
    on conflict(id_usuario) do update set nivel='dono';
  insert into public.seguranca_auditoria(id_usuario,alvo,evento) values(usuario,usuario,'dono_definido');
end $$;
commit;

begin;
create or replace function app_private.revogar_confirmacao_senha()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  delete from public.admin_confirmacao where id_usuario=new.id;
  return new;
end;
$$;
revoke all on function app_private.revogar_confirmacao_senha() from public,anon,authenticated,service_role;
create trigger revogar_confirmacao_senha
after update of encrypted_password on auth.users
for each row when (old.encrypted_password is distinct from new.encrypted_password)
execute function app_private.revogar_confirmacao_senha();
commit;

begin;
alter table public.admin_confirmacao alter column expira_em set default now() + interval '15 minutes';

create or replace function app_private.prova_administrativa_valida(p_usuario uuid,p_sessao uuid,p_hash text)
returns setof public.admin_confirmacao language sql security definer set search_path='' as $$
  select c.* from public.admin_confirmacao c
  join auth.sessions s on s.id=c.id_sessao and s.user_id=c.id_usuario
  where c.hash=p_hash and c.id_usuario=p_usuario and c.id_sessao=p_sessao
    and c.expira_em>now() and c.criado_em>now()-interval '1 hour'
    and (s.not_after is null or s.not_after>now())
    and c.nivel is not distinct from public.consultar_nivel_administrativo(p_usuario)
    and not exists(select 1 from public.admin_tentativa t where t.id_usuario=p_usuario and t.bloqueado_ate>now());
$$;
revoke all on function app_private.prova_administrativa_valida(uuid,uuid,text) from public,anon,authenticated,service_role;

create or replace function public.validar_confirmacao_admin(p_usuario uuid,p_sessao uuid,p_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.admin_confirmacao c
    set expira_em=least(now()+interval '15 minutes', c.criado_em+interval '1 hour')
    where c.hash in(select v.hash from app_private.prova_administrativa_valida(p_usuario,p_sessao,p_hash) v);
  return found;
end;
$$;
revoke all on function public.validar_confirmacao_admin(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.validar_confirmacao_admin(uuid,uuid,text) to service_role;

create or replace function public.consultar_confirmacao_admin(p_usuario uuid,p_sessao uuid,p_hash text)
returns jsonb language sql security definer set search_path='' as $$
  with prova as (
    select expira_em,criado_em from app_private.prova_administrativa_valida(p_usuario,p_sessao,p_hash) limit 1
  )
  select jsonb_build_object(
    'active',exists(select 1 from prova),
    'expiresAt',(select expira_em from prova),
    'maximumExpiresAt',(select criado_em+interval '1 hour' from prova),
    'blockedUntil',(select bloqueado_ate from public.admin_tentativa where id_usuario=p_usuario and bloqueado_ate>now())
  );
$$;
revoke all on function public.consultar_confirmacao_admin(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.consultar_confirmacao_admin(uuid,uuid,text) to service_role;

-- As provas antigas usavam um cookie de dez minutos. A primeira acao protegida pede nova confirmacao.
delete from public.admin_confirmacao;
commit;

-- Migration: 20261121211628_logs_unificados_e_limpeza
begin;
set local lock_timeout = '10s';
set local statement_timeout = '90s';
lock table public.seguranca_auditoria,public.os_historico,public.cliente_historico,
  public.admin_solicitacao,public.funcionario_nota,public.cargo_acesso,public.cargo_vinculo,
  public.cargo_historico,recuperacao.os_auditoria,recuperacao.os_status,
  recuperacao.os_observacao,recuperacao.os_backup in access exclusive mode;

-- The security audit becomes the single append-only event store.
alter table public.seguranca_auditoria rename to logs;
alter sequence public.seguranca_auditoria_id_seq rename to logs_id_seq;
alter table public.logs rename constraint seguranca_auditoria_pkey to logs_pkey;
alter table public.logs
  add column categoria text not null default 'seguranca',
  add column entidade text,
  add column entidade_id text,
  add column id_os integer,
  add column id_cliente integer,
  add column nome text,
  add column tipo text,
  add column acao text,
  add column motivo text,
  add column anterior text,
  add column novo text,
  add column texto text,
  add column dados jsonb not null default '{}'::jsonb,
  add column origem text,
  add column id_origem bigint,
  add column origem_tabela text,
  add column id_origem_tabela bigint,
  add column id_auditoria bigint,
  add column metodo text,
  add column rota text,
  add column status_http integer,
  add column ip inet,
  add column user_agent text,
  add column request_id uuid,
  add column resumo text,
  add column ator_nome text,
  add column ator_cargo text,
  add column alvo_nome text,
  add column dia date generated always as ((criado_em at time zone 'America/Sao_Paulo')::date) stored;
alter table public.logs add constraint logs_categoria_check
  check (categoria in ('seguranca','atividade','requisicao'));
alter table public.logs add constraint logs_status_http_check
  check (status_http is null or status_http between 100 and 599);
alter table public.logs alter column evento set default 'atividade_registrada';
create index logs_criado_em_idx on public.logs(criado_em desc,id desc);
create index logs_dia_idx on public.logs(dia desc,id desc);
create index logs_categoria_idx on public.logs(categoria,criado_em desc,id desc);
create index logs_entidade_idx on public.logs(entidade,entidade_id,criado_em desc,id desc);
create index logs_ator_idx on public.logs(id_usuario,criado_em desc,id desc);
create unique index logs_origem_idx on public.logs(entidade,origem,id_origem)
  where origem is not null and id_origem is not null;
alter table public.logs enable row level security;
revoke all on public.logs from public,anon,authenticated,service_role;
grant select,insert on public.logs to service_role;
grant usage,select on sequence public.logs_id_seq to service_role;

create function app_private.preencher_identidade_log() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.entidade is null and new.id_os is not null then
    new.categoria:='atividade';
    new.entidade:='ordem_servico';
    new.entidade_id:=new.id_os::text;
  elsif new.entidade is null and new.id_cliente is not null then
    new.categoria:='atividade';
    new.entidade:='cliente';
    new.entidade_id:=new.id_cliente::text;
  end if;
  if new.evento='atividade_registrada' then
    new.evento:=coalesce(new.tipo,new.acao,'atividade_registrada');
  end if;
  if new.resumo is null then
    new.resumo:=case
      when new.entidade='ordem_servico' and new.tipo='status' then 'Status da OS alterado'
      when new.entidade='ordem_servico' and new.tipo='edicao' then 'OS editada'
      when new.entidade='ordem_servico' and new.tipo='exclusao' then 'OS excluida'
      when new.entidade='cliente' then 'Cliente arquivado'
      else new.evento end;
  end if;
  if new.id_usuario is not null and (new.ator_nome is null or new.ator_cargo is null) then
    select f.nome,f.cargo into new.ator_nome,new.ator_cargo
      from public.funcionario f where f.auth_user_id=new.id_usuario;
  end if;
  if new.alvo is not null and new.alvo_nome is null then
    select f.nome into new.alvo_nome from public.funcionario f where f.auth_user_id=new.alvo;
  end if;
  return new;
end $$;
create trigger logs_identidade before insert on public.logs
for each row execute function app_private.preencher_identidade_log();
update public.logs l set ator_nome=f.nome,ator_cargo=f.cargo
from public.funcionario f where f.auth_user_id=l.id_usuario
  and (l.ator_nome is null or l.ator_cargo is null);

-- Preserve the existing OS/client history in logs before replacing the old tables.
insert into public.logs
  (id_usuario,evento,criado_em,categoria,entidade,entidade_id,id_os,tipo,
   anterior,novo,texto,dados,origem,id_origem,origem_tabela,id_origem_tabela,id_auditoria,resumo)
select h.id_usuario,h.tipo,h.criado_em,'atividade','ordem_servico',h.id_os::text,h.id_os,h.tipo,
       h.anterior,h.novo,h.texto,h.dados,h.origem,h.id_origem,'os_historico',h.id,h.id_auditoria,
       case h.tipo when 'status' then 'Status da OS alterado'
         when 'edicao' then 'OS editada' when 'exclusao' then 'OS excluida'
         when 'observacao_anterior' then 'Observacao anterior da OS registrada'
         when 'nota_status' then 'Nota de status da OS registrada'
         else 'Evento da OS registrado' end
from public.os_historico h;

insert into public.logs
  (id_usuario,evento,criado_em,categoria,entidade,entidade_id,id_cliente,nome,acao,motivo,dados,origem,id_origem,origem_tabela,id_origem_tabela,resumo)
select h.id_usuario,h.acao,h.criado_em,'atividade','cliente',h.id_cliente::text,h.id_cliente,
       h.nome,h.acao,h.motivo,jsonb_build_object('nome',h.nome),null,null,'cliente_historico',h.id,'Cliente arquivado'
from public.cliente_historico h;

-- Carry admin access requests and their final decisions into the event stream.
insert into public.logs
  (id_usuario,alvo,evento,criado_em,categoria,entidade,entidade_id,origem_tabela,dados,resumo)
select solicitado_por,id_usuario,
       case when estado='pendente' then 'administrador_solicitado'
            else 'solicitacao_administrador_'||estado end,
       solicitado_em,'seguranca','solicitacao_administrador',id_usuario::text,'admin_solicitacao',
       jsonb_build_object('estado',estado,'solicitado_por',solicitado_por,
         'solicitado_em',solicitado_em,'decidido_por',decidido_por,'decidido_em',decidido_em),
       'Solicitacao de acesso administrativo: '||estado
from public.admin_solicitacao;

do $$
begin
  if (select count(*) from public.logs where origem_tabela='os_historico') <>
     (select count(*) from public.os_historico) then
    raise exception 'Historico de OS nao foi preservado integralmente em logs';
  end if;
  if (select count(*) from public.logs where origem_tabela='cliente_historico') <>
     (select count(*) from public.cliente_historico) then
    raise exception 'Historico de clientes nao foi preservado integralmente em logs';
  end if;
  if (select count(*) from public.logs where origem_tabela='admin_solicitacao') <>
     (select count(*) from public.admin_solicitacao) then
    raise exception 'Solicitacoes administrativas nao foram preservadas integralmente em logs';
  end if;
  if exists(select 1 from public.cargo_vinculo) then
    raise exception 'Ha funcionarios ligados a cargos rejeitados; revise as permissoes antes de removelos';
  end if;
  if exists(select 1 from recuperacao.os_auditoria) or exists(select 1 from recuperacao.os_status)
    or exists(select 1 from recuperacao.os_observacao) or exists(select 1 from recuperacao.os_backup) then
    raise exception 'O arquivo de recuperacao possui dados; consolide-os em logs antes de remover';
  end if;
end $$;

-- The previous role tables had no active links. Preserve their seeded access policy by role.
create or replace function permissoes_privadas.pode_ler_ordem(p_moto integer) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); f record;
begin
 if u is null or not exists(select 1 from auth.users where id=u and (banned_until is null or banned_until<=now())) then return false; end if;
 select cargo,perfil_acesso,situacao into f from public.funcionario where auth_user_id=u;
 if found then
  if f.cargo='Administrador' and f.perfil_acesso='Administrador' then return true; end if;
  return f.situacao='ativo' and f.cargo in ('Gerente','Mecânico');
 end if;
 return exists(select 1 from public.moto m join public.cliente cli on cli.id_cliente=m.id_cliente
   where m.id_moto=p_moto and cli.auth_user_id=u and cli.excluido_em is null);
end $$;

-- Repoint stored procedures that wrote the former histories/audit table to logs.
do $$
declare func record; definicao text;
begin
  for func in
    select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','app_private') and p.prokind='f'
      and (pg_get_functiondef(p.oid) like '%public.os_historico%'
        or pg_get_functiondef(p.oid) like '%public.cliente_historico%'
        or pg_get_functiondef(p.oid) like '%public.seguranca_auditoria%')
  loop
    definicao:=pg_get_functiondef(func.oid);
    definicao:=replace(definicao,'public.os_historico','public.logs');
    definicao:=replace(definicao,'public.cliente_historico','public.logs');
    definicao:=replace(definicao,'public.seguranca_auditoria','public.logs');
    execute definicao;
  end loop;
end $$;

create or replace function public.consultar_nivel_administrativo(p_usuario uuid)
returns text language sql security definer set search_path='' as $$
  select coalesce(a.nivel,'administrador')
  from public.funcionario f
  join auth.users u on u.id=f.auth_user_id
  left join public.admin_autoridade a on a.id_usuario=f.auth_user_id
  where f.auth_user_id=p_usuario and f.cargo='Administrador' and f.perfil_acesso='Administrador'
    and coalesce(f.situacao,'ativo')='ativo'
    and (u.banned_until is null or u.banned_until<now())
    and coalesce((select l.dados->>'estado' from public.logs l
      where l.entidade='solicitacao_administrador' and l.entidade_id=p_usuario::text
      order by l.criado_em desc,l.id desc limit 1),'aprovado')='aprovado';
$$;
revoke all on function public.consultar_nivel_administrativo(uuid) from public,anon,authenticated;
grant execute on function public.consultar_nivel_administrativo(uuid) to service_role;

create or replace function app_private.proteger_funcionario_admin()
returns trigger language plpgsql security definer set search_path='' as $$
declare autor uuid; nivel_autor integer; nivel_alvo integer; pedido jsonb;
begin
  if tg_op='UPDATE' and row(old.cargo,old.perfil_acesso,old.auth_user_id,old.email,old.situacao)
    is not distinct from row(new.cargo,new.perfil_acesso,new.auth_user_id,new.email,new.situacao) then return new; end if;
  if (tg_op<>'DELETE' and old.cargo='Administrador' and old.perfil_acesso='Administrador')
    or (tg_op<>'INSERT' and new.cargo='Administrador' and new.perfil_acesso='Administrador') then
    perform pg_advisory_xact_lock(74120802);
    autor:=nullif(current_setting('app.admin_actor',true),'')::uuid;
    nivel_autor:=app_private.peso_admin(autor);
    if tg_op<>'INSERT' and old.cargo='Administrador' and old.perfil_acesso='Administrador' then
      select case nivel when 'dono' then 3 else 2 end into nivel_alvo
        from public.admin_autoridade where id_usuario=old.auth_user_id;
      nivel_alvo:=coalesce(nivel_alvo,1);
      if nivel_autor<=nivel_alvo then raise exception using errcode='42501',message='Este administrador exige uma autoridade superior.'; end if;
    end if;
    if tg_op<>'DELETE' and new.cargo='Administrador' and new.perfil_acesso='Administrador'
      and nivel_autor<3 and (tg_op='INSERT' or old.cargo<>'Administrador' or old.perfil_acesso<>'Administrador') then
      select l.dados into pedido from public.logs l
       where l.entidade='solicitacao_administrador' and l.entidade_id=new.auth_user_id::text
       order by l.criado_em desc,l.id desc limit 1;
      if tg_op<>'INSERT' or nivel_autor<1 or coalesce(pedido->>'estado','')<>'pendente'
        or pedido->>'solicitado_por' is distinct from autor::text then
        raise exception using errcode='42501',message='Somente o dono pode conceder administração.';
      end if;
    end if;
    if tg_op='DELETE' then return old; end if;
    if tg_op='UPDATE' and (new.cargo<>'Administrador' or new.perfil_acesso<>'Administrador') then
      delete from public.admin_autoridade where id_usuario=old.auth_user_id;
      delete from public.admin_confirmacao where id_usuario=old.auth_user_id;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

create or replace function public.registrar_funcionario_protegido(p_payload jsonb,p_actor uuid,p_completo boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare usuario uuid; papel text; cadastro integer; pendente boolean; agora timestamptz:=now();
begin
  perform pg_advisory_xact_lock(74120802);
  if app_private.peso_admin(p_actor)<1 then raise exception 'Acesso administrativo necessario'; end if;
  usuario:=coalesce(p_payload->>'id_usuario_autenticacao',p_payload->>'authUserId')::uuid;
  papel:=coalesce(p_payload->>'cargo',p_payload->>'profile');
  pendente:=papel='Administrador' and app_private.peso_admin(p_actor)<3;
  perform set_config('app.admin_actor',p_actor::text,true);
  if pendente then
    insert into public.logs(id_usuario,alvo,evento,criado_em,categoria,entidade,entidade_id,dados,resumo)
    values(p_actor,usuario,'administrador_solicitado',agora,'seguranca','solicitacao_administrador',usuario::text,
      jsonb_build_object('estado','pendente','solicitado_por',p_actor,'solicitado_em',agora,
        'decidido_por',null,'decidido_em',null),'Solicitacao de acesso administrativo');
  end if;
  if p_completo then cadastro:=public.cadastrar_funcionario(p_payload);
  else cadastro:=public.admin_register_employee(p_payload); end if;
  insert into public.logs(id_usuario,alvo,evento,categoria,entidade,entidade_id,dados,resumo)
  values(p_actor,usuario,'funcionario_cadastrado','atividade','funcionario',usuario::text,
    jsonb_build_object('approvalPending',pendente),
    case when pendente then 'Funcionario cadastrado; aguardando aprovacao administrativa'
      else 'Funcionario cadastrado' end);
  return jsonb_build_object('id',cadastro,'approvalPending',pendente);
end;
$$;
revoke all on function public.registrar_funcionario_protegido(jsonb,uuid,boolean) from public,anon,authenticated;
grant execute on function public.registrar_funcionario_protegido(jsonb,uuid,boolean) to service_role;

create or replace function public.decidir_administrador(p_actor uuid,p_alvo uuid,p_nivel text)
returns void language plpgsql security definer set search_path='' as $$
declare pedido jsonb; estado_atual text; agora timestamptz:=now();
begin
  perform pg_advisory_xact_lock(74120802);
  if app_private.peso_admin(p_actor)<>3 then raise exception using errcode='42501',message='Somente o dono pode aprovar administradores.'; end if;
  if p_nivel not in ('administrador','superadministrador','recusado') or p_alvo=p_actor then raise exception 'Decisao invalida'; end if;
  if exists(select 1 from public.admin_autoridade where id_usuario=p_alvo and nivel='dono') then raise exception 'O dono permanece protegido.'; end if;
  if not exists(select 1 from public.funcionario where auth_user_id=p_alvo and cargo='Administrador'
    and perfil_acesso='Administrador' and coalesce(situacao,'ativo')='ativo') then raise exception 'Selecione um administrador com cadastro ativo.'; end if;
  select l.dados into pedido from public.logs l where l.entidade='solicitacao_administrador'
    and l.entidade_id=p_alvo::text order by l.criado_em desc,l.id desc limit 1;
  if p_nivel='recusado' and pedido->>'estado' is distinct from 'pendente' then raise exception 'Nao ha solicitacao pendente.'; end if;
  estado_atual:=case when p_nivel='recusado' then 'recusado' else 'aprovado' end;
  if pedido is not null then
    insert into public.logs(id_usuario,alvo,evento,criado_em,categoria,entidade,entidade_id,dados,resumo)
    values(p_actor,p_alvo,'solicitacao_administrador_'||estado_atual,agora,'seguranca',
      'solicitacao_administrador',p_alvo::text,
      pedido||jsonb_build_object('estado',estado_atual,'decidido_por',p_actor,'decidido_em',agora),
      'Solicitacao de acesso administrativo: '||estado_atual);
  end if;
  delete from public.admin_autoridade where id_usuario=p_alvo;
  if p_nivel='superadministrador' then insert into public.admin_autoridade(id_usuario,nivel) values(p_alvo,'superadministrador'); end if;
  delete from public.admin_confirmacao where id_usuario=p_alvo;
  insert into public.logs(id_usuario,alvo,evento,categoria,entidade,entidade_id,resumo)
  values(p_actor,p_alvo,'nivel_'||p_nivel,'seguranca','conta',p_alvo::text,'Nivel administrativo definido: '||p_nivel);
end;
$$;
revoke all on function public.decidir_administrador(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.decidir_administrador(uuid,uuid,text) to service_role;

create or replace function public.finalizar_confirmacao_admin(
  p_usuario uuid,p_sessao uuid,p_tentativa uuid,p_sucesso boolean,p_hash text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare tentativa public.admin_tentativa; novas_falhas integer; bloqueio timestamptz;
begin
  select * into tentativa from public.admin_tentativa where id_usuario=p_usuario for update;
  if not found or tentativa.reserva is distinct from p_tentativa
    or tentativa.reservada_em<now()-interval '30 seconds' then
    return jsonb_build_object('confirmado',false,'espera',30);
  end if;
  update public.admin_tentativa set reserva=null,reservada_em=null where id_usuario=p_usuario;
  if p_sucesso is null then return jsonb_build_object('confirmado',false); end if;
  if p_sucesso then
    if p_hash is null or length(p_hash)<>64 then raise exception 'Confirmacao invalida'; end if;
    delete from public.admin_confirmacao where id_usuario=p_usuario and (id_sessao=p_sessao or expira_em<=now());
    insert into public.admin_confirmacao(hash,id_usuario,id_sessao,nivel)
      values(p_hash,p_usuario,p_sessao,public.consultar_nivel_administrativo(p_usuario));
    update public.admin_tentativa set falhas=0,bloqueado_ate=null,inicio_em=now() where id_usuario=p_usuario;
    insert into public.logs(id_usuario,alvo,evento,categoria,entidade,entidade_id,dados,resumo)
      values(p_usuario,p_usuario,'senha_confirmada','seguranca','conta',p_usuario::text,
        jsonb_build_object('sessao',p_sessao,'nivel',public.consultar_nivel_administrativo(p_usuario)),
        'Senha administrativa confirmada');
    return jsonb_build_object('confirmado',true);
  end if;
  novas_falhas:=tentativa.falhas+1;
  bloqueio:=case when novas_falhas>=5 then now()+interval '5 minutes' else null end;
  update public.admin_tentativa set falhas=novas_falhas,bloqueado_ate=bloqueio
    where id_usuario=p_usuario;
  delete from public.admin_confirmacao where id_usuario=p_usuario and id_sessao=p_sessao;
  insert into public.logs(id_usuario,alvo,evento,categoria,entidade,entidade_id,dados,resumo)
    values(p_usuario,p_usuario,'senha_confirmacao_incorreta','seguranca','conta',p_usuario::text,
      jsonb_build_object('sessao',p_sessao,'falhas',novas_falhas,'bloqueado_ate',bloqueio,
        'tentativas_restantes',greatest(0,5-novas_falhas)),
      case when bloqueio is null then 'Senha de confirmacao incorreta'
        else 'Conta temporariamente bloqueada apos falhas de confirmacao' end);
  return jsonb_build_object('confirmado',false,'restantes',greatest(0,5-novas_falhas),
    'espera',case when novas_falhas>=5 then 300 else 0 end);
end;
$$;
revoke all on function public.finalizar_confirmacao_admin(uuid,uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.finalizar_confirmacao_admin(uuid,uuid,uuid,boolean,text) to service_role;

drop table public.os_historico;
drop table public.cliente_historico;
drop table public.admin_solicitacao;

-- These features were not approved and have no active linked users.
drop function public.salvar_cargo_acesso(uuid,text,text,jsonb,boolean,integer[],integer,uuid);
insert into public.logs(id_usuario,evento,criado_em,categoria,entidade,entidade_id,dados,resumo)
select id_usuario,'cargo_permissao_alterado',criado_em,'atividade','cargo_acesso',id_cargo::text,dados,
  'Alteracao historica de cargo migrada para logs'
from public.cargo_historico;
do $$
begin
  if (select count(*) from public.logs where evento='cargo_permissao_alterado') <>
     (select count(*) from public.cargo_historico) then
    raise exception 'Historico dos cargos removidos nao foi preservado em logs';
  end if;
end $$;
drop table public.cargo_historico;
drop table public.cargo_vinculo;
drop table public.cargo_acesso;
insert into public.logs(id_usuario,evento,categoria,entidade,entidade_id,dados,resumo,criado_em)
select id_usuario,'funcionario_nota_removida','atividade','funcionario',id_funcionario::text,
  jsonb_build_object('id_anotacao',id,'criada_em',criado_em),
  'Anotacao removida durante a limpeza do percurso',now()
from public.funcionario_nota;
do $$
begin
  if (select count(*) from public.logs where evento='funcionario_nota_removida') <>
     (select count(*) from public.funcionario_nota) then
    raise exception 'Metadados das anotacoes removidas nao foram preservados em logs';
  end if;
end $$;
drop table public.funcionario_nota;

-- Old source archives were already consolidated and verified by prior migrations.
drop table if exists recuperacao.os_status;
drop table if exists recuperacao.os_observacao;
drop table if exists recuperacao.os_backup;
drop table if exists recuperacao.os_auditoria;

notify pgrst,'reload schema';

commit;

-- Migration: 20261121212045_catalogo_servicos_agendamento
begin;
set local lock_timeout = '10s';
set local statement_timeout = '90s';
lock table public.oficina_painel, public.agendamento in access exclusive mode;

do $$
declare catalogo jsonb; agenda jsonb;
begin
  select dados into catalogo from public.oficina_painel where chave='catalogo';
  select dados into agenda from public.oficina_painel where chave='agenda';
  if catalogo is null or jsonb_typeof(catalogo->'servicos') <> 'array'
    or jsonb_typeof(catalogo->'categorias') <> 'array' then
    raise exception 'O catalogo atual nao possui o formato esperado; nenhuma tabela foi alterada';
  end if;
  if coalesce(jsonb_array_length(agenda),0) > 0 then
    raise exception 'A chave agenda ainda possui registros; migre-os para agendamento antes de continuar';
  end if;
end $$;

create table public.categorias_servico (
  id text primary key,
  nome text not null check (length(trim(nome)) between 1 and 150),
  descricao text not null default '',
  cor text not null check (cor ~ '^#[A-Fa-f0-9]{6}$'),
  icone text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.servicos (
  id text primary key,
  nome text not null check (length(trim(nome)) between 1 and 150),
  categoria_id text not null references public.categorias_servico(id) on update cascade on delete restrict,
  descricao text not null default '',
  preco numeric(12,2) not null check (preco >= 0),
  custo numeric(12,2) not null check (custo >= 0),
  duracao text not null default '',
  ativo boolean not null default true,
  icone text not null default '',
  adicional text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index servicos_categoria_ativo_idx on public.servicos(categoria_id,ativo,nome);
create index servicos_nome_idx on public.servicos using gin (to_tsvector('simple',nome));

create table public.servicos_catalogo_versao (
  id boolean primary key default true check (id),
  versao integer not null check (versao > 0),
  atualizado_em timestamptz not null default now()
);

insert into public.categorias_servico (id,nome,descricao,cor,icone)
select categoria->>'id',categoria->>'nome',coalesce(categoria->>'descricao',''),
       categoria->>'cor',coalesce(categoria->>'icone','')
from public.oficina_painel p
cross join lateral jsonb_array_elements(p.dados->'categorias') categoria
where p.chave='catalogo';

insert into public.servicos
  (id,nome,categoria_id,descricao,preco,custo,duracao,ativo,icone,adicional)
select servico->>'id',servico->>'nome',servico->>'categoriaId',
       coalesce(servico->>'descricao',''),(servico->>'preco')::numeric,
       (servico->>'custo')::numeric,coalesce(servico->>'duracao',''),
       coalesce((servico->>'ativo')::boolean,true),coalesce(servico->>'icone',''),
       coalesce(servico->>'adicional','')
from public.oficina_painel p
cross join lateral jsonb_array_elements(p.dados->'servicos') servico
where p.chave='catalogo';

insert into public.servicos_catalogo_versao(id,versao,atualizado_em)
select true,versao,atualizado_em from public.oficina_painel where chave='catalogo';

do $$
declare quantidade_servicos integer; quantidade_categorias integer;
begin
  select count(*) into quantidade_servicos from public.servicos;
  select count(*) into quantidade_categorias from public.categorias_servico;
  if quantidade_servicos <> jsonb_array_length(
    (select dados->'servicos' from public.oficina_painel where chave='catalogo')) then
    raise exception 'A migracao do catalogo nao preservou todos os servicos';
  end if;
  if quantidade_categorias <> jsonb_array_length(
    (select dados->'categorias' from public.oficina_painel where chave='catalogo')) then
    raise exception 'A migracao do catalogo nao preservou todas as categorias';
  end if;
end $$;

create function public.substituir_catalogo_servicos(
  p_versao integer,
  p_categorias jsonb,
  p_servicos jsonb,
  p_actor uuid
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare versao_atual integer;
begin
  if jsonb_typeof(p_categorias) <> 'array' or jsonb_typeof(p_servicos) <> 'array'
    or jsonb_array_length(p_categorias) > 1000 or jsonb_array_length(p_servicos) > 10000 then
    raise exception using errcode='22023',message='Formato de catalogo invalido';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_categorias) item
    group by item->>'id' having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(p_servicos) item
    group by item->>'id' having count(*) > 1
  ) then
    raise exception using errcode='22023',message='IDs duplicados no catalogo';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_servicos) item
    where not exists (
      select 1 from jsonb_array_elements(p_categorias) categoria
      where categoria->>'id'=item->>'categoria_id'
    )
  ) then
    raise exception using errcode='23503',message='Servico aponta para categoria inexistente';
  end if;

  select versao into versao_atual
  from public.servicos_catalogo_versao where id=true for update;
  if versao_atual is distinct from p_versao then
    raise exception using errcode='40001',message='Catalogo atualizado por outra sessao';
  end if;

  insert into public.categorias_servico(id,nome,descricao,cor,icone,atualizado_em)
  select item.id,item.nome,item.descricao,item.cor,item.icone,now()
  from jsonb_to_recordset(p_categorias) as item(
    id text,nome text,descricao text,cor text,icone text
  )
  on conflict(id) do update set nome=excluded.nome,descricao=excluded.descricao,
    cor=excluded.cor,icone=excluded.icone,atualizado_em=now();

  delete from public.servicos s where not exists (
    select 1 from jsonb_array_elements(p_servicos) item where item->>'id'=s.id
  );
  insert into public.servicos
    (id,nome,categoria_id,descricao,preco,custo,duracao,ativo,icone,adicional,atualizado_em)
  select item.id,item.nome,item.categoria_id,item.descricao,item.preco,item.custo,
         item.duracao,item.ativo,item.icone,item.adicional,now()
  from jsonb_to_recordset(p_servicos) as item(
    id text,nome text,categoria_id text,descricao text,preco numeric,custo numeric,
    duracao text,ativo boolean,icone text,adicional text
  )
  on conflict(id) do update set nome=excluded.nome,categoria_id=excluded.categoria_id,
    descricao=excluded.descricao,preco=excluded.preco,custo=excluded.custo,
    duracao=excluded.duracao,ativo=excluded.ativo,icone=excluded.icone,
    adicional=excluded.adicional,atualizado_em=now();

  delete from public.categorias_servico c where not exists (
    select 1 from jsonb_array_elements(p_categorias) item where item->>'id'=c.id
  );
  update public.servicos_catalogo_versao
  set versao=versao_atual+1,atualizado_em=now() where id=true;
  insert into public.logs(id_usuario,evento,categoria,entidade,entidade_id,acao,dados,resumo)
  values(p_actor,'catalogo_servicos_atualizado','atividade','servicos','catalogo','editar',
    jsonb_build_object('versao_anterior',versao_atual,'versao_nova',versao_atual+1,
      'quantidade_categorias',jsonb_array_length(p_categorias),
      'quantidade_servicos',jsonb_array_length(p_servicos)),
    'Catalogo de servicos atualizado');
  return versao_atual+1;
end;
$$;

revoke all on function public.substituir_catalogo_servicos(integer,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.substituir_catalogo_servicos(integer,jsonb,jsonb,uuid) to service_role;

alter table public.categorias_servico enable row level security;
alter table public.servicos enable row level security;
alter table public.servicos_catalogo_versao enable row level security;
revoke all on public.categorias_servico,public.servicos,public.servicos_catalogo_versao from public,anon,authenticated;
grant select,insert,update,delete on public.categorias_servico,public.servicos to service_role;
grant select on public.servicos_catalogo_versao to service_role;

alter table public.agendamento add column duracao text not null default '1 hora';
select setval(pg_get_serial_sequence('public.agendamento','id_agendamento')::regclass,
  coalesce((select max(id_agendamento) from public.agendamento),0)+1,false);

create function app_private.registrar_log_agendamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare ator uuid:=coalesce(nullif(current_setting('app.admin_actor',true),'')::uuid,auth.uid());
begin
  if tg_op='INSERT' then
    insert into public.logs(id_usuario,evento,categoria,entidade,entidade_id,acao,dados,resumo)
    values(ator,'agendamento_criado','atividade','agendamento',new.id_agendamento::text,'criar',
      jsonb_build_object('id_cliente',new.id_cliente,'id_moto',new.id_moto,
        'id_mecanico',new.id_mecanico,'data_hora',new.data_hora,'servico',new.servico_solicitado,
        'status',new.status,'duracao',new.duracao),'Agendamento criado');
    return new;
  elsif tg_op='UPDATE' then
    insert into public.logs(id_usuario,evento,categoria,entidade,entidade_id,acao,dados,resumo)
    values(ator,'agendamento_atualizado','atividade','agendamento',new.id_agendamento::text,'editar',
      jsonb_build_object('id_cliente_anterior',old.id_cliente,'id_cliente',new.id_cliente,
        'id_moto_anterior',old.id_moto,'id_moto',new.id_moto,
        'id_mecanico_anterior',old.id_mecanico,'id_mecanico',new.id_mecanico,
        'data_hora_anterior',old.data_hora,'data_hora',new.data_hora,
        'servico_anterior',old.servico_solicitado,'servico',new.servico_solicitado,
        'status_anterior',old.status,'status',new.status,
        'duracao_anterior',old.duracao,'duracao',new.duracao),'Agendamento atualizado');
    return new;
  end if;
  insert into public.logs(id_usuario,evento,categoria,entidade,entidade_id,acao,dados,resumo)
  values(ator,'agendamento_removido','atividade','agendamento',old.id_agendamento::text,'excluir',
    jsonb_build_object('id_cliente',old.id_cliente,'id_moto',old.id_moto,
      'id_mecanico',old.id_mecanico,'data_hora',old.data_hora,'servico',old.servico_solicitado,
      'status',old.status,'duracao',old.duracao),'Agendamento removido');
  return old;
end;
$$;
revoke all on function app_private.registrar_log_agendamento() from public,anon,authenticated;
grant execute on function app_private.registrar_log_agendamento() to service_role;
create trigger logs_agendamento after insert or update or delete on public.agendamento
for each row execute function app_private.registrar_log_agendamento();

create function public.criar_agendamento_admin(
  p_cliente integer,p_moto integer,p_mecanico integer,p_data_hora timestamp,
  p_servico text,p_observacoes text,p_duracao text,p_status text,p_actor uuid
) returns integer
language plpgsql security definer set search_path = '' as $$
declare novo_id integer;
begin
  perform set_config('app.admin_actor',p_actor::text,true);
  insert into public.agendamento
    (id_cliente,id_moto,id_mecanico,data_hora,servico_solicitado,problema_descricao,
     observacoes,duracao,status)
  values(p_cliente,p_moto,p_mecanico,p_data_hora,p_servico,'',p_observacoes,p_duracao,p_status)
  returning id_agendamento into novo_id;
  return novo_id;
end;
$$;

create function public.editar_agendamento_admin(
  p_id integer,p_cliente integer,p_moto integer,p_mecanico integer,p_data_hora timestamp,
  p_servico text,p_observacoes text,p_duracao text,p_status text,p_actor uuid
) returns integer
language plpgsql security definer set search_path = '' as $$
declare alterado_id integer;
begin
  perform set_config('app.admin_actor',p_actor::text,true);
  update public.agendamento set id_cliente=p_cliente,id_moto=p_moto,id_mecanico=p_mecanico,
    data_hora=p_data_hora,servico_solicitado=p_servico,observacoes=p_observacoes,
    duracao=p_duracao,status=p_status
  where id_agendamento=p_id returning id_agendamento into alterado_id;
  if alterado_id is null then
    raise exception using errcode='P0002',message='Agendamento nao encontrado';
  end if;
  return alterado_id;
end;
$$;

create function public.excluir_agendamento_admin(p_id integer,p_actor uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare removido integer;
begin
  perform set_config('app.admin_actor',p_actor::text,true);
  delete from public.agendamento where id_agendamento=p_id
  returning id_agendamento into removido;
  return removido is not null;
end;
$$;
revoke all on function public.criar_agendamento_admin(integer,integer,integer,timestamp,text,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.editar_agendamento_admin(integer,integer,integer,integer,timestamp,text,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.excluir_agendamento_admin(integer,uuid) from public,anon,authenticated;
grant execute on function public.criar_agendamento_admin(integer,integer,integer,timestamp,text,text,text,text,uuid) to service_role;
grant execute on function public.editar_agendamento_admin(integer,integer,integer,integer,timestamp,text,text,text,text,uuid) to service_role;
grant execute on function public.excluir_agendamento_admin(integer,uuid) to service_role;

drop table public.oficina_painel;
comment on table public.servicos is 'Catalogo de servicos ativos e inativos da oficina.';
comment on table public.categorias_servico is 'Categorias do catalogo de servicos.';
comment on table public.agendamento is 'Agendamentos vinculados a clientes, motos e mecanicos cadastrados.';
notify pgrst,'reload schema';
commit;

-- Migration: 20261121212220_indices_agendamento_logs
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

create index if not exists agendamento_cliente_idx on public.agendamento(id_cliente);
create index if not exists agendamento_moto_idx on public.agendamento(id_moto);
create index if not exists agendamento_mecanico_idx on public.agendamento(id_mecanico);
create index if not exists logs_alvo_idx on public.logs(alvo) where alvo is not null;

notify pgrst,'reload schema';
commit;

-- Migration: 20261121213441_acesso_api_agendamentos
begin;
set local lock_timeout = '10s';

-- The API authorizes the administrator before reading appointments.
grant select on public.agendamento to service_role;

notify pgrst,'reload schema';
commit;

-- Migration: 20261122210000_catalogo_realtime_e_categorias_vazias
begin;

-- Categorias vazias da migracao inicial nao representam cadastro do usuario.
do $$
declare versao_atual integer; removidas integer := 0; servicos_demonstracao integer := 0;
begin
  select versao into versao_atual
  from public.servicos_catalogo_versao
  where id = true
  for update;
  if versao_atual = 1 then
    delete from public.servicos
    where id in (
      'svc-diagnostico', 'svc-bateria', 'svc-pastilha', 'svc-carburador',
      'svc-revisao', 'svc-oleo', 'svc-balanceamento', 'svc-corrente'
    );
    get diagnostics servicos_demonstracao = row_count;
    delete from public.categorias_servico categoria
    where not exists (
      select 1 from public.servicos servico
      where servico.categoria_id = categoria.id
    );
    get diagnostics removidas = row_count;
    if removidas + servicos_demonstracao > 0 then
      update public.servicos_catalogo_versao
      set versao = versao + 1, atualizado_em = now()
      where id = true;
    end if;
  end if;
end $$;

-- Publica a revisao do catalogo para a API enviar atualizacoes em tempo real.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'servicos_catalogo_versao'
    ) then
    alter publication supabase_realtime add table public.servicos_catalogo_versao;
  end if;
end $$;

commit;

-- Migration: 20261122215354_realtime_todas_tabelas_e_dados_oficina
begin;

create table if not exists public.configuracao_oficina (
  id boolean primary key default true check (id),
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);

alter table public.configuracao_oficina enable row level security;
revoke all on public.configuracao_oficina from public, anon, authenticated;
grant select, insert, update on public.configuracao_oficina to service_role;
comment on table public.configuracao_oficina is
  'Dados compartilhados de perfil, endereço e horário da oficina; acesso pela API autenticada do painel.';

do $$
declare
  tabela record;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'A publicação supabase_realtime não existe neste projeto.';
  end if;

  for tabela in
    select n.nspname as esquema, c.relname as nome
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not exists (
        select 1
        from pg_publication_tables p
        where p.pubname = 'supabase_realtime'
          and p.schemaname = n.nspname
          and p.tablename = c.relname
      )
    order by c.relname
  loop
    execute format('alter publication supabase_realtime add table %I.%I', tabela.esquema, tabela.nome);
  end loop;
end
$$;

commit;
begin;

begin;

-- Contatos adicionais ficam em tabela própria, sem alterar as colunas usadas
-- pelos demais módulos que consultam public.funcionario.
create table if not exists public.funcionario_contato (
  id_funcionario integer primary key references public.funcionario(id_funcionario) on delete cascade,
  telefone_secundario varchar(20),
  contato_emergencia varchar(100),
  parentesco_emergencia varchar(60),
  telefone_emergencia varchar(20),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.funcionario_contato enable row level security;
revoke all on public.funcionario_contato from public, anon, authenticated;
grant select, insert, update on public.funcionario_contato to service_role;

-- A extensão tem uma RPC própria para não substituir funções já usadas por
-- outros fluxos de cadastro do painel.
create or replace function public.registrar_funcionario_com_contato(p_payload jsonb,p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cadastro jsonb;
  v_id integer;
begin
  v_cadastro := public.registrar_funcionario_protegido(p_payload,p_actor,true);
  v_id := (v_cadastro->>'id')::integer;
  insert into public.funcionario_contato
    (id_funcionario,telefone_secundario,contato_emergencia,parentesco_emergencia,telefone_emergencia)
  values
    (v_id,nullif(btrim(p_payload->>'telefone_secundario'),''),
     nullif(btrim(p_payload->>'contato_emergencia'),''),
     nullif(btrim(p_payload->>'parentesco_emergencia'),''),
     nullif(btrim(p_payload->>'telefone_emergencia'),''));
  return v_cadastro;
end;
$$;

revoke all on function public.registrar_funcionario_com_contato(jsonb,uuid) from public, anon, authenticated;
grant execute on function public.registrar_funcionario_com_contato(jsonb,uuid) to service_role;
comment on table public.funcionario_contato is
  'Contatos secundários e de emergência do funcionário, separados da estrutura principal de public.funcionario.';
notify pgrst,'reload schema';

commit;
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
