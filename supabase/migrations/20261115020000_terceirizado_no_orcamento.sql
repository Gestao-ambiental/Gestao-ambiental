-- Profissional terceirizado no orçamento (ADR-0031; decisões do Eduardo de 14/11/2026):
-- 1. O "Responsável" de cada serviço pode ser um terceirizado, sem login: nome (obrigatório),
--    profissão (lista fixa do Grama, opcional), cobrança por hora ou valor fechado e o valor. Ele não
--    é membro, então não tem responsável da equipe e não conta na carga.
-- 2. Custo do serviço = valor do terceiro (hora: minutos × valor ÷ 60; fechado: o valor) + outros
--    custos. Sem rateio das contas do mês: a hora não é da equipe.
-- 3. "Pela margem": a venda do serviço é o custo do terceiro, que recebe o acréscimo como as horas de
--    venda (a linha da tabela não é usada). "Pela tabela": o preço continua vindo da tabela (ou do
--    preço digitado); o custo do terceiro só reduz a margem.
-- 4. A proposta não mostra o terceirizado (nem custo, nem responsável), como já era.
-- 5. Valor em branco (ex.: cópia sem os preços) deixa o preço pendente.
-- Regra pura em packages/domain (precificarOrcamento), com os mesmos centavos. Sem tabela nova; as
-- funções mudam no lugar e mantêm as mesmas concessões.

alter table public.orcamento_item
  add column terceiro_nome text,
  add column terceiro_profissao public.profissao_do_membro,
  add column terceiro_cobranca text,
  add column terceiro_valor_centavos bigint;

alter table public.orcamento_item add constraint orcamento_item_terceiro check (
  (terceiro_nome is null and terceiro_profissao is null and terceiro_cobranca is null
   and terceiro_valor_centavos is null)
  or (terceiro_nome is not null and length(btrim(terceiro_nome)) between 1 and 120
      and responsavel_id is null
      and coalesce(terceiro_cobranca, '') in ('hora', 'fechado')
      and coalesce(terceiro_valor_centavos, 0) between 0 and 99999999999));

comment on column public.orcamento_item.terceiro_nome is
  'Profissional terceirizado (sem login) que faz o serviço; nulo = feito pela equipe.';
comment on column public.orcamento_item.terceiro_cobranca is
  'Como o terceirizado cobra: hora (× horas do serviço) ou fechado (valor pelo serviço).';
comment on column public.orcamento_item.terceiro_valor_centavos is
  'Valor por hora ou fechado do terceirizado; nulo = a informar (o preço fica pendente).';

-- Custo, venda e contas de cada item: o terceirizado usa o valor dele.
create or replace function private.itens_do_preco(o public.orcamento)
returns table (id uuid, posicao bigint, custo numeric, pela_hora numeric, venda numeric, fixo boolean,
               contas numeric)
language sql
stable
set search_path = ''
as $$
  select i.id,
         i.ordem::bigint,
         case when i.terceiro_nome is not null
              then t.custo + i.custo_direto_extra_centavos
              else round(i.minutos::numeric * coalesce(cm.hora, cp.hora, o.base_hora_tecnica_centavos) / 60)
                   + i.custo_direto_extra_centavos
                   + round(i.minutos::numeric * o.base_custo_fixo_hora_centavos / 60) end,
         case when (i.terceiro_nome is not null and o.forma_preco = 'margem' and o.base_registrada_em is not null) then t.custo + i.custo_direto_extra_centavos
              when v.venda is null then null
              when i.hora_venda_id is null or hv.unidade = 'pacote' then v.venda
              else v.venda + i.custo_direto_extra_centavos end,
         case when (i.terceiro_nome is not null and o.forma_preco = 'margem' and o.base_registrada_em is not null) then t.custo else v.venda end,
         case when (i.terceiro_nome is not null and o.forma_preco = 'margem' and o.base_registrada_em is not null) then false
              else i.hora_venda_id is null or coalesce(hv.unidade = 'pacote', false) end,
         case when i.terceiro_nome is not null then 0
              else round(i.minutos::numeric * o.base_custo_fixo_hora_centavos / 60) end
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
  left join lateral (
    select case i.terceiro_cobranca when 'hora' then round(i.minutos::numeric * i.terceiro_valor_centavos / 60) else i.terceiro_valor_centavos::numeric end as custo
  ) as t on true
  where i.consultoria_id = o.consultoria_id and i.orcamento_id = o.id
$$;

