-- Bucket privado compartilhado pela coluna cliente.foto.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cliente-fotos', 'cliente-fotos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
