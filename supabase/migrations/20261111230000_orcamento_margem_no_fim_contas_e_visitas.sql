-- Orçamentos, fatia 2 (decisões do Eduardo em 11/11/2026):
-- 1. Margem única, escolhida no fim do orçamento. O preço total é custo ÷ (1 − margem − tributos −
--    taxas) e é repartido entre os itens pelo custo de cada um (maior resto). Os itens não têm mais
--    preço próprio nem margem por item. Regra pura em packages/domain (precificarOrcamento).
-- 2. Contas do mês detalhadas na base (energia, água, internet…): a soma vira o custo fixo mensal.
-- 3. Visita técnica: valor fixo por visita e custo por km na base; no orçamento, quantidade de
--    visitas, km por visita e outros gastos. As visitas viram uma linha própria da proposta.

-- ---------------------------------------------------------------------------
-- Base de custos
-- ---------------------------------------------------------------------------
alter table public.orcamento_base_custos
  add column custos_fixos_detalhe jsonb not null default '[]'::jsonb,
  add column valor_visita_centavos bigint not null default 0,
  add column custo_km_centavos bigint not null default 0,
  add constraint orcamento_base_custos_detalhe check (
    jsonb_typeof(custos_fixos_detalhe) = 'array' and jsonb_array_length(custos_fixos_detalhe) <= 50),
  add constraint orcamento_base_custos_visita check (
    valor_visita_centavos between 0 and 99999999999 and custo_km_centavos between 0 and 99999999999);

comment on column public.orcamento_base_custos.custos_fixos_detalhe is
  'Contas do mês: [{descricao, valor_centavos}]. Com contas, custos_fixos_mensais_centavos é a soma delas.';
comment on column public.orcamento_base_custos.valor_visita_centavos is
  'Custo de uma visita técnica (tempo e logística). Entra no custo do orçamento por visita.';
comment on column public.orcamento_base_custos.custo_km_centavos is
  'Custo por km rodado. Visita longe: km por visita × este valor, além do valor fixo.';

-- ---------------------------------------------------------------------------
-- Orçamento
-- ---------------------------------------------------------------------------
alter table public.orcamento
  add column margem_pb integer,
  add column visitas integer not null default 0,
  add column km_por_visita integer not null default 0,
  add column outros_por_visita_centavos bigint not null default 0,
  add column preco_visitas_centavos bigint not null default 0,
  add column base_valor_visita_centavos bigint,
  add column base_custo_km_centavos bigint,
  add column base_custos_fixos_mensais_centavos bigint,
  add column base_custos_fixos_equipe_centavos bigint,
  add column base_custos_fixos_detalhe jsonb,
  add constraint orcamento_margem check (margem_pb is null or margem_pb between 0 and 10000),
  add constraint orcamento_visitas check (
    visitas between 0 and 100
    and km_por_visita between 0 and 10000
    and outros_por_visita_centavos between 0 and 99999999999
    and preco_visitas_centavos between 0 and 99999999999);

comment on column public.orcamento.margem_pb is
  'Margem sobre o preço de venda escolhida no fim do orçamento. Nula: usa a margem desejada da base.';
comment on column public.orcamento.preco_visitas_centavos is
  'Derivado (private.precificar_orcamento): parte do preço que cabe à linha de visitas técnicas.';

-- Itens deixam de ter preço manual: o preço é sempre a parte do item no preço total.
comment on column public.orcamento_item.preco_automatico is
  'Desde a fatia 2 é sempre verdadeiro: o preço do item é a parte dele no preço total do orçamento.';
comment on column public.orcamento_item.preco_centavos is
  'Derivado (private.precificar_orcamento): preço total repartido pelo custo do item. Zero com preço pendente.';

