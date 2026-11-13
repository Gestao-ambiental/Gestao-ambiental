-- Faixas progressivas e preço mínimo na tabela de preços (ADR-0018, fatia 4).
-- 1. Cada linha de orcamento_base_custos.horas_venda pode ter "faixas" ([{ate, valor_centavos}],
--    progressivas, só em m², ha, diária e campanha) e "minimo_centavos" (opcional, nunca no pacote).
--    A cópia por orçamento (base_horas_venda) leva os dois: a proposta não muda depois.
-- 2. Venda com faixas: cada trecho da quantidade × valor da sua faixa, somado em numeric exato e
--    arredondado uma vez. 500 fica toda na faixa "até 500"; 500,0001 põe 0,0001 na seguinte.
-- 3. Mínimo: max(venda, mínimo), só sobre os honorários (antes de outros custos e despesas).
-- Mesmos centavos de packages/domain/src/preco-faixas.test.ts.

-- Faixas válidas: até 10, só em m², ha, diária e campanha; limites positivos e crescentes; só a
-- última aberta (sem "ate"). Igual a problemaDasFaixas (packages/domain).
create or replace function private.faixas_invalidas(f jsonb, unidade text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  total integer;
  anterior numeric := 0;
  faixa jsonb;
  posicao bigint;
  ate numeric;
begin
  if f is null or f = 'null'::jsonb then
    return false;
  end if;
  if jsonb_typeof(f) <> 'array' then
    return true;
  end if;
  total := jsonb_array_length(f);
  if total = 0 then
    return false;
  end if;
  if unidade not in ('m2', 'ha', 'diaria', 'campanha') or total > 10 then
    return true;
  end if;
  for faixa, posicao in select x, n from jsonb_array_elements(f) with ordinality as t (x, n) order by n loop
    if jsonb_typeof(faixa) <> 'object'
       or coalesce(faixa ->> 'valor_centavos', '') !~ '^[0-9]{1,11}$' then
      return true;
    end if;
    if faixa ->> 'ate' is null then
      if posicao < total then
        return true;
      end if;
    else
      if posicao = total or (faixa ->> 'ate') !~ '^[0-9]{1,8}(\.[0-9]{1,4})?$' then
        return true;
      end if;
      ate := (faixa ->> 'ate')::numeric;
      if ate <= anterior then
        return true;
      end if;
      anterior := ate;
    end if;
  end loop;
  return false;
end;
$$;

-- Faixas no formato guardado: ate numeric(18,4) (nulo na última) e valor em centavos.
create or replace function private.faixas_limpas(f jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'ate', (t.x ->> 'ate')::numeric(18,4),
           'valor_centavos', (t.x ->> 'valor_centavos')::bigint) order by t.n), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(f) = 'array' then f else '[]'::jsonb end)
         with ordinality as t (x, n)
$$;

