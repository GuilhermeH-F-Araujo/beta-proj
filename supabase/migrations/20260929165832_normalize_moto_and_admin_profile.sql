-- Normalização de modelos para todos os percursos que escrevem em public.moto.
create or replace function public.normalize_moto_model(p_model text)
returns text language sql immutable set search_path = '' as $$
  with prepared as (
    select regexp_replace(
      regexp_replace(lower(btrim(coalesce(p_model,''))),
        '\m(pop|biz|bros|fan|titan|cg|xre|nxr|cb)([0-9])', '\1 \2', 'gi'),
      '\s+', ' ', 'g') as value
  ), parts as (
    select word, position from prepared
    cross join lateral regexp_split_to_table(value,' ') with ordinality as words(word,position)
  )
  select coalesce(string_agg(
    case when upper(word) in ('CG','NXR','CRF','XRE','CB','CBR','GS','MT','KTM','BMW','XR','FZ','XT','ZX') then upper(word)
         when word ~ '^[a-z]{1,4}[0-9]' then upper(word)
         when position > 1 and word in ('de','da','do','das','dos') then word
         else initcap(word) end, ' ' order by position), '') from parts;
$$;

create or replace function public.normalize_moto_model_on_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.modelo is not null then new.modelo := public.normalize_moto_model(new.modelo); end if;
  return new;
end $$;

drop trigger if exists normalize_moto_model_before_write on public.moto;
create trigger normalize_moto_model_before_write
before insert or update of modelo on public.moto
for each row execute function public.normalize_moto_model_on_write();

-- Corrige nomes antigos; o valor da placa e a identidade da moto não mudam.
update public.moto set modelo = public.normalize_moto_model(modelo)
where modelo is distinct from public.normalize_moto_model(modelo);

-- A foto do administrador é privada e acessada apenas através da API autenticada.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('admin-avatars','admin-avatars',false,550000,array['image/jpeg'])
on conflict (id) do nothing;

grant update (nome,telefone) on public.funcionario to service_role;
grant select (id_funcionario,nome,telefone,auth_user_id) on public.funcionario to service_role;
