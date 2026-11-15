-- Preço pela tabela de hora de venda, custo por profissão e remuneração pelo piso (decisões do
-- Eduardo, 12/11/2026, a partir da tabela ACEAMB corrigida pelo IPCA).
-- 1. Tabela de hora de venda na base: uma linha por profissão e atividade ou nível (Eng.
--    ambiental · Júnior; Eng. ambiental · Perícia ambiental; Biólogo · Sênior…), com fonte. O
--    orçamento escolhe a forma de preço: 'tabela' (item = horas × hora de venda + outros custos;
--    a margem vira resultado) ou 'margem' (custo ÷ (1 − margem − tributos − taxas)). Com horas de
--    venda cadastradas, o orçamento novo nasce pela tabela.
-- 2. Custo por profissão: cada pessoa da equipe tem profissão; a base guarda a hora técnica de cada
--    profissão (derivada). O custo do item usa a da profissão da hora de venda escolhida; sem
--    ninguém daquela profissão, a média da equipe.
-- 3. Piso por hora na base; quem está "pelo piso" recebe horas no mês × piso por hora. O divisor
--    legal do piso não é inventado aqui: o piso por hora é informado pela consultoria.
-- 4. Equipe ligada aos membros (12/11/2026): cada linha é um membro com login, com custo do mês e
--    horas no mês. Saem o aproveitamento e a parte técnica em %: a hora de custo da pessoa é custo ÷
--    horas, e quanto dessas horas vira serviço é decidido no orçamento.
-- 5. Responsável e mês de cada serviço: o custo do item usa a hora de custo do responsável (sem
--    responsável, a da profissão; sem ninguém dela, a média). carga_da_equipe soma as horas de cada
--    membro por mês em orçamentos aprovados, para a tela mostrar a carga contra a jornada. Depois da
--    aprovação, o responsável vira o da etapa da demanda de serviço (ADR-0016).
-- Regra pura em packages/domain (precificarOrcamento, custoHoraPorProfissao).

alter table public.orcamento_base_custos
  add column horas_venda jsonb not null default '[]'::jsonb,
  add column custo_hora_profissao jsonb not null default '[]'::jsonb,
  add column piso_hora_centavos bigint not null default 0,
  add constraint orcamento_base_custos_horas_venda check (
    jsonb_typeof(horas_venda) = 'array' and jsonb_array_length(horas_venda) <= 100),
  add constraint orcamento_base_custos_custo_profissao check (jsonb_typeof(custo_hora_profissao) = 'array'),
  add constraint orcamento_base_custos_piso check (piso_hora_centavos between 0 and 99999999999),
  add column custo_hora_membro jsonb not null default '[]'::jsonb,
  add constraint orcamento_base_custos_custo_membro check (jsonb_typeof(custo_hora_membro) = 'array');

comment on column public.orcamento_base_custos.horas_venda is
  'Tabela de hora de venda: [{id, profissao, atividade, valor_centavos, fonte}]. Usada nos orçamentos pela tabela.';
comment on column public.orcamento_base_custos.custo_hora_profissao is
  'Derivado ao salvar: [{profissao, hora_tecnica_centavos}] = parte técnica de quem é da profissão ÷ horas faturáveis dessas pessoas.';
comment on column public.orcamento_base_custos.custo_hora_membro is
  'Derivado ao salvar: [{membro_id, hora_centavos}] = custo do mês ÷ horas no mês de cada membro da equipe.';
comment on column public.orcamento_base_custos.piso_hora_centavos is
  'Piso por hora informado pela consultoria (ex.: piso de engenheiro). Quem está "pelo piso" recebe horas × este valor.';

alter table public.orcamento_base_equipe
  add column pelo_piso boolean not null default false,
  add column profissao text,
  add column membro_id uuid,
  add constraint orcamento_base_equipe_profissao check (profissao is null or length(btrim(profissao)) between 1 and 80),
  add constraint orcamento_base_equipe_membro_fk foreign key (consultoria_id, membro_id)
    references public.membro (consultoria_id, id) on delete restrict,
  add constraint orcamento_base_equipe_membro_unico unique (consultoria_id, membro_id);

