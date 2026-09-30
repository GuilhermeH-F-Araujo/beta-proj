-- Exige justificativa sempre que uma OS entra no estado cancelada.
-- O backend define app.order_note na mesma transação da troca de status.
create or replace function app_private.require_cancellation_reason()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.status = 'cancelada' and old.status is distinct from new.status
     and nullif(btrim(current_setting('app.order_note', true)), '') is null then
    raise exception 'Informe o motivo do cancelamento.' using errcode = '23514';
  end if;
  return new;
end $$;

revoke all on function app_private.require_cancellation_reason() from public, anon, authenticated;
drop trigger if exists require_cancellation_reason on public.ordem_servico;
create trigger require_cancellation_reason before update of status on public.ordem_servico
  for each row when (old.status is distinct from new.status)
  execute function app_private.require_cancellation_reason();
