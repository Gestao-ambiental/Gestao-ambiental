-- Acréscimo sobre trabalho e contas; despesas sem acréscimo.
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
  extras numeric;
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
    select coalesce(sum(i.custo_direto_extra_centavos), 0) into extras
    from public.orcamento_item as i where i.orcamento_id = p_id;
    acrescimo := round((total - extras) * coalesce(o.margem_pb, o.base_margem_desejada_pb) / 10000);
    preco := round(((total + despesas + fixos + acrescimo) * 10000
                    + valor_visitas * (o.base_tributos_pb + o.base_taxas_pb))
                   / (10000 - o.base_tributos_pb - o.base_taxas_pb))::bigint;

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

revoke all on function private.precificar_orcamento(uuid) from public, anon, authenticated;
