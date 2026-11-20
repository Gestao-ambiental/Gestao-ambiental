-- Alvará simples (ALV-01 e ALV-02; decisões de 17/11/2026, sugeridas no plano e aceitas pelo
-- Eduardo).
-- 1. Alvará por unidade do empreendimento: PDF e validade obrigatórios; número, órgão e notas
--    opcionais. Não cria condicionante, tarefa nem regra de 120 dias.
-- 2. Renovar é registrar um alvará novo ligado ao anterior (anterior_id). O anterior fica guardado,
--    com o PDF e o histórico; só deixa de ser o vigente. Um alvará tem no máximo um sucessor.
-- 3. Aparece no empreendimento e na visão da equipe (e no calendário) como uma linha de validade,
--    enquanto for o vigente da sua série.
-- 4. Só a Gestão cadastra, edita e exclui (como a licença). Exclusão é lógica.
-- PDF imutável: trocar é versão nova do documento, em consultoria_id/alvara/<uuid>.pdf.

alter table public.documento drop constraint documento_entidade_valida;
alter table public.documento
  add constraint documento_entidade_valida
  check (entidade in ('instrumento', 'evidencia', 'protocolo', 'membro', 'consultoria', 'mtr', 'cdf',
                      'alvara'));

create table public.alvara (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  empreendimento_id uuid not null,
  unidade_id uuid not null,
  numero text,
  orgao text,
  notas text,
  validade date not null,
  documento_id uuid not null,
  anterior_id uuid,
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  excluido_por uuid,
  excluido_em timestamptz,
  row_version integer not null default 1,
  constraint alvara_numero_valido
    check (numero is null or (numero = btrim(numero) and length(numero) between 1 and 60)),
  constraint alvara_orgao_valido
    check (orgao is null or (orgao = btrim(orgao) and length(orgao) between 1 and 120)),
  constraint alvara_notas_validas check (notas is null or length(notas) between 1 and 2000),
  constraint alvara_anterior_outro check (anterior_id is null or anterior_id <> id),
  constraint alvara_exclusao_coerente check ((excluido_por is null) = (excluido_em is null)),
  constraint alvara_consultoria_id_id_key unique (consultoria_id, id),
  constraint alvara_unidade_fk foreign key (consultoria_id, empreendimento_id, unidade_id)
    references public.unidade (consultoria_id, empreendimento_id, id) on delete restrict,
  constraint alvara_documento_fk foreign key (consultoria_id, documento_id)
    references public.documento (consultoria_id, id) on delete restrict,
  constraint alvara_anterior_fk foreign key (consultoria_id, anterior_id)
    references public.alvara (consultoria_id, id) on delete restrict,
  constraint alvara_criado_por_fk foreign key (consultoria_id, criado_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint alvara_excluido_por_fk foreign key (consultoria_id, excluido_por)
    references public.membro (consultoria_id, id) on delete restrict
);

-- Um sucessor por alvará (entre os não excluídos).
create unique index alvara_um_sucessor_key
  on public.alvara (consultoria_id, anterior_id)
  where anterior_id is not null and excluido_em is null;
create index alvara_empreendimento_idx on public.alvara (consultoria_id, empreendimento_id);

comment on table public.alvara is
  'Alvará simples da unidade (ALV-01). Renovar = novo registro ligado ao anterior (ALV-02); nada é apagado.';
comment on column public.alvara.validade is 'Data civil da validade do alvará.';
comment on column public.alvara.anterior_id is 'Alvará que este renova. O anterior continua guardado.';

alter table public.alvara enable row level security;
alter table public.alvara force row level security;
revoke all on table public.alvara from public, anon, authenticated;
grant select on table public.alvara to authenticated;

create policy alvara_select_membro_ativo on public.alvara
  for select to authenticated using ((select private.is_membro(consultoria_id)));

create trigger alvara_auditar after insert or update or delete on public.alvara
  for each row execute function private.auditar();
create trigger _suporte_somente_leitura before insert or update or delete on public.alvara
  for each row execute function private.bloquear_escrita_do_suporte();
create trigger _comercial_somente_leitura before insert or update or delete on public.alvara
  for each row execute function private.bloquear_escrita_comercial();

-- ---------------------------------------------------------------------------
-- PDF enviado ao Storage: confere caminho, tipo e tamanho e devolve o tamanho em bytes.
-- ---------------------------------------------------------------------------
create function private.conferir_pdf_enviado(
  cid uuid,
  p_entidade text,
  p_caminho text,
  p_nome_original text,
  p_sha256 text
)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  objeto record;
begin
  if p_caminho is null
     or p_caminho !~ ('^' || cid::text || '/' || p_entidade || '/[0-9a-f-]{36}\.pdf$') then
    raise exception 'caminho_invalido' using errcode = '22023';
  end if;
  if coalesce(lower(p_sha256), '') !~ '^[0-9a-f]{64}$' or btrim(coalesce(p_nome_original, '')) = '' then
    raise exception 'caminho_invalido' using errcode = '22023';
  end if;
  select o.metadata ->> 'mimetype' as mime, (o.metadata ->> 'size')::bigint as tamanho
  into objeto
  from storage.objects as o
  where o.bucket_id = 'arquivos' and o.name = p_caminho;
  if not found then
    raise exception 'arquivo_nao_encontrado' using errcode = 'P0001';
  end if;
  if objeto.mime is distinct from 'application/pdf' then
    raise exception 'arquivo_nao_pdf' using errcode = '22023';
  end if;
  if coalesce(objeto.tamanho, 0) <= 0 or objeto.tamanho > 26214400 then
    raise exception 'arquivo_grande_demais' using errcode = '22023';
  end if;
  return objeto.tamanho;
end;
$$;

revoke all on function private.conferir_pdf_enviado(uuid, text, text, text, text) from public, anon, authenticated;

-- Textos opcionais: vazio vira nulo; longos são recusados.
create function private.conferir_dados_do_alvara(p_numero text, p_orgao text, p_notas text, p_validade date)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_validade is null then
    raise exception 'validade_do_alvara_obrigatoria' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_numero, ''))) > 60 or length(btrim(coalesce(p_orgao, ''))) > 120
     or length(btrim(coalesce(p_notas, ''))) > 2000 then
    raise exception 'texto_longo_demais' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.conferir_dados_do_alvara(text, text, text, date) from public, anon, authenticated;

