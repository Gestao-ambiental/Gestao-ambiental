-- Cadastro de licença (épico 4; LIC-01 a LIC-05; ERD v1; ADR-0007, ADR-0008, ADR-0009, ADR-0010).
-- Caminho manual: rascunho → identificação → condicionantes → prazos → responsáveis → ativar.
-- Só a Gestão cadastra e ativa (decisão de 17/10/2026). Escrita só por RPC.
-- As ocorrências são calculadas aqui, numa RPC em transação, com a mesma política de datas do
-- packages/domain (meses a partir da base, fim de mês sem derivar), e testadas contra os mesmos
-- casos (decisão de 17/10/2026, em vez da Edge Function do brief). Contagem só em dias corridos
-- até existir calendário de feriados (onda 4).

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.situacao_instrumento as enum ('rascunho', 'ativo');
create type public.marco_instrumento as enum ('emissao', 'assinatura', 'publicacao', 'recebimento');
create type public.natureza_condicionante as enum ('obrigacao', 'agrupador', 'informacao_geral', 'condicao_continua');
create type public.revisao_condicionante as enum ('pendente', 'aceita', 'descartada');
create type public.recorrencia_prazo as enum (
  'anual', 'semestral', 'trimestral', 'bimestral', 'mensal', 'unica', 'na_renovacao', 'continua', 'personalizada'
);
create type public.unidade_ciclo as enum ('mes', 'dia');
create type public.contagem_prazo as enum ('corridos', 'uteis');
create type public.situacao_ocorrencia as enum ('aberta', 'em_conferencia', 'concluida');

-- ---------------------------------------------------------------------------
-- tipo_instrumento: catálogo por consultoria (dados, não lista fixa). Semeado com LAO, LAP, LAI
-- e AuA; a consultoria acrescenta os próprios.
-- ---------------------------------------------------------------------------
create table public.tipo_instrumento (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  sigla text not null,
  nome text not null,
  sigla_normalizada text generated always as (private.normalizar_nome(sigla)) stored,
  criado_em timestamptz not null default now(),
  constraint tipo_instrumento_sigla_preenchida check (length(btrim(sigla)) > 0),
  constraint tipo_instrumento_nome_preenchido check (length(btrim(nome)) > 0),
  constraint tipo_instrumento_consultoria_id_id_key unique (consultoria_id, id),
  constraint tipo_instrumento_sigla_key unique (consultoria_id, sigla_normalizada)
);

create function private.semear_tipos_instrumento(cid uuid)
returns void
language sql
set search_path = ''
as $$
  insert into public.tipo_instrumento (consultoria_id, sigla, nome)
  values
    (cid, 'LAO', 'Licença Ambiental de Operação'),
    (cid, 'LAP', 'Licença Ambiental Prévia'),
    (cid, 'LAI', 'Licença Ambiental de Instalação'),
    (cid, 'AuA', 'Autorização Ambiental')
  on conflict (consultoria_id, sigla_normalizada) do nothing
$$;

create function private.semear_tipos_da_consultoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.semear_tipos_instrumento(new.id);
  return null;
end;
$$;

revoke all on function private.semear_tipos_instrumento(uuid) from public, anon, authenticated;
revoke all on function private.semear_tipos_da_consultoria() from public, anon, authenticated;

create trigger consultoria_semear_tipos
  after insert on public.consultoria
  for each row execute function private.semear_tipos_da_consultoria();

select private.semear_tipos_instrumento(c.id) from public.consultoria as c;

-- ---------------------------------------------------------------------------
-- documento / documento_versao (ADR-0008): versão imutável com objeto próprio no Storage.
-- ---------------------------------------------------------------------------
create table public.documento (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  entidade text not null,
  versao_vigente_id uuid,
  criado_em timestamptz not null default now(),
  excluido_em timestamptz,
  constraint documento_entidade_valida check (entidade in ('instrumento')),
  constraint documento_consultoria_id_id_key unique (consultoria_id, id)
);

create table public.documento_versao (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  documento_id uuid not null,
  numero integer not null,
  caminho text not null,
  nome_original text not null,
  mime text not null,
  tamanho_bytes bigint not null,
  sha256 text not null,
  autor_id uuid not null,
  criado_em timestamptz not null default now(),
  constraint documento_versao_consultoria_id_id_key unique (consultoria_id, id),
  constraint documento_versao_caminho_key unique (caminho),
  constraint documento_versao_numero_key unique (documento_id, numero),
  constraint documento_versao_sha256_formato check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint documento_versao_tamanho_positivo check (tamanho_bytes > 0),
  constraint documento_versao_documento_fk foreign key (consultoria_id, documento_id)
    references public.documento (consultoria_id, id) on delete restrict,
  constraint documento_versao_autor_fk foreign key (consultoria_id, autor_id)
    references public.membro (consultoria_id, id) on delete restrict
);

alter table public.documento
  add constraint documento_versao_vigente_fk foreign key (consultoria_id, versao_vigente_id)
  references public.documento_versao (consultoria_id, id) on delete restrict;

create function private.bloquear_alteracao_versao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'documento_versao é imutável: % não é permitido', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

revoke all on function private.bloquear_alteracao_versao() from public, anon, authenticated;

