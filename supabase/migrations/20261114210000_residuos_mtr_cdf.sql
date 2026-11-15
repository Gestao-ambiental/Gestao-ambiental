-- Resíduos, fase 1: MTR e CDF sem integração com o IMA (docs/estudos/integracao-ima-mtr.md, seções
-- 3b e 5). Protótipo para revisão.
--
-- A equipe registra cada MTR emitido no Sistema MTR do IMA (com os itens e o PDF) e cada CDF
-- recebido do destinador (com os MTRs que ele cobre). Nada aqui fala com o IMA, nem guarda senha ou
-- CPF. A situação do MTR é a do IMA, digitada.
--
--   mtr                MTR por empreendimento; número único na consultoria (entre os não excluídos)
--   mtr_item           resíduo, classe, quantidade e unidade
--   cdf                CDF por empreendimento, com o período
--   cdf_mtr            uma linha por item de MTR coberto pelo CDF, com a quantidade recebida quando
--                      o CDF informa
--   obrigacao_residuo  DMR trimestral, DMRSU mensal, Inventário Nacional e RAPP ligados ao
--                      empreendimento. Os prazos não são gravados: saem de
--                      private.prazos_da_obrigacao_residuo (espelho de packages/domain/src/residuos.ts)
--
-- Quem faz o quê: qualquer membro ativo registra, edita e exclui MTR e CDF; só a Gestão liga e
-- desliga obrigações. Escrita só por RPC (idempotente pelo id gerado no cliente), leitura pela RLS
-- de membro ativo. Exclusão de MTR e CDF é lógica.
--
-- Conferência CDF x MTR (private.pendencias_de_residuo, espelho de conferirCdfMtr no domínio):
--   - MTR salvo ou recebido, sem CDF, há mais de 30 dias da emissão;
--   - por item: soma do que os CDFs informam ≠ quantidade do MTR (tolerância zero), convertendo
--     t↔kg e m³↔L; unidades de tipos diferentes viram "unidades_diferentes".

-- ---------------------------------------------------------------------------
-- 1. Anexos: o documento passa a aceitar MTR e CDF (caminho consultoria_id/mtr|cdf/<uuid>.pdf).
-- ---------------------------------------------------------------------------
alter table public.documento drop constraint documento_entidade_valida;
alter table public.documento
  add constraint documento_entidade_valida
  check (entidade in ('instrumento', 'evidencia', 'protocolo', 'membro', 'consultoria', 'mtr', 'cdf'));

