-- Como cada pessoa recebe (ADR-0018, fatia 3; decisão do Eduardo de 12/11/2026):
-- 1. Sai o "pelo piso": o sistema não tem como saber o piso de ninguém. A coluna pelo_piso e o
--    piso_hora_centavos da base ficam guardados (sem uso) até uma migration futura removê-los.
-- 2. Entra a forma de recebimento de cada pessoa: CLT, pró-labore, estágio (custo do mês e horas
--    do mês), por diária (custo, horas por diária e dias no mês, opcional) ou por projeto (custo e
--    horas do projeto; horas no mês, opcional). Meio período é a jornada, não uma forma.
-- 3. Custo do mês e horas do mês passam a aceitar nulo (desconhecido). Média da equipe, rateio e
--    hora por profissão usam só quem tem os dois conhecidos; a hora de custo de cada membro vale
--    sempre que houver horas para dividir. Linhas antigas ficam com a forma nula ("ainda não
--    informada") e os mesmos valores.
-- Regra pura em packages/domain/src/remuneracao.ts (resumoDaPessoa).

alter table public.orcamento_base_equipe
  alter column custo_mensal_centavos drop not null,
  alter column horas_disponiveis_mes drop not null,
  add column tipo_recebimento text,
  add column custo_diaria_centavos bigint,
  add column horas_por_diaria integer,
  add column dias_no_mes integer,
  add column custo_projeto_centavos bigint,
  add column horas_projeto integer,
  add constraint orcamento_base_equipe_tipo_recebimento check (
    tipo_recebimento is null or tipo_recebimento in ('clt', 'pro_labore', 'estagio', 'diaria', 'projeto')),
  add constraint orcamento_base_equipe_remuneracao check (
    (custo_diaria_centavos is null or custo_diaria_centavos between 0 and 99999999999)
    and (horas_por_diaria is null or horas_por_diaria between 0 and 24)
    and (dias_no_mes is null or dias_no_mes between 0 and 31)
    and (custo_projeto_centavos is null or custo_projeto_centavos between 0 and 99999999999)
    and (horas_projeto is null or horas_projeto between 0 and 100000));

comment on column public.orcamento_base_equipe.tipo_recebimento is
  'Como a pessoa recebe: clt, pro_labore, estagio, diaria ou projeto. Nulo = ainda não informado (vale como mensal).';
comment on column public.orcamento_base_equipe.custo_mensal_centavos is
  'Custo do mês. Na diária, dias × custo da diária (nulo sem dias); no projeto, nulo.';
comment on column public.orcamento_base_equipe.horas_disponiveis_mes is
  'Horas no mês (capacidade). Na diária, dias × horas por diária; nulo = desconhecida.';
comment on column public.orcamento_base_equipe.pelo_piso is
  'Sem uso desde a fatia 3 do ADR-0018 (12/11/2026); será removida numa migration futura.';

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
          or coalesce(h.valor ->> 'minutos_por_unidade', '0') !~ '^[0-9]{1,6}$')
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
           'minutos_por_unidade', (h.valor ->> 'minutos_por_unidade')::integer) order by h.ordem), '[]'::jsonb)
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
        'horas_disponiveis_mes', e.horas_disponiveis_mes,
        'tipo_recebimento', e.tipo_recebimento,
        'custo_diaria_centavos', e.custo_diaria_centavos,
        'horas_por_diaria', e.horas_por_diaria,
        'dias_no_mes', e.dias_no_mes,
        'custo_projeto_centavos', e.custo_projeto_centavos,
        'horas_projeto', e.horas_projeto) order by e.ordem, e.id)
      from public.orcamento_base_equipe as e
      where e.consultoria_id = b.consultoria_id), '[]'::jsonb))
  from public.orcamento_base_custos as b
  where b.consultoria_id = p_consultoria_id
$$;