-- ---------------------------------------------------------------------------
-- Cópia da base para o orçamento (rascunho acompanha a base atual)
-- ---------------------------------------------------------------------------
create or replace function private.aplicar_base_ao_orcamento(p_orcamento_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.orcamento as o
  set base_hora_tecnica_centavos = b.hora_tecnica_centavos,
      base_custo_fixo_hora_centavos = round(
        (b.custos_fixos_mensais_centavos + b.custos_fixos_equipe_centavos) / b.horas_faturaveis_mes)::bigint,
      base_margem_desejada_pb = b.margem_desejada_pb,
      base_margem_minima_pb = b.margem_minima_pb,
      base_tributos_pb = b.tributos_pb,
      base_taxas_pb = b.taxas_pb,
      base_taxa_por_cobranca_centavos = b.taxa_por_cobranca_centavos,
      base_taxa_por_assinatura_centavos = b.taxa_por_assinatura_centavos,
      base_valor_visita_centavos = b.valor_visita_centavos,
      base_custo_km_centavos = b.custo_km_centavos,
      base_custos_fixos_mensais_centavos = b.custos_fixos_mensais_centavos,
      base_custos_fixos_equipe_centavos = b.custos_fixos_equipe_centavos,
      base_custos_fixos_detalhe = b.custos_fixos_detalhe,
      base_registrada_em = now()
  from public.orcamento_base_custos as b
  where o.id = p_orcamento_id
    and b.consultoria_id = o.consultoria_id
    -- Só grava (e audita) quando a base mudou desde a última cópia.
    and (o.base_hora_tecnica_centavos, o.base_custo_fixo_hora_centavos, o.base_margem_desejada_pb,
         o.base_margem_minima_pb, o.base_tributos_pb, o.base_taxas_pb,
         o.base_taxa_por_cobranca_centavos, o.base_taxa_por_assinatura_centavos,
         o.base_valor_visita_centavos, o.base_custo_km_centavos, o.base_custos_fixos_mensais_centavos,
         o.base_custos_fixos_equipe_centavos, o.base_custos_fixos_detalhe)
        is distinct from
        (b.hora_tecnica_centavos,
         round((b.custos_fixos_mensais_centavos + b.custos_fixos_equipe_centavos) / b.horas_faturaveis_mes)::bigint,
         b.margem_desejada_pb, b.margem_minima_pb, b.tributos_pb, b.taxas_pb,
         b.taxa_por_cobranca_centavos, b.taxa_por_assinatura_centavos,
         b.valor_visita_centavos, b.custo_km_centavos, b.custos_fixos_mensais_centavos,
         b.custos_fixos_equipe_centavos, b.custos_fixos_detalhe);
end;
$$;

-- ---------------------------------------------------------------------------
-- Preço do orçamento, igual a precificarOrcamento (packages/domain):
--   custo do item = round(min × hora ÷ 60) + outros custos + round(min × custo fixo por hora ÷ 60)
--   custo das visitas = visitas × (valor da visita + km × custo do km + outros gastos)
--   preço = round((Σ custos + despesas incluídas + taxas fixas) × 10.000 ÷ (10.000 − margem − tributos − taxas))
--   repartição pelo custo de cada linha (itens na ordem, visitas por último), por maior resto;
--   custos todos zero repartem por igual.
-- Pendente (sem base, sem itens, despesa incluída a cotar ou percentuais impossíveis): preços zero.
-- ---------------------------------------------------------------------------
create function private.preco_pendente(o public.orcamento)
returns boolean
language sql
stable
set search_path = ''
as $$
  select o.base_registrada_em is null
      or not exists (
        select 1 from public.orcamento_item as i
        where i.consultoria_id = o.consultoria_id and i.orcamento_id = o.id)
      or exists (
        select 1 from public.orcamento_despesa as d
        where d.consultoria_id = o.consultoria_id and d.orcamento_id = o.id
          and d.tratamento = 'incluida' and d.estimativa_centavos is null)
      or coalesce(o.margem_pb, o.base_margem_desejada_pb, 0) + coalesce(o.base_tributos_pb, 0)
         + coalesce(o.base_taxas_pb, 0) >= 10000
$$;

create function private.precificar_orcamento(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  o public.orcamento%rowtype;
  divisor numeric;
  custo_visitas bigint;
  despesas bigint;
  fixos bigint;
  custo_itens bigint;
  preco bigint;
begin
  select * into o from public.orcamento as x where x.id = p_id;

  if private.preco_pendente(o) then
    update public.orcamento_item as i set preco_centavos = 0, preco_automatico = true
    where i.orcamento_id = p_id and (i.preco_centavos <> 0 or not i.preco_automatico);
    update public.orcamento as x set preco_visitas_centavos = 0
    where x.id = p_id and x.preco_visitas_centavos <> 0;
    return;
  end if;

  divisor := 10000 - coalesce(o.margem_pb, o.base_margem_desejada_pb) - o.base_tributos_pb - o.base_taxas_pb;
  custo_visitas := o.visitas * (o.base_valor_visita_centavos + o.km_por_visita * o.base_custo_km_centavos
                                + o.outros_por_visita_centavos);
  select coalesce(sum(d.estimativa_centavos), 0)::bigint into despesas
  from public.orcamento_despesa as d
  where d.orcamento_id = p_id and d.tratamento = 'incluida';
  select count(*) * o.base_taxa_por_cobranca_centavos + o.base_taxa_por_assinatura_centavos into fixos
  from public.orcamento_parcela as p
  where p.orcamento_id = p_id;
  select coalesce(sum(round(i.minutos::numeric * o.base_hora_tecnica_centavos / 60)
                      + i.custo_direto_extra_centavos
                      + round(i.minutos::numeric * o.base_custo_fixo_hora_centavos / 60)), 0)::bigint
    into custo_itens
  from public.orcamento_item as i
  where i.orcamento_id = p_id;

  preco := round((custo_itens + custo_visitas + despesas + fixos)::numeric * 10000 / divisor)::bigint;
  if preco > 99999999999 then
    raise exception 'preco_invalido' using errcode = '22023';
  end if;

  with linhas as (
    select i.id, i.ordem::bigint as posicao,
           (round(i.minutos::numeric * o.base_hora_tecnica_centavos / 60)
            + i.custo_direto_extra_centavos
            + round(i.minutos::numeric * o.base_custo_fixo_hora_centavos / 60)) as peso
    from public.orcamento_item as i
    where i.orcamento_id = p_id
    union all
    select null::uuid, 9223372036854775807, custo_visitas::numeric
    where custo_visitas > 0
  ),
  ajustadas as (
    select l.id, l.posicao,
           case when (select sum(peso) from linhas) > 0 then l.peso else 1 end as peso
    from linhas as l
  ),
  partes as (
    select a.id, a.posicao,
           floor(preco::numeric * a.peso / s.total) as valor,
           mod(preco::numeric * a.peso, s.total) as resto
    from ajustadas as a cross join (select sum(peso) as total from ajustadas) as s
  ),
  finais as (
    select p.id, p.posicao,
           (p.valor + case when row_number() over (order by p.resto desc, p.posicao)
                                <= preco - (select sum(valor) from partes) then 1 else 0 end)::bigint as valor
    from partes as p
  ),
  itens_atualizados as (
    update public.orcamento_item as i
    set preco_centavos = f.valor, preco_automatico = true
    from finais as f
    where f.id = i.id and i.orcamento_id = p_id
      and (i.preco_centavos <> f.valor or not i.preco_automatico)
    returning i.id
  )
  update public.orcamento as x
  set preco_visitas_centavos = coalesce((select f.valor from finais as f where f.id is null), 0)
  where x.id = p_id
    and x.preco_visitas_centavos <> coalesce((select f.valor from finais as f where f.id is null), 0);
end;
$$;

revoke all on function private.preco_pendente(public.orcamento) from public, anon, authenticated;
revoke all on function private.precificar_orcamento(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: salvar a base de custos (assinatura nova: contas do mês, visita e km)
-- p_custos_fixos: [{ descricao, valor_centavos }]. Com contas, o total mensal é a soma delas e o
-- p_custos_fixos_mensais_centavos enviado é ignorado. Lista vazia mantém o total digitado.
-- ---------------------------------------------------------------------------
drop function public.salvar_base_de_custos(uuid, bigint, bigint, numeric, integer, integer, integer, integer, bigint, bigint, jsonb);

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
  p_taxa_por_assinatura_centavos bigint,
  p_equipe jsonb default '[]'::jsonb,
  p_custos_fixos jsonb default '[]'::jsonb,
  p_valor_visita_centavos bigint default 0,
  p_custo_km_centavos bigint default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  autor uuid := private.membro_atual(p_consultoria_id);
  equipe jsonb := coalesce(p_equipe, '[]'::jsonb);
  contas jsonb := coalesce(p_custos_fixos, '[]'::jsonb);
  detalhe jsonb := '[]'::jsonb;
  fixos bigint := p_custos_fixos_mensais_centavos;
  hora bigint := p_hora_tecnica_centavos;
  horas numeric := p_horas_faturaveis_mes;
  fixos_equipe bigint := 0;
  tecnico bigint;
  centesimos numeric;
begin
  if autor is null or not private.is_gestao(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  if jsonb_typeof(equipe) <> 'array' or jsonb_array_length(equipe) > 100 then
    raise exception 'equipe_invalida' using errcode = '22023';
  end if;

  if jsonb_typeof(contas) <> 'array' or jsonb_array_length(contas) > 50 then
    raise exception 'contas_invalidas' using errcode = '22023';
  end if;
  if jsonb_array_length(contas) > 0 then
    if exists (
      select 1 from jsonb_array_elements(contas) as c (valor)
      where btrim(coalesce(c.valor ->> 'descricao', '')) = ''
         or length(btrim(c.valor ->> 'descricao')) > 120
         or coalesce((c.valor ->> 'valor_centavos')::bigint, -1) not between 0 and 99999999999
    ) then
      raise exception 'contas_invalidas' using errcode = '22023';
    end if;
    select coalesce(sum((c.valor ->> 'valor_centavos')::bigint), 0)::bigint,
           jsonb_agg(jsonb_build_object(
             'descricao', btrim(c.valor ->> 'descricao'),
             'valor_centavos', (c.valor ->> 'valor_centavos')::bigint) order by c.ordem)
      into fixos, detalhe
    from jsonb_array_elements(contas) with ordinality as c (valor, ordem);
  end if;

  if jsonb_array_length(equipe) > 0 then
    if exists (
      select 1 from jsonb_array_elements(equipe) as e (valor)
      where nullif(e.valor ->> 'id', '') is null
         or btrim(coalesce(e.valor ->> 'descricao', '')) = ''
         or coalesce(e.valor ->> 'socio', 'false') not in ('true', 'false')
         or coalesce((e.valor ->> 'custo_mensal_centavos')::bigint, -1) not between 0 and 99999999999
         or coalesce((e.valor ->> 'horas_disponiveis_mes')::integer, -1) not between 0 and 744
         or coalesce((e.valor ->> 'aproveitamento_pb')::integer, -1) not between 0 and 10000
         or coalesce((e.valor ->> 'parte_tecnica_pb')::integer, -1) not between 0 and 10000
    ) then
      raise exception 'equipe_invalida' using errcode = '22023';
    end if;

    select coalesce(sum(round((e.valor ->> 'custo_mensal_centavos')::bigint
                               * (e.valor ->> 'parte_tecnica_pb')::integer / 10000.0)), 0)::bigint,
           coalesce(sum((e.valor ->> 'custo_mensal_centavos')::bigint
                        - round((e.valor ->> 'custo_mensal_centavos')::bigint
                                * (e.valor ->> 'parte_tecnica_pb')::integer / 10000.0)), 0)::bigint,
           round(coalesce(sum((e.valor ->> 'horas_disponiveis_mes')::bigint
                              * (e.valor ->> 'aproveitamento_pb')::integer), 0) / 100.0)
      into tecnico, fixos_equipe, centesimos
    from jsonb_array_elements(equipe) as e (valor);

    if centesimos <= 0 then
      raise exception 'equipe_sem_horas_faturaveis' using errcode = '22023';
    end if;
    horas := centesimos / 100;
    hora := round(tecnico * 100 / centesimos)::bigint;
  end if;

  if hora is null or hora not between 0 and 99999999999
     or fixos is null or fixos not between 0 and 99999999999
     or fixos_equipe not between 0 and 99999999999
     or p_taxa_por_cobranca_centavos is null or p_taxa_por_cobranca_centavos not between 0 and 99999999999
     or p_taxa_por_assinatura_centavos is null or p_taxa_por_assinatura_centavos not between 0 and 99999999999
     or p_valor_visita_centavos is null or p_valor_visita_centavos not between 0 and 99999999999
     or p_custo_km_centavos is null or p_custo_km_centavos not between 0 and 99999999999
     or horas is null or horas <= 0 or horas > 99999 then
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
    consultoria_id, hora_tecnica_centavos, custos_fixos_mensais_centavos, custos_fixos_equipe_centavos,
    horas_faturaveis_mes, margem_desejada_pb, margem_minima_pb, tributos_pb, taxas_pb,
    taxa_por_cobranca_centavos, taxa_por_assinatura_centavos, custos_fixos_detalhe,
    valor_visita_centavos, custo_km_centavos, atualizado_por)
  values (
    p_consultoria_id, hora, fixos, fixos_equipe,
    horas, p_margem_desejada_pb, p_margem_minima_pb, p_tributos_pb, p_taxas_pb,
    p_taxa_por_cobranca_centavos, p_taxa_por_assinatura_centavos, detalhe,
    p_valor_visita_centavos, p_custo_km_centavos, autor)
  on conflict (consultoria_id) do update
  set hora_tecnica_centavos = excluded.hora_tecnica_centavos,
      custos_fixos_mensais_centavos = excluded.custos_fixos_mensais_centavos,
      custos_fixos_equipe_centavos = excluded.custos_fixos_equipe_centavos,
      horas_faturaveis_mes = excluded.horas_faturaveis_mes,
      margem_desejada_pb = excluded.margem_desejada_pb,
      margem_minima_pb = excluded.margem_minima_pb,
      tributos_pb = excluded.tributos_pb,
      taxas_pb = excluded.taxas_pb,
      taxa_por_cobranca_centavos = excluded.taxa_por_cobranca_centavos,
      taxa_por_assinatura_centavos = excluded.taxa_por_assinatura_centavos,
      custos_fixos_detalhe = excluded.custos_fixos_detalhe,
      valor_visita_centavos = excluded.valor_visita_centavos,
      custo_km_centavos = excluded.custo_km_centavos,
      atualizado_por = excluded.atualizado_por,
      atualizado_em = now(),
      row_version = b.row_version + 1;

  -- Composição: sai o que não veio, entra ou muda o que veio. Id de outra consultoria não é aceito.
  delete from public.orcamento_base_equipe as t
  where t.consultoria_id = p_consultoria_id
    and not exists (
      select 1 from jsonb_array_elements(equipe) as e (valor) where (e.valor ->> 'id')::uuid = t.id);

  insert into public.orcamento_base_equipe as t (
    id, consultoria_id, ordem, descricao, socio, custo_mensal_centavos, horas_disponiveis_mes,
    aproveitamento_pb, parte_tecnica_pb)
  select (e.valor ->> 'id')::uuid, p_consultoria_id, e.ordem::integer, btrim(e.valor ->> 'descricao'),
         coalesce((e.valor ->> 'socio')::boolean, false),
         (e.valor ->> 'custo_mensal_centavos')::bigint,
         (e.valor ->> 'horas_disponiveis_mes')::integer,
         (e.valor ->> 'aproveitamento_pb')::integer,
         (e.valor ->> 'parte_tecnica_pb')::integer
  from jsonb_array_elements(equipe) with ordinality as e (valor, ordem)
  on conflict (id) do update
  set ordem = excluded.ordem,
      descricao = excluded.descricao,
      socio = excluded.socio,
      custo_mensal_centavos = excluded.custo_mensal_centavos,
      horas_disponiveis_mes = excluded.horas_disponiveis_mes,
      aproveitamento_pb = excluded.aproveitamento_pb,
      parte_tecnica_pb = excluded.parte_tecnica_pb
  where t.consultoria_id = excluded.consultoria_id;

  if (select count(*) from public.orcamento_base_equipe as t where t.consultoria_id = p_consultoria_id)
     <> jsonb_array_length(equipe) then
    raise exception 'equipe_invalida' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.salvar_base_de_custos(uuid, bigint, bigint, numeric, integer, integer, integer, integer, bigint, bigint, jsonb, jsonb, bigint, bigint) from public, anon;
grant execute on function public.salvar_base_de_custos(uuid, bigint, bigint, numeric, integer, integer, integer, integer, bigint, bigint, jsonb, jsonb, bigint, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: salvar o rascunho inteiro. Novidades: p_dados.margem_pb (nulo = margem desejada da base) e
-- p_dados.visitas { quantidade, km_por_visita, outros_por_visita_centavos }. preco_automatico e
-- preco_centavos dos itens são ignorados: o preço sai de private.precificar_orcamento.
-- ---------------------------------------------------------------------------
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
  qtd_visitas integer := coalesce((visitas ->> 'quantidade')::integer, 0);
  km integer := coalesce((visitas ->> 'km_por_visita')::integer, 0);
  outros bigint := coalesce((visitas ->> 'outros_por_visita_centavos')::bigint, 0);
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
  if margem is not null and margem not between 0 and 10000 then
    raise exception 'percentuais_invalidos' using errcode = '22023';
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
  ) then
    raise exception 'item_invalido' using errcode = '22023';
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

  if alvo.base_registrada_em is not null
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
    custo_direto_extra_centavos)
  select (e.valor ->> 'id')::uuid, alvo.consultoria_id, p_id, e.ordem::integer,
         btrim(e.valor ->> 'descricao'),
         coalesce((e.valor ->> 'minutos')::integer, 0),
         true, 0,
         coalesce((e.valor ->> 'custo_direto_extra_centavos')::bigint, 0)
  from jsonb_array_elements(itens) with ordinality as e (valor, ordem)
  on conflict (id) do update
  set ordem = excluded.ordem,
      descricao = excluded.descricao,
      minutos = excluded.minutos,
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
      margem_pb = margem,
      visitas = qtd_visitas,
      km_por_visita = km,
      outros_por_visita_centavos = outros,
      atualizado_em = now(),
      row_version = o.row_version + 1
  where o.id = p_id;

  perform private.precificar_orcamento(p_id);

  return alvo.row_version + 1;
end;
$$;

drop function private.preco_automatico_do_item(integer, bigint, bigint, bigint, integer);

-- ---------------------------------------------------------------------------
-- Leitura
-- ---------------------------------------------------------------------------
-- Total da lista: nulo enquanto o preço estiver pendente (nunca um zero enganoso).
create or replace function public.listar_orcamentos(
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
    case when private.preco_pendente(o) then null
         else coalesce((select sum(i.preco_centavos) from public.orcamento_item as i
                        where i.consultoria_id = o.consultoria_id and i.orcamento_id = o.id), 0)
              + o.preco_visitas_centavos end::bigint,
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

-- A função preco_pendente é chamada pela lista com a RLS de quem lê: liberar a execução.
grant execute on function private.preco_pendente(public.orcamento) to authenticated;

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
    'empreendimento_nome', e.nome,
    'objeto', o.objeto,
    'destinatario', o.destinatario,
    'prazos', o.prazos,
    'validade_dias', o.validade_dias,
    'premissas', to_jsonb(o.premissas),
    'exclusoes', to_jsonb(o.exclusoes),
    'moeda', o.moeda,
    'margem_pb', o.margem_pb,
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
      'registrada_em', o.base_registrada_em) end,
    'atualizado_em', o.atualizado_em,
    'row_version', o.row_version,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'descricao', i.descricao, 'minutos', i.minutos,
        'preco_automatico', i.preco_automatico, 'preco_centavos', i.preco_centavos,
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
        'id', p.id, 'descricao', p.descricao, 'dias', p.dias, 'percentual_pb', p.percentual_pb)
        order by p.ordem, p.id)
      from public.orcamento_parcela as p
      where p.consultoria_id = o.consultoria_id and p.orcamento_id = o.id), '[]'::jsonb)
  )
  from public.orcamento as o
  join public.empreendimento as e on e.consultoria_id = o.consultoria_id and e.id = o.empreendimento_id
  where o.id = p_id