-- A hora de custo é custo do mês ÷ horas no mês; o que vira serviço é decidido no orçamento.
alter table public.orcamento_base_equipe
  drop constraint orcamento_base_equipe_valores,
  drop column aproveitamento_pb,
  drop column parte_tecnica_pb,
  add constraint orcamento_base_equipe_valores check (
    custo_mensal_centavos between 0 and 99999999999 and horas_disponiveis_mes between 0 and 744);

comment on column public.orcamento_base_equipe.membro_id is
  'Membro da consultoria (com login). salvar_base_de_custos exige; linhas antigas sem membro saem ao salvar.';
comment on column public.orcamento_base_equipe.horas_disponiveis_mes is
  'Horas de trabalho no mês (jornada). Hora de custo = custo_mensal_centavos ÷ estas horas.';

comment on column public.orcamento_base_equipe.pelo_piso is
  'Verdadeiro: custo_mensal_centavos = horas_disponiveis_mes × piso por hora, calculado ao salvar a base.';
comment on column public.orcamento_base_equipe.profissao is
  'Profissão (Eng. ambiental, Biólogo…): agrupa o custo da hora técnica por profissão.';

alter table public.orcamento
  add column forma_preco text not null default 'margem',
  add column base_horas_venda jsonb,
  add column base_custo_hora_profissao jsonb,
  add column base_custo_hora_membro jsonb,
  add constraint orcamento_forma_preco check (forma_preco in ('margem', 'tabela'));

comment on column public.orcamento.forma_preco is
  'tabela: horas × hora de venda, margem como resultado. margem: custo ÷ (1 − margem − tributos − taxas).';

alter table public.orcamento_item
  add column hora_venda_id text,
  add constraint orcamento_item_hora_venda check (hora_venda_id is null or length(btrim(hora_venda_id)) between 1 and 64);

comment on column public.orcamento_item.hora_venda_id is
  'Linha da tabela de hora de venda (id na base copiada): define o preço pela tabela e a profissão do custo.';

alter table public.orcamento_item
  add column responsavel_id uuid,
  add column mes_previsto date,
  add constraint orcamento_item_responsavel_fk foreign key (consultoria_id, responsavel_id)
    references public.membro (consultoria_id, id) on delete restrict,
  add constraint orcamento_item_mes_previsto check (mes_previsto is null or extract(day from mes_previsto) = 1);

comment on column public.orcamento_item.responsavel_id is
  'Membro responsável pelo serviço: o custo usa a hora dele, e depois da aprovação ele recebe a etapa.';
comment on column public.orcamento_item.mes_previsto is
  'Mês previsto de execução (primeiro dia do mês). Data civil: base da carga da equipe.';

create index orcamento_item_carga_idx on public.orcamento_item (consultoria_id, responsavel_id, mes_previsto)
  where responsavel_id is not null and mes_previsto is not null;

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
      base_horas_venda = b.horas_venda,
      base_custo_hora_profissao = b.custo_hora_profissao,
      base_custo_hora_membro = b.custo_hora_membro,
      base_registrada_em = now()
  from public.orcamento_base_custos as b
  where o.id = p_orcamento_id
    and b.consultoria_id = o.consultoria_id
    -- Só grava (e audita) quando a base mudou desde a última cópia.
    and (o.base_hora_tecnica_centavos, o.base_custo_fixo_hora_centavos, o.base_margem_desejada_pb,
         o.base_margem_minima_pb, o.base_tributos_pb, o.base_taxas_pb,
         o.base_taxa_por_cobranca_centavos, o.base_taxa_por_assinatura_centavos,
         o.base_valor_visita_centavos, o.base_custo_km_centavos, o.base_custos_fixos_mensais_centavos,
         o.base_custos_fixos_equipe_centavos, o.base_custos_fixos_detalhe, o.base_horas_venda,
         o.base_custo_hora_profissao, o.base_custo_hora_membro)
        is distinct from
        (b.hora_tecnica_centavos,
         round((b.custos_fixos_mensais_centavos + b.custos_fixos_equipe_centavos) / b.horas_faturaveis_mes)::bigint,
         b.margem_desejada_pb, b.margem_minima_pb, b.tributos_pb, b.taxas_pb,
         b.taxa_por_cobranca_centavos, b.taxa_por_assinatura_centavos,
         b.valor_visita_centavos, b.custo_km_centavos, b.custos_fixos_mensais_centavos,
         b.custos_fixos_equipe_centavos, b.custos_fixos_detalhe, b.horas_venda, b.custo_hora_profissao,
         b.custo_hora_membro);
