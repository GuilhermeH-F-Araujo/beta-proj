-- Um agendamento pode ter varios servicos do catalogo, gravados em servico_solicitado
-- separados por " + ". Amplia a coluna apenas se ela ainda for varchar com limite.
begin;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='agendamento'
      and column_name='servico_solicitado' and character_maximum_length is not null
      and character_maximum_length < 500
  ) then
    alter table public.agendamento alter column servico_solicitado type varchar(500);
  end if;
end;
$$;
commit;
