-- Bucket privado "arquivos" (ADR-0008, RNF 6): existe, é privado e restringe tamanho e MIME.
begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

select ok(
  exists (select 1 from storage.buckets where id = 'arquivos'),
  'bucket arquivos existe'
);

select is(
  (select public from storage.buckets where id = 'arquivos'),
  false,
  'bucket arquivos é privado'
);

select is(
  (select file_size_limit from storage.buckets where id = 'arquivos'),
  26214400::bigint,
  'bucket arquivos aceita no máximo 25 MiB'
);

select is(
  (select allowed_mime_types from storage.buckets where id = 'arquivos'),
  array['application/pdf', 'image/png', 'image/jpeg']::text[],
  'bucket arquivos aceita só PDF, PNG e JPEG'
);

select * from finish();

rollback;