end;
$$;

create or replace function private.preco_pendente(o public.orcamento)
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
      or (o.forma_preco = 'margem'
          and coalesce(o.margem_pb, o.base_margem_desejada_pb, 0) + coalesce(o.base_tributos_pb, 0)
              + coalesce(o.base_taxas_pb, 0) >= 10000)
      -- Pela tabela, todo item precisa de uma hora de venda que exista na base copiada.
      or (o.forma_preco = 'tabela' and exists (
        select 1 from public.orcamento_item as i
        where i.consultoria_id = o.consultoria_id and i.orcamento_id = o.id
          and not exists (
            select 1 from jsonb_array_elements(coalesce(o.base_horas_venda, '[]'::jsonb)) as h (valor)
            where h.valor ->> 'id' = i.hora_venda_id)))
$$;

-- Itens com o custo e o preço pela hora de cada um. O custo usa a hora de custo do responsável; sem
-- responsável (ou fora da equipe), a da profissão da hora de venda escolhida; sem ninguém dessa
-- profissão, a média da equipe. Igual a precificarOrcamento (packages/domain).
create function private.itens_do_preco(o public.orcamento)
returns table (id uuid, posicao bigint, custo numeric, pela_hora numeric)
language sql
stable
set search_path = ''
as $$
  select i.id,
         i.ordem::bigint,
         round(i.minutos::numeric * coalesce(cm.hora, cp.hora, o.base_hora_tecnica_centavos) / 60)
           + i.custo_direto_extra_centavos
           + round(i.minutos::numeric * o.base_custo_fixo_hora_centavos / 60),
         case when hv.valor is null then null
              else round(i.minutos::numeric * hv.valor / 60) + i.custo_direto_extra_centavos end
  from public.orcamento_item as i
  left join lateral (
    select (h.valor ->> 'valor_centavos')::bigint as valor, lower(btrim(h.valor ->> 'profissao')) as profissao
    from jsonb_array_elements(coalesce(o.base_horas_venda, '[]'::jsonb)) as h (valor)
    where h.valor ->> 'id' = i.hora_venda_id
    limit 1
  ) as hv on true
  left join lateral (
    select (c.valor ->> 'hora_tecnica_centavos')::bigint as hora
    from jsonb_array_elements(coalesce(o.base_custo_hora_profissao, '[]'::jsonb)) as c (valor)
    where lower(btrim(c.valor ->> 'profissao')) = hv.profissao
    limit 1
  ) as cp on true
  left join lateral (
    select (m.valor ->> 'hora_centavos')::bigint as hora
    from jsonb_array_elements(coalesce(o.base_custo_hora_membro, '[]'::jsonb)) as m (valor)
    where m.valor ->> 'membro_id' = i.responsavel_id::text
    limit 1
  ) as cm on true
  where i.consultoria_id = o.consultoria_id and i.orcamento_id = o.id
$$;