-- Preço pendente: terceirizado "pela margem" não precisa da linha da tabela; sem valor, pendente.
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
          and not (i.terceiro_nome is not null and o.forma_preco = 'margem' and o.base_registrada_em is not null)
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
          and not (i.terceiro_nome is not null and o.forma_preco = 'margem' and o.base_registrada_em is not null)
          and ((hv.unidade = 'pacote' and i.preco_fechado_centavos is null)
               or (hv.unidade not in ('hora', 'pacote') and i.quantidade is null)))
      -- Terceirizado sem o valor (ex.: cópia sem os preços): o custo do serviço fica pendente.
      or (o.base_registrada_em is not null and exists (
        select 1 from public.orcamento_item as i
        where i.consultoria_id = o.consultoria_id and i.orcamento_id = o.id
          and i.terceiro_nome is not null and i.terceiro_valor_centavos is null))
$$;

-- Salvar: grava o terceirizado do item.
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
  apresentacao_limpa text := nullif(btrim(coalesce(p_dados ->> 'apresentacao', '')), '');
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
  if length(coalesce(apresentacao_limpa, '')) > 4000 then
    raise exception 'texto_longo_demais' using errcode = '22023';
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
       or coalesce(nullif(e.valor ->> 'responsabilidade_tecnica', ''), 'art') not in ('art', 'rrt')
       or length(btrim(coalesce(e.valor ->> 'terceiro_nome', ''))) > 120
       or coalesce(nullif(e.valor ->> 'terceiro_cobranca', ''), 'hora') not in ('hora', 'fechado')
       or coalesce(e.valor ->> 'terceiro_valor_centavos', '0') !~ '^[0-9]{1,11}$'
       or coalesce(e.valor ->> 'terceiro_profissao', '') !~ '^[a-z_]{0,64}$'
       -- Terceirizado não tem responsável da equipe.
       or (btrim(coalesce(e.valor ->> 'terceiro_nome', '')) <> '' and e.valor ->> 'responsavel_id' is not null)
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
    preco_fechado_centavos, responsabilidade_tecnica, terceiro_nome, terceiro_profissao,
    terceiro_cobranca, terceiro_valor_centavos)
  select (e.valor ->> 'id')::uuid, alvo.consultoria_id, p_id, e.ordem::integer,
         btrim(e.valor ->> 'descricao'),
         coalesce((e.valor ->> 'minutos')::integer, 0),
         true, 0,
         coalesce((e.valor ->> 'custo_direto_extra_centavos')::bigint, 0),
         nullif(btrim(coalesce(e.valor ->> 'hora_venda_id', '')), ''),
         (e.valor ->> 'responsavel_id')::uuid,
         (e.valor ->> 'mes_previsto')::date,
         (e.valor ->> 'quantidade')::numeric(18, 4),
         (e.valor ->> 'preco_fechado_centavos')::bigint,
         nullif(e.valor ->> 'responsabilidade_tecnica', ''),
         nullif(btrim(coalesce(e.valor ->> 'terceiro_nome', '')), ''),
         case when btrim(coalesce(e.valor ->> 'terceiro_nome', '')) <> ''
              then nullif(e.valor ->> 'terceiro_profissao', '')::public.profissao_do_membro end,
         case when btrim(coalesce(e.valor ->> 'terceiro_nome', '')) <> ''
              then coalesce(nullif(e.valor ->> 'terceiro_cobranca', ''), 'hora') end,
         case when btrim(coalesce(e.valor ->> 'terceiro_nome', '')) <> ''
              then (e.valor ->> 'terceiro_valor_centavos')::bigint end
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
      preco_fechado_centavos = excluded.preco_fechado_centavos,
      responsabilidade_tecnica = excluded.responsabilidade_tecnica,
      terceiro_nome = excluded.terceiro_nome,
      terceiro_profissao = excluded.terceiro_profissao,
      terceiro_cobranca = excluded.terceiro_cobranca,
      terceiro_valor_centavos = excluded.terceiro_valor_centavos
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
      apresentacao = apresentacao_limpa,
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

