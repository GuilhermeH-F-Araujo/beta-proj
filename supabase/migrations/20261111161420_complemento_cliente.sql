-- Complemento separado do logradouro; preserva os dados e as politicas existentes.
begin;
alter table public.cliente add column if not exists complemento text;
comment on column public.cliente.complemento is 'Complemento opcional do endereço (apartamento, bloco, sala).';
commit;
