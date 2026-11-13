-- Primeiros passos do orçamento (ADR-0020). Seis passos que configuram custos e preços salvando a
-- cada passo, num rascunho da consultoria separado da base publicada:
-- 1. O rascunho guarda cada passo como foi digitado: ausente fica nulo, nunca vira zero.
-- 2. A base usada nos cálculos (orcamento_base_custos) só muda na publicação: uma transação que
--    confere a versão da base e chama a mesma salvar_base_de_custos de Custos e taxas.
-- 3. Com equipe, horas e hora técnica continuam derivadas da equipe (regra de sempre); sem equipe,
--    valem o custo da hora e as horas digitados.
-- 4. "Ver orçamentos mesmo assim" fica guardado por membro e consultoria.
-- Mesmas pendências de packages/domain/src/primeiros-passos-orcamento.ts.

create table public.orcamento_configuracao_rascunho (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  -- {"passo_1": {...}, …, "passo_5": {}}: só os passos já salvos.
  dados jsonb not null default '{}'::jsonb,
  -- Passo em que a pessoa retoma (1 a 6).
  etapa integer not null default 1,
  -- Versão da base quando o rascunho começou; 0 = ainda não havia base.
  base_row_version integer not null default 0,
  row_version integer not null default 1,
  -- Última gravação, para repetir a mesma operação sem gravar duas vezes.
  ultima_operacao uuid,
  ultimo_passo integer,
  ultimo_payload jsonb,
  criado_por uuid not null,
  atualizado_por uuid not null,
  atualizado_em timestamptz not null default now(),
  constraint orcamento_configuracao_rascunho_consultoria_key unique (consultoria_id),
  constraint orcamento_configuracao_rascunho_consultoria_id_id_key unique (consultoria_id, id),
  constraint orcamento_configuracao_rascunho_criado_por_fk foreign key (consultoria_id, criado_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint orcamento_configuracao_rascunho_atualizado_por_fk foreign key (consultoria_id, atualizado_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint orcamento_configuracao_rascunho_etapa check (etapa between 1 and 6),
  constraint orcamento_configuracao_rascunho_versoes check (base_row_version >= 0 and row_version > 0),
  constraint orcamento_configuracao_rascunho_dados check (
    jsonb_typeof(dados) = 'object'
    and dados - array['passo_1', 'passo_2', 'passo_3', 'passo_4', 'passo_5'] = '{}'::jsonb
    and pg_column_size(dados) <= 1048576)
);

comment on table public.orcamento_configuracao_rascunho is
  'Primeiros passos do orçamento (ADR-0020): rascunho da configuração, um por consultoria. Não é a base usada nos cálculos. Só a Gestão lê; escrita só por RPC.';

create table public.orcamento_configuracao_preferencia (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  membro_id uuid not null,
  -- "Ver orçamentos mesmo assim": o convite não volta para esta pessoa nesta consultoria.
  dispensado_em timestamptz,
  constraint orcamento_configuracao_preferencia_membro_key unique (consultoria_id, membro_id),
  constraint orcamento_configuracao_preferencia_consultoria_id_id_key unique (consultoria_id, id),
  constraint orcamento_configuracao_preferencia_membro_fk foreign key (consultoria_id, membro_id)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.orcamento_configuracao_preferencia is
  'Escolha de cada membro sobre o convite dos primeiros passos (ADR-0020). Cada pessoa só lê a sua.';

alter table public.orcamento_configuracao_rascunho enable row level security;
alter table public.orcamento_configuracao_rascunho force row level security;
alter table public.orcamento_configuracao_preferencia enable row level security;
alter table public.orcamento_configuracao_preferencia force row level security;

revoke all on public.orcamento_configuracao_rascunho, public.orcamento_configuracao_preferencia
  from public, anon, authenticated;
grant select on public.orcamento_configuracao_rascunho, public.orcamento_configuracao_preferencia
  to authenticated;

create policy orcamento_configuracao_rascunho_gestao_le
  on public.orcamento_configuracao_rascunho for select to authenticated
  using ((select private.is_gestao(consultoria_id)));

create policy orcamento_configuracao_preferencia_propria
  on public.orcamento_configuracao_preferencia for select to authenticated
  using ((select private.is_gestao(consultoria_id))
         and membro_id = (select private.membro_atual(consultoria_id)));

-- Auditoria sem conteúdo: os dados têm remuneração da equipe e não vão para o log.
create trigger orcamento_configuracao_rascunho_auditar
  after insert or update or delete on public.orcamento_configuracao_rascunho
  for each row execute function private.auditar('consultoria_id', 'dados', 'ultimo_payload');

-- ---------------------------------------------------------------------------
-- Validação de cada passo do rascunho. Estrutura e limites iguais aos de salvar_base_de_custos;
-- o que ainda falta (nulo) é aceito aqui e cobrado na publicação.
-- ---------------------------------------------------------------------------

-- Número inteiro (ou com `casas` decimais) de 0 a `maximo`; nulo é aceito.
create function private.numero_do_rascunho_invalido(v jsonb, maximo numeric, casas integer default 0)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when v is null or v = 'null'::jsonb then false
    when jsonb_typeof(v) <> 'number' then true
    else (v #>> '{}')::numeric < 0
      or (v #>> '{}')::numeric > maximo
      or (v #>> '{}')::numeric <> round((v #>> '{}')::numeric, casas)
  end
$$;

-- Texto de até `maximo` caracteres; com `obrigatorio`, não pode faltar nem ficar em branco.
create function private.texto_do_rascunho_invalido(v jsonb, maximo integer, obrigatorio boolean)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when v is null or v = 'null'::jsonb then obrigatorio
    when jsonb_typeof(v) <> 'string' then true
    else length(v #>> '{}') > maximo or (obrigatorio and btrim(v #>> '{}') = '')
  end
$$;

-- Objeto só com as chaves permitidas.
create function private.chaves_do_rascunho_invalidas(v jsonb, permitidas text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select v is null or jsonb_typeof(v) <> 'object'
      or exists (select 1 from jsonb_object_keys(v) as k (chave) where k.chave <> all (permitidas))
$$;

create function private.passo_da_configuracao_valido(
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
      private.chaves_do_rascunho_invalidas(p_dados, array['horas_venda', 'valor_visita_centavos', 'custo_km_centavos'])
      or private.numero_do_rascunho_invalido(p_dados -> 'valor_visita_centavos', maximo_centavos)
      or private.numero_do_rascunho_invalido(p_dados -> 'custo_km_centavos', maximo_centavos)
      or jsonb_typeof(horas_venda) is distinct from 'array'
      or jsonb_array_length(horas_venda) > 100
      or exists (
        select 1 from jsonb_array_elements(horas_venda) as h (v)
        where private.chaves_do_rascunho_invalidas(h.v, array[
                'id', 'profissao', 'atividade', 'valor_centavos', 'fonte', 'unidade',
                'minutos_por_unidade', 'minimo_centavos', 'faixas'])
           or private.texto_do_rascunho_invalido(h.v -> 'id', 64, true)
           or private.texto_do_rascunho_invalido(h.v -> 'profissao', 80, true)
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
      or (select count(distinct lower(btrim(h.v ->> 'profissao')) || '|' || lower(btrim(h.v ->> 'atividade')))
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

-- O que ainda falta para publicar, na ordem dos passos. Iguais a pendenciasDaConfiguracao
-- (packages/domain). Com equipe, as horas faturáveis vêm dela e entram em "equipe".
create function private.pendencias_da_configuracao(d jsonb)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  p1 jsonb := d -> 'passo_1';
  p2 jsonb := d -> 'passo_2';
  p3 jsonb := d -> 'passo_3';
  p4 jsonb := d -> 'passo_4';
  faltam text[] := '{}';
  horas_da_equipe numeric;
begin
  if p1 is null then
    faltam := faltam || array['equipe', 'horas'];
  elsif p1 ->> 'modo' = 'equipe' then
    -- Igual a salvar_base_de_custos e composicaoDaEquipe: só quem tem custo e horas do mês.
    select coalesce(sum(v.horas), 0) into horas_da_equipe
    from jsonb_array_elements(coalesce(p1 -> 'equipe', '[]'::jsonb)) as e (valor)
    cross join lateral (
      select case e.valor ->> 'tipo_recebimento'
               when 'diaria' then (e.valor ->> 'dias_no_mes')::numeric * (e.valor ->> 'custo_diaria_centavos')::numeric
               when 'projeto' then null
               else (e.valor ->> 'custo_mensal_centavos')::numeric
             end as custo,
             case e.valor ->> 'tipo_recebimento'
               when 'diaria' then (e.valor ->> 'dias_no_mes')::numeric * (e.valor ->> 'horas_por_diaria')::numeric
               else (e.valor ->> 'horas_disponiveis_mes')::numeric
             end as horas
    ) as v
    where v.custo is not null and v.horas is not null;
    if horas_da_equipe <= 0 then
      faltam := faltam || array['equipe'];
    end if;
  else
    if coalesce((p1 ->> 'hora_tecnica_centavos')::numeric, 0) <= 0 then
      faltam := faltam || array['equipe'];
    end if;
    if coalesce((p2 ->> 'horas_faturaveis_mes')::numeric, 0) <= 0 then
      faltam := faltam || array['horas'];
    end if;
  end if;

  if p2 is null
     or (jsonb_array_length(coalesce(p2 -> 'contas', '[]'::jsonb)) = 0
         and p2 ->> 'custos_fixos_mensais_centavos' is null)
     or exists (
       select 1 from jsonb_array_elements(coalesce(p2 -> 'contas', '[]'::jsonb)) as c (valor)
       where c.valor ->> 'valor_centavos' is null) then
    faltam := faltam || array['contas'];
  end if;

  if p3 is null or jsonb_array_length(coalesce(p3 -> 'horas_venda', '[]'::jsonb)) = 0 then
    faltam := faltam || array['precos'];
  end if;

  if p4 is null or p4 ->> 'tributos_pb' is null then
    faltam := faltam || array['tributos'];
  end if;
  if p4 is null or p4 ->> 'taxas_pb' is null or p4 ->> 'taxa_por_cobranca_centavos' is null
     or p4 ->> 'taxa_por_assinatura_centavos' is null then
    faltam := faltam || array['taxas'];
  end if;
  if p4 is null or p4 ->> 'margem_desejada_pb' is null or p4 ->> 'margem_minima_pb' is null
     or p4 -> 'margens_confirmadas' is distinct from 'true'::jsonb then
    faltam := faltam || array['margens'];
  end if;
  return faltam;
end;
$$;

revoke all on function private.numero_do_rascunho_invalido(jsonb, numeric, integer) from public, anon, authenticated;
revoke all on function private.texto_do_rascunho_invalido(jsonb, integer, boolean) from public, anon, authenticated;
revoke all on function private.chaves_do_rascunho_invalidas(jsonb, text[]) from public, anon, authenticated;
revoke all on function private.passo_da_configuracao_valido(uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function private.pendencias_da_configuracao(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Leitura não cria nada. Devolve o rascunho (ou nulo), a escolha desta pessoa sobre o convite e a
-- versão da base atual, para a tela avisar antes de publicar se alguém salvou Custos e taxas.
create function public.obter_rascunho_configuracao_orcamento(p_consultoria_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  autor uuid := private.gestao_da_consultoria(p_consultoria_id);
  versao_da_base integer;
  rascunho jsonb;
begin
  select b.row_version into versao_da_base
  from public.orcamento_base_custos as b where b.consultoria_id = p_consultoria_id;

  select jsonb_build_object(
           'dados', r.dados,
           'etapa', r.etapa,
           'row_version', r.row_version,
           'base_row_version', r.base_row_version,
           'pendencias', to_jsonb(private.pendencias_da_configuracao(r.dados)),
           'atualizado_em', r.atualizado_em,
           'atualizado_por_nome', m.nome)
    into rascunho
  from public.orcamento_configuracao_rascunho as r
  join public.membro as m on m.consultoria_id = r.consultoria_id and m.id = r.atualizado_por
  where r.consultoria_id = p_consultoria_id;

  return jsonb_build_object(
    'rascunho', rascunho,
    'dispensado', exists (
      select 1 from public.orcamento_configuracao_preferencia as p
      where p.consultoria_id = p_consultoria_id and p.membro_id = autor
        and p.dispensado_em is not null),
    'base_configurada', versao_da_base is not null,
    'base_row_version', coalesce(versao_da_base, 0));
end;
$$;

-- Salva um passo. p_row_version: 0 cria o rascunho; p_base_row_version (só na criação) é a versão
-- da base de onde a tela copiou os valores. p_proxima_etapa: onde a pessoa retoma (o próprio passo
-- em "continuar depois"). Repetir a mesma p_operacao com o mesmo conteúdo devolve o já salvo.
create function public.salvar_passo_configuracao_orcamento(
  p_consultoria_id uuid,
  p_row_version integer,
  p_etapa integer,
  p_dados jsonb,
  p_proxima_etapa integer,
  p_base_row_version integer,
  p_operacao uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  autor uuid := private.gestao_da_consultoria(p_consultoria_id);
  atual public.orcamento_configuracao_rascunho%rowtype;
  versao_da_base integer;
begin
  if p_row_version is null or p_row_version < 0
     or p_etapa is null or p_etapa not between 1 and 5
     or p_proxima_etapa is null or p_proxima_etapa not between 1 and 6
     or p_dados is null or pg_column_size(p_dados) > 262144
     or not private.passo_da_configuracao_valido(p_consultoria_id, p_etapa, p_dados) then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;

  select * into atual from public.orcamento_configuracao_rascunho as r
  where r.consultoria_id = p_consultoria_id
  for update;

  if found then
    if p_operacao is not null and atual.ultima_operacao = p_operacao then
      if atual.ultimo_passo is distinct from p_etapa or atual.ultimo_payload is distinct from p_dados
         or atual.etapa <> p_proxima_etapa then
        raise exception 'operacao_invalida' using errcode = '22023';
      end if;
      return private.rascunho_salvo(atual);
    end if;
    if atual.row_version <> p_row_version then
      raise exception 'conflito_de_versao' using errcode = 'P0001';
    end if;
    update public.orcamento_configuracao_rascunho as r
    set dados = r.dados || jsonb_build_object('passo_' || p_etapa::text, p_dados),
        etapa = p_proxima_etapa,
        row_version = r.row_version + 1,
        atualizado_por = autor,
        atualizado_em = now(),
        ultima_operacao = p_operacao,
        ultimo_passo = p_etapa,
        ultimo_payload = p_dados
    where r.id = atual.id
    returning * into atual;
    return private.rascunho_salvo(atual);
  end if;

  -- Criação: a tela começou dos valores da base nesta versão. Se a base mudou, recomeça.
  if p_row_version <> 0 then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  select coalesce((select b.row_version from public.orcamento_base_custos as b
                   where b.consultoria_id = p_consultoria_id), 0)
    into versao_da_base;
  if p_base_row_version is distinct from versao_da_base then
    raise exception 'base_alterada' using errcode = 'P0001';
  end if;
  begin
    insert into public.orcamento_configuracao_rascunho (
      consultoria_id, dados, etapa, base_row_version, criado_por, atualizado_por,
      ultima_operacao, ultimo_passo, ultimo_payload)
    values (
      p_consultoria_id, jsonb_build_object('passo_' || p_etapa::text, p_dados), p_proxima_etapa,
      versao_da_base, autor, autor, p_operacao, p_etapa, p_dados)
    returning * into atual;
  exception when unique_violation then
    -- Outra pessoa criou o rascunho ao mesmo tempo. Só a mesma operação repetida é aceita.
    select * into atual from public.orcamento_configuracao_rascunho as r
    where r.consultoria_id = p_consultoria_id
    for update;
    if p_operacao is not null and atual.ultima_operacao = p_operacao
       and atual.ultimo_passo = p_etapa and atual.ultimo_payload = p_dados
       and atual.etapa = p_proxima_etapa then
      return private.rascunho_salvo(atual);
    end if;
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end;
  return private.rascunho_salvo(atual);
end;
$$;

create function private.rascunho_salvo(r public.orcamento_configuracao_rascunho)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'dados', r.dados,
    'etapa', r.etapa,
    'row_version', r.row_version,
    'base_row_version', r.base_row_version,
    'pendencias', to_jsonb(private.pendencias_da_configuracao(r.dados)))
$$;

revoke all on function private.rascunho_salvo(public.orcamento_configuracao_rascunho) from public, anon, authenticated;

-- Descarta o rascunho (recomeçar dos valores atuais depois de um conflito). Repetir é inofensivo.
create function public.descartar_rascunho_configuracao_orcamento(
  p_consultoria_id uuid,
  p_row_version integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  autor uuid := private.gestao_da_consultoria(p_consultoria_id);
  atual public.orcamento_configuracao_rascunho%rowtype;
begin
  select * into atual from public.orcamento_configuracao_rascunho as r
  where r.consultoria_id = p_consultoria_id
  for update;
  if not found then
    return;
  end if;
  if p_row_version is null or atual.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  delete from public.orcamento_configuracao_rascunho as r where r.id = atual.id;
end;
$$;

-- "Ver orçamentos mesmo assim": só para quem pediu, nesta consultoria. Repetir mantém a data.
create function public.dispensar_convite_configuracao_orcamento(p_consultoria_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  autor uuid := private.gestao_da_consultoria(p_consultoria_id);
begin
  insert into public.orcamento_configuracao_preferencia as p (consultoria_id, membro_id, dispensado_em)
  values (p_consultoria_id, autor, now())
  on conflict (consultoria_id, membro_id) do update
  set dispensado_em = coalesce(p.dispensado_em, excluded.dispensado_em);
end;
$$;

-- A publicação confere a versão da base também dentro de salvar_base_de_custos: se outra pessoa
-- criar a base entre a leitura e a gravação, o INSERT … ON CONFLICT vira UPDATE e cai aqui.
create function private.conferir_versao_da_base()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  esperada text := nullif(current_setting('grama.versao_base_configuracao', true), '');
begin
  if esperada is not null and old.row_version <> esperada::integer then
    raise exception 'base_alterada' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.conferir_versao_da_base() from public, anon, authenticated;

create trigger orcamento_base_custos_conferir_versao
  before update on public.orcamento_base_custos
  for each row execute function private.conferir_versao_da_base();

-- Publica o rascunho: a base passa a valer numa transação só, pela mesma salvar_base_de_custos de
-- Custos e taxas (mesmas validações e fórmulas). Falhou, nada muda. Devolve a versão nova da base.
create function public.publicar_configuracao_orcamento(p_consultoria_id uuid, p_row_version integer)
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
    coalesce((p3 ->> 'custo_km_centavos')::bigint, 0),
    p3 -> 'horas_venda',
    -- O piso por hora não é editado aqui: fica o da base.
    coalesce(b.piso_hora_centavos, 0));
  perform set_config('grama.versao_base_configuracao', '', true);

  select x.row_version into versao_nova
  from public.orcamento_base_custos as x where x.consultoria_id = p_consultoria_id;
  delete from public.orcamento_configuracao_rascunho as x where x.id = r.id;
  return versao_nova;
end;
$$;

-- Versão da base também na leitura: a tela copia os valores e diz de qual versão partiu.
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

revoke all on function public.obter_rascunho_configuracao_orcamento(uuid) from public, anon;
revoke all on function public.salvar_passo_configuracao_orcamento(uuid, integer, integer, jsonb, integer, integer, uuid) from public, anon;
revoke all on function public.descartar_rascunho_configuracao_orcamento(uuid, integer) from public, anon;
revoke all on function public.dispensar_convite_configuracao_orcamento(uuid) from public, anon;
revoke all on function public.publicar_configuracao_orcamento(uuid, integer) from public, anon;
grant execute on function public.obter_rascunho_configuracao_orcamento(uuid) to authenticated;
grant execute on function public.salvar_passo_configuracao_orcamento(uuid, integer, integer, jsonb, integer, integer, uuid) to authenticated;
grant execute on function public.descartar_rascunho_configuracao_orcamento(uuid, integer) to authenticated;
grant execute on function public.dispensar_convite_configuracao_orcamento(uuid) to authenticated;
grant execute on function public.publicar_configuracao_orcamento(uuid, integer) to authenticated;