-- Valor progressivo de uma quantidade: igual a valorPorFaixas (packages/domain).
create or replace function private.valor_por_faixas(quantidade numeric, f jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(coalesce(sum(greatest(least(quantidade, coalesce(s.ate, quantidade))
                                     - coalesce(s.anterior, 0), 0) * s.valor), 0))
  from (
    select (t.x ->> 'ate')::numeric as ate,
           (t.x ->> 'valor_centavos')::bigint as valor,
           lag((t.x ->> 'ate')::numeric) over (order by t.n) as anterior
    from jsonb_array_elements(f) with ordinality as t (x, n)
  ) as s
$$;

revoke all on function private.faixas_invalidas(jsonb, text) from public, anon, authenticated;
revoke all on function private.faixas_limpas(jsonb) from public, anon, authenticated;
revoke all on function private.valor_por_faixas(numeric, jsonb) from public, anon, authenticated;

-- Itens com custo, preço base, venda, se é pacote e o rateio das contas de cada um. Mudou só a
-- venda: faixas e mínimo.
create or replace function private.itens_do_preco(o public.orcamento)
returns table (id uuid, posicao bigint, custo numeric, pela_hora numeric, venda numeric, fixo boolean,
               contas numeric)
language sql
stable
set search_path = ''
as $$
  select i.id,
         i.ordem::bigint,
         round(i.minutos::numeric * coalesce(cm.hora, cp.hora, o.base_hora_tecnica_centavos) / 60)
           + i.custo_direto_extra_centavos
           + round(i.minutos::numeric * o.base_custo_fixo_hora_centavos / 60),
         case when v.venda is null then null
              when hv.unidade = 'pacote' then v.venda
              else v.venda + i.custo_direto_extra_centavos end,
         v.venda,
         coalesce(hv.unidade = 'pacote', false),
         round(i.minutos::numeric * o.base_custo_fixo_hora_centavos / 60)
  from public.orcamento_item as i
  left join lateral (
    select (h.valor ->> 'valor_centavos')::bigint as valor,
           lower(btrim(h.valor ->> 'profissao')) as profissao,
           coalesce(h.valor ->> 'unidade', 'hora') as unidade,
           coalesce((h.valor ->> 'minimo_centavos')::bigint, 0) as minimo,
           case when jsonb_typeof(h.valor -> 'faixas') = 'array' then h.valor -> 'faixas'
                else '[]'::jsonb end as faixas
    from jsonb_array_elements(coalesce(o.base_horas_venda, '[]'::jsonb)) as h (valor)
    where h.valor ->> 'id' = i.hora_venda_id
    limit 1
  ) as hv on true
  left join lateral (
    select case when hv.valor is null then null
                when hv.unidade = 'pacote' then i.preco_fechado_centavos::numeric
                when hv.unidade = 'hora' then greatest(round(i.minutos::numeric * hv.valor / 60), hv.minimo)
                when i.quantidade is null then null
                when jsonb_array_length(hv.faixas) > 0
                  then greatest(private.valor_por_faixas(i.quantidade, hv.faixas), hv.minimo)
                else greatest(round(i.quantidade * hv.valor), hv.minimo) end as venda
  ) as v on true
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

-- Tabela de preços com faixas e preço mínimo.
create or replace function public.salvar_base_de_custos(
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
    where length(coalesce(e.valor ->> 'profissao', '')) > 80
       or coalesce(e.valor ->> 'tipo_recebimento', 'clt') not in ('clt', 'pro_labore', 'estagio', 'diaria', 'projeto')
       or coalesce(e.valor ->> 'custo_mensal_centavos', '0') !~ '^[0-9]{1,11}$'
       or coalesce(e.valor ->> 'horas_disponiveis_mes', '0') !~ '^[0-9]{1,3}$'
       or coalesce(e.valor ->> 'custo_diaria_centavos', '0') !~ '^[0-9]{1,11}$'
       or coalesce(e.valor ->> 'horas_por_diaria', '0') !~ '^[0-9]{1,2}$'
       or coalesce((e.valor ->> 'horas_por_diaria')::integer, 0) > 24
       or coalesce(e.valor ->> 'dias_no_mes', '0') !~ '^[0-9]{1,2}$'
       or coalesce((e.valor ->> 'dias_no_mes')::integer, 0) > 31
       or coalesce(e.valor ->> 'custo_projeto_centavos', '0') !~ '^[0-9]{1,11}$'
       or coalesce(e.valor ->> 'horas_projeto', '0') !~ '^[0-9]{1,6}$'
       or coalesce((e.valor ->> 'horas_projeto')::integer, 0) > 100000
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
  -- Como cada pessoa recebe (ADR-0018, fatia 3): custo do mês, horas do mês e hora de custo
  -- derivados, iguais a resumoDaPessoa (packages/domain). Ausente fica nulo, nunca zero. O antigo
  -- "pelo piso" é ignorado.
  equipe := coalesce((
    select jsonb_agg(e.valor || d.derivado order by e.ordem)
    from jsonb_array_elements(equipe) with ordinality as e (valor, ordem)
    cross join lateral (
      select (e.valor ->> 'custo_mensal_centavos')::bigint as custo,
             (e.valor ->> 'horas_disponiveis_mes')::integer as horas,
             (e.valor ->> 'custo_diaria_centavos')::bigint as diaria,
             (e.valor ->> 'horas_por_diaria')::integer as horas_diaria,
             (e.valor ->> 'dias_no_mes')::integer as dias,
             (e.valor ->> 'custo_projeto_centavos')::bigint as projeto,
             (e.valor ->> 'horas_projeto')::integer as horas_projeto
    ) as v
    cross join lateral (
      select case e.valor ->> 'tipo_recebimento'
        when 'diaria' then jsonb_build_object(
          'custo_mensal_centavos', v.dias::bigint * v.diaria,
          'horas_disponiveis_mes', v.dias * v.horas_diaria,
          'hora_custo_centavos',
            case when v.diaria is not null and coalesce(v.horas_diaria, 0) > 0
                 then round(v.diaria::numeric / v.horas_diaria)::bigint end)
        when 'projeto' then jsonb_build_object(
          'custo_mensal_centavos', null,
          'horas_disponiveis_mes', v.horas,
          'hora_custo_centavos',
            case when v.projeto is not null and coalesce(v.horas_projeto, 0) > 0
                 then round(v.projeto::numeric / v.horas_projeto)::bigint end)
        else jsonb_build_object(
          'custo_mensal_centavos', v.custo,
          'horas_disponiveis_mes', v.horas,
          'hora_custo_centavos',
            case when v.custo is not null and coalesce(v.horas, 0) > 0
                 then round(v.custo::numeric / v.horas)::bigint end)
      end as derivado
    ) as d), '[]'::jsonb);
  if exists (
    select 1 from jsonb_array_elements(equipe) as e (valor)
    where coalesce((e.valor ->> 'horas_disponiveis_mes')::integer, 0) > 744
       or coalesce((e.valor ->> 'custo_mensal_centavos')::bigint, 0) > 99999999999
  ) then
    raise exception 'equipe_invalida' using errcode = '22023';
  end if;

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
          or coalesce((h.valor ->> 'valor_centavos')::bigint, -1) not between 0 and 99999999999
          or coalesce(h.valor ->> 'unidade', 'hora') not in ('hora', 'm2', 'ha', 'diaria', 'campanha', 'pacote')
          or coalesce(h.valor ->> 'minutos_por_unidade', '0') !~ '^[0-9]{1,6}$'
          -- Preço mínimo (opcional, nunca no pacote) e faixas progressivas (ADR-0018, fatia 4).
          or (h.valor ->> 'minimo_centavos' is not null
              and ((h.valor ->> 'minimo_centavos') !~ '^[0-9]{1,11}$'
                   or coalesce(h.valor ->> 'unidade', 'hora') = 'pacote'))
          or private.faixas_invalidas(h.valor -> 'faixas', coalesce(h.valor ->> 'unidade', 'hora')))
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
           'fonte', nullif(btrim(coalesce(h.valor ->> 'fonte', '')), ''),
           'unidade', coalesce(h.valor ->> 'unidade', 'hora'),
           'minutos_por_unidade', (h.valor ->> 'minutos_por_unidade')::integer,
           'minimo_centavos', (h.valor ->> 'minimo_centavos')::bigint,
           'faixas', private.faixas_limpas(h.valor -> 'faixas')) order by h.ordem), '[]'::jsonb)
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
      and e.valor ->> 'custo_mensal_centavos' is not null
      and e.valor ->> 'horas_disponiveis_mes' is not null
    group by lower(btrim(e.valor ->> 'profissao'))
  ) as g
  where g.horas > 0;

  -- Hora de custo de cada membro, conforme a forma de recebimento. Igual a horaDeCustoPorMembro.
  select coalesce(jsonb_agg(jsonb_build_object('membro_id', (e.valor ->> 'membro_id')::uuid,
           'hora_centavos', (e.valor ->> 'hora_custo_centavos')::bigint) order by e.ordem), '[]'::jsonb)
    into custo_por_membro
  from jsonb_array_elements(equipe) with ordinality as e (valor, ordem)
  where e.valor ->> 'hora_custo_centavos' is not null;

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
         or coalesce((e.valor ->> 'custo_mensal_centavos')::bigint, 0) not between 0 and 99999999999
         or coalesce((e.valor ->> 'horas_disponiveis_mes')::integer, 0) not between 0 and 744
    ) then
      raise exception 'equipe_invalida' using errcode = '22023';
    end if;

    -- Hora técnica média: Σ custos ÷ Σ horas de quem tem os dois conhecidos (diária sem dias e
    -- projeto ficam de fora). As contas do mês são rateadas pelas mesmas horas.
    select coalesce(sum((e.valor ->> 'custo_mensal_centavos')::bigint), 0)::bigint,
           coalesce(sum((e.valor ->> 'horas_disponiveis_mes')::integer), 0)
      into tecnico, horas_da_equipe
    from jsonb_array_elements(equipe) as e (valor)
    where e.valor ->> 'custo_mensal_centavos' is not null
      and e.valor ->> 'horas_disponiveis_mes' is not null;

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
    horas_disponiveis_mes, tipo_recebimento, custo_diaria_centavos, horas_por_diaria, dias_no_mes,
    custo_projeto_centavos, horas_projeto)
  select (e.valor ->> 'id')::uuid, p_consultoria_id, e.ordem::integer, m.id, m.nome,
         coalesce((e.valor ->> 'socio')::boolean, false),
         false,
         nullif(btrim(coalesce(e.valor ->> 'profissao', '')), ''),
         (e.valor ->> 'custo_mensal_centavos')::bigint,
         (e.valor ->> 'horas_disponiveis_mes')::integer,
         e.valor ->> 'tipo_recebimento',
         (e.valor ->> 'custo_diaria_centavos')::bigint,
         (e.valor ->> 'horas_por_diaria')::integer,
         (e.valor ->> 'dias_no_mes')::integer,
         (e.valor ->> 'custo_projeto_centavos')::bigint,
         (e.valor ->> 'horas_projeto')::integer
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
      horas_disponiveis_mes = excluded.horas_disponiveis_mes,
      tipo_recebimento = excluded.tipo_recebimento,
      custo_diaria_centavos = excluded.custo_diaria_centavos,
      horas_por_diaria = excluded.horas_por_diaria,
      dias_no_mes = excluded.dias_no_mes,
      custo_projeto_centavos = excluded.custo_projeto_centavos,
      horas_projeto = excluded.horas_projeto
  where t.consultoria_id = excluded.consultoria_id;

  if (select count(*) from public.orcamento_base_equipe as t where t.consultoria_id = p_consultoria_id)
     <> jsonb_array_length(equipe) then
    raise exception 'equipe_invalida' using errcode = '22023';
  end if;
end;
$$;
