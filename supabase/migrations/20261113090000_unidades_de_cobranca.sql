-- Unidades de cobrança (ADR-0018, fatia 2; decisões do Eduardo de 12/11/2026):
-- 1. A tabela de preços da base (horas_venda) ganha "unidade" (hora, m2, ha, diaria, campanha, pacote)
--    e "minutos_por_unidade" (tempo sugerido, opcional). Linhas antigas valem como hora.
-- 2. O item ganha "quantidade" (numeric(18,4), na unidade da linha) e "preco_fechado_centavos"
--    (pacote). As horas do item (minutos) seguem valendo para custo, rateio e carga.
-- 3. Venda do item: hora = horas × preço; m², ha, diária e campanha = quantidade × preço; pacote =
--    preço fechado. Pela margem, o pacote fica fora do acréscimo (P1); tributos e taxas
--    percentuais cobrem também pacotes e visitas. Só pacotes: preço fechado + despesas repartidas.
-- Regra pura em packages/domain (precificarOrcamento), com os mesmos centavos.

alter table public.orcamento_item
  add column quantidade numeric(18, 4),
  add column preco_fechado_centavos bigint,
  add constraint orcamento_item_quantidade check (quantidade is null or quantidade between 0 and 99999999),
  add constraint orcamento_item_preco_fechado check (
    preco_fechado_centavos is null or preco_fechado_centavos between 0 and 99999999999);

comment on column public.orcamento_item.quantidade is
  'Quantidade na unidade da linha de preço (m², ha, diárias, campanhas). Nula na hora e no pacote.';
comment on column public.orcamento_item.preco_fechado_centavos is
  'Preço fechado do pacote (não recebe acréscimo). Nulo nas outras unidades.';

-- Itens com custo, preço base, venda, se é pacote e o rateio das contas de cada um.
drop function private.itens_do_preco(public.orcamento);

create function private.itens_do_preco(o public.orcamento)
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
           coalesce(h.valor ->> 'unidade', 'hora') as unidade
    from jsonb_array_elements(coalesce(o.base_horas_venda, '[]'::jsonb)) as h (valor)
    where h.valor ->> 'id' = i.hora_venda_id
    limit 1
  ) as hv on true
  left join lateral (
    select case when hv.valor is null then null
                when hv.unidade = 'hora' then round(i.minutos::numeric * hv.valor / 60)
                when hv.unidade = 'pacote' then i.preco_fechado_centavos::numeric
                else round(i.quantidade * hv.valor) end as venda
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
      or (exists (
        select 1 from public.orcamento_item as i
        where i.consultoria_id = o.consultoria_id and i.orcamento_id = o.id
          and not exists (
            select 1 from jsonb_array_elements(coalesce(o.base_horas_venda, '[]'::jsonb)) as h (valor)
            where h.valor ->> 'id' = i.hora_venda_id)))
      -- Fora da hora, o item precisa da quantidade; o pacote, do preço fechado.
      or exists (
        select 1
        from public.orcamento_item as i
        join lateral (
          select coalesce(h.valor ->> 'unidade', 'hora') as unidade
          from jsonb_array_elements(coalesce(o.base_horas_venda, '[]'::jsonb)) as h (valor)
          where h.valor ->> 'id' = i.hora_venda_id
          limit 1
        ) as hv on true
        where i.consultoria_id = o.consultoria_id and i.orcamento_id = o.id
          and ((hv.unidade = 'pacote' and i.preco_fechado_centavos is null)
               or (hv.unidade not in ('hora', 'pacote') and i.quantidade is null)))
$$;

-- Preço do orçamento: pela tabela (ou só pacotes), o preço base de cada item mais as despesas
-- repartidas por maior resto; pela margem, acréscimo sobre a venda e as contas dos itens que não
-- são pacote, com tributos e taxas cobrindo pacotes e visitas. Igual a precificarOrcamento.
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
  base_acrescimo numeric;
  extras numeric;
  fechados numeric;
  acrescimo numeric;
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

  if o.forma_preco = 'tabela'
     or not exists (select 1 from private.itens_do_preco(o) as t where not t.fixo) then
    -- O que se reparte são as despesas incluídas; o peso é o preço base de cada item.
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
    select coalesce(sum(t.venda + t.contas), 0), coalesce(sum(t.pela_hora - t.venda), 0)
      into base_acrescimo, extras
    from private.itens_do_preco(o) as t where not t.fixo;
    select coalesce(sum(t.venda), 0) into fechados
    from private.itens_do_preco(o) as t where t.fixo;
    acrescimo := round(base_acrescimo * coalesce(o.margem_pb, o.base_margem_desejada_pb) / 10000);
    preco := round(((base_acrescimo + extras + despesas + fixos + acrescimo) * 10000
                    + (fechados + valor_visitas) * (o.base_tributos_pb + o.base_taxas_pb))
                   / (10000 - o.base_tributos_pb - o.base_taxas_pb))::bigint;

    -- Pacotes ficam com o preço fechado; o resto se reparte pelo peso venda + contas + outros.
    update public.orcamento_item as i
    set preco_centavos = t.venda::bigint, preco_automatico = true
    from private.itens_do_preco(o) as t
    where t.id = i.id and i.orcamento_id = p_id and t.fixo
      and (i.preco_centavos <> t.venda or not i.preco_automatico);

    with itens as (
      select t.id, t.posicao, t.pela_hora + t.contas as base
      from private.itens_do_preco(o) as t where not t.fixo
    ),
    ajustadas as (
      select t.id, t.posicao,
             case when (select sum(base) from itens) > 0 then t.base else 1 end as peso
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

revoke all on function private.precificar_orcamento(uuid) from public, anon, authenticated;

-- Tabela de preços com unidade e tempo sugerido por unidade.
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

-- Itens com quantidade e preço fechado.
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
       or coalesce(e.valor ->> 'quantidade', '0') !~ '^[0-9]{1,8}([.][0-9]{1,4})?$'
       or coalesce(e.valor ->> 'preco_fechado_centavos', '0') !~ '^[0-9]{1,11}$'
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
    preco_fechado_centavos)
  select (e.valor ->> 'id')::uuid, alvo.consultoria_id, p_id, e.ordem::integer,
         btrim(e.valor ->> 'descricao'),
         coalesce((e.valor ->> 'minutos')::integer, 0),
         true, 0,
         coalesce((e.valor ->> 'custo_direto_extra_centavos')::bigint, 0),
         nullif(btrim(coalesce(e.valor ->> 'hora_venda_id', '')), ''),
         (e.valor ->> 'responsavel_id')::uuid,
         (e.valor ->> 'mes_previsto')::date,
         (e.valor ->> 'quantidade')::numeric(18, 4),
         (e.valor ->> 'preco_fechado_centavos')::bigint
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
      preco_fechado_centavos = excluded.preco_fechado_centavos
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
    'excluido_em', o.excluido_em,
    'row_version', o.row_version,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'descricao', i.descricao, 'minutos', i.minutos,
        'preco_automatico', i.preco_automatico, 'preco_centavos', i.preco_centavos,
        'custo_direto_extra_centavos', i.custo_direto_extra_centavos,
        'hora_venda_id', i.hora_venda_id, 'responsavel_id', i.responsavel_id,
        'mes_previsto', i.mes_previsto, 'quantidade', i.quantidade,
        'preco_fechado_centavos', i.preco_fechado_centavos) order by i.ordem, i.id)
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
