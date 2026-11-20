-- Modelos de documento da consultoria (ADR-0036, fatia 1).
-- Texto padrão (relatório, ofício, declaração) escrito no editor do Grama, com campos que puxam os
-- dados do empreendimento, da licença e da condicionante na hora de gerar o .docx. O conteúdo é a
-- árvore JSON do editor (ProseMirror/TipTap); a lista de campos e o preenchimento ficam em
-- packages/domain (modelo-documento.ts). Aqui o banco garante só a forma: raiz "doc" e tamanho.
-- Todo membro ativo lê (a Equipe usa os modelos); só a Gestão cria, edita e arquiva, sempre por RPC.
-- Exclusão lógica (arquivar): o .docx já gerado não depende do modelo.

create table public.modelo_documento (
  id uuid primary key,
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  nome text not null,
  conteudo jsonb not null,
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  atualizado_por uuid not null,
  atualizado_em timestamptz not null default now(),
  row_version integer not null default 1,
  arquivado_em timestamptz,
  arquivado_por uuid,
  constraint modelo_documento_consultoria_id_id_key unique (consultoria_id, id),
  constraint modelo_documento_nome check (length(btrim(nome)) between 1 and 120),
  constraint modelo_documento_conteudo check (
    jsonb_typeof(conteudo) = 'object' and conteudo ->> 'type' = 'doc'
    and length(conteudo::text) <= 500000),
  constraint modelo_documento_arquivamento check ((arquivado_em is null) = (arquivado_por is null)),
  constraint modelo_documento_criado_por_fk foreign key (consultoria_id, criado_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint modelo_documento_atualizado_por_fk foreign key (consultoria_id, atualizado_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint modelo_documento_arquivado_por_fk foreign key (consultoria_id, arquivado_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.modelo_documento is
  'Modelo de documento da consultoria (ADR-0036): texto do editor com campos a preencher no .docx.';
comment on column public.modelo_documento.conteudo is
  'Árvore JSON do editor (raiz type=doc). Campo = nó inline {type: campo, attrs: {chave}}.';

create unique index modelo_documento_nome_idx
  on public.modelo_documento (consultoria_id, lower(btrim(nome))) where arquivado_em is null;

alter table public.modelo_documento enable row level security;
alter table public.modelo_documento force row level security;
revoke all on table public.modelo_documento from anon, authenticated;
grant select on table public.modelo_documento to authenticated;

create policy modelo_documento_select_membro_ativo
  on public.modelo_documento for select to authenticated
  using ((select private.is_membro(consultoria_id)));

create trigger modelo_documento_auditar
  after insert or update or delete on public.modelo_documento
  for each row execute function private.auditar();
create trigger _suporte_somente_leitura
  before insert or update or delete on public.modelo_documento
  for each row execute function private.bloquear_escrita_do_suporte();
create trigger _comercial_somente_leitura
  before insert or update or delete on public.modelo_documento
  for each row execute function private.bloquear_escrita_comercial();

-- ---------------------------------------------------------------------------
-- Salvar: cria (p_row_version nulo) ou atualiza (controle otimista). Repetir a criação com o mesmo
-- id devolve a versão atual, sem duplicar. Devolve o row_version gravado.
-- ---------------------------------------------------------------------------
create function public.salvar_modelo_documento(
  p_id uuid,
  p_consultoria_id uuid,
  p_nome text,
  p_conteudo jsonb,
  p_row_version integer default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  atual public.modelo_documento%rowtype;
  autor uuid;
  nome_limpo text := btrim(coalesce(p_nome, ''));
begin
  if p_id is null then
    raise exception 'id_obrigatorio' using errcode = '22023';
  end if;
  if not private.is_gestao(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  autor := private.membro_atual(p_consultoria_id);
  if autor is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if length(nome_limpo) not between 1 and 120 then
    raise exception 'nome_invalido' using errcode = '22023';
  end if;
  if p_conteudo is null or jsonb_typeof(p_conteudo) <> 'object' or p_conteudo ->> 'type' is distinct from 'doc'
     or length(p_conteudo::text) > 500000 then
    raise exception 'conteudo_invalido' using errcode = '22023';
  end if;

  select * into atual from public.modelo_documento as m where m.id = p_id for update;
  if found and atual.consultoria_id <> p_consultoria_id then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if found and p_row_version is null then
    return atual.row_version;
  end if;
  if not found and p_row_version is not null then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  if found and atual.arquivado_em is not null then
    raise exception 'modelo_arquivado' using errcode = 'P0001';
  end if;
  if found and atual.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.modelo_documento as m
    where m.consultoria_id = p_consultoria_id and m.arquivado_em is null and m.id <> p_id
      and lower(btrim(m.nome)) = lower(nome_limpo)
  ) then
    raise exception 'modelo_com_mesmo_nome' using errcode = 'P0001';
  end if;

  if atual.id is null then
    insert into public.modelo_documento (id, consultoria_id, nome, conteudo, criado_por, atualizado_por)
    values (p_id, p_consultoria_id, nome_limpo, p_conteudo, autor, autor);
    return 1;
  end if;

  update public.modelo_documento as m
  set nome = nome_limpo, conteudo = p_conteudo, atualizado_por = autor, atualizado_em = now(),
      row_version = m.row_version + 1
  where m.id = p_id;
  return atual.row_version + 1;
end;
$$;

revoke all on function public.salvar_modelo_documento(uuid, uuid, text, jsonb, integer) from public, anon;
grant execute on function public.salvar_modelo_documento(uuid, uuid, text, jsonb, integer) to authenticated;

-- Arquivar (exclusão lógica). Repetir não falha.
create function public.arquivar_modelo_documento(p_id uuid, p_row_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.modelo_documento%rowtype;
  autor uuid;
begin
  select * into alvo from public.modelo_documento as m where m.id = p_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  autor := private.membro_atual(alvo.consultoria_id);
  if autor is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.arquivado_em is not null then
    return;
  end if;
  if alvo.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  update public.modelo_documento as m
  set arquivado_em = now(), arquivado_por = autor, atualizado_por = autor, atualizado_em = now(),
      row_version = m.row_version + 1
  where m.id = p_id;
end;
$$;

revoke all on function public.arquivar_modelo_documento(uuid, integer) from public, anon;
grant execute on function public.arquivar_modelo_documento(uuid, integer) to authenticated;
