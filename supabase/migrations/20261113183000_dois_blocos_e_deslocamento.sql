-- Tabela de preços em dois blocos e visita técnica por visita ou por km (decisões do Eduardo,
-- 13/11/2026).
-- 1. Tabela de preços: "Hora de profissional" (unidade hora) exige a profissão; "Serviços" (m², ha,
--    diária, campanha, pacote) têm a profissão como "Quem faz", opcional. O modelo não muda: a mesma
--    lista horas_venda; o bloco vem da unidade. Sem profissão, o custo do serviço usa a média da
--    equipe: private.itens_do_preco já recua para base_hora_tecnica_centavos quando não há custo
--    da profissão (profissão '' não casa com nenhuma). A dupla profissão|atividade continua única.
-- 2. Deslocamento: a consultoria escolhe "visita" (só o valor fixo; o km não entra) ou "km" (só o
--    km rodado; o valor da visita não entra). O valor do km é derivado pelo banco: preço do litro
--    ÷ consumo do carro, arredondado ao centavo, + acréscimo opcional (valorDoKm em
--    packages/domain/src/deslocamento.ts). custo_km_centavos continua existindo, derivado.
-- 3. A cópia da base para o orçamento leva o modo e só o valor que vale nele (o outro vai 0); por
--    isso private.precificar_orcamento não muda. Orçamento copiado antes desta migration fica sem
--    modo e soma os dois, como na época (proposta enviada não é recalculada).
--
-- As funções alteradas são recriadas por inteiro, a partir da última versão de cada uma, e não por
-- replace() sobre pg_get_functiondef: mudam várias partes (assinatura, validação, insert, update),
-- e a definição completa aqui fica legível, versionada e conferível na revisão.

-- ---------------------------------------------------------------------------
-- Colunas
-- ---------------------------------------------------------------------------
alter table public.orcamento_base_custos
  add column deslocamento_modo text,
  add column consumo_km_por_litro numeric(5,2),
  add column preco_combustivel_centavos bigint,
  add column acrescimo_km_centavos bigint,
  add constraint orcamento_base_custos_deslocamento_modo_check
    check (deslocamento_modo in ('visita', 'km')),
  add constraint orcamento_base_custos_consumo_km_por_litro_check
    check (consumo_km_por_litro > 0),
  add constraint orcamento_base_custos_preco_combustivel_check
    check (preco_combustivel_centavos between 0 and 99999999999),
  add constraint orcamento_base_custos_acrescimo_km_check
    check (acrescimo_km_centavos between 0 and 99999999999),
  add constraint orcamento_base_custos_combustivel_completo_check
    check ((consumo_km_por_litro is null) = (preco_combustivel_centavos is null));

comment on column public.orcamento_base_custos.deslocamento_modo is
  'Como a visita técnica é cobrada: visita (valor fixo) ou km (km rodado). Nulo em base salva antes da escolha: vale km quando só o km tem valor, senão visita.';
comment on column public.orcamento_base_custos.consumo_km_por_litro is
  'Consumo do carro em km por litro (0,01 a 999,99). Com o preço do litro, dá o valor do km.';
comment on column public.orcamento_base_custos.preco_combustivel_centavos is
  'Preço do litro do combustível, em centavos.';
comment on column public.orcamento_base_custos.acrescimo_km_centavos is
  'Acréscimo por km, em centavos; nulo = sem acréscimo.';
comment on column public.orcamento_base_custos.custo_km_centavos is
  'Valor do km, derivado: round(preço do litro ÷ consumo) + acréscimo. Em base antiga, o valor digitado.';

alter table public.orcamento
  add column base_deslocamento_modo text,
  add constraint orcamento_base_deslocamento_modo_check
    check (base_deslocamento_modo in ('visita', 'km'));

comment on column public.orcamento.base_deslocamento_modo is
  'Modo da visita copiado da base. Nulo em orçamento copiado antes da escolha: soma visita e km.';

