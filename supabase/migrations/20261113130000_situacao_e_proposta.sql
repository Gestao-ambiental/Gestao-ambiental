-- Situação manual, identidade da proposta, ART/RRT e apresentação (ADR-0018, fatia 6; ORC-04, P2, P8, P9).
-- 1. orcamento_situacao: histórico append-only de quem mudou a situação, quando, de qual para qual e
--    em que revisão. mudar_situacao_orcamento é o único caminho. Sair do rascunho exige serviços, horas
--    em todos (P2) e preço sem pendência. Reabrir (voltar a rascunho) cria nova revisão. Só "aprovada"
--    conta na carga (carga_da_equipe já filtra). Nada de contrato, cobrança ou tarefa automáticos.
-- 2. consultoria_identidade: dados da consultoria na proposta (razão social, CNPJ, contato, logo e
--    texto de apresentação padrão). Uma linha por consultoria; só a Gestão lê e edita.
-- 3. orcamento.apresentacao: texto de apresentação desta proposta (vazio = o padrão da identidade).
-- 4. orcamento_item.responsabilidade_tecnica: 'art' ou 'rrt' quando o serviço inclui o registro.

-- ---------------------------------------------------------------------------
-- 1. Situação
-- ---------------------------------------------------------------------------
create table public.orcamento_situacao (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null,
  orcamento_id uuid not null,
  de public.situacao_orcamento not null,
  para public.situacao_orcamento not null,
  revisao integer not null,
  membro_id uuid not null,
  -- clock_timestamp: a ordem vale mesmo com várias mudanças na mesma transação.
  em timestamptz not null default clock_timestamp(),
  observacao text,
  constraint orcamento_situacao_consultoria_id_id_key unique (consultoria_id, id),
  constraint orcamento_situacao_observacao check (observacao is null or length(observacao) <= 500),
  constraint orcamento_situacao_mudou check (de <> para),
  constraint orcamento_situacao_orcamento_fk foreign key (consultoria_id, orcamento_id)
    references public.orcamento (consultoria_id, id) on delete restrict,
  constraint orcamento_situacao_membro_fk foreign key (consultoria_id, membro_id)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.orcamento_situacao is
  'Histórico (append-only) das mudanças manuais de situação do orçamento (ORC-04, P9).';

create index orcamento_situacao_orcamento_idx
  on public.orcamento_situacao (consultoria_id, orcamento_id, em desc);

alter table public.orcamento_situacao enable row level security;
alter table public.orcamento_situacao force row level security;
revoke all on table public.orcamento_situacao from anon, authenticated;
grant select on table public.orcamento_situacao to authenticated;

create policy orcamento_situacao_select_gestao
  on public.orcamento_situacao for select to authenticated
  using ((select private.is_gestao(consultoria_id)));

-- Transições permitidas. Reabrir (qualquer uma → rascunho) é nova revisão.
create function private.transicao_de_situacao_valida(de public.situacao_orcamento, para public.situacao_orcamento)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (de, para) in (
    ('rascunho', 'enviada'), ('rascunho', 'aprovada'),
    ('enviada', 'negociacao'), ('enviada', 'aprovada'), ('enviada', 'recusada'), ('enviada', 'rascunho'),
    ('negociacao', 'aprovada'), ('negociacao', 'recusada'), ('negociacao', 'rascunho'),
    ('aprovada', 'rascunho'),
    ('recusada', 'negociacao'), ('recusada', 'rascunho'))
$$;

revoke all on function private.transicao_de_situacao_valida(public.situacao_orcamento, public.situacao_orcamento)
  from public, anon, authenticated;

create function public.mudar_situacao_orcamento(
  p_id uuid,
  p_row_version integer,
  p_para text,
  p_observacao text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.orcamento%rowtype;
  autor uuid;
  para public.situacao_orcamento;
  observacao_limpa text := nullif(btrim(coalesce(p_observacao, '')), '');
  nova_revisao integer;
begin
  select * into alvo from public.orcamento as o where o.id = p_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  autor := private.membro_atual(alvo.consultoria_id);
  if autor is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.excluido_em is not null then
    raise exception 'orcamento_na_lixeira' using errcode = 'P0001';
  end if;
  if alvo.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  if p_para is null or p_para not in ('rascunho', 'enviada', 'negociacao', 'aprovada', 'recusada') then
    raise exception 'transicao_invalida' using errcode = 'P0001';
  end if;
  para := p_para::public.situacao_orcamento;
  if not private.transicao_de_situacao_valida(alvo.situacao, para) then
    raise exception 'transicao_invalida' using errcode = 'P0001';
  end if;
  if length(coalesce(observacao_limpa, '')) > 500 then
    raise exception 'texto_longo_demais' using errcode = '22023';
  end if;

  -- Sair do rascunho é concluir: precisa de serviços, horas em todos (P2) e preço calculado.
  if alvo.situacao = 'rascunho' then
    if not exists (
      select 1 from public.orcamento_item as i
      where i.consultoria_id = alvo.consultoria_id and i.orcamento_id = alvo.id
    ) then
      raise exception 'sem_itens' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.orcamento_item as i
      where i.consultoria_id = alvo.consultoria_id and i.orcamento_id = alvo.id and i.minutos <= 0
    ) then
      raise exception 'horas_pendentes' using errcode = 'P0001';
    end if;
    if private.preco_pendente(alvo) then
      raise exception 'preco_pendente' using errcode = 'P0001';
    end if;
  end if;

  nova_revisao := case when para = 'rascunho' then alvo.revisao + 1 else alvo.revisao end;

  update public.orcamento as o
  set situacao = para,
      revisao = nova_revisao,
      atualizado_em = now(),
      row_version = o.row_version + 1
  where o.id = alvo.id;

  insert into public.orcamento_situacao (consultoria_id, orcamento_id, de, para, revisao, membro_id, observacao)
  values (alvo.consultoria_id, alvo.id, alvo.situacao, para, nova_revisao, autor, observacao_limpa);

  return alvo.row_version + 1;
end;
$$;

revoke all on function public.mudar_situacao_orcamento(uuid, integer, text, text) from public, anon;
grant execute on function public.mudar_situacao_orcamento(uuid, integer, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Identidade da consultoria na proposta
-- ---------------------------------------------------------------------------
alter table public.documento drop constraint documento_entidade_valida;
alter table public.documento
  add constraint documento_entidade_valida
  check (entidade in ('instrumento', 'evidencia', 'protocolo', 'membro', 'consultoria'));

create table public.consultoria_identidade (
  consultoria_id uuid primary key references public.consultoria (id) on delete restrict,
  -- id: para a auditoria (entidade_id) e para FK composta, se um dia houver.
  id uuid not null default gen_random_uuid(),
  razao_social text,
  cnpj text,
  endereco text,
  telefone text,
  email text,
  site text,
  texto_apresentacao text,
  logo_documento_id uuid,
  atualizado_por uuid not null,
  atualizado_em timestamptz not null default now(),
  row_version integer not null default 1,
  constraint consultoria_identidade_consultoria_id_id_key unique (consultoria_id, id),
  constraint consultoria_identidade_textos check (
    length(coalesce(razao_social, '')) <= 200 and length(coalesce(endereco, '')) <= 300
    and length(coalesce(telefone, '')) <= 40 and length(coalesce(email, '')) <= 200
    and length(coalesce(site, '')) <= 200 and length(coalesce(texto_apresentacao, '')) <= 4000),
  constraint consultoria_identidade_cnpj check (cnpj is null or cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
  constraint consultoria_identidade_logo_fk foreign key (consultoria_id, logo_documento_id)
    references public.documento (consultoria_id, id) on delete restrict,
  constraint consultoria_identidade_autor_fk foreign key (consultoria_id, atualizado_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.consultoria_identidade is
  'Dados da consultoria na proposta (P8): cadastrados uma vez, só a Gestão edita.';

alter table public.consultoria_identidade enable row level security;
alter table public.consultoria_identidade force row level security;
revoke all on table public.consultoria_identidade from anon, authenticated;
grant select on table public.consultoria_identidade to authenticated;

create policy consultoria_identidade_select_gestao
  on public.consultoria_identidade for select to authenticated
  using ((select private.is_gestao(consultoria_id)));

create trigger consultoria_identidade_auditar
  after insert or update or delete on public.consultoria_identidade
  for each row execute function private.auditar();

-- Gestão ativa desta consultoria; devolve o membro.
create function private.gestao_da_consultoria(p_consultoria_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  autor uuid := private.membro_atual(p_consultoria_id);
begin
  if autor is null or not private.is_gestao(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return autor;
end;
$$;

revoke all on function private.gestao_da_consultoria(uuid) from public, anon, authenticated;

-- p_row_version: 0 quando ainda não existe.
create function public.salvar_identidade_da_consultoria(
  p_consultoria_id uuid,
  p_row_version integer,
  p_dados jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  autor uuid := private.gestao_da_consultoria(p_consultoria_id);
  atual public.consultoria_identidade%rowtype;
  email_limpo text := nullif(btrim(coalesce(p_dados ->> 'email', '')), '');
  cnpj_limpo text := private.cnpj_valido(nullif(btrim(coalesce(p_dados ->> 'cnpj', '')), ''));
  razao text := nullif(btrim(coalesce(p_dados ->> 'razao_social', '')), '');
  endereco_limpo text := nullif(btrim(coalesce(p_dados ->> 'endereco', '')), '');
  telefone_limpo text := nullif(btrim(coalesce(p_dados ->> 'telefone', '')), '');
  site_limpo text := nullif(btrim(coalesce(p_dados ->> 'site', '')), '');
  texto_limpo text := nullif(btrim(coalesce(p_dados ->> 'texto_apresentacao', '')), '');
begin
  if jsonb_typeof(coalesce(p_dados, 'null'::jsonb)) <> 'object' then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;
  if email_limpo is not null and email_limpo !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'email_invalido' using errcode = '22023';
  end if;
  if length(coalesce(razao, '')) > 200 or length(coalesce(endereco_limpo, '')) > 300
     or length(coalesce(telefone_limpo, '')) > 40 or length(coalesce(email_limpo, '')) > 200
     or length(coalesce(site_limpo, '')) > 200 or length(coalesce(texto_limpo, '')) > 4000 then
    raise exception 'texto_longo_demais' using errcode = '22023';
  end if;

  select * into atual from public.consultoria_identidade as i where i.consultoria_id = p_consultoria_id for update;
  if found then
    if atual.row_version <> p_row_version then
      raise exception 'conflito_de_versao' using errcode = 'P0001';
    end if;
    update public.consultoria_identidade as i
    set razao_social = razao, cnpj = cnpj_limpo, endereco = endereco_limpo, telefone = telefone_limpo,
        email = email_limpo, site = site_limpo, texto_apresentacao = texto_limpo,
        atualizado_por = autor, atualizado_em = now(), row_version = i.row_version + 1
    where i.consultoria_id = p_consultoria_id;
    return atual.row_version + 1;
  end if;

  if p_row_version <> 0 then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  insert into public.consultoria_identidade (consultoria_id, razao_social, cnpj, endereco, telefone, email, site,
                                             texto_apresentacao, atualizado_por)
  values (p_consultoria_id, razao, cnpj_limpo, endereco_limpo, telefone_limpo, email_limpo, site_limpo,
          texto_limpo, autor);
  return 1;
end;
$$;

revoke all on function public.salvar_identidade_da_consultoria(uuid, integer, jsonb) from public, anon;
grant execute on function public.salvar_identidade_da_consultoria(uuid, integer, jsonb) to authenticated;

-- Leitura com o caminho da logo vigente (a tela pede URL assinada ao Storage). A RLS restringe à Gestão.
create function public.obter_identidade_da_consultoria(p_consultoria_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'razao_social', i.razao_social, 'cnpj', i.cnpj, 'endereco', i.endereco, 'telefone', i.telefone,
    'email', i.email, 'site', i.site, 'texto_apresentacao', i.texto_apresentacao,
    'logo_caminho', (
      select v.caminho from public.documento as d
      join public.documento_versao as v on v.consultoria_id = d.consultoria_id and v.id = d.versao_vigente_id
      where d.consultoria_id = i.consultoria_id and d.id = i.logo_documento_id and d.excluido_em is null),
    'atualizado_em', i.atualizado_em, 'row_version', i.row_version)
  from public.consultoria_identidade as i
  where i.consultoria_id = p_consultoria_id
$$;

revoke all on function public.obter_identidade_da_consultoria(uuid) from public, anon;
grant execute on function public.obter_identidade_da_consultoria(uuid) to authenticated;

-- Registra a imagem já enviada ao Storage como logo (objeto novo + nova versão; nunca sobrescreve).
-- Exige a identidade já salva. Repetir com a mesma versão devolve a mesma.
create function public.registrar_logo_da_consultoria(
  p_consultoria_id uuid,
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
  autor uuid := private.gestao_da_consultoria(p_consultoria_id);
  alvo public.consultoria_identidade%rowtype;
  objeto record;
  doc uuid;
  proximo integer;
begin
  select * into alvo from public.consultoria_identidade as i where i.consultoria_id = p_consultoria_id for update;
  if not found then
    raise exception 'identidade_nao_salva' using errcode = 'P0001';
  end if;

  select v.documento_id into doc from public.documento_versao as v where v.id = p_versao_id;
  if found then
    if doc = alvo.logo_documento_id then
      return p_versao_id;
    end if;
    raise exception 'versao_existente' using errcode = 'P0001';
  end if;

  if p_versao_id is null or p_caminho is null
     or split_part(p_caminho, '/', 1) <> p_consultoria_id::text
     or p_caminho !~ '^[0-9a-f-]{36}/consultoria/[0-9a-f-]{36}\.(png|jpg)$' then
    raise exception 'caminho_invalido' using errcode = '22023';
  end if;
  if coalesce(p_sha256, '') !~* '^[0-9a-f]{64}$' then
    raise exception 'sha256_invalido' using errcode = '22023';
  end if;

  select o.metadata ->> 'mimetype' as mime, (o.metadata ->> 'size')::bigint as tamanho
  into objeto
  from storage.objects as o
  where o.bucket_id = 'arquivos' and o.name = p_caminho;
  if not found then
    raise exception 'arquivo_nao_encontrado' using errcode = 'P0001';
  end if;
  if objeto.mime is null or objeto.mime not in ('image/png', 'image/jpeg') then
    raise exception 'arquivo_tipo_invalido' using errcode = '22023';
  end if;
  if coalesce(objeto.tamanho, 0) <= 0 or objeto.tamanho > 2097152 then
    raise exception 'arquivo_grande_demais' using errcode = '22023';
  end if;

  doc := alvo.logo_documento_id;
  if doc is not null and exists (
    select 1 from public.documento as d where d.id = doc and d.excluido_em is not null
  ) then
    doc := null;
  end if;
  if doc is null then
    insert into public.documento (consultoria_id, entidade) values (p_consultoria_id, 'consultoria')
    returning id into doc;
  end if;

  select coalesce(max(v.numero), 0) + 1 into proximo from public.documento_versao as v where v.documento_id = doc;

  insert into public.documento_versao (id, consultoria_id, documento_id, numero, caminho, nome_original, mime,
                                       tamanho_bytes, sha256, autor_id)
  values (p_versao_id, p_consultoria_id, doc, proximo, p_caminho,
          coalesce(nullif(btrim(p_nome_original), ''), 'logo'), objeto.mime, objeto.tamanho, lower(p_sha256),
          autor);

  update public.documento as d set versao_vigente_id = p_versao_id where d.id = doc;
  update public.consultoria_identidade as i
  set logo_documento_id = doc, atualizado_por = autor, atualizado_em = now(), row_version = i.row_version + 1
  where i.consultoria_id = p_consultoria_id;
  return p_versao_id;
end;
$$;

revoke all on function public.registrar_logo_da_consultoria(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.registrar_logo_da_consultoria(uuid, uuid, text, text, text) to authenticated;

-- Tira a logo: o documento é excluído logicamente. Repetir é inofensivo.
create function public.remover_logo_da_consultoria(p_consultoria_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  autor uuid := private.gestao_da_consultoria(p_consultoria_id);
  alvo public.consultoria_identidade%rowtype;
begin
  select * into alvo from public.consultoria_identidade as i where i.consultoria_id = p_consultoria_id for update;
  if not found or alvo.logo_documento_id is null then
    return;
  end if;
  update public.documento as d set excluido_em = now()
  where d.id = alvo.logo_documento_id and d.excluido_em is null;
  update public.consultoria_identidade as i
  set logo_documento_id = null, atualizado_por = autor, atualizado_em = now(), row_version = i.row_version + 1
  where i.consultoria_id = p_consultoria_id;
end;
$$;

revoke all on function public.remover_logo_da_consultoria(uuid) from public, anon;
grant execute on function public.remover_logo_da_consultoria(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3 e 4. Apresentação da proposta e ART/RRT por serviço
-- ---------------------------------------------------------------------------
alter table public.orcamento add column apresentacao text;
alter table public.orcamento add constraint orcamento_apresentacao_tamanho
  check (apresentacao is null or length(apresentacao) <= 4000);
comment on column public.orcamento.apresentacao is
  'Texto de apresentação desta proposta; nulo = o padrão da identidade da consultoria.';

alter table public.orcamento_item add column responsabilidade_tecnica text;
alter table public.orcamento_item add constraint orcamento_item_responsabilidade_tecnica
  check (responsabilidade_tecnica is null or responsabilidade_tecnica in ('art', 'rrt'));
comment on column public.orcamento_item.responsabilidade_tecnica is
  'O serviço inclui ART (CREA/CRBio) ou RRT (CAU); nulo = não informado na proposta.';

create or replace function public.salvar_orcamento(p_id uuid, p_row_version integer, p_dados jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.orcamento%rowtype;
  objeto_limpo text := btrim(coalesce(p_dados ->> 'objeto', ''));
  validade integer := coalesce((p_dados ->> 'validade_dias')::integer, 30);
  itens jsonb := coalesce(p_dados -> 'itens', '[]'::jsonb);
  despesas jsonb := coalesce(p_dados -> 'despesas', '[]'::jsonb);
  parcelas jsonb := coalesce(p_dados -> 'parcelas', '[]'::jsonb);
  visitas jsonb := coalesce(p_dados -> 'visitas', '{}'::jsonb);
  margem integer := (p_dados ->> 'margem_pb')::integer;
  forma text := coalesce(p_dados ->> 'forma_preco', 'margem');
  qtd_visitas integer := coalesce((visitas ->> 'quantidade')::integer, 0);
  km integer := coalesce((visitas ->> 'km_por_visita')::integer, 0);
  outros bigint := coalesce((visitas ->> 'outros_por_visita_centavos')::bigint, 0);
  premissas_limpas text[] := private.textos_do_json(p_dados -> 'premissas');
  exclusoes_limpas text[] := private.textos_do_json(p_dados -> 'exclusoes');
  apresentacao_limpa text := nullif(btrim(coalesce(p_dados ->> 'apresentacao', '')), '');
begin
  select * into alvo from public.orcamento as o where o.id = p_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.situacao <> 'rascunho' then
    raise exception 'orcamento_nao_editavel' using errcode = 'P0001';
  end if;
  if alvo.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;

  if objeto_limpo = '' then
    raise exception 'objeto_obrigatorio' using errcode = '22023';
  end if;
  if validade not between 1 and 365 then
    raise exception 'validade_invalida' using errcode = '22023';
  end if;
  if coalesce(array_length(premissas_limpas, 1), 0) > 50
     or coalesce(array_length(exclusoes_limpas, 1), 0) > 50 then
    raise exception 'textos_demais' using errcode = '22023';
  end if;
  if length(coalesce(apresentacao_limpa, '')) > 4000 then
    raise exception 'texto_longo_demais' using errcode = '22023';
  end if;
  if margem is not null and margem not between 0 and 10000 then
    raise exception 'percentuais_invalidos' using errcode = '22023';
  end if;
  if forma not in ('margem', 'tabela') then
    raise exception 'forma_de_preco_invalida' using errcode = '22023';
  end if;
  if jsonb_typeof(visitas) <> 'object'
     or qtd_visitas not between 0 and 100 or km not between 0 and 10000
     or outros not between 0 and 99999999999 then
    raise exception 'visitas_invalidas' using errcode = '22023';
  end if;

  if jsonb_typeof(itens) <> 'array' or jsonb_array_length(itens) > 200
     or jsonb_typeof(despesas) <> 'array' or jsonb_array_length(despesas) > 100
     or jsonb_typeof(parcelas) <> 'array' then
    raise exception 'lista_invalida' using errcode = '22023';
  end if;
  if jsonb_array_length(parcelas) > 60 then
    raise exception 'parcelas_demais' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(itens) as e (valor)
    where nullif(e.valor ->> 'id', '') is null
       or btrim(coalesce(e.valor ->> 'descricao', '')) = ''
       or coalesce((e.valor ->> 'minutos')::integer, 0) not between 0 and 600000
       or coalesce((e.valor ->> 'custo_direto_extra_centavos')::bigint, 0) not between 0 and 99999999999
       or length(coalesce(e.valor ->> 'hora_venda_id', '')) > 64
       or coalesce(e.valor ->> 'responsavel_id', '00000000-0000-0000-0000-000000000000') !~ '^[0-9a-fA-F-]{36}$'
       or coalesce(e.valor ->> 'mes_previsto', '2000-01-01') !~ '^\d{4}-\d{2}-01$'
       or coalesce(e.valor ->> 'quantidade', '0') !~ '^[0-9]{1,8}([.][0-9]{1,4})?$'
       or coalesce(e.valor ->> 'preco_fechado_centavos', '0') !~ '^[0-9]{1,11}$'
       or coalesce(nullif(e.valor ->> 'responsabilidade_tecnica', ''), 'art') not in ('art', 'rrt')
  ) then
    raise exception 'item_invalido' using errcode = '22023';
  end if;
  -- Responsável: membro ativo desta consultoria (a FK composta também barra outra consultoria).
  if exists (
    select 1 from jsonb_array_elements(itens) as e (valor)
    where e.valor ->> 'responsavel_id' is not null
      and not exists (
        select 1 from public.membro as m
        where m.consultoria_id = alvo.consultoria_id and m.id = (e.valor ->> 'responsavel_id')::uuid
          and m.situacao = 'ativo')
  ) then
    raise exception 'responsavel_invalido' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(despesas) as e (valor)
    where nullif(e.valor ->> 'id', '') is null
       or btrim(coalesce(e.valor ->> 'descricao', '')) = ''
       or (e.valor ->> 'estimativa_centavos')::bigint not between 0 and 99999999999
       or coalesce(e.valor ->> 'tratamento', '') not in ('incluida', 'cliente_direto', 'reembolsavel')
  ) then
    raise exception 'despesa_invalida' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(parcelas) as e (valor)
    where nullif(e.valor ->> 'id', '') is null
       or btrim(coalesce(e.valor ->> 'descricao', '')) = ''
       or coalesce((e.valor ->> 'percentual_pb')::integer, -1) not between 0 and 10000
       or coalesce((e.valor ->> 'dias')::integer, 0) not between 0 and 365
  ) then
    raise exception 'parcela_invalida' using errcode = '22023';
  end if;

  -- Rascunho acompanha a base de custos atual.
  perform private.aplicar_base_ao_orcamento(p_id);
  select * into alvo from public.orcamento as o where o.id = p_id;

  if forma = 'margem' and alvo.base_registrada_em is not null
     and coalesce(margem, alvo.base_margem_desejada_pb) + alvo.base_tributos_pb + alvo.base_taxas_pb >= 10000 then
    raise exception 'percentuais_invalidos' using errcode = '22023';
  end if;

  -- Itens: sai o que não veio, entra ou muda o que veio. Id de outro orçamento não é aceito.
  -- O preço é recalculado no fim (private.precificar_orcamento).
  delete from public.orcamento_item as t
  where t.orcamento_id = p_id
    and not exists (
      select 1 from jsonb_array_elements(itens) as e (valor) where (e.valor ->> 'id')::uuid = t.id);

  insert into public.orcamento_item as t (
    id, consultoria_id, orcamento_id, ordem, descricao, minutos, preco_automatico, preco_centavos,
    custo_direto_extra_centavos, hora_venda_id, responsavel_id, mes_previsto, quantidade,
    preco_fechado_centavos, responsabilidade_tecnica)
  select (e.valor ->> 'id')::uuid, alvo.consultoria_id, p_id, e.ordem::integer,
         btrim(e.valor ->> 'descricao'),
         coalesce((e.valor ->> 'minutos')::integer, 0),
         true, 0,
         coalesce((e.valor ->> 'custo_direto_extra_centavos')::bigint, 0),
         nullif(btrim(coalesce(e.valor ->> 'hora_venda_id', '')), ''),
         (e.valor ->> 'responsavel_id')::uuid,
         (e.valor ->> 'mes_previsto')::date,
         (e.valor ->> 'quantidade')::numeric(18, 4),
         (e.valor ->> 'preco_fechado_centavos')::bigint,
         nullif(e.valor ->> 'responsabilidade_tecnica', '')
  from jsonb_array_elements(itens) with ordinality as e (valor, ordem)
  on conflict (id) do update
  set ordem = excluded.ordem,
      descricao = excluded.descricao,
      minutos = excluded.minutos,
      custo_direto_extra_centavos = excluded.custo_direto_extra_centavos,
      hora_venda_id = excluded.hora_venda_id,
      responsavel_id = excluded.responsavel_id,
      mes_previsto = excluded.mes_previsto,
      quantidade = excluded.quantidade,
      preco_fechado_centavos = excluded.preco_fechado_centavos,
      responsabilidade_tecnica = excluded.responsabilidade_tecnica
  where t.orcamento_id = excluded.orcamento_id;

  if (select count(*) from public.orcamento_item as t where t.orcamento_id = p_id)
     <> jsonb_array_length(itens) then
    raise exception 'item_invalido' using errcode = '22023';
  end if;

  delete from public.orcamento_despesa as t
  where t.orcamento_id = p_id
    and not exists (
      select 1 from jsonb_array_elements(despesas) as e (valor) where (e.valor ->> 'id')::uuid = t.id);

  insert into public.orcamento_despesa as t (
    id, consultoria_id, orcamento_id, ordem, descricao, estimativa_centavos, tratamento)
  select (e.valor ->> 'id')::uuid, alvo.consultoria_id, p_id, e.ordem::integer,
         btrim(e.valor ->> 'descricao'),
         (e.valor ->> 'estimativa_centavos')::bigint,
         (e.valor ->> 'tratamento')::public.tratamento_despesa
  from jsonb_array_elements(despesas) with ordinality as e (valor, ordem)
  on conflict (id) do update
  set ordem = excluded.ordem,
      descricao = excluded.descricao,
      estimativa_centavos = excluded.estimativa_centavos,
      tratamento = excluded.tratamento
  where t.orcamento_id = excluded.orcamento_id;

  if (select count(*) from public.orcamento_despesa as t where t.orcamento_id = p_id)
     <> jsonb_array_length(despesas) then
    raise exception 'despesa_invalida' using errcode = '22023';
  end if;

  delete from public.orcamento_parcela as t
  where t.orcamento_id = p_id
    and not exists (
      select 1 from jsonb_array_elements(parcelas) as e (valor) where (e.valor ->> 'id')::uuid = t.id);

  insert into public.orcamento_parcela as t (
    id, consultoria_id, orcamento_id, ordem, descricao, dias, percentual_pb)
  select (e.valor ->> 'id')::uuid, alvo.consultoria_id, p_id, e.ordem::integer,
         btrim(e.valor ->> 'descricao'),
         coalesce((e.valor ->> 'dias')::integer, 0),
         (e.valor ->> 'percentual_pb')::integer
  from jsonb_array_elements(parcelas) with ordinality as e (valor, ordem)
  on conflict (id) do update
  set ordem = excluded.ordem,
      descricao = excluded.descricao,
      dias = excluded.dias,
      percentual_pb = excluded.percentual_pb
  where t.orcamento_id = excluded.orcamento_id;

  if (select count(*) from public.orcamento_parcela as t where t.orcamento_id = p_id)
     <> jsonb_array_length(parcelas) then
    raise exception 'parcela_invalida' using errcode = '22023';
  end if;

  update public.orcamento as o
  set objeto = objeto_limpo,
      destinatario = nullif(btrim(coalesce(p_dados ->> 'destinatario', '')), ''),
      prazos = nullif(btrim(coalesce(p_dados ->> 'prazos', '')), ''),
      validade_dias = validade,
      premissas = premissas_limpas,
      exclusoes = exclusoes_limpas,
      apresentacao = apresentacao_limpa,
      margem_pb = margem,
      forma_preco = forma,
      visitas = qtd_visitas,
      km_por_visita = km,
      outros_por_visita_centavos = outros,
      atualizado_em = now(),
      row_version = o.row_version + 1
  where o.id = p_id;

  -- Orçamento de prospecto: os dados do prospecto vêm junto. Depois de cadastrado como
  -- empreendimento, eles ficam como histórico e não mudam mais.
  if alvo.empreendimento_id is null and p_dados ? 'prospecto' then
    perform private.gravar_prospecto(p_id, p_dados -> 'prospecto');
  end if;

  perform private.precificar_orcamento(p_id);

  return alvo.row_version + 1;
end;
$$;

create or replace function public.obter_orcamento(p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id,
    'consultoria_id', o.consultoria_id,
    'ano', o.ano,
    'sequencia', o.sequencia,
    'revisao', o.revisao,
    'situacao', o.situacao,
    'empreendimento_id', o.empreendimento_id,
    'empreendimento_nome', coalesce(e.nome, o.prospecto_nome),
    'prospecto', case when o.prospecto_nome is null then null else jsonb_build_object(
      'nome', o.prospecto_nome,
      'cnpj', o.prospecto_cnpj,
      'contato', o.prospecto_contato,
      'email', o.prospecto_email,
      'telefone', o.prospecto_telefone) end,
    'objeto', o.objeto,
    'destinatario', o.destinatario,
    'prazos', o.prazos,
    'validade_dias', o.validade_dias,
    'premissas', to_jsonb(o.premissas),
    'exclusoes', to_jsonb(o.exclusoes),
    'apresentacao', o.apresentacao,
    -- Quem mudou a situação e quando (fatia 6), da mais recente para a mais antiga.
    'historico_situacao', coalesce((
      select jsonb_agg(jsonb_build_object(
               'de', h.de, 'para', h.para, 'revisao', h.revisao, 'membro_nome', m.nome, 'em', h.em,
               'observacao', h.observacao) order by h.em desc, h.id)
      from public.orcamento_situacao as h
      left join public.membro as m on m.consultoria_id = h.consultoria_id and m.id = h.membro_id
      where h.consultoria_id = o.consultoria_id and h.orcamento_id = o.id), '[]'::jsonb),
    'moeda', o.moeda,
    'margem_pb', o.margem_pb,
    'forma_preco', o.forma_preco,
    'visitas', jsonb_build_object(
      'quantidade', o.visitas,
      'km_por_visita', o.km_por_visita,
      'outros_por_visita_centavos', o.outros_por_visita_centavos),
    'preco_visitas_centavos', o.preco_visitas_centavos,
    'base', case when o.base_registrada_em is null then null else jsonb_build_object(
      'hora_tecnica_centavos', o.base_hora_tecnica_centavos,
      'custo_fixo_hora_centavos', o.base_custo_fixo_hora_centavos,
      'margem_desejada_pb', o.base_margem_desejada_pb,
      'margem_minima_pb', o.base_margem_minima_pb,
      'tributos_pb', o.base_tributos_pb,
      'taxas_pb', o.base_taxas_pb,
      'taxa_por_cobranca_centavos', o.base_taxa_por_cobranca_centavos,
      'taxa_por_assinatura_centavos', o.base_taxa_por_assinatura_centavos,
      'valor_visita_centavos', coalesce(o.base_valor_visita_centavos, 0),
      'custo_km_centavos', coalesce(o.base_custo_km_centavos, 0),
      'custos_fixos_mensais_centavos', coalesce(o.base_custos_fixos_mensais_centavos, 0),
      'custos_fixos_equipe_centavos', coalesce(o.base_custos_fixos_equipe_centavos, 0),
      'custos_fixos_detalhe', coalesce(o.base_custos_fixos_detalhe, '[]'::jsonb),
      'horas_venda', coalesce(o.base_horas_venda, '[]'::jsonb),
      'custo_hora_profissao', coalesce(o.base_custo_hora_profissao, '[]'::jsonb),
      'custo_hora_membro', coalesce(o.base_custo_hora_membro, '[]'::jsonb),
      'registrada_em', o.base_registrada_em) end,
    'atualizado_em', o.atualizado_em,
    'excluido_em', o.excluido_em,
    'row_version', o.row_version,
    -- Cópia de outro orçamento (fatia 5): só o número, para a tela dizer de onde veio.
    'duplicado_de', (
      select jsonb_build_object('id', d.id, 'ano', d.ano, 'sequencia', d.sequencia, 'revisao', d.revisao)
      from public.orcamento as d
      where d.consultoria_id = o.consultoria_id and d.id = o.duplicado_de),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'descricao', i.descricao, 'minutos', i.minutos,
        'preco_automatico', i.preco_automatico, 'preco_centavos', i.preco_centavos,
        'custo_direto_extra_centavos', i.custo_direto_extra_centavos,
        'hora_venda_id', i.hora_venda_id, 'responsavel_id', i.responsavel_id,
        'mes_previsto', i.mes_previsto, 'quantidade', i.quantidade,
        'preco_fechado_centavos', i.preco_fechado_centavos,
        'responsabilidade_tecnica', i.responsabilidade_tecnica) order by i.ordem, i.id)
      from public.orcamento_item as i
      where i.consultoria_id = o.consultoria_id and i.orcamento_id = o.id), '[]'::jsonb),
    'despesas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'descricao', d.descricao, 'estimativa_centavos', d.estimativa_centavos,
        'tratamento', d.tratamento) order by d.ordem, d.id)
      from public.orcamento_despesa as d
      where d.consultoria_id = o.consultoria_id and d.orcamento_id = o.id), '[]'::jsonb),
    'parcelas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'descricao', p.descricao, 'dias', p.dias, 'percentual_pb', p.percentual_pb)
        order by p.ordem, p.id)
      from public.orcamento_parcela as p
      where p.consultoria_id = o.consultoria_id and p.orcamento_id = o.id), '[]'::jsonb)
  )
  from public.orcamento as o
  left join public.empreendimento as e on e.consultoria_id = o.consultoria_id and e.id = o.empreendimento_id
  where o.id = p_id
