-- O perfil e a edicao do cliente incluem complemento nas consultas da API.
grant select (complemento), update (complemento) on public.cliente to service_role;
