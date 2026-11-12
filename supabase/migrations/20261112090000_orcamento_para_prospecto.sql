-- Orçamento para prospecto (ORC-02 "cliente/prospecto"; FIN-06), pedido do Eduardo em 12/11/2026.
-- O orçamento pode nascer para um prospecto, sem empreendimento cadastrado: nome obrigatório,
-- CNPJ, contato, e-mail e telefone opcionais (nunca CPF). A lista de empreendimentos não se enche
-- de quem só pediu preço. "Cadastrar como empreendimento" cria o empreendimento a partir do
-- prospecto e liga o orçamento a ele; com CNPJ já cadastrado na consultoria, liga ao existente em
-- vez de duplicar. A conversão automática na aprovação (FIN-06) espera a etapa de aprovação.

alter table public.orcamento
  alter column empreendimento_id drop not null,
  add column prospecto_nome text,
  add column prospecto_cnpj text,
  add column prospecto_contato text,
  add column prospecto_email text,
  add column prospecto_telefone text,
  add constraint orcamento_empreendimento_ou_prospecto check (
    empreendimento_id is not null or length(btrim(coalesce(prospecto_nome, ''))) > 0),
  add constraint orcamento_prospecto_cnpj_formato check (
    prospecto_cnpj is null or prospecto_cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
  add constraint orcamento_prospecto_tamanhos check (
    coalesce(length(prospecto_nome), 0) <= 200
    and coalesce(length(prospecto_contato), 0) <= 200
    and coalesce(length(prospecto_email), 0) <= 254
    and coalesce(length(prospecto_telefone), 0) <= 40);

comment on column public.orcamento.empreendimento_id is
  'Nulo enquanto o orçamento é de um prospecto. Preenchido por cadastrar_empreendimento_do_prospecto.';
comment on column public.orcamento.prospecto_nome is
  'Empresa ou pessoa que pediu o orçamento sem estar cadastrada. Fica como histórico depois do cadastro.';

-- ---------------------------------------------------------------------------
-- Grava os dados do prospecto (criar e salvar). Valida nome, CNPJ e e-mail.
-- ---------------------------------------------------------------------------
create function private.gravar_prospecto(p_id uuid, p_dados jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  nome text := btrim(coalesce(p_dados ->> 'nome', ''));
  email text := nullif(btrim(coalesce(p_dados ->> 'email', '')), '');
  cnpj text;
begin
  if jsonb_typeof(coalesce(p_dados, 'null'::jsonb)) <> 'object' or nome = '' then
    raise exception 'prospecto_sem_nome' using errcode = '22023';
  end if;
  cnpj := private.cnpj_valido(nullif(btrim(coalesce(p_dados ->> 'cnpj', '')), ''));
  if email is not null and email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'email_invalido' using errcode = '22023';
  end if;

  update public.orcamento as o
  set prospecto_nome = nome,
      prospecto_cnpj = cnpj,
      prospecto_contato = nullif(btrim(coalesce(p_dados ->> 'contato', '')), ''),
      prospecto_email = email,
      prospecto_telefone = nullif(btrim(coalesce(p_dados ->> 'telefone', '')), '')
  where o.id = p_id;
end;
$$;

revoke all on function private.gravar_prospecto(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: criar o rascunho para um empreendimento ou para um prospecto (p_prospecto).
-- ---------------------------------------------------------------------------
drop function public.criar_orcamento(uuid, uuid, uuid, text);

create function public.criar_orcamento(
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

  return novo;
end;
$$;

revoke all on function public.criar_orcamento(uuid, uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.criar_orcamento(uuid, uuid, uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: cadastrar o prospecto como empreendimento e ligar o orçamento a ele. Idempotente: orçamento
-- já ligado devolve o empreendimento dele. CNPJ já cadastrado na consultoria liga ao existente.
-- ---------------------------------------------------------------------------
create function public.cadastrar_empreendimento_do_prospecto(p_orcamento_id uuid, p_empreendimento_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.orcamento%rowtype;
  destino uuid;
begin
  select * into alvo from public.orcamento as o where o.id = p_orcamento_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.empreendimento_id is not null then
    return alvo.empreendimento_id;
  end if;

  if alvo.prospecto_cnpj is not null then
    select e.id into destino
    from public.empreendimento as e
    where e.consultoria_id = alvo.consultoria_id and e.cnpj = alvo.prospecto_cnpj
    order by e.criado_em, e.id
    limit 1;
  end if;

  if destino is null then
    destino := public.criar_empreendimento(
      p_empreendimento_id, alvo.consultoria_id, alvo.prospecto_nome, null, alvo.prospecto_cnpj, null);
  end if;

  update public.orcamento as o
  set empreendimento_id = destino,
      atualizado_em = now(),
      row_version = o.row_version + 1
  where o.id = p_orcamento_id;

  return destino;
end;
$$;

revoke all on function public.cadastrar_empreendimento_do_prospecto(uuid, uuid) from public, anon;
grant execute on function public.cadastrar_empreendimento_do_prospecto(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: salvar o rascunho. Novidade: p_dados.prospecto { nome, cnpj, contato, email, telefone }
-- atualiza os dados do prospecto enquanto o orçamento não tem empreendimento.
-- ---------------------------------------------------------------------------
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
  ) then
    raise exception 'item_invalido' using errcode = '22023';
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

  if alvo.base_registrada_em is not null
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
    custo_direto_extra_centavos)
  select (e.valor ->> 'id')::uuid, alvo.consultoria_id, p_id, e.ordem::integer,
         btrim(e.valor ->> 'descricao'),
         coalesce((e.valor ->> 'minutos')::integer, 0),
         true, 0,
         coalesce((e.valor ->> 'custo_direto_extra_centavos')::bigint, 0)
  from jsonb_array_elements(itens) with ordinality as e (valor, ordem)
  on conflict (id) do update
  set ordem = excluded.ordem,
      descricao = excluded.descricao,
      minutos = excluded.minutos,
      custo_direto_extra_centavos = excluded.custo_direto_extra_centavos
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

-- ---------------------------------------------------------------------------
-- Leitura: prospecto aparece com o nome dele no lugar do empreendimento
-- ---------------------------------------------------------------------------
create or replace function public.listar_orcamentos(
  p_consultoria_id uuid,
  p_busca text default null,
  p_limite integer default 50,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  ano integer,
  sequencia integer,
  revisao integer,
  situacao public.situacao_orcamento,
  empreendimento_id uuid,
  empreendimento_nome text,
  objeto text,
  total_centavos bigint,
  atualizado_em timestamptz,
  total bigint
)
language sql
stable
set search_path = ''
as $$
  select
    o.id,
    o.ano,
    o.sequencia,
    o.revisao,
    o.situacao,
    o.empreendimento_id,
    coalesce(e.nome, o.prospecto_nome),
    o.objeto,
    case when private.preco_pendente(o) then null
         else coalesce((select sum(i.preco_centavos) from public.orcamento_item as i
                        where i.consultoria_id = o.consultoria_id and i.orcamento_id = o.id), 0)
              + o.preco_visitas_centavos end::bigint,
    o.atualizado_em,
    count(*) over ()
  from public.orcamento as o
  left join public.empreendimento as e on e.consultoria_id = o.consultoria_id and e.id = o.empreendimento_id
  where o.consultoria_id = p_consultoria_id
    and (
      btrim(coalesce(p_busca, '')) = ''
      or e.nome_normalizado like private.padrao_de_busca(p_busca)
      or private.normalizar_nome(o.prospecto_nome) like private.padrao_de_busca(p_busca)
      or private.normalizar_nome(o.objeto) like private.padrao_de_busca(p_busca)
    )
  order by o.atualizado_em desc, o.id
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0)
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
      'registrada_em', o.base_registrada_em) end,
    'atualizado_em', o.atualizado_em,
    'row_version', o.row_version,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'descricao', i.descricao, 'minutos', i.minutos,
        'preco_automatico', i.preco_automatico, 'preco_centavos', i.preco_centavos,
        'custo_direto_extra_centavos', i.custo_direto_extra_centavos) order by i.ordem, i.id)
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
