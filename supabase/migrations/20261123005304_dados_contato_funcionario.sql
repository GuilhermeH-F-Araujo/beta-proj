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
