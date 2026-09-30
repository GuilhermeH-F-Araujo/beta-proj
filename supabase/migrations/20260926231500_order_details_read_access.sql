-- Leitura restrita ao servidor para montar a página de detalhes da OS.
grant select (id_moto,id_cliente,modelo,placa,ano,cor,foto) on public.moto to service_role;
grant select (id_cliente,nome,telefone,email) on public.cliente to service_role;
grant select (id_os,descricao,preco) on public.os_servico to service_role;
grant select (id_os,nome_peca,quantidade,preco_unitario) on public.os_peca to service_role;
grant select (id_foto,id_os,tipo,url,data_registro) on public.foto_os to service_role;
