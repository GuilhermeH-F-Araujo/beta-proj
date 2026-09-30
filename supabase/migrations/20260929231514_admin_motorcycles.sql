-- Campos de cadastro da motocicleta usados pelo painel administrativo.
alter table public.moto
  add column if not exists ano_modelo integer,
  add column if not exists chassi varchar(17),
  add column if not exists renavam varchar(11),
  add column if not exists observacoes varchar(1000),
  add column if not exists ativa boolean not null default true;

update public.moto set ano_modelo=ano where ano_modelo is null and ano is not null;

grant select (ano_modelo,chassi,renavam,observacoes,ativa) on public.moto to service_role;
grant insert (ano_modelo,chassi,renavam,observacoes,ativa) on public.moto to service_role;
grant update (id_cliente,quilometragem,ano_modelo,chassi,renavam,observacoes,ativa) on public.moto to service_role;
grant delete on public.moto to service_role;

-- Só o servidor usa essas permissões. RLS existente continua ativo.
