-- A tabela cliente usa permissões por coluna. A coluna nova não herda os
-- GRANTs concedidos às colunas anteriores.
grant select (foto), update (foto) on public.cliente to service_role;
