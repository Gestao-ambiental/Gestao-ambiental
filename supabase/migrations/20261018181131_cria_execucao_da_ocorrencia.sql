-- Execução da ocorrência (épico 6; DEM-01 a DEM-04, DEM-09; regras "Execução, evidência e
-- conferência"). Etapas, evidência com data real de execução, conferência (aprovar ou devolver
-- com motivo), conclusão pela Gestão, conclusão sem evidência com justificativa e reabertura com
-- motivo. Upload não conclui; aprovar não conclui; só a Gestão conclui.
-- Decisões de 18/10/2026: conferência independente ligada (quem enviou não confere); a Gestão
-- designa o conferente e, sem designação, qualquer Gestão confere; data real no futuro é recusada.

-- ---------------------------------------------------------------------------
-- Política e campos novos
-- ---------------------------------------------------------------------------
alter table public.consultoria
  add column conferencia_independente boolean not null default true;

comment on column public.consultoria.conferencia_independente is
  'Quem enviou a evidência não pode conferi-la (§3.5). Ligada por padrão (decisão de 18/10/2026).';

alter table public.ocorrencia
  add column conferente_id uuid,
  add column concluida_em timestamptz,
  add column concluida_por uuid,
  add column concluida_sem_evidencia boolean not null default false,
  add constraint ocorrencia_conferente_fk foreign key (consultoria_id, conferente_id)
    references public.membro (consultoria_id, id) on delete restrict,
  add constraint ocorrencia_concluida_por_fk foreign key (consultoria_id, concluida_por)
    references public.membro (consultoria_id, id) on delete restrict,
  add constraint ocorrencia_conclusao_coerente check (
    (situacao = 'concluida') = (concluida_em is not null and concluida_por is not null)
    and (concluida_sem_evidencia = false or situacao = 'concluida')
  );

alter table public.documento drop constraint documento_entidade_valida;
alter table public.documento
  add constraint documento_entidade_valida check (entidade in ('instrumento', 'evidencia'));

create type public.modo_etapa as enum ('trabalho', 'espera_externa');
create type public.situacao_evidencia as enum ('em_conferencia', 'aprovada', 'devolvida');
create type public.decisao_conferencia as enum ('aprovada', 'devolvida');

