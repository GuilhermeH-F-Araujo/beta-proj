create table if not exists public.usuario_preferencia (
  id_usuario uuid primary key references auth.users(id) on delete cascade,
  leitura jsonb not null default '{}'::jsonb check(jsonb_typeof(leitura)='object'),
  notificacoes jsonb not null default '{}'::jsonb check(jsonb_typeof(notificacoes)='object'),
  seguranca jsonb not null default '{}'::jsonb check(jsonb_typeof(seguranca)='object'),
  som jsonb check(som is null or (jsonb_typeof(som)='object' and octet_length(som::text)<=2100000)),
  som_atualizado_em timestamptz,
  atualizado_em timestamptz not null default now()
);
alter table public.usuario_preferencia enable row level security;
revoke all on public.usuario_preferencia from public,anon,authenticated;
grant select,insert,update on public.usuario_preferencia to service_role;
comment on table public.usuario_preferencia is 'Preferências pessoais da conta; acesso somente pela API autenticada do administrador.';
create or replace function public.salvar_preferencia_usuario(p_usuario uuid,p_secao text,p_valor jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_secao not in ('leitura','notificacoes','seguranca','som') then raise exception 'Seção inválida' using errcode='22023'; end if;
 if p_secao <> 'som' and jsonb_typeof(p_valor) is distinct from 'object' then raise exception 'Preferências inválidas' using errcode='22023'; end if;
 insert into public.usuario_preferencia(id_usuario) values(p_usuario) on conflict(id_usuario) do nothing;
 case p_secao
 when 'leitura' then update public.usuario_preferencia set leitura=p_valor,atualizado_em=now() where id_usuario=p_usuario;
 when 'notificacoes' then update public.usuario_preferencia set notificacoes=p_valor,atualizado_em=now() where id_usuario=p_usuario;
 when 'seguranca' then update public.usuario_preferencia set seguranca=p_valor,atualizado_em=now() where id_usuario=p_usuario;
 when 'som' then update public.usuario_preferencia set som=nullif(p_valor,'null'::jsonb),som_atualizado_em=clock_timestamp(),atualizado_em=now() where id_usuario=p_usuario;
 end case;
end $$;
revoke all on function public.salvar_preferencia_usuario(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.salvar_preferencia_usuario(uuid,text,jsonb) to service_role;
