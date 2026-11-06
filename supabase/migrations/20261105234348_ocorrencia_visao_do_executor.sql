-- Ocorrência na visão de quem executa (Tela 16 v2; DEM-01, DEM-03, DEM-09). Envio com vários
-- arquivos e observações, cancelar envio enquanto ninguém conferiu, comentários com menção na
-- atividade, prorrogação com ofício, pedido de encerramento à Gestão e meta interna.
-- ---------------------------------------------------------------------------

-- evidencia: continua sendo o envio (v1, v2…); agora com observações, cancelamento e N arquivos.
alter table public.evidencia
  add column observacoes text,
  add column cancelada_em timestamptz,
  add column cancelada_por uuid,
  add constraint evidencia_cancelada_por_fk foreign key (consultoria_id, cancelada_por)
    references public.membro (consultoria_id, id) on delete restrict,
  add constraint evidencia_cancelamento_coerente check ((cancelada_em is null) = (cancelada_por is null));

-- Arquivos de cada envio. Reenviar depois de devolver liga de novo as versões mantidas (sem novo
-- upload); o arquivo continua imutável e cada envio guarda exatamente o que foi enviado.
create table public.evidencia_arquivo (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  evidencia_id uuid not null,
  documento_versao_id uuid not null,
  posicao integer not null,
  constraint evidencia_arquivo_versao_key unique (evidencia_id, documento_versao_id),
  constraint evidencia_arquivo_posicao_key unique (evidencia_id, posicao),
  constraint evidencia_arquivo_evidencia_fk foreign key (consultoria_id, evidencia_id)
    references public.evidencia (consultoria_id, id) on delete restrict,
  constraint evidencia_arquivo_versao_fk foreign key (consultoria_id, documento_versao_id)
    references public.documento_versao (consultoria_id, id) on delete restrict
);

-- Envios antigos (um arquivo cada) passam para a tabela nova; a coluna única sai.
insert into public.evidencia_arquivo (consultoria_id, evidencia_id, documento_versao_id, posicao)
select ev.consultoria_id, ev.id, ev.documento_versao_id, 1 from public.evidencia as ev;
alter table public.evidencia drop column documento_versao_id;

-- Ofício da prorrogação também é documento versionado.
alter table public.documento drop constraint documento_entidade_valida;
alter table public.documento
  add constraint documento_entidade_valida check (entidade in ('instrumento', 'evidencia', 'prorrogacao'));

-- prorrogacao: único caminho para mudar o prazo oficial atual (o original nunca muda).
create table public.prorrogacao (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  ocorrencia_id uuid not null,
  numero_oficio text not null,
  prazo_anterior date not null,
  novo_prazo date not null,
  documento_versao_id uuid not null,
  registrada_por uuid not null,
  registrada_em timestamptz not null default now(),
  constraint prorrogacao_oficio_preenchido check (length(btrim(numero_oficio)) > 0),
  constraint prorrogacao_consultoria_id_id_key unique (consultoria_id, id),
  constraint prorrogacao_ocorrencia_fk foreign key (consultoria_id, ocorrencia_id)
    references public.ocorrencia (consultoria_id, id) on delete restrict,
  constraint prorrogacao_versao_fk foreign key (consultoria_id, documento_versao_id)
    references public.documento_versao (consultoria_id, id) on delete restrict,
  constraint prorrogacao_registrada_por_fk foreign key (consultoria_id, registrada_por)
    references public.membro (consultoria_id, id) on delete restrict
);

create index prorrogacao_ocorrencia_idx on public.prorrogacao (consultoria_id, ocorrencia_id);

