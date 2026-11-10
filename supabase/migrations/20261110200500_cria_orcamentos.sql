-- Orçamentos, fatia 1 (onda 5; ORC-02, ORC-03, ORC-04): rascunho com itens, despesas de
-- terceiros, parcelas e a base de custos da consultoria.
-- Dinheiro em centavos inteiros com moeda; percentuais em pontos-base (1% = 100).
-- Custo e margem são dados restritos (RNF §dados restritos): nesta fatia o módulo inteiro é só
-- da Gestão, na leitura e na escrita. Abrir para a Equipe depende da permissão do financeiro
-- (FIN-05), que ainda não existe. Escrita só por RPC.
-- Fora desta fatia: envio, revisão, aceite, contrato, cobrança, quantidade/unidade, desconto,
-- opcionais e modelos.

create type public.situacao_orcamento as enum ('rascunho', 'enviada', 'negociacao', 'aprovada', 'recusada');
create type public.tratamento_despesa as enum ('incluida', 'cliente_direto', 'reembolsavel');

comment on type public.tratamento_despesa is
  'Despesa de terceiros: incluída no preço, paga direto pelo cliente ou reembolsável com comprovante.';

-- ---------------------------------------------------------------------------
-- orcamento_base_custos: uma linha por consultoria. O histórico fica na auditoria e cada
-- orçamento guarda a base que usou.
-- ---------------------------------------------------------------------------
create table public.orcamento_base_custos (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  hora_tecnica_centavos bigint not null,
  custos_fixos_mensais_centavos bigint not null,
  horas_faturaveis_mes numeric(7, 2) not null,
  margem_desejada_pb integer not null,
  margem_minima_pb integer not null,
  tributos_pb integer not null,
  taxas_pb integer not null default 0,
  taxa_por_cobranca_centavos bigint not null default 0,
  taxa_por_assinatura_centavos bigint not null default 0,
  moeda text not null default 'BRL',
  atualizado_por uuid not null,
  atualizado_em timestamptz not null default now(),
  row_version integer not null default 1,
  constraint orcamento_base_custos_consultoria_key unique (consultoria_id),
  constraint orcamento_base_custos_consultoria_id_id_key unique (consultoria_id, id),
  constraint orcamento_base_custos_valores check (
    hora_tecnica_centavos between 0 and 99999999999
    and custos_fixos_mensais_centavos between 0 and 99999999999
    and taxa_por_cobranca_centavos between 0 and 99999999999
    and taxa_por_assinatura_centavos between 0 and 99999999999
    and horas_faturaveis_mes > 0
  ),
  constraint orcamento_base_custos_percentuais check (
    margem_desejada_pb between 0 and 10000
    and margem_minima_pb between 0 and 10000
    and tributos_pb between 0 and 10000
    and taxas_pb between 0 and 10000
    and margem_desejada_pb + tributos_pb + taxas_pb < 10000
  ),
  constraint orcamento_base_custos_moeda check (moeda ~ '^[A-Z]{3}$'),
  constraint orcamento_base_custos_atualizado_por_fk foreign key (consultoria_id, atualizado_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.orcamento_base_custos is
  'Base de custos, margens, tributos e taxas da consultoria para o preço sugerido. Só a Gestão lê.';
comment on column public.orcamento_base_custos.margem_desejada_pb is
  'Margem sobre o preço de venda, em pontos-base. Não é acréscimo sobre o custo.';
comment on column public.orcamento_base_custos.margem_minima_pb is
  'Vale para a margem total do orçamento. Item abaixo dela é só aviso (decisão de 10/11/2026).';
comment on column public.orcamento_base_custos.tributos_pb is
  'Alíquota efetiva sobre o faturamento, informada pela contabilidade. O sistema não calcula.';

-- ---------------------------------------------------------------------------
-- orcamento: cabeçalho. Numeração ORC-AAAA-NNN por consultoria e ano (ORC-04).
-- As colunas base_* e *_pb guardam a base de custos usada; nulas = rateio pendente.
-- ---------------------------------------------------------------------------
create table public.orcamento (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  ano integer not null,
  sequencia integer not null,
  revisao integer not null default 1,
  situacao public.situacao_orcamento not null default 'rascunho',
  empreendimento_id uuid not null,
  objeto text not null,
  destinatario text,
  prazos text,
  validade_dias integer not null default 30,
  premissas text[] not null default '{}',
  exclusoes text[] not null default '{}',
  moeda text not null default 'BRL',
  base_hora_tecnica_centavos bigint,
  base_custo_fixo_hora_centavos bigint,
  base_margem_desejada_pb integer,
  base_margem_minima_pb integer,
  base_tributos_pb integer,
  base_taxas_pb integer,
  base_taxa_por_cobranca_centavos bigint,
  base_taxa_por_assinatura_centavos bigint,
  base_registrada_em timestamptz,
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  row_version integer not null default 1,
  constraint orcamento_consultoria_id_id_key unique (consultoria_id, id),
  constraint orcamento_numero_key unique (consultoria_id, ano, sequencia),
  constraint orcamento_objeto_preenchido check (length(btrim(objeto)) > 0),
  constraint orcamento_numeracao check (ano between 2000 and 9999 and sequencia > 0 and revisao > 0),
  constraint orcamento_validade check (validade_dias between 1 and 365),
  constraint orcamento_moeda check (moeda ~ '^[A-Z]{3}$'),
  constraint orcamento_empreendimento_fk foreign key (consultoria_id, empreendimento_id)
    references public.empreendimento (consultoria_id, id) on delete restrict,
  constraint orcamento_criado_por_fk foreign key (consultoria_id, criado_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on column public.orcamento.row_version is 'Controle otimista: cada escrita confere e incrementa (RNF 11).';
comment on column public.orcamento.base_registrada_em is
  'Quando a base de custos foi copiada para este orçamento. Rascunho acompanha a base atual.';

create index orcamento_consultoria_atualizado_idx on public.orcamento (consultoria_id, atualizado_em desc);
create index orcamento_empreendimento_idx on public.orcamento (consultoria_id, empreendimento_id);

-- ---------------------------------------------------------------------------
-- orcamento_item: serviço com horas estimadas, preço e custo direto além das horas.
-- ---------------------------------------------------------------------------
create table public.orcamento_item (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  orcamento_id uuid not null,
  ordem integer not null,
  descricao text not null,
  horas numeric(7, 2) not null default 0,
  preco_centavos bigint not null default 0,
  custo_direto_extra_centavos bigint not null default 0,
  constraint orcamento_item_consultoria_id_id_key unique (consultoria_id, id),
  constraint orcamento_item_descricao_preenchida check (length(btrim(descricao)) > 0),
  constraint orcamento_item_valores check (
    horas between 0 and 10000
    and preco_centavos between 0 and 99999999999
    and custo_direto_extra_centavos between 0 and 99999999999
  ),
  constraint orcamento_item_orcamento_fk foreign key (consultoria_id, orcamento_id)
    references public.orcamento (consultoria_id, id) on delete restrict
);

comment on column public.orcamento_item.custo_direto_extra_centavos is
  'Custo direto além das horas (deslocamento, ART). Interno: não vai para a proposta.';

create index orcamento_item_orcamento_idx on public.orcamento_item (consultoria_id, orcamento_id, ordem);

-- ---------------------------------------------------------------------------
-- orcamento_despesa: despesa de terceiros. Honorário ≠ taxa do órgão (ORC-02).
-- ---------------------------------------------------------------------------
create table public.orcamento_despesa (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  orcamento_id uuid not null,
  ordem integer not null,
  descricao text not null,
  estimativa_centavos bigint not null default 0,
  tratamento public.tratamento_despesa not null,
  constraint orcamento_despesa_consultoria_id_id_key unique (consultoria_id, id),
  constraint orcamento_despesa_descricao_preenchida check (length(btrim(descricao)) > 0),
  constraint orcamento_despesa_valor check (estimativa_centavos between 0 and 99999999999),
  constraint orcamento_despesa_orcamento_fk foreign key (consultoria_id, orcamento_id)
    references public.orcamento (consultoria_id, id) on delete restrict
);

create index orcamento_despesa_orcamento_idx on public.orcamento_despesa (consultoria_id, orcamento_id, ordem);

-- ---------------------------------------------------------------------------
-- orcamento_parcela: cronograma em percentuais. Os valores em centavos são derivados do total
-- por maior resto (packages/domain, ORC-03), nunca gravados.
-- ---------------------------------------------------------------------------
create table public.orcamento_parcela (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  orcamento_id uuid not null,
  ordem integer not null,
  descricao text not null,
  percentual_pb integer not null,
  constraint orcamento_parcela_consultoria_id_id_key unique (consultoria_id, id),
  constraint orcamento_parcela_descricao_preenchida check (length(btrim(descricao)) > 0),
  constraint orcamento_parcela_percentual check (percentual_pb between 0 and 10000),
  constraint orcamento_parcela_orcamento_fk foreign key (consultoria_id, orcamento_id)
    references public.orcamento (consultoria_id, id) on delete restrict
);

comment on column public.orcamento_parcela.descricao is
  'Quando a parcela vence, em texto (ex.: "3 dias após a assinatura do contrato").';

create index orcamento_parcela_orcamento_idx on public.orcamento_parcela (consultoria_id, orcamento_id, ordem);

-- ---------------------------------------------------------------------------
-- RLS: só a Gestão lê; ninguém escreve direto (só pelas RPCs abaixo).
-- ---------------------------------------------------------------------------
alter table public.orcamento_base_custos enable row level security;
alter table public.orcamento_base_custos force row level security;
alter table public.orcamento enable row level security;
alter table public.orcamento force row level security;
alter table public.orcamento_item enable row level security;
alter table public.orcamento_item force row level security;
alter table public.orcamento_despesa enable row level security;
alter table public.orcamento_despesa force row level security;
alter table public.orcamento_parcela enable row level security;
alter table public.orcamento_parcela force row level security;

revoke all on table public.orcamento_base_custos from anon, authenticated;
revoke all on table public.orcamento from anon, authenticated;
revoke all on table public.orcamento_item from anon, authenticated;
revoke all on table public.orcamento_despesa from anon, authenticated;
revoke all on table public.orcamento_parcela from anon, authenticated;
grant select on table public.orcamento_base_custos to authenticated;
grant select on table public.orcamento to authenticated;
grant select on table public.orcamento_item to authenticated;
grant select on table public.orcamento_despesa to authenticated;
grant select on table public.orcamento_parcela to authenticated;

create policy orcamento_base_custos_select_gestao
  on public.orcamento_base_custos for select to authenticated
  using ((select private.is_gestao(consultoria_id)));

create policy orcamento_select_gestao
  on public.orcamento for select to authenticated
  using ((select private.is_gestao(consultoria_id)));

create policy orcamento_item_select_gestao
  on public.orcamento_item for select to authenticated
  using ((select private.is_gestao(consultoria_id)));

create policy orcamento_despesa_select_gestao
  on public.orcamento_despesa for select to authenticated
  using ((select private.is_gestao(consultoria_id)));

create policy orcamento_parcela_select_gestao
  on public.orcamento_parcela for select to authenticated
  using ((select private.is_gestao(consultoria_id)));

-- Auditoria (entidades de decisão comercial).
create trigger orcamento_base_custos_auditar
  after insert or update or delete on public.orcamento_base_custos
  for each row execute function private.auditar();
create trigger orcamento_auditar
  after insert or update or delete on public.orcamento
  for each row execute function private.auditar();
create trigger orcamento_item_auditar
  after insert or update or delete on public.orcamento_item
  for each row execute function private.auditar();
create trigger orcamento_despesa_auditar
  after insert or update or delete on public.orcamento_despesa
  for each row execute function private.auditar();
create trigger orcamento_parcela_auditar
  after insert or update or delete on public.orcamento_parcela
  for each row execute function private.auditar();

-- ---------------------------------------------------------------------------
-- Helpers de escrita
-- ---------------------------------------------------------------------------
-- Copia a base de custos atual para o orçamento. Sem base configurada, as colunas ficam nulas:
-- rateio pendente nunca vira zero.
create function private.aplicar_base_ao_orcamento(p_orcamento_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.orcamento as o
  set base_hora_tecnica_centavos = b.hora_tecnica_centavos,
      base_custo_fixo_hora_centavos = round(b.custos_fixos_mensais_centavos / b.horas_faturaveis_mes)::bigint,
      base_margem_desejada_pb = b.margem_desejada_pb,
      base_margem_minima_pb = b.margem_minima_pb,
      base_tributos_pb = b.tributos_pb,
      base_taxas_pb = b.taxas_pb,
      base_taxa_por_cobranca_centavos = b.taxa_por_cobranca_centavos,
      base_taxa_por_assinatura_centavos = b.taxa_por_assinatura_centavos,
      base_registrada_em = now()
  from public.orcamento_base_custos as b
  where o.id = p_orcamento_id
    and b.consultoria_id = o.consultoria_id
    -- Só grava (e audita) quando a base mudou desde a última cópia.
    and (o.base_hora_tecnica_centavos, o.base_custo_fixo_hora_centavos, o.base_margem_desejada_pb,
         o.base_margem_minima_pb, o.base_tributos_pb, o.base_taxas_pb,
         o.base_taxa_por_cobranca_centavos, o.base_taxa_por_assinatura_centavos)
        is distinct from
        (b.hora_tecnica_centavos, round(b.custos_fixos_mensais_centavos / b.horas_faturaveis_mes)::bigint,
         b.margem_desejada_pb, b.margem_minima_pb, b.tributos_pb, b.taxas_pb,
         b.taxa_por_cobranca_centavos, b.taxa_por_assinatura_centavos);
end;
$$;

-- Lista de textos curtos (premissas, exclusões) vinda do JSON: aparados, sem vazios.
create function private.textos_do_json(lista jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(btrim(t.valor) order by t.ordem) filter (where btrim(t.valor) <> ''), '{}')
  from jsonb_array_elements_text(
    case when jsonb_typeof(lista) = 'array' then lista else '[]'::jsonb end
  ) with ordinality as t (valor, ordem)
$$;

revoke all on function private.aplicar_base_ao_orcamento(uuid) from public, anon, authenticated;
revoke all on function private.textos_do_json(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: salvar a base de custos da consultoria (Gestão). Cria ou substitui a linha única.
-- ---------------------------------------------------------------------------
create function public.salvar_base_de_custos(
  p_consultoria_id uuid,
  p_hora_tecnica_centavos bigint,
  p_custos_fixos_mensais_centavos bigint,
  p_horas_faturaveis_mes numeric,
  p_margem_desejada_pb integer,
  p_margem_minima_pb integer,
  p_tributos_pb integer,
  p_taxas_pb integer,
  p_taxa_por_cobranca_centavos bigint,
  p_taxa_por_assinatura_centavos bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  autor uuid := private.membro_atual(p_consultoria_id);
begin
  if autor is null or not private.is_gestao(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  if p_hora_tecnica_centavos is null or p_hora_tecnica_centavos not between 0 and 99999999999
     or p_custos_fixos_mensais_centavos is null or p_custos_fixos_mensais_centavos not between 0 and 99999999999
     or p_taxa_por_cobranca_centavos is null or p_taxa_por_cobranca_centavos not between 0 and 99999999999
     or p_taxa_por_assinatura_centavos is null or p_taxa_por_assinatura_centavos not between 0 and 99999999999
     or p_horas_faturaveis_mes is null or p_horas_faturaveis_mes <= 0 or p_horas_faturaveis_mes > 99999 then
    raise exception 'base_invalida' using errcode = '22023';
  end if;

  if p_margem_desejada_pb is null or p_margem_desejada_pb not between 0 and 10000
     or p_margem_minima_pb is null or p_margem_minima_pb not between 0 and 10000
     or p_tributos_pb is null or p_tributos_pb not between 0 and 10000
     or p_taxas_pb is null or p_taxas_pb not between 0 and 10000
     or p_margem_desejada_pb + p_tributos_pb + p_taxas_pb >= 10000 then
    raise exception 'percentuais_invalidos' using errcode = '22023';
  end if;

  insert into public.orcamento_base_custos as b (
    consultoria_id, hora_tecnica_centavos, custos_fixos_mensais_centavos, horas_faturaveis_mes,
    margem_desejada_pb, margem_minima_pb, tributos_pb, taxas_pb,
    taxa_por_cobranca_centavos, taxa_por_assinatura_centavos, atualizado_por)
  values (
    p_consultoria_id, p_hora_tecnica_centavos, p_custos_fixos_mensais_centavos, p_horas_faturaveis_mes,
    p_margem_desejada_pb, p_margem_minima_pb, p_tributos_pb, p_taxas_pb,
    p_taxa_por_cobranca_centavos, p_taxa_por_assinatura_centavos, autor)
  on conflict (consultoria_id) do update
  set hora_tecnica_centavos = excluded.hora_tecnica_centavos,
      custos_fixos_mensais_centavos = excluded.custos_fixos_mensais_centavos,
      horas_faturaveis_mes = excluded.horas_faturaveis_mes,
      margem_desejada_pb = excluded.margem_desejada_pb,
      margem_minima_pb = excluded.margem_minima_pb,
      tributos_pb = excluded.tributos_pb,
      taxas_pb = excluded.taxas_pb,
      taxa_por_cobranca_centavos = excluded.taxa_por_cobranca_centavos,
      taxa_por_assinatura_centavos = excluded.taxa_por_assinatura_centavos,
      atualizado_por = excluded.atualizado_por,
      atualizado_em = now(),
      row_version = b.row_version + 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: criar o rascunho, já numerado. Idempotente pelo id gerado na tela.
-- ---------------------------------------------------------------------------
create function public.criar_orcamento(
  p_id uuid,
  p_consultoria_id uuid,
  p_empreendimento_id uuid,
  p_objeto text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  autor uuid := private.membro_atual(p_consultoria_id);
  novo uuid := coalesce(p_id, gen_random_uuid());
  objeto_limpo text := btrim(coalesce(p_objeto, ''));
  existente uuid;
  ano_atual integer;
  proxima integer;
begin
  if autor is null or not private.is_gestao(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  select o.consultoria_id into existente from public.orcamento as o where o.id = novo;
  if found then
    if existente = p_consultoria_id then
      return novo;
    end if;
    raise exception 'orcamento_existente' using errcode = 'P0001';
  end if;

  if objeto_limpo = '' then
    raise exception 'objeto_obrigatorio' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.empreendimento as e
    where e.consultoria_id = p_consultoria_id and e.id = p_empreendimento_id
  ) then
    raise exception 'empreendimento_invalido' using errcode = '22023';
  end if;

  -- O ano é o do fuso da consultoria, nunca o do aparelho nem o do servidor.
  select extract(year from (now() at time zone c.fuso))::integer into ano_atual
  from public.consultoria as c where c.id = p_consultoria_id;

  -- Uma numeração por vez por consultoria e ano.
  perform pg_advisory_xact_lock(
    hashtextextended('orcamento:' || p_consultoria_id::text || ':' || ano_atual::text, 0));

  select coalesce(max(o.sequencia), 0) + 1 into proxima
  from public.orcamento as o
  where o.consultoria_id = p_consultoria_id and o.ano = ano_atual;

  insert into public.orcamento (id, consultoria_id, ano, sequencia, empreendimento_id, objeto, criado_por)
  values (novo, p_consultoria_id, ano_atual, proxima, p_empreendimento_id, objeto_limpo, autor);

  perform private.aplicar_base_ao_orcamento(novo);

  return novo;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: salvar o rascunho inteiro (cabeçalho, itens, despesas e parcelas) numa transação.
-- Só rascunho é editável (ORC-04). Controle otimista: devolve a nova row_version.
-- p_dados: { objeto, destinatario, prazos, validade_dias, premissas[], exclusoes[],
--   itens[{ id, descricao, horas, preco_centavos, custo_direto_extra_centavos }],
--   despesas[{ id, descricao, estimativa_centavos, tratamento }],
--   parcelas[{ id, descricao, percentual_pb }] }. A ordem das listas é a ordem gravada.
-- ---------------------------------------------------------------------------
create function public.salvar_orcamento(p_id uuid, p_row_version integer, p_dados jsonb)
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
  premissas_limpas text[] := private.textos_do_json(p_dados -> 'premissas');
  exclusoes_limpas text[] := private.textos_do_json(p_dados -> 'exclusoes');
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
       or coalesce((e.valor ->> 'horas')::numeric, 0) not between 0 and 10000
       or coalesce((e.valor ->> 'preco_centavos')::bigint, 0) not between 0 and 99999999999
       or coalesce((e.valor ->> 'custo_direto_extra_centavos')::bigint, 0) not between 0 and 99999999999
  ) then
    raise exception 'item_invalido' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(despesas) as e (valor)
    where nullif(e.valor ->> 'id', '') is null
       or btrim(coalesce(e.valor ->> 'descricao', '')) = ''
       or coalesce((e.valor ->> 'estimativa_centavos')::bigint, 0) not between 0 and 99999999999
       or coalesce(e.valor ->> 'tratamento', '') not in ('incluida', 'cliente_direto', 'reembolsavel')
  ) then
    raise exception 'despesa_invalida' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(parcelas) as e (valor)
    where nullif(e.valor ->> 'id', '') is null
       or btrim(coalesce(e.valor ->> 'descricao', '')) = ''
       or coalesce((e.valor ->> 'percentual_pb')::integer, -1) not between 0 and 10000
  ) then
    raise exception 'parcela_invalida' using errcode = '22023';
  end if;

  -- Itens: sai o que não veio, entra ou muda o que veio. Id de outro orçamento não é aceito.
  delete from public.orcamento_item as t
  where t.orcamento_id = p_id
    and not exists (
      select 1 from jsonb_array_elements(itens) as e (valor) where (e.valor ->> 'id')::uuid = t.id);

  insert into public.orcamento_item as t (
    id, consultoria_id, orcamento_id, ordem, descricao, horas, preco_centavos, custo_direto_extra_centavos)
  select (e.valor ->> 'id')::uuid, alvo.consultoria_id, p_id, e.ordem::integer,
         btrim(e.valor ->> 'descricao'),
         coalesce((e.valor ->> 'horas')::numeric, 0),
         coalesce((e.valor ->> 'preco_centavos')::bigint, 0),
         coalesce((e.valor ->> 'custo_direto_extra_centavos')::bigint, 0)
  from jsonb_array_elements(itens) with ordinality as e (valor, ordem)
  on conflict (id) do update
  set ordem = excluded.ordem,
      descricao = excluded.descricao,
      horas = excluded.horas,
      preco_centavos = excluded.preco_centavos,
      custo_direto_extra_centavos = excluded.custo_direto_extra_centavos
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
         coalesce((e.valor ->> 'estimativa_centavos')::bigint, 0),
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
    id, consultoria_id, orcamento_id, ordem, descricao, percentual_pb)
  select (e.valor ->> 'id')::uuid, alvo.consultoria_id, p_id, e.ordem::integer,
         btrim(e.valor ->> 'descricao'),
         (e.valor ->> 'percentual_pb')::integer
  from jsonb_array_elements(parcelas) with ordinality as e (valor, ordem)
  on conflict (id) do update
  set ordem = excluded.ordem,
      descricao = excluded.descricao,
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
      atualizado_em = now(),
      row_version = o.row_version + 1
  where o.id = p_id;

  -- Rascunho acompanha a base de custos atual.
  perform private.aplicar_base_ao_orcamento(p_id);

  return alvo.row_version + 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leitura (security invoker: a RLS de quem chama decide o que aparece)
-- ---------------------------------------------------------------------------
-- Lista paginada, com busca por empreendimento ou objeto, total do orçamento e total de linhas.
create function public.listar_orcamentos(
  p_consultoria_id uuid,
  p_busca text default null,
  p_limite integer default 50,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  ano integer,
  sequencia integer,
  revisao integer,
  situacao public.situacao_orcamento,
  empreendimento_id uuid,
  empreendimento_nome text,
  objeto text,
  total_centavos bigint,
  atualizado_em timestamptz,
  total bigint
)
language sql
stable
set search_path = ''
as $$
  select
    o.id,
    o.ano,
    o.sequencia,
    o.revisao,
    o.situacao,
    o.empreendimento_id,
    e.nome,
    o.objeto,
    coalesce((select sum(i.preco_centavos) from public.orcamento_item as i
              where i.consultoria_id = o.consultoria_id and i.orcamento_id = o.id), 0)::bigint,
    o.atualizado_em,
    count(*) over ()
  from public.orcamento as o
  join public.empreendimento as e on e.consultoria_id = o.consultoria_id and e.id = o.empreendimento_id
  where o.consultoria_id = p_consultoria_id
    and (
      btrim(coalesce(p_busca, '')) = ''
      or e.nome_normalizado like private.padrao_de_busca(p_busca)
      or private.normalizar_nome(o.objeto) like private.padrao_de_busca(p_busca)
    )
  order by o.atualizado_em desc, o.id
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0)
$$;

-- Orçamento inteiro para a tela de edição. Nulo quando não existe ou a RLS esconde.
create function public.obter_orcamento(p_id uuid)
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
    'empreendimento_nome', e.nome,
    'objeto', o.objeto,
    'destinatario', o.destinatario,
    'prazos', o.prazos,
    'validade_dias', o.validade_dias,
    'premissas', to_jsonb(o.premissas),
    'exclusoes', to_jsonb(o.exclusoes),
    'moeda', o.moeda,
    'base', case when o.base_registrada_em is null then null else jsonb_build_object(
      'hora_tecnica_centavos', o.base_hora_tecnica_centavos,
      'custo_fixo_hora_centavos', o.base_custo_fixo_hora_centavos,
      'margem_desejada_pb', o.base_margem_desejada_pb,
      'margem_minima_pb', o.base_margem_minima_pb,
      'tributos_pb', o.base_tributos_pb,
      'taxas_pb', o.base_taxas_pb,
      'taxa_por_cobranca_centavos', o.base_taxa_por_cobranca_centavos,
      'taxa_por_assinatura_centavos', o.base_taxa_por_assinatura_centavos,
      'registrada_em', o.base_registrada_em) end,
    'atualizado_em', o.atualizado_em,
    'row_version', o.row_version,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'descricao', i.descricao, 'horas', i.horas,
        'preco_centavos', i.preco_centavos,
        'custo_direto_extra_centavos', i.custo_direto_extra_centavos) order by i.ordem, i.id)
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
        'id', p.id, 'descricao', p.descricao, 'percentual_pb', p.percentual_pb) order by p.ordem, p.id)
      from public.orcamento_parcela as p
      where p.consultoria_id = o.consultoria_id and p.orcamento_id = o.id), '[]'::jsonb)
  )
  from public.orcamento as o
  join public.empreendimento as e on e.consultoria_id = o.consultoria_id and e.id = o.empreendimento_id
  where o.id = p_id