create trigger documento_versao_imutavel
  before update or delete on public.documento_versao
  for each row execute function private.bloquear_alteracao_versao();

-- ---------------------------------------------------------------------------
-- instrumento: licença ou autorização emitida. Rascunho salva incompleto; ativo exige
-- identificação, marco e validade.
-- ---------------------------------------------------------------------------
create table public.instrumento (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  empreendimento_id uuid not null,
  unidade_id uuid not null,
  tipo_id uuid,
  numero text,
  orgao text,
  situacao public.situacao_instrumento not null default 'rascunho',
  emitido_em date,
  emitido_em_texto text,
  assinado_em date,
  assinado_em_texto text,
  publicado_em date,
  publicado_em_texto text,
  recebido_em date,
  recebido_em_texto text,
  marco public.marco_instrumento,
  validade date,
  validade_texto text,
  documento_id uuid,
  antecedencia_renovacao_dias integer not null default 30,
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  ativado_em timestamptz,
  ativado_por uuid,
  chave_ativacao uuid,
  row_version integer not null default 1,
  constraint instrumento_consultoria_id_id_key unique (consultoria_id, id),
  constraint instrumento_chave_ativacao_key unique (chave_ativacao),
  constraint instrumento_antecedencia_valida check (antecedencia_renovacao_dias >= 0),
  constraint instrumento_marco_com_data check (
    marco is null
    or (marco = 'emissao' and emitido_em is not null)
    or (marco = 'assinatura' and assinado_em is not null)
    or (marco = 'publicacao' and publicado_em is not null)
    or (marco = 'recebimento' and recebido_em is not null)
  ),
  constraint instrumento_ativo_completo check (
    situacao = 'rascunho'
    or (tipo_id is not null and marco is not null and validade is not null
        and ativado_em is not null and ativado_por is not null and chave_ativacao is not null)
  ),
  constraint instrumento_unidade_fk foreign key (consultoria_id, empreendimento_id, unidade_id)
    references public.unidade (consultoria_id, empreendimento_id, id) on delete restrict,
  constraint instrumento_tipo_fk foreign key (consultoria_id, tipo_id)
    references public.tipo_instrumento (consultoria_id, id) on delete restrict,
  constraint instrumento_documento_fk foreign key (consultoria_id, documento_id)
    references public.documento (consultoria_id, id) on delete restrict,
  constraint instrumento_criado_por_fk foreign key (consultoria_id, criado_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint instrumento_ativado_por_fk foreign key (consultoria_id, ativado_por)
    references public.membro (consultoria_id, id) on delete restrict
);

create index instrumento_empreendimento_idx on public.instrumento (consultoria_id, empreendimento_id);

comment on column public.instrumento.row_version is 'Controle otimista: cada escrita confere e incrementa (RNF 11).';
comment on column public.instrumento.emitido_em_texto is 'Texto original da data no documento (ADR-0009); vazio no caminho manual.';

-- ---------------------------------------------------------------------------
-- condicionante (identidade) / condicionante_versao (conteúdo). No rascunho a versão 1 é editada
-- no lugar; depois da ativação ela fica congelada com as ocorrências que gerou.
-- ---------------------------------------------------------------------------
create table public.condicionante (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  instrumento_id uuid not null,
  pai_id uuid,
  codigo text not null,
  posicao integer not null,
  revisao public.revisao_condicionante not null default 'aceita',
  origem text not null default 'manual',
  responsavel_id uuid,
  versao_vigente_id uuid,
  criado_em timestamptz not null default now(),
  constraint condicionante_origem_valida check (origem in ('manual', 'ia')),
  constraint condicionante_consultoria_id_id_key unique (consultoria_id, id),
  constraint condicionante_instrumento_id_key unique (consultoria_id, instrumento_id, id),
  constraint condicionante_instrumento_fk foreign key (consultoria_id, instrumento_id)
    references public.instrumento (consultoria_id, id) on delete restrict,
  constraint condicionante_pai_fk foreign key (consultoria_id, instrumento_id, pai_id)
    references public.condicionante (consultoria_id, instrumento_id, id) on delete restrict,
  constraint condicionante_responsavel_fk foreign key (consultoria_id, responsavel_id)
    references public.membro (consultoria_id, id) on delete restrict
);

create index condicionante_instrumento_idx on public.condicionante (consultoria_id, instrumento_id, posicao);

create table public.condicionante_versao (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  condicionante_id uuid not null,
  numero integer not null default 1,
  titulo text not null,
  texto_literal text not null default '',
  natureza public.natureza_condicionante not null,
  recorrencia public.recorrencia_prazo,
  unidade_ciclo public.unidade_ciclo,
  intervalo_ciclo integer,
  contagem public.contagem_prazo not null default 'corridos',
  data_referencia date,
  primeira_data date,
  fonte_regra text,
  prazo_confirmado_por uuid,
  prazo_confirmado_em timestamptz,
  criado_em timestamptz not null default now(),
  constraint condicionante_versao_titulo_preenchido check (length(btrim(titulo)) > 0),
  constraint condicionante_versao_intervalo_positivo check (intervalo_ciclo is null or intervalo_ciclo > 0),
  constraint condicionante_versao_confirmacao_coerente check ((prazo_confirmado_por is null) = (prazo_confirmado_em is null)),
  constraint condicionante_versao_consultoria_id_id_key unique (consultoria_id, id),
  constraint condicionante_versao_numero_key unique (condicionante_id, numero),
  constraint condicionante_versao_condicionante_fk foreign key (consultoria_id, condicionante_id)
    references public.condicionante (consultoria_id, id) on delete restrict,
  constraint condicionante_versao_confirmado_por_fk foreign key (consultoria_id, prazo_confirmado_por)
    references public.membro (consultoria_id, id) on delete restrict
);

alter table public.condicionante
  add constraint condicionante_versao_vigente_fk foreign key (consultoria_id, versao_vigente_id)
  references public.condicionante_versao (consultoria_id, id) on delete restrict;

-- Versão de instrumento ativo não muda (mudança crítica é DEM-06, com prévia e decisão da Gestão).
create function private.congelar_versao_ativa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.condicionante as c
    join public.instrumento as i on i.consultoria_id = c.consultoria_id and i.id = c.instrumento_id
    where c.consultoria_id = old.consultoria_id and c.id = old.condicionante_id and i.situacao = 'ativo'
  ) then
    raise exception 'versao_congelada' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.congelar_versao_ativa() from public, anon, authenticated;

