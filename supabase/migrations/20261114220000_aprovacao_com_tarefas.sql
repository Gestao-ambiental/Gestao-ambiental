-- Aprovação do orçamento com tarefas (ADR-0029; FIN-01, FIN-03; Protótipo 22; estudo
-- docs/estudos/aprovacao-tarefas-e-capacidade.md, fatia 1).
--
-- 1. orcamento_aceite: quem aprovou pelo cliente, data, referência e método, com o hash SHA-256 do
--    conteúdo comercial da revisão aprovada. Um por revisão. Só a Gestão lê (dado comercial).
-- 2. tarefa_servico: o trabalho da execução, uma por item do orçamento (ou acrescentada à mão), com
--    responsável (membro), horas estimadas (nulo = não estimada, nunca zero), prazo interno (DATE)
--    e situação. Todo membro ativo lê. Escrita só pelas RPCs.
-- 3. aprovar_orcamento: muda a situação (pelo mesmo caminho de mudar_situacao_orcamento), grava o
--    aceite e cria as tarefas numa transação. Item que já tem tarefa (revisão anterior aprovada)
--    não ganha outra; tarefa cujo item saiu numa revisão fica marcada "fora da revisão".
-- 4. Tarefas: listar (com o código do orçamento e o empreendimento, sem valores), mudar a situação
--    (responsável ou Gestão), editar e acrescentar (Gestão).
-- 5. carga_da_equipe passa a contar a tarefa no lugar do item quando ela existe (nada conta duas
--    vezes) e as tarefas acrescentadas à mão, pelo mês do prazo interno.

create type public.situacao_tarefa_servico as enum ('a_fazer', 'em_andamento', 'concluida', 'cancelada');

