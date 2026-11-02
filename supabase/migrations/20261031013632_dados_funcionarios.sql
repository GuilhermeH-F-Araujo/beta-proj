-- Proposta para os quatro frames de funcionários. Aplicar somente com autorização.
begin;
alter table public.funcionario
  add column if not exists data_nascimento date,
  add column if not exists data_admissao date,
  add column if not exists departamento varchar(100),
  add column if not exists especialidade varchar(150),
  add column if not exists endereco varchar(500),
  add column if not exists situacao varchar(20);
-- Registros existentes continuam sem situação informada; não inventar status.
alter table public.funcionario alter column situacao set default 'ativo';
alter table public.funcionario add constraint funcionario_situacao_check
  check(situacao in ('ativo','ferias','afastado','desligado'));
grant select on public.funcionario to service_role;
grant update(nome,telefone,cpf,data_nascimento,data_admissao,departamento,especialidade,endereco,situacao)
  on public.funcionario to service_role;

create table public.funcionario_documento (
  id bigint generated always as identity primary key,
  id_funcionario integer not null references public.funcionario(id_funcionario),
  tipo varchar(40) not null,
  numero varchar(80) not null,
  validade date,
  criado_em timestamptz not null default now()
);
create index funcionario_documento_funcionario_idx on public.funcionario_documento(id_funcionario,id);
create table public.funcionario_nota (
  id bigint generated always as identity primary key,
  id_funcionario integer not null references public.funcionario(id_funcionario),
  texto varchar(2000) not null check(char_length(btrim(texto))>0),
  id_usuario uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index funcionario_nota_funcionario_idx on public.funcionario_nota(id_funcionario,criado_em desc,id desc);
alter table public.funcionario_documento enable row level security;
alter table public.funcionario_nota enable row level security;
revoke all on public.funcionario_documento,public.funcionario_nota from public,anon,authenticated;
grant select,insert,delete on public.funcionario_documento,public.funcionario_nota to service_role;
grant usage,select on sequence public.funcionario_documento_id_seq,public.funcionario_nota_id_seq to service_role;
notify pgrst,'reload schema';
commit;
