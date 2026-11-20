-- Relatório escrito no Grama, com revisão e conferência por IA no texto (ADR-0040).
-- Revê a decisão 2 da ADR-0036 ("o rascunho não fica no Grama"): o relatório nasce de um modelo já
-- preenchido, é editado no mesmo editor dos modelos e fica salvo com versões. Quem escreveu envia
-- para revisão; quem confere corrige no mesmo texto e devolve ou aprova. O .docx é só a saída.
-- O anexo pronto (evidência em PDF ou .docx) continua como estava.
--
-- 1. relatorio (o estado atual) e relatorio_versao (uma linha por conteúdo salvo, append-only).
-- 2. Quem edita: o autor no rascunho ou devolvido; na revisão, quem confere (conferente designado da
--    ocorrência ou, sem ele, a Gestão). Com a conferência independente da consultoria, quem escreveu
--    não revisa nem aprova. Aprovado não se edita.
-- 3. RPCs: criar, salvar (versão nova numa transação, controle otimista), enviar, devolver, aprovar.
-- 4. conferencia_ia passa a conferir uma versão do relatório (ou a evidência, nunca os dois) e guarda
--    os apontamentos ignorados. iniciar_conferencia_relatorio devolve o conteúdo da versão e o contexto
--    do cadastro; a Edge Function conferir-relatorio faz o resto, com a mesma cota.
-- Criada pela CLI; vem depois da busca global (20261120050346).

