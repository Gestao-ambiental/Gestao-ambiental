-- Bucket privado para PDFs de licença, evidências e documentos (ADR-0008, RNF 6).
-- Objetos são imutáveis: substituir = objeto novo em consultoria_id/<entidade>/<uuid>.
-- As políticas de Storage por consultoria entram na 1.3, junto dos helpers private.is_membro/is_gestao.
-- Sem política, nenhum usuário autenticado ou anônimo acessa o bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'arquivos',
  'arquivos',
  false,
  26214400, -- 25 MiB
  array['application/pdf', 'image/png', 'image/jpeg']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
