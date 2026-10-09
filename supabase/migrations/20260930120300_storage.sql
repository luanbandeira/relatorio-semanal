-- Storage privado. Nenhuma política em storage.objects para anon/authenticated:
-- envio e leitura acontecem somente por URLs assinadas emitidas pelo servidor
-- depois de verificar a permissão. O próprio Storage aplica tipo e tamanho.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('comprovantes', 'comprovantes', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('fotos', 'fotos', false, 5242880,
   array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