create trigger condicionante_versao_congelada
  before update or delete on public.condicionante_versao
  for each row execute function private.congelar_versao_ativa();

-- ---------------------------------------------------------------------------
-- ocorrencia: a entrega. Origem única (por enquanto, versão de condicionante); prazo oficial
-- original nunca muda; chave de idempotência impede duplicar na ativação.
-- ---------------------------------------------------------------------------
create table public.ocorrencia (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  instrumento_id uuid not null,
  condicionante_versao_id uuid,
  ciclo integer not null,
  prazo_oficial_original date not null,
  prazo_oficial_atual date not null,
  meta_interna date,
  responsavel_id uuid,
  situacao public.situacao_ocorrencia not null default 'aberta',
  chave_idempotencia text not null,
  criado_em timestamptz not null default now(),
  row_version integer not null default 1,
  constraint ocorrencia_origem_unica check (num_nonnulls(condicionante_versao_id) = 1),
  constraint ocorrencia_ciclo_positivo check (ciclo >= 1),
  constraint ocorrencia_consultoria_id_id_key unique (consultoria_id, id),
  constraint ocorrencia_chave_key unique (consultoria_id, chave_idempotencia),
  constraint ocorrencia_instrumento_fk foreign key (consultoria_id, instrumento_id)
    references public.instrumento (consultoria_id, id) on delete restrict,
  constraint ocorrencia_versao_fk foreign key (consultoria_id, condicionante_versao_id)
    references public.condicionante_versao (consultoria_id, id) on delete restrict,
  constraint ocorrencia_responsavel_fk foreign key (consultoria_id, responsavel_id)
    references public.membro (consultoria_id, id) on delete restrict
);

create index ocorrencia_prazo_idx on public.ocorrencia (consultoria_id, prazo_oficial_atual);
create index ocorrencia_instrumento_idx on public.ocorrencia (consultoria_id, instrumento_id);

comment on column public.ocorrencia.prazo_oficial_original is 'Nunca é sobrescrito (trigger). Atraso é calculado, nunca gravado.';

create function private.preservar_prazo_original()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.prazo_oficial_original is distinct from old.prazo_oficial_original then
    raise exception 'prazo_oficial_original não muda' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.preservar_prazo_original() from public, anon, authenticated;

create trigger ocorrencia_prazo_original_imutavel
  before update on public.ocorrencia
  for each row execute function private.preservar_prazo_original();

-- ---------------------------------------------------------------------------
-- RLS: membro ativo lê; ninguém escreve direto.
-- ---------------------------------------------------------------------------
alter table public.tipo_instrumento enable row level security;
alter table public.tipo_instrumento force row level security;
alter table public.documento enable row level security;
alter table public.documento force row level security;
alter table public.documento_versao enable row level security;
alter table public.documento_versao force row level security;
alter table public.instrumento enable row level security;
alter table public.instrumento force row level security;
alter table public.condicionante enable row level security;
alter table public.condicionante force row level security;
alter table public.condicionante_versao enable row level security;
alter table public.condicionante_versao force row level security;
alter table public.ocorrencia enable row level security;
alter table public.ocorrencia force row level security;

revoke all on table public.tipo_instrumento, public.documento, public.documento_versao, public.instrumento,
  public.condicionante, public.condicionante_versao, public.ocorrencia from anon, authenticated;
grant select on table public.tipo_instrumento, public.documento, public.documento_versao, public.instrumento,
  public.condicionante, public.condicionante_versao, public.ocorrencia to authenticated;

create policy tipo_instrumento_select_membro_ativo on public.tipo_instrumento
  for select to authenticated using ((select private.is_membro(consultoria_id)));
create policy documento_select_membro_ativo on public.documento
  for select to authenticated using ((select private.is_membro(consultoria_id)));
create policy documento_versao_select_membro_ativo on public.documento_versao
  for select to authenticated using ((select private.is_membro(consultoria_id)));
