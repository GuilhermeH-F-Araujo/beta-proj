create table public.cargo_acesso (
 id uuid primary key default gen_random_uuid(), nome varchar(60) not null,
 descricao varchar(240) not null default '', permissoes jsonb not null default '{}' check(jsonb_typeof(permissoes)='object'),
 ativo boolean not null default true, versao integer not null default 1,
 atualizado_em timestamptz not null default now(), atualizado_por uuid references auth.users(id)
);
create unique index cargo_acesso_nome_idx on public.cargo_acesso(lower(btrim(nome)));
create table public.cargo_vinculo (
 id_funcionario integer primary key references public.funcionario(id_funcionario) on delete cascade,
 id_cargo uuid not null references public.cargo_acesso(id), criado_em timestamptz not null default now()
);
create index cargo_vinculo_cargo_idx on public.cargo_vinculo(id_cargo);
create table public.cargo_historico (
 id bigint generated always as identity primary key, id_cargo uuid references public.cargo_acesso(id),
 id_usuario uuid references auth.users(id), dados jsonb not null, criado_em timestamptz not null default now()
);
alter table public.cargo_acesso enable row level security;
alter table public.cargo_vinculo enable row level security;
alter table public.cargo_historico enable row level security;
revoke all on public.cargo_acesso,public.cargo_vinculo,public.cargo_historico from public,anon,authenticated;
grant select,insert,update on public.cargo_acesso to service_role;
grant select,insert,delete on public.cargo_vinculo to service_role;
grant select,insert on public.cargo_historico to service_role;
grant usage,select on sequence public.cargo_historico_id_seq to service_role;
insert into public.cargo_acesso(nome,descricao,permissoes) values
 ('Mecânico','Acompanhamento de ordens e veículos. Ajuste antes de vincular a equipe.','{"ordens":{"visualizar":true,"editar":true},"motocicletas":{"visualizar":true}}'),
 ('Gerente','Acompanhamento operacional da oficina. Ajuste as permissões conforme sua rotina.','{"dashboard":{"visualizar":true},"clientes":{"visualizar":true},"ordens":{"visualizar":true,"criar":true,"editar":true},"motocicletas":{"visualizar":true},"funcionarios":{"visualizar":true}}');
create function public.salvar_cargo_acesso(p_id uuid,p_nome text,p_descricao text,p_permissoes jsonb,p_ativo boolean,p_membros integer[],p_versao integer,p_usuario uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_antes jsonb;
begin
 if not exists(select 1 from public.funcionario where auth_user_id=p_usuario and cargo='Administrador' and perfil_acesso='Administrador') then raise exception 'Somente administradores podem gerenciar cargos'; end if;
 if length(btrim(p_nome)) not between 2 and 60 or lower(btrim(p_nome)) in ('administrador','administradores') or length(p_descricao)>240 or jsonb_typeof(p_permissoes)<>'object' then raise exception 'Dados do cargo inválidos'; end if;
 perform pg_advisory_xact_lock(74120801);
 if exists(select 1 from unnest(p_membros) m left join public.funcionario f on f.id_funcionario=m where f.id_funcionario is null or f.auth_user_id is null or (f.cargo='Administrador' and f.perfil_acesso='Administrador')) then raise exception 'Selecione somente funcionários com conta e sem acesso administrativo integral'; end if;
 if exists(select 1 from public.cargo_vinculo where id_funcionario=any(p_membros) and id_cargo is distinct from p_id) then raise exception 'Um funcionário selecionado já pertence a outro cargo'; end if;
 if p_id is null then
  insert into public.cargo_acesso(nome,descricao,permissoes,ativo,atualizado_por) values(btrim(p_nome),p_descricao,p_permissoes,p_ativo,p_usuario) returning id into v_id;
 else
  select to_jsonb(c) into v_antes from public.cargo_acesso c where id=p_id for update;
  update public.cargo_acesso set nome=btrim(p_nome),descricao=p_descricao,permissoes=p_permissoes,ativo=p_ativo,versao=versao+1,atualizado_em=now(),atualizado_por=p_usuario where id=p_id and versao=p_versao returning id into v_id;
  if v_id is null then raise exception 'Cargo alterado por outro administrador. Recarregue a lista'; end if;
 end if;
 delete from public.cargo_vinculo where id_cargo=v_id;
 insert into public.cargo_vinculo(id_funcionario,id_cargo) select distinct m,v_id from unnest(p_membros) m;
 insert into public.cargo_historico(id_cargo,id_usuario,dados) values(v_id,p_usuario,jsonb_build_object('antes',v_antes,'nome',p_nome,'permissoes',p_permissoes,'ativo',p_ativo,'membros',p_membros));
 return v_id;
end $$;
revoke all on function public.salvar_cargo_acesso(uuid,text,text,jsonb,boolean,integer[],integer,uuid) from public,anon,authenticated;
grant execute on function public.salvar_cargo_acesso(uuid,text,text,jsonb,boolean,integer[],integer,uuid) to service_role;
