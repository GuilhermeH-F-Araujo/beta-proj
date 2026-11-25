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
