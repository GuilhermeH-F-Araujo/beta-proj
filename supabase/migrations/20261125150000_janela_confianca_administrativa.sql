-- Janela de confianca administrativa (modelo "sudo mode" do GitHub).
-- Antes: confirmacao por senha valia 3 minutos e com autenticador 20 minutos (maximo 1 h),
-- o que fazia o sistema pedir senha o tempo todo.
-- Agora: depois de confirmar, a janela dura 2 h sem uso e se renova a cada acao protegida,
-- ate no maximo 8 h (um turno). Acoes criticas (acessos, seguranca) continuam exigindo
-- confirmacao feita nos ultimos 15 minutos; o servidor confere usando "confirmedAt".
begin;

create or replace function app_private.prazo_confirmacao_admin()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  new.expira_em := now() + interval '2 hours';
  return new;
end;
$$;
drop trigger if exists admin_confirmacao_prazo on public.admin_confirmacao;
create trigger admin_confirmacao_prazo
  before insert on public.admin_confirmacao
  for each row execute function app_private.prazo_confirmacao_admin();

create or replace function app_private.prova_administrativa_valida(p_usuario uuid,p_sessao uuid,p_hash text)
returns setof public.admin_confirmacao language sql security definer set search_path='' as $$
  select c.* from public.admin_confirmacao c
  join auth.sessions s on s.id=c.id_sessao and s.user_id=c.id_usuario
  where c.hash=p_hash and c.id_usuario=p_usuario and c.id_sessao=p_sessao
    and c.expira_em>now() and c.criado_em>now()-interval '8 hours'
    and (s.not_after is null or s.not_after>now())
    and c.nivel is not distinct from public.consultar_nivel_administrativo(p_usuario)
    and not exists(select 1 from public.admin_tentativa t where t.id_usuario=p_usuario and t.bloqueado_ate>now());
$$;
revoke all on function app_private.prova_administrativa_valida(uuid,uuid,text) from public,anon,authenticated,service_role;

create or replace function public.validar_confirmacao_admin(p_usuario uuid,p_sessao uuid,p_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.admin_confirmacao c
    set expira_em=least(now()+interval '2 hours', c.criado_em+interval '8 hours')
    where c.hash in(select v.hash from app_private.prova_administrativa_valida(p_usuario,p_sessao,p_hash) v);
  return found;
end;
$$;
revoke all on function public.validar_confirmacao_admin(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.validar_confirmacao_admin(uuid,uuid,text) to service_role;

create or replace function public.consultar_confirmacao_admin(p_usuario uuid,p_sessao uuid,p_hash text)
returns jsonb language sql security definer set search_path='' as $$
  with prova as (
    select expira_em,criado_em from app_private.prova_administrativa_valida(p_usuario,p_sessao,p_hash) limit 1
  )
  select jsonb_build_object(
    'active',exists(select 1 from prova),
    'expiresAt',(select expira_em from prova),
    'confirmedAt',(select criado_em from prova),
    'maximumExpiresAt',(select criado_em+interval '8 hours' from prova),
    'blockedUntil',(select bloqueado_ate from public.admin_tentativa where id_usuario=p_usuario and bloqueado_ate>now())
  );
$$;
revoke all on function public.consultar_confirmacao_admin(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.consultar_confirmacao_admin(uuid,uuid,text) to service_role;

notify pgrst,'reload schema';
commit;