-- ---------------------------------------------------------------------------
-- 2. Unidades e quantidades
-- ---------------------------------------------------------------------------
-- Fator para a unidade base do tipo (kg, L ou un).
create function private.fator_unidade_residuo(unidade text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case unidade when 't' then 1000 when 'm3' then 1000 when 'kg' then 1 when 'l' then 1 when 'un' then 1 end::numeric
$$;

create function private.tipo_unidade_residuo(unidade text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when unidade in ('t', 'kg') then 'massa'
    when unidade in ('m3', 'l') then 'volume'
    when unidade = 'un' then 'contagem'
  end
$$;

-- Unidade em que o painel soma (massa em t, volume em m³).
create function private.unidade_do_painel(unidade text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case private.tipo_unidade_residuo(unidade) when 'massa' then 't' when 'volume' then 'm3' else 'un' end
$$;

-- Quantidade de um JSON (número ou texto com ponto decimal): > 0, até 4 casas, até 99.999.999.
create function private.quantidade_residuo(valor jsonb)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  texto text;
  numero numeric;
begin
  if valor is null or jsonb_typeof(valor) not in ('number', 'string') then
    raise exception 'quantidade_invalida' using errcode = '22023';
  end if;
  texto := btrim(valor #>> '{}');
  if texto !~ '^[0-9]+(\.[0-9]+)?$' then
    raise exception 'quantidade_invalida' using errcode = '22023';
  end if;
  numero := texto::numeric;
  if numero <= 0 or numero > 99999999 or numero <> round(numero, 4) then
    raise exception 'quantidade_invalida' using errcode = '22023';
  end if;
  return numero;
end;
$$;

revoke all on function private.fator_unidade_residuo(text) from public, anon;
revoke all on function private.tipo_unidade_residuo(text) from public, anon;
revoke all on function private.unidade_do_painel(text) from public, anon;
revoke all on function private.quantidade_residuo(jsonb) from public, anon, authenticated;
grant execute on function private.fator_unidade_residuo(text) to authenticated;
grant execute on function private.tipo_unidade_residuo(text) to authenticated;
grant execute on function private.unidade_do_painel(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Tabelas
-- ---------------------------------------------------------------------------
create table public.mtr (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  empreendimento_id uuid not null,
  numero text not null,
  emitido_em date not null,
  situacao text not null default 'salvo',
  transportador_nome text not null,
  transportador_cnpj text,
  destinador_nome text not null,
  destinador_cnpj text,
  observacao text,
  documento_id uuid,
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por uuid,
  row_version integer not null default 1,
  constraint mtr_numero_preenchido check (length(btrim(numero)) between 1 and 60),
  constraint mtr_situacao_valida check (situacao in ('salvo', 'recebido', 'cancelado', 'em_armazenamento')),
  constraint mtr_nomes check (
    length(btrim(transportador_nome)) between 1 and 200 and length(btrim(destinador_nome)) between 1 and 200),
  constraint mtr_transportador_cnpj_formato check (transportador_cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
  constraint mtr_destinador_cnpj_formato check (destinador_cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
  constraint mtr_observacao_tamanho check (length(coalesce(observacao, '')) <= 2000),
  constraint mtr_exclusao_completa check ((excluido_em is null) = (excluido_por is null)),
  constraint mtr_consultoria_id_id_key unique (consultoria_id, id),
  constraint mtr_consultoria_empreendimento_id_key unique (consultoria_id, empreendimento_id, id),
  constraint mtr_empreendimento_fk foreign key (consultoria_id, empreendimento_id)
    references public.empreendimento (consultoria_id, id) on delete restrict,
  constraint mtr_documento_fk foreign key (consultoria_id, documento_id)
    references public.documento (consultoria_id, id) on delete restrict,
  constraint mtr_criado_por_fk foreign key (consultoria_id, criado_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint mtr_excluido_por_fk foreign key (consultoria_id, excluido_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.mtr is 'MTR emitido no Sistema MTR do IMA e registrado à mão (fase 1, sem integração).';
comment on column public.mtr.numero is 'Número do MTR no IMA. Único na consultoria entre os não excluídos.';
comment on column public.mtr.situacao is 'Situação no IMA, digitada: salvo, recebido, cancelado ou em_armazenamento.';
comment on column public.mtr.row_version is 'Controle otimista: cada escrita confere e incrementa.';

create unique index mtr_numero_por_consultoria_key on public.mtr (consultoria_id, numero) where excluido_em is null;
create index mtr_empreendimento_emissao_idx on public.mtr (consultoria_id, empreendimento_id, emitido_em desc);

create table public.mtr_item (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  mtr_id uuid not null,
  posicao integer not null,
  residuo_codigo text not null,
  residuo_descricao text not null,
  classe text,
  quantidade numeric not null,
  unidade text not null,
  constraint mtr_item_residuo_preenchido check (
    length(btrim(residuo_codigo)) between 1 and 20 and length(btrim(residuo_descricao)) between 1 and 300),
  constraint mtr_item_classe_tamanho check (length(coalesce(classe, '')) <= 40),
  constraint mtr_item_quantidade_valida check (quantidade > 0 and quantidade <= 99999999 and quantidade = round(quantidade, 4)),
  constraint mtr_item_unidade_valida check (unidade in ('t', 'kg', 'm3', 'l', 'un')),
  constraint mtr_item_consultoria_id_id_key unique (consultoria_id, id),
  constraint mtr_item_consultoria_mtr_id_key unique (consultoria_id, mtr_id, id),
  constraint mtr_item_mtr_fk foreign key (consultoria_id, mtr_id)
    references public.mtr (consultoria_id, id) on delete restrict
);

create index mtr_item_mtr_idx on public.mtr_item (consultoria_id, mtr_id, posicao);

create table public.cdf (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  empreendimento_id uuid not null,
  numero text not null,
  emitido_em date not null,
  destinador_nome text not null,
  destinador_cnpj text,
  periodo_inicio date not null,
  periodo_fim date not null,
  observacao text,
  documento_id uuid,
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por uuid,
  row_version integer not null default 1,
  constraint cdf_numero_preenchido check (length(btrim(numero)) between 1 and 60),
  constraint cdf_destinador_preenchido check (length(btrim(destinador_nome)) between 1 and 200),
  constraint cdf_destinador_cnpj_formato check (destinador_cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
  constraint cdf_periodo_valido check (periodo_inicio <= periodo_fim),
  constraint cdf_observacao_tamanho check (length(coalesce(observacao, '')) <= 2000),
  constraint cdf_exclusao_completa check ((excluido_em is null) = (excluido_por is null)),
  constraint cdf_consultoria_id_id_key unique (consultoria_id, id),
  constraint cdf_consultoria_empreendimento_id_key unique (consultoria_id, empreendimento_id, id),
  constraint cdf_empreendimento_fk foreign key (consultoria_id, empreendimento_id)
    references public.empreendimento (consultoria_id, id) on delete restrict,
  constraint cdf_documento_fk foreign key (consultoria_id, documento_id)
    references public.documento (consultoria_id, id) on delete restrict,
  constraint cdf_criado_por_fk foreign key (consultoria_id, criado_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint cdf_excluido_por_fk foreign key (consultoria_id, excluido_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.cdf is 'CDF emitido pelo destinador e registrado à mão (fase 1). A consultoria não emite CDF.';

create index cdf_empreendimento_emissao_idx on public.cdf (consultoria_id, empreendimento_id, emitido_em desc);

-- CDF e MTR do mesmo empreendimento (FK composta com empreendimento_id) e item do próprio MTR.
create table public.cdf_mtr (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  empreendimento_id uuid not null,
  cdf_id uuid not null,
  mtr_id uuid not null,
  mtr_item_id uuid not null,
  quantidade numeric,
  unidade text,
  constraint cdf_mtr_quantidade_com_unidade check ((quantidade is null) = (unidade is null)),
  constraint cdf_mtr_quantidade_valida check (
    quantidade is null or (quantidade > 0 and quantidade <= 99999999 and quantidade = round(quantidade, 4))),
  constraint cdf_mtr_unidade_valida check (unidade in ('t', 'kg', 'm3', 'l', 'un')),
  constraint cdf_mtr_item_key unique (cdf_id, mtr_item_id),
  constraint cdf_mtr_cdf_fk foreign key (consultoria_id, empreendimento_id, cdf_id)
    references public.cdf (consultoria_id, empreendimento_id, id) on delete restrict,
  constraint cdf_mtr_mtr_fk foreign key (consultoria_id, empreendimento_id, mtr_id)
    references public.mtr (consultoria_id, empreendimento_id, id) on delete restrict,
  constraint cdf_mtr_item_fk foreign key (consultoria_id, mtr_id, mtr_item_id)
    references public.mtr_item (consultoria_id, mtr_id, id) on delete restrict
);

comment on table public.cdf_mtr is 'Itens de MTR cobertos pelo CDF. quantidade/unidade: o que o CDF informa para o item (nulo se não informa).';

create index cdf_mtr_mtr_idx on public.cdf_mtr (consultoria_id, mtr_id);
create index cdf_mtr_item_idx on public.cdf_mtr (consultoria_id, mtr_item_id);

create table public.obrigacao_residuo (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  empreendimento_id uuid not null,
  tipo text not null,
  ativa boolean not null default true,
  observacao text,
  atualizado_por uuid not null,
  atualizado_em timestamptz not null default now(),
  constraint obrigacao_residuo_tipo_valido check (
    tipo in ('dmr_trimestral', 'inventario_nacional', 'rapp_ibama', 'dmrsu_mensal')),
  constraint obrigacao_residuo_observacao_tamanho check (length(coalesce(observacao, '')) <= 500),
  constraint obrigacao_residuo_consultoria_id_id_key unique (consultoria_id, id),
  constraint obrigacao_residuo_tipo_key unique (consultoria_id, empreendimento_id, tipo),
  constraint obrigacao_residuo_empreendimento_fk foreign key (consultoria_id, empreendimento_id)
    references public.empreendimento (consultoria_id, id) on delete restrict,
  constraint obrigacao_residuo_atualizado_por_fk foreign key (consultoria_id, atualizado_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.obrigacao_residuo is 'Obrigações de resíduos do empreendimento. Prazos calculados, nunca gravados.';

-- ---------------------------------------------------------------------------
-- 4. RLS, auditoria e barreiras de escrita (suporte e comercial; teste 020)
-- ---------------------------------------------------------------------------
do $$
declare
  tabela text;
begin
  foreach tabela in array array['mtr', 'mtr_item', 'cdf', 'cdf_mtr', 'obrigacao_residuo'] loop
    execute format('alter table public.%I enable row level security', tabela);
    execute format('alter table public.%I force row level security', tabela);
    execute format('revoke all on table public.%I from public, anon, authenticated', tabela);
    execute format('grant select on table public.%I to authenticated', tabela);
    execute format(
      'create policy %I on public.%I for select to authenticated '
      'using ((select private.is_membro(consultoria_id)))',
      tabela || '_select_membro_ativo', tabela);
    execute format(
      'create trigger %I after insert or update or delete on public.%I '
      'for each row execute function private.auditar()',
      tabela || '_auditar', tabela);
    execute format(
      'create trigger _suporte_somente_leitura before insert or update or delete on public.%I '
      'for each row execute function private.bloquear_escrita_do_suporte()', tabela);
    execute format(
      'create trigger _comercial_somente_leitura before insert or update or delete on public.%I '
      'for each row execute function private.bloquear_escrita_comercial()', tabela);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Escrita: MTR
-- ---------------------------------------------------------------------------
-- Itens do MTR a partir do JSON [{id?, residuo_codigo, residuo_descricao, classe?, quantidade,
-- unidade}]. Mantém os ids informados (o front gera), apaga os que saíram. Item que algum CDF
-- (não excluído) cobre não sai.
create function private.gravar_itens_do_mtr(cid uuid, p_mtr_id uuid, itens jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  item jsonb;
  v_posicao bigint;
  item_id uuid;
  dono uuid;
  ids uuid[] := array[]::uuid[];
  v_unidade text;
begin
  if itens is null or jsonb_typeof(itens) <> 'array' or jsonb_array_length(itens) = 0 then
    raise exception 'itens_obrigatorios' using errcode = '22023';
  end if;
  if jsonb_array_length(itens) > 100 then
    raise exception 'itens_demais' using errcode = '22023';
  end if;

  for item, v_posicao in select e.valor, e.ordem from jsonb_array_elements(itens) with ordinality as e (valor, ordem) loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'itens_obrigatorios' using errcode = '22023';
    end if;
    item_id := coalesce(nullif(item ->> 'id', '')::uuid, gen_random_uuid());
    if item_id = any (ids) then
      raise exception 'item_existente' using errcode = 'P0001';
    end if;
    ids := ids || item_id;

    select i.mtr_id into dono from public.mtr_item as i where i.id = item_id;
    if found and dono <> p_mtr_id then
      raise exception 'item_existente' using errcode = 'P0001';
    end if;
    if btrim(coalesce(item ->> 'residuo_codigo', '')) = '' or btrim(coalesce(item ->> 'residuo_descricao', '')) = '' then
      raise exception 'residuo_obrigatorio' using errcode = '22023';
    end if;
    v_unidade := item ->> 'unidade';
    if v_unidade is null or v_unidade not in ('t', 'kg', 'm3', 'l', 'un') then
      raise exception 'unidade_de_residuo_invalida' using errcode = '22023';
    end if;

    insert into public.mtr_item as i (id, consultoria_id, mtr_id, posicao, residuo_codigo, residuo_descricao,
                                      classe, quantidade, unidade)
    values (item_id, cid, p_mtr_id, v_posicao::integer, btrim(item ->> 'residuo_codigo'),
            btrim(item ->> 'residuo_descricao'), nullif(btrim(coalesce(item ->> 'classe', '')), ''),
            private.quantidade_residuo(item -> 'quantidade'), v_unidade)
    on conflict (id) do update
      set posicao = excluded.posicao, residuo_codigo = excluded.residuo_codigo,
          residuo_descricao = excluded.residuo_descricao, classe = excluded.classe,
          quantidade = excluded.quantidade, unidade = excluded.unidade;
  end loop;

  if exists (
    select 1 from public.cdf_mtr as l
    join public.cdf as c on c.consultoria_id = l.consultoria_id and c.id = l.cdf_id
    where l.consultoria_id = cid and l.mtr_id = p_mtr_id and c.excluido_em is null
      and not (l.mtr_item_id = any (ids))
  ) then
    raise exception 'item_ligado_a_cdf' using errcode = 'P0001';
  end if;

  -- Ligações de CDFs excluídos com os itens que saem não seguram a edição.
  delete from public.cdf_mtr as l
  where l.consultoria_id = cid and l.mtr_id = p_mtr_id and not (l.mtr_item_id = any (ids));
  delete from public.mtr_item as i
  where i.consultoria_id = cid and i.mtr_id = p_mtr_id and not (i.id = any (ids));
end;
$$;

revoke all on function private.gravar_itens_do_mtr(uuid, uuid, jsonb) from public, anon, authenticated;

-- Campos comuns do MTR, validados. Devolve o CNPJ normalizado de transportador e destinador.
create function private.validar_mtr(
  cid uuid,
  p_id uuid,
  p_numero text,
  p_emitido_em date,
  p_situacao text,
  p_transportador_nome text,
  p_destinador_nome text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if btrim(coalesce(p_numero, '')) = '' then
    raise exception 'numero_documento_obrigatorio' using errcode = '22023';
  end if;
  if p_emitido_em is null then
    raise exception 'emissao_obrigatoria' using errcode = '22023';
  end if;
  if p_emitido_em > private.hoje_da_consultoria(cid) then
    raise exception 'emissao_futura' using errcode = '22023';
  end if;
  if p_situacao is null or p_situacao not in ('salvo', 'recebido', 'cancelado', 'em_armazenamento') then
    raise exception 'situacao_invalida' using errcode = '22023';
  end if;
  if btrim(coalesce(p_transportador_nome, '')) = '' then
    raise exception 'transportador_obrigatorio' using errcode = '22023';
  end if;
  if btrim(coalesce(p_destinador_nome, '')) = '' then
    raise exception 'destinador_obrigatorio' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.mtr as m
    where m.consultoria_id = cid and m.numero = btrim(p_numero) and m.excluido_em is null and m.id <> p_id
  ) then
    raise exception 'numero_existente' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function private.validar_mtr(uuid, uuid, text, date, text, text, text) from public, anon, authenticated;

-- RPC: registrar MTR com os itens, numa transação. Idempotente pelo id gerado no cliente: repetir
-- devolve o mesmo MTR sem mudar nada.
create function public.registrar_mtr(
  p_id uuid,
  p_empreendimento_id uuid,
  p_numero text,
  p_emitido_em date,
  p_situacao text,
  p_transportador_nome text,
  p_transportador_cnpj text,
  p_destinador_nome text,
  p_destinador_cnpj text,
  p_itens jsonb,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid;
  autor uuid;
  existente public.mtr;
begin
  select e.consultoria_id into cid from public.empreendimento as e where e.id = p_empreendimento_id;
  autor := private.membro_atual(cid);
  if cid is null or autor is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'id_obrigatorio' using errcode = '22023';
  end if;

  select * into existente from public.mtr as m where m.id = p_id;
  if found then
    if existente.consultoria_id = cid and existente.empreendimento_id = p_empreendimento_id then
      return p_id;
    end if;
    raise exception 'mtr_existente' using errcode = 'P0001';
  end if;

  perform private.validar_mtr(cid, p_id, p_numero, p_emitido_em, p_situacao, p_transportador_nome, p_destinador_nome);

  insert into public.mtr (id, consultoria_id, empreendimento_id, numero, emitido_em, situacao,
                          transportador_nome, transportador_cnpj, destinador_nome, destinador_cnpj,
                          observacao, criado_por)
  values (p_id, cid, p_empreendimento_id, btrim(p_numero), p_emitido_em, p_situacao,
          btrim(p_transportador_nome), private.cnpj_valido(p_transportador_cnpj), btrim(p_destinador_nome),
          private.cnpj_valido(p_destinador_cnpj), nullif(btrim(coalesce(p_observacao, '')), ''), autor);

  perform private.gravar_itens_do_mtr(cid, p_id, p_itens);
  return p_id;
end;
$$;

-- MTR travado para escrita, conferindo vínculo e versão.
create function private.mtr_para_editar(p_id uuid, p_row_version integer)
returns public.mtr
language plpgsql
set search_path = ''
as $$
declare
  alvo public.mtr;
begin
  select * into alvo from public.mtr as m where m.id = p_id for update;
  if not found or private.membro_atual(alvo.consultoria_id) is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.excluido_em is not null then
    raise exception 'registro_excluido' using errcode = 'P0001';
  end if;
  if p_row_version is distinct from alvo.row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  return alvo;
end;
$$;

revoke all on function private.mtr_para_editar(uuid, integer) from public, anon, authenticated;

-- RPC: editar o MTR e os itens (substitui a lista). Devolve a nova row_version.
create function public.editar_mtr(
  p_id uuid,
  p_row_version integer,
  p_numero text,
  p_emitido_em date,
  p_situacao text,
  p_transportador_nome text,
  p_transportador_cnpj text,
  p_destinador_nome text,
  p_destinador_cnpj text,
  p_itens jsonb,
  p_observacao text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.mtr := private.mtr_para_editar(p_id, p_row_version);
begin
  perform private.validar_mtr(alvo.consultoria_id, p_id, p_numero, p_emitido_em, p_situacao,
                              p_transportador_nome, p_destinador_nome);

  update public.mtr as m
  set numero = btrim(p_numero), emitido_em = p_emitido_em, situacao = p_situacao,
      transportador_nome = btrim(p_transportador_nome),
      transportador_cnpj = private.cnpj_valido(p_transportador_cnpj),
      destinador_nome = btrim(p_destinador_nome), destinador_cnpj = private.cnpj_valido(p_destinador_cnpj),
      observacao = nullif(btrim(coalesce(p_observacao, '')), ''),
      atualizado_em = now(), row_version = alvo.row_version + 1
  where m.id = p_id;

  perform private.gravar_itens_do_mtr(alvo.consultoria_id, p_id, p_itens);
  return alvo.row_version + 1;
end;
$$;

-- RPC: excluir (lógico). MTR coberto por CDF não excluído não sai.
create function public.excluir_mtr(p_id uuid, p_row_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.mtr := private.mtr_para_editar(p_id, p_row_version);
begin
  if exists (
    select 1 from public.cdf_mtr as l
    join public.cdf as c on c.consultoria_id = l.consultoria_id and c.id = l.cdf_id
    where l.consultoria_id = alvo.consultoria_id and l.mtr_id = p_id and c.excluido_em is null
  ) then
    raise exception 'mtr_com_cdf' using errcode = 'P0001';
  end if;

  update public.mtr as m
  set excluido_em = now(), excluido_por = private.membro_atual(alvo.consultoria_id),
      atualizado_em = now(), row_version = alvo.row_version + 1
  where m.id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Escrita: CDF
-- ---------------------------------------------------------------------------
-- Ligações do CDF a partir do JSON [{mtr_id, itens?: [{mtr_item_id, quantidade?, unidade?}]}].
-- Cada MTR citado cobre todos os seus itens; a quantidade entra só para os itens informados.
-- Substitui as ligações anteriores do CDF.
create function private.gravar_mtrs_do_cdf(cid uuid, emp uuid, p_cdf_id uuid, mtrs jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  entrada jsonb;
  item jsonb;
  v_mtr uuid;
  v_item uuid;
  vistos uuid[] := array[]::uuid[];
begin
  if mtrs is null then
    mtrs := '[]'::jsonb;
  end if;
  if jsonb_typeof(mtrs) <> 'array' then
    raise exception 'mtr_invalido' using errcode = '22023';
  end if;
  if jsonb_array_length(mtrs) > 500 then
    raise exception 'mtrs_demais' using errcode = '22023';
  end if;

  delete from public.cdf_mtr as l where l.consultoria_id = cid and l.cdf_id = p_cdf_id;

  for entrada in select e from jsonb_array_elements(mtrs) as e loop
    v_mtr := nullif(entrada ->> 'mtr_id', '')::uuid;
    if v_mtr is null or not exists (
      select 1 from public.mtr as m
      where m.id = v_mtr and m.consultoria_id = cid and m.empreendimento_id = emp and m.excluido_em is null
    ) then
      raise exception 'mtr_invalido' using errcode = '22023';
    end if;
    if v_mtr = any (vistos) then
      continue;
    end if;
    vistos := vistos || v_mtr;

    insert into public.cdf_mtr (consultoria_id, empreendimento_id, cdf_id, mtr_id, mtr_item_id)
    select cid, emp, p_cdf_id, v_mtr, i.id
    from public.mtr_item as i
    where i.consultoria_id = cid and i.mtr_id = v_mtr;

    if entrada ? 'itens' and jsonb_typeof(entrada -> 'itens') = 'array' then
      for item in select e from jsonb_array_elements(entrada -> 'itens') as e loop
        v_item := nullif(item ->> 'mtr_item_id', '')::uuid;
        if v_item is null or not exists (
          select 1 from public.mtr_item as i where i.id = v_item and i.consultoria_id = cid and i.mtr_id = v_mtr
        ) then
          raise exception 'item_do_mtr_invalido' using errcode = '22023';
        end if;
        if jsonb_typeof(coalesce(item -> 'quantidade', 'null'::jsonb)) = 'null' then
          if jsonb_typeof(coalesce(item -> 'unidade', 'null'::jsonb)) <> 'null' then
            raise exception 'quantidade_sem_unidade' using errcode = '22023';
          end if;
          continue;
        end if;
        if coalesce(item ->> 'unidade', '') not in ('t', 'kg', 'm3', 'l', 'un') then
          raise exception 'unidade_de_residuo_invalida' using errcode = '22023';
        end if;
        update public.cdf_mtr as l
        set quantidade = private.quantidade_residuo(item -> 'quantidade'), unidade = item ->> 'unidade'
        where l.cdf_id = p_cdf_id and l.mtr_item_id = v_item;
      end loop;
    end if;
  end loop;
end;
$$;

revoke all on function private.gravar_mtrs_do_cdf(uuid, uuid, uuid, jsonb) from public, anon, authenticated;

create function private.validar_cdf(
  cid uuid,
  p_numero text,
  p_emitido_em date,
  p_destinador_nome text,
  p_periodo_inicio date,
  p_periodo_fim date
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if btrim(coalesce(p_numero, '')) = '' then
    raise exception 'numero_documento_obrigatorio' using errcode = '22023';
  end if;
  if p_emitido_em is null then
    raise exception 'emissao_obrigatoria' using errcode = '22023';
  end if;
  if p_emitido_em > private.hoje_da_consultoria(cid) then
    raise exception 'emissao_futura' using errcode = '22023';
  end if;
  if btrim(coalesce(p_destinador_nome, '')) = '' then
    raise exception 'destinador_obrigatorio' using errcode = '22023';
  end if;
  if p_periodo_inicio is null or p_periodo_fim is null or p_periodo_inicio > p_periodo_fim then
    raise exception 'periodo_invalido' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.validar_cdf(uuid, text, date, text, date, date) from public, anon, authenticated;

-- RPC: registrar CDF com os MTRs cobertos, numa transação. Idempotente pelo id.
create function public.registrar_cdf(
  p_id uuid,
  p_empreendimento_id uuid,
  p_numero text,
  p_emitido_em date,
  p_destinador_nome text,
  p_destinador_cnpj text,
  p_periodo_inicio date,
  p_periodo_fim date,
  p_mtrs jsonb,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid;
  autor uuid;
  existente public.cdf;
begin
  select e.consultoria_id into cid from public.empreendimento as e where e.id = p_empreendimento_id;
  autor := private.membro_atual(cid);
  if cid is null or autor is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'id_obrigatorio' using errcode = '22023';
  end if;

  select * into existente from public.cdf as c where c.id = p_id;
  if found then
    if existente.consultoria_id = cid and existente.empreendimento_id = p_empreendimento_id then
      return p_id;
    end if;
    raise exception 'cdf_existente' using errcode = 'P0001';
  end if;

  perform private.validar_cdf(cid, p_numero, p_emitido_em, p_destinador_nome, p_periodo_inicio, p_periodo_fim);

  insert into public.cdf (id, consultoria_id, empreendimento_id, numero, emitido_em, destinador_nome,
                          destinador_cnpj, periodo_inicio, periodo_fim, observacao, criado_por)
  values (p_id, cid, p_empreendimento_id, btrim(p_numero), p_emitido_em, btrim(p_destinador_nome),
          private.cnpj_valido(p_destinador_cnpj), p_periodo_inicio, p_periodo_fim,
          nullif(btrim(coalesce(p_observacao, '')), ''), autor);

  perform private.gravar_mtrs_do_cdf(cid, p_empreendimento_id, p_id, p_mtrs);
  return p_id;
end;
$$;

create function private.cdf_para_editar(p_id uuid, p_row_version integer)
returns public.cdf
language plpgsql
set search_path = ''
as $$
declare
  alvo public.cdf;
begin
  select * into alvo from public.cdf as c where c.id = p_id for update;
  if not found or private.membro_atual(alvo.consultoria_id) is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.excluido_em is not null then
    raise exception 'registro_excluido' using errcode = 'P0001';
  end if;
  if p_row_version is distinct from alvo.row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  return alvo;
end;
$$;

revoke all on function private.cdf_para_editar(uuid, integer) from public, anon, authenticated;

-- RPC: editar o CDF e os MTRs cobertos (substitui a lista). Devolve a nova row_version.
create function public.editar_cdf(
  p_id uuid,
  p_row_version integer,
  p_numero text,
  p_emitido_em date,
  p_destinador_nome text,
  p_destinador_cnpj text,
  p_periodo_inicio date,
  p_periodo_fim date,
  p_mtrs jsonb,
  p_observacao text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.cdf := private.cdf_para_editar(p_id, p_row_version);
begin
  perform private.validar_cdf(alvo.consultoria_id, p_numero, p_emitido_em, p_destinador_nome,
                              p_periodo_inicio, p_periodo_fim);

  update public.cdf as c
  set numero = btrim(p_numero), emitido_em = p_emitido_em, destinador_nome = btrim(p_destinador_nome),
      destinador_cnpj = private.cnpj_valido(p_destinador_cnpj), periodo_inicio = p_periodo_inicio,
      periodo_fim = p_periodo_fim, observacao = nullif(btrim(coalesce(p_observacao, '')), ''),
      atualizado_em = now(), row_version = alvo.row_version + 1
  where c.id = p_id;

  perform private.gravar_mtrs_do_cdf(alvo.consultoria_id, alvo.empreendimento_id, p_id, p_mtrs);
  return alvo.row_version + 1;
end;
$$;

-- RPC: excluir (lógico). Os MTRs que ele cobria voltam a aparecer sem CDF na conferência.
create function public.excluir_cdf(p_id uuid, p_row_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.cdf := private.cdf_para_editar(p_id, p_row_version);
begin
  update public.cdf as c
  set excluido_em = now(), excluido_por = private.membro_atual(alvo.consultoria_id),
      atualizado_em = now(), row_version = alvo.row_version + 1
  where c.id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. PDF do MTR ou do CDF (o arquivo já foi enviado ao Storage em consultoria_id/<mtr|cdf>/<uuid>.pdf).
-- Cada envio é uma versão nova e imutável; repetir com a mesma versão devolve a mesma.
-- ---------------------------------------------------------------------------
create function public.anexar_pdf_residuo(
  p_entidade text,
  p_registro_id uuid,
  p_versao_id uuid,
  p_caminho text,
  p_nome_original text,
  p_sha256 text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid;
  excluido timestamptz;
  doc uuid;
  doc_da_versao uuid;
  objeto record;
  proximo integer;
begin
  if p_entidade = 'mtr' then
    select m.consultoria_id, m.excluido_em, m.documento_id into cid, excluido, doc
    from public.mtr as m where m.id = p_registro_id for update;
  elsif p_entidade = 'cdf' then
    select c.consultoria_id, c.excluido_em, c.documento_id into cid, excluido, doc
    from public.cdf as c where c.id = p_registro_id for update;
  else
    raise exception 'entidade_invalida' using errcode = '22023';
  end if;
  if cid is null or private.membro_atual(cid) is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if excluido is not null then
    raise exception 'registro_excluido' using errcode = 'P0001';
  end if;

  select v.documento_id into doc_da_versao from public.documento_versao as v where v.id = p_versao_id;
  if found then
    if doc_da_versao = doc then
      return p_versao_id;
    end if;
    raise exception 'versao_existente' using errcode = 'P0001';
  end if;

  if p_caminho is null
     or p_caminho !~ ('^' || cid::text || '/' || p_entidade || '/[0-9a-f-]{36}\.pdf$') then
    raise exception 'caminho_invalido' using errcode = '22023';
  end if;
  if coalesce(lower(p_sha256), '') !~ '^[0-9a-f]{64}$' or btrim(coalesce(p_nome_original, '')) = '' then
    raise exception 'caminho_invalido' using errcode = '22023';
  end if;

  select o.metadata ->> 'mimetype' as mime, (o.metadata ->> 'size')::bigint as tamanho
  into objeto
  from storage.objects as o
  where o.bucket_id = 'arquivos' and o.name = p_caminho;
  if not found then
    raise exception 'arquivo_nao_encontrado' using errcode = 'P0001';
  end if;
  if objeto.mime is distinct from 'application/pdf' then
    raise exception 'arquivo_nao_pdf' using errcode = '22023';
  end if;
  if coalesce(objeto.tamanho, 0) <= 0 or objeto.tamanho > 26214400 then
    raise exception 'arquivo_grande_demais' using errcode = '22023';
  end if;

  if doc is null then
    insert into public.documento (consultoria_id, entidade) values (cid, p_entidade) returning id into doc;
  end if;

  select coalesce(max(v.numero), 0) + 1 into proximo from public.documento_versao as v where v.documento_id = doc;

  insert into public.documento_versao (id, consultoria_id, documento_id, numero, caminho, nome_original, mime,
                                       tamanho_bytes, sha256, autor_id)
  values (p_versao_id, cid, doc, proximo, p_caminho, btrim(p_nome_original), objeto.mime, objeto.tamanho,
          lower(p_sha256), private.membro_atual(cid));

  update public.documento as d set versao_vigente_id = p_versao_id where d.id = doc;
  if p_entidade = 'mtr' then
    update public.mtr as m set documento_id = doc where m.id = p_registro_id and m.documento_id is distinct from doc;
  else
    update public.cdf as c set documento_id = doc where c.id = p_registro_id and c.documento_id is distinct from doc;
  end if;
  return p_versao_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Obrigações (só a Gestão liga e desliga)
-- ---------------------------------------------------------------------------
create function public.definir_obrigacao_residuo(
  p_empreendimento_id uuid,
  p_tipo text,
  p_ativa boolean,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid;
  autor uuid;
  gravada uuid;
begin
  select e.consultoria_id into cid from public.empreendimento as e where e.id = p_empreendimento_id;
  autor := private.membro_atual(cid);
  if cid is null or autor is null or not private.is_gestao(cid) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_tipo is null or p_tipo not in ('dmr_trimestral', 'inventario_nacional', 'rapp_ibama', 'dmrsu_mensal') then
    raise exception 'tipo_de_obrigacao_invalido' using errcode = '22023';
  end if;

  insert into public.obrigacao_residuo as o (consultoria_id, empreendimento_id, tipo, ativa, observacao, atualizado_por)
  values (cid, p_empreendimento_id, p_tipo, coalesce(p_ativa, false), nullif(btrim(coalesce(p_observacao, '')), ''), autor)
  on conflict (consultoria_id, empreendimento_id, tipo) do update
    set ativa = excluded.ativa, observacao = excluded.observacao, atualizado_por = excluded.atualizado_por,
        atualizado_em = now()
    where (o.ativa, o.observacao) is distinct from (excluded.ativa, excluded.observacao)
  returning o.id into gravada;

  if gravada is null then
    select o.id into gravada from public.obrigacao_residuo as o
    where o.consultoria_id = cid and o.empreendimento_id = p_empreendimento_id and o.tipo = p_tipo;
  end if;
  return gravada;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Prazos das obrigações (espelho de prazosDaObrigacaoResiduo em packages/domain/src/residuos.ts)
-- DMR trimestral: mês seguinte ao trimestre; transição da Portaria IMA 9/2026: a DMR do 1º semestre
-- de 2026 vai no 3º trimestre de 2026 (01/07 a 30/09/2026). DMRSU: mês seguinte. Inventário
-- Nacional: até 31/03. RAPP: 01/02 a 31/03.
-- ---------------------------------------------------------------------------
create function private.prazos_da_obrigacao_residuo(p_tipo text, p_de date, p_ate date)
returns table (referencia text, inicio date, prazo date)
language sql
stable
set search_path = ''
as $$
  with anos as (
    select a::integer as ano
    from generate_series(extract(year from p_de)::integer - 1, extract(year from p_ate)::integer) as a
  ),
  meses as (
    select m::integer as mes,
           (array['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
                  'setembro', 'outubro', 'novembro', 'dezembro'])[m] as nome
    from generate_series(1, 12) as m
  ),
  candidatos as (
    select '1º semestre de 2026'::text as referencia, date '2026-07-01' as inicio, date '2026-09-30' as prazo
    from anos
    where p_tipo = 'dmr_trimestral' and anos.ano = 2026
    union all
    select format('%sº trimestre de %s', t, anos.ano),
           (make_date(anos.ano, t * 3, 1) + interval '1 month')::date,
           (make_date(anos.ano, t * 3, 1) + interval '2 months' - interval '1 day')::date
    from anos
    cross join generate_series(1, 4) as t
    where p_tipo = 'dmr_trimestral' and anos.ano >= 2026 and (anos.ano > 2026 or t >= 3)
    union all
    select format('%s de %s', meses.nome, anos.ano),
           (make_date(anos.ano, meses.mes, 1) + interval '1 month')::date,
           (make_date(anos.ano, meses.mes, 1) + interval '2 months' - interval '1 day')::date
    from anos
    cross join meses
    where p_tipo = 'dmrsu_mensal'
    union all
    select format('entrega de %s', anos.ano), null::date, make_date(anos.ano, 3, 31)
    from anos
    where p_tipo = 'inventario_nacional'
    union all
    select format('entrega de %s', anos.ano), make_date(anos.ano, 2, 1), make_date(anos.ano, 3, 31)
    from anos
    where p_tipo = 'rapp_ibama'
  )
  select c.referencia, c.inicio, c.prazo
  from candidatos as c
  where c.prazo between p_de and p_ate
  order by c.prazo
$$;

revoke all on function private.prazos_da_obrigacao_residuo(text, date, date) from public, anon;
grant execute on function private.prazos_da_obrigacao_residuo(text, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Leitura (security invoker: a RLS de quem chama decide o que aparece)
-- ---------------------------------------------------------------------------
-- Obrigações do empreendimento: sempre as 4, ligadas ou não.
create function public.obrigacoes_residuo(p_empreendimento_id uuid)
returns table (
  tipo text,
  ativa boolean,
  observacao text,
  obrigacao_id uuid,
  atualizado_em timestamptz
)
language sql
stable
set search_path = ''
as $$
  select t.tipo, coalesce(o.ativa, false), o.observacao, o.id, o.atualizado_em
  from public.empreendimento as e
  cross join (values (1, 'dmr_trimestral'), (2, 'dmrsu_mensal'), (3, 'inventario_nacional'),
                     (4, 'rapp_ibama')) as t (ordem, tipo)
  left join public.obrigacao_residuo as o
    on o.consultoria_id = e.consultoria_id and o.empreendimento_id = e.id and o.tipo = t.tipo
  where e.id = p_empreendimento_id
  order by t.ordem
$$;

-- Prazos das obrigações ligadas, para o calendário. Padrão: de hoje (fuso da consultoria) a um ano.
-- dias = prazo − hoje. Janela máxima de 3 anos.
create function public.prazos_obrigacoes_residuo(
  p_consultoria_id uuid,
  p_de date default null,
  p_ate date default null,
  p_empreendimento_id uuid default null
)
returns table (
  obrigacao_id uuid,
  empreendimento_id uuid,
  empreendimento_nome text,
  tipo text,
  referencia text,
  inicio date,
  prazo date,
  dias integer,
  observacao text
)
language sql
stable
set search_path = ''
as $$
  with janela as (
    select h.hoje,
           coalesce(p_de, h.hoje) as de,
           least(coalesce(p_ate, coalesce(p_de, h.hoje) + 365), coalesce(p_de, h.hoje) + 1096) as ate
    from (select private.hoje_da_consultoria(p_consultoria_id) as hoje) as h
  )
  select o.id, e.id, e.nome, o.tipo, p.referencia, p.inicio, p.prazo, (p.prazo - j.hoje)::integer, o.observacao
  from janela as j
  join public.obrigacao_residuo as o on o.consultoria_id = p_consultoria_id and o.ativa
  join public.empreendimento as e on e.consultoria_id = o.consultoria_id and e.id = o.empreendimento_id
  cross join lateral private.prazos_da_obrigacao_residuo(o.tipo, j.de, j.ate) as p
  where j.hoje is not null
    and (p_empreendimento_id is null or o.empreendimento_id = p_empreendimento_id)
  order by p.prazo, e.nome, o.tipo
$$;

-- PDF vigente de um documento (caminho e nome original), para as listas.
create function private.pdf_vigente(cid uuid, doc uuid)
returns table (caminho text, nome_original text)
language sql
stable
set search_path = ''
as $$
  select v.caminho, v.nome_original
  from public.documento as d
  join public.documento_versao as v on v.consultoria_id = d.consultoria_id and v.id = d.versao_vigente_id
  where d.consultoria_id = cid and d.id = doc and d.excluido_em is null
$$;

revoke all on function private.pdf_vigente(uuid, uuid) from public, anon;
grant execute on function private.pdf_vigente(uuid, uuid) to authenticated;

-- MTRs paginados (50 por padrão, até 100), mais recentes primeiro, com itens e CDFs que os cobrem.
-- p_sem_cdf: só os que nenhum CDF (não excluído) cobre. Busca: número, transportador ou destinador.
create function public.listar_mtrs(
  p_consultoria_id uuid,
  p_empreendimento_id uuid default null,
  p_de date default null,
  p_ate date default null,
  p_situacao text default null,
  p_sem_cdf boolean default false,
  p_busca text default null,
  p_limite integer default 50,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  empreendimento_id uuid,
  empreendimento_nome text,
  numero text,
  emitido_em date,
  situacao text,
  transportador_nome text,
  transportador_cnpj text,
  destinador_nome text,
  destinador_cnpj text,
  observacao text,
  pdf_caminho text,
  pdf_nome text,
  itens jsonb,
  cdfs jsonb,
  tem_cdf boolean,
  row_version integer,
  criado_em timestamptz,
  total bigint
)
language sql
stable
set search_path = ''
as $$
  with base as (
    select m.*, e.nome as empreendimento_nome,
           coalesce((
             select jsonb_agg(jsonb_build_object('id', c.id, 'numero', c.numero, 'emitido_em', c.emitido_em)
                              order by c.emitido_em, c.numero)
             from public.cdf as c
             where c.consultoria_id = m.consultoria_id and c.excluido_em is null
               and exists (select 1 from public.cdf_mtr as l
                           where l.consultoria_id = c.consultoria_id and l.cdf_id = c.id and l.mtr_id = m.id)
           ), '[]'::jsonb) as cdfs
    from public.mtr as m
    join public.empreendimento as e on e.consultoria_id = m.consultoria_id and e.id = m.empreendimento_id
    where m.consultoria_id = p_consultoria_id
      and m.excluido_em is null
      and (p_empreendimento_id is null or m.empreendimento_id = p_empreendimento_id)
      and (p_de is null or m.emitido_em >= p_de)
      and (p_ate is null or m.emitido_em <= p_ate)
      and (p_situacao is null or m.situacao = p_situacao)
      and (
        btrim(coalesce(p_busca, '')) = ''
        or private.normalizar_nome(m.numero) like private.padrao_de_busca(p_busca)
        or private.normalizar_nome(m.transportador_nome) like private.padrao_de_busca(p_busca)
        or private.normalizar_nome(m.destinador_nome) like private.padrao_de_busca(p_busca)
      )
  )
  select b.id, b.empreendimento_id, b.empreendimento_nome, b.numero, b.emitido_em, b.situacao,
         b.transportador_nome, b.transportador_cnpj, b.destinador_nome, b.destinador_cnpj, b.observacao,
         pdf.caminho, pdf.nome_original,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', i.id, 'posicao', i.posicao, 'residuo_codigo', i.residuo_codigo,
                    'residuo_descricao', i.residuo_descricao, 'classe', i.classe,
                    'quantidade', i.quantidade, 'unidade', i.unidade) order by i.posicao)
           from public.mtr_item as i
           where i.consultoria_id = b.consultoria_id and i.mtr_id = b.id
         ), '[]'::jsonb),
         b.cdfs,
         jsonb_array_length(b.cdfs) > 0,
         b.row_version, b.criado_em,
         count(*) over ()
  from base as b
  left join lateral private.pdf_vigente(b.consultoria_id, b.documento_id) as pdf on true
  where not coalesce(p_sem_cdf, false) or (jsonb_array_length(b.cdfs) = 0 and b.situacao <> 'cancelado')
  order by b.emitido_em desc, b.numero, b.id
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0)
$$;

-- CDFs paginados, mais recentes primeiro, com os MTRs cobertos e, por item, a quantidade do MTR e
-- a informada no CDF.
create function public.listar_cdfs(
  p_consultoria_id uuid,
  p_empreendimento_id uuid default null,
  p_de date default null,
  p_ate date default null,
  p_busca text default null,
  p_limite integer default 50,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  empreendimento_id uuid,
  empreendimento_nome text,
  numero text,
  emitido_em date,
  destinador_nome text,
  destinador_cnpj text,
  periodo_inicio date,
  periodo_fim date,
  observacao text,
  pdf_caminho text,
  pdf_nome text,
  mtrs jsonb,
  row_version integer,
  criado_em timestamptz,
  total bigint
)
language sql
stable
set search_path = ''
as $$
  select c.id, c.empreendimento_id, e.nome, c.numero, c.emitido_em, c.destinador_nome, c.destinador_cnpj,
         c.periodo_inicio, c.periodo_fim, c.observacao, pdf.caminho, pdf.nome_original,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'mtr_id', m.id, 'numero', m.numero, 'emitido_em', m.emitido_em, 'situacao', m.situacao,
                    'itens', (
                      select jsonb_agg(jsonb_build_object(
                               'mtr_item_id', i.id, 'residuo_codigo', i.residuo_codigo,
                               'residuo_descricao', i.residuo_descricao, 'quantidade_mtr', i.quantidade,
                               'unidade_mtr', i.unidade, 'quantidade', l.quantidade, 'unidade', l.unidade)
                             order by i.posicao)
                      from public.cdf_mtr as l
                      join public.mtr_item as i on i.consultoria_id = l.consultoria_id and i.id = l.mtr_item_id
                      where l.consultoria_id = c.consultoria_id and l.cdf_id = c.id and l.mtr_id = m.id
                    )) order by m.emitido_em, m.numero)
           from public.mtr as m
           where m.consultoria_id = c.consultoria_id
             and exists (select 1 from public.cdf_mtr as l
                         where l.consultoria_id = c.consultoria_id and l.cdf_id = c.id and l.mtr_id = m.id)
         ), '[]'::jsonb),
         c.row_version, c.criado_em,
         count(*) over ()
  from public.cdf as c
  join public.empreendimento as e on e.consultoria_id = c.consultoria_id and e.id = c.empreendimento_id
  left join lateral private.pdf_vigente(c.consultoria_id, c.documento_id) as pdf on true
  where c.consultoria_id = p_consultoria_id
    and c.excluido_em is null
    and (p_empreendimento_id is null or c.empreendimento_id = p_empreendimento_id)
    and (p_de is null or c.emitido_em >= p_de)
    and (p_ate is null or c.emitido_em <= p_ate)
    and (
      btrim(coalesce(p_busca, '')) = ''
      or private.normalizar_nome(c.numero) like private.padrao_de_busca(p_busca)
      or private.normalizar_nome(c.destinador_nome) like private.padrao_de_busca(p_busca)
    )
  order by c.emitido_em desc, c.numero, c.id
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0)
$$;

-- Conferência CDF x MTR (espelho de conferirCdfMtr). Calculada a cada leitura, nunca gravada.
create function public.conferencia_residuos(p_consultoria_id uuid, p_empreendimento_id uuid default null)
returns table (
  tipo text,
  mtr_id uuid,
  numero text,
  emitido_em date,
  empreendimento_id uuid,
  empreendimento_nome text,
  dias integer,
  mtr_item_id uuid,
  residuo_codigo text,
  residuo_descricao text,
  unidade text,
  quantidade_mtr numeric,
  quantidade_cdf numeric,
  diferenca numeric,
  cdfs jsonb,
  unidades_cdf jsonb
)
language sql
stable
set search_path = ''
as $$
  with hoje as (
    select private.hoje_da_consultoria(p_consultoria_id) as d
  ),
  mtrs as (
    select m.id, m.numero, m.emitido_em, m.situacao, m.empreendimento_id, e.nome as empreendimento_nome
    from public.mtr as m
    join public.empreendimento as e on e.consultoria_id = m.consultoria_id and e.id = m.empreendimento_id
    where m.consultoria_id = p_consultoria_id and m.excluido_em is null and m.situacao <> 'cancelado'
      and (p_empreendimento_id is null or m.empreendimento_id = p_empreendimento_id)
  ),
  ligacoes as (
    select l.mtr_id, l.mtr_item_id, l.cdf_id, c.numero as cdf_numero, l.quantidade, l.unidade
    from public.cdf_mtr as l
    join public.cdf as c on c.consultoria_id = l.consultoria_id and c.id = l.cdf_id
    where l.consultoria_id = p_consultoria_id and c.excluido_em is null
  ),
  sem_cdf as (
    select 'mtr_sem_cdf'::text as tipo, m.id as mtr_id, m.numero, m.emitido_em, m.empreendimento_id,
           m.empreendimento_nome, (h.d - m.emitido_em)::integer as dias, null::uuid as mtr_item_id,
           null::text as residuo_codigo, null::text as residuo_descricao, null::text as unidade,
           null::numeric as quantidade_mtr, null::numeric as quantidade_cdf, null::numeric as diferenca,
           '[]'::jsonb as cdfs, '[]'::jsonb as unidades_cdf, 0 as posicao
    from mtrs as m
    cross join hoje as h
    where m.situacao in ('salvo', 'recebido')
      and h.d - m.emitido_em > 30
      and not exists (select 1 from ligacoes as l where l.mtr_id = m.id)
  ),
  recebido as (
    select i.id as item_id, i.mtr_id, i.posicao, i.residuo_codigo, i.residuo_descricao, i.quantidade, i.unidade,
           jsonb_agg(distinct jsonb_build_object('id', l.cdf_id, 'numero', l.cdf_numero)) as cdfs,
           jsonb_agg(distinct l.unidade) as unidades,
           bool_or(private.tipo_unidade_residuo(l.unidade) <> private.tipo_unidade_residuo(i.unidade)) as incompativel,
           sum(l.quantidade * private.fator_unidade_residuo(l.unidade)) as base_cdf
    from public.mtr_item as i
    join mtrs as m on m.id = i.mtr_id
    join ligacoes as l on l.mtr_item_id = i.id and l.quantidade is not null
    where i.consultoria_id = p_consultoria_id
    group by i.id, i.mtr_id, i.posicao, i.residuo_codigo, i.residuo_descricao, i.quantidade, i.unidade
  ),
  por_item as (
    select case when r.incompativel then 'unidades_diferentes' else 'quantidade_diferente' end,
           m.id, m.numero, m.emitido_em, m.empreendimento_id, m.empreendimento_nome, null::integer,
           r.item_id, r.residuo_codigo, r.residuo_descricao, r.unidade, r.quantidade,
           case when r.incompativel then null
                else trim_scale(r.base_cdf / private.fator_unidade_residuo(r.unidade)) end,
           case when r.incompativel then null
                else trim_scale(r.base_cdf / private.fator_unidade_residuo(r.unidade) - r.quantidade) end,
           r.cdfs, case when r.incompativel then r.unidades else '[]'::jsonb end,
           r.posicao
    from recebido as r
    join mtrs as m on m.id = r.mtr_id
    where r.incompativel or r.base_cdf <> r.quantidade * private.fator_unidade_residuo(r.unidade)
  )
  select p.tipo, p.mtr_id, p.numero, p.emitido_em, p.empreendimento_id, p.empreendimento_nome, p.dias,
         p.mtr_item_id, p.residuo_codigo, p.residuo_descricao, p.unidade, p.quantidade_mtr, p.quantidade_cdf,
         p.diferenca, p.cdfs, p.unidades_cdf
  from (select * from sem_cdf union all select * from por_item) as p
  order by p.emitido_em, p.numero, p.posicao
$$;

-- Painel: quantidade por mês de emissão, empreendimento, resíduo, destinador e unidade do painel
-- (massa em t, volume em m³, un). MTR cancelado não entra. A tela soma como precisar.
create function public.painel_residuos(
  p_consultoria_id uuid,
  p_empreendimento_id uuid default null,
  p_de date default null,
  p_ate date default null
)
returns table (
  mes date,
  empreendimento_id uuid,
  empreendimento_nome text,
  residuo_codigo text,
  residuo_descricao text,
  destinador_nome text,
  unidade text,
  quantidade numeric,
  mtrs bigint
)
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', m.emitido_em)::date,
         m.empreendimento_id,
         min(e.nome),
         i.residuo_codigo,
         min(i.residuo_descricao),
         min(m.destinador_nome),
         private.unidade_do_painel(i.unidade),
         trim_scale(sum(i.quantidade * private.fator_unidade_residuo(i.unidade)
                        / private.fator_unidade_residuo(private.unidade_do_painel(i.unidade)))),
         count(distinct m.id)
  from public.mtr as m
  join public.mtr_item as i on i.consultoria_id = m.consultoria_id and i.mtr_id = m.id
  join public.empreendimento as e on e.consultoria_id = m.consultoria_id and e.id = m.empreendimento_id
  where m.consultoria_id = p_consultoria_id
    and m.excluido_em is null
    and m.situacao <> 'cancelado'
    and (p_empreendimento_id is null or m.empreendimento_id = p_empreendimento_id)
    and (p_de is null or m.emitido_em >= p_de)
    and (p_ate is null or m.emitido_em <= p_ate)
  group by date_trunc('month', m.emitido_em)::date, m.empreendimento_id, i.residuo_codigo,
           private.normalizar_nome(m.destinador_nome), private.unidade_do_painel(i.unidade)
  order by 1, 3, 4, 6
$$;

-- ---------------------------------------------------------------------------
-- 11. Permissões das RPCs: só usuário logado.
-- ---------------------------------------------------------------------------
revoke all on function public.registrar_mtr(uuid, uuid, text, date, text, text, text, text, text, jsonb, text) from public, anon;
revoke all on function public.editar_mtr(uuid, integer, text, date, text, text, text, text, text, jsonb, text) from public, anon;
revoke all on function public.excluir_mtr(uuid, integer) from public, anon;
revoke all on function public.registrar_cdf(uuid, uuid, text, date, text, text, date, date, jsonb, text) from public, anon;
revoke all on function public.editar_cdf(uuid, integer, text, date, text, text, date, date, jsonb, text) from public, anon;
revoke all on function public.excluir_cdf(uuid, integer) from public, anon;
revoke all on function public.anexar_pdf_residuo(text, uuid, uuid, text, text, text) from public, anon;
revoke all on function public.definir_obrigacao_residuo(uuid, text, boolean, text) from public, anon;
revoke all on function public.obrigacoes_residuo(uuid) from public, anon;
revoke all on function public.prazos_obrigacoes_residuo(uuid, date, date, uuid) from public, anon;
revoke all on function public.listar_mtrs(uuid, uuid, date, date, text, boolean, text, integer, integer) from public, anon;
revoke all on function public.listar_cdfs(uuid, uuid, date, date, text, integer, integer) from public, anon;
revoke all on function public.conferencia_residuos(uuid, uuid) from public, anon;
revoke all on function public.painel_residuos(uuid, uuid, date, date) from public, anon;

grant execute on function public.registrar_mtr(uuid, uuid, text, date, text, text, text, text, text, jsonb, text) to authenticated;
grant execute on function public.editar_mtr(uuid, integer, text, date, text, text, text, text, text, jsonb, text) to authenticated;
grant execute on function public.excluir_mtr(uuid, integer) to authenticated;
grant execute on function public.registrar_cdf(uuid, uuid, text, date, text, text, date, date, jsonb, text) to authenticated;
grant execute on function public.editar_cdf(uuid, integer, text, date, text, text, date, date, jsonb, text) to authenticated;
grant execute on function public.excluir_cdf(uuid, integer) to authenticated;
grant execute on function public.anexar_pdf_residuo(text, uuid, uuid, text, text, text) to authenticated;
grant execute on function public.definir_obrigacao_residuo(uuid, text, boolean, text) to authenticated;
grant execute on function public.obrigacoes_residuo(uuid) to authenticated;
grant execute on function public.prazos_obrigacoes_residuo(uuid, date, date, uuid) to authenticated;
grant execute on function public.listar_mtrs(uuid, uuid, date, date, text, boolean, text, integer, integer) to authenticated;
grant execute on function public.listar_cdfs(uuid, uuid, date, date, text, integer, integer) to authenticated;
grant execute on function public.conferencia_residuos(uuid, uuid) to authenticated;
grant execute on function public.painel_residuos(uuid, uuid, date, date) to authenticated;