-- pedido_encerramento: "Não se aplica". Quem executa pede; a decisão é da Gestão (fora desta
-- fatia: as colunas de decisão já existem para não mudar a tabela depois).
create table public.pedido_encerramento (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  ocorrencia_id uuid not null,
  justificativa text not null,
  solicitado_por uuid not null,
  solicitado_em timestamptz not null default now(),
  decisao text,
  decidido_por uuid,
  decidido_em timestamptz,
  constraint pedido_encerramento_justificativa_preenchida check (length(btrim(justificativa)) > 0),
  constraint pedido_encerramento_decisao_valida check (decisao is null or decisao in ('aceito', 'recusado')),
  constraint pedido_encerramento_decisao_coerente check (
    (decisao is null) = (decidido_por is null) and (decisao is null) = (decidido_em is null)),
  constraint pedido_encerramento_consultoria_id_id_key unique (consultoria_id, id),
  constraint pedido_encerramento_ocorrencia_fk foreign key (consultoria_id, ocorrencia_id)
    references public.ocorrencia (consultoria_id, id) on delete restrict,
  constraint pedido_encerramento_solicitado_por_fk foreign key (consultoria_id, solicitado_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint pedido_encerramento_decidido_por_fk foreign key (consultoria_id, decidido_por)
    references public.membro (consultoria_id, id) on delete restrict
);

-- No máximo um pedido aguardando decisão por ocorrência.
create unique index pedido_encerramento_pendente_key on public.pedido_encerramento (ocorrencia_id)
  where decisao is null;

-- Atividade: ocorrencia_historico vira o feed único (eventos + comentários). Continua append-only.
alter table public.ocorrencia_historico
  add column dados jsonb,
  add column chave uuid,
  add constraint ocorrencia_historico_chave_key unique (chave),
  add constraint ocorrencia_historico_comentario_curto check (tipo <> 'comentario' or length(detalhe) <= 5000);
alter table public.ocorrencia_historico drop constraint ocorrencia_historico_tipo_valido;
alter table public.ocorrencia_historico
  add constraint ocorrencia_historico_tipo_valido check (tipo in (
    'etapa_criada', 'etapa_concluida', 'evidencia_enviada', 'evidencia_aprovada', 'evidencia_devolvida',
    'conferente_designado', 'concluida', 'concluida_sem_evidencia', 'reaberta',
    'comentario', 'evidencia_cancelada', 'prazo_prorrogado', 'encerramento_solicitado',
    'meta_definida', 'responsavel_definido'
  ));

comment on column public.ocorrencia_historico.dados is
  'Complemento estruturado do evento: menções do comentário, arquivos do envio, prazos da prorrogação.';

-- RLS: membro ativo lê; escrita só por RPC.
alter table public.evidencia_arquivo enable row level security;
alter table public.evidencia_arquivo force row level security;
alter table public.prorrogacao enable row level security;
alter table public.prorrogacao force row level security;
alter table public.pedido_encerramento enable row level security;
alter table public.pedido_encerramento force row level security;

revoke all on table public.evidencia_arquivo, public.prorrogacao, public.pedido_encerramento
  from anon, authenticated;
grant select on table public.evidencia_arquivo, public.prorrogacao, public.pedido_encerramento
  to authenticated;

create policy evidencia_arquivo_select_membro_ativo on public.evidencia_arquivo
  for select to authenticated using ((select private.is_membro(consultoria_id)));
create policy prorrogacao_select_membro_ativo on public.prorrogacao
  for select to authenticated using ((select private.is_membro(consultoria_id)));
create policy pedido_encerramento_select_membro_ativo on public.pedido_encerramento
  for select to authenticated using ((select private.is_membro(consultoria_id)));

create trigger evidencia_arquivo_auditar after insert or update or delete on public.evidencia_arquivo
  for each row execute function private.auditar();
create trigger prorrogacao_auditar after insert or update or delete on public.prorrogacao
  for each row execute function private.auditar();
create trigger pedido_encerramento_auditar after insert or update or delete on public.pedido_encerramento
  for each row execute function private.auditar();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function private.registrar_atividade(
  cid uuid, ocorrencia uuid, tipo text, detalhe text default null, dados jsonb default null,
  numero integer default null, chave uuid default null
)
returns bigint
language sql
set search_path = ''
as $$
  insert into public.ocorrencia_historico (consultoria_id, ocorrencia_id, tipo, ator_id, evidencia_numero,
                                           detalhe, dados, chave)
  values (cid, ocorrencia, tipo, private.membro_atual(cid), numero, nullif(btrim(coalesce(detalhe, '')), ''),
          dados, chave)
  returning id
$$;

-- Objeto já enviado ao Storage vira documento + versão 1 (ADR-0008). Confere caminho, existência,
-- tipo e tamanho no próprio Storage (não confia no que a tela diz).
create function private.registrar_arquivo(
  cid uuid, entidade text, p_versao_id uuid, p_caminho text, p_nome_original text, p_sha256 text,
  tipos text[]
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  objeto record;
  doc uuid;
begin
  if split_part(p_caminho, '/', 1) <> cid::text
     or p_caminho !~ ('^[0-9a-f-]{36}/' || entidade || '/[0-9a-f-]{36}\.(pdf|png|jpg)$') then
    raise exception 'caminho_invalido' using errcode = '22023';
  end if;
  select o.metadata ->> 'mimetype' as mime, (o.metadata ->> 'size')::bigint as tamanho into objeto
  from storage.objects as o where o.bucket_id = 'arquivos' and o.name = p_caminho;
  if not found then
    raise exception 'arquivo_nao_encontrado' using errcode = 'P0001';
  end if;
  if objeto.mime is null or not (objeto.mime = any (tipos)) then
    raise exception 'arquivo_tipo_invalido' using errcode = '22023';
  end if;
  if coalesce(objeto.tamanho, 0) <= 0 or objeto.tamanho > 26214400 then
    raise exception 'arquivo_grande_demais' using errcode = '22023';
  end if;
  if btrim(coalesce(p_nome_original, '')) = '' then
    raise exception 'nome_obrigatorio' using errcode = '22023';
  end if;

  insert into public.documento (consultoria_id, entidade) values (cid, entidade) returning id into doc;
  insert into public.documento_versao (id, consultoria_id, documento_id, numero, caminho, nome_original, mime,
                                       tamanho_bytes, sha256, autor_id)
  values (p_versao_id, cid, doc, 1, p_caminho, btrim(p_nome_original), objeto.mime, objeto.tamanho,
          lower(p_sha256), private.membro_atual(cid));
  update public.documento as d set versao_vigente_id = p_versao_id where d.id = doc;
  return p_versao_id;
end;
$$;

revoke all on function private.registrar_atividade(uuid, uuid, text, text, jsonb, integer, uuid)
  from public, anon, authenticated;
revoke all on function private.registrar_arquivo(uuid, text, uuid, text, text, text, text[])
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enviar (e reenviar) para conferência: vários arquivos, data real, observações.
-- p_arquivos: [{ "versao_id", "caminho", "nome_original", "sha256" }] já no Storage.
-- p_mantidos: versões de envios anteriores desta ocorrência que seguem no novo envio.
-- Repetir com o mesmo p_evidencia_id não duplica.
-- ---------------------------------------------------------------------------
drop function public.enviar_evidencia(uuid, uuid, uuid, text, text, text, date);

create function public.enviar_evidencia(
  p_ocorrencia_id uuid,
  p_evidencia_id uuid,
  p_data_execucao date,
  p_observacoes text,
  p_arquivos jsonb,
  p_mantidos uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.ocorrencia;
  eu uuid;
  proximo integer;
  item jsonb;
  posicao_atual integer := 0;
  versao uuid;
  total integer;
begin
  alvo := private.ocorrencia_para_escrever(p_ocorrencia_id);
  eu := private.membro_atual(alvo.consultoria_id);

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

  total := coalesce(jsonb_array_length(p_arquivos), 0) + coalesce(cardinality(p_mantidos), 0);
  if total = 0 then
    raise exception 'arquivos_obrigatorios' using errcode = '22023';
  end if;
  if total > 20 then
    raise exception 'arquivos_demais' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_mantidos, '{}')) as m(id)
    where not exists (
      select 1 from public.evidencia_arquivo as a
      join public.evidencia as ev on ev.id = a.evidencia_id
      where a.documento_versao_id = m.id and ev.ocorrencia_id = alvo.id
    )
  ) then
    raise exception 'arquivo_nao_encontrado' using errcode = 'P0001';
  end if;

  select coalesce(max(ev.numero), 0) + 1 into proximo from public.evidencia as ev where ev.ocorrencia_id = alvo.id;
  insert into public.evidencia (id, consultoria_id, ocorrencia_id, numero, data_execucao, observacoes, enviada_por)
  values (p_evidencia_id, alvo.consultoria_id, alvo.id, proximo, p_data_execucao,
          nullif(btrim(coalesce(p_observacoes, '')), ''), eu);

  foreach versao in array coalesce(p_mantidos, '{}') loop
    posicao_atual := posicao_atual + 1;
    insert into public.evidencia_arquivo (consultoria_id, evidencia_id, documento_versao_id, posicao)
    values (alvo.consultoria_id, p_evidencia_id, versao, posicao_atual);
  end loop;
  for item in select a.value from jsonb_array_elements(coalesce(p_arquivos, '[]'::jsonb)) as a loop
    posicao_atual := posicao_atual + 1;
    versao := private.registrar_arquivo(alvo.consultoria_id, 'evidencia', (item ->> 'versao_id')::uuid,
      item ->> 'caminho', item ->> 'nome_original', item ->> 'sha256',
      array['application/pdf', 'image/png', 'image/jpeg']);
    insert into public.evidencia_arquivo (consultoria_id, evidencia_id, documento_versao_id, posicao)
    values (alvo.consultoria_id, p_evidencia_id, versao, posicao_atual);
  end loop;

  update public.ocorrencia as o
  set situacao = 'em_conferencia', row_version = o.row_version + 1
  where o.id = alvo.id;
  perform private.registrar_atividade(alvo.consultoria_id, alvo.id, 'evidencia_enviada', null,
    jsonb_build_object('evidencia_id', p_evidencia_id, 'arquivos', total), proximo);
  return proximo;