-- ---------------------------------------------------------------------------
-- etapa: passo interno, com responsável próprio (membro) ou externo (texto, ex.: laboratório).
-- ---------------------------------------------------------------------------
create table public.etapa (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  ocorrencia_id uuid not null,
  titulo text not null,
  modo public.modo_etapa not null default 'trabalho',
  responsavel_id uuid,
  responsavel_externo text,
  meta date,
  horas_estimadas numeric(6, 2),
  posicao integer not null,
  criada_por uuid not null,
  criada_em timestamptz not null default now(),
  concluida_em timestamptz,
  concluida_por uuid,
  constraint etapa_titulo_preenchido check (length(btrim(titulo)) > 0),
  constraint etapa_horas_positivas check (horas_estimadas is null or horas_estimadas > 0),
  constraint etapa_conclusao_coerente check ((concluida_em is null) = (concluida_por is null)),
  constraint etapa_consultoria_id_id_key unique (consultoria_id, id),
  constraint etapa_ocorrencia_fk foreign key (consultoria_id, ocorrencia_id)
    references public.ocorrencia (consultoria_id, id) on delete restrict,
  constraint etapa_responsavel_fk foreign key (consultoria_id, responsavel_id)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint etapa_criada_por_fk foreign key (consultoria_id, criada_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint etapa_concluida_por_fk foreign key (consultoria_id, concluida_por)
    references public.membro (consultoria_id, id) on delete restrict
);

create index etapa_ocorrencia_idx on public.etapa (consultoria_id, ocorrencia_id, posicao);

-- ---------------------------------------------------------------------------
-- evidencia: cada envio é uma versão (v1, v2…) com arquivo imutável e a data real de execução.
-- A evidência substituída não apaga a aprovada nem a devolvida: tudo fica no histórico.
-- ---------------------------------------------------------------------------
create table public.evidencia (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  ocorrencia_id uuid not null,
  numero integer not null,
  documento_versao_id uuid not null,
  data_execucao date not null,
  situacao public.situacao_evidencia not null default 'em_conferencia',
  enviada_por uuid not null,
  enviada_em timestamptz not null default now(),
  constraint evidencia_consultoria_id_id_key unique (consultoria_id, id),
  constraint evidencia_numero_key unique (ocorrencia_id, numero),
  constraint evidencia_ocorrencia_fk foreign key (consultoria_id, ocorrencia_id)
    references public.ocorrencia (consultoria_id, id) on delete restrict,
  constraint evidencia_versao_fk foreign key (consultoria_id, documento_versao_id)
    references public.documento_versao (consultoria_id, id) on delete restrict,
  constraint evidencia_enviada_por_fk foreign key (consultoria_id, enviada_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on column public.evidencia.data_execucao is 'Data real em que a coleta/serviço foi feito, informada por quem envia. A data de upload não substitui (DEM-09).';

-- ---------------------------------------------------------------------------
-- conferencia: decisão do conferente sobre uma evidência.
-- ---------------------------------------------------------------------------
create table public.conferencia (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  evidencia_id uuid not null,
  decisao public.decisao_conferencia not null,
  conferente_id uuid not null,
  motivo text,
  decidida_em timestamptz not null default now(),
  constraint conferencia_motivo_ao_devolver check (decisao = 'aprovada' or length(btrim(coalesce(motivo, ''))) > 0),
  constraint conferencia_consultoria_id_id_key unique (consultoria_id, id),
  constraint conferencia_evidencia_key unique (evidencia_id),
  constraint conferencia_evidencia_fk foreign key (consultoria_id, evidencia_id)
    references public.evidencia (consultoria_id, id) on delete restrict,
  constraint conferencia_conferente_fk foreign key (consultoria_id, conferente_id)
    references public.membro (consultoria_id, id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- ocorrencia_historico: linha do tempo visível à equipe (a auditoria completa é da Gestão).
-- Append-only, preenchida só pelas RPCs.
-- ---------------------------------------------------------------------------
create table public.ocorrencia_historico (
  id bigint generated always as identity primary key,
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  ocorrencia_id uuid not null,
  tipo text not null,
  ator_id uuid,
  instante timestamptz not null default now(),
  evidencia_numero integer,
  detalhe text,
  constraint ocorrencia_historico_tipo_valido check (tipo in (
    'etapa_criada', 'etapa_concluida', 'evidencia_enviada', 'evidencia_aprovada', 'evidencia_devolvida',
    'conferente_designado', 'concluida', 'concluida_sem_evidencia', 'reaberta'
  )),
  constraint ocorrencia_historico_ocorrencia_fk foreign key (consultoria_id, ocorrencia_id)
    references public.ocorrencia (consultoria_id, id) on delete restrict,
  constraint ocorrencia_historico_ator_fk foreign key (consultoria_id, ator_id)
    references public.membro (consultoria_id, id) on delete restrict
);

create index ocorrencia_historico_idx on public.ocorrencia_historico (consultoria_id, ocorrencia_id, instante desc);

create trigger ocorrencia_historico_append_only
  before update or delete on public.ocorrencia_historico
  for each row execute function private.bloquear_alteracao_auditoria();

-- ---------------------------------------------------------------------------
-- RLS: membro ativo lê; escrita só por RPC.
-- ---------------------------------------------------------------------------
alter table public.etapa enable row level security;
alter table public.etapa force row level security;
alter table public.evidencia enable row level security;
alter table public.evidencia force row level security;
alter table public.conferencia enable row level security;
alter table public.conferencia force row level security;
alter table public.ocorrencia_historico enable row level security;
alter table public.ocorrencia_historico force row level security;

revoke all on table public.etapa, public.evidencia, public.conferencia, public.ocorrencia_historico
  from anon, authenticated;
grant select on table public.etapa, public.evidencia, public.conferencia, public.ocorrencia_historico
  to authenticated;

create policy etapa_select_membro_ativo on public.etapa
  for select to authenticated using ((select private.is_membro(consultoria_id)));
create policy evidencia_select_membro_ativo on public.evidencia
  for select to authenticated using ((select private.is_membro(consultoria_id)));
create policy conferencia_select_membro_ativo on public.conferencia
  for select to authenticated using ((select private.is_membro(consultoria_id)));
create policy ocorrencia_historico_select_membro_ativo on public.ocorrencia_historico
  for select to authenticated using ((select private.is_membro(consultoria_id)));

create trigger etapa_auditar after insert or update or delete on public.etapa
  for each row execute function private.auditar();
create trigger evidencia_auditar after insert or update or delete on public.evidencia
  for each row execute function private.auditar();
create trigger conferencia_auditar after insert or update or delete on public.conferencia
  for each row execute function private.auditar();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Ocorrência travada para escrita, com quem chama como membro ativo da consultoria.
create function private.ocorrencia_para_escrever(p_id uuid)
returns public.ocorrencia
language plpgsql
set search_path = ''
as $$
declare
  alvo public.ocorrencia;
begin
  select * into alvo from public.ocorrencia as o where o.id = p_id for update;
  if not found or private.membro_atual(alvo.consultoria_id) is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return alvo;
end;
$$;

create function private.registrar_historico(
  cid uuid,
  ocorrencia uuid,
  tipo text,
  numero integer default null,
  detalhe text default null
)
returns void
language sql
set search_path = ''
as $$
  insert into public.ocorrencia_historico (consultoria_id, ocorrencia_id, tipo, ator_id, evidencia_numero, detalhe)
  values (cid, ocorrencia, tipo, private.membro_atual(cid), numero, nullif(btrim(coalesce(detalhe, '')), ''))
$$;

revoke all on function private.ocorrencia_para_escrever(uuid) from public, anon, authenticated;
revoke all on function private.registrar_historico(uuid, uuid, text, integer, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Etapas (DEM-02): qualquer membro ativo cria e conclui, enquanto a ocorrência não está concluída.
-- ---------------------------------------------------------------------------
create function public.criar_etapa(
  p_id uuid,
  p_ocorrencia_id uuid,
  p_titulo text,
  p_modo public.modo_etapa,
  p_responsavel_id uuid,
  p_responsavel_externo text,
  p_meta date,
  p_horas numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.ocorrencia;
  posicao_nova integer;
begin
  alvo := private.ocorrencia_para_escrever(p_ocorrencia_id);
  if exists (select 1 from public.etapa as e where e.id = p_id) then
    if exists (select 1 from public.etapa as e where e.id = p_id and e.ocorrencia_id = alvo.id) then
      return p_id;
    end if;
    raise exception 'etapa_existente' using errcode = 'P0001';
  end if;
  if alvo.situacao = 'concluida' then
    raise exception 'ocorrencia_concluida' using errcode = 'P0001';
  end if;
  if btrim(coalesce(p_titulo, '')) = '' then
    raise exception 'titulo_obrigatorio' using errcode = '22023';
  end if;
  perform private.conferir_responsavel(alvo.consultoria_id, p_responsavel_id);

  select coalesce(max(e.posicao), 0) + 1 into posicao_nova from public.etapa as e where e.ocorrencia_id = alvo.id;
  insert into public.etapa (id, consultoria_id, ocorrencia_id, titulo, modo, responsavel_id, responsavel_externo,
                            meta, horas_estimadas, posicao, criada_por)
  values (p_id, alvo.consultoria_id, alvo.id, btrim(p_titulo), coalesce(p_modo, 'trabalho'), p_responsavel_id,
          nullif(btrim(coalesce(p_responsavel_externo, '')), ''), p_meta, p_horas, posicao_nova,
          private.membro_atual(alvo.consultoria_id));
  perform private.registrar_historico(alvo.consultoria_id, alvo.id, 'etapa_criada', null, btrim(p_titulo));
  return p_id;
end;
$$;

create function public.concluir_etapa(p_etapa_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  passo public.etapa;
  alvo public.ocorrencia;
begin
  select * into passo from public.etapa as e where e.id = p_etapa_id;
  if not found then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  alvo := private.ocorrencia_para_escrever(passo.ocorrencia_id);
  if alvo.situacao = 'concluida' then
    raise exception 'ocorrencia_concluida' using errcode = 'P0001';
  end if;
  if passo.concluida_em is not null then
    return;
  end if;

  update public.etapa as e
  set concluida_em = now(), concluida_por = private.membro_atual(alvo.consultoria_id)
  where e.id = passo.id;
  perform private.registrar_historico(alvo.consultoria_id, alvo.id, 'etapa_concluida', null, passo.titulo);
end;
$$;

-- ---------------------------------------------------------------------------
-- Evidência (DEM-03, DEM-09): qualquer membro ativo envia. O arquivo já está no Storage; aqui ele
-- vira versão imutável. A ocorrência passa a "em conferência". Upload não conclui.
-- ---------------------------------------------------------------------------
create function public.enviar_evidencia(
  p_ocorrencia_id uuid,
  p_evidencia_id uuid,
  p_versao_id uuid,
  p_caminho text,
  p_nome_original text,
  p_sha256 text,
  p_data_execucao date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.ocorrencia;
  objeto record;
  doc uuid;
  proximo integer;
begin
  alvo := private.ocorrencia_para_escrever(p_ocorrencia_id);

  select ev.numero into proximo from public.evidencia as ev where ev.id = p_evidencia_id;
  if found then
    if exists (select 1 from public.evidencia as ev where ev.id = p_evidencia_id and ev.ocorrencia_id = alvo.id) then
      return proximo;
    end if;
    raise exception 'evidencia_existente' using errcode = 'P0001';
  end if;

  if alvo.situacao = 'concluida' then
    raise exception 'ocorrencia_concluida' using errcode = 'P0001';
  end if;
  if alvo.situacao = 'em_conferencia' then
    raise exception 'aguardando_conferencia' using errcode = 'P0001';
  end if;
  if p_data_execucao is null then
    raise exception 'data_execucao_obrigatoria' using errcode = '22023';
  end if;
  if p_data_execucao > private.hoje_da_consultoria(alvo.consultoria_id) then
    raise exception 'data_execucao_futura' using errcode = '22023';
  end if;
  if split_part(p_caminho, '/', 1) <> alvo.consultoria_id::text
     or p_caminho !~ '^[0-9a-f-]{36}/evidencia/[0-9a-f-]{36}\.(pdf|png|jpg)$' then
    raise exception 'caminho_invalido' using errcode = '22023';
  end if;

  select o.metadata ->> 'mimetype' as mime, (o.metadata ->> 'size')::bigint as tamanho
  into objeto
  from storage.objects as o
  where o.bucket_id = 'arquivos' and o.name = p_caminho;
  if not found then
    raise exception 'arquivo_nao_encontrado' using errcode = 'P0001';
  end if;
  if objeto.mime is null or objeto.mime not in ('application/pdf', 'image/png', 'image/jpeg') then
    raise exception 'arquivo_tipo_invalido' using errcode = '22023';
  end if;
  if coalesce(objeto.tamanho, 0) <= 0 or objeto.tamanho > 26214400 then
    raise exception 'arquivo_grande_demais' using errcode = '22023';
  end if;

  select ev.documento_versao_id into doc from public.evidencia as ev
  where ev.ocorrencia_id = alvo.id order by ev.numero desc limit 1;
  if found then
    select v.documento_id into doc from public.documento_versao as v where v.id = doc;
  else
    insert into public.documento (consultoria_id, entidade) values (alvo.consultoria_id, 'evidencia')
    returning id into doc;
  end if;

  select coalesce(max(ev.numero), 0) + 1 into proximo from public.evidencia as ev where ev.ocorrencia_id = alvo.id;

  insert into public.documento_versao (id, consultoria_id, documento_id, numero, caminho, nome_original, mime,
                                       tamanho_bytes, sha256, autor_id)
  values (p_versao_id, alvo.consultoria_id, doc, proximo, p_caminho, btrim(p_nome_original), objeto.mime,
          objeto.tamanho, lower(p_sha256), private.membro_atual(alvo.consultoria_id));
  update public.documento as d set versao_vigente_id = p_versao_id where d.id = doc;

  insert into public.evidencia (id, consultoria_id, ocorrencia_id, numero, documento_versao_id, data_execucao,
                                enviada_por)
  values (p_evidencia_id, alvo.consultoria_id, alvo.id, proximo, p_versao_id, p_data_execucao,
          private.membro_atual(alvo.consultoria_id));

  update public.ocorrencia as o
  set situacao = 'em_conferencia', row_version = o.row_version + 1
  where o.id = alvo.id;
  perform private.registrar_historico(alvo.consultoria_id, alvo.id, 'evidencia_enviada', proximo);
  return proximo;
end;
$$;

-- Conferente designado pela Gestão (nulo tira a designação).
create function public.designar_conferente(p_ocorrencia_id uuid, p_membro_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.ocorrencia;
  nome text;
begin
  alvo := private.ocorrencia_para_escrever(p_ocorrencia_id);
  if not private.is_gestao(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  perform private.conferir_responsavel(alvo.consultoria_id, p_membro_id);
  if alvo.conferente_id is not distinct from p_membro_id then
    return;
  end if;

  update public.ocorrencia as o
  set conferente_id = p_membro_id, row_version = o.row_version + 1
  where o.id = alvo.id;
  select m.nome into nome from public.membro as m where m.id = p_membro_id;
  perform private.registrar_historico(alvo.consultoria_id, alvo.id, 'conferente_designado', null, nome);
end;
$$;

-- ---------------------------------------------------------------------------
-- Conferir (aprovar ou devolver com motivo). Pode conferir o conferente designado; sem ele, a
-- Gestão. Com a política de independência, quem enviou não confere. Aprovar não conclui.
-- ---------------------------------------------------------------------------
create function public.conferir_evidencia(
  p_evidencia_id uuid,
  p_decisao public.decisao_conferencia,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.evidencia;
  alvo public.ocorrencia;
  eu uuid;
  independente boolean;
begin
  select * into ev from public.evidencia as x where x.id = p_evidencia_id for update;
  if not found then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  alvo := private.ocorrencia_para_escrever(ev.ocorrencia_id);
  eu := private.membro_atual(alvo.consultoria_id);

  if alvo.conferente_id is not null then
    if alvo.conferente_id <> eu then
      raise exception 'sem_permissao' using errcode = '42501';
    end if;
  elsif not private.is_gestao(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  select c.conferencia_independente into independente from public.consultoria as c where c.id = alvo.consultoria_id;
  if independente and ev.enviada_por = eu then
    raise exception 'conferencia_independente' using errcode = 'P0001';
  end if;
  if ev.situacao <> 'em_conferencia' or alvo.situacao <> 'em_conferencia' then
    raise exception 'evidencia_ja_conferida' using errcode = 'P0001';
  end if;
  if p_decisao is null then
    raise exception 'decisao_obrigatoria' using errcode = '22023';
  end if;
  if p_decisao = 'devolvida' and btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'motivo_obrigatorio' using errcode = '22023';
  end if;

  insert into public.conferencia (consultoria_id, evidencia_id, decisao, conferente_id, motivo)
  values (alvo.consultoria_id, ev.id, p_decisao, eu, nullif(btrim(coalesce(p_motivo, '')), ''));
  update public.evidencia as x set situacao = p_decisao::text::public.situacao_evidencia where x.id = ev.id;

  if p_decisao = 'devolvida' then
    update public.ocorrencia as o set situacao = 'aberta', row_version = o.row_version + 1 where o.id = alvo.id;
    perform private.registrar_historico(alvo.consultoria_id, alvo.id, 'evidencia_devolvida', ev.numero, p_motivo);
  else
    update public.ocorrencia as o set row_version = o.row_version + 1 where o.id = alvo.id;
    perform private.registrar_historico(alvo.consultoria_id, alvo.id, 'evidencia_aprovada', ev.numero);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Concluir (só Gestão, com a última evidência aprovada), concluir sem evidência (só Gestão, com
-- justificativa) e reabrir (só Gestão, com motivo). Controle otimista em todas.
-- ---------------------------------------------------------------------------
create function private.conferir_gestao_e_versao(alvo public.ocorrencia, p_row_version integer)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_gestao(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function private.conferir_gestao_e_versao(public.ocorrencia, integer) from public, anon, authenticated;

create function public.concluir_ocorrencia(p_ocorrencia_id uuid, p_row_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.ocorrencia;
begin
  alvo := private.ocorrencia_para_escrever(p_ocorrencia_id);
  perform private.conferir_gestao_e_versao(alvo, p_row_version);
  if alvo.situacao = 'concluida' then
    raise exception 'ocorrencia_concluida' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.evidencia as ev
    where ev.ocorrencia_id = alvo.id and ev.situacao = 'aprovada'
      and ev.numero = (select max(x.numero) from public.evidencia as x where x.ocorrencia_id = alvo.id)
  ) then
    raise exception 'evidencia_nao_aprovada' using errcode = 'P0001';
  end if;

  update public.ocorrencia as o
  set situacao = 'concluida', concluida_em = now(), concluida_por = private.membro_atual(alvo.consultoria_id),
      concluida_sem_evidencia = false, row_version = o.row_version + 1
  where o.id = alvo.id;
  perform private.registrar_historico(alvo.consultoria_id, alvo.id, 'concluida');
  return alvo.row_version + 1;
end;
$$;

create function public.concluir_sem_evidencia(p_ocorrencia_id uuid, p_justificativa text, p_row_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.ocorrencia;
begin
  alvo := private.ocorrencia_para_escrever(p_ocorrencia_id);
  perform private.conferir_gestao_e_versao(alvo, p_row_version);
  if alvo.situacao = 'concluida' then
    raise exception 'ocorrencia_concluida' using errcode = 'P0001';
  end if;
  if btrim(coalesce(p_justificativa, '')) = '' then
    raise exception 'justificativa_obrigatoria' using errcode = '22023';
  end if;

  perform set_config('gestao_ambiental.motivo', btrim(p_justificativa), true);
  update public.ocorrencia as o
  set situacao = 'concluida', concluida_em = now(), concluida_por = private.membro_atual(alvo.consultoria_id),
      concluida_sem_evidencia = true, row_version = o.row_version + 1
  where o.id = alvo.id;
  perform private.registrar_historico(alvo.consultoria_id, alvo.id, 'concluida_sem_evidencia', null, p_justificativa);
  return alvo.row_version + 1;
end;
$$;

create function public.reabrir_ocorrencia(p_ocorrencia_id uuid, p_motivo text, p_row_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.ocorrencia;
begin
  alvo := private.ocorrencia_para_escrever(p_ocorrencia_id);
  perform private.conferir_gestao_e_versao(alvo, p_row_version);
  if alvo.situacao <> 'concluida' then
    raise exception 'ocorrencia_nao_concluida' using errcode = 'P0001';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'motivo_obrigatorio' using errcode = '22023';
  end if;

  perform set_config('gestao_ambiental.motivo', btrim(p_motivo), true);
  update public.ocorrencia as o
  set situacao = 'aberta', concluida_em = null, concluida_por = null, concluida_sem_evidencia = false,
      row_version = o.row_version + 1
  where o.id = alvo.id;
  perform private.registrar_historico(alvo.consultoria_id, alvo.id, 'reaberta', null, p_motivo);
  return alvo.row_version + 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leitura do detalhe (DEM-01): a ocorrência com origem (instrumento + condicionante + ciclo),
-- o prazo do ciclo anterior e a data de referência (janela do aviso de ciclo, DEM-09) e hoje.
-- ---------------------------------------------------------------------------
create function public.obter_ocorrencia(p_id uuid)
returns table (
  id uuid,
  consultoria_id uuid,
  instrumento_id uuid,
  ciclo integer,
  codigo text,
  titulo text,
  texto_literal text,
  licenca text,
  empreendimento_id uuid,
  empreendimento_nome text,
  unidade_nome text,
  prazo_oficial_original date,
  prazo_oficial_atual date,
  meta_interna date,
  prazo_ciclo_anterior date,
  data_referencia date,
  hoje date,
  situacao public.situacao_ocorrencia,
  responsavel_id uuid,
  responsavel_nome text,
  conferente_id uuid,
  conferente_nome text,
  concluida_em timestamptz,
  concluida_por_nome text,
  concluida_sem_evidencia boolean,
  conferencia_independente boolean,
  row_version integer
)
language sql
stable
set search_path = ''
as $$
  select
    o.id, o.consultoria_id, o.instrumento_id, o.ciclo, c.codigo, v.titulo, v.texto_literal,
    nullif(concat_ws(' ', t.sigla, i.numero), ''), e.id, e.nome, u.nome,
    o.prazo_oficial_original, o.prazo_oficial_atual, o.meta_interna,
    (select ant.prazo_oficial_original from public.ocorrencia as ant
     where ant.consultoria_id = o.consultoria_id and ant.condicionante_versao_id = o.condicionante_versao_id
       and ant.ciclo = o.ciclo - 1),
    v.data_referencia,
    private.hoje_da_consultoria(o.consultoria_id),
    o.situacao, o.responsavel_id, r.nome, o.conferente_id, cf.nome, o.concluida_em, cp.nome,
    o.concluida_sem_evidencia, co.conferencia_independente, o.row_version
  from public.ocorrencia as o
  join public.consultoria as co on co.id = o.consultoria_id
  join public.condicionante_versao as v on v.consultoria_id = o.consultoria_id and v.id = o.condicionante_versao_id
  join public.condicionante as c on c.consultoria_id = v.consultoria_id and c.id = v.condicionante_id
  join public.instrumento as i on i.consultoria_id = o.consultoria_id and i.id = o.instrumento_id
  join public.unidade as u on u.consultoria_id = i.consultoria_id and u.id = i.unidade_id
  join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  left join public.membro as r on r.consultoria_id = o.consultoria_id and r.id = o.responsavel_id
  left join public.membro as cf on cf.consultoria_id = o.consultoria_id and cf.id = o.conferente_id
  left join public.membro as cp on cp.consultoria_id = o.consultoria_id and cp.id = o.concluida_por
  where o.id = p_id
$$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
revoke all on function public.criar_etapa(uuid, uuid, text, public.modo_etapa, uuid, text, date, numeric) from public, anon;
revoke all on function public.concluir_etapa(uuid) from public, anon;
revoke all on function public.enviar_evidencia(uuid, uuid, uuid, text, text, text, date) from public, anon;
revoke all on function public.designar_conferente(uuid, uuid) from public, anon;
revoke all on function public.conferir_evidencia(uuid, public.decisao_conferencia, text) from public, anon;
revoke all on function public.concluir_ocorrencia(uuid, integer) from public, anon;
revoke all on function public.concluir_sem_evidencia(uuid, text, integer) from public, anon;
revoke all on function public.reabrir_ocorrencia(uuid, text, integer) from public, anon;
revoke all on function public.obter_ocorrencia(uuid) from public, anon;

grant execute on function public.criar_etapa(uuid, uuid, text, public.modo_etapa, uuid, text, date, numeric) to authenticated;
grant execute on function public.concluir_etapa(uuid) to authenticated;
grant execute on function public.enviar_evidencia(uuid, uuid, uuid, text, text, text, date) to authenticated;
grant execute on function public.designar_conferente(uuid, uuid) to authenticated;
grant execute on function public.conferir_evidencia(uuid, public.decisao_conferencia, text) to authenticated;
grant execute on function public.concluir_ocorrencia(uuid, integer) to authenticated;
grant execute on function public.concluir_sem_evidencia(uuid, text, integer) to authenticated;
grant execute on function public.reabrir_ocorrencia(uuid, text, integer) to authenticated;
grant execute on function public.obter_ocorrencia(uuid) to authenticated;