create policy instrumento_select_membro_ativo on public.instrumento
  for select to authenticated using ((select private.is_membro(consultoria_id)));
create policy condicionante_select_membro_ativo on public.condicionante
  for select to authenticated using ((select private.is_membro(consultoria_id)));
create policy condicionante_versao_select_membro_ativo on public.condicionante_versao
  for select to authenticated using ((select private.is_membro(consultoria_id)));
create policy ocorrencia_select_membro_ativo on public.ocorrencia
  for select to authenticated using ((select private.is_membro(consultoria_id)));

-- Auditoria nas entidades críticas (ADR-0010).
create trigger instrumento_auditar after insert or update or delete on public.instrumento
  for each row execute function private.auditar();
create trigger condicionante_auditar after insert or update or delete on public.condicionante
  for each row execute function private.auditar();
create trigger condicionante_versao_auditar after insert or update or delete on public.condicionante_versao
  for each row execute function private.auditar();
create trigger ocorrencia_auditar after insert or update or delete on public.ocorrencia
  for each row execute function private.auditar();

-- ---------------------------------------------------------------------------
-- Datas de um prazo (LIC-03). Espelho de prazoDeCondicionante/datasDoPrazo em packages/domain:
-- única e na renovação dão uma data; contínua, nenhuma; periódica parte da primeira data e soma
-- i × intervalo (meses ou dias corridos) até a validade, inclusive. Em meses, o Postgres usa o
-- último dia quando o dia não existe (31/01 + 1 mês = 28 ou 29/02), sempre a partir da base.
-- Mais de 1.200 entregas é erro de cadastro.
-- ---------------------------------------------------------------------------
create function private.meses_da_recorrencia(recorrencia public.recorrencia_prazo)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case recorrencia
    when 'anual' then 12
    when 'semestral' then 6
    when 'trimestral' then 3
    when 'bimestral' then 2
    when 'mensal' then 1
  end
$$;

create function private.datas_do_prazo(
  p_recorrencia public.recorrencia_prazo,
  p_unidade public.unidade_ciclo,
  p_intervalo integer,
  p_primeira date,
  p_validade date
)
returns table (ciclo integer, prazo date)
language plpgsql
immutable
set search_path = ''
as $$
declare
  unidade public.unidade_ciclo;
  intervalo integer;
  data date;
begin
  if p_recorrencia = 'continua' then
    return;
  end if;
  if p_primeira is null then
    raise exception 'primeira_data_obrigatoria' using errcode = '22023';
  end if;
  if p_recorrencia in ('unica', 'na_renovacao') then
    ciclo := 1;
    prazo := p_primeira;
    return next;
    return;
  end if;

  if p_recorrencia = 'personalizada' then
    unidade := p_unidade;
    intervalo := p_intervalo;
  else
    unidade := 'mes';
    intervalo := private.meses_da_recorrencia(p_recorrencia);
  end if;
  if unidade is null or intervalo is null or intervalo < 1 then
    raise exception 'intervalo_invalido' using errcode = '22023';
  end if;
  if p_validade is null then
    raise exception 'validade_obrigatoria' using errcode = '22023';
  end if;
  if p_primeira > p_validade then
    raise exception 'primeira_data_apos_validade' using errcode = '22023';
  end if;

  for i in 0 .. 1200 loop
    if unidade = 'mes' then
      data := (p_primeira + make_interval(months => i * intervalo))::date;
    else
      data := p_primeira + i * intervalo;
    end if;
    if data > p_validade then
      return;
    end if;
    if i = 1200 then
      raise exception 'ocorrencias_demais' using errcode = '22023';
    end if;
    ciclo := i + 1;
    prazo := data;
    return next;
  end loop;
end;
$$;

revoke all on function private.meses_da_recorrencia(public.recorrencia_prazo) from public, anon, authenticated;
revoke all on function private.datas_do_prazo(public.recorrencia_prazo, public.unidade_ciclo, integer, date, date)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers das RPCs
-- ---------------------------------------------------------------------------
-- Instrumento em rascunho da consultoria em que quem chama é Gestão; trava a linha.
create function private.instrumento_para_editar(p_id uuid)
returns public.instrumento
language plpgsql
set search_path = ''
as $$
declare
  alvo public.instrumento;
begin
  select * into alvo from public.instrumento as i where i.id = p_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.situacao <> 'rascunho' then
    raise exception 'instrumento_ativo' using errcode = 'P0001';
  end if;
  return alvo;
end;
$$;

