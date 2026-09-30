-- Campos usados na edição do perfil no painel web e compartilhados com o app.
-- Um cliente possui várias motos; a FK existente moto.id_cliente preserva
-- a propriedade única de cada moto.
alter table public.cliente
  add column if not exists data_nascimento date,
  add column if not exists cep varchar(8),
  add column if not exists endereco varchar(255),
  add column if not exists numero varchar(20),
  add column if not exists bairro varchar(100),
  add column if not exists cidade varchar(100),
  add column if not exists estado char(2);

grant select (data_nascimento, cep, endereco, numero, bairro, cidade, estado)
  on public.cliente to service_role;
grant update (data_nascimento, cep, endereco, numero, bairro, cidade, estado)
  on public.cliente to service_role;