end;
$$;

-- Cancelar envio: só quem enviou, e só enquanto ninguém conferiu. Volta para A fazer.
create function public.cancelar_envio(p_evidencia_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.evidencia;
  alvo public.ocorrencia;
begin
  select * into ev from public.evidencia as x where x.id = p_evidencia_id for update;
  if not found then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  alvo := private.ocorrencia_para_escrever(ev.ocorrencia_id);
  if ev.situacao = 'cancelada' then
    return;
  end if;
  if ev.enviada_por <> private.membro_atual(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if ev.situacao <> 'em_conferencia' or alvo.situacao <> 'em_conferencia' then
    raise exception 'evidencia_ja_conferida' using errcode = 'P0001';
  end if;

  update public.evidencia as x
  set situacao = 'cancelada', cancelada_em = now(), cancelada_por = ev.enviada_por
  where x.id = ev.id;
  update public.ocorrencia as o set situacao = 'aberta', row_version = o.row_version + 1 where o.id = alvo.id;
  perform private.registrar_atividade(alvo.consultoria_id, alvo.id, 'evidencia_cancelada', null, null, ev.numero);
end;
$$;

-- Comentário com menções (membros ativos da consultoria). Repetir com a mesma chave não duplica.
create function public.comentar_ocorrencia(p_chave uuid, p_ocorrencia_id uuid, p_texto text, p_mencoes uuid[])
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.ocorrencia;
  existente bigint;
begin
  select o.* into alvo from public.ocorrencia as o where o.id = p_ocorrencia_id;
  if not found or private.membro_atual(alvo.consultoria_id) is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select h.id into existente from public.ocorrencia_historico as h where h.chave = p_chave;
  if found then
    return existente;
  end if;
  if btrim(coalesce(p_texto, '')) = '' then
    raise exception 'comentario_obrigatorio' using errcode = '22023';
  end if;
  if length(btrim(p_texto)) > 5000 then
    raise exception 'comentario_longo' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_mencoes, '{}')) as m(id)
    where not exists (select 1 from public.membro as x
                      where x.id = m.id and x.consultoria_id = alvo.consultoria_id and x.situacao = 'ativo')
  ) then
    raise exception 'mencao_invalida' using errcode = '22023';
  end if;

  return private.registrar_atividade(alvo.consultoria_id, alvo.id, 'comentario', p_texto,
    jsonb_build_object('mencoes', to_jsonb(coalesce(p_mencoes, '{}'))), null, p_chave);
