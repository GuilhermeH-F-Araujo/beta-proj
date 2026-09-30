-- Foto opcional do cliente. O objeto fica em um bucket privado;
-- esta coluna contém somente o caminho interno do arquivo.
alter table public.cliente add column if not exists foto text;

comment on column public.cliente.foto is 'Caminho privado em Storage da foto do cliente.';

grant select (foto), update (foto) on public.cliente to service_role;
