-- Orçamento rápido (ADR-0023; regras do Eduardo de 14/11/2026):
-- 1. Preço digitado: item sem linha da tabela (hora_venda_id nulo) com preco_fechado_centavos vale
--    como preço fechado, igual ao pacote: sem acréscimo; tributos e taxas percentuais da base (quando
--    há base) incidem como no pacote. As horas do item seguem valendo para custo e carga.
-- 2. Sem base (base_registrada_em nulo): preço = soma dos preços digitados + despesas incluídas
--    (repartidas pelos itens na proporção do preço, por maior resto) + visitas × valor de cada visita
--    (outros_por_visita_centavos; sem km). Sem tributo, taxa nem margem. Item ligado à tabela ou sem
--    preço digitado e despesa incluída a cotar deixam o preço pendente.
-- 3. Modelo salvo guarda o preço digitado do item (preco_digitado_centavos); os demais preços
--    continuam fora do modelo.
-- Regra pura em packages/domain (precificarOrcamento), com os mesmos centavos. Sem mudança de tabela
-- nem de permissão: as funções mudam no lugar e mantêm as mesmas concessões.

comment on column public.orcamento_item.preco_fechado_centavos is
  'Preço fechado do pacote ou, sem linha da tabela (hora_venda_id nulo), o preço digitado do serviço. '
  'Não recebe acréscimo. Nulo nas outras unidades.';

comment on column public.orcamento_modelo.itens is
  '[{descricao, minutos, hora_venda_id, unidade, preco_digitado_centavos?}]: a linha da tabela de '
  'preços vale a do momento de aplicar; o preço digitado (item sem linha) vai junto.';

-- Itens com custo, preço base, venda, se é preço fixo e o rateio das contas de cada um. Novo: o
-- preço digitado (sem linha da tabela) é venda fixa, como o pacote.
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
              when i.hora_venda_id is null or hv.unidade = 'pacote' then v.venda
              else v.venda + i.custo_direto_extra_centavos end,
         v.venda,
         i.hora_venda_id is null or coalesce(hv.unidade = 'pacote', false),
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
    select case when i.hora_venda_id is null then i.preco_fechado_centavos::numeric
                when hv.valor is null then null
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

