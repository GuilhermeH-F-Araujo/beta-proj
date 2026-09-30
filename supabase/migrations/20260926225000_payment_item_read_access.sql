-- A API calcula o resumo financeiro com peças e serviços reais da OS.
grant select (id_os, quantidade, preco_unitario) on public.os_peca to service_role;
grant select (id_os, preco) on public.os_servico to service_role;
