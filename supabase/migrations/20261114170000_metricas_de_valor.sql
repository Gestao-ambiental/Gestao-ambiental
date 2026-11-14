-- Métricas de valor, etapa 1 (central administrativa; protótipo para revisão).
-- Só números que já saem do banco: nada de tabela nova nem captação nova. Por mês (os últimos
-- p_meses fechados + o mês atual), no fuso de cada consultoria, de uma consultoria ou do total.
-- Só operador com dois fatores (private.exigir_operador); devolve só contagens e médias, nunca
-- conteúdo (nome de licença, texto, cliente).
--
-- Regras iguais às de packages/domain/src/metricas-de-valor.ts:
--   dias úteis   private.dias_uteis_entre = diasUteisEntre (feriados nacionais, como planos.ts)
--   urgência     no prazo com 3 dias úteis de folga ou menos (DIAS_UTEIS_DE_URGENCIA)
--   não planejada criada com o prazo a 5 dias úteis ou menos (DIAS_UTEIS_DE_NAO_PLANEJADA)
--   renovação    protocolada 120 dias ou mais antes do vencimento (DIAS_DE_RENOVACAO_PROTEGIDA)
--
-- Escolhas do protótipo (a revisar):
--   * Prazo oficial = prazo_oficial_atual (o mesmo da visão da equipe). Na "não planejada", o prazo
--     da criação: prazo_oficial_original.
--   * Conclusão = concluida_em no fuso da consultoria. Entrega no prazo: conclusão <= prazo.
--   * Denominador de "no prazo" e "antes da meta": prazo (ou meta) no mês, já concluída ou já
--     vencida (prazo < hoje). Prazo futuro ainda aberto não conta, para o mês atual não começar
--     em zero.
--   * Atrasada: prazo no mês, já vencido, sem conclusão até o prazo. Dias de atraso (corridos,
--     como na visão da equipe): até a conclusão, ou até hoje se segue aberta.
--   * Renovação: só LAO ativa (é quem tem plano_renovacao), pelo mês do vencimento.
--   * Carga: ocorrências com responsável e prazo no mês; célula = (responsável, semana ISO do
--     prazo). Devolve pico, entregas e células (responsáveis × semanas que tocam o mês).
--   * Orçamentos fora da lixeira. Envio = primeira mudança para "enviada"; decisão = última mudança
--     para a situação atual, quando a atual é aprovada ou recusada. Dias corridos, no fuso.
--     Preço "pelos custos": com base de custos e nenhum serviço com preço digitado; "digitado":
--     algum serviço com preço digitado (hora_venda_id nulo e preco_fechado_centavos preenchido).
--   * Condicionantes ativas (obrigação aceita de licença ativa) com responsável: retrato de agora,
--     só na linha do mês atual (não há histórico do responsável fora da auditoria).

-- ---------------------------------------------------------------------------
-- Regras (as mesmas do domínio)
-- ---------------------------------------------------------------------------

