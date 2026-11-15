-- Visita técnica com preço fixo, sem margem (decisão do Eduardo em 12/11/2026, na simulação da
-- Envora). Antes, a visita entrava no custo e recebia a margem: com margem alta, R$ 250 de visita
-- viravam R$ 1.182 na proposta. Agora:
--   preço dos serviços = (custo dos itens + despesas incluídas + taxas fixas) ÷ (1 − margem − tributos − taxas)
--   preço das visitas  = visitas × (valor da visita + km × valor do km + outros gastos)  (sem margem)
--   preço total        = serviços + visitas
-- A repartição entre os itens usa só o custo deles. Igual a precificarOrcamento (packages/domain).

comment on column public.orcamento_base_custos.valor_visita_centavos is
  'Preço cobrado por visita técnica. Entra no orçamento por visita, sem margem.';
comment on column public.orcamento_base_custos.custo_km_centavos is
  'Valor cobrado por km rodado (ida e volta), quando a visita é longe. Sem margem.';
comment on column public.orcamento.preco_visitas_centavos is
  'Derivado (private.precificar_orcamento): preço fixo das visitas, sem margem.';

create or replace function private.precificar_orcamento(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  o public.orcamento%rowtype;
  divisor numeric;
  valor_visitas bigint;
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
  -- Visitas: preço fixo, sem margem.
  valor_visitas := o.visitas * (o.base_valor_visita_centavos + o.km_por_visita * o.base_custo_km_centavos
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

  -- Preço dos serviços: a margem vale só para eles.
  preco := round((custo_itens + despesas + fixos)::numeric * 10000 / divisor)::bigint;
  if preco + valor_visitas > 99999999999 then
    raise exception 'preco_invalido' using errcode = '22023';
  end if;

  with linhas as (
    select i.id, i.ordem::bigint as posicao,
           (round(i.minutos::numeric * o.base_hora_tecnica_centavos / 60)
            + i.custo_direto_extra_centavos
            + round(i.minutos::numeric * o.base_custo_fixo_hora_centavos / 60)) as peso
    from public.orcamento_item as i
    where i.orcamento_id = p_id
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
  set preco_visitas_centavos = valor_visitas
  where x.id = p_id
    and x.preco_visitas_centavos <> valor_visitas;
end;
$$;