-- Preço pendente: sem base, só passam itens com preço digitado; com base, cada item precisa de uma
-- linha da tabela que exista na base copiada ou do preço digitado.
create or replace function private.preco_pendente(o public.orcamento)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not exists (
        select 1 from public.orcamento_item as i
        where i.consultoria_id = o.consultoria_id and i.orcamento_id = o.id)
      or exists (
        select 1 from public.orcamento_despesa as d
        where d.consultoria_id = o.consultoria_id and d.orcamento_id = o.id
          and d.tratamento = 'incluida' and d.estimativa_centavos is null)
      -- Sem base (orçamento rápido): todo item com preço digitado e sem linha da tabela.
      or (o.base_registrada_em is null and exists (
        select 1 from public.orcamento_item as i
        where i.consultoria_id = o.consultoria_id and i.orcamento_id = o.id
          and (i.hora_venda_id is not null or i.preco_fechado_centavos is null)))
      or (o.base_registrada_em is not null and o.forma_preco = 'margem'
          and coalesce(o.margem_pb, o.base_margem_desejada_pb, 0) + coalesce(o.base_tributos_pb, 0)
              + coalesce(o.base_taxas_pb, 0) >= 10000)
      or (o.base_registrada_em is not null and exists (
        select 1 from public.orcamento_item as i
        where i.consultoria_id = o.consultoria_id and i.orcamento_id = o.id
          and not (i.hora_venda_id is null and i.preco_fechado_centavos is not null)
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

revoke all on function private.preco_pendente(public.orcamento) from public, anon, authenticated;
-- A lista chama preco_pendente com a RLS de quem lê (como antes).
grant execute on function private.preco_pendente(public.orcamento) to authenticated;

-- Preço do orçamento. Mudou só o valor das visitas: sem base, visitas × valor de cada visita (o
-- valor e o km da base valem zero). Sem base todo item é fixo, então cai na repartição das despesas
-- pelo preço de cada item (a mesma do "só pacotes"), sem tributo, taxa nem acréscimo.
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

  valor_visitas := o.visitas * (coalesce(o.base_valor_visita_centavos, 0)
                                + o.km_por_visita * coalesce(o.base_custo_km_centavos, 0)
                                + o.outros_por_visita_centavos);
  select coalesce(sum(d.estimativa_centavos), 0)::bigint into despesas
  from public.orcamento_despesa as d
  where d.orcamento_id = p_id and d.tratamento = 'incluida';
  select count(*) * coalesce(o.base_taxa_por_cobranca_centavos, 0)
         + coalesce(o.base_taxa_por_assinatura_centavos, 0) into fixos
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

    -- Pacotes e preços digitados ficam com o preço fechado; o resto se reparte pelo peso
    -- venda + contas + outros.
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

-- Salvar como modelo: igual a antes, mais o preço digitado de cada item sem linha da tabela.
create or replace function public.salvar_modelo_de_orcamento(p_orcamento_id uuid, p_modelo_id uuid, p_nome text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  origem public.orcamento%rowtype;
  autor uuid;
  nome_limpo text := btrim(coalesce(p_nome, ''));
  existente uuid;
begin
  if p_modelo_id is null then
    raise exception 'id_obrigatorio' using errcode = '22023';
  end if;
  select * into origem from public.orcamento as o where o.id = p_orcamento_id;
  if not found or not private.is_gestao(origem.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  autor := private.membro_atual(origem.consultoria_id);
  if autor is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  select m.consultoria_id into existente from public.orcamento_modelo as m where m.id = p_modelo_id;
  if found then
    if existente = origem.consultoria_id then
      return p_modelo_id;
    end if;
    raise exception 'modelo_existente' using errcode = 'P0001';
  end if;

  if origem.excluido_em is not null then
    raise exception 'orcamento_na_lixeira' using errcode = 'P0001';
  end if;
  if length(nome_limpo) not between 1 and 120 then
    raise exception 'nome_invalido' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.orcamento_modelo as m
    where m.consultoria_id = origem.consultoria_id and m.excluido_em is null
      and lower(btrim(m.nome)) = lower(nome_limpo)
  ) then
    raise exception 'modelo_com_mesmo_nome' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.orcamento_item as i
    where i.consultoria_id = origem.consultoria_id and i.orcamento_id = origem.id
  ) then
    raise exception 'modelo_sem_itens' using errcode = '22023';
  end if;

  insert into public.orcamento_modelo (
    id, consultoria_id, nome, objeto, itens, despesas, premissas, exclusoes, orcamento_origem_id, criado_por)
  values (
    p_modelo_id, origem.consultoria_id, nome_limpo, origem.objeto,
    (select jsonb_agg(jsonb_build_object(
              'descricao', i.descricao,
              'minutos', i.minutos,
              'hora_venda_id', i.hora_venda_id,
              'unidade', coalesce(hv.unidade, 'hora'))
            || case when i.hora_venda_id is null and i.preco_fechado_centavos is not null
                    then jsonb_build_object('preco_digitado_centavos', i.preco_fechado_centavos)
                    else '{}'::jsonb end
            order by i.ordem, i.id)
     from public.orcamento_item as i
     left join lateral (
       select h.valor ->> 'unidade' as unidade
       from jsonb_array_elements(coalesce(origem.base_horas_venda, '[]'::jsonb)) as h (valor)
       where h.valor ->> 'id' = i.hora_venda_id
       limit 1
     ) as hv on true
     where i.consultoria_id = origem.consultoria_id and i.orcamento_id = origem.id),
    coalesce((
      select jsonb_agg(jsonb_build_object('descricao', d.descricao, 'tratamento', d.tratamento)
                       order by d.ordem, d.id)
      from public.orcamento_despesa as d
      where d.consultoria_id = origem.consultoria_id and d.orcamento_id = origem.id), '[]'::jsonb),
    origem.premissas, origem.exclusoes, origem.id, autor);

  return p_modelo_id;
end;
$$;

revoke all on function public.salvar_modelo_de_orcamento(uuid, uuid, text) from public, anon;
grant execute on function public.salvar_modelo_de_orcamento(uuid, uuid, text) to authenticated;