-- Alvará para a Gestão mexer: travado, da Gestão, não excluído, na versão lida.
create function private.alvara_para_gestao(p_alvara_id uuid, p_row_version integer)
returns public.alvara
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.alvara;
begin
  select * into alvo from public.alvara as a where a.id = p_alvara_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.excluido_em is not null then
    raise exception 'alvara_excluido' using errcode = 'P0001';
  end if;
  if p_row_version is not null and alvo.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  return alvo;
end;
$$;

revoke all on function private.alvara_para_gestao(uuid, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: registrar alvará (novo ou renovação), já com o PDF, numa transação. Repetir com a mesma
-- versão do PDF devolve o mesmo alvará.
-- ---------------------------------------------------------------------------
create function public.registrar_alvara(
  p_unidade_id uuid,
  p_validade date,
  p_versao_id uuid,
  p_caminho text,
  p_nome_original text,
  p_sha256 text,
  p_numero text default null,
  p_orgao text default null,
  p_notas text default null,
  p_anterior_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  un public.unidade;
  ant public.alvara;
  ator uuid;
  tamanho bigint;
  doc uuid;
  novo uuid;
begin
  select * into un from public.unidade as u where u.id = p_unidade_id;
  if not found or not private.is_gestao(un.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  ator := private.membro_atual(un.consultoria_id);
  if ator is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  -- Retry: a versão já registrada devolve o alvará dela.
  select a.id into novo
  from public.documento_versao as v
  join public.alvara as a on a.consultoria_id = v.consultoria_id and a.documento_id = v.documento_id
  where v.id = p_versao_id;
  if found then
    return novo;
  end if;
  if exists (select 1 from public.documento_versao as v where v.id = p_versao_id) then
    raise exception 'versao_existente' using errcode = 'P0001';
  end if;

  perform private.conferir_dados_do_alvara(p_numero, p_orgao, p_notas, p_validade);

  if p_anterior_id is not null then
    select * into ant from public.alvara as a where a.id = p_anterior_id for update;
    if not found or ant.consultoria_id <> un.consultoria_id or ant.unidade_id <> un.id
       or ant.excluido_em is not null then
      raise exception 'alvara_anterior_invalido' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.alvara as s
      where s.consultoria_id = ant.consultoria_id and s.anterior_id = ant.id and s.excluido_em is null
    ) then
      raise exception 'alvara_ja_renovado' using errcode = 'P0001';
    end if;
  end if;

  tamanho := private.conferir_pdf_enviado(un.consultoria_id, 'alvara', p_caminho, p_nome_original, p_sha256);

  insert into public.documento (consultoria_id, entidade, versao_vigente_id)
  values (un.consultoria_id, 'alvara', null)
  returning id into doc;
  insert into public.documento_versao (id, consultoria_id, documento_id, numero, caminho, nome_original, mime,
                                       tamanho_bytes, sha256, autor_id)
  values (p_versao_id, un.consultoria_id, doc, 1, p_caminho, btrim(p_nome_original), 'application/pdf',
          tamanho, lower(p_sha256), ator);
  update public.documento as d set versao_vigente_id = p_versao_id where d.id = doc;

  insert into public.alvara (consultoria_id, empreendimento_id, unidade_id, numero, orgao, notas, validade,
                             documento_id, anterior_id, criado_por)
  values (un.consultoria_id, un.empreendimento_id, un.id, nullif(btrim(coalesce(p_numero, '')), ''),
          nullif(btrim(coalesce(p_orgao, '')), ''), nullif(btrim(coalesce(p_notas, '')), ''), p_validade,
          doc, p_anterior_id, ator)
  returning id into novo;
  return novo;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: editar número, órgão, validade e notas (Gestão). Igual ao que está: nada muda.
-- ---------------------------------------------------------------------------
create function public.editar_alvara(
  p_alvara_id uuid,
  p_row_version integer,
  p_validade date,
  p_numero text default null,
  p_orgao text default null,
  p_notas text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.alvara;
  numero_novo text := nullif(btrim(coalesce(p_numero, '')), '');
  orgao_novo text := nullif(btrim(coalesce(p_orgao, '')), '');
  notas_novas text := nullif(btrim(coalesce(p_notas, '')), '');
begin
  alvo := private.alvara_para_gestao(p_alvara_id, p_row_version);
  perform private.conferir_dados_do_alvara(p_numero, p_orgao, p_notas, p_validade);
  if alvo.numero is not distinct from numero_novo and alvo.orgao is not distinct from orgao_novo
     and alvo.notas is not distinct from notas_novas and alvo.validade = p_validade then
    return alvo.row_version;
  end if;
  update public.alvara as a
  set numero = numero_novo, orgao = orgao_novo, notas = notas_novas, validade = p_validade,
      row_version = a.row_version + 1
  where a.id = alvo.id;
  return alvo.row_version + 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: trocar o PDF (Gestão). Versão nova e imutável; a anterior continua no histórico.
-- ---------------------------------------------------------------------------
create function public.trocar_pdf_alvara(
  p_alvara_id uuid,
  p_versao_id uuid,
  p_caminho text,
  p_nome_original text,
  p_sha256 text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.alvara;
  doc_da_versao uuid;
  tamanho bigint;
  proximo integer;
begin
  alvo := private.alvara_para_gestao(p_alvara_id, null);
  select v.documento_id into doc_da_versao from public.documento_versao as v where v.id = p_versao_id;
  if found then
    if doc_da_versao = alvo.documento_id then
      return p_versao_id;
    end if;
    raise exception 'versao_existente' using errcode = 'P0001';
  end if;
  tamanho := private.conferir_pdf_enviado(alvo.consultoria_id, 'alvara', p_caminho, p_nome_original, p_sha256);
  select coalesce(max(v.numero), 0) + 1 into proximo
  from public.documento_versao as v where v.documento_id = alvo.documento_id;
  insert into public.documento_versao (id, consultoria_id, documento_id, numero, caminho, nome_original, mime,
                                       tamanho_bytes, sha256, autor_id)
  values (p_versao_id, alvo.consultoria_id, alvo.documento_id, proximo, p_caminho, btrim(p_nome_original),
          'application/pdf', tamanho, lower(p_sha256), private.membro_atual(alvo.consultoria_id));
  update public.documento as d set versao_vigente_id = p_versao_id where d.id = alvo.documento_id;
  update public.alvara as a set row_version = a.row_version + 1 where a.id = alvo.id;
  return p_versao_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: excluir (Gestão). Lógica; repetir é inofensivo. O anterior volta a ser o vigente da série.
-- ---------------------------------------------------------------------------
create function public.excluir_alvara(p_alvara_id uuid, p_row_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.alvara;
begin
  select * into alvo from public.alvara as a where a.id = p_alvara_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.excluido_em is not null then
    return;
  end if;
  if alvo.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.alvara as s
    where s.consultoria_id = alvo.consultoria_id and s.anterior_id = alvo.id and s.excluido_em is null
  ) then
    raise exception 'alvara_ja_renovado' using errcode = 'P0001';
  end if;
  update public.alvara as a
  set excluido_por = private.membro_atual(alvo.consultoria_id), excluido_em = now(),
      row_version = a.row_version + 1
  where a.id = alvo.id;
end;
$$;

revoke all on function public.registrar_alvara(uuid, date, uuid, text, text, text, text, text, text, uuid)
  from public, anon;
revoke all on function public.editar_alvara(uuid, integer, date, text, text, text) from public, anon;
revoke all on function public.trocar_pdf_alvara(uuid, uuid, text, text, text) from public, anon;
revoke all on function public.excluir_alvara(uuid, integer) from public, anon;
grant execute on function public.registrar_alvara(uuid, date, uuid, text, text, text, text, text, text, uuid)
  to authenticated;
grant execute on function public.editar_alvara(uuid, integer, date, text, text, text) to authenticated;
grant execute on function public.trocar_pdf_alvara(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.excluir_alvara(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Visão da equipe e calendário: o alvará vigente da série entra como linha de validade.
-- (Mesmo corpo de 20261019174201, mais o bloco do alvará no fim.)
-- ---------------------------------------------------------------------------
create or replace function private.linhas_de_prazo(cid uuid)
returns table (
  tipo_linha text,
  id uuid,
  instrumento_id uuid,
  prazo date,
  dias integer,
  codigo text,
  titulo text,
  empreendimento_id uuid,
  empreendimento_nome text,
  unidade_id uuid,
  unidade_nome text,
  licenca text,
  tipo_id uuid,
  responsavel_id uuid,
  responsavel_nome text,
  situacao_ocorrencia public.situacao_ocorrencia,
  meta_interna date,
  row_version integer
)
language sql
stable
set search_path = ''
as $$
  with hoje as (select private.hoje_da_consultoria(cid) as d)
  select
    'ocorrencia', o.id, o.instrumento_id, o.prazo_oficial_atual, o.prazo_oficial_atual - h.d,
    c.codigo, v.titulo, e.id, e.nome, u.id, u.nome,
    nullif(concat_ws(' ', t.sigla, i.numero), ''), i.tipo_id,
    o.responsavel_id, m.nome, o.situacao, o.meta_interna, o.row_version
  from public.ocorrencia as o
  cross join hoje as h
  join public.condicionante_versao as v on v.consultoria_id = o.consultoria_id and v.id = o.condicionante_versao_id
  join public.condicionante as c on c.consultoria_id = v.consultoria_id and c.id = v.condicionante_id
  join public.instrumento as i on i.consultoria_id = o.consultoria_id and i.id = o.instrumento_id
  join public.unidade as u on u.consultoria_id = i.consultoria_id and u.id = i.unidade_id
  join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  left join public.membro as m on m.consultoria_id = o.consultoria_id and m.id = o.responsavel_id
  where o.consultoria_id = cid and o.situacao <> 'concluida'

  union all

  select
    'validade', i.id, i.id, i.validade, i.validade - h.d,
    null, 'Validade', e.id, e.nome, u.id, u.nome,
    nullif(concat_ws(' ', t.sigla, i.numero), ''), i.tipo_id,
    null, null, null, null, i.row_version
  from public.instrumento as i
  cross join hoje as h
  join public.unidade as u on u.consultoria_id = i.consultoria_id and u.id = i.unidade_id
  join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  where i.consultoria_id = cid and i.situacao = 'ativo'

  union all

  select
    'limite_protocolo', i.id, i.id, i.validade - coalesce(pr.dias_limite_protocolo, 120),
    i.validade - coalesce(pr.dias_limite_protocolo, 120) - h.d,
    null, 'Limite de protocolo', e.id, e.nome, u.id, u.nome,
    nullif(concat_ws(' ', t.sigla, i.numero), ''), i.tipo_id,
    null, null, null, null, i.row_version
  from public.instrumento as i
  cross join hoje as h
  join public.unidade as u on u.consultoria_id = i.consultoria_id and u.id = i.unidade_id
  join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
  join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  left join public.plano_renovacao as pr on pr.consultoria_id = i.consultoria_id and pr.instrumento_id = i.id
  where i.consultoria_id = cid and i.situacao = 'ativo' and upper(btrim(t.sigla)) = 'LAO'
    and pr.protocolado_em is null

  union all

  select
    'validade', a.id, null, a.validade, a.validade - h.d,
    null, 'Validade do alvará', e.id, e.nome, u.id, u.nome,
    nullif(concat_ws(' ', 'Alvará', a.numero), ''), null,
    null, null, null, null, a.row_version
  from public.alvara as a
  cross join hoje as h
  join public.unidade as u on u.consultoria_id = a.consultoria_id and u.id = a.unidade_id
  join public.empreendimento as e on e.consultoria_id = a.consultoria_id and e.id = a.empreendimento_id
  where a.consultoria_id = cid and a.excluido_em is null
    and not exists (
      select 1 from public.alvara as s
      where s.consultoria_id = a.consultoria_id and s.anterior_id = a.id and s.excluido_em is null
    )
$$;