-- ---------------------------------------------------------------------------
-- 1. Aceite
-- ---------------------------------------------------------------------------
create table public.orcamento_aceite (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  orcamento_id uuid not null,
  revisao integer not null,
  aprovado_por text not null,
  data_aceite date not null,
  referencia text not null,
  metodo text,
  conteudo_sha256 text not null,
  registrado_por uuid not null,
  registrado_em timestamptz not null default now(),
  constraint orcamento_aceite_aprovado_por check (length(btrim(aprovado_por)) between 1 and 200),
  constraint orcamento_aceite_referencia check (length(btrim(referencia)) between 1 and 300),
  constraint orcamento_aceite_metodo check (
    metodo is null or metodo in ('email', 'whatsapp', 'telefone', 'reuniao', 'documento_assinado', 'outro')),
  constraint orcamento_aceite_sha256 check (conteudo_sha256 ~ '^[0-9a-f]{64}$'),
  constraint orcamento_aceite_consultoria_id_id_key unique (consultoria_id, id),
  constraint orcamento_aceite_revisao_key unique (consultoria_id, orcamento_id, revisao),
  constraint orcamento_aceite_orcamento_fk foreign key (consultoria_id, orcamento_id)
    references public.orcamento (consultoria_id, id) on delete restrict,
  constraint orcamento_aceite_registrado_por_fk foreign key (consultoria_id, registrado_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.orcamento_aceite is
  'Aceite do cliente por revisão aprovada (FIN-01). O hash não é assinatura qualificada.';

-- ---------------------------------------------------------------------------
-- 2. Tarefas da execução
-- ---------------------------------------------------------------------------
create table public.tarefa_servico (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  orcamento_id uuid not null,
  -- Item de origem. Se o item sai numa revisão, a tarefa fica (sem o item) e é marcada.
  orcamento_item_id uuid,
  gerada_do_item boolean not null,
  fora_da_revisao boolean not null default false,
  ordem integer not null,
  titulo text not null,
  responsavel_id uuid,
  minutos_estimados integer,
  prazo_interno date,
  situacao public.situacao_tarefa_servico not null default 'a_fazer',
  concluida_em timestamptz,
  concluida_por uuid,
  criada_por uuid not null,
  criada_em timestamptz not null default now(),
  row_version integer not null default 1,
  constraint tarefa_servico_titulo check (length(btrim(titulo)) between 1 and 200),
  constraint tarefa_servico_minutos check (minutos_estimados is null or minutos_estimados between 1 and 600000),
  constraint tarefa_servico_conclusao_coerente check (
    (situacao = 'concluida') = (concluida_em is not null and concluida_por is not null)),
  constraint tarefa_servico_consultoria_id_id_key unique (consultoria_id, id),
  constraint tarefa_servico_item_key unique (consultoria_id, orcamento_item_id),
  constraint tarefa_servico_orcamento_fk foreign key (consultoria_id, orcamento_id)
    references public.orcamento (consultoria_id, id) on delete restrict,
  constraint tarefa_servico_item_fk foreign key (consultoria_id, orcamento_item_id)
    references public.orcamento_item (consultoria_id, id) on delete set null (orcamento_item_id),
  constraint tarefa_servico_responsavel_fk foreign key (consultoria_id, responsavel_id)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint tarefa_servico_concluida_por_fk foreign key (consultoria_id, concluida_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint tarefa_servico_criada_por_fk foreign key (consultoria_id, criada_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.tarefa_servico is
  'Tarefas da execução de um orçamento aprovado (FIN-03). Excluir ou reabrir o orçamento não apaga tarefas.';
comment on column public.tarefa_servico.minutos_estimados is 'Nulo = não estimada (nunca zero).';

create index tarefa_servico_orcamento_idx on public.tarefa_servico (consultoria_id, orcamento_id, ordem);
create index tarefa_servico_prazo_idx on public.tarefa_servico (consultoria_id, prazo_interno);
create index tarefa_servico_responsavel_idx on public.tarefa_servico (consultoria_id, responsavel_id);

-- RLS, auditoria e barreiras de escrita (suporte e comercial; teste 020).
do $$
declare
  tabela text;
begin
  foreach tabela in array array['orcamento_aceite', 'tarefa_servico'] loop
    execute format('alter table public.%I enable row level security', tabela);
    execute format('alter table public.%I force row level security', tabela);
    execute format('revoke all on table public.%I from public, anon, authenticated', tabela);
    execute format('grant select on table public.%I to authenticated', tabela);
    execute format(
      'create trigger %I after insert or update or delete on public.%I '
      'for each row execute function private.auditar()',
      tabela || '_auditar', tabela);
    execute format(
      'create trigger _suporte_somente_leitura before insert or update or delete on public.%I '
      'for each row execute function private.bloquear_escrita_do_suporte()', tabela);
    -- Tabela de orçamento segue a regra do plano (orçamentos só no Equipe e no Escala); a tarefa
    -- é execução e continua editável em qualquer plano ativo.
    if tabela like 'orcamento%' then
      execute format(
        'create trigger _comercial_somente_leitura before insert or update or delete on public.%I '
        'for each row execute function private.bloquear_escrita_comercial(''consultoria_id'', ''orcamentos'')',
        tabela);
    else
      execute format(
        'create trigger _comercial_somente_leitura before insert or update or delete on public.%I '
        'for each row execute function private.bloquear_escrita_comercial()', tabela);
    end if;
  end loop;
end;
$$;

create policy orcamento_aceite_select_gestao on public.orcamento_aceite for select to authenticated
  using ((select private.is_gestao(consultoria_id)));
create policy tarefa_servico_select_membro_ativo on public.tarefa_servico for select to authenticated
  using ((select private.is_membro(consultoria_id)));

-- ---------------------------------------------------------------------------
-- 3. Aprovar
-- ---------------------------------------------------------------------------
-- Conteúdo comercial da revisão (o que o cliente aceitou), em texto estável para o hash.
create function private.conteudo_comercial_do_orcamento(p_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'orcamento', o.id,
    'numero', jsonb_build_array(o.ano, o.sequencia, o.revisao),
    'objeto', o.objeto,
    'validade_dias', o.validade_dias,
    'premissas', to_jsonb(o.premissas),
    'exclusoes', to_jsonb(o.exclusoes),
    'preco_visitas_centavos', o.preco_visitas_centavos,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_array(i.descricao, i.quantidade, i.preco_centavos, i.responsabilidade_tecnica)
                       order by i.ordem, i.id)
      from public.orcamento_item as i
      where i.consultoria_id = o.consultoria_id and i.orcamento_id = o.id), '[]'::jsonb),
    'despesas', coalesce((
      select jsonb_agg(jsonb_build_array(d.descricao, d.estimativa_centavos, d.tratamento) order by d.ordem, d.id)
      from public.orcamento_despesa as d
      where d.consultoria_id = o.consultoria_id and d.orcamento_id = o.id), '[]'::jsonb),
    'parcelas', coalesce((
      select jsonb_agg(jsonb_build_array(p.descricao, p.dias, p.percentual_pb) order by p.ordem, p.id)
      from public.orcamento_parcela as p
      where p.consultoria_id = o.consultoria_id and p.orcamento_id = o.id), '[]'::jsonb)
  )::text
  from public.orcamento as o
  where o.id = p_id
$$;

revoke all on function private.conteudo_comercial_do_orcamento(uuid) from public, anon, authenticated;

-- p_tarefas: [{item_id?, titulo, responsavel_id?, minutos?, prazo_interno?}], na ordem da tela.
-- Com p_gerar_tarefas = false, a lista é ignorada. Devolve o row_version novo do orçamento.
create function public.aprovar_orcamento(
  p_id uuid,
  p_row_version integer,
  p_aprovado_por text,
  p_data_aceite date,
  p_referencia text,
  p_metodo text default null,
  p_gerar_tarefas boolean default true,
  p_tarefas jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.orcamento%rowtype;
  autor uuid;
  nova_versao integer;
  aprovado_por_limpo text := btrim(coalesce(p_aprovado_por, ''));
  referencia_limpa text := btrim(coalesce(p_referencia, ''));
  metodo_limpo text := nullif(btrim(coalesce(p_metodo, '')), '');
  t record;
  ordem_base integer;
begin
  select * into alvo from public.orcamento as o where o.id = p_id;
  if not found or not private.is_gestao(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  autor := private.membro_atual(alvo.consultoria_id);
  if autor is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  -- Aceite (FIN-01): pessoa, data e referência obrigatórias; data não no futuro.
  if length(aprovado_por_limpo) = 0 or length(aprovado_por_limpo) > 200 then
    raise exception 'aceite_sem_pessoa' using errcode = '22023';
  end if;
  if p_data_aceite is null or p_data_aceite > private.hoje_da_consultoria(alvo.consultoria_id) then
    raise exception 'aceite_data_invalida' using errcode = '22023';
  end if;
  if length(referencia_limpa) = 0 or length(referencia_limpa) > 300 then
    raise exception 'aceite_sem_referencia' using errcode = '22023';
  end if;
  if metodo_limpo is not null
     and metodo_limpo not in ('email', 'whatsapp', 'telefone', 'reuniao', 'documento_assinado', 'outro') then
    raise exception 'aceite_metodo_invalido' using errcode = '22023';
  end if;

  -- Tarefas: tudo validado antes de gravar qualquer coisa (sem efeitos parciais).
  if p_gerar_tarefas then
    if jsonb_typeof(coalesce(p_tarefas, '[]'::jsonb)) <> 'array' or jsonb_array_length(p_tarefas) > 200 then
      raise exception 'tarefa_invalida' using errcode = '22023';
    end if;
    for t in
      select e.valor, e.ordem from jsonb_array_elements(p_tarefas) with ordinality as e (valor, ordem)
    loop
      if length(btrim(coalesce(t.valor ->> 'titulo', ''))) not between 1 and 200 then
        raise exception 'tarefa_sem_titulo' using errcode = '22023';
      end if;
      if (t.valor ->> 'minutos') is not null
         and ((t.valor ->> 'minutos') !~ '^[0-9]+$' or (t.valor ->> 'minutos')::bigint not between 1 and 600000) then
        raise exception 'tarefa_horas_invalidas' using errcode = '22023';
      end if;
      if (t.valor ->> 'item_id') is not null and not exists (
        select 1 from public.orcamento_item as i
        where i.consultoria_id = alvo.consultoria_id and i.orcamento_id = alvo.id
          and i.id::text = t.valor ->> 'item_id'
      ) then
        raise exception 'tarefa_item_invalido' using errcode = '22023';
      end if;
      perform private.conferir_responsavel(alvo.consultoria_id, (t.valor ->> 'responsavel_id')::uuid);
      perform (t.valor ->> 'prazo_interno')::date;
    end loop;
  end if;

  -- Situação: mesmo caminho e mesmas regras da mudança manual (transição, lixeira, versão, horas).
  nova_versao := public.mudar_situacao_orcamento(p_id, p_row_version, 'aprovada', null);
  select * into alvo from public.orcamento as o where o.id = p_id;

  insert into public.orcamento_aceite (
    consultoria_id, orcamento_id, revisao, aprovado_por, data_aceite, referencia, metodo,
    conteudo_sha256, registrado_por)
  values (
    alvo.consultoria_id, alvo.id, alvo.revisao, aprovado_por_limpo, p_data_aceite, referencia_limpa,
    metodo_limpo,
    encode(sha256(convert_to(private.conteudo_comercial_do_orcamento(alvo.id), 'UTF8')), 'hex'),
    autor);

  if p_gerar_tarefas then
    select coalesce(max(x.ordem), 0) into ordem_base
    from public.tarefa_servico as x
    where x.consultoria_id = alvo.consultoria_id and x.orcamento_id = alvo.id;

    -- Item que já tem tarefa (revisão anterior) não ganha outra.
    insert into public.tarefa_servico (
      consultoria_id, orcamento_id, orcamento_item_id, gerada_do_item, ordem, titulo, responsavel_id,
      minutos_estimados, prazo_interno, criada_por)
    select alvo.consultoria_id, alvo.id, (e.valor ->> 'item_id')::uuid, (e.valor ->> 'item_id') is not null,
           ordem_base + e.ordem::integer, btrim(e.valor ->> 'titulo'), (e.valor ->> 'responsavel_id')::uuid,
           (e.valor ->> 'minutos')::integer, (e.valor ->> 'prazo_interno')::date, autor
    from jsonb_array_elements(p_tarefas) with ordinality as e (valor, ordem)
    on conflict (consultoria_id, orcamento_item_id) do nothing;
  end if;

  -- Tarefa gerada de um item que saiu numa revisão: fica, marcada para a Gestão decidir.
  update public.tarefa_servico as x
  set fora_da_revisao = (x.gerada_do_item and x.orcamento_item_id is null),
      row_version = x.row_version + 1
  where x.consultoria_id = alvo.consultoria_id and x.orcamento_id = alvo.id
    and x.fora_da_revisao is distinct from (x.gerada_do_item and x.orcamento_item_id is null);

  return nova_versao;
end;
$$;

revoke all on function public.aprovar_orcamento(uuid, integer, text, date, text, text, boolean, jsonb) from public, anon;
grant execute on function public.aprovar_orcamento(uuid, integer, text, date, text, text, boolean, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Tarefas: leitura e escrita
-- ---------------------------------------------------------------------------
-- Lista para o orçamento, a visão da equipe e o calendário. Mostra o código do orçamento e o
-- empreendimento (ou prospecto), nunca valores. Qualquer membro ativo.
-- p_abertas: só a fazer e em andamento. Datas filtram o prazo interno (sem prazo fica de fora).
create function public.listar_tarefas_servico(
  p_consultoria_id uuid,
  p_orcamento_id uuid default null,
  p_responsavel_id uuid default null,
  p_sem_responsavel boolean default false,
  p_abertas boolean default false,
  p_de date default null,
  p_ate date default null
)
returns table (
  id uuid,
  orcamento_id uuid,
  orcamento_item_id uuid,
  orcamento_ano integer,
  orcamento_sequencia integer,
  orcamento_revisao integer,
  empreendimento_nome text,
  titulo text,
  responsavel_id uuid,
  responsavel_nome text,
  minutos_estimados integer,
  prazo_interno date,
  dias integer,
  situacao public.situacao_tarefa_servico,
  fora_da_revisao boolean,
  ordem integer,
  row_version integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_membro(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return query
  select x.id, x.orcamento_id, x.orcamento_item_id, o.ano, o.sequencia, o.revisao,
         coalesce(e.nome, o.prospecto_nome, ''),
         x.titulo, x.responsavel_id, m.nome, x.minutos_estimados, x.prazo_interno,
         (x.prazo_interno - private.hoje_da_consultoria(p_consultoria_id))::integer,
         x.situacao, x.fora_da_revisao, x.ordem, x.row_version
  from public.tarefa_servico as x
  join public.orcamento as o on o.consultoria_id = x.consultoria_id and o.id = x.orcamento_id
  left join public.empreendimento as e on e.consultoria_id = o.consultoria_id and e.id = o.empreendimento_id
  left join public.membro as m on m.consultoria_id = x.consultoria_id and m.id = x.responsavel_id
  where x.consultoria_id = p_consultoria_id
    and (p_orcamento_id is null or x.orcamento_id = p_orcamento_id)
    and (p_responsavel_id is null or x.responsavel_id = p_responsavel_id)
    and (not p_sem_responsavel or x.responsavel_id is null)
    and (not p_abertas or x.situacao in ('a_fazer', 'em_andamento'))
    and (p_de is null or x.prazo_interno >= p_de)
    and (p_ate is null or x.prazo_interno <= p_ate)
  order by case when p_orcamento_id is null then x.prazo_interno end nulls last,
           x.orcamento_id, x.ordem, x.id
  limit 500;
end;
$$;

revoke all on function public.listar_tarefas_servico(uuid, uuid, uuid, boolean, boolean, date, date) from public, anon;
grant execute on function public.listar_tarefas_servico(uuid, uuid, uuid, boolean, boolean, date, date) to authenticated;

-- Situação da tarefa. O responsável e a Gestão iniciam, concluem, voltam para "a fazer" e reabrem;
-- cancelar e descancelar só a Gestão. Devolve o row_version novo.
create function public.mudar_situacao_tarefa_servico(p_id uuid, p_row_version integer, p_para text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.tarefa_servico%rowtype;
  autor uuid;
  para public.situacao_tarefa_servico;
  gestao boolean;
begin
  select * into alvo from public.tarefa_servico as x where x.id = p_id for update;
  if not found or not private.is_membro(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  autor := private.membro_atual(alvo.consultoria_id);
  gestao := private.is_gestao(alvo.consultoria_id);
  if autor is null or (not gestao and alvo.responsavel_id is distinct from autor) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  if p_para is null or p_para not in ('a_fazer', 'em_andamento', 'concluida', 'cancelada') then
    raise exception 'transicao_invalida' using errcode = 'P0001';
  end if;
  para := p_para::public.situacao_tarefa_servico;
  if para = alvo.situacao then
    raise exception 'transicao_invalida' using errcode = 'P0001';
  end if;
  if (para = 'cancelada' or alvo.situacao = 'cancelada') and not gestao then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.situacao = 'cancelada' and para <> 'a_fazer' then
    raise exception 'transicao_invalida' using errcode = 'P0001';
  end if;

  update public.tarefa_servico as x
  set situacao = para,
      concluida_em = case when para = 'concluida' then now() end,
      concluida_por = case when para = 'concluida' then autor end,
      row_version = x.row_version + 1
  where x.id = alvo.id;
  return alvo.row_version + 1;
end;
$$;

revoke all on function public.mudar_situacao_tarefa_servico(uuid, integer, text) from public, anon;
grant execute on function public.mudar_situacao_tarefa_servico(uuid, integer, text) to authenticated;

-- Valida título e horas de uma tarefa (escrita da Gestão).
create function private.conferir_tarefa_servico(p_titulo text, p_minutos integer)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if length(btrim(coalesce(p_titulo, ''))) not between 1 and 200 then
    raise exception 'tarefa_sem_titulo' using errcode = '22023';
  end if;
  if p_minutos is not null and p_minutos not between 1 and 600000 then
    raise exception 'tarefa_horas_invalidas' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.conferir_tarefa_servico(text, integer) from public, anon, authenticated;

-- Editar título, responsável, horas e prazo interno (Gestão). Devolve o row_version novo.
create function public.editar_tarefa_servico(
  p_id uuid,
  p_row_version integer,
  p_titulo text,
  p_responsavel_id uuid,
  p_minutos integer,
  p_prazo_interno date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.tarefa_servico%rowtype;
begin
  select * into alvo from public.tarefa_servico as x where x.id = p_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id)
     or private.membro_atual(alvo.consultoria_id) is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  perform private.conferir_tarefa_servico(p_titulo, p_minutos);
  perform private.conferir_responsavel(alvo.consultoria_id, p_responsavel_id);

  update public.tarefa_servico as x
  set titulo = btrim(p_titulo),
      responsavel_id = p_responsavel_id,
      minutos_estimados = p_minutos,
      prazo_interno = p_prazo_interno,
      row_version = x.row_version + 1
  where x.id = alvo.id;
  return alvo.row_version + 1;
end;
$$;

revoke all on function public.editar_tarefa_servico(uuid, integer, text, uuid, integer, date) from public, anon;
grant execute on function public.editar_tarefa_servico(uuid, integer, text, uuid, integer, date) to authenticated;

-- Acrescentar uma tarefa a um orçamento aprovado (Gestão). Idempotente pelo id vindo da tela.
create function public.adicionar_tarefa_servico(
  p_orcamento_id uuid,
  p_id uuid,
  p_titulo text,
  p_responsavel_id uuid,
  p_minutos integer,
  p_prazo_interno date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.orcamento%rowtype;
  autor uuid;
begin
  select * into alvo from public.orcamento as o where o.id = p_orcamento_id;
  if not found or not private.is_gestao(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  autor := private.membro_atual(alvo.consultoria_id);
  if autor is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.situacao <> 'aprovada' then
    raise exception 'orcamento_nao_aprovado' using errcode = 'P0001';
  end if;
  if p_id is null then
    raise exception 'tarefa_invalida' using errcode = '22023';
  end if;
  if exists (select 1 from public.tarefa_servico as x where x.id = p_id) then
    return p_id;
  end if;
  perform private.conferir_tarefa_servico(p_titulo, p_minutos);
  perform private.conferir_responsavel(alvo.consultoria_id, p_responsavel_id);

  insert into public.tarefa_servico (
    id, consultoria_id, orcamento_id, orcamento_item_id, gerada_do_item, ordem, titulo,
    responsavel_id, minutos_estimados, prazo_interno, criada_por)
  values (
    p_id, alvo.consultoria_id, alvo.id, null, false,
    coalesce((select max(x.ordem) from public.tarefa_servico as x
              where x.consultoria_id = alvo.consultoria_id and x.orcamento_id = alvo.id), 0) + 1,
    btrim(p_titulo), p_responsavel_id, p_minutos, p_prazo_interno, autor);
  return p_id;
end;
$$;

revoke all on function public.adicionar_tarefa_servico(uuid, uuid, text, uuid, integer, date) from public, anon;
grant execute on function public.adicionar_tarefa_servico(uuid, uuid, text, uuid, integer, date) to authenticated;

-- Aceites do orçamento, do mais recente ao mais antigo (Gestão; a RLS decide).
create function public.listar_aceites_do_orcamento(p_orcamento_id uuid)
returns table (
  revisao integer,
  aprovado_por text,
  data_aceite date,
  referencia text,
  metodo text,
  conteudo_sha256 text,
  registrado_por_nome text,
  registrado_em timestamptz
)
language sql
stable
set search_path = ''
as $$
  select a.revisao, a.aprovado_por, a.data_aceite, a.referencia, a.metodo, a.conteudo_sha256, m.nome,
         a.registrado_em
  from public.orcamento_aceite as a
  left join public.membro as m on m.consultoria_id = a.consultoria_id and m.id = a.registrado_por
  where a.orcamento_id = p_orcamento_id
  order by a.revisao desc
$$;

revoke all on function public.listar_aceites_do_orcamento(uuid) from public, anon;
grant execute on function public.listar_aceites_do_orcamento(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Carga da equipe: tarefa no lugar do item
-- ---------------------------------------------------------------------------
create or replace function public.carga_da_equipe(p_consultoria_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  inicio date;
begin
  if not private.is_gestao(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select date_trunc('month', (now() at time zone c.fuso))::date into inicio
  from public.consultoria as c where c.id = p_consultoria_id;

  return jsonb_build_object(
    'jornada', coalesce((
      select jsonb_agg(jsonb_build_object('membro_id', e.membro_id, 'horas_mes', e.horas_disponiveis_mes)
                       order by e.ordem)
      from public.orcamento_base_equipe as e
      where e.consultoria_id = p_consultoria_id and e.membro_id is not null), '[]'::jsonb),
    'comprometido', coalesce((
      select jsonb_agg(jsonb_build_object('membro_id', y.responsavel_id, 'mes', y.mes, 'minutos', y.minutos)
                       order by y.mes, y.responsavel_id)
      from (
        select z.responsavel_id, z.mes, sum(z.minutos) as minutos
        from (
          -- Itens aprovados ainda sem tarefa.
          select i.responsavel_id, i.mes_previsto as mes, i.minutos
          from public.orcamento_item as i
          join public.orcamento as o on o.consultoria_id = i.consultoria_id and o.id = i.orcamento_id
          where i.consultoria_id = p_consultoria_id
            and o.situacao = 'aprovada'
            and not exists (
              select 1 from public.tarefa_servico as x
              where x.consultoria_id = i.consultoria_id and x.orcamento_item_id = i.id)
          union all
          -- Tarefas abertas de orçamentos aprovados: o mês do prazo interno (ou o previsto do item).
          select x.responsavel_id,
                 coalesce(date_trunc('month', x.prazo_interno)::date, i.mes_previsto),
                 x.minutos_estimados
          from public.tarefa_servico as x
          join public.orcamento as o on o.consultoria_id = x.consultoria_id and o.id = x.orcamento_id
          left join public.orcamento_item as i
            on i.consultoria_id = x.consultoria_id and i.id = x.orcamento_item_id
          where x.consultoria_id = p_consultoria_id
            and o.situacao = 'aprovada'
            and x.situacao in ('a_fazer', 'em_andamento')
        ) as z
        where z.responsavel_id is not null and z.mes is not null and z.mes >= inicio
          and coalesce(z.minutos, 0) > 0
        group by z.responsavel_id, z.mes
      ) as y), '[]'::jsonb));
end;
$$;
