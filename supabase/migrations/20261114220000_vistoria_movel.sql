-- Vistoria móvel (Campo), primeiro incremento (ADR-0029; CAMPO-01). Protótipo para revisão.
--
-- Toda vistoria nasce de uma ocorrência. O checklist é digitado ao agendar e fica gravado na
-- própria vistoria. Sem modo offline: cada registro grava aqui na hora.
--
--   vistoria           agendamento, responsável, situação e observação geral (row_version)
--   vistoria_item      itens do checklist com o resultado registrado em campo
--   vistoria_foto      foto por item, imutável (exclusão lógica), com localização opcional
--   vistoria_decisao   conferência (aprovar ou devolver), append-only: cada envio, uma decisão
--
-- Quem faz o quê: qualquer membro ativo agenda; o responsável da vistoria ou a Gestão inicia,
-- registra e envia; confere o conferente designado da ocorrência ou, sem ele, a Gestão; com a
-- política de independência, quem registrou a vistoria (itens, fotos ou envio) não confere; só a
-- Gestão cancela, e só antes de aprovada. Ocorrência concluída não aceita registro novo.
-- Escrita só por RPC, leitura pela RLS de membro ativo.

-- ---------------------------------------------------------------------------
-- 1. Tipos e histórico da ocorrência
-- ---------------------------------------------------------------------------
create type public.situacao_vistoria as enum (
  'planejada', 'em_andamento', 'enviada', 'devolvida', 'aprovada', 'cancelada'
);
create type public.resultado_item_vistoria as enum (
  'pendente', 'conforme', 'nao_conforme', 'nao_aplicavel', 'requer_avaliacao'
);

alter table public.ocorrencia_historico drop constraint ocorrencia_historico_tipo_valido;
alter table public.ocorrencia_historico
  add constraint ocorrencia_historico_tipo_valido check (tipo in (
    'etapa_criada', 'etapa_concluida', 'evidencia_enviada', 'evidencia_aprovada', 'evidencia_devolvida',
    'conferente_designado', 'concluida', 'concluida_sem_evidencia', 'reaberta',
    'vistoria_agendada', 'vistoria_enviada', 'vistoria_aprovada', 'vistoria_devolvida', 'vistoria_cancelada'
  ));