revoke all on function private.itens_do_preco(public.orcamento) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Preço do orçamento:
--   pela tabela: item = horas × hora de venda + outros custos; despesas incluídas repartidas
--     pelos itens na proporção desse preço (maior resto);
--   pela margem: serviços = (Σ custos + despesas incluídas + taxas fixas) ÷ (1 − margem −
--     tributos − taxas), repartido pelo custo de cada item (maior resto);
--   visitas: preço fixo, sem margem, nas duas formas.
-- Pendente: preços zero.
-- ---------------------------------------------------------------------------
create or replace function private.precificar_orcamento(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  o public.orcamento%rowtype;
  valor_visitas bigint;
  despesas bigint;
  fixos bigint;
  preco bigint;
  total numeric;
begin
  select * into o from public.orcamento as x where x.id = p_id;

  if private.preco_pendente(o) then
    update public.orcamento_item as i set preco_centavos = 0, preco_automatico = true
    where i.orcamento_id = p_id and (i.preco_centavos <> 0 or not i.preco_automatico);
    update public.orcamento as x set preco_visitas_centavos = 0
    where x.id = p_id and x.preco_visitas_centavos <> 0;
    return;
  end if;

  valor_visitas := o.visitas * (o.base_valor_visita_centavos + o.km_por_visita * o.base_custo_km_centavos
                                + o.outros_por_visita_centavos);
  select coalesce(sum(d.estimativa_centavos), 0)::bigint into despesas
  from public.orcamento_despesa as d
  where d.orcamento_id = p_id and d.tratamento = 'incluida';
  select count(*) * o.base_taxa_por_cobranca_centavos + o.base_taxa_por_assinatura_centavos into fixos
  from public.orcamento_parcela as p
  where p.orcamento_id = p_id;

  if o.forma_preco = 'tabela' then
    -- O que se reparte são as despesas incluídas; o peso é o preço pela hora de cada item.
    with itens as (select * from private.itens_do_preco(o)),
    ajustadas as (
      select t.id, t.posicao, t.pela_hora as base,
             case when (select sum(pela_hora) from itens) > 0 then t.pela_hora else 1 end as peso
      from itens as t
    ),
    partes as (
      select a.id, a.posicao, a.base,
             floor(despesas::numeric * a.peso / s.soma) as valor,
             mod(despesas::numeric * a.peso, s.soma) as resto
      from ajustadas as a cross join (select sum(peso) as soma from ajustadas) as s
    ),
    finais as (
      select p.id,
             (p.base + p.valor + case when row_number() over (order by p.resto desc, p.posicao)
                                         <= despesas - (select sum(valor) from partes) then 1 else 0 end)::bigint as valor
      from partes as p
    )
    update public.orcamento_item as i
    set preco_centavos = f.valor, preco_automatico = true
    from finais as f
    where f.id = i.id and i.orcamento_id = p_id
      and (i.preco_centavos <> f.valor or not i.preco_automatico);
  else
    select coalesce(sum(t.custo), 0) into total from private.itens_do_preco(o) as t;
    preco := round((total + despesas + fixos) * 10000
                   / (10000 - coalesce(o.margem_pb, o.base_margem_desejada_pb) - o.base_tributos_pb - o.base_taxas_pb))::bigint;

    with itens as (select * from private.itens_do_preco(o)),
    ajustadas as (
      select t.id, t.posicao,
             case when (select sum(custo) from itens) > 0 then t.custo else 1 end as peso
      from itens as t
    ),
    partes as (
      select a.id, a.posicao,
             floor(preco::numeric * a.peso / s.soma) as valor,
             mod(preco::numeric * a.peso, s.soma) as resto
      from ajustadas as a cross join (select sum(peso) as soma from ajustadas) as s
    ),
    finais as (
      select p.id,
             (p.valor + case when row_number() over (order by p.resto desc, p.posicao)
                                  <= preco - (select sum(valor) from partes) then 1 else 0 end)::bigint as valor
      from partes as p
    )
    update public.orcamento_item as i
    set preco_centavos = f.valor, preco_automatico = true
    from finais as f
    where f.id = i.id and i.orcamento_id = p_id
      and (i.preco_centavos <> f.valor or not i.preco_automatico);
  end if;

  if (select coalesce(sum(i.preco_centavos), 0) from public.orcamento_item as i where i.orcamento_id = p_id)
     + valor_visitas > 99999999999 then
    raise exception 'preco_invalido' using errcode = '22023';
  end if;

  update public.orcamento as x
  set preco_visitas_centavos = valor_visitas
  where x.id = p_id and x.preco_visitas_centavos <> valor_visitas;
end;
$$;

drop function public.salvar_base_de_custos(uuid, bigint, bigint, numeric, integer, integer, integer, integer, bigint, bigint, jsonb, jsonb, bigint, bigint);

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
  p_custo_km_centavos bigint default 0,
  p_horas_venda jsonb default '[]'::jsonb,
  p_piso_hora_centavos bigint default 0
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
  horas_venda jsonb := coalesce(p_horas_venda, '[]'::jsonb);
  horas_limpas jsonb := '[]'::jsonb;
  custo_por_profissao jsonb := '[]'::jsonb;
  custo_por_membro jsonb := '[]'::jsonb;
  detalhe jsonb := '[]'::jsonb;
  fixos bigint := p_custos_fixos_mensais_centavos;
  hora bigint := p_hora_tecnica_centavos;
  horas numeric := p_horas_faturaveis_mes;
  fixos_equipe bigint := 0;
  tecnico bigint;
  horas_da_equipe numeric;
begin
  if autor is null or not private.is_gestao(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  if jsonb_typeof(equipe) <> 'array' or jsonb_array_length(equipe) > 100 then
    raise exception 'equipe_invalida' using errcode = '22023';
  end if;

  if p_piso_hora_centavos is null or p_piso_hora_centavos not between 0 and 99999999999 then
    raise exception 'base_invalida' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(equipe) as e (valor)
    where coalesce(e.valor ->> 'pelo_piso', 'false') not in ('true', 'false')
       or length(coalesce(e.valor ->> 'profissao', '')) > 80
       or coalesce(e.valor ->> 'membro_id', '') !~ '^[0-9a-fA-F-]{36}$'
  ) then
    raise exception 'equipe_invalida' using errcode = '22023';
  end if;
  -- Cada linha é um membro ativo desta consultoria, uma vez só.
  if exists (
       select 1 from jsonb_array_elements(equipe) as e (valor)
       where not exists (
         select 1 from public.membro as m
         where m.consultoria_id = p_consultoria_id and m.id = (e.valor ->> 'membro_id')::uuid
           and m.situacao = 'ativo'))
     or (select count(distinct e.valor ->> 'membro_id') from jsonb_array_elements(equipe) as e (valor))
        <> jsonb_array_length(equipe) then
    raise exception 'equipe_invalida' using errcode = '22023';
  end if;
  -- Quem recebe pelo piso: remuneração do mês = horas no mês × piso por hora.
  equipe := coalesce((
    select jsonb_agg(case when coalesce((e.valor ->> 'pelo_piso')::boolean, false)
                          then e.valor || jsonb_build_object('custo_mensal_centavos',
                                 round(coalesce((e.valor ->> 'horas_disponiveis_mes')::numeric, 0)
                                       * p_piso_hora_centavos)::bigint)
                          else e.valor end order by e.ordem)
    from jsonb_array_elements(equipe) with ordinality as e (valor, ordem)), '[]'::jsonb);

  -- Tabela de hora de venda: uma linha por profissão e atividade ou nível (ex.: Eng. ambiental ·
  -- Júnior; Biólogo · Sênior; Eng. ambiental · Perícia). O id liga o item do orçamento à linha.
  if jsonb_typeof(horas_venda) <> 'array' or jsonb_array_length(horas_venda) > 100
     or exists (
       select 1 from jsonb_array_elements(horas_venda) as h (valor)
       where btrim(coalesce(h.valor ->> 'id', '')) = ''
          or length(h.valor ->> 'id') > 64
          or btrim(coalesce(h.valor ->> 'profissao', '')) = ''
          or length(btrim(h.valor ->> 'profissao')) > 80
          or btrim(coalesce(h.valor ->> 'atividade', '')) = ''
          or length(btrim(h.valor ->> 'atividade')) > 80
          or length(coalesce(h.valor ->> 'fonte', '')) > 200
          or coalesce((h.valor ->> 'valor_centavos')::bigint, -1) not between 0 and 99999999999)
     or (select count(distinct h.valor ->> 'id') from jsonb_array_elements(horas_venda) as h (valor))
        <> jsonb_array_length(horas_venda)
     or (select count(distinct lower(btrim(h.valor ->> 'profissao')) || '|' || lower(btrim(h.valor ->> 'atividade')))
         from jsonb_array_elements(horas_venda) as h (valor)) <> jsonb_array_length(horas_venda) then
    raise exception 'horas_de_venda_invalidas' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', btrim(h.valor ->> 'id'),
           'profissao', btrim(h.valor ->> 'profissao'),
           'atividade', btrim(h.valor ->> 'atividade'),
           'valor_centavos', (h.valor ->> 'valor_centavos')::bigint,
           'fonte', nullif(btrim(coalesce(h.valor ->> 'fonte', '')), '')) order by h.ordem), '[]'::jsonb)
    into horas_limpas
  from jsonb_array_elements(horas_venda) with ordinality as h (valor, ordem);

  -- Hora técnica por profissão (derivada): custo de quem é da profissão ÷ horas no mês dessas
  -- pessoas. Igual a custoHoraPorProfissao (packages/domain).
  select coalesce(jsonb_agg(jsonb_build_object('profissao', g.profissao,
           'hora_tecnica_centavos', round(g.custo / g.horas)::bigint) order by g.profissao), '[]'::jsonb)
    into custo_por_profissao
  from (
    select min(btrim(e.valor ->> 'profissao')) as profissao,
           sum((e.valor ->> 'custo_mensal_centavos')::numeric) as custo,
           sum((e.valor ->> 'horas_disponiveis_mes')::numeric) as horas
    from jsonb_array_elements(equipe) as e (valor)
    where btrim(coalesce(e.valor ->> 'profissao', '')) <> ''
    group by lower(btrim(e.valor ->> 'profissao'))
  ) as g
  where g.horas > 0;

  -- Hora de custo de cada membro: custo do mês ÷ horas no mês. Igual a custoHoraPorMembro.
  select coalesce(jsonb_agg(jsonb_build_object('membro_id', (e.valor ->> 'membro_id')::uuid,
           'hora_centavos', round((e.valor ->> 'custo_mensal_centavos')::numeric
                                  / (e.valor ->> 'horas_disponiveis_mes')::numeric)::bigint) order by e.ordem), '[]'::jsonb)
    into custo_por_membro
  from jsonb_array_elements(equipe) with ordinality as e (valor, ordem)
  where coalesce((e.valor ->> 'horas_disponiveis_mes')::integer, 0) > 0;

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
         or coalesce(e.valor ->> 'socio', 'false') not in ('true', 'false')
         or coalesce((e.valor ->> 'custo_mensal_centavos')::bigint, -1) not between 0 and 99999999999
         or coalesce((e.valor ->> 'horas_disponiveis_mes')::integer, -1) not between 0 and 744
    ) then
      raise exception 'equipe_invalida' using errcode = '22023';
    end if;

    -- Hora técnica média: Σ custos ÷ Σ horas. As contas do mês são rateadas pelas mesmas horas.
    select coalesce(sum((e.valor ->> 'custo_mensal_centavos')::bigint), 0)::bigint,
           coalesce(sum((e.valor ->> 'horas_disponiveis_mes')::integer), 0)
      into tecnico, horas_da_equipe
    from jsonb_array_elements(equipe) as e (valor);

    if horas_da_equipe <= 0 then
      raise exception 'equipe_sem_horas_faturaveis' using errcode = '22023';
    end if;
    horas := horas_da_equipe;
    hora := round(tecnico::numeric / horas_da_equipe)::bigint;
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
    valor_visita_centavos, custo_km_centavos, horas_venda, custo_hora_profissao, piso_hora_centavos,
    custo_hora_membro, atualizado_por)
  values (
    p_consultoria_id, hora, fixos, fixos_equipe,
    horas, p_margem_desejada_pb, p_margem_minima_pb, p_tributos_pb, p_taxas_pb,
    p_taxa_por_cobranca_centavos, p_taxa_por_assinatura_centavos, detalhe,
    p_valor_visita_centavos, p_custo_km_centavos, horas_limpas, custo_por_profissao, p_piso_hora_centavos,
    custo_por_membro, autor)
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
      horas_venda = excluded.horas_venda,
      custo_hora_profissao = excluded.custo_hora_profissao,
      piso_hora_centavos = excluded.piso_hora_centavos,
      custo_hora_membro = excluded.custo_hora_membro,
      atualizado_por = excluded.atualizado_por,
      atualizado_em = now(),
      row_version = b.row_version + 1;

  -- Composição: sai o que não veio, entra ou muda o que veio. Id de outra consultoria não é aceito.
  delete from public.orcamento_base_equipe as t
  where t.consultoria_id = p_consultoria_id
    and not exists (
      select 1 from jsonb_array_elements(equipe) as e (valor) where (e.valor ->> 'id')::uuid = t.id);

  -- A descrição é o nome do membro no momento em que a base foi salva.
  insert into public.orcamento_base_equipe as t (
    id, consultoria_id, ordem, membro_id, descricao, socio, pelo_piso, profissao, custo_mensal_centavos,
    horas_disponiveis_mes)
  select (e.valor ->> 'id')::uuid, p_consultoria_id, e.ordem::integer, m.id, m.nome,
         coalesce((e.valor ->> 'socio')::boolean, false),
         coalesce((e.valor ->> 'pelo_piso')::boolean, false),
         nullif(btrim(coalesce(e.valor ->> 'profissao', '')), ''),
         (e.valor ->> 'custo_mensal_centavos')::bigint,
         (e.valor ->> 'horas_disponiveis_mes')::integer
  from jsonb_array_elements(equipe) with ordinality as e (valor, ordem)
  join public.membro as m on m.consultoria_id = p_consultoria_id and m.id = (e.valor ->> 'membro_id')::uuid
  on conflict (id) do update
  set ordem = excluded.ordem,
      membro_id = excluded.membro_id,
      descricao = excluded.descricao,
      socio = excluded.socio,
      pelo_piso = excluded.pelo_piso,
      profissao = excluded.profissao,
      custo_mensal_centavos = excluded.custo_mensal_centavos,
      horas_disponiveis_mes = excluded.horas_disponiveis_mes
  where t.consultoria_id = excluded.consultoria_id;

  if (select count(*) from public.orcamento_base_equipe as t where t.consultoria_id = p_consultoria_id)
     <> jsonb_array_length(equipe) then
    raise exception 'equipe_invalida' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.salvar_base_de_custos(uuid, bigint, bigint, numeric, integer, integer, integer, integer, bigint, bigint, jsonb, jsonb, bigint, bigint, jsonb, bigint) from public, anon;