-- Responsável precisa ser membro ativo da consultoria (nulo = sem responsável).
create function private.conferir_responsavel(cid uuid, membro uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if membro is not null and not exists (
    select 1 from public.membro as m
    where m.consultoria_id = cid and m.id = membro and m.situacao = 'ativo'
  ) then
    raise exception 'responsavel_invalido' using errcode = 'P0001';
  end if;
end;
$$;

-- Toda escrita de rascunho conta como alteração do instrumento (row_version e "salvo às").
create function private.tocar_instrumento(p_id uuid)
returns integer
language sql
set search_path = ''
as $$
  update public.instrumento as i set row_version = i.row_version + 1 where i.id = p_id
  returning i.row_version
$$;

revoke all on function private.instrumento_para_editar(uuid) from public, anon, authenticated;
revoke all on function private.conferir_responsavel(uuid, uuid) from public, anon, authenticated;
revoke all on function private.tocar_instrumento(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: criar rascunho (passo 1). Idempotente pelo id gerado na tela.
-- ---------------------------------------------------------------------------
create function public.criar_instrumento(p_id uuid, p_unidade_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  u public.unidade;
  novo uuid := coalesce(p_id, gen_random_uuid());
  existente uuid;
begin
  select * into u from public.unidade as x where x.id = p_unidade_id;
  if not found or not private.is_gestao(u.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  select i.unidade_id into existente from public.instrumento as i where i.id = novo;
  if found then
    if existente = p_unidade_id then
      return novo;
    end if;
    raise exception 'instrumento_existente' using errcode = 'P0001';
  end if;

  insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, criado_por)
  values (novo, u.consultoria_id, u.empreendimento_id, u.id, private.membro_atual(u.consultoria_id));
  return novo;
end;
$$;

-- RPC: anexar o PDF já enviado ao Storage (passo 1). Cada envio é uma versão nova e imutável.
create function public.registrar_pdf_instrumento(
  p_instrumento_id uuid,
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
  alvo public.instrumento;
  objeto record;
  doc uuid;
  proximo integer;
begin
  alvo := private.instrumento_para_editar(p_instrumento_id);

  -- Repetir o registro (retry) devolve a mesma versão.
  select v.documento_id into doc from public.documento_versao as v where v.id = p_versao_id;
  if found then
    if doc = alvo.documento_id then
      return p_versao_id;
    end if;
    raise exception 'versao_existente' using errcode = 'P0001';
  end if;

  if split_part(p_caminho, '/', 1) <> alvo.consultoria_id::text
     or split_part(p_caminho, '/', 2) <> 'instrumento'
     or p_caminho !~ '^[0-9a-f-]{36}/instrumento/[0-9a-f-]{36}\.pdf$' then
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

  doc := alvo.documento_id;
  if doc is null then
    insert into public.documento (consultoria_id, entidade) values (alvo.consultoria_id, 'instrumento')
    returning id into doc;
  end if;

  select coalesce(max(v.numero), 0) + 1 into proximo from public.documento_versao as v where v.documento_id = doc;

  insert into public.documento_versao (id, consultoria_id, documento_id, numero, caminho, nome_original, mime,
                                       tamanho_bytes, sha256, autor_id)
  values (p_versao_id, alvo.consultoria_id, doc, proximo, p_caminho, btrim(p_nome_original), objeto.mime,
          objeto.tamanho, lower(p_sha256), private.membro_atual(alvo.consultoria_id));

  update public.documento as d set versao_vigente_id = p_versao_id where d.id = doc;
  update public.instrumento as i set documento_id = doc where i.id = alvo.id;
  perform private.tocar_instrumento(alvo.id);
  return p_versao_id;
end;
$$;

-- RPC: tipo próprio da consultoria. Mesma sigla devolve o existente.
create function public.criar_tipo_instrumento(p_consultoria_id uuid, p_sigla text, p_nome text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  encontrado uuid;
begin
  if not private.is_gestao(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if btrim(coalesce(p_sigla, '')) = '' then
    raise exception 'nome_obrigatorio' using errcode = '22023';
  end if;

  insert into public.tipo_instrumento (consultoria_id, sigla, nome)
  values (p_consultoria_id, btrim(p_sigla), coalesce(nullif(btrim(p_nome), ''), btrim(p_sigla)))
  on conflict (consultoria_id, sigla_normalizada) do nothing;

  select t.id into encontrado from public.tipo_instrumento as t
  where t.consultoria_id = p_consultoria_id and t.sigla_normalizada = private.normalizar_nome(p_sigla);
  return encontrado;
end;
$$;

-- RPC: identificação e marcos (passo 2). Controle otimista: devolve a nova row_version.
create function public.salvar_identificacao(
  p_id uuid,
  p_row_version integer,
  p_unidade_id uuid,
  p_tipo_id uuid,
  p_numero text,
  p_orgao text,
  p_emitido_em date,
  p_assinado_em date,
  p_publicado_em date,
  p_recebido_em date,
  p_marco public.marco_instrumento,
  p_validade date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.instrumento;
begin
  alvo := private.instrumento_para_editar(p_id);
  if alvo.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.unidade as u
    where u.consultoria_id = alvo.consultoria_id and u.empreendimento_id = alvo.empreendimento_id
      and u.id = p_unidade_id
  ) then
    raise exception 'unidade_invalida' using errcode = 'P0001';
  end if;
  if p_marco is not null and (case p_marco
      when 'emissao' then p_emitido_em
      when 'assinatura' then p_assinado_em
      when 'publicacao' then p_publicado_em
      when 'recebimento' then p_recebido_em
    end) is null then
    raise exception 'marco_sem_data' using errcode = '22023';
  end if;

  update public.instrumento as i
  set unidade_id = p_unidade_id,
      tipo_id = p_tipo_id,
      numero = nullif(btrim(coalesce(p_numero, '')), ''),
      orgao = nullif(btrim(coalesce(p_orgao, '')), ''),
      emitido_em = p_emitido_em,
      assinado_em = p_assinado_em,
      publicado_em = p_publicado_em,
      recebido_em = p_recebido_em,
      marco = p_marco,
      validade = p_validade,
      row_version = i.row_version + 1
  where i.id = alvo.id;

  return alvo.row_version + 1;
end;
$$;

-- RPC: criar ou editar condicionante (passo 3). No rascunho, a versão 1 muda no lugar.
-- Mudar a natureza para algo que não é obrigação apaga o prazo (só obrigação vira prazo).
create function public.salvar_condicionante(
  p_id uuid,
  p_instrumento_id uuid,
  p_pai_id uuid,
  p_codigo text,
  p_titulo text,
  p_texto_literal text,
  p_natureza public.natureza_condicionante
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.instrumento;
  cond public.condicionante;
  versao uuid;
  posicao_nova integer;
begin
  alvo := private.instrumento_para_editar(p_instrumento_id);
  if btrim(coalesce(p_titulo, '')) = '' then
    raise exception 'titulo_obrigatorio' using errcode = '22023';
  end if;
  if p_natureza is null then
    raise exception 'natureza_obrigatoria' using errcode = '22023';
  end if;
  if p_pai_id is not null and (p_pai_id = p_id or not exists (
    select 1 from public.condicionante as c
    join public.condicionante_versao as v on v.id = c.versao_vigente_id
    where c.id = p_pai_id and c.instrumento_id = alvo.id and v.natureza = 'agrupador'
  )) then
    raise exception 'agrupador_invalido' using errcode = 'P0001';
  end if;

  select * into cond from public.condicionante as c where c.id = p_id for update;
  if found then
    if cond.instrumento_id <> alvo.id then
      raise exception 'sem_permissao' using errcode = '42501';
    end if;
    if p_natureza <> 'agrupador'
       and exists (select 1 from public.condicionante as filho where filho.pai_id = cond.id) then
      raise exception 'agrupador_com_subitens' using errcode = 'P0001';
    end if;
    update public.condicionante as c
    set codigo = btrim(coalesce(p_codigo, '')), pai_id = p_pai_id
    where c.id = cond.id;
    update public.condicionante_versao as v
    set titulo = btrim(p_titulo),
        texto_literal = coalesce(p_texto_literal, ''),
        natureza = p_natureza,
        recorrencia = case when p_natureza = 'obrigacao' then v.recorrencia end,
        unidade_ciclo = case when p_natureza = 'obrigacao' then v.unidade_ciclo end,
        intervalo_ciclo = case when p_natureza = 'obrigacao' then v.intervalo_ciclo end,
        data_referencia = case when p_natureza = 'obrigacao' then v.data_referencia end,
        primeira_data = case when p_natureza = 'obrigacao' then v.primeira_data end,
        fonte_regra = case when p_natureza = 'obrigacao' then v.fonte_regra end,
        prazo_confirmado_por = case when p_natureza = 'obrigacao' then v.prazo_confirmado_por end,
        prazo_confirmado_em = case when p_natureza = 'obrigacao' then v.prazo_confirmado_em end
    where v.id = cond.versao_vigente_id;
  else
    select coalesce(max(c.posicao), 0) + 1 into posicao_nova
    from public.condicionante as c where c.instrumento_id = alvo.id;

    insert into public.condicionante (id, consultoria_id, instrumento_id, pai_id, codigo, posicao)
    values (p_id, alvo.consultoria_id, alvo.id, p_pai_id, btrim(coalesce(p_codigo, '')), posicao_nova);

    insert into public.condicionante_versao (consultoria_id, condicionante_id, titulo, texto_literal, natureza)
    values (alvo.consultoria_id, p_id, btrim(p_titulo), coalesce(p_texto_literal, ''), p_natureza)
    returning id into versao;

    update public.condicionante as c set versao_vigente_id = versao where c.id = p_id;
  end if;

  perform private.tocar_instrumento(alvo.id);
  return p_id;
end;
$$;

-- RPC: descartar ou voltar a aceitar um item (passo 3). Descartado não gera nada e fica no histórico.
create function public.revisar_condicionante(p_id uuid, p_revisao public.revisao_condicionante)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cond public.condicionante;
begin
  select * into cond from public.condicionante as c where c.id = p_id;
  if not found then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  perform private.instrumento_para_editar(cond.instrumento_id);
  if p_revisao is null or p_revisao = 'pendente' then
    raise exception 'revisao_invalida' using errcode = '22023';
  end if;

  update public.condicionante as c set revisao = p_revisao where c.id = p_id;
  perform private.tocar_instrumento(cond.instrumento_id);
end;
$$;

-- RPC: confirmar o prazo de uma obrigação (passo 4, prazo verificável): recorrência, contagem,
-- data de referência, primeira data, fonte/regra e quem confirmou. A série é conferida aqui.
create function public.confirmar_prazo(
  p_condicionante_id uuid,
  p_recorrencia public.recorrencia_prazo,
  p_unidade public.unidade_ciclo,
  p_intervalo integer,
  p_contagem public.contagem_prazo,
  p_data_referencia date,
  p_primeira_data date,
  p_fonte_regra text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cond public.condicionante;
  alvo public.instrumento;
  versao public.condicionante_versao;
  personalizada boolean := p_recorrencia = 'personalizada';
begin
  select * into cond from public.condicionante as c where c.id = p_condicionante_id;
  if not found then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  alvo := private.instrumento_para_editar(cond.instrumento_id);
  select * into versao from public.condicionante_versao as v where v.id = cond.versao_vigente_id;
  if versao.natureza <> 'obrigacao' then
    raise exception 'natureza_sem_prazo' using errcode = 'P0001';
  end if;
  if p_recorrencia is null then
    raise exception 'recorrencia_obrigatoria' using errcode = '22023';
  end if;
  if coalesce(p_contagem, 'corridos') <> 'corridos' then
    raise exception 'contagem_indisponivel' using errcode = 'P0001';
  end if;

  -- Confere a série com a validade atual (erro de cadastro aparece já no passo 4).
  perform 1 from private.datas_do_prazo(
    p_recorrencia,
    case when personalizada then p_unidade end,
    case when personalizada then p_intervalo end,
    p_primeira_data,
    alvo.validade
  );

  update public.condicionante_versao as v
  set recorrencia = p_recorrencia,
      unidade_ciclo = case when personalizada then p_unidade end,
      intervalo_ciclo = case when personalizada then p_intervalo end,
      contagem = 'corridos',
      data_referencia = p_data_referencia,
      primeira_data = case when p_recorrencia = 'continua' then null else p_primeira_data end,
      fonte_regra = nullif(btrim(coalesce(p_fonte_regra, '')), ''),
      prazo_confirmado_por = private.membro_atual(alvo.consultoria_id),
      prazo_confirmado_em = now()
  where v.id = versao.id;

  perform private.tocar_instrumento(alvo.id);
end;
$$;

-- RPC: responsável de um item (exceção) ou de todos (passo 5). Nulo tira o responsável.
create function public.definir_responsavel(p_condicionante_id uuid, p_membro_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cond public.condicionante;
begin
  select * into cond from public.condicionante as c where c.id = p_condicionante_id;
  if not found then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  perform private.instrumento_para_editar(cond.instrumento_id);
  perform private.conferir_responsavel(cond.consultoria_id, p_membro_id);

  update public.condicionante as c set responsavel_id = p_membro_id where c.id = cond.id;
  perform private.tocar_instrumento(cond.instrumento_id);
end;
$$;

create function public.atribuir_a_todos(p_instrumento_id uuid, p_membro_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.instrumento;
begin
  alvo := private.instrumento_para_editar(p_instrumento_id);
  perform private.conferir_responsavel(alvo.consultoria_id, p_membro_id);

  update public.condicionante as c
  set responsavel_id = p_membro_id
  where c.instrumento_id = alvo.id and c.revisao <> 'descartada';
  perform private.tocar_instrumento(alvo.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: ativar o plano (LIC-05). Uma transação: confere o rascunho, gera as ocorrências até a
-- validade e ativa. A chave de ativação torna o retry inofensivo (devolve o mesmo total).
-- ---------------------------------------------------------------------------
create function public.ativar_plano(p_instrumento_id uuid, p_row_version integer, p_chave uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.instrumento;
  ator uuid;
  item record;
  total integer;
begin
  select * into alvo from public.instrumento as i where i.id = p_instrumento_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  if alvo.situacao = 'ativo' then
    if alvo.chave_ativacao = p_chave then
      select count(*) into total from public.ocorrencia as o
      where o.consultoria_id = alvo.consultoria_id and o.instrumento_id = alvo.id;
      return total;
    end if;
    raise exception 'instrumento_ativo' using errcode = 'P0001';
  end if;
  if p_chave is null then
    raise exception 'chave_obrigatoria' using errcode = '22023';
  end if;
  if alvo.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  if alvo.tipo_id is null or alvo.marco is null or alvo.validade is null then
    raise exception 'identificacao_incompleta' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.condicionante as c where c.instrumento_id = alvo.id and c.revisao <> 'descartada'
  ) then
    raise exception 'sem_condicionantes' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.condicionante as c where c.instrumento_id = alvo.id and c.revisao = 'pendente'
  ) then
    raise exception 'condicionante_pendente' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from public.condicionante as c
    join public.condicionante_versao as v on v.id = c.versao_vigente_id
    where c.instrumento_id = alvo.id and c.revisao = 'aceita' and v.natureza = 'obrigacao'
      and v.prazo_confirmado_em is null
  ) then
    raise exception 'prazo_pendente' using errcode = 'P0001';
  end if;

  ator := private.membro_atual(alvo.consultoria_id);

  for item in
    select c.responsavel_id, v.id as versao_id, d.ciclo, d.prazo
    from public.condicionante as c
    join public.condicionante_versao as v on v.id = c.versao_vigente_id
    cross join lateral private.datas_do_prazo(v.recorrencia, v.unidade_ciclo, v.intervalo_ciclo,
                                              v.primeira_data, alvo.validade) as d
    where c.instrumento_id = alvo.id and c.revisao = 'aceita' and v.natureza = 'obrigacao'
  loop
    insert into public.ocorrencia (consultoria_id, instrumento_id, condicionante_versao_id, ciclo,
                                   prazo_oficial_original, prazo_oficial_atual, responsavel_id,
                                   chave_idempotencia)
    values (alvo.consultoria_id, alvo.id, item.versao_id, item.ciclo, item.prazo, item.prazo,
            item.responsavel_id, alvo.id::text || ':' || item.versao_id::text || ':' || item.ciclo::text)
    on conflict (consultoria_id, chave_idempotencia) do nothing;
  end loop;

  update public.instrumento as i
  set situacao = 'ativo', ativado_em = now(), ativado_por = ator, chave_ativacao = p_chave,
      row_version = i.row_version + 1
  where i.id = alvo.id;

  select count(*) into total from public.ocorrencia as o
  where o.consultoria_id = alvo.consultoria_id and o.instrumento_id = alvo.id;
  return total;
end;
$$;

-- ---------------------------------------------------------------------------
-- Carteira (épico 3) passa a trazer as licenças de cada empreendimento, para a situação mais
-- urgente ser calculada no domínio (situacaoDaCarteira).
-- ---------------------------------------------------------------------------
drop function public.listar_empreendimentos(uuid, text, integer, integer);

create function public.listar_empreendimentos(
  p_consultoria_id uuid,
  p_busca text default null,
  p_limite integer default 50,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  nome text,
  cliente_nome text,
  cnpj text,
  unidades bigint,
  criado_em timestamptz,
  licencas jsonb,
  total bigint
)
language sql
stable
set search_path = ''
as $$
  select
    e.id,
    e.nome,
    cl.nome,
    e.cnpj,
    (select count(*) from public.unidade as u
     where u.consultoria_id = e.consultoria_id and u.empreendimento_id = e.id),
    e.criado_em,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'situacao', i.situacao,
        'validade', i.validade,
        'sigla', t.sigla,
        'antecedencia', i.antecedencia_renovacao_dias
      ) order by i.criado_em, i.id)
      from public.instrumento as i
      left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
      where i.consultoria_id = e.consultoria_id and i.empreendimento_id = e.id
    ), '[]'::jsonb),
    count(*) over ()
  from public.empreendimento as e
  left join public.cliente as cl on cl.consultoria_id = e.consultoria_id and cl.id = e.cliente_id
  where e.consultoria_id = p_consultoria_id
    and (
      btrim(coalesce(p_busca, '')) = ''
      or e.nome_normalizado like private.padrao_de_busca(p_busca)
      or cl.nome_normalizado like private.padrao_de_busca(p_busca)
    )
  order by e.nome_normalizado, e.id
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0)
$$;

-- ---------------------------------------------------------------------------
-- Permissões das RPCs: só usuário logado (a Gestão é conferida dentro de cada uma).
-- ---------------------------------------------------------------------------
revoke all on function public.criar_instrumento(uuid, uuid) from public, anon;
revoke all on function public.registrar_pdf_instrumento(uuid, uuid, text, text, text) from public, anon;
revoke all on function public.criar_tipo_instrumento(uuid, text, text) from public, anon;
revoke all on function public.salvar_identificacao(uuid, integer, uuid, uuid, text, text, date, date, date, date,
  public.marco_instrumento, date) from public, anon;
revoke all on function public.salvar_condicionante(uuid, uuid, uuid, text, text, text, public.natureza_condicionante)
  from public, anon;
revoke all on function public.revisar_condicionante(uuid, public.revisao_condicionante) from public, anon;
revoke all on function public.confirmar_prazo(uuid, public.recorrencia_prazo, public.unidade_ciclo, integer,
  public.contagem_prazo, date, date, text) from public, anon;
revoke all on function public.definir_responsavel(uuid, uuid) from public, anon;
revoke all on function public.atribuir_a_todos(uuid, uuid) from public, anon;
revoke all on function public.ativar_plano(uuid, integer, uuid) from public, anon;
revoke all on function public.listar_empreendimentos(uuid, text, integer, integer) from public, anon;

grant execute on function public.criar_instrumento(uuid, uuid) to authenticated;
grant execute on function public.registrar_pdf_instrumento(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.criar_tipo_instrumento(uuid, text, text) to authenticated;
grant execute on function public.salvar_identificacao(uuid, integer, uuid, uuid, text, text, date, date, date, date,
  public.marco_instrumento, date) to authenticated;
grant execute on function public.salvar_condicionante(uuid, uuid, uuid, text, text, text, public.natureza_condicionante)
  to authenticated;
grant execute on function public.revisar_condicionante(uuid, public.revisao_condicionante) to authenticated;
grant execute on function public.confirmar_prazo(uuid, public.recorrencia_prazo, public.unidade_ciclo, integer,
  public.contagem_prazo, date, date, text) to authenticated;
grant execute on function public.definir_responsavel(uuid, uuid) to authenticated;
grant execute on function public.atribuir_a_todos(uuid, uuid) to authenticated;
grant execute on function public.ativar_plano(uuid, integer, uuid) to authenticated;
grant execute on function public.listar_empreendimentos(uuid, text, integer, integer) to authenticated;
