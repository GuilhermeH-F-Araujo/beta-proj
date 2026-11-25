-- Cache privado das bases transparentes geradas uma vez por nome de modelo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('moto-modelos-ia', 'moto-modelos-ia', false, 8388608, array['image/png'])
on conflict (id) do nothing;