grant execute on function public.salvar_base_de_custos(uuid, bigint, bigint, numeric, integer, integer, integer, integer, bigint, bigint, jsonb, jsonb, bigint, bigint, jsonb, bigint) to authenticated;

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
    'horas_venda', b.horas_venda,
    'custo_hora_profissao', b.custo_hora_profissao,
    'piso_hora_centavos', b.piso_hora_centavos,
    'custo_hora_membro', b.custo_hora_membro,
    'atualizado_em', b.atualizado_em,
    'equipe', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'membro_id', e.membro_id, 'descricao', e.descricao, 'socio', e.socio,
        'pelo_piso', e.pelo_piso, 'profissao', e.profissao,
        'custo_mensal_centavos', e.custo_mensal_centavos,
        'horas_disponiveis_mes', e.horas_disponiveis_mes) order by e.ordem, e.id)
      from public.orcamento_base_equipe as e
      where e.consultoria_id = b.consultoria_id), '[]'::jsonb))
  from public.orcamento_base_custos as b
  where b.consultoria_id = p_consultoria_id
$$;

create or replace function public.criar_orcamento(
  p_id uuid,
  p_consultoria_id uuid,
  p_empreendimento_id uuid,
  p_objeto text,
  p_prospecto jsonb default null
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

  if p_empreendimento_id is null then
    if p_prospecto is null then
      raise exception 'empreendimento_ou_prospecto' using errcode = '22023';
    end if;
    if btrim(coalesce(p_prospecto ->> 'nome', '')) = '' then
      raise exception 'prospecto_sem_nome' using errcode = '22023';
    end if;
  elsif not exists (
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

  -- Prospecto: o nome entra já no insert (a constraint exige empreendimento ou nome) e o resto
  -- é validado por private.gravar_prospecto.
  insert into public.orcamento (id, consultoria_id, ano, sequencia, empreendimento_id, objeto, criado_por,
                                prospecto_nome)
  values (novo, p_consultoria_id, ano_atual, proxima, p_empreendimento_id, objeto_limpo, autor,
          case when p_empreendimento_id is null
               then nullif(btrim(coalesce(p_prospecto ->> 'nome', '')), '') end);

  if p_empreendimento_id is null then
    perform private.gravar_prospecto(novo, p_prospecto);
  end if;

  perform private.aplicar_base_ao_orcamento(novo);

  -- Com hora de venda cadastrada, o orçamento nasce pela tabela; sem ela, pela margem.
  update public.orcamento as o set forma_preco = 'tabela'
  where o.id = novo and jsonb_array_length(coalesce(o.base_horas_venda, '[]'::jsonb)) > 0;

  return novo;
end;
$$;

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
    custo_direto_extra_centavos, hora_venda_id, responsavel_id, mes_previsto)
  select (e.valor ->> 'id')::uuid, alvo.consultoria_id, p_id, e.ordem::integer,
         btrim(e.valor ->> 'descricao'),
         coalesce((e.valor ->> 'minutos')::integer, 0),
         true, 0,
         coalesce((e.valor ->> 'custo_direto_extra_centavos')::bigint, 0),
         nullif(btrim(coalesce(e.valor ->> 'hora_venda_id', '')), ''),
         (e.valor ->> 'responsavel_id')::uuid,
         (e.valor ->> 'mes_previsto')::date
  from jsonb_array_elements(itens) with ordinality as e (valor, ordem)
  on conflict (id) do update
  set ordem = excluded.ordem,
      descricao = excluded.descricao,
      minutos = excluded.minutos,
      custo_direto_extra_centavos = excluded.custo_direto_extra_centavos,
      hora_venda_id = excluded.hora_venda_id,
      responsavel_id = excluded.responsavel_id,
      mes_previsto = excluded.mes_previsto
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
    'row_version', o.row_version,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'descricao', i.descricao, 'minutos', i.minutos,
        'preco_automatico', i.preco_automatico, 'preco_centavos', i.preco_centavos,
        'custo_direto_extra_centavos', i.custo_direto_extra_centavos,
        'hora_venda_id', i.hora_venda_id, 'responsavel_id', i.responsavel_id,
        'mes_previsto', i.mes_previsto) order by i.ordem, i.id)
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