-- ---------------------------------------------------------------------------
-- Valor do km: igual a valorDoKm (packages/domain/src/deslocamento.ts). Nulo = entrada inválida.
-- ---------------------------------------------------------------------------
create function private.valor_do_km(p_preco bigint, p_consumo numeric, p_acrescimo bigint)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_acrescimo, 0) not between 0 and 99999999999 then null
    when p_preco is null and p_consumo is null then coalesce(p_acrescimo, 0)
    when p_preco is null or p_consumo is null then null
    when p_preco not between 0 and 99999999999 then null
    when p_consumo <= 0 or p_consumo > 999.99 or p_consumo <> round(p_consumo, 2) then null
    -- round() em numeric arredonda a metade para cima (valores positivos), como o domínio.
    else round(p_preco::numeric / p_consumo)::bigint + coalesce(p_acrescimo, 0)
  end
$$;

revoke all on function private.valor_do_km(bigint, numeric, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Salvar a base: profissão só na hora, deslocamento com modo e combustível. Nova assinatura (quatro
-- parâmetros a mais, com padrão nulo: chamadas antigas continuam valendo).
-- ---------------------------------------------------------------------------
drop function public.salvar_base_de_custos(
  uuid, bigint, bigint, numeric, integer, integer, integer, integer, bigint, bigint,
  jsonb, jsonb, bigint, bigint, jsonb, bigint);
drop function private.salvar_base_de_custos_completa(
  uuid, bigint, bigint, numeric, integer, integer, integer, integer, bigint, bigint,
  jsonb, jsonb, bigint, bigint, jsonb, bigint);

create function private.salvar_base_de_custos_completa(
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
  p_piso_hora_centavos bigint default 0,
  p_deslocamento_modo text default null,
  p_consumo_km_por_litro numeric default null,
  p_preco_combustivel_centavos bigint default null,
  p_acrescimo_km_centavos bigint default null
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
  modo text := p_deslocamento_modo;
  custo_km bigint := p_custo_km_centavos;
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

  -- Tabela de preços em dois blocos: hora de profissional (unidade hora, profissão obrigatória) e
  -- serviços (m², ha, diária, campanha, pacote; profissão = "Quem faz", opcional). O id liga o item
  -- do orçamento à linha. A dupla profissão|atividade não se repete (sem profissão conta como '').
  if jsonb_typeof(horas_venda) <> 'array' or jsonb_array_length(horas_venda) > 100
     or exists (
       select 1 from jsonb_array_elements(horas_venda) as h (valor)
       where btrim(coalesce(h.valor ->> 'id', '')) = ''
          or length(h.valor ->> 'id') > 64
          or (coalesce(h.valor ->> 'unidade', 'hora') = 'hora'
              and btrim(coalesce(h.valor ->> 'profissao', '')) = '')
          or length(btrim(coalesce(h.valor ->> 'profissao', ''))) > 80
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
     or (select count(distinct lower(btrim(coalesce(h.valor ->> 'profissao', ''))) || '|' || lower(btrim(h.valor ->> 'atividade')))
         from jsonb_array_elements(horas_venda) as h (valor)) <> jsonb_array_length(horas_venda) then
    raise exception 'horas_de_venda_invalidas' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', btrim(h.valor ->> 'id'),
           'profissao', btrim(coalesce(h.valor ->> 'profissao', '')),
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

  -- Visita técnica e deslocamento: por visita (só o valor fixo) ou por km (só o km rodado). O valor
  -- do km é derivado aqui: preço do litro ÷ consumo + acréscimo (o enviado é ignorado). Chamada
  -- antiga, sem modo e sem combustível, guarda o km enviado e deduz o modo.
  if (modo is not null and modo not in ('visita', 'km'))
     or (p_consumo_km_por_litro is not null
         and (p_consumo_km_por_litro <= 0 or p_consumo_km_por_litro > 999.99
              or p_consumo_km_por_litro <> round(p_consumo_km_por_litro, 2)))
     or (p_preco_combustivel_centavos is not null
         and p_preco_combustivel_centavos not between 0 and 99999999999)
     or (p_acrescimo_km_centavos is not null and p_acrescimo_km_centavos not between 0 and 99999999999)
     or (p_consumo_km_por_litro is null) <> (p_preco_combustivel_centavos is null) then
    raise exception 'deslocamento_invalido' using errcode = '22023';
  end if;
  if modo is not null or p_consumo_km_por_litro is not null or p_acrescimo_km_centavos is not null then
    custo_km := private.valor_do_km(p_preco_combustivel_centavos, p_consumo_km_por_litro,
                                    p_acrescimo_km_centavos);
  end if;
  if custo_km is null or custo_km not between 0 and 99999999999 then
    raise exception 'deslocamento_invalido' using errcode = '22023';
  end if;
  modo := coalesce(modo, case when custo_km > 0 and p_valor_visita_centavos = 0 then 'km' else 'visita' end);

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
    custo_hora_membro, deslocamento_modo, consumo_km_por_litro, preco_combustivel_centavos,
    acrescimo_km_centavos, atualizado_por)
  values (
    p_consultoria_id, hora, fixos, fixos_equipe,
    horas, p_margem_desejada_pb, p_margem_minima_pb, p_tributos_pb, p_taxas_pb,
    p_taxa_por_cobranca_centavos, p_taxa_por_assinatura_centavos, detalhe,
    p_valor_visita_centavos, custo_km, horas_limpas, custo_por_profissao, p_piso_hora_centavos,
    custo_por_membro, modo, p_consumo_km_por_litro, p_preco_combustivel_centavos,
    p_acrescimo_km_centavos, autor)
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
      deslocamento_modo = excluded.deslocamento_modo,
      consumo_km_por_litro = excluded.consumo_km_por_litro,
      preco_combustivel_centavos = excluded.preco_combustivel_centavos,
      acrescimo_km_centavos = excluded.acrescimo_km_centavos,
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

revoke all on function private.salvar_base_de_custos_completa(
  uuid, bigint, bigint, numeric, integer, integer, integer, integer, bigint, bigint,
  jsonb, jsonb, bigint, bigint, jsonb, bigint, text, numeric, bigint, bigint)
  from public, anon, authenticated;

-- A pública só ajusta a profissão da equipe pelo cadastro do membro e chama a completa.
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
  p_piso_hora_centavos bigint default 0,
  p_deslocamento_modo text default null,
  p_consumo_km_por_litro numeric default null,
  p_preco_combustivel_centavos bigint default null,
  p_acrescimo_km_centavos bigint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  equipe jsonb := coalesce(p_equipe, '[]'::jsonb);
begin
  if jsonb_typeof(equipe) = 'array' then
    select coalesce(jsonb_agg(
             case when jsonb_typeof(e.valor) = 'object' and m.profissao is not null
                  then e.valor || jsonb_build_object('profissao', private.rotulo_da_profissao(m.profissao))
                  else e.valor end
             order by e.ordem), '[]'::jsonb)
      into equipe
    from jsonb_array_elements(equipe) with ordinality as e (valor, ordem)
    left join public.membro as m
      on m.consultoria_id = p_consultoria_id
     and jsonb_typeof(e.valor) = 'object'
     and m.id::text = e.valor ->> 'membro_id';
  end if;
  perform private.salvar_base_de_custos_completa(
    p_consultoria_id, p_hora_tecnica_centavos, p_custos_fixos_mensais_centavos,
    p_horas_faturaveis_mes, p_margem_desejada_pb, p_margem_minima_pb, p_tributos_pb, p_taxas_pb,
    p_taxa_por_cobranca_centavos, p_taxa_por_assinatura_centavos, equipe, p_custos_fixos,
    p_valor_visita_centavos, p_custo_km_centavos, p_horas_venda, p_piso_hora_centavos,
    p_deslocamento_modo, p_consumo_km_por_litro, p_preco_combustivel_centavos, p_acrescimo_km_centavos);
end;
$$;

revoke all on function public.salvar_base_de_custos(
  uuid, bigint, bigint, numeric, integer, integer, integer, integer, bigint, bigint,
  jsonb, jsonb, bigint, bigint, jsonb, bigint, text, numeric, bigint, bigint) from public, anon;
grant execute on function public.salvar_base_de_custos(
  uuid, bigint, bigint, numeric, integer, integer, integer, integer, bigint, bigint,
  jsonb, jsonb, bigint, bigint, jsonb, bigint, text, numeric, bigint, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Primeiros passos: o passo 3 aceita o deslocamento; a profissão só é exigida na hora.
-- ---------------------------------------------------------------------------
create or replace function private.passo_da_configuracao_valido(
  p_consultoria_id uuid,
  p_etapa integer,
  p_dados jsonb
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  maximo_centavos constant numeric := 99999999999;
  uuid_valido constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  equipe jsonb;
  contas jsonb;
  horas_venda jsonb;
begin
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    return false;
  end if;

  if p_etapa = 1 then
    equipe := p_dados -> 'equipe';
    if private.chaves_do_rascunho_invalidas(p_dados, array['modo', 'equipe', 'hora_tecnica_centavos'])
       or coalesce(p_dados ->> 'modo', '') not in ('equipe', 'manual')
       or jsonb_typeof(equipe) is distinct from 'array'
       or jsonb_array_length(equipe) > 100
       or (p_dados ->> 'modo' = 'manual' and jsonb_array_length(equipe) > 0)
       or private.numero_do_rascunho_invalido(p_dados -> 'hora_tecnica_centavos', maximo_centavos) then
      return false;
    end if;
    if exists (
      select 1 from jsonb_array_elements(equipe) as e (v)
      where private.chaves_do_rascunho_invalidas(e.v, array[
              'id', 'membro_id', 'socio', 'profissao', 'tipo_recebimento', 'custo_mensal_centavos',
              'horas_disponiveis_mes', 'custo_diaria_centavos', 'horas_por_diaria', 'dias_no_mes',
              'custo_projeto_centavos', 'horas_projeto'])
         or jsonb_typeof(e.v -> 'id') is distinct from 'string' or (e.v ->> 'id') !~ uuid_valido
         or jsonb_typeof(e.v -> 'membro_id') is distinct from 'string'
         or (e.v ->> 'membro_id') !~ uuid_valido
         or jsonb_typeof(e.v -> 'socio') is distinct from 'boolean'
         or private.texto_do_rascunho_invalido(e.v -> 'profissao', 80, false)
         or (e.v -> 'tipo_recebimento' is not null and e.v -> 'tipo_recebimento' <> 'null'::jsonb
             and coalesce(e.v ->> 'tipo_recebimento', '') not in ('clt', 'pro_labore', 'estagio', 'diaria', 'projeto'))
         or private.numero_do_rascunho_invalido(e.v -> 'custo_mensal_centavos', maximo_centavos)
         or private.numero_do_rascunho_invalido(e.v -> 'horas_disponiveis_mes', 744)
         or private.numero_do_rascunho_invalido(e.v -> 'custo_diaria_centavos', maximo_centavos)
         or private.numero_do_rascunho_invalido(e.v -> 'horas_por_diaria', 24)
         or private.numero_do_rascunho_invalido(e.v -> 'dias_no_mes', 31)
         or private.numero_do_rascunho_invalido(e.v -> 'custo_projeto_centavos', maximo_centavos)
         or private.numero_do_rascunho_invalido(e.v -> 'horas_projeto', 100000)
    ) then
      return false;
    end if;
    -- Cada pessoa é um membro ativo desta consultoria, uma vez só; ids de linha sem repetir.
    return not exists (
             select 1 from jsonb_array_elements(equipe) as e (v)
             where not exists (
               select 1 from public.membro as m
               where m.consultoria_id = p_consultoria_id and m.id = (e.v ->> 'membro_id')::uuid
                 and m.situacao = 'ativo'))
       and (select count(distinct e.v ->> 'membro_id') from jsonb_array_elements(equipe) as e (v))
           = jsonb_array_length(equipe)
       and (select count(distinct lower(e.v ->> 'id')) from jsonb_array_elements(equipe) as e (v))
           = jsonb_array_length(equipe);
  end if;

  if p_etapa = 2 then
    contas := p_dados -> 'contas';
    return not (
      private.chaves_do_rascunho_invalidas(p_dados, array['custos_fixos_mensais_centavos', 'contas', 'horas_faturaveis_mes'])
      or private.numero_do_rascunho_invalido(p_dados -> 'custos_fixos_mensais_centavos', maximo_centavos)
      or private.numero_do_rascunho_invalido(p_dados -> 'horas_faturaveis_mes', 99999, 2)
      or jsonb_typeof(contas) is distinct from 'array'
      or jsonb_array_length(contas) > 50
      or exists (
        select 1 from jsonb_array_elements(contas) as c (v)
        where private.chaves_do_rascunho_invalidas(c.v, array['descricao', 'valor_centavos'])
           or private.texto_do_rascunho_invalido(c.v -> 'descricao', 120, true)
           or private.numero_do_rascunho_invalido(c.v -> 'valor_centavos', maximo_centavos)));
  end if;

  if p_etapa = 3 then
    horas_venda := p_dados -> 'horas_venda';
    return not (
      private.chaves_do_rascunho_invalidas(p_dados, array[
        'horas_venda', 'valor_visita_centavos', 'custo_km_centavos', 'deslocamento_modo',
        'consumo_km_por_litro', 'preco_combustivel_centavos', 'acrescimo_km_centavos'])
      or private.numero_do_rascunho_invalido(p_dados -> 'valor_visita_centavos', maximo_centavos)
      or private.numero_do_rascunho_invalido(p_dados -> 'custo_km_centavos', maximo_centavos)
      -- Deslocamento: modo "visita" ou "km" (nulo em rascunho antigo); consumo de 0,01 a 999,99
      -- km/l e preço do litro andam juntos (os dois ou nenhum); acréscimo opcional.
      or (coalesce(p_dados -> 'deslocamento_modo', 'null'::jsonb) <> 'null'::jsonb
          and (jsonb_typeof(p_dados -> 'deslocamento_modo') <> 'string'
               or p_dados ->> 'deslocamento_modo' not in ('visita', 'km')))
      or private.numero_do_rascunho_invalido(p_dados -> 'consumo_km_por_litro', 999.99, 2)
      or (jsonb_typeof(p_dados -> 'consumo_km_por_litro') = 'number'
          and (p_dados ->> 'consumo_km_por_litro')::numeric = 0)
      or private.numero_do_rascunho_invalido(p_dados -> 'preco_combustivel_centavos', maximo_centavos)
      or private.numero_do_rascunho_invalido(p_dados -> 'acrescimo_km_centavos', maximo_centavos)
      or (coalesce(p_dados -> 'consumo_km_por_litro', 'null'::jsonb) = 'null'::jsonb)
         <> (coalesce(p_dados -> 'preco_combustivel_centavos', 'null'::jsonb) = 'null'::jsonb)
      or jsonb_typeof(horas_venda) is distinct from 'array'
      or jsonb_array_length(horas_venda) > 100
      or exists (
        select 1 from jsonb_array_elements(horas_venda) as h (v)
        where private.chaves_do_rascunho_invalidas(h.v, array[
                'id', 'profissao', 'atividade', 'valor_centavos', 'fonte', 'unidade',
                'minutos_por_unidade', 'minimo_centavos', 'faixas'])
           or private.texto_do_rascunho_invalido(h.v -> 'id', 64, true)
           -- Profissão obrigatória só na hora de profissional; no serviço é o "Quem faz", opcional.
           or private.texto_do_rascunho_invalido(h.v -> 'profissao', 80, h.v ->> 'unidade' = 'hora')
           or private.texto_do_rascunho_invalido(h.v -> 'atividade', 80, true)
           or private.texto_do_rascunho_invalido(h.v -> 'fonte', 200, false)
           -- Preço digitado é obrigatório na linha (0 só se a pessoa digitar 0).
           or h.v -> 'valor_centavos' is null or h.v -> 'valor_centavos' = 'null'::jsonb
           or private.numero_do_rascunho_invalido(h.v -> 'valor_centavos', maximo_centavos)
           or coalesce(h.v ->> 'unidade', '') not in ('hora', 'm2', 'ha', 'diaria', 'campanha', 'pacote')
           or private.numero_do_rascunho_invalido(h.v -> 'minutos_por_unidade', 999999)
           or private.numero_do_rascunho_invalido(h.v -> 'minimo_centavos', maximo_centavos)
           or (h.v ->> 'unidade' = 'pacote' and h.v -> 'minimo_centavos' is not null
               and h.v -> 'minimo_centavos' <> 'null'::jsonb)
           or private.faixas_invalidas(h.v -> 'faixas', h.v ->> 'unidade'))
      or (select count(distinct h.v ->> 'id') from jsonb_array_elements(horas_venda) as h (v))
         <> jsonb_array_length(horas_venda)
      or (select count(distinct lower(btrim(coalesce(h.v ->> 'profissao', ''))) || '|' || lower(btrim(h.v ->> 'atividade')))
          from jsonb_array_elements(horas_venda) as h (v)) <> jsonb_array_length(horas_venda));
  end if;

  if p_etapa = 4 then
    return not (
      private.chaves_do_rascunho_invalidas(p_dados, array[
        'tributos_pb', 'taxas_pb', 'taxa_por_cobranca_centavos', 'taxa_por_assinatura_centavos',
        'margem_desejada_pb', 'margem_minima_pb', 'margens_confirmadas'])
      or private.numero_do_rascunho_invalido(p_dados -> 'tributos_pb', 10000)
      or private.numero_do_rascunho_invalido(p_dados -> 'taxas_pb', 10000)
      or private.numero_do_rascunho_invalido(p_dados -> 'margem_desejada_pb', 10000)
      or private.numero_do_rascunho_invalido(p_dados -> 'margem_minima_pb', 10000)
      or private.numero_do_rascunho_invalido(p_dados -> 'taxa_por_cobranca_centavos', maximo_centavos)
      or private.numero_do_rascunho_invalido(p_dados -> 'taxa_por_assinatura_centavos', maximo_centavos)
      or jsonb_typeof(p_dados -> 'margens_confirmadas') is distinct from 'boolean');
  end if;

  -- Passo 5: os dados da proposta vão pela RPC da identidade; aqui só se marca o progresso.
  if p_etapa = 5 then
    return p_dados = '{}'::jsonb;
  end if;

  return false;
end;
$$;

-- A publicação leva o deslocamento para a base (o banco deriva o km).
create or replace function public.publicar_configuracao_orcamento(p_consultoria_id uuid, p_row_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  autor uuid := private.gestao_da_consultoria(p_consultoria_id);
  r public.orcamento_configuracao_rascunho%rowtype;
  b public.orcamento_base_custos%rowtype;
  versao_da_base integer := 0;
  p1 jsonb;
  p2 jsonb;
  p3 jsonb;
  p4 jsonb;
  manual boolean;
  versao_nova integer;
begin
  -- Ordem fixa das travas: rascunho, depois base.
  select * into r from public.orcamento_configuracao_rascunho as x
  where x.consultoria_id = p_consultoria_id
  for update;
  if not found or p_row_version is null or r.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  select * into b from public.orcamento_base_custos as x
  where x.consultoria_id = p_consultoria_id
  for update;
  if found then
    versao_da_base := b.row_version;
  end if;
  if versao_da_base <> r.base_row_version then
    raise exception 'base_alterada' using errcode = 'P0001';
  end if;
  if cardinality(private.pendencias_da_configuracao(r.dados)) > 0 then
    raise exception 'configuracao_incompleta' using errcode = '22023';
  end if;

  p1 := r.dados -> 'passo_1';
  p2 := r.dados -> 'passo_2';
  p3 := r.dados -> 'passo_3';
  p4 := r.dados -> 'passo_4';
  manual := p1 ->> 'modo' = 'manual';

  perform set_config('grama.versao_base_configuracao', r.base_row_version::text, true);
  perform public.salvar_base_de_custos(
    p_consultoria_id,
    -- Com equipe, hora técnica e horas faturáveis são derivadas dela (regra de sempre).
    case when manual then (p1 ->> 'hora_tecnica_centavos')::bigint end,
    (p2 ->> 'custos_fixos_mensais_centavos')::bigint,
    case when manual then (p2 ->> 'horas_faturaveis_mes')::numeric end,
    (p4 ->> 'margem_desejada_pb')::integer,
    (p4 ->> 'margem_minima_pb')::integer,
    (p4 ->> 'tributos_pb')::integer,
    (p4 ->> 'taxas_pb')::integer,
    (p4 ->> 'taxa_por_cobranca_centavos')::bigint,
    (p4 ->> 'taxa_por_assinatura_centavos')::bigint,
    case when manual then '[]'::jsonb else p1 -> 'equipe' end,
    p2 -> 'contas',
    -- Visita e km são opcionais: sem valor, ficam 0, que Custos e taxas e o orçamento já mostram
    -- como "não cadastrado" (campo em branco e "Cadastrar o valor da visita e do km").
    coalesce((p3 ->> 'valor_visita_centavos')::bigint, 0),
    -- Com modo ou combustível, o banco deriva o km; o enviado só vale em rascunho antigo.
    coalesce((p3 ->> 'custo_km_centavos')::bigint, 0),
    p3 -> 'horas_venda',
    -- O piso por hora não é editado aqui: fica o da base.
    coalesce(b.piso_hora_centavos, 0),
    p3 ->> 'deslocamento_modo',
    (p3 ->> 'consumo_km_por_litro')::numeric,
    (p3 ->> 'preco_combustivel_centavos')::bigint,
    (p3 ->> 'acrescimo_km_centavos')::bigint);
  perform set_config('grama.versao_base_configuracao', '', true);

  select x.row_version into versao_nova
  from public.orcamento_base_custos as x where x.consultoria_id = p_consultoria_id;
  delete from public.orcamento_configuracao_rascunho as x where x.id = r.id;
  return versao_nova;
end;
$$;

-- Leitura da base com o deslocamento.
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
    'deslocamento_modo', b.deslocamento_modo,
    'consumo_km_por_litro', b.consumo_km_por_litro,
    'preco_combustivel_centavos', b.preco_combustivel_centavos,
    'acrescimo_km_centavos', b.acrescimo_km_centavos,
    'horas_venda', b.horas_venda,
    'custo_hora_profissao', b.custo_hora_profissao,
    'piso_hora_centavos', b.piso_hora_centavos,
    'custo_hora_membro', b.custo_hora_membro,
    'atualizado_em', b.atualizado_em,
    'row_version', b.row_version,
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

-- ---------------------------------------------------------------------------
-- Orçamento: a cópia da base leva o modo e só o valor que vale nele.
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
      -- Só o valor do modo entra no orçamento; o outro vai 0 (precificar_orcamento soma os dois).
      base_valor_visita_centavos = d.visita,
      base_custo_km_centavos = d.km,
      base_deslocamento_modo = d.modo,
      base_custos_fixos_mensais_centavos = b.custos_fixos_mensais_centavos,
      base_custos_fixos_equipe_centavos = b.custos_fixos_equipe_centavos,
      base_custos_fixos_detalhe = b.custos_fixos_detalhe,
      base_horas_venda = b.horas_venda,
      base_custo_hora_profissao = b.custo_hora_profissao,
      base_custo_hora_membro = b.custo_hora_membro,
      base_registrada_em = now()
  from public.orcamento_base_custos as b
  -- Base antiga sem modo: "km" quando só o km tem valor; senão "visita" (modoDeDeslocamento).
  cross join lateral (
    select coalesce(b.deslocamento_modo,
                    case when b.custo_km_centavos > 0 and b.valor_visita_centavos = 0
                         then 'km' else 'visita' end) as modo
  ) as m
  cross join lateral (
    select m.modo,
           case when m.modo = 'km' then 0 else b.valor_visita_centavos end as visita,
           case when m.modo = 'visita' then 0 else b.custo_km_centavos end as km
  ) as d
  where o.id = p_orcamento_id
    and b.consultoria_id = o.consultoria_id
    -- Só grava (e audita) quando a base mudou desde a última cópia.
    and (o.base_hora_tecnica_centavos, o.base_custo_fixo_hora_centavos, o.base_margem_desejada_pb,
         o.base_margem_minima_pb, o.base_tributos_pb, o.base_taxas_pb,
         o.base_taxa_por_cobranca_centavos, o.base_taxa_por_assinatura_centavos,
         o.base_valor_visita_centavos, o.base_custo_km_centavos, o.base_custos_fixos_mensais_centavos,
         o.base_custos_fixos_equipe_centavos, o.base_custos_fixos_detalhe, o.base_horas_venda,
         o.base_custo_hora_profissao, o.base_custo_hora_membro, o.base_deslocamento_modo)
        is distinct from
        (b.hora_tecnica_centavos,
         round((b.custos_fixos_mensais_centavos + b.custos_fixos_equipe_centavos) / b.horas_faturaveis_mes)::bigint,
         b.margem_desejada_pb, b.margem_minima_pb, b.tributos_pb, b.taxas_pb,
         b.taxa_por_cobranca_centavos, b.taxa_por_assinatura_centavos,
         d.visita, d.km, b.custos_fixos_mensais_centavos,
         b.custos_fixos_equipe_centavos, b.custos_fixos_detalhe, b.horas_venda, b.custo_hora_profissao,
         b.custo_hora_membro, d.modo);
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
      -- Nulo: orçamento copiado antes da escolha; soma visita e km, como na época.
      'deslocamento_modo', o.base_deslocamento_modo,
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