$$;

create or replace function public.obter_base_de_custos(p_consultoria_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'hora_tecnica_centavos', b.hora_tecnica_centavos,
    'custos_fixos_mensais_centavos', b.custos_fixos_mensais_centavos,
    'custos_fixos_equipe_centavos', b.custos_fixos_equipe_centavos,
    'custos_fixos_detalhe', b.custos_fixos_detalhe,
    'horas_faturaveis_mes', b.horas_faturaveis_mes,
    'margem_desejada_pb', b.margem_desejada_pb,
    'margem_minima_pb', b.margem_minima_pb,
    'tributos_pb', b.tributos_pb,
    'taxas_pb', b.taxas_pb,
    'taxa_por_cobranca_centavos', b.taxa_por_cobranca_centavos,
    'taxa_por_assinatura_centavos', b.taxa_por_assinatura_centavos,
    'valor_visita_centavos', b.valor_visita_centavos,
    'custo_km_centavos', b.custo_km_centavos,
    'atualizado_em', b.atualizado_em,
    'equipe', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'descricao', e.descricao, 'socio', e.socio,
        'custo_mensal_centavos', e.custo_mensal_centavos,
        'horas_disponiveis_mes', e.horas_disponiveis_mes,
        'aproveitamento_pb', e.aproveitamento_pb,
        'parte_tecnica_pb', e.parte_tecnica_pb) order by e.ordem, e.id)
      from public.orcamento_base_equipe as e
      where e.consultoria_id = b.consultoria_id), '[]'::jsonb))
  from public.orcamento_base_custos as b
  where b.consultoria_id = p_consultoria_id
$$;
