begin;
create or replace function app_private.revogar_confirmacao_senha()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  delete from public.admin_confirmacao where id_usuario=new.id;
  return new;
end;
$$;
revoke all on function app_private.revogar_confirmacao_senha() from public,anon,authenticated,service_role;
create trigger revogar_confirmacao_senha
after update of encrypted_password on auth.users
for each row when (old.encrypted_password is distinct from new.encrypted_password)
execute function app_private.revogar_confirmacao_senha();
commit;
