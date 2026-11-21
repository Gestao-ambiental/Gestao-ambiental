-- Exigências do órgão (P3 do estudo "Oito funções no Grama", ADR-0045).
-- 1. instrumento.numero_processo (texto, opcional), gravado só pela Gestão por RPC explícita.
-- 2. exigencia: ofício do órgão ligado ao empreendimento e à unidade e, se houver, à licença da
--    mesma unidade. Prazo contado a partir do dia seguinte ao recebimento; o domínio calcula, a RPC
--    recalcula em SQL (private.prazo_da_exigencia) e recusa com prazo_divergente se diferirem.
--    prazo_oficial_original nunca muda; prazo_oficial só muda por prorrogação (da Gestão).
--    O banco guarda só o fluxo (aberta → respondida, sem volta); Vence hoje, Atrasada e Respondida
--    fora do prazo são calculadas no domínio.
-- 3. exigencia_resposta: histórico só de acréscimo (resposta, anexo e prorrogação). Trigger barra
--    update, delete e truncate.
-- 4. Fonte de prazo e grupo da busca do P3: redefine só private.linhas_de_prazo_exigencia e
--    private.busca_exigencias (ADR-0041). A união e as RPCs da base ficam como estão.
-- Só a Gestão registra, edita, prorroga, atribui e exclui. A Equipe responde e anexa só quando é a
-- responsável. Todo membro lê (RLS).

-- ---------------------------------------------------------------------------
-- 1. Número do processo na licença
-- ---------------------------------------------------------------------------
alter table public.instrumento add column numero_processo text;
alter table public.instrumento
  add constraint instrumento_numero_processo_valido
  check (numero_processo is null
         or (numero_processo = btrim(numero_processo) and length(numero_processo) between 1 and 60));

comment on column public.instrumento.numero_processo is
  'Número do processo no órgão (texto livre). Gravado só pela Gestão (definir_processo_da_licenca).';