end;
$$;

-- Prazo prorrogado: ofício (número + PDF) e novo prazo futuro. Muda só o prazo oficial atual.
create function public.registrar_prorrogacao(
  p_id uuid,
  p_ocorrencia_id uuid,
  p_numero_oficio text,
  p_novo_prazo date,
  p_versao_id uuid,
  p_caminho text,
  p_nome_original text,
  p_sha256 text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.ocorrencia;
begin
  alvo := private.ocorrencia_para_escrever(p_ocorrencia_id);
  if exists (select 1 from public.prorrogacao as p where p.id = p_id) then
    if exists (select 1 from public.prorrogacao as p where p.id = p_id and p.ocorrencia_id = alvo.id) then
      return alvo.row_version;
    end if;
    raise exception 'prorrogacao_existente' using errcode = 'P0001';
  end if;
  if alvo.situacao = 'concluida' then
    raise exception 'ocorrencia_concluida' using errcode = 'P0001';
  end if;
  if btrim(coalesce(p_numero_oficio, '')) = '' then
    raise exception 'oficio_obrigatorio' using errcode = '22023';
  end if;
  if p_novo_prazo is null then
    raise exception 'novo_prazo_obrigatorio' using errcode = '22023';
  end if;
  if p_novo_prazo <= private.hoje_da_consultoria(alvo.consultoria_id) then
    raise exception 'novo_prazo_no_passado' using errcode = '22023';
  end if;

  perform private.registrar_arquivo(alvo.consultoria_id, 'prorrogacao', p_versao_id, p_caminho,
    p_nome_original, p_sha256, array['application/pdf']);
  insert into public.prorrogacao (id, consultoria_id, ocorrencia_id, numero_oficio, prazo_anterior, novo_prazo,
                                  documento_versao_id, registrada_por)
  values (p_id, alvo.consultoria_id, alvo.id, btrim(p_numero_oficio), alvo.prazo_oficial_atual, p_novo_prazo,
          p_versao_id, private.membro_atual(alvo.consultoria_id));
  update public.ocorrencia as o
  set prazo_oficial_atual = p_novo_prazo, row_version = o.row_version + 1
  where o.id = alvo.id;
  perform private.registrar_atividade(alvo.consultoria_id, alvo.id, 'prazo_prorrogado', btrim(p_numero_oficio),
    jsonb_build_object('prazo_anterior', alvo.prazo_oficial_atual, 'novo_prazo', p_novo_prazo));
  return alvo.row_version + 1;
end;
$$;

-- Não se aplica: pedido de encerramento para a Gestão (quem executa não encerra).
create function public.solicitar_encerramento(p_id uuid, p_ocorrencia_id uuid, p_justificativa text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.ocorrencia;
begin
  alvo := private.ocorrencia_para_escrever(p_ocorrencia_id);
  if exists (select 1 from public.pedido_encerramento as p where p.id = p_id) then
    if exists (select 1 from public.pedido_encerramento as p where p.id = p_id and p.ocorrencia_id = alvo.id) then
      return;
    end if;
    raise exception 'pedido_existente' using errcode = 'P0001';
  end if;
  if alvo.situacao = 'concluida' then
    raise exception 'ocorrencia_concluida' using errcode = 'P0001';
  end if;
  if btrim(coalesce(p_justificativa, '')) = '' then
    raise exception 'justificativa_obrigatoria' using errcode = '22023';
  end if;
  if exists (select 1 from public.pedido_encerramento as p where p.ocorrencia_id = alvo.id and p.decisao is null) then
    raise exception 'encerramento_ja_solicitado' using errcode = 'P0001';
  end if;

  insert into public.pedido_encerramento (id, consultoria_id, ocorrencia_id, justificativa, solicitado_por)
  values (p_id, alvo.consultoria_id, alvo.id, btrim(p_justificativa), private.membro_atual(alvo.consultoria_id));
  perform private.registrar_atividade(alvo.consultoria_id, alvo.id, 'encerramento_solicitado', p_justificativa);
end;
$$;

-- Fazer agora: nova meta interna (futura). Organizacional; não mexe no prazo oficial.
create function public.definir_meta_interna(p_ocorrencia_id uuid, p_meta date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.ocorrencia;
begin
  alvo := private.ocorrencia_para_escrever(p_ocorrencia_id);
  if alvo.situacao = 'concluida' then
    raise exception 'ocorrencia_concluida' using errcode = 'P0001';
  end if;
  if p_meta is null then
    raise exception 'meta_obrigatoria' using errcode = '22023';
  end if;
  if p_meta <= private.hoje_da_consultoria(alvo.consultoria_id) then
    raise exception 'meta_no_passado' using errcode = '22023';
  end if;
  if alvo.meta_interna is not distinct from p_meta then
    return;
  end if;

  update public.ocorrencia as o set meta_interna = p_meta, row_version = o.row_version + 1 where o.id = alvo.id;
  perform private.registrar_atividade(alvo.consultoria_id, alvo.id, 'meta_definida', null,
    jsonb_build_object('meta', p_meta));
end;
$$;

-- atribuir_ocorrencia (Visão da equipe) passa a registrar "definiu X como responsável".
create or replace function public.atribuir_ocorrencia(p_ocorrencia_id uuid, p_membro_id uuid, p_row_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.ocorrencia;
  nome text;
begin
  select * into alvo from public.ocorrencia as o where o.id = p_ocorrencia_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.situacao = 'concluida' then
    raise exception 'ocorrencia_concluida' using errcode = 'P0001';
  end if;
  if alvo.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  perform private.conferir_responsavel(alvo.consultoria_id, p_membro_id);

  update public.ocorrencia as o
  set responsavel_id = p_membro_id, row_version = o.row_version + 1
  where o.id = alvo.id;
  if alvo.responsavel_id is distinct from p_membro_id then
    select m.nome into nome from public.membro as m where m.id = p_membro_id;
    perform private.registrar_atividade(alvo.consultoria_id, alvo.id, 'responsavel_definido', nome,
      jsonb_build_object('membro_id', p_membro_id));
  end if;
  return alvo.row_version + 1;
end;
$$;

-- obter_ocorrencia ganha o que a tela nova mostra: links do breadcrumb, recorrência (rótulo do
-- ciclo), criação (evento do Sistema), ciclo anterior e pedido de encerramento pendente.
drop function public.obter_ocorrencia(uuid);
create function public.obter_ocorrencia(p_id uuid)
returns table (
  id uuid, consultoria_id uuid, instrumento_id uuid, ciclo integer, codigo text, titulo text,
  texto_literal text, licenca text, empreendimento_id uuid, empreendimento_nome text, unidade_nome text,
  prazo_oficial_original date, prazo_oficial_atual date, meta_interna date, prazo_ciclo_anterior date,
  ocorrencia_anterior_id uuid, data_referencia date, hoje date, recorrencia public.recorrencia_prazo,
  criado_em timestamptz, situacao public.situacao_ocorrencia, responsavel_id uuid, responsavel_nome text,
  conferente_id uuid, conferente_nome text, concluida_em timestamptz, concluida_por_nome text,
  concluida_sem_evidencia boolean, conferencia_independente boolean, encerramento_solicitado_em timestamptz,
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
    ant.prazo_oficial_original, ant.id,
    v.data_referencia, private.hoje_da_consultoria(o.consultoria_id), v.recorrencia, o.criado_em,
    o.situacao, o.responsavel_id, r.nome, o.conferente_id, cf.nome, o.concluida_em, cp.nome,
    o.concluida_sem_evidencia, co.conferencia_independente,
    (select p.solicitado_em from public.pedido_encerramento as p
     where p.consultoria_id = o.consultoria_id and p.ocorrencia_id = o.id and p.decisao is null),
    o.row_version
  from public.ocorrencia as o
  join public.consultoria as co on co.id = o.consultoria_id
  join public.condicionante_versao as v on v.consultoria_id = o.consultoria_id and v.id = o.condicionante_versao_id
  join public.condicionante as c on c.consultoria_id = v.consultoria_id and c.id = v.condicionante_id
  join public.instrumento as i on i.consultoria_id = o.consultoria_id and i.id = o.instrumento_id
  join public.unidade as u on u.consultoria_id = i.consultoria_id and u.id = i.unidade_id
  join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  left join public.ocorrencia as ant on ant.consultoria_id = o.consultoria_id
    and ant.condicionante_versao_id = o.condicionante_versao_id and ant.ciclo = o.ciclo - 1
  left join public.membro as r on r.consultoria_id = o.consultoria_id and r.id = o.responsavel_id
  left join public.membro as cf on cf.consultoria_id = o.consultoria_id and cf.id = o.conferente_id
  left join public.membro as cp on cp.consultoria_id = o.consultoria_id and cp.id = o.concluida_por
  where o.id = p_id
$$;

-- Permissões
revoke all on function public.enviar_evidencia(uuid, uuid, date, text, jsonb, uuid[]) from public, anon;
revoke all on function public.cancelar_envio(uuid) from public, anon;
revoke all on function public.comentar_ocorrencia(uuid, uuid, text, uuid[]) from public, anon;
revoke all on function public.registrar_prorrogacao(uuid, uuid, text, date, uuid, text, text, text) from public, anon;
revoke all on function public.solicitar_encerramento(uuid, uuid, text) from public, anon;
revoke all on function public.definir_meta_interna(uuid, date) from public, anon;
revoke all on function public.obter_ocorrencia(uuid) from public, anon;

grant execute on function public.enviar_evidencia(uuid, uuid, date, text, jsonb, uuid[]) to authenticated;
grant execute on function public.cancelar_envio(uuid) to authenticated;
grant execute on function public.comentar_ocorrencia(uuid, uuid, text, uuid[]) to authenticated;
grant execute on function public.registrar_prorrogacao(uuid, uuid, text, date, uuid, text, text, text) to authenticated;
grant execute on function public.solicitar_encerramento(uuid, uuid, text) to authenticated;
grant execute on function public.definir_meta_interna(uuid, date) to authenticated;
grant execute on function public.obter_ocorrencia(uuid) to authenticated;
