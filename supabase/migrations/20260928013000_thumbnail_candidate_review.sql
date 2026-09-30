-- As imagens novas ficam privadas até um administrador comparar modelo e prévia.
alter table public.motorcycle_thumbnail_jobs
  drop constraint if exists motorcycle_thumbnail_jobs_status_check;
alter table public.motorcycle_thumbnail_jobs
  add constraint motorcycle_thumbnail_jobs_status_check
  check (status in ('pending','processing','waiting_quota','retry','needs_review','done'));

create or replace function public.finish_motorcycle_thumbnail_job(p_id bigint,p_worker uuid,p_status text,p_retry_at timestamptz,p_error text)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  if p_status not in ('done','retry','waiting_quota','needs_review') then raise exception 'Estado inválido'; end if;
  update public.motorcycle_thumbnail_jobs set status=p_status,
    next_retry_at=coalesce(p_retry_at,now()),last_error=left(p_error,500),locked_at=null,locked_by=null,updated_at=now()
  where id=p_id and status='processing' and locked_by=p_worker;
  return found;
end $$;
revoke all on function public.finish_motorcycle_thumbnail_job(bigint,uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.finish_motorcycle_thumbnail_job(bigint,uuid,text,timestamptz,text) to service_role;

-- A versão anterior da geração automática tinha uma chave de cache diferente.
-- Reavalia jobs concluídos sem apagar miniaturas já aprovadas pelo administrador.
update public.motorcycle_thumbnail_jobs
set status='pending',next_retry_at=now(),last_error=null,updated_at=now()
where status='done';