-- ---------------------------------------------------------------------------
-- 2. Tabelas
-- ---------------------------------------------------------------------------
create table public.vistoria (
  id uuid primary key,
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  ocorrencia_id uuid not null,
  titulo text not null,
  objetivo text,
  responsavel_id uuid not null,
  data_planejada date not null,
  hora_planejada time,
  duracao_minutos integer,
  situacao public.situacao_vistoria not null default 'planejada',
  observacao text,
  iniciada_em timestamptz,
  enviada_em timestamptz,
  enviada_por uuid,
  criada_por uuid not null,
  criada_em timestamptz not null default now(),
  row_version integer not null default 1,
  constraint vistoria_titulo_tamanho check (length(btrim(titulo)) between 1 and 120),
  constraint vistoria_objetivo_tamanho check (length(coalesce(objetivo, '')) <= 1000),
  constraint vistoria_duracao_valida check (duracao_minutos is null or duracao_minutos between 5 and 1440),
  constraint vistoria_observacao_tamanho check (length(coalesce(observacao, '')) <= 2000),
  constraint vistoria_inicio_coerente check (situacao in ('planejada', 'cancelada') or iniciada_em is not null),
  constraint vistoria_envio_coerente check (
    situacao not in ('enviada', 'devolvida', 'aprovada') or (enviada_em is not null and enviada_por is not null)),
  constraint vistoria_consultoria_id_id_key unique (consultoria_id, id),
  constraint vistoria_ocorrencia_fk foreign key (consultoria_id, ocorrencia_id)
    references public.ocorrencia (consultoria_id, id) on delete restrict,
  constraint vistoria_responsavel_fk foreign key (consultoria_id, responsavel_id)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint vistoria_enviada_por_fk foreign key (consultoria_id, enviada_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint vistoria_criada_por_fk foreign key (consultoria_id, criada_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.vistoria is 'Vistoria de campo de uma ocorrência (ADR-0029). Escrita só pelas RPCs.';
comment on column public.vistoria.id is 'Gerado na tela: repetir o agendamento com o mesmo id não duplica.';
comment on column public.vistoria.enviada_por is 'Quem enviou para conferência (conta como quem registrou na independência).';
comment on column public.vistoria.row_version is 'Controle otimista das mudanças de situação (iniciar, enviar, conferir, cancelar).';

create index vistoria_responsavel_data_idx on public.vistoria (consultoria_id, responsavel_id, data_planejada);
create index vistoria_ocorrencia_idx on public.vistoria (consultoria_id, ocorrencia_id);
create index vistoria_data_idx on public.vistoria (consultoria_id, data_planejada);

create table public.vistoria_item (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  vistoria_id uuid not null,
  posicao integer not null,
  titulo text not null,
  descricao text,
  resultado public.resultado_item_vistoria not null default 'pendente',
  comentario text,
  registrado_por uuid,
  registrado_em timestamptz,
  constraint vistoria_item_posicao_valida check (posicao >= 1),
  constraint vistoria_item_titulo_tamanho check (length(btrim(titulo)) between 1 and 120),
  constraint vistoria_item_descricao_tamanho check (length(coalesce(descricao, '')) <= 300),
  constraint vistoria_item_comentario_tamanho check (length(coalesce(comentario, '')) <= 1000),
  constraint vistoria_item_comentario_obrigatorio check (
    resultado not in ('nao_conforme', 'requer_avaliacao') or length(btrim(coalesce(comentario, ''))) > 0),
  constraint vistoria_item_registro_coerente check (
    (registrado_em is null) = (registrado_por is null) and (resultado = 'pendente' or registrado_em is not null)),
  constraint vistoria_item_posicao_key unique (vistoria_id, posicao),
  constraint vistoria_item_consultoria_id_id_key unique (consultoria_id, id),
  constraint vistoria_item_consultoria_vistoria_id_key unique (consultoria_id, vistoria_id, id),
  constraint vistoria_item_vistoria_fk foreign key (consultoria_id, vistoria_id)
    references public.vistoria (consultoria_id, id) on delete restrict,
  constraint vistoria_item_registrado_por_fk foreign key (consultoria_id, registrado_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.vistoria_item is 'Item do checklist da vistoria. nao_conforme e requer_avaliacao exigem comentário.';

create table public.vistoria_foto (
  id uuid primary key,
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  vistoria_id uuid not null,
  item_id uuid not null,
  caminho text not null,
  nome_original text not null,
  mime text not null,
  tamanho_bytes bigint not null,
  sha256 text not null,
  legenda text,
  capturada_em timestamptz not null,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  precisao_m numeric(8, 1),
  local_origem text not null,
  local_manual text,
  autor_id uuid not null,
  criada_em timestamptz not null default now(),
  excluida_em timestamptz,
  excluida_por uuid,
  constraint vistoria_foto_caminho_key unique (caminho),
  constraint vistoria_foto_caminho_formato check (
    caminho ~ ('^' || consultoria_id::text || '/vistoria/[0-9a-f-]{36}\.(jpg|png)$')),
  constraint vistoria_foto_nome_preenchido check (length(btrim(nome_original)) between 1 and 255),
  constraint vistoria_foto_mime_valido check (mime in ('image/jpeg', 'image/png')),
  constraint vistoria_foto_tamanho_valido check (tamanho_bytes > 0 and tamanho_bytes <= 26214400),
  constraint vistoria_foto_sha256_formato check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint vistoria_foto_legenda_tamanho check (length(coalesce(legenda, '')) <= 200),
  constraint vistoria_foto_coordenadas check (
    (latitude is null) = (longitude is null)
    and (latitude is null or latitude between -90 and 90)
    and (longitude is null or longitude between -180 and 180)),
  constraint vistoria_foto_precisao check (precisao_m is null or (precisao_m >= 0 and latitude is not null)),
  constraint vistoria_foto_local_manual_tamanho check (length(coalesce(local_manual, '')) <= 200),
  constraint vistoria_foto_local_coerente check (
    (local_origem = 'aparelho' and latitude is not null)
    or (local_origem = 'manual' and length(btrim(coalesce(local_manual, ''))) > 0)
    or (local_origem = 'nenhum' and latitude is null and local_manual is null)),
  constraint vistoria_foto_exclusao_completa check ((excluida_em is null) = (excluida_por is null)),
  constraint vistoria_foto_consultoria_id_id_key unique (consultoria_id, id),
  constraint vistoria_foto_vistoria_fk foreign key (consultoria_id, vistoria_id)
    references public.vistoria (consultoria_id, id) on delete restrict,
  constraint vistoria_foto_item_fk foreign key (consultoria_id, vistoria_id, item_id)
    references public.vistoria_item (consultoria_id, vistoria_id, id) on delete restrict,
  constraint vistoria_foto_autor_fk foreign key (consultoria_id, autor_id)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint vistoria_foto_excluida_por_fk foreign key (consultoria_id, excluida_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.vistoria_foto is 'Foto de item da vistoria. Imutável; a exclusão é lógica. Mime e tamanho lidos de storage.objects.';
comment on column public.vistoria_foto.capturada_em is 'Hora do aparelho; recusada se passar de agora + 5 minutos.';
comment on column public.vistoria_foto.local_origem is 'aparelho (exige coordenada), manual (exige local_manual) ou nenhum (sem nenhum dos dois).';

create index vistoria_foto_vistoria_idx on public.vistoria_foto (consultoria_id, vistoria_id);
create index vistoria_foto_item_idx on public.vistoria_foto (consultoria_id, item_id);

create table public.vistoria_decisao (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  vistoria_id uuid not null,
  decisao public.decisao_conferencia not null,
  motivo text,
  conferente_id uuid not null,
  decidida_em timestamptz not null default now(),
  constraint vistoria_decisao_motivo_ao_devolver check (
    decisao = 'aprovada' or length(btrim(coalesce(motivo, ''))) > 0),
  constraint vistoria_decisao_consultoria_id_id_key unique (consultoria_id, id),
  constraint vistoria_decisao_vistoria_fk foreign key (consultoria_id, vistoria_id)
    references public.vistoria (consultoria_id, id) on delete restrict,
  constraint vistoria_decisao_conferente_fk foreign key (consultoria_id, conferente_id)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.vistoria_decisao is 'Conferência da vistoria, append-only: cada envio pode ter uma decisão; reenvio gera outra linha.';

create index vistoria_decisao_vistoria_idx on public.vistoria_decisao (consultoria_id, vistoria_id, decidida_em desc);

create trigger vistoria_decisao_append_only
  before update or delete on public.vistoria_decisao
  for each row execute function private.bloquear_alteracao_auditoria();

-- Foto imutável: o único update aceito é a exclusão lógica (uma vez); delete nunca.
create function private.proteger_vistoria_foto()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     or old.excluida_em is not null
     or (to_jsonb(new) - array['excluida_em', 'excluida_por']) <> (to_jsonb(old) - array['excluida_em', 'excluida_por'])
  then
    raise exception 'vistoria_foto_imutavel' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke all on function private.proteger_vistoria_foto() from public, anon, authenticated;

create trigger vistoria_foto_imutavel
  before update or delete on public.vistoria_foto
  for each row execute function private.proteger_vistoria_foto();

-- ---------------------------------------------------------------------------
-- 3. RLS, auditoria e barreiras de escrita (suporte e comercial; teste 020)
-- ---------------------------------------------------------------------------
do $$
declare
  tabela text;
begin
  foreach tabela in array array['vistoria', 'vistoria_item', 'vistoria_foto', 'vistoria_decisao'] loop
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
-- 4. Helpers
-- ---------------------------------------------------------------------------
-- O responsável da vistoria ou a Gestão (vínculo de verdade, sem acesso de suporte).
create function private.pode_registrar_vistoria(v public.vistoria)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(private.membro_atual(v.consultoria_id) = v.responsavel_id, false)
         or private.is_gestao_vinculada(v.consultoria_id)
$$;

-- O membro registrou a vistoria: enviou, registrou algum item ou tem foto (não excluída) nela.
create function private.registrou_a_vistoria(p_vistoria_id uuid, p_membro uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_membro is not null and (
    exists (select 1 from public.vistoria as v where v.id = p_vistoria_id and v.enviada_por = p_membro)
    or exists (select 1 from public.vistoria_item as i where i.vistoria_id = p_vistoria_id and i.registrado_por = p_membro)
    or exists (select 1 from public.vistoria_foto as f
               where f.vistoria_id = p_vistoria_id and f.autor_id = p_membro and f.excluida_em is null)
  )
$$;

-- Quem chama pode conferir a vistoria agora: ela está enviada; é o conferente designado da
-- ocorrência ou, sem designação, a Gestão; e, com a independência, não a registrou.
create function private.pode_conferir_vistoria(v public.vistoria)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select v.situacao = 'enviada'
       and private.membro_atual(v.consultoria_id) is not null
       and case when o.conferente_id is not null
                then o.conferente_id = private.membro_atual(v.consultoria_id)
                else private.is_gestao_vinculada(v.consultoria_id) end
       and not (c.conferencia_independente and private.registrou_a_vistoria(v.id, private.membro_atual(v.consultoria_id)))
    from public.ocorrencia as o
    join public.consultoria as c on c.id = o.consultoria_id
    where o.consultoria_id = v.consultoria_id and o.id = v.ocorrencia_id
  ), false)
$$;

revoke all on function private.pode_registrar_vistoria(public.vistoria) from public, anon;
revoke all on function private.registrou_a_vistoria(uuid, uuid) from public, anon;
revoke all on function private.pode_conferir_vistoria(public.vistoria) from public, anon;
-- obter_vistoria (security invoker) usa os três com o papel de quem chama.
grant execute on function private.pode_registrar_vistoria(public.vistoria) to authenticated;
grant execute on function private.registrou_a_vistoria(uuid, uuid) to authenticated;
grant execute on function private.pode_conferir_vistoria(public.vistoria) to authenticated;

-- Vistoria travada para escrita, com quem chama como membro ativo (sem conferir o papel).
create function private.vistoria_para_escrever(p_id uuid)
returns public.vistoria
language plpgsql
set search_path = ''
as $$
declare
  alvo public.vistoria;
begin
  select * into alvo from public.vistoria as v where v.id = p_id for update;
  if not found or private.membro_atual(alvo.consultoria_id) is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return alvo;
end;
$$;

-- Vistoria travada para registro: membro ativo e, além disso, o responsável ou a Gestão.
create function private.vistoria_para_registrar(p_id uuid)
returns public.vistoria
language plpgsql
set search_path = ''
as $$
declare
  alvo public.vistoria := private.vistoria_para_escrever(p_id);
begin
  if not private.pode_registrar_vistoria(alvo) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return alvo;
end;
$$;

-- Ocorrência concluída não aceita registro novo (CAMPO-01). Trava a ocorrência para leitura.
create function private.conferir_ocorrencia_da_vistoria(alvo public.vistoria)
returns void
language plpgsql
set search_path = ''
as $$
declare
  situacao_ocorrencia public.situacao_ocorrencia;
begin
  select o.situacao into situacao_ocorrencia
  from public.ocorrencia as o
  where o.consultoria_id = alvo.consultoria_id and o.id = alvo.ocorrencia_id
  for share;
  if situacao_ocorrencia = 'concluida' then
    raise exception 'ocorrencia_concluida' using errcode = 'P0001';
  end if;
end;
$$;

-- Registro (item, observação, foto) só com a vistoria em andamento ou devolvida.
create function private.conferir_vistoria_aberta(alvo public.vistoria)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform private.conferir_ocorrencia_da_vistoria(alvo);
  if alvo.situacao = 'planejada' then
    raise exception 'vistoria_nao_iniciada' using errcode = 'P0001';
  end if;
  if alvo.situacao not in ('em_andamento', 'devolvida') then
    raise exception 'vistoria_fechada' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function private.vistoria_para_escrever(uuid) from public, anon, authenticated;
revoke all on function private.vistoria_para_registrar(uuid) from public, anon, authenticated;
revoke all on function private.conferir_ocorrencia_da_vistoria(public.vistoria) from public, anon, authenticated;
revoke all on function private.conferir_vistoria_aberta(public.vistoria) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Agendar (qualquer membro ativo). Idempotente pelo id gerado na tela.
-- p_itens = [{"titulo": "...", "descricao": "..."}], de 1 a 50.
-- ---------------------------------------------------------------------------
create function public.criar_vistoria(
  p_id uuid,
  p_ocorrencia_id uuid,
  p_titulo text,
  p_objetivo text,
  p_responsavel_id uuid,
  p_data date,
  p_hora time,
  p_duracao_minutos integer,
  p_itens jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.ocorrencia;
  item jsonb;
  v_posicao bigint;
  v_titulo text;
  v_descricao text;
begin
  alvo := private.ocorrencia_para_escrever(p_ocorrencia_id);
  if p_id is null then
    raise exception 'id_obrigatorio' using errcode = '22023';
  end if;
  if exists (select 1 from public.vistoria as v where v.id = p_id) then
    if exists (select 1 from public.vistoria as v where v.id = p_id and v.ocorrencia_id = alvo.id) then
      return p_id;
    end if;
    raise exception 'vistoria_existente' using errcode = 'P0001';
  end if;

  if alvo.situacao = 'concluida' then
    raise exception 'ocorrencia_concluida' using errcode = 'P0001';
  end if;
  if btrim(coalesce(p_titulo, '')) = '' then
    raise exception 'titulo_obrigatorio' using errcode = '22023';
  end if;
  if length(btrim(p_titulo)) > 120 then
    raise exception 'titulo_longo_demais' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_objetivo, ''))) > 1000 then
    raise exception 'objetivo_longo_demais' using errcode = '22023';
  end if;
  if p_responsavel_id is null then
    raise exception 'responsavel_obrigatorio' using errcode = '22023';
  end if;
  perform private.conferir_responsavel(alvo.consultoria_id, p_responsavel_id);
  if p_data is null then
    raise exception 'data_obrigatoria' using errcode = '22023';
  end if;
  if p_duracao_minutos is not null and (p_duracao_minutos < 5 or p_duracao_minutos > 1440) then
    raise exception 'duracao_invalida' using errcode = '22023';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'itens_obrigatorios' using errcode = '22023';
  end if;
  if jsonb_array_length(p_itens) > 50 then
    raise exception 'itens_demais' using errcode = '22023';
  end if;

  insert into public.vistoria (id, consultoria_id, ocorrencia_id, titulo, objetivo, responsavel_id,
                               data_planejada, hora_planejada, duracao_minutos, criada_por)
  values (p_id, alvo.consultoria_id, alvo.id, btrim(p_titulo), nullif(btrim(coalesce(p_objetivo, '')), ''),
          p_responsavel_id, p_data, p_hora, p_duracao_minutos, private.membro_atual(alvo.consultoria_id));

  for item, v_posicao in select e.valor, e.ordem from jsonb_array_elements(p_itens) with ordinality as e (valor, ordem) loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'itens_obrigatorios' using errcode = '22023';
    end if;
    v_titulo := btrim(coalesce(item ->> 'titulo', ''));
    v_descricao := nullif(btrim(coalesce(item ->> 'descricao', '')), '');
    if v_titulo = '' then
      raise exception 'item_titulo_obrigatorio' using errcode = '22023';
    end if;
    if length(v_titulo) > 120 or length(coalesce(v_descricao, '')) > 300 then
      raise exception 'item_longo_demais' using errcode = '22023';
    end if;
    insert into public.vistoria_item (consultoria_id, vistoria_id, posicao, titulo, descricao)
    values (alvo.consultoria_id, p_id, v_posicao::integer, v_titulo, v_descricao);
  end loop;

  perform private.registrar_historico(alvo.consultoria_id, alvo.id, 'vistoria_agendada', null, btrim(p_titulo));
  return p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Iniciar: planejada → em_andamento. Repetir não muda nada. Devolve a row_version.
-- ---------------------------------------------------------------------------
create function public.iniciar_vistoria(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.vistoria := private.vistoria_para_registrar(p_id);
begin
  if alvo.situacao = 'cancelada' then
    raise exception 'vistoria_fechada' using errcode = 'P0001';
  end if;
  if alvo.situacao <> 'planejada' then
    return alvo.row_version;
  end if;
  perform private.conferir_ocorrencia_da_vistoria(alvo);

  update public.vistoria as v
  set situacao = 'em_andamento', iniciada_em = now(), row_version = alvo.row_version + 1
  where v.id = alvo.id;
  return alvo.row_version + 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Registrar o resultado de um item e a observação geral (em andamento ou devolvida).
-- ---------------------------------------------------------------------------
create function public.registrar_item_da_vistoria(
  p_item_id uuid,
  p_resultado public.resultado_item_vistoria,
  p_comentario text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.vistoria_item;
  alvo public.vistoria;
  v_comentario text := nullif(btrim(coalesce(p_comentario, '')), '');
begin
  select * into item from public.vistoria_item as i where i.id = p_item_id;
  if not found then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  alvo := private.vistoria_para_registrar(item.vistoria_id);
  perform private.conferir_vistoria_aberta(alvo);

  if p_resultado is null then
    raise exception 'resultado_obrigatorio' using errcode = '22023';
  end if;
  if p_resultado in ('nao_conforme', 'requer_avaliacao') and v_comentario is null then
    raise exception 'comentario_obrigatorio' using errcode = '22023';
  end if;
  if length(coalesce(v_comentario, '')) > 1000 then
    raise exception 'comentario_longo_demais' using errcode = '22023';
  end if;

  update public.vistoria_item as i
  set resultado = p_resultado,
      comentario = v_comentario,
      registrado_por = case when p_resultado = 'pendente' then null else private.membro_atual(alvo.consultoria_id) end,
      registrado_em = case when p_resultado = 'pendente' then null else now() end
  where i.id = item.id
    and (i.resultado, i.comentario) is distinct from (p_resultado, v_comentario);
end;
$$;

create function public.salvar_observacao_da_vistoria(p_id uuid, p_observacao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.vistoria := private.vistoria_para_registrar(p_id);
  v_observacao text := nullif(btrim(coalesce(p_observacao, '')), '');
begin
  perform private.conferir_vistoria_aberta(alvo);
  if length(coalesce(v_observacao, '')) > 2000 then
    raise exception 'observacao_longa_demais' using errcode = '22023';
  end if;
  update public.vistoria as v
  set observacao = v_observacao
  where v.id = alvo.id and v.observacao is distinct from v_observacao;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Fotos. O arquivo já está no Storage em consultoria_id/vistoria/<uuid>.(jpg|png); mime e
-- tamanho vêm de storage.objects. Idempotente pelo id gerado na tela.
-- ---------------------------------------------------------------------------
create function public.adicionar_foto_da_vistoria(
  p_foto_id uuid,
  p_item_id uuid,
  p_caminho text,
  p_nome_original text,
  p_sha256 text,
  p_legenda text,
  p_capturada_em timestamptz,
  p_latitude numeric,
  p_longitude numeric,
  p_precisao_m numeric,
  p_local_origem text,
  p_local_manual text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.vistoria_item;
  alvo public.vistoria;
  objeto record;
  v_legenda text := nullif(btrim(coalesce(p_legenda, '')), '');
  v_local_manual text := nullif(btrim(coalesce(p_local_manual, '')), '');
begin
  select * into item from public.vistoria_item as i where i.id = p_item_id;
  if not found then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  alvo := private.vistoria_para_registrar(item.vistoria_id);

  if p_foto_id is null then
    raise exception 'id_obrigatorio' using errcode = '22023';
  end if;
  if exists (select 1 from public.vistoria_foto as f where f.id = p_foto_id) then
    if exists (select 1 from public.vistoria_foto as f where f.id = p_foto_id and f.item_id = item.id) then
      return p_foto_id;
    end if;
    raise exception 'foto_existente' using errcode = 'P0001';
  end if;

  perform private.conferir_vistoria_aberta(alvo);

  if p_caminho is null
     or p_caminho !~ ('^' || alvo.consultoria_id::text || '/vistoria/[0-9a-f-]{36}\.(jpg|png)$') then
    raise exception 'caminho_invalido' using errcode = '22023';
  end if;
  if coalesce(lower(p_sha256), '') !~ '^[0-9a-f]{64}$'
     or length(btrim(coalesce(p_nome_original, ''))) not between 1 and 255 then
    raise exception 'arquivo_invalido' using errcode = '22023';
  end if;
  if exists (select 1 from public.vistoria_foto as f where f.caminho = p_caminho) then
    raise exception 'arquivo_ja_vinculado' using errcode = 'P0001';
  end if;

  select o.metadata ->> 'mimetype' as mime, (o.metadata ->> 'size')::bigint as tamanho
  into objeto
  from storage.objects as o
  where o.bucket_id = 'arquivos' and o.name = p_caminho;
  if not found then
    raise exception 'arquivo_nao_encontrado' using errcode = 'P0001';
  end if;
  if objeto.mime is null or objeto.mime not in ('image/jpeg', 'image/png') then
    raise exception 'arquivo_tipo_invalido' using errcode = '22023';
  end if;
  if coalesce(objeto.tamanho, 0) <= 0 or objeto.tamanho > 26214400 then
    raise exception 'arquivo_grande_demais' using errcode = '22023';
  end if;

  if p_capturada_em is null then
    raise exception 'captura_obrigatoria' using errcode = '22023';
  end if;
  if p_capturada_em > now() + interval '5 minutes' then
    raise exception 'captura_no_futuro' using errcode = '22023';
  end if;
  if length(coalesce(v_legenda, '')) > 200 then
    raise exception 'legenda_longa_demais' using errcode = '22023';
  end if;

  -- Localização: as duas coordenadas ou nenhuma, dentro dos limites; precisão só com coordenada;
  -- aparelho exige coordenada, manual exige o local descrito, nenhum não tem nenhum dos dois.
  if p_local_origem is null or p_local_origem not in ('aparelho', 'manual', 'nenhum')
     or (p_latitude is null) <> (p_longitude is null)
     or (p_latitude is not null and (p_latitude not between -90 and 90 or p_longitude not between -180 and 180))
     or (p_precisao_m is not null and (p_precisao_m < 0 or p_latitude is null))
     or length(coalesce(v_local_manual, '')) > 200
     or (p_local_origem = 'aparelho' and p_latitude is null)
     or (p_local_origem = 'manual' and v_local_manual is null)
     or (p_local_origem = 'nenhum' and (p_latitude is not null or v_local_manual is not null)) then
    raise exception 'local_invalido' using errcode = '22023';
  end if;

  insert into public.vistoria_foto (id, consultoria_id, vistoria_id, item_id, caminho, nome_original, mime,
                                    tamanho_bytes, sha256, legenda, capturada_em, latitude, longitude,
                                    precisao_m, local_origem, local_manual, autor_id)
  values (p_foto_id, alvo.consultoria_id, alvo.id, item.id, p_caminho, btrim(p_nome_original), objeto.mime,
          objeto.tamanho, lower(p_sha256), v_legenda, p_capturada_em, p_latitude, p_longitude,
          p_precisao_m, p_local_origem, v_local_manual, private.membro_atual(alvo.consultoria_id));
  return p_foto_id;
end;
$$;

create function public.excluir_foto_da_vistoria(p_foto_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  foto public.vistoria_foto;
  alvo public.vistoria;
begin
  select * into foto from public.vistoria_foto as f where f.id = p_foto_id;
  if not found then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  alvo := private.vistoria_para_registrar(foto.vistoria_id);
  if foto.excluida_em is not null then
    return;
  end if;
  perform private.conferir_vistoria_aberta(alvo);

  update public.vistoria_foto as f
  set excluida_em = now(), excluida_por = private.membro_atual(alvo.consultoria_id)
  where f.id = foto.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Enviar para conferência: todos os itens fora de pendente e os comentários obrigatórios.
-- Repetir com a vistoria já enviada devolve a versão atual sem duplicar.
-- ---------------------------------------------------------------------------
create function public.enviar_vistoria(p_id uuid, p_row_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.vistoria := private.vistoria_para_registrar(p_id);
begin
  if alvo.situacao = 'enviada' then
    return alvo.row_version;
  end if;
  perform private.conferir_vistoria_aberta(alvo);
  if p_row_version is distinct from alvo.row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.vistoria_item as i where i.vistoria_id = alvo.id and i.resultado = 'pendente') then
    raise exception 'itens_pendentes' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.vistoria_item as i
    where i.vistoria_id = alvo.id and i.resultado in ('nao_conforme', 'requer_avaliacao')
      and btrim(coalesce(i.comentario, '')) = ''
  ) then
    raise exception 'comentario_obrigatorio' using errcode = 'P0001';
  end if;

  update public.vistoria as v
  set situacao = 'enviada', enviada_em = now(), enviada_por = private.membro_atual(alvo.consultoria_id),
      row_version = alvo.row_version + 1
  where v.id = alvo.id;
  perform private.registrar_historico(alvo.consultoria_id, alvo.ocorrencia_id, 'vistoria_enviada', null, alvo.titulo);
  return alvo.row_version + 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Conferir (aprovar ou devolver com motivo). Confere o conferente designado da ocorrência;
-- sem ele, a Gestão. Com a independência, quem registrou a vistoria não confere. Devolvida volta
-- a aceitar registros. Aprovar não conclui a ocorrência.
-- ---------------------------------------------------------------------------
create function public.conferir_vistoria(
  p_id uuid,
  p_decisao public.decisao_conferencia,
  p_motivo text,
  p_row_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.vistoria := private.vistoria_para_escrever(p_id);
  eu uuid := private.membro_atual(alvo.consultoria_id);
  conferente uuid;
  independente boolean;
begin
  select o.conferente_id into conferente
  from public.ocorrencia as o where o.consultoria_id = alvo.consultoria_id and o.id = alvo.ocorrencia_id;
  if conferente is not null then
    if conferente <> eu then
      raise exception 'sem_permissao' using errcode = '42501';
    end if;
  elsif not private.is_gestao_vinculada(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  select c.conferencia_independente into independente from public.consultoria as c where c.id = alvo.consultoria_id;
  if independente and private.registrou_a_vistoria(alvo.id, eu) then
    raise exception 'conferencia_independente' using errcode = 'P0001';
  end if;
  if alvo.situacao in ('aprovada', 'devolvida') then
    raise exception 'vistoria_ja_conferida' using errcode = 'P0001';
  end if;
  if alvo.situacao <> 'enviada' then
    raise exception 'vistoria_nao_enviada' using errcode = 'P0001';
  end if;
  if p_row_version is distinct from alvo.row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  if p_decisao is null then
    raise exception 'decisao_obrigatoria' using errcode = '22023';
  end if;
  if p_decisao = 'devolvida' and btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'motivo_obrigatorio' using errcode = '22023';
  end if;

  if p_decisao = 'devolvida' then
    perform set_config('gestao_ambiental.motivo', btrim(p_motivo), true);
  end if;
  -- clock_timestamp: duas decisões na mesma transação continuam em ordem.
  insert into public.vistoria_decisao (consultoria_id, vistoria_id, decisao, motivo, conferente_id, decidida_em)
  values (alvo.consultoria_id, alvo.id, p_decisao, nullif(btrim(coalesce(p_motivo, '')), ''), eu, clock_timestamp());
  update public.vistoria as v
  set situacao = p_decisao::text::public.situacao_vistoria, row_version = alvo.row_version + 1
  where v.id = alvo.id;

  if p_decisao = 'devolvida' then
    perform private.registrar_historico(alvo.consultoria_id, alvo.ocorrencia_id, 'vistoria_devolvida', null, p_motivo);
  else
    perform private.registrar_historico(alvo.consultoria_id, alvo.ocorrencia_id, 'vistoria_aprovada', null, alvo.titulo);
  end if;
  return alvo.row_version + 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Cancelar: só a Gestão, com motivo, antes de aprovada. Repetir não muda nada.
-- ---------------------------------------------------------------------------
create function public.cancelar_vistoria(p_id uuid, p_motivo text, p_row_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.vistoria := private.vistoria_para_escrever(p_id);
begin
  if not private.is_gestao_vinculada(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.situacao = 'cancelada' then
    return alvo.row_version;
  end if;
  if alvo.situacao = 'aprovada' then
    raise exception 'vistoria_fechada' using errcode = 'P0001';
  end if;
  if p_row_version is distinct from alvo.row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'motivo_obrigatorio' using errcode = '22023';
  end if;

  perform set_config('gestao_ambiental.motivo', btrim(p_motivo), true);
  update public.vistoria as v
  set situacao = 'cancelada', row_version = alvo.row_version + 1
  where v.id = alvo.id;
  perform private.registrar_historico(alvo.consultoria_id, alvo.ocorrencia_id, 'vistoria_cancelada', null, p_motivo);
  return alvo.row_version + 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Leitura (security invoker: a RLS de quem chama decide o que aparece)
-- ---------------------------------------------------------------------------
-- Vistorias paginadas (50 por padrão, até 100), por data planejada. p_somente_minhas: só as que
-- têm quem chama como responsável. hoje = data civil no fuso da consultoria (para os grupos).
create function public.listar_vistorias(
  p_ocorrencia_id uuid default null,
  p_somente_minhas boolean default false,
  p_limite integer default 50,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  consultoria_id uuid,
  ocorrencia_id uuid,
  titulo text,
  responsavel_id uuid,
  responsavel_nome text,
  data_planejada date,
  hora_planejada time,
  duracao_minutos integer,
  situacao public.situacao_vistoria,
  iniciada_em timestamptz,
  enviada_em timestamptz,
  condicionante_codigo text,
  condicionante_titulo text,
  empreendimento_id uuid,
  empreendimento_nome text,
  unidade_id uuid,
  unidade_nome text,
  licenca text,
  total_itens integer,
  itens_registrados integer,
  hoje date,
  row_version integer,
  total bigint
)
language sql
stable
set search_path = ''
as $$
  select v.id, v.consultoria_id, v.ocorrencia_id, v.titulo, v.responsavel_id, r.nome,
         v.data_planejada, v.hora_planejada, v.duracao_minutos, v.situacao, v.iniciada_em, v.enviada_em,
         c.codigo, cv.titulo, e.id, e.nome, u.id, u.nome,
         nullif(concat_ws(' ', t.sigla, i.numero), ''),
         (select count(*)::integer from public.vistoria_item as it
          where it.consultoria_id = v.consultoria_id and it.vistoria_id = v.id),
         (select count(*)::integer from public.vistoria_item as it
          where it.consultoria_id = v.consultoria_id and it.vistoria_id = v.id and it.resultado <> 'pendente'),
         private.hoje_da_consultoria(v.consultoria_id),
         v.row_version,
         count(*) over ()
  from public.vistoria as v
  join public.ocorrencia as o on o.consultoria_id = v.consultoria_id and o.id = v.ocorrencia_id
  join public.instrumento as i on i.consultoria_id = o.consultoria_id and i.id = o.instrumento_id
  join public.unidade as u on u.consultoria_id = i.consultoria_id and u.id = i.unidade_id
  join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
  left join public.condicionante_versao as cv on cv.consultoria_id = o.consultoria_id and cv.id = o.condicionante_versao_id
  left join public.condicionante as c on c.consultoria_id = cv.consultoria_id and c.id = cv.condicionante_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  left join public.membro as r on r.consultoria_id = v.consultoria_id and r.id = v.responsavel_id
  where (p_ocorrencia_id is null or v.ocorrencia_id = p_ocorrencia_id)
    and (not coalesce(p_somente_minhas, false) or v.responsavel_id = private.membro_atual(v.consultoria_id))
  order by v.data_planejada, v.hora_planejada nulls last, v.criada_em, v.id
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0)
$$;

-- Contexto completo de uma vistoria. pode_registrar: quem chama é o responsável ou a Gestão, a
-- ocorrência não está concluída e a vistoria está planejada, em andamento ou devolvida (pode
-- iniciar, registrar e enviar). pode_conferir: a vistoria está enviada e quem chama pode decidir.
create function public.obter_vistoria(p_id uuid)
returns table (
  id uuid,
  consultoria_id uuid,
  ocorrencia_id uuid,
  titulo text,
  objetivo text,
  responsavel_id uuid,
  responsavel_nome text,
  data_planejada date,
  hora_planejada time,
  duracao_minutos integer,
  situacao public.situacao_vistoria,
  observacao text,
  iniciada_em timestamptz,
  enviada_em timestamptz,
  enviada_por_nome text,
  criada_por_nome text,
  criada_em timestamptz,
  row_version integer,
  ocorrencia_situacao public.situacao_ocorrencia,
  ciclo integer,
  condicionante_codigo text,
  condicionante_titulo text,
  prazo_oficial_atual date,
  meta_interna date,
  empreendimento_id uuid,
  empreendimento_nome text,
  unidade_id uuid,
  unidade_nome text,
  unidade_endereco text,
  instrumento_id uuid,
  licenca text,
  hoje date,
  conferente_nome text,
  conferencia_independente boolean,
  pode_registrar boolean,
  pode_conferir boolean,
  ultima_decisao public.decisao_conferencia,
  ultima_decisao_motivo text,
  ultima_decisao_em timestamptz,
  ultima_decisao_conferente_nome text
)
language sql
stable
set search_path = ''
as $$
  select v.id, v.consultoria_id, v.ocorrencia_id, v.titulo, v.objetivo, v.responsavel_id, r.nome,
         v.data_planejada, v.hora_planejada, v.duracao_minutos, v.situacao, v.observacao,
         v.iniciada_em, v.enviada_em, ep.nome, cp.nome, v.criada_em, v.row_version,
         o.situacao, o.ciclo, c.codigo, cv.titulo, o.prazo_oficial_atual, o.meta_interna,
         e.id, e.nome, u.id, u.nome, u.endereco, i.id,
         nullif(concat_ws(' ', t.sigla, i.numero), ''),
         private.hoje_da_consultoria(v.consultoria_id),
         cf.nome, co.conferencia_independente,
         private.pode_registrar_vistoria(v) and o.situacao <> 'concluida'
           and v.situacao in ('planejada', 'em_andamento', 'devolvida'),
         private.pode_conferir_vistoria(v),
         d.decisao, d.motivo, d.decidida_em, dm.nome
  from public.vistoria as v
  join public.consultoria as co on co.id = v.consultoria_id
  join public.ocorrencia as o on o.consultoria_id = v.consultoria_id and o.id = v.ocorrencia_id
  join public.instrumento as i on i.consultoria_id = o.consultoria_id and i.id = o.instrumento_id
  join public.unidade as u on u.consultoria_id = i.consultoria_id and u.id = i.unidade_id
  join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
  left join public.condicionante_versao as cv on cv.consultoria_id = o.consultoria_id and cv.id = o.condicionante_versao_id
  left join public.condicionante as c on c.consultoria_id = cv.consultoria_id and c.id = cv.condicionante_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  left join public.membro as r on r.consultoria_id = v.consultoria_id and r.id = v.responsavel_id
  left join public.membro as ep on ep.consultoria_id = v.consultoria_id and ep.id = v.enviada_por
  left join public.membro as cp on cp.consultoria_id = v.consultoria_id and cp.id = v.criada_por
  left join public.membro as cf on cf.consultoria_id = o.consultoria_id and cf.id = o.conferente_id
  left join lateral (
    select x.decisao, x.motivo, x.decidida_em, x.conferente_id
    from public.vistoria_decisao as x
    where x.consultoria_id = v.consultoria_id and x.vistoria_id = v.id
    order by x.decidida_em desc, x.id
    limit 1
  ) as d on true
  left join public.membro as dm on dm.consultoria_id = v.consultoria_id and dm.id = d.conferente_id
  where v.id = p_id
$$;

-- ---------------------------------------------------------------------------
-- 13. Permissões das RPCs: só usuário logado.
-- ---------------------------------------------------------------------------
revoke all on function public.criar_vistoria(uuid, uuid, text, text, uuid, date, time, integer, jsonb) from public, anon;
revoke all on function public.iniciar_vistoria(uuid) from public, anon;
revoke all on function public.registrar_item_da_vistoria(uuid, public.resultado_item_vistoria, text) from public, anon;
revoke all on function public.salvar_observacao_da_vistoria(uuid, text) from public, anon;
revoke all on function public.adicionar_foto_da_vistoria(uuid, uuid, text, text, text, text, timestamptz, numeric, numeric, numeric, text, text) from public, anon;
revoke all on function public.excluir_foto_da_vistoria(uuid) from public, anon;
revoke all on function public.enviar_vistoria(uuid, integer) from public, anon;
revoke all on function public.conferir_vistoria(uuid, public.decisao_conferencia, text, integer) from public, anon;
revoke all on function public.cancelar_vistoria(uuid, text, integer) from public, anon;
revoke all on function public.listar_vistorias(uuid, boolean, integer, integer) from public, anon;
revoke all on function public.obter_vistoria(uuid) from public, anon;

grant execute on function public.criar_vistoria(uuid, uuid, text, text, uuid, date, time, integer, jsonb) to authenticated;
grant execute on function public.iniciar_vistoria(uuid) to authenticated;
grant execute on function public.registrar_item_da_vistoria(uuid, public.resultado_item_vistoria, text) to authenticated;
grant execute on function public.salvar_observacao_da_vistoria(uuid, text) to authenticated;
grant execute on function public.adicionar_foto_da_vistoria(uuid, uuid, text, text, text, text, timestamptz, numeric, numeric, numeric, text, text) to authenticated;
grant execute on function public.excluir_foto_da_vistoria(uuid) to authenticated;
grant execute on function public.enviar_vistoria(uuid, integer) to authenticated;
grant execute on function public.conferir_vistoria(uuid, public.decisao_conferencia, text, integer) to authenticated;
grant execute on function public.cancelar_vistoria(uuid, text, integer) to authenticated;
grant execute on function public.listar_vistorias(uuid, boolean, integer, integer) to authenticated;
grant execute on function public.obter_vistoria(uuid) to authenticated;
