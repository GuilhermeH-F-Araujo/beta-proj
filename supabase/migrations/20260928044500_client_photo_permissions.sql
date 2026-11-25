-- A tabela cliente usa permissoes por coluna. A coluna nova nao herda os
-- GRANTs concedidos as colunas anteriores.
grant select (foto), update (foto) on public.cliente to service_role;