-- ---------------------------------------------------------------------------
-- Carga da equipe: jornada de cada membro (Custos e taxas) e horas por mês em orçamentos
-- aprovados, do mês atual (no fuso da consultoria) em diante. Só a Gestão. A tela soma as horas do
-- orçamento aberto (cargaDoMes, packages/domain).
-- ---------------------------------------------------------------------------
create function public.carga_da_equipe(p_consultoria_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  inicio date;
begin
  if not private.is_gestao(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select date_trunc('month', (now() at time zone c.fuso))::date into inicio
  from public.consultoria as c where c.id = p_consultoria_id;

  return jsonb_build_object(
    'jornada', coalesce((
      select jsonb_agg(jsonb_build_object('membro_id', e.membro_id, 'horas_mes', e.horas_disponiveis_mes)
                       order by e.ordem)
      from public.orcamento_base_equipe as e
      where e.consultoria_id = p_consultoria_id and e.membro_id is not null), '[]'::jsonb),
    'comprometido', coalesce((
      select jsonb_agg(jsonb_build_object('membro_id', x.responsavel_id, 'mes', x.mes, 'minutos', x.minutos)
                       order by x.mes, x.responsavel_id)
      from (
        select i.responsavel_id, i.mes_previsto as mes, sum(i.minutos) as minutos
        from public.orcamento_item as i
        join public.orcamento as o on o.consultoria_id = i.consultoria_id and o.id = i.orcamento_id
        where i.consultoria_id = p_consultoria_id
          and o.situacao = 'aprovada'
          and i.responsavel_id is not null
          and i.mes_previsto >= inicio
        group by i.responsavel_id, i.mes_previsto
      ) as x), '[]'::jsonb));
end;
$$;

revoke all on function public.carga_da_equipe(uuid) from public, anon;
grant execute on function public.carga_da_equipe(uuid) to authenticated;