-- Dias úteis depois de `de` até `ate`, inclusive; negativo quando `ate` vem antes.
create function private.dias_uteis_entre(de date, ate date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when ate >= de then
      (select count(*)::integer from generate_series(de + 1, ate, interval '1 day') as g (dia)
       where private.eh_dia_util_nacional(g.dia::date))
    else
      -(select count(*)::integer from generate_series(ate + 1, de, interval '1 day') as g (dia)
        where private.eh_dia_util_nacional(g.dia::date))
  end
$$;

-- Urgência: concluída no prazo com 3 dias úteis de folga ou menos.
create function private.eh_urgencia(conclusao date, prazo date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select conclusao <= prazo and private.dias_uteis_entre(conclusao, prazo) <= 3
$$;

-- Não planejada: prazo a 5 dias úteis ou menos da criação. Mais de 14 dias corridos sempre passa
-- de 5 dias úteis (no máximo 3 feriados nacionais cabem em 15 dias): evita contar dias à toa.
create function private.eh_nao_planejada(criacao date, prazo date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select prazo <= criacao or (prazo - criacao <= 14 and private.dias_uteis_entre(criacao, prazo) <= 5)
$$;

-- Renovação protegida: protocolada 120 dias corridos ou mais antes do vencimento.
create function private.renovacao_protegida(validade date, protocolado_em date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select protocolado_em is not null and validade - protocolado_em >= 120
$$;

revoke all on function private.dias_uteis_entre(date, date) from public, anon, authenticated;
revoke all on function private.eh_urgencia(date, date) from public, anon, authenticated;
revoke all on function private.eh_nao_planejada(date, date) from public, anon, authenticated;
revoke all on function private.renovacao_protegida(date, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cálculo num instante (interno). A RPC passa now(); os testes passam um instante fixo.
-- p_consultoria_id nulo = todas as consultorias somadas.
-- ---------------------------------------------------------------------------
create function private.metricas_de_valor_em(
  p_consultoria_id uuid,
  p_meses integer,
  p_agora timestamptz
)
returns table (
  mes date,
  prazo_previstas bigint,
  prazo_cumpridas bigint,
  antecedencia_media numeric,
  urgencias bigint,
  meta_previstas bigint,
  meta_cumpridas bigint,
  criadas bigint,
  nao_planejadas bigint,
  atrasadas bigint,
  dias_de_atraso bigint,
  renovacoes_vencendo bigint,
  renovacoes_protegidas bigint,
  carga_entregas bigint,
  carga_pico bigint,
  carga_celulas bigint,
  orcamentos_enviados bigint,
  dias_ate_envio numeric,
  orcamentos_decididos bigint,
  orcamentos_aprovados bigint,
  dias_ate_decisao numeric,
  ticket_medio_aprovado_centavos bigint,
  orcamentos_criados bigint,
  orcamentos_pelos_custos bigint,
  orcamentos_preco_digitado bigint,
  concluidas bigint,
  concluidas_com_evidencia bigint,
  condicionantes_ativas bigint,
  condicionantes_com_responsavel bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  meses integer := least(greatest(coalesce(p_meses, 6), 0), 24);
  fuso_ref text;
  mes_atual date;
  inicio date;
begin
  -- Os meses da tabela seguem o fuso da consultoria escolhida (ou o do piloto, no total). Cada
  -- registro cai no mês do fuso da própria consultoria.
  select c.fuso into fuso_ref from public.consultoria as c where c.id = p_consultoria_id;
  mes_atual := date_trunc('month', (p_agora at time zone coalesce(fuso_ref, 'America/Sao_Paulo')))::date;
  inicio := (mes_atual - make_interval(months => meses))::date;

  return query
  with
  cons as (
    select c.id, c.fuso, (p_agora at time zone c.fuso)::date as hoje
    from public.consultoria as c
    where p_consultoria_id is null or c.id = p_consultoria_id
  ),
  lista as (
    select (mes_atual - make_interval(months => n))::date as mes
    from generate_series(0, meses) as n
  ),
  oc as (
    select
      o.responsavel_id,
      o.prazo_oficial_atual as prazo,
      o.prazo_oficial_original as prazo_criacao,
      o.meta_interna as meta,
      (o.criado_em at time zone c.fuso)::date as criada,
      case when o.situacao = 'concluida' then (o.concluida_em at time zone c.fuso)::date end as concluida,
      exists (select 1 from public.evidencia as e
              where e.consultoria_id = o.consultoria_id and e.ocorrencia_id = o.id) as com_evidencia,
      c.hoje
    from public.ocorrencia as o
    join cons as c on c.id = o.consultoria_id
  ),
  por_prazo as (
    select
      date_trunc('month', x.prazo)::date as mes,
      count(*) filter (where x.concluida is not null or x.prazo < x.hoje) as previstas,
      count(*) filter (where x.concluida <= x.prazo) as cumpridas,
      round(avg(private.dias_uteis_entre(x.concluida, x.prazo)) filter (where x.concluida <= x.prazo), 1)
        as antecedencia,
      count(*) filter (where private.eh_urgencia(x.concluida, x.prazo)) as urgencias,
      count(*) filter (where x.prazo < x.hoje and (x.concluida is null or x.concluida > x.prazo))
        as atrasadas,
      coalesce(sum(coalesce(x.concluida, x.hoje) - x.prazo)
        filter (where x.prazo < x.hoje and (x.concluida is null or x.concluida > x.prazo)), 0)::bigint
        as dias_atraso
    from oc as x
    where x.prazo >= inicio
    group by 1
  ),
  por_meta as (
    select
      date_trunc('month', x.meta)::date as mes,
      count(*) filter (where x.concluida is not null or x.meta < x.hoje) as previstas,
      count(*) filter (where x.concluida <= x.meta) as cumpridas
    from oc as x
    where x.meta >= inicio
    group by 1
  ),
  por_criacao as (
    select
      date_trunc('month', x.criada)::date as mes,
      count(*) as criadas,
      count(*) filter (where private.eh_nao_planejada(x.criada, x.prazo_criacao)) as nao_planejadas
    from oc as x
    where x.criada >= inicio
    group by 1
  ),
  por_conclusao as (
    select
      date_trunc('month', x.concluida)::date as mes,
      count(*) as concluidas,
      count(*) filter (where x.com_evidencia) as com_evidencia
    from oc as x
    where x.concluida >= inicio
    group by 1
  ),
  semanas as (
    select l.mes,
           (select count(distinct date_trunc('week', g.dia))
            from generate_series(l.mes, (l.mes + interval '1 month' - interval '1 day'), interval '1 day')
              as g (dia)) as quantas
    from lista as l
  ),
  celulas as (
    select date_trunc('month', x.prazo)::date as mes, x.responsavel_id,
           date_trunc('week', x.prazo) as semana, count(*) as entregas
    from oc as x
    where x.responsavel_id is not null and x.prazo >= inicio
    group by 1, 2, 3
  ),
  carga as (
    select k.mes, sum(k.entregas)::bigint as entregas, max(k.entregas) as pico,
           count(distinct k.responsavel_id) * s.quantas as celulas
    from celulas as k
    join semanas as s on s.mes = k.mes
    group by k.mes, s.quantas
  ),
  renovacoes as (
    select
      date_trunc('month', i.validade)::date as mes,
      count(*) as vencendo,
      count(*) filter (where private.renovacao_protegida(i.validade, p.protocolado_em)) as protegidas
    from public.instrumento as i
    join cons as c on c.id = i.consultoria_id
    join public.plano_renovacao as p on p.consultoria_id = i.consultoria_id and p.instrumento_id = i.id
    where i.situacao = 'ativo' and i.validade >= inicio
    group by 1
  ),
  orc as (
    select
      o.situacao,
      (o.criado_em at time zone c.fuso)::date as criado,
      (envio.em at time zone c.fuso)::date as enviado,
      (decisao.em at time zone c.fuso)::date as decidido,
      case when o.situacao = 'aprovada' then private.total_do_orcamento(o) end as total_aprovado,
      exists (select 1 from public.orcamento_item as i
              where i.consultoria_id = o.consultoria_id and i.orcamento_id = o.id) as tem_itens,
      exists (select 1 from public.orcamento_item as i
              where i.consultoria_id = o.consultoria_id and i.orcamento_id = o.id
                and i.hora_venda_id is null and i.preco_fechado_centavos is not null) as digitado,
      o.base_registrada_em is not null as com_base
    from public.orcamento as o
    join cons as c on c.id = o.consultoria_id
    left join lateral (
      select min(s.em) as em from public.orcamento_situacao as s
      where s.consultoria_id = o.consultoria_id and s.orcamento_id = o.id and s.para = 'enviada'
    ) as envio on true
    left join lateral (
      select max(s.em) as em from public.orcamento_situacao as s
      where s.consultoria_id = o.consultoria_id and s.orcamento_id = o.id and s.para = o.situacao
        and o.situacao in ('aprovada', 'recusada')
    ) as decisao on true
    where o.excluido_em is null
  ),
  por_envio as (
    select date_trunc('month', x.enviado)::date as mes, count(*) as enviados,
           round(avg(x.enviado - x.criado), 1) as dias
    from orc as x
    where x.enviado >= inicio
    group by 1
  ),
  por_decisao as (
    select date_trunc('month', x.decidido)::date as mes,
           count(*) as decididos,
           count(*) filter (where x.situacao = 'aprovada') as aprovados,
           round(avg(x.decidido - x.enviado) filter (where x.enviado <= x.decidido), 1) as dias,
           round(avg(x.total_aprovado))::bigint as ticket
    from orc as x
    where x.decidido >= inicio
    group by 1
  ),
  por_criacao_orc as (
    select date_trunc('month', x.criado)::date as mes,
           count(*) filter (where x.tem_itens) as criados,
           count(*) filter (where x.tem_itens and x.com_base and not x.digitado) as pelos_custos,
           count(*) filter (where x.digitado) as digitados
    from orc as x
    where x.criado >= inicio
    group by 1
  ),
  condicionantes as (
    select count(*) as ativas, count(*) filter (where cd.responsavel_id is not null) as com_responsavel
    from public.condicionante as cd
    join cons as c on c.id = cd.consultoria_id
    join public.instrumento as i on i.consultoria_id = cd.consultoria_id and i.id = cd.instrumento_id
    join public.condicionante_versao as v
      on v.consultoria_id = cd.consultoria_id and v.id = cd.versao_vigente_id
    where i.situacao = 'ativo' and cd.revisao = 'aceita' and v.natureza = 'obrigacao'
  )
  select
    l.mes,
    coalesce(pp.previstas, 0),
    coalesce(pp.cumpridas, 0),
    pp.antecedencia,
    coalesce(pp.urgencias, 0),
    coalesce(pm.previstas, 0),
    coalesce(pm.cumpridas, 0),
    coalesce(pc.criadas, 0),
    coalesce(pc.nao_planejadas, 0),
    coalesce(pp.atrasadas, 0),
    coalesce(pp.dias_atraso, 0),
    coalesce(r.vencendo, 0),
    coalesce(r.protegidas, 0),
    coalesce(k.entregas, 0),
    coalesce(k.pico, 0),
    coalesce(k.celulas, 0),
    coalesce(pe.enviados, 0),
    pe.dias,
    coalesce(pd.decididos, 0),
    coalesce(pd.aprovados, 0),
    pd.dias,
    pd.ticket,
    coalesce(po.criados, 0),
    coalesce(po.pelos_custos, 0),
    coalesce(po.digitados, 0),
    coalesce(pq.concluidas, 0),
    coalesce(pq.com_evidencia, 0),
    case when l.mes = mes_atual then cd.ativas end,
    case when l.mes = mes_atual then cd.com_responsavel end
  from lista as l
  cross join condicionantes as cd
  left join por_prazo as pp on pp.mes = l.mes
  left join por_meta as pm on pm.mes = l.mes
  left join por_criacao as pc on pc.mes = l.mes
  left join por_conclusao as pq on pq.mes = l.mes
  left join carga as k on k.mes = l.mes
  left join renovacoes as r on r.mes = l.mes
  left join por_envio as pe on pe.mes = l.mes
  left join por_decisao as pd on pd.mes = l.mes
  left join por_criacao_orc as po on po.mes = l.mes
  order by l.mes desc;
end;
$$;

revoke all on function private.metricas_de_valor_em(uuid, integer, timestamptz)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC da central: operador com dois fatores. Mês atual primeiro.
-- ---------------------------------------------------------------------------
create function public.central_metricas_de_valor(
  p_consultoria_id uuid default null,
  p_meses integer default 6
)
returns table (
  mes date,
  prazo_previstas bigint,
  prazo_cumpridas bigint,
  antecedencia_media numeric,
  urgencias bigint,
  meta_previstas bigint,
  meta_cumpridas bigint,
  criadas bigint,
  nao_planejadas bigint,
  atrasadas bigint,
  dias_de_atraso bigint,
  renovacoes_vencendo bigint,
  renovacoes_protegidas bigint,
  carga_entregas bigint,
  carga_pico bigint,
  carga_celulas bigint,
  orcamentos_enviados bigint,
  dias_ate_envio numeric,
  orcamentos_decididos bigint,
  orcamentos_aprovados bigint,
  dias_ate_decisao numeric,
  ticket_medio_aprovado_centavos bigint,
  orcamentos_criados bigint,
  orcamentos_pelos_custos bigint,
  orcamentos_preco_digitado bigint,
  concluidas bigint,
  concluidas_com_evidencia bigint,
  condicionantes_ativas bigint,
  condicionantes_com_responsavel bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_operador();

  return query select * from private.metricas_de_valor_em(p_consultoria_id, p_meses, now());
end;
$$;

revoke all on function public.central_metricas_de_valor(uuid, integer) from public, anon;
grant execute on function public.central_metricas_de_valor(uuid, integer) to authenticated;