$$;

create or replace function public.duplicar_orcamento(p_id uuid, p_novo_id uuid, p_copiar_precos boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  origem public.orcamento%rowtype;
  existente public.orcamento%rowtype;
  copiar boolean := coalesce(p_copiar_precos, false);
  prospecto jsonb;
  ids_da_tabela text[];
  versao integer;
begin
  if p_novo_id is null then
    raise exception 'id_obrigatorio' using errcode = '22023';
  end if;
  select * into origem from public.orcamento as o where o.id = p_id;
  if not found or not private.is_gestao(origem.consultoria_id)
     or private.membro_atual(origem.consultoria_id) is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  select * into existente from public.orcamento as o where o.id = p_novo_id;
  if found then
    if existente.consultoria_id = origem.consultoria_id and existente.duplicado_de = p_id then
      return p_novo_id;
    end if;
    raise exception 'orcamento_existente' using errcode = 'P0001';
  end if;

  if origem.excluido_em is not null then
    raise exception 'orcamento_na_lixeira' using errcode = 'P0001';
  end if;

  if origem.empreendimento_id is null then
    prospecto := jsonb_build_object(
      'nome', origem.prospecto_nome, 'cnpj', origem.prospecto_cnpj, 'contato', origem.prospecto_contato,
      'email', origem.prospecto_email, 'telefone', origem.prospecto_telefone);
  end if;

  perform public.criar_orcamento(p_novo_id, origem.consultoria_id, origem.empreendimento_id, origem.objeto,
                                 prospecto);

  -- Linha da tabela de preços que não existe mais fica sem preço (a tela pede para escolher).
  select coalesce(array_agg(h.valor ->> 'id'), '{}'), o.row_version
    into ids_da_tabela, versao
  from public.orcamento as o
  left join lateral jsonb_array_elements(coalesce(o.base_horas_venda, '[]'::jsonb)) as h (valor) on true
  where o.id = p_novo_id
  group by o.row_version;

  perform public.salvar_orcamento(p_novo_id, versao, jsonb_build_object(
    'objeto', origem.objeto,
    'destinatario', origem.destinatario,
    'prazos', origem.prazos,
    'validade_dias', origem.validade_dias,
    'premissas', to_jsonb(origem.premissas),
    'exclusoes', to_jsonb(origem.exclusoes),
    'apresentacao', origem.apresentacao,
    'forma_preco', origem.forma_preco,
    'margem_pb', case when copiar then origem.margem_pb end,
    'visitas', jsonb_build_object(
      'quantidade', origem.visitas,
      'km_por_visita', origem.km_por_visita,
      'outros_por_visita_centavos', case when copiar then origem.outros_por_visita_centavos else 0 end),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', gen_random_uuid(),
               'descricao', i.descricao,
               'minutos', i.minutos,
               'hora_venda_id', case when i.hora_venda_id = any (ids_da_tabela) then i.hora_venda_id end,
               'responsavel_id', case when exists (
                   select 1 from public.membro as m
                   where m.consultoria_id = origem.consultoria_id and m.id = i.responsavel_id
                     and m.situacao = 'ativo') then i.responsavel_id end,
               'quantidade', i.quantidade,
               'custo_direto_extra_centavos', case when copiar then i.custo_direto_extra_centavos else 0 end,
               'preco_fechado_centavos', case when copiar then i.preco_fechado_centavos end,
               'responsabilidade_tecnica', i.responsabilidade_tecnica)
             order by i.ordem, i.id)
      from public.orcamento_item as i
      where i.consultoria_id = origem.consultoria_id and i.orcamento_id = origem.id), '[]'::jsonb),
    'despesas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', gen_random_uuid(),
               'descricao', d.descricao,
               'estimativa_centavos', case when copiar then d.estimativa_centavos end,
               'tratamento', d.tratamento) order by d.ordem, d.id)
      from public.orcamento_despesa as d
      where d.consultoria_id = origem.consultoria_id and d.orcamento_id = origem.id), '[]'::jsonb),
    'parcelas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', gen_random_uuid(),
               'descricao', p.descricao,
               'dias', p.dias,
               'percentual_pb', p.percentual_pb) order by p.ordem, p.id)
      from public.orcamento_parcela as p
      where p.consultoria_id = origem.consultoria_id and p.orcamento_id = origem.id), '[]'::jsonb)));

  update public.orcamento as o set duplicado_de = origem.id where o.id = p_novo_id;
  return p_novo_id;
end;
$$;