-- ---------------------------------------------------------------------------
-- 2. Tabelas
-- ---------------------------------------------------------------------------
create table public.exigencia (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  empreendimento_id uuid not null,
  unidade_id uuid not null,
  instrumento_id uuid,
  numero_processo text,
  numero_oficio text,
  orgao text,
  assunto text not null,
  notas text,
  documento_id uuid,
  recebido_em date not null,
  recebido_em_texto text,
  prazo_dias integer,
  prazo_contagem public.contagem_prazo,
  prazo_oficial_original date not null,
  prazo_oficial date not null,
  prazo_oficial_texto text,
  meta_interna date not null,
  responsavel_id uuid,
  situacao text not null default 'aberta',
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  excluido_por uuid,
  excluido_em timestamptz,
  row_version integer not null default 1,
  constraint exigencia_situacao_valida check (situacao in ('aberta', 'respondida')),
  constraint exigencia_assunto_valido check (assunto = btrim(assunto) and length(assunto) between 1 and 300),
  constraint exigencia_numero_oficio_valido
    check (numero_oficio is null or (numero_oficio = btrim(numero_oficio) and length(numero_oficio) between 1 and 60)),
  constraint exigencia_orgao_valido
    check (orgao is null or (orgao = btrim(orgao) and length(orgao) between 1 and 120)),
  constraint exigencia_numero_processo_valido
    check (numero_processo is null
           or (numero_processo = btrim(numero_processo) and length(numero_processo) between 1 and 60)),
  constraint exigencia_notas_validas check (notas is null or length(notas) between 1 and 4000),
  constraint exigencia_textos_de_data_validos check (
    (recebido_em_texto is null or length(recebido_em_texto) between 1 and 60)
    and (prazo_oficial_texto is null or length(prazo_oficial_texto) between 1 and 60)),
  constraint exigencia_prazo_em_dias_coerente check (
    (prazo_dias is null) = (prazo_contagem is null) and (prazo_dias is null or prazo_dias between 1 and 365)),
  constraint exigencia_prazo_informado_com_texto check (prazo_dias is not null or prazo_oficial_texto is not null),
  constraint exigencia_prazo_depois_do_recebimento check (
    prazo_oficial_original > recebido_em and prazo_oficial >= prazo_oficial_original),
  constraint exigencia_meta_valida check (meta_interna between recebido_em and prazo_oficial),
  constraint exigencia_exclusao_coerente check ((excluido_por is null) = (excluido_em is null)),
  constraint exigencia_consultoria_id_id_key unique (consultoria_id, id),
  constraint exigencia_unidade_fk foreign key (consultoria_id, empreendimento_id, unidade_id)
    references public.unidade (consultoria_id, empreendimento_id, id) on delete restrict,
  constraint exigencia_instrumento_fk foreign key (consultoria_id, instrumento_id)
    references public.instrumento (consultoria_id, id) on delete restrict,
  constraint exigencia_documento_fk foreign key (consultoria_id, documento_id)
    references public.documento (consultoria_id, id) on delete restrict,
  constraint exigencia_responsavel_fk foreign key (consultoria_id, responsavel_id)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint exigencia_criado_por_fk foreign key (consultoria_id, criado_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint exigencia_excluido_por_fk foreign key (consultoria_id, excluido_por)
    references public.membro (consultoria_id, id) on delete restrict
);

create index exigencia_empreendimento_idx on public.exigencia (consultoria_id, empreendimento_id);
create index exigencia_abertas_idx on public.exigencia (consultoria_id, prazo_oficial)
  where situacao = 'aberta' and excluido_em is null;
create index exigencia_instrumento_idx on public.exigencia (consultoria_id, instrumento_id)
  where instrumento_id is not null;
create index exigencia_responsavel_idx on public.exigencia (consultoria_id, responsavel_id)
  where responsavel_id is not null;

comment on table public.exigencia is
  'Exigência do órgão (ofício com prazo para responder). Situação gravada é só o fluxo; atraso é calculado.';
comment on column public.exigencia.recebido_em is 'Data civil do recebimento do ofício. O prazo conta do dia seguinte.';
comment on column public.exigencia.prazo_oficial_original is 'Prazo do ofício no registro. Nunca muda (trigger).';
comment on column public.exigencia.prazo_oficial is 'Prazo vigente. Só muda por prorrogação da Gestão.';
comment on column public.exigencia.prazo_oficial_texto is 'Texto original da data quando o órgão informa o prazo.';
comment on column public.exigencia.situacao is 'Fluxo gravado: aberta ou respondida (sem volta).';

create table public.exigencia_resposta (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  exigencia_id uuid not null,
  tipo text not null,
  protocolo_numero text,
  protocolado_em date,
  protocolado_em_texto text,
  prazo_anterior date,
  prazo_novo date,
  prazo_novo_texto text,
  meta_interna_anterior date,
  meta_interna_nova date,
  motivo text,
  descricao text,
  documento_id uuid,
  registrado_por uuid not null,
  registrado_em timestamptz not null default now(),
  constraint exigencia_resposta_tipo_valido check (tipo in ('resposta', 'anexo', 'prorrogacao')),
  constraint exigencia_resposta_textos_validos check (
    (protocolo_numero is null
     or (protocolo_numero = btrim(protocolo_numero) and length(protocolo_numero) between 1 and 60))
    and (protocolado_em_texto is null or length(protocolado_em_texto) between 1 and 60)
    and (prazo_novo_texto is null or length(prazo_novo_texto) between 1 and 60)
    and (motivo is null or (motivo = btrim(motivo) and length(motivo) between 1 and 2000))
    and (descricao is null or (descricao = btrim(descricao) and length(descricao) between 1 and 300))),
  constraint exigencia_resposta_tipo_coerente check (
    (tipo = 'resposta' and protocolado_em is not null and (protocolo_numero is not null or documento_id is not null)
       and prazo_anterior is null and prazo_novo is null and prazo_novo_texto is null
       and meta_interna_anterior is null and meta_interna_nova is null and motivo is null)
    or (tipo = 'anexo' and documento_id is not null and descricao is not null
       and protocolo_numero is null and protocolado_em is null and protocolado_em_texto is null
       and prazo_anterior is null and prazo_novo is null and prazo_novo_texto is null
       and meta_interna_anterior is null and meta_interna_nova is null and motivo is null)
    or (tipo = 'prorrogacao' and prazo_anterior is not null and prazo_novo > prazo_anterior
       and meta_interna_anterior is not null and meta_interna_nova is not null and meta_interna_nova <= prazo_novo
       and motivo is not null and protocolo_numero is null and protocolado_em is null
       and protocolado_em_texto is null)),
  constraint exigencia_resposta_consultoria_id_id_key unique (consultoria_id, id),
  constraint exigencia_resposta_exigencia_fk foreign key (consultoria_id, exigencia_id)
    references public.exigencia (consultoria_id, id) on delete restrict,
  constraint exigencia_resposta_documento_fk foreign key (consultoria_id, documento_id)
    references public.documento (consultoria_id, id) on delete restrict,
  constraint exigencia_resposta_registrado_por_fk foreign key (consultoria_id, registrado_por)
    references public.membro (consultoria_id, id) on delete restrict
);

create index exigencia_resposta_exigencia_idx
  on public.exigencia_resposta (consultoria_id, exigencia_id, registrado_em);

comment on table public.exigencia_resposta is
  'Histórico da exigência, só de acréscimo: resposta (protocolo), anexo (PDF) e prorrogação (Gestão).';

-- ---------------------------------------------------------------------------
-- 3. RLS, grants e triggers
-- ---------------------------------------------------------------------------
do $$
declare
  tabela text;
begin
  foreach tabela in array array['exigencia', 'exigencia_resposta'] loop
    execute format('alter table public.%I enable row level security', tabela);
    execute format('alter table public.%I force row level security', tabela);
    execute format('revoke all on table public.%I from public, anon, authenticated', tabela);
    execute format('grant select on table public.%I to authenticated', tabela);
    execute format(
      'create policy %I on public.%I for select to authenticated '
      'using ((select private.is_membro(consultoria_id)))',
      tabela || '_select_membro_ativo', tabela);
    execute format(
      'create trigger %I after insert or update or delete on public.%I '
      'for each row execute function private.auditar()',
      tabela || '_auditar', tabela);
    execute format(
      'create trigger _suporte_somente_leitura before insert or update or delete on public.%I '
      'for each row execute function private.bloquear_escrita_do_suporte()', tabela);
    execute format(
      'create trigger _comercial_somente_leitura before insert or update or delete on public.%I '
      'for each row execute function private.bloquear_escrita_comercial()', tabela);
  end loop;
end;
$$;

create trigger exigencia_prazo_original_imutavel
  before update on public.exigencia
  for each row execute function private.preservar_prazo_original();

-- Licença ligada tem de ser da mesma unidade (e consultoria).
create function private.conferir_licenca_da_exigencia()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.instrumento_id is not null and not exists (
    select 1 from public.instrumento as i
    where i.consultoria_id = new.consultoria_id and i.id = new.instrumento_id and i.unidade_id = new.unidade_id
  ) then
    raise exception 'licenca_invalida' using errcode = '22023';
  end if;
  return new;
end;
$$;

-- Excluída não muda; dados de origem não mudam; respondida não volta a aberta.
create function private.travar_exigencia()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.excluido_em is not null then
    raise exception 'exigencia_excluida' using errcode = 'P0001';
  end if;
  if new.consultoria_id is distinct from old.consultoria_id
     or new.empreendimento_id is distinct from old.empreendimento_id
     or new.unidade_id is distinct from old.unidade_id
     or new.instrumento_id is distinct from old.instrumento_id
     or new.documento_id is distinct from old.documento_id
     or new.recebido_em is distinct from old.recebido_em
     or new.recebido_em_texto is distinct from old.recebido_em_texto
     or new.prazo_dias is distinct from old.prazo_dias
     or new.prazo_contagem is distinct from old.prazo_contagem
     or new.criado_por is distinct from old.criado_por
     or new.criado_em is distinct from old.criado_em then
    raise exception 'campo_imutavel' using errcode = 'P0001';
  end if;
  if old.situacao = 'respondida' and new.situacao = 'aberta' then
    raise exception 'exigencia_respondida' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create function private.bloquear_alteracao_exigencia_resposta()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'exigencia_resposta é append-only: % não é permitido', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

revoke all on function private.conferir_licenca_da_exigencia() from public, anon, authenticated;
revoke all on function private.travar_exigencia() from public, anon, authenticated;
revoke all on function private.bloquear_alteracao_exigencia_resposta() from public, anon, authenticated;

create trigger exigencia_licenca_da_unidade
  before insert on public.exigencia
  for each row execute function private.conferir_licenca_da_exigencia();
create trigger exigencia_travas
  before update on public.exigencia
  for each row execute function private.travar_exigencia();

create trigger exigencia_resposta_bloquear_update_delete
  before update or delete on public.exigencia_resposta
  for each row execute function private.bloquear_alteracao_exigencia_resposta();
create trigger exigencia_resposta_bloquear_truncate
  before truncate on public.exigencia_resposta
  for each statement execute function private.bloquear_alteracao_exigencia_resposta();

-- ---------------------------------------------------------------------------
-- 4. Helpers
-- ---------------------------------------------------------------------------
-- Prazo do ofício, igual a prazoDeOficio do domínio: conta do dia seguinte ao recebimento; em dias
-- corridos não empurra para dia útil; em dias úteis pula fim de semana e feriado nacional.
-- Teste cruzado: pgTAP 743 e packages/domain/src/exigencia.test.ts com a mesma tabela.
create function private.prazo_da_exigencia(recebido date, dias integer, contagem public.contagem_prazo)
returns date
language sql
immutable
set search_path = ''
as $$
  select case contagem when 'corridos' then recebido + dias else private.somar_dias_uteis(recebido, dias) end
$$;

-- Textos da exigência: assunto obrigatório; limites iguais aos das constraints.
create function private.conferir_textos_da_exigencia(
  p_assunto text,
  p_numero_oficio text,
  p_orgao text,
  p_numero_processo text,
  p_notas text
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if btrim(coalesce(p_assunto, '')) = '' then
    raise exception 'assunto_obrigatorio' using errcode = '22023';
  end if;
  if length(btrim(p_assunto)) > 300 or length(btrim(coalesce(p_numero_oficio, ''))) > 60
     or length(btrim(coalesce(p_orgao, ''))) > 120 or length(btrim(coalesce(p_numero_processo, ''))) > 60
     or length(btrim(coalesce(p_notas, ''))) > 4000 then
    raise exception 'texto_longo_demais' using errcode = '22023';
  end if;
end;
$$;

-- PDF opcional: os quatro dados vêm juntos ou nenhum vem.
create function private.pdf_da_exigencia_informado(
  p_versao_id uuid,
  p_caminho text,
  p_nome_original text,
  p_sha256 text
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_versao_id is null and p_caminho is null and p_nome_original is null and p_sha256 is null then
    return false;
  end if;
  if p_versao_id is null or p_caminho is null or p_nome_original is null or p_sha256 is null then
    raise exception 'pdf_incompleto' using errcode = '22023';
  end if;
  return true;
end;
$$;

-- Documento novo com a versão 1 do PDF já enviado ao Storage (como registrar_alvara).
create function private.registrar_pdf_da_exigencia(
  cid uuid,
  p_entidade text,
  p_versao_id uuid,
  p_caminho text,
  p_nome_original text,
  p_sha256 text,
  ator uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  tamanho bigint;
  doc uuid;
begin
  if exists (select 1 from public.documento_versao as v where v.id = p_versao_id) then
    raise exception 'versao_existente' using errcode = 'P0001';
  end if;
  tamanho := private.conferir_pdf_enviado(cid, p_entidade, p_caminho, p_nome_original, p_sha256);
  insert into public.documento (consultoria_id, entidade, versao_vigente_id)
  values (cid, p_entidade, null)
  returning id into doc;
  insert into public.documento_versao (id, consultoria_id, documento_id, numero, caminho, nome_original, mime,
                                       tamanho_bytes, sha256, autor_id)
  values (p_versao_id, cid, doc, 1, p_caminho, btrim(p_nome_original), 'application/pdf', tamanho,
          lower(p_sha256), ator);
  update public.documento as d set versao_vigente_id = p_versao_id where d.id = doc;
  return doc;
end;
$$;

-- Exigência para a Gestão mexer: travada, da Gestão, não excluída, na versão lida (se informada).
create function private.exigencia_para_gestao(p_exigencia_id uuid, p_row_version integer)
returns public.exigencia
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.exigencia;
begin
  select * into alvo from public.exigencia as x where x.id = p_exigencia_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id)
     or private.membro_atual(alvo.consultoria_id) is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.excluido_em is not null then
    raise exception 'exigencia_excluida' using errcode = 'P0001';
  end if;
  if p_row_version is not null and alvo.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  return alvo;
end;
$$;

-- Exigência para responder ou anexar: travada, da Gestão ou da responsável, não excluída.
create function private.exigencia_para_responder(p_exigencia_id uuid)
returns public.exigencia
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.exigencia;
  eu uuid;
begin
  select * into alvo from public.exigencia as x where x.id = p_exigencia_id for update;
  if not found then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  eu := private.membro_atual(alvo.consultoria_id);
  if eu is null or not (private.is_gestao(alvo.consultoria_id) or eu = alvo.responsavel_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.excluido_em is not null then
    raise exception 'exigencia_excluida' using errcode = 'P0001';
  end if;
  return alvo;
end;
$$;

revoke all on function private.prazo_da_exigencia(date, integer, public.contagem_prazo) from public, anon, authenticated;
revoke all on function private.conferir_textos_da_exigencia(text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function private.pdf_da_exigencia_informado(uuid, text, text, text) from public, anon, authenticated;
revoke all on function private.registrar_pdf_da_exigencia(uuid, text, uuid, text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function private.exigencia_para_gestao(uuid, integer) from public, anon, authenticated;
revoke all on function private.exigencia_para_responder(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPCs de escrita
-- ---------------------------------------------------------------------------
-- Registrar (Gestão). Idempotente pelo p_id gerado na tela. Prazo em dias (recalculado aqui) ou
-- informado pelo órgão (com o texto original). PDF do ofício opcional.
create function public.registrar_exigencia(
  p_id uuid,
  p_unidade_id uuid,
  p_assunto text,
  p_recebido_em date,
  p_prazo_oficial date,
  p_meta_interna date,
  p_recebido_em_texto text default null,
  p_prazo_dias integer default null,
  p_prazo_contagem public.contagem_prazo default null,
  p_prazo_oficial_texto text default null,
  p_instrumento_id uuid default null,
  p_numero_oficio text default null,
  p_orgao text default null,
  p_numero_processo text default null,
  p_notas text default null,
  p_responsavel_id uuid default null,
  p_versao_id uuid default null,
  p_caminho text default null,
  p_nome_original text default null,
  p_sha256 text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  un public.unidade;
  ator uuid;
  novo uuid := coalesce(p_id, gen_random_uuid());
  cid_existente uuid;
  modo_dias boolean := p_prazo_dias is not null or p_prazo_contagem is not null;
  texto_prazo text := nullif(btrim(coalesce(p_prazo_oficial_texto, '')), '');
  texto_recebido text := nullif(btrim(coalesce(p_recebido_em_texto, '')), '');
  doc uuid;
begin
  select * into un from public.unidade as u where u.id = p_unidade_id;
  if not found or not private.is_gestao(un.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  ator := private.membro_atual(un.consultoria_id);
  if ator is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  -- Retry: a exigência já registrada volta como está.
  select x.consultoria_id into cid_existente from public.exigencia as x where x.id = novo;
  if found then
    if cid_existente = un.consultoria_id then
      return novo;
    end if;
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  perform private.conferir_textos_da_exigencia(p_assunto, p_numero_oficio, p_orgao, p_numero_processo, p_notas);
  if length(coalesce(texto_recebido, '')) > 60 or length(coalesce(texto_prazo, '')) > 60 then
    raise exception 'texto_longo_demais' using errcode = '22023';
  end if;

  if p_recebido_em is null then
    raise exception 'data_de_recebimento_obrigatoria' using errcode = '22023';
  end if;
  if p_recebido_em > private.hoje_da_consultoria(un.consultoria_id) then
    raise exception 'data_de_recebimento_futura' using errcode = '22023';
  end if;
  if p_prazo_oficial is null then
    raise exception 'prazo_obrigatorio' using errcode = '22023';
  end if;

  if modo_dias then
    if p_prazo_dias is null or p_prazo_contagem is null then
      raise exception 'prazo_incompleto' using errcode = '22023';
    end if;
    if p_prazo_dias not between 1 and 365 then
      raise exception 'prazo_invalido' using errcode = '22023';
    end if;
    if private.prazo_da_exigencia(p_recebido_em, p_prazo_dias, p_prazo_contagem) <> p_prazo_oficial then
      raise exception 'prazo_divergente' using errcode = '22023';
    end if;
  else
    if texto_prazo is null then
      raise exception 'texto_do_prazo_obrigatorio' using errcode = '22023';
    end if;
    if p_prazo_oficial <= p_recebido_em then
      raise exception 'prazo_antes_do_recebimento' using errcode = '22023';
    end if;
  end if;

  if p_meta_interna is null then
    raise exception 'meta_interna_obrigatoria' using errcode = '22023';
  end if;
  if p_meta_interna < p_recebido_em or p_meta_interna > p_prazo_oficial then
    raise exception 'meta_interna_invalida' using errcode = '22023';
  end if;

  if p_instrumento_id is not null and not exists (
    select 1 from public.instrumento as i
    where i.consultoria_id = un.consultoria_id and i.id = p_instrumento_id and i.unidade_id = un.id
  ) then
    raise exception 'licenca_invalida' using errcode = '22023';
  end if;

  perform private.conferir_responsavel(un.consultoria_id, p_responsavel_id);

  if private.pdf_da_exigencia_informado(p_versao_id, p_caminho, p_nome_original, p_sha256) then
    doc := private.registrar_pdf_da_exigencia(un.consultoria_id, 'exigencia', p_versao_id, p_caminho,
                                              p_nome_original, p_sha256, ator);
  end if;

  insert into public.exigencia (id, consultoria_id, empreendimento_id, unidade_id, instrumento_id,
                                numero_processo, numero_oficio, orgao, assunto, notas, documento_id,
                                recebido_em, recebido_em_texto, prazo_dias, prazo_contagem,
                                prazo_oficial_original, prazo_oficial, prazo_oficial_texto, meta_interna,
                                responsavel_id, situacao, criado_por)
  values (novo, un.consultoria_id, un.empreendimento_id, un.id, p_instrumento_id,
          nullif(btrim(coalesce(p_numero_processo, '')), ''), nullif(btrim(coalesce(p_numero_oficio, '')), ''),
          nullif(btrim(coalesce(p_orgao, '')), ''), btrim(p_assunto), nullif(btrim(coalesce(p_notas, '')), ''),
          doc, p_recebido_em, texto_recebido, p_prazo_dias, p_prazo_contagem,
          p_prazo_oficial, p_prazo_oficial, texto_prazo, p_meta_interna,
          p_responsavel_id, 'aberta', ator);
  return novo;
end;
$$;

-- Editar textos e meta interna (Gestão). Não muda datas, unidade, licença nem PDF.
create function public.editar_exigencia(
  p_exigencia_id uuid,
  p_row_version integer,
  p_assunto text,
  p_meta_interna date,
  p_numero_oficio text default null,
  p_orgao text default null,
  p_numero_processo text default null,
  p_notas text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.exigencia;
  assunto_novo text;
  oficio_novo text := nullif(btrim(coalesce(p_numero_oficio, '')), '');
  orgao_novo text := nullif(btrim(coalesce(p_orgao, '')), '');
  processo_novo text := nullif(btrim(coalesce(p_numero_processo, '')), '');
  notas_novas text := nullif(btrim(coalesce(p_notas, '')), '');
begin
  alvo := private.exigencia_para_gestao(p_exigencia_id, null);
  if alvo.row_version is distinct from p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  perform private.conferir_textos_da_exigencia(p_assunto, p_numero_oficio, p_orgao, p_numero_processo, p_notas);
  assunto_novo := btrim(p_assunto);
  if p_meta_interna is null then
    raise exception 'meta_interna_obrigatoria' using errcode = '22023';
  end if;
  if p_meta_interna < alvo.recebido_em or p_meta_interna > alvo.prazo_oficial then
    raise exception 'meta_interna_invalida' using errcode = '22023';
  end if;
  if alvo.assunto = assunto_novo and alvo.meta_interna = p_meta_interna
     and alvo.numero_oficio is not distinct from oficio_novo and alvo.orgao is not distinct from orgao_novo
     and alvo.numero_processo is not distinct from processo_novo and alvo.notas is not distinct from notas_novas then
    return alvo.row_version;
  end if;
  update public.exigencia as x
  set assunto = assunto_novo, meta_interna = p_meta_interna, numero_oficio = oficio_novo, orgao = orgao_novo,
      numero_processo = processo_novo, notas = notas_novas, row_version = x.row_version + 1
  where x.id = alvo.id;
  return alvo.row_version + 1;
end;
$$;

-- Registrar resposta (Gestão ou responsável). A primeira encerra a exigência; as seguintes
-- (complementação) só acrescentam. Idempotente pelo p_resposta_id.
create function public.responder_exigencia(
  p_resposta_id uuid,
  p_exigencia_id uuid,
  p_protocolado_em date,
  p_protocolado_em_texto text default null,
  p_protocolo_numero text default null,
  p_descricao text default null,
  p_versao_id uuid default null,
  p_caminho text default null,
  p_nome_original text default null,
  p_sha256 text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.exigencia;
  ator uuid;
  exigencia_da_resposta uuid;
  novo uuid := coalesce(p_resposta_id, gen_random_uuid());
  numero text := nullif(btrim(coalesce(p_protocolo_numero, '')), '');
  texto_data text := nullif(btrim(coalesce(p_protocolado_em_texto, '')), '');
  descricao_nova text := nullif(btrim(coalesce(p_descricao, '')), '');
  com_pdf boolean;
  doc uuid;
begin
  alvo := private.exigencia_para_responder(p_exigencia_id);
  ator := private.membro_atual(alvo.consultoria_id);

  select r.exigencia_id into exigencia_da_resposta from public.exigencia_resposta as r where r.id = novo;
  if found then
    if exigencia_da_resposta = alvo.id then
      return alvo.row_version;
    end if;
    raise exception 'resposta_existente' using errcode = 'P0001';
  end if;

  if p_protocolado_em is null then
    raise exception 'data_do_protocolo_obrigatoria' using errcode = '22023';
  end if;
  if p_protocolado_em > private.hoje_da_consultoria(alvo.consultoria_id) then
    raise exception 'data_do_protocolo_futura' using errcode = '22023';
  end if;
  if p_protocolado_em < alvo.recebido_em then
    raise exception 'protocolo_antes_do_recebimento' using errcode = '22023';
  end if;
  if length(coalesce(numero, '')) > 60 or length(coalesce(texto_data, '')) > 60
     or length(coalesce(descricao_nova, '')) > 300 then
    raise exception 'texto_longo_demais' using errcode = '22023';
  end if;
  com_pdf := private.pdf_da_exigencia_informado(p_versao_id, p_caminho, p_nome_original, p_sha256);
  if numero is null and not com_pdf then
    raise exception 'resposta_sem_comprovante' using errcode = '22023';
  end if;
  if com_pdf then
    doc := private.registrar_pdf_da_exigencia(alvo.consultoria_id, 'exigencia_resposta', p_versao_id, p_caminho,
                                              p_nome_original, p_sha256, ator);
  end if;

  insert into public.exigencia_resposta (id, consultoria_id, exigencia_id, tipo, protocolo_numero, protocolado_em,
                                         protocolado_em_texto, descricao, documento_id, registrado_por)
  values (novo, alvo.consultoria_id, alvo.id, 'resposta', numero, p_protocolado_em, texto_data, descricao_nova,
          doc, ator);

  if alvo.situacao = 'aberta' then
    update public.exigencia as x set situacao = 'respondida', row_version = x.row_version + 1 where x.id = alvo.id;
    return alvo.row_version + 1;
  end if;
  return alvo.row_version;
end;
$$;

-- Anexar documento ao histórico (Gestão ou responsável). Não muda a exigência.
create function public.anexar_a_exigencia(
  p_resposta_id uuid,
  p_exigencia_id uuid,
  p_descricao text,
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
  alvo public.exigencia;
  ator uuid;
  exigencia_da_resposta uuid;
  descricao_nova text := nullif(btrim(coalesce(p_descricao, '')), '');
  novo uuid := coalesce(p_resposta_id, gen_random_uuid());
  doc uuid;
begin
  alvo := private.exigencia_para_responder(p_exigencia_id);
  ator := private.membro_atual(alvo.consultoria_id);

  select r.exigencia_id into exigencia_da_resposta from public.exigencia_resposta as r where r.id = novo;
  if found then
    if exigencia_da_resposta = alvo.id then
      return novo;
    end if;
    raise exception 'resposta_existente' using errcode = 'P0001';
  end if;

  if descricao_nova is null then
    raise exception 'descricao_obrigatoria' using errcode = '22023';
  end if;
  if length(descricao_nova) > 300 then
    raise exception 'texto_longo_demais' using errcode = '22023';
  end if;
  if not private.pdf_da_exigencia_informado(p_versao_id, p_caminho, p_nome_original, p_sha256) then
    raise exception 'pdf_incompleto' using errcode = '22023';
  end if;
  doc := private.registrar_pdf_da_exigencia(alvo.consultoria_id, 'exigencia_resposta', p_versao_id, p_caminho,
                                            p_nome_original, p_sha256, ator);

  insert into public.exigencia_resposta (id, consultoria_id, exigencia_id, tipo, descricao, documento_id,
                                         registrado_por)
  values (novo, alvo.consultoria_id, alvo.id, 'anexo', descricao_nova, doc, ator);
  return novo;
end;
$$;

-- Prorrogar (Gestão, só aberta). Muda prazo_oficial e meta; prazo_oficial_original nunca muda.
create function public.prorrogar_exigencia(
  p_resposta_id uuid,
  p_exigencia_id uuid,
  p_row_version integer,
  p_prazo_novo date,
  p_meta_interna date,
  p_motivo text,
  p_prazo_novo_texto text default null,
  p_versao_id uuid default null,
  p_caminho text default null,
  p_nome_original text default null,
  p_sha256 text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.exigencia;
  ator uuid;
  exigencia_da_resposta uuid;
  novo uuid := coalesce(p_resposta_id, gen_random_uuid());
  motivo_novo text := nullif(btrim(coalesce(p_motivo, '')), '');
  texto_prazo text := nullif(btrim(coalesce(p_prazo_novo_texto, '')), '');
  doc uuid;
begin
  select * into alvo from public.exigencia as x where x.id = p_exigencia_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  ator := private.membro_atual(alvo.consultoria_id);
  if ator is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  -- Retry: antes da versão, porque a primeira tentativa já a mudou.
  select r.exigencia_id into exigencia_da_resposta from public.exigencia_resposta as r where r.id = novo;
  if found then
    if exigencia_da_resposta = alvo.id then
      return alvo.row_version;
    end if;
    raise exception 'resposta_existente' using errcode = 'P0001';
  end if;

  if alvo.excluido_em is not null then
    raise exception 'exigencia_excluida' using errcode = 'P0001';
  end if;
  if alvo.row_version is distinct from p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  if alvo.situacao = 'respondida' then
    raise exception 'exigencia_respondida' using errcode = 'P0001';
  end if;
  if p_prazo_novo is null or p_prazo_novo <= alvo.prazo_oficial then
    raise exception 'prorrogacao_invalida' using errcode = '22023';
  end if;
  if motivo_novo is null then
    raise exception 'motivo_obrigatorio' using errcode = '22023';
  end if;
  if length(motivo_novo) > 2000 or length(coalesce(texto_prazo, '')) > 60 then
    raise exception 'texto_longo_demais' using errcode = '22023';
  end if;
  if p_meta_interna is null then
    raise exception 'meta_interna_obrigatoria' using errcode = '22023';
  end if;
  if p_meta_interna < alvo.recebido_em or p_meta_interna > p_prazo_novo then
    raise exception 'meta_interna_invalida' using errcode = '22023';
  end if;

  if private.pdf_da_exigencia_informado(p_versao_id, p_caminho, p_nome_original, p_sha256) then
    doc := private.registrar_pdf_da_exigencia(alvo.consultoria_id, 'exigencia_resposta', p_versao_id, p_caminho,
                                              p_nome_original, p_sha256, ator);
  end if;

  insert into public.exigencia_resposta (id, consultoria_id, exigencia_id, tipo, prazo_anterior, prazo_novo,
                                         prazo_novo_texto, meta_interna_anterior, meta_interna_nova, motivo,
                                         documento_id, registrado_por)
  values (novo, alvo.consultoria_id, alvo.id, 'prorrogacao', alvo.prazo_oficial, p_prazo_novo, texto_prazo,
          alvo.meta_interna, p_meta_interna, motivo_novo, doc, ator);

  update public.exigencia as x
  set prazo_oficial = p_prazo_novo, meta_interna = p_meta_interna, row_version = x.row_version + 1
  where x.id = alvo.id;
  return alvo.row_version + 1;
end;
$$;

-- Atribuir responsável (Gestão, só aberta). Espelho de atribuir_ocorrencia; nulo tira o responsável.
create function public.atribuir_exigencia(p_exigencia_id uuid, p_membro_id uuid, p_row_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.exigencia;
begin
  alvo := private.exigencia_para_gestao(p_exigencia_id, null);
  if alvo.situacao = 'respondida' then
    raise exception 'exigencia_respondida' using errcode = 'P0001';
  end if;
  if alvo.row_version is distinct from p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  perform private.conferir_responsavel(alvo.consultoria_id, p_membro_id);

  update public.exigencia as x
  set responsavel_id = p_membro_id, row_version = x.row_version + 1
  where x.id = alvo.id;
  return alvo.row_version + 1;
end;
$$;

-- Excluir (Gestão). Lógica, só sem histórico; repetir é inofensivo.
create function public.excluir_exigencia(p_exigencia_id uuid, p_row_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.exigencia;
  ator uuid;
begin
  select * into alvo from public.exigencia as x where x.id = p_exigencia_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  ator := private.membro_atual(alvo.consultoria_id);
  if ator is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.excluido_em is not null then
    return;
  end if;
  if alvo.row_version is distinct from p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.exigencia_resposta as r
    where r.consultoria_id = alvo.consultoria_id and r.exigencia_id = alvo.id
  ) then
    raise exception 'exigencia_com_respostas' using errcode = 'P0001';
  end if;
  update public.exigencia as x
  set excluido_por = ator, excluido_em = now(), row_version = x.row_version + 1
  where x.id = alvo.id;
end;
$$;

-- Gravar o número do processo na licença (Gestão, em qualquer situação da licença).
create function public.definir_processo_da_licenca(
  p_instrumento_id uuid,
  p_row_version integer,
  p_numero_processo text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.instrumento;
  processo_novo text := nullif(btrim(coalesce(p_numero_processo, '')), '');
begin
  select * into alvo from public.instrumento as i where i.id = p_instrumento_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id)
     or private.membro_atual(alvo.consultoria_id) is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.row_version is distinct from p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  if length(coalesce(processo_novo, '')) > 60 then
    raise exception 'texto_longo_demais' using errcode = '22023';
  end if;
  if alvo.numero_processo is not distinct from processo_novo then
    return alvo.row_version;
  end if;
  update public.instrumento as i
  set numero_processo = processo_novo, row_version = i.row_version + 1
  where i.id = alvo.id;
  return alvo.row_version + 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. RPCs de leitura (security invoker: a RLS de quem chama decide o que volta)
-- ---------------------------------------------------------------------------
-- Abertas primeiro (prazo mais perto antes), depois respondidas (prazo mais recente antes).
create function public.listar_exigencias(
  p_consultoria_id uuid,
  p_empreendimento_id uuid default null,
  p_situacao text default null,
  p_exigencia_id uuid default null,
  p_limite integer default 25,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  empreendimento_id uuid,
  empreendimento_nome text,
  unidade_id uuid,
  unidade_nome text,
  instrumento_id uuid,
  licenca text,
  licenca_numero_processo text,
  licenca_row_version integer,
  numero_processo text,
  numero_oficio text,
  orgao text,
  assunto text,
  notas text,
  recebido_em date,
  recebido_em_texto text,
  prazo_dias integer,
  prazo_contagem public.contagem_prazo,
  prazo_oficial_original date,
  prazo_oficial date,
  prazo_oficial_texto text,
  meta_interna date,
  responsavel_id uuid,
  responsavel_nome text,
  situacao text,
  primeira_resposta_em date,
  respostas bigint,
  oficio_caminho text,
  oficio_nome text,
  criado_em timestamptz,
  criado_por_nome text,
  row_version integer,
  hoje date,
  dias integer,
  total bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with h as (select private.hoje_da_consultoria(p_consultoria_id) as d)
  select
    x.id, x.empreendimento_id, e.nome, x.unidade_id, u.nome, x.instrumento_id,
    nullif(concat_ws(' ', t.sigla, i.numero), ''), i.numero_processo, i.row_version,
    x.numero_processo, x.numero_oficio, x.orgao, x.assunto, x.notas,
    x.recebido_em, x.recebido_em_texto, x.prazo_dias, x.prazo_contagem,
    x.prazo_oficial_original, x.prazo_oficial, x.prazo_oficial_texto, x.meta_interna,
    x.responsavel_id, m.nome, x.situacao,
    r.primeira_resposta_em, r.respostas,
    dv.caminho, dv.nome_original,
    x.criado_em, mc.nome, x.row_version,
    h.d, x.prazo_oficial - h.d, count(*) over ()
  from public.exigencia as x
  cross join h
  join public.unidade as u on u.consultoria_id = x.consultoria_id and u.id = x.unidade_id
  join public.empreendimento as e on e.consultoria_id = x.consultoria_id and e.id = x.empreendimento_id
  left join public.instrumento as i on i.consultoria_id = x.consultoria_id and i.id = x.instrumento_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  left join public.membro as m on m.consultoria_id = x.consultoria_id and m.id = x.responsavel_id
  left join public.membro as mc on mc.consultoria_id = x.consultoria_id and mc.id = x.criado_por
  left join public.documento as d on d.consultoria_id = x.consultoria_id and d.id = x.documento_id
  left join public.documento_versao as dv on dv.consultoria_id = d.consultoria_id and dv.id = d.versao_vigente_id
  cross join lateral (
    select min(er.protocolado_em) filter (where er.tipo = 'resposta') as primeira_resposta_em,
           count(*) as respostas
    from public.exigencia_resposta as er
    where er.consultoria_id = x.consultoria_id and er.exigencia_id = x.id
  ) as r
  where x.consultoria_id = p_consultoria_id
    and x.excluido_em is null
    and (p_empreendimento_id is null or x.empreendimento_id = p_empreendimento_id)
    and (p_exigencia_id is null or x.id = p_exigencia_id)
    and case p_situacao
          when 'abertas' then x.situacao = 'aberta'
          when 'respondidas' then x.situacao = 'respondida'
          else true
        end
  order by
    case when x.situacao = 'aberta' then 0 else 1 end,
    case when x.situacao = 'aberta' then x.prazo_oficial end asc,
    case when x.situacao <> 'aberta' then x.prazo_oficial end desc,
    x.id
  limit least(greatest(coalesce(p_limite, 25), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0)
$$;

create function public.listar_respostas_da_exigencia(p_exigencia_id uuid)
returns table (
  id uuid,
  tipo text,
  protocolo_numero text,
  protocolado_em date,
  protocolado_em_texto text,
  prazo_anterior date,
  prazo_novo date,
  prazo_novo_texto text,
  meta_interna_anterior date,
  meta_interna_nova date,
  motivo text,
  descricao text,
  documento_caminho text,
  documento_nome text,
  registrado_por uuid,
  registrado_por_nome text,
  registrado_em timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    r.id, r.tipo, r.protocolo_numero, r.protocolado_em, r.protocolado_em_texto, r.prazo_anterior, r.prazo_novo,
    r.prazo_novo_texto, r.meta_interna_anterior, r.meta_interna_nova, r.motivo, r.descricao,
    dv.caminho, dv.nome_original, r.registrado_por, m.nome, r.registrado_em
  from public.exigencia_resposta as r
  left join public.membro as m on m.consultoria_id = r.consultoria_id and m.id = r.registrado_por
  left join public.documento as d on d.consultoria_id = r.consultoria_id and d.id = r.documento_id
  left join public.documento_versao as dv on dv.consultoria_id = d.consultoria_id and dv.id = d.versao_vigente_id
  where r.exigencia_id = p_exigencia_id
  order by r.registrado_em, r.id
$$;

revoke all on function public.registrar_exigencia(uuid, uuid, text, date, date, date, text, integer,
  public.contagem_prazo, text, uuid, text, text, text, text, uuid, uuid, text, text, text) from public, anon;
revoke all on function public.editar_exigencia(uuid, integer, text, date, text, text, text, text) from public, anon;
revoke all on function public.responder_exigencia(uuid, uuid, date, text, text, text, uuid, text, text, text)
  from public, anon;
revoke all on function public.anexar_a_exigencia(uuid, uuid, text, uuid, text, text, text) from public, anon;
revoke all on function public.prorrogar_exigencia(uuid, uuid, integer, date, date, text, text, uuid, text, text, text)
  from public, anon;
revoke all on function public.atribuir_exigencia(uuid, uuid, integer) from public, anon;
revoke all on function public.excluir_exigencia(uuid, integer) from public, anon;
revoke all on function public.definir_processo_da_licenca(uuid, integer, text) from public, anon;
revoke all on function public.listar_exigencias(uuid, uuid, text, uuid, integer, integer) from public, anon;
revoke all on function public.listar_respostas_da_exigencia(uuid) from public, anon;

grant execute on function public.registrar_exigencia(uuid, uuid, text, date, date, date, text, integer,
  public.contagem_prazo, text, uuid, text, text, text, text, uuid, uuid, text, text, text) to authenticated;
grant execute on function public.editar_exigencia(uuid, integer, text, date, text, text, text, text) to authenticated;
grant execute on function public.responder_exigencia(uuid, uuid, date, text, text, text, uuid, text, text, text)
  to authenticated;
grant execute on function public.anexar_a_exigencia(uuid, uuid, text, uuid, text, text, text) to authenticated;
grant execute on function public.prorrogar_exigencia(uuid, uuid, integer, date, date, text, text, uuid, text, text, text)
  to authenticated;
grant execute on function public.atribuir_exigencia(uuid, uuid, integer) to authenticated;
grant execute on function public.excluir_exigencia(uuid, integer) to authenticated;
grant execute on function public.definir_processo_da_licenca(uuid, integer, text) to authenticated;
grant execute on function public.listar_exigencias(uuid, uuid, text, uuid, integer, integer) to authenticated;
grant execute on function public.listar_respostas_da_exigencia(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Fonte de prazo e grupo da busca do P3 (mesmo retorno das funções vazias da base; o
--    create or replace mantém os grants). Exigência aberta e não excluída entra como linha
--    'exigencia', com responsável; tipo_id, situacao_ocorrencia e meta_interna nulos.
-- ---------------------------------------------------------------------------
create or replace function private.linhas_de_prazo_exigencia(cid uuid)
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
    'exigencia'::text, x.id, x.instrumento_id, x.prazo_oficial, x.prazo_oficial - h.d,
    x.numero_oficio, x.assunto, e.id, e.nome, u.id, u.nome,
    nullif(concat_ws(' ', t.sigla, i.numero), ''), null::uuid,
    x.responsavel_id, m.nome, null::public.situacao_ocorrencia, null::date, x.row_version
  from public.exigencia as x
  cross join hoje as h
  join public.unidade as u on u.consultoria_id = x.consultoria_id and u.id = x.unidade_id
  join public.empreendimento as e on e.consultoria_id = x.consultoria_id and e.id = x.empreendimento_id
  left join public.instrumento as i on i.consultoria_id = x.consultoria_id and i.id = x.instrumento_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  left join public.membro as m on m.consultoria_id = x.consultoria_id and m.id = x.responsavel_id
  where x.consultoria_id = cid and x.situacao = 'aberta' and x.excluido_em is null
$$;

create or replace function private.busca_exigencias(p_consultoria_id uuid, p_termo text)
returns table (id uuid, titulo text, detalhe text, referencia_id uuid, posicao bigint)
language sql
stable
set search_path = ''
as $$
  select
    x.id,
    coalesce('Ofício ' || x.numero_oficio, x.assunto),
    concat_ws(' · ', case when x.numero_oficio is not null then x.assunto end, e.nome),
    x.empreendimento_id,
    row_number() over (
      order by starts_with(private.normalizar_nome(coalesce(x.numero_oficio, x.assunto)), b.termo) desc,
               x.recebido_em desc, x.id
    )
  from private.termo_de_busca(p_termo) as b
  join public.exigencia as x on x.consultoria_id = p_consultoria_id and x.excluido_em is null
  join public.empreendimento as e on e.consultoria_id = x.consultoria_id and e.id = x.empreendimento_id
  where private.normalizar_nome(concat_ws(' ', x.numero_oficio, x.numero_processo, x.orgao, x.assunto))
        like b.padrao
$$;

comment on function private.linhas_de_prazo_exigencia(uuid) is
  'Exigências do órgão abertas e não excluídas (P3): tipo_linha exigencia, codigo = número do ofício, com responsável.';
comment on function private.busca_exigencias(uuid, text) is
  'Grupo exigencia da busca global (P3): número do ofício, processo, órgão e assunto.';