-- ---------------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------------
create table public.relatorio (
  id uuid primary key,
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  empreendimento_id uuid not null,
  ocorrencia_id uuid,
  modelo_id uuid,
  titulo text not null,
  conteudo jsonb not null,
  situacao text not null default 'rascunho',
  versao integer not null default 1,
  row_version integer not null default 1,
  autor_id uuid not null,
  atualizado_por uuid not null,
  revisor_id uuid,
  motivo_devolucao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  enviado_em timestamptz,
  decidido_em timestamptz,
  constraint relatorio_consultoria_id_id_key unique (consultoria_id, id),
  constraint relatorio_titulo check (length(btrim(titulo)) between 1 and 200),
  constraint relatorio_conteudo check (
    jsonb_typeof(conteudo) = 'object' and conteudo ->> 'type' = 'doc'
    and length(conteudo::text) <= 1000000),
  constraint relatorio_situacao check (situacao in ('rascunho', 'em_revisao', 'devolvido', 'aprovado')),
  constraint relatorio_devolucao check ((situacao = 'devolvido') = (motivo_devolucao is not null)),
  constraint relatorio_empreendimento_fk foreign key (consultoria_id, empreendimento_id)
    references public.empreendimento (consultoria_id, id) on delete restrict,
  constraint relatorio_ocorrencia_fk foreign key (consultoria_id, ocorrencia_id)
    references public.ocorrencia (consultoria_id, id) on delete restrict,
  constraint relatorio_modelo_fk foreign key (consultoria_id, modelo_id)
    references public.modelo_documento (consultoria_id, id) on delete restrict,
  constraint relatorio_autor_fk foreign key (consultoria_id, autor_id)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint relatorio_atualizado_por_fk foreign key (consultoria_id, atualizado_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint relatorio_revisor_fk foreign key (consultoria_id, revisor_id)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.relatorio is
  'Relatório escrito no Grama (ADR-0040): texto do editor com versões, revisão e conferência por IA.';
comment on column public.relatorio.versao is 'Número da versão atual em relatorio_versao.';

create index relatorio_ocorrencia_idx on public.relatorio (consultoria_id, ocorrencia_id, atualizado_em desc);
create index relatorio_empreendimento_idx
  on public.relatorio (consultoria_id, empreendimento_id, atualizado_em desc);

create table public.relatorio_versao (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  relatorio_id uuid not null,
  numero integer not null,
  titulo text not null,
  conteudo jsonb not null,
  autor_id uuid not null,
  criada_em timestamptz not null default now(),
  constraint relatorio_versao_numero_key unique (relatorio_id, numero),
  constraint relatorio_versao_relatorio_fk foreign key (consultoria_id, relatorio_id)
    references public.relatorio (consultoria_id, id) on delete restrict,
  constraint relatorio_versao_autor_fk foreign key (consultoria_id, autor_id)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.relatorio_versao is 'Cada conteúdo salvo do relatório (append-only), com autor e instante.';

create trigger relatorio_versao_append_only
  before update or delete on public.relatorio_versao
  for each row execute function private.bloquear_alteracao_auditoria();

do $$
declare
  tabela text;
begin
  foreach tabela in array array['relatorio', 'relatorio_versao'] loop
    execute format('alter table public.%I enable row level security', tabela);
    execute format('alter table public.%I force row level security', tabela);
    execute format('revoke all on table public.%I from anon, authenticated', tabela);
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
-- 2. Quem edita e quem revisa
-- ---------------------------------------------------------------------------
-- Revisor: o conferente designado da ocorrência ou, sem ele (ou sem ocorrência), a Gestão. Com a
-- conferência independente, nunca o autor.
create function private.pode_revisar_relatorio(r public.relatorio)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  eu uuid := private.membro_atual(r.consultoria_id);
  conferente uuid;
  independente boolean;
begin
  if eu is null then
    return false;
  end if;
  select c.conferencia_independente into independente from public.consultoria as c where c.id = r.consultoria_id;
  if independente and r.autor_id = eu then
    return false;
  end if;
  if r.ocorrencia_id is not null then
    select o.conferente_id into conferente from public.ocorrencia as o
    where o.consultoria_id = r.consultoria_id and o.id = r.ocorrencia_id;
  end if;
  if conferente is not null then
    return conferente = eu;
  end if;
  return private.is_gestao(r.consultoria_id);
end;
$$;

create function private.pode_editar_relatorio(r public.relatorio)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  eu uuid := private.membro_atual(r.consultoria_id);
begin
  if eu is null then
    return false;
  end if;
  if r.situacao in ('rascunho', 'devolvido') then
    return r.autor_id = eu or private.is_gestao(r.consultoria_id);
  end if;
  if r.situacao = 'em_revisao' then
    return private.pode_revisar_relatorio(r);
  end if;
  return false;
end;
$$;

revoke all on function private.pode_revisar_relatorio(public.relatorio) from public, anon, authenticated;
revoke all on function private.pode_editar_relatorio(public.relatorio) from public, anon, authenticated;

create function private.relatorio_para_escrever(p_id uuid, p_row_version integer)
returns public.relatorio
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.relatorio;
begin
  select * into r from public.relatorio as x where x.id = p_id for update;
  if not found or not private.is_membro(r.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_row_version is null or r.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  return r;
end;
$$;

revoke all on function private.relatorio_para_escrever(uuid, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPCs
-- ---------------------------------------------------------------------------
-- Criar a partir do modelo já preenchido pela tela (packages/domain). Repetir com o mesmo id devolve
-- o relatório já criado. Qualquer membro ativo cria.
create function public.criar_relatorio(
  p_id uuid,
  p_empreendimento_id uuid,
  p_ocorrencia_id uuid,
  p_modelo_id uuid,
  p_titulo text,
  p_conteudo jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  emp public.empreendimento%rowtype;
  eu uuid;
  existente public.relatorio%rowtype;
  titulo_limpo text := btrim(coalesce(p_titulo, ''));
begin
  if p_id is null then
    raise exception 'id_obrigatorio' using errcode = '22023';
  end if;
  select * into emp from public.empreendimento as e where e.id = p_empreendimento_id;
  if not found or not private.is_membro(emp.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  eu := private.membro_atual(emp.consultoria_id);
  if eu is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  select * into existente from public.relatorio as r where r.id = p_id;
  if found then
    if existente.consultoria_id = emp.consultoria_id then
      return existente.row_version;
    end if;
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  if p_ocorrencia_id is not null and not exists (
    select 1 from public.ocorrencia as o
    join public.instrumento as i on i.consultoria_id = o.consultoria_id and i.id = o.instrumento_id
    where o.id = p_ocorrencia_id and o.consultoria_id = emp.consultoria_id and i.empreendimento_id = emp.id
  ) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_modelo_id is not null and not exists (
    select 1 from public.modelo_documento as m
    where m.id = p_modelo_id and m.consultoria_id = emp.consultoria_id
  ) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if length(titulo_limpo) not between 1 and 200 then
    raise exception 'titulo_invalido' using errcode = '22023';
  end if;
  if p_conteudo is null or jsonb_typeof(p_conteudo) <> 'object' or p_conteudo ->> 'type' is distinct from 'doc'
     or length(p_conteudo::text) > 1000000 then
    raise exception 'conteudo_invalido' using errcode = '22023';
  end if;

  insert into public.relatorio (id, consultoria_id, empreendimento_id, ocorrencia_id, modelo_id, titulo,
                                conteudo, autor_id, atualizado_por)
  values (p_id, emp.consultoria_id, emp.id, p_ocorrencia_id, p_modelo_id, titulo_limpo, p_conteudo, eu, eu);
  insert into public.relatorio_versao (consultoria_id, relatorio_id, numero, titulo, conteudo, autor_id)
  values (emp.consultoria_id, p_id, 1, titulo_limpo, p_conteudo, eu);
  return 1;
end;
$$;

-- Salvar: versão nova só quando o título ou o conteúdo mudou. Devolve o row_version gravado.
create function public.salvar_relatorio(p_id uuid, p_titulo text, p_conteudo jsonb, p_row_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.relatorio;
  eu uuid;
  titulo_limpo text := btrim(coalesce(p_titulo, ''));
begin
  r := private.relatorio_para_escrever(p_id, p_row_version);
  if not private.pode_editar_relatorio(r) then
    if r.situacao = 'aprovado' then
      raise exception 'relatorio_aprovado' using errcode = 'P0001';
    end if;
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if length(titulo_limpo) not between 1 and 200 then
    raise exception 'titulo_invalido' using errcode = '22023';
  end if;
  if p_conteudo is null or jsonb_typeof(p_conteudo) <> 'object' or p_conteudo ->> 'type' is distinct from 'doc'
     or length(p_conteudo::text) > 1000000 then
    raise exception 'conteudo_invalido' using errcode = '22023';
  end if;
  if r.titulo = titulo_limpo and r.conteudo = p_conteudo then
    return r.row_version;
  end if;
  eu := private.membro_atual(r.consultoria_id);
  insert into public.relatorio_versao (consultoria_id, relatorio_id, numero, titulo, conteudo, autor_id)
  values (r.consultoria_id, r.id, r.versao + 1, titulo_limpo, p_conteudo, eu);
  update public.relatorio as x
  set titulo = titulo_limpo, conteudo = p_conteudo, versao = r.versao + 1, atualizado_por = eu,
      atualizado_em = now(), row_version = x.row_version + 1
  where x.id = r.id;
  return r.row_version + 1;
end;
$$;

-- Enviar para revisão: o autor (ou a Gestão) no rascunho ou devolvido.
create function public.enviar_relatorio(p_id uuid, p_row_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.relatorio;
begin
  r := private.relatorio_para_escrever(p_id, p_row_version);
  if r.situacao not in ('rascunho', 'devolvido') then
    raise exception 'relatorio_ja_enviado' using errcode = 'P0001';
  end if;
  if not private.pode_editar_relatorio(r) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  update public.relatorio as x
  set situacao = 'em_revisao', motivo_devolucao = null, enviado_em = now(), atualizado_em = now(),
      row_version = x.row_version + 1
  where x.id = r.id;
  return r.row_version + 1;
end;
$$;

create function public.devolver_relatorio(p_id uuid, p_motivo text, p_row_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.relatorio;
  motivo_limpo text := btrim(coalesce(p_motivo, ''));
begin
  r := private.relatorio_para_escrever(p_id, p_row_version);
  if r.situacao <> 'em_revisao' then
    raise exception 'relatorio_fora_da_revisao' using errcode = 'P0001';
  end if;
  if not private.pode_revisar_relatorio(r) then
    if r.autor_id = private.membro_atual(r.consultoria_id) then
      raise exception 'autor_nao_revisa' using errcode = 'P0001';
    end if;
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if motivo_limpo = '' then
    raise exception 'motivo_obrigatorio' using errcode = '22023';
  end if;
  update public.relatorio as x
  set situacao = 'devolvido', motivo_devolucao = left(motivo_limpo, 2000),
      revisor_id = private.membro_atual(r.consultoria_id), decidido_em = now(), atualizado_em = now(),
      row_version = x.row_version + 1
  where x.id = r.id;
  return r.row_version + 1;
end;
$$;

create function public.aprovar_relatorio(p_id uuid, p_row_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.relatorio;
begin
  r := private.relatorio_para_escrever(p_id, p_row_version);
  if r.situacao <> 'em_revisao' then
    raise exception 'relatorio_fora_da_revisao' using errcode = 'P0001';
  end if;
  if not private.pode_revisar_relatorio(r) then
    if r.autor_id = private.membro_atual(r.consultoria_id) then
      raise exception 'autor_nao_revisa' using errcode = 'P0001';
    end if;
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  update public.relatorio as x
  set situacao = 'aprovado', revisor_id = private.membro_atual(r.consultoria_id), decidido_em = now(),
      atualizado_em = now(), row_version = x.row_version + 1
  where x.id = r.id;
  return r.row_version + 1;
end;
$$;

-- O que a tela precisa saber para mostrar as ações (é só apresentação: as RPCs conferem de novo).
create function public.permissoes_do_relatorio(p_id uuid)
returns table (pode_editar boolean, pode_revisar boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.relatorio;
begin
  select * into r from public.relatorio as x where x.id = p_id;
  if not found or not private.is_membro(r.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return query select private.pode_editar_relatorio(r),
    r.situacao = 'em_revisao' and private.pode_revisar_relatorio(r);
end;
$$;

do $$
declare
  assinatura text;
begin
  foreach assinatura in array array[
    'public.criar_relatorio(uuid, uuid, uuid, uuid, text, jsonb)',
    'public.salvar_relatorio(uuid, text, jsonb, integer)',
    'public.enviar_relatorio(uuid, integer)',
    'public.devolver_relatorio(uuid, text, integer)',
    'public.aprovar_relatorio(uuid, integer)',
    'public.permissoes_do_relatorio(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', assinatura);
    execute format('grant execute on function %s to authenticated', assinatura);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Conferência por IA de uma versão do relatório
-- ---------------------------------------------------------------------------
alter table public.conferencia_ia alter column evidencia_id drop not null;
alter table public.conferencia_ia add column relatorio_id uuid;
alter table public.conferencia_ia add column relatorio_versao integer;
alter table public.conferencia_ia add column ignorados integer[] not null default '{}';
alter table public.conferencia_ia
  add constraint conferencia_ia_relatorio_fk foreign key (consultoria_id, relatorio_id)
    references public.relatorio (consultoria_id, id) on delete restrict,
  add constraint conferencia_ia_alvo check (
    (evidencia_id is not null and relatorio_id is null and relatorio_versao is null)
    or (evidencia_id is null and relatorio_id is not null and relatorio_versao is not null));

comment on column public.conferencia_ia.ignorados is
  'Índices de apontamentos que alguém marcou como "Ignorar" (relatório escrito no Grama).';

create unique index conferencia_ia_relatorio_viva_idx
  on public.conferencia_ia (relatorio_id, relatorio_versao) where situacao <> 'falhou';
create index conferencia_ia_relatorio_idx
  on public.conferencia_ia (consultoria_id, relatorio_id, relatorio_versao desc, iniciada_em desc);

-- O apontamento pode trazer "substituicao": o texto exato que troca o trecho.
create or replace function private.apontamentos_validos(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) <= 60 and not exists (
    select 1 from jsonb_array_elements(p) as a (item)
    where jsonb_typeof(a.item) <> 'object'
       or coalesce(a.item ->> 'origem', '') not in ('regra', 'ia')
       or coalesce(a.item ->> 'categoria', '') not in
          ('empreendimento', 'licenca', 'condicionante', 'datas', 'consistencia', 'escrita')
       or coalesce(a.item ->> 'gravidade', '') not in ('corrigir', 'verificar')
       or length(coalesce(a.item ->> 'problema', '')) not between 1 and 1000
       or length(coalesce(a.item ->> 'trecho', '')) > 1000
       or length(coalesce(a.item ->> 'sugestao', '')) > 1000
       or length(coalesce(a.item ->> 'substituicao', '')) > 1000)
$$;

revoke all on function private.apontamentos_validos(jsonb) from public, anon, authenticated;

-- Iniciar (JWT de quem pediu): quem pode editar ou revisar o relatório. A versão pedida precisa
-- existir; a tela salva antes de pedir. Repetir, ou pedir de novo com uma viva, só devolve a situação.
create function public.iniciar_conferencia_relatorio(p_id uuid, p_relatorio_id uuid, p_versao integer)
returns table (
  conferencia_id uuid,
  nova boolean,
  situacao text,
  motivo text,
  ia_liberada boolean,
  conteudo jsonb,
  contexto jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.relatorio%rowtype;
  v public.relatorio_versao%rowtype;
  eu uuid;
  existente public.conferencia_ia%rowtype;
  liberada boolean;
  v_contexto jsonb;
begin
  if p_id is null then
    raise exception 'id_obrigatorio' using errcode = '22023';
  end if;
  select * into r from public.relatorio as x where x.id = p_relatorio_id;
  if not found or not private.is_membro(r.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  eu := private.membro_atual(r.consultoria_id);
  if eu is null or not coalesce(
    r.autor_id = eu or private.pode_editar_relatorio(r) or private.pode_revisar_relatorio(r), false
  ) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select * into v from public.relatorio_versao as x where x.relatorio_id = r.id and x.numero = p_versao;
  if not found then
    raise exception 'versao_inexistente' using errcode = 'P0001';
  end if;

  select * into existente from public.conferencia_ia as c where c.id = p_id;
  if found and existente.relatorio_id is distinct from r.id then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if not found then
    select * into existente from public.conferencia_ia as c
    where c.consultoria_id = r.consultoria_id and c.relatorio_id = r.id and c.relatorio_versao = p_versao
      and c.situacao <> 'falhou'
    for update;
    if found and existente.situacao = 'em_andamento'
       and existente.iniciada_em < now() - interval '3 minutes' then
      update public.conferencia_ia as c
      set situacao = 'falhou', motivo = 'tempo_esgotado', concluida_em = now()
      where c.id = existente.id;
      existente := null;
    end if;
  end if;
  if existente.id is not null then
    return query select existente.id, false, existente.situacao, existente.motivo, existente.ia_liberada,
      null::jsonb, null::jsonb;
    return;
  end if;

  if private.consultoria_somente_leitura(r.consultoria_id) then
    raise exception 'consultoria_somente_leitura' using errcode = '42501';
  end if;
  liberada := private.recurso_liberado(r.consultoria_id, 'ia');

  select jsonb_build_object(
    'hoje', private.hoje_da_consultoria(r.consultoria_id),
    'data_execucao', null,
    'empreendimento', jsonb_build_object(
      'nome', e.nome, 'cliente', cl.nome, 'cnpj', e.cnpj,
      'unidade', (select u.nome from public.unidade as u
                  where u.consultoria_id = i.consultoria_id and u.id = i.unidade_id),
      'endereco', (select u.endereco from public.unidade as u
                   where u.consultoria_id = i.consultoria_id and u.id = i.unidade_id)),
    'licenca', case when i.id is null then null else jsonb_build_object(
      'tipo', t.sigla, 'numero', i.numero, 'orgao', i.orgao, 'emissao', i.emitido_em,
      'assinatura', i.assinado_em, 'validade', i.validade) end,
    'condicionante', case when o.id is null then null else jsonb_build_object(
      'codigo', c.codigo, 'titulo', cv.titulo, 'texto', cv.texto_literal,
      'prazo', o.prazo_oficial_atual, 'ciclo', o.ciclo) end)
  into v_contexto
  from public.empreendimento as e
  left join public.cliente as cl on cl.consultoria_id = e.consultoria_id and cl.id = e.cliente_id
  left join public.ocorrencia as o on o.consultoria_id = r.consultoria_id and o.id = r.ocorrencia_id
  left join public.instrumento as i on i.consultoria_id = o.consultoria_id and i.id = o.instrumento_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  left join public.condicionante_versao as cv
    on cv.consultoria_id = o.consultoria_id and cv.id = o.condicionante_versao_id
  left join public.condicionante as c on c.consultoria_id = cv.consultoria_id and c.id = cv.condicionante_id
  where e.consultoria_id = r.consultoria_id and e.id = r.empreendimento_id;

  insert into public.conferencia_ia (id, consultoria_id, relatorio_id, relatorio_versao, ia_liberada,
                                     solicitada_por)
  values (p_id, r.consultoria_id, r.id, p_versao, liberada, eu);

  return query select p_id, true, 'em_andamento'::text, null::text, liberada, v.conteudo, v_contexto;
end;
$$;

revoke all on function public.iniciar_conferencia_relatorio(uuid, uuid, integer) from public, anon;
grant execute on function public.iniciar_conferencia_relatorio(uuid, uuid, integer) to authenticated;

-- "Ignorar" um apontamento do relatório: quem pode editar ou revisar. Repetir não muda nada.
create function public.ignorar_apontamento(p_conferencia_id uuid, p_indice integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.conferencia_ia%rowtype;
  r public.relatorio%rowtype;
begin
  select * into c from public.conferencia_ia as x where x.id = p_conferencia_id for update;
  if not found or c.relatorio_id is null or not private.is_membro(c.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select * into r from public.relatorio as x where x.consultoria_id = c.consultoria_id and x.id = c.relatorio_id;
  if not coalesce(private.pode_editar_relatorio(r) or private.pode_revisar_relatorio(r), false) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_indice is null or p_indice < 0 or p_indice >= jsonb_array_length(c.apontamentos) then
    raise exception 'apontamento_inexistente' using errcode = '22023';
  end if;
  if p_indice = any (c.ignorados) then
    return;
  end if;
  update public.conferencia_ia as x set ignorados = x.ignorados || p_indice where x.id = c.id;
end;
$$;

revoke all on function public.ignorar_apontamento(uuid, integer) from public, anon;
grant execute on function public.ignorar_apontamento(uuid, integer) to authenticated;