$$;

-- Base de custos da consultoria para a tela de configuração. Nulo se não configurada ou se a RLS
-- esconde (Equipe).
create function public.obter_base_de_custos(p_consultoria_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'hora_tecnica_centavos', b.hora_tecnica_centavos,
    'custos_fixos_mensais_centavos', b.custos_fixos_mensais_centavos,
    'horas_faturaveis_mes', b.horas_faturaveis_mes,
    'margem_desejada_pb', b.margem_desejada_pb,
    'margem_minima_pb', b.margem_minima_pb,
    'tributos_pb', b.tributos_pb,
    'taxas_pb', b.taxas_pb,
    'taxa_por_cobranca_centavos', b.taxa_por_cobranca_centavos,
    'taxa_por_assinatura_centavos', b.taxa_por_assinatura_centavos,
    'atualizado_em', b.atualizado_em)
  from public.orcamento_base_custos as b
  where b.consultoria_id = p_consultoria_id
$$;

-- ---------------------------------------------------------------------------
-- Permissões das RPCs: só usuário logado.
-- ---------------------------------------------------------------------------
revoke all on function public.salvar_base_de_custos(uuid, bigint, bigint, numeric, integer, integer, integer, integer, bigint, bigint) from public, anon;
revoke all on function public.criar_orcamento(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.salvar_orcamento(uuid, integer, jsonb) from public, anon;
revoke all on function public.listar_orcamentos(uuid, text, integer, integer) from public, anon;
revoke all on function public.obter_orcamento(uuid) from public, anon;
revoke all on function public.obter_base_de_custos(uuid) from public, anon;

grant execute on function public.salvar_base_de_custos(uuid, bigint, bigint, numeric, integer, integer, integer, integer, bigint, bigint) to authenticated;
grant execute on function public.criar_orcamento(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.salvar_orcamento(uuid, integer, jsonb) to authenticated;
grant execute on function public.listar_orcamentos(uuid, text, integer, integer) to authenticated;
grant execute on function public.obter_orcamento(uuid) to authenticated;
grant execute on function public.obter_base_de_custos(uuid) to authenticated;
