-- The former unrestricted SELECT policies bypassed module permissions.
-- A private predicate may read role links; it returns only a boolean for auth.uid().
create schema if not exists permissoes_privadas;
revoke all on schema permissoes_privadas from public,anon,authenticated;
grant usage on schema permissoes_privadas to authenticated,service_role;
create function permissoes_privadas.pode_ler_ordem(p_moto integer) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); f record; c record;
begin
 if u is null or not exists(select 1 from auth.users where id=u and (banned_until is null or banned_until<=now())) then return false; end if;
 select id_funcionario,cargo,perfil_acesso,situacao into f from public.funcionario where auth_user_id=u;
 if found then
  if f.cargo='Administrador' and f.perfil_acesso='Administrador' then return true; end if;
  if f.situacao is distinct from 'ativo' then return false; end if;
  select a.ativo,a.permissoes into c from public.cargo_vinculo v join public.cargo_acesso a on a.id=v.id_cargo where v.id_funcionario=f.id_funcionario;
  if found then return c.ativo and coalesce(c.permissoes->'ordens'->'visualizar'='true'::jsonb,false); end if;
  -- Preserve existing authenticated mobile employee access until explicitly assigned.
  return true;
 end if;
 return exists(select 1 from public.moto m join public.cliente cli on cli.id_cliente=m.id_cliente where m.id_moto=p_moto and cli.auth_user_id=u and cli.excluido_em is null);
end $$;
revoke all on function permissoes_privadas.pode_ler_ordem(integer) from public,anon,authenticated;
grant execute on function permissoes_privadas.pode_ler_ordem(integer) to authenticated,service_role;
revoke select on public.ordem_servico from public,anon;
grant select on public.ordem_servico to authenticated;
drop policy if exists "Permitir leitura de ordem_servico" on public.ordem_servico;
drop policy if exists permitir_leitura_ordem_servico on public.ordem_servico;
create policy ordem_leitura_por_acesso on public.ordem_servico for select to authenticated
 using(permissoes_privadas.pode_ler_ordem(id_moto));