-- Duplicar: o terceirizado vai junto; o valor só com os preços.
create or replace function public.duplicar_orcamento(p_id uuid, p_novo_id uuid, p_copiar_precos boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  origem public.orcamento%rowtype;
  existente public.orcamento%rowtype;
  copiar boolean := coalesce(p_copiar_precos, false);
  prospecto jsonb;
  ids_da_tabela text[];
  versao integer;
begin
  if p_novo_id is null then
    raise exception 'id_obrigatorio' using errcode = '22023';
  end if;
  select * into origem from public.orcamento as o where o.id = p_id;
  if not found or not private.is_gestao(origem.consultoria_id)
     or private.membro_atual(origem.consultoria_id) is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  select * into existente from public.orcamento as o where o.id = p_novo_id;
  if found then
    if existente.consultoria_id = origem.consultoria_id and existente.duplicado_de = p_id then
      return p_novo_id;
    end if;
    raise exception 'orcamento_existente' using errcode = 'P0001';
  end if;

  if origem.excluido_em is not null then
    raise exception 'orcamento_na_lixeira' using errcode = 'P0001';
  end if;

  if origem.empreendimento_id is null then
    prospecto := jsonb_build_object(
      'nome', origem.prospecto_nome, 'cnpj', origem.prospecto_cnpj, 'contato', origem.prospecto_contato,
      'email', origem.prospecto_email, 'telefone', origem.prospecto_telefone);
  end if;

  perform public.criar_orcamento(p_novo_id, origem.consultoria_id, origem.empreendimento_id, origem.objeto,
                                 prospecto);

  -- Linha da tabela de preços que não existe mais fica sem preço (a tela pede para escolher).
  select coalesce(array_agg(h.valor ->> 'id'), '{}'), o.row_version
    into ids_da_tabela, versao
  from public.orcamento as o
  left join lateral jsonb_array_elements(coalesce(o.base_horas_venda, '[]'::jsonb)) as h (valor) on true
  where o.id = p_novo_id
  group by o.row_version;

  perform public.salvar_orcamento(p_novo_id, versao, jsonb_build_object(
    'objeto', origem.objeto,
    'destinatario', origem.destinatario,
    'prazos', origem.prazos,
    'validade_dias', origem.validade_dias,
    'premissas', to_jsonb(origem.premissas),
    'exclusoes', to_jsonb(origem.exclusoes),
    'apresentacao', origem.apresentacao,
    'forma_preco', origem.forma_preco,
    'margem_pb', case when copiar then origem.margem_pb end,
    'visitas', jsonb_build_object(
      'quantidade', origem.visitas,
      'km_por_visita', origem.km_por_visita,
      'outros_por_visita_centavos', case when copiar then origem.outros_por_visita_centavos else 0 end),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', gen_random_uuid(),
               'descricao', i.descricao,
               'minutos', i.minutos,
               'hora_venda_id', case when i.hora_venda_id = any (ids_da_tabela) then i.hora_venda_id end,
               'responsavel_id', case when exists (
                   select 1 from public.membro as m
                   where m.consultoria_id = origem.consultoria_id and m.id = i.responsavel_id
                     and m.situacao = 'ativo') then i.responsavel_id end,
               'quantidade', i.quantidade,
               'custo_direto_extra_centavos', case when copiar then i.custo_direto_extra_centavos else 0 end,
               'preco_fechado_centavos', case when copiar then i.preco_fechado_centavos end,
               'responsabilidade_tecnica', i.responsabilidade_tecnica,
               'terceiro_nome', i.terceiro_nome,
               'terceiro_profissao', i.terceiro_profissao,
               'terceiro_cobranca', i.terceiro_cobranca,
               'terceiro_valor_centavos', case when copiar then i.terceiro_valor_centavos end)
             order by i.ordem, i.id)
      from public.orcamento_item as i
      where i.consultoria_id = origem.consultoria_id and i.orcamento_id = origem.id), '[]'::jsonb),
    'despesas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', gen_random_uuid(),
               'descricao', d.descricao,
               'estimativa_centavos', case when copiar then d.estimativa_centavos end,
               'tratamento', d.tratamento) order by d.ordem, d.id)
      from public.orcamento_despesa as d
      where d.consultoria_id = origem.consultoria_id and d.orcamento_id = origem.id), '[]'::jsonb),
    'parcelas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', gen_random_uuid(),
               'descricao', p.descricao,
               'dias', p.dias,
               'percentual_pb', p.percentual_pb) order by p.ordem, p.id)
      from public.orcamento_parcela as p
      where p.consultoria_id = origem.consultoria_id and p.orcamento_id = origem.id), '[]'::jsonb)));

  update public.orcamento as o set duplicado_de = origem.id where o.id = p_novo_id;
  return p_novo_id;
end;
$$;

-- Obter: devolve o terceirizado do item.
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
        'responsabilidade_tecnica', i.responsabilidade_tecnica,
        'terceiro_nome', i.terceiro_nome, 'terceiro_profissao', i.terceiro_profissao,
        'terceiro_cobranca', i.terceiro_cobranca,
        'terceiro_valor_centavos', i.terceiro_valor_centavos) order by i.ordem, i.id)
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

revoke all on function private.itens_do_preco(public.orcamento) from public, anon, authenticated;
revoke all on function private.preco_pendente(public.orcamento) from public, anon, authenticated;
grant execute on function private.preco_pendente(public.orcamento) to authenticated;
