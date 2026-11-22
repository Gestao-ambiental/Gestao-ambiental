-- Evidência com prova de origem (piloto, 2a e 2b): quem enviou, quem conferiu, qual versão valeu e
-- que o arquivo guardado é o mesmo que foi aprovado.
--
-- 1. conferencia_de_arquivo: o servidor (Edge Function conferir-arquivo, service role) baixa o
--    objeto, calcula o SHA-256 e grava se confere com o hash declarado no envio. Append-only, uma
--    linha por versão. O envio não espera por isso (quem está sem sinal só precisa subir o arquivo);
--    a conferência do hash roda depois do envio e, no máximo, na hora de aprovar.
-- 2. conferir_evidencia: aprovar exige o hash conferido e igual. Devolver continua livre.
-- 3. evidencia e conferencia imutáveis: a evidência só muda de situação uma vez (em conferência ->
--    aprovada/devolvida); nada apaga. A conferência não muda nem some.
-- 4. ocorrencia.evidencia_aprovada_id: a conclusão aponta para a evidência que valeu.
-- 5. obter_evidencia_aprovada e listar_auditoria_da_ocorrencia (só Gestão) para a tela.

-- ---------------------------------------------------------------------------
-- 1. Conferência do arquivo no servidor
-- ---------------------------------------------------------------------------
create table public.conferencia_de_arquivo (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  documento_versao_id uuid not null,
  sha256_calculado text not null,
  confere boolean not null,
  conferida_em timestamptz not null default now(),
  constraint conferencia_de_arquivo_sha256_formato check (sha256_calculado ~ '^[0-9a-f]{64}$'),
  constraint conferencia_de_arquivo_consultoria_id_id_key unique (consultoria_id, id),
  constraint conferencia_de_arquivo_versao_key unique (documento_versao_id),
  constraint conferencia_de_arquivo_versao_fk foreign key (consultoria_id, documento_versao_id)
    references public.documento_versao (consultoria_id, id) on delete restrict
);

comment on table public.conferencia_de_arquivo is
  'SHA-256 recalculado pelo servidor sobre o objeto do Storage. confere = igual ao declarado no envio.';

alter table public.conferencia_de_arquivo enable row level security;
alter table public.conferencia_de_arquivo force row level security;

revoke all on table public.conferencia_de_arquivo from anon, authenticated;
grant select on table public.conferencia_de_arquivo to authenticated;

create policy conferencia_de_arquivo_select_membro_ativo on public.conferencia_de_arquivo
  for select to authenticated using ((select private.is_membro(consultoria_id)));

create trigger conferencia_de_arquivo_append_only
  before update or delete on public.conferencia_de_arquivo
  for each row execute function private.bloquear_alteracao_auditoria();

create trigger conferencia_de_arquivo_auditar after insert on public.conferencia_de_arquivo
  for each row execute function private.auditar();
create trigger _suporte_somente_leitura before insert or update or delete on public.conferencia_de_arquivo
  for each row execute function private.bloquear_escrita_do_suporte();
create trigger _comercial_somente_leitura before insert or update or delete on public.conferencia_de_arquivo
  for each row execute function private.bloquear_escrita_comercial();

-- Só a Edge Function (service role) grava. Repetir devolve o resultado já gravado.
create function public.registrar_conferencia_de_arquivo(p_versao_id uuid, p_sha256 text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  versao public.documento_versao;
  calculado text := lower(btrim(coalesce(p_sha256, '')));
  resultado boolean;
begin
  if calculado !~ '^[0-9a-f]{64}$' then
    raise exception 'sha256_invalido' using errcode = '22023';
  end if;
  select * into versao from public.documento_versao as v where v.id = p_versao_id;
  if not found then
    raise exception 'versao_nao_encontrada' using errcode = 'P0001';
  end if;

  select c.confere into resultado from public.conferencia_de_arquivo as c where c.documento_versao_id = versao.id;
  if found then
    return resultado;
  end if;

  insert into public.conferencia_de_arquivo (consultoria_id, documento_versao_id, sha256_calculado, confere)
  values (versao.consultoria_id, versao.id, calculado, calculado = versao.sha256)
  on conflict (documento_versao_id) do nothing;

  select c.confere into resultado from public.conferencia_de_arquivo as c where c.documento_versao_id = versao.id;
  return resultado;
end;
$$;

revoke all on function public.registrar_conferencia_de_arquivo(uuid, text) from public, anon, authenticated;
grant execute on function public.registrar_conferencia_de_arquivo(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Aprovar exige o arquivo conferido no servidor (o resto é o da 20261018181131)
-- ---------------------------------------------------------------------------
create or replace function public.conferir_evidencia(
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
  arquivo_confere boolean;
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
  if p_decisao = 'aprovada' then
    select c.confere into arquivo_confere
    from public.conferencia_de_arquivo as c where c.documento_versao_id = ev.documento_versao_id;
    if not found then
      raise exception 'arquivo_nao_conferido' using errcode = 'P0001';
    end if;
    if not arquivo_confere then
      raise exception 'arquivo_divergente' using errcode = 'P0001';
    end if;
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
-- 3. Imutabilidade da evidência e da conferência
-- ---------------------------------------------------------------------------
create function private.proteger_evidencia()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'evidencia é imutável: DELETE não é permitido' using errcode = 'insufficient_privilege';
  end if;
  if (new.id, new.consultoria_id, new.ocorrencia_id, new.numero, new.documento_versao_id, new.data_execucao,
      new.enviada_por, new.enviada_em)
     is distinct from
     (old.id, old.consultoria_id, old.ocorrencia_id, old.numero, old.documento_versao_id, old.data_execucao,
      old.enviada_por, old.enviada_em) then
    raise exception 'evidencia é imutável: o conteúdo não muda' using errcode = 'insufficient_privilege';
  end if;
  if new.situacao is distinct from old.situacao and old.situacao <> 'em_conferencia' then
    raise exception 'evidencia já conferida não muda de situação' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke all on function private.proteger_evidencia() from public, anon, authenticated;

create trigger evidencia_imutavel
  before update or delete on public.evidencia
  for each row execute function private.proteger_evidencia();

create trigger conferencia_imutavel
  before update or delete on public.conferencia
  for each row execute function private.bloquear_alteracao_auditoria();

-- ---------------------------------------------------------------------------
-- 4. A conclusão aponta para a evidência aprovada
-- ---------------------------------------------------------------------------
alter table public.ocorrencia
  add column evidencia_aprovada_id uuid,
  add constraint ocorrencia_evidencia_aprovada_fk foreign key (consultoria_id, evidencia_aprovada_id)
    references public.evidencia (consultoria_id, id) on delete restrict;

comment on column public.ocorrencia.evidencia_aprovada_id is
  'Evidência aprovada que fundamentou a conclusão. Nula se aberta, reaberta ou concluída sem evidência.';

-- As já concluídas com evidência apontam para a última versão (a que estava aprovada).
update public.ocorrencia as o
set evidencia_aprovada_id = (
  select ev.id from public.evidencia as ev
  where ev.ocorrencia_id = o.id and ev.situacao = 'aprovada'
  order by ev.numero desc limit 1
)
where o.situacao = 'concluida' and not o.concluida_sem_evidencia;

alter table public.ocorrencia
  add constraint ocorrencia_evidencia_aprovada_coerente check (
    evidencia_aprovada_id is null or (situacao = 'concluida' and not concluida_sem_evidencia)
  );

create function private.conferir_evidencia_aprovada_da_ocorrencia()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.evidencia_aprovada_id is not null and not exists (
    select 1 from public.evidencia as ev
    where ev.id = new.evidencia_aprovada_id and ev.ocorrencia_id = new.id and ev.situacao = 'aprovada'
  ) then
    raise exception 'evidencia_de_outra_ocorrencia' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.conferir_evidencia_aprovada_da_ocorrencia() from public, anon, authenticated;

create trigger ocorrencia_evidencia_aprovada_da_propria
  before insert or update of evidencia_aprovada_id on public.ocorrencia
  for each row execute function private.conferir_evidencia_aprovada_da_ocorrencia();

create or replace function public.concluir_ocorrencia(p_ocorrencia_id uuid, p_row_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.ocorrencia;
  aprovada uuid;
begin
  alvo := private.ocorrencia_para_escrever(p_ocorrencia_id);
  perform private.conferir_gestao_e_versao(alvo, p_row_version);
  if alvo.situacao = 'concluida' then
    raise exception 'ocorrencia_concluida' using errcode = 'P0001';
  end if;
  select ev.id into aprovada from public.evidencia as ev
  where ev.ocorrencia_id = alvo.id and ev.situacao = 'aprovada'
    and ev.numero = (select max(x.numero) from public.evidencia as x where x.ocorrencia_id = alvo.id);
  if aprovada is null then
    raise exception 'evidencia_nao_aprovada' using errcode = 'P0001';
  end if;

  update public.ocorrencia as o
  set situacao = 'concluida', concluida_em = now(), concluida_por = private.membro_atual(alvo.consultoria_id),
      concluida_sem_evidencia = false, evidencia_aprovada_id = aprovada, row_version = o.row_version + 1
  where o.id = alvo.id;
  perform private.registrar_historico(alvo.consultoria_id, alvo.id, 'concluida');
  return alvo.row_version + 1;
end;
$$;

create or replace function public.reabrir_ocorrencia(p_ocorrencia_id uuid, p_motivo text, p_row_version integer)
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
      evidencia_aprovada_id = null, row_version = o.row_version + 1
  where o.id = alvo.id;
  perform private.registrar_historico(alvo.consultoria_id, alvo.id, 'reaberta', null, p_motivo);
  return alvo.row_version + 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5a. Destaque da evidência que vale: a ligada à conclusão; sem conclusão, a última se aprovada.
-- Lê com a RLS de quem chama (membro ativo).
-- ---------------------------------------------------------------------------
create function public.obter_evidencia_aprovada(p_ocorrencia_id uuid)
returns table (
  evidencia_id uuid,
  numero integer,
  versao_id uuid,
  caminho text,
  nome_original text,
  sha256 text,
  arquivo_confere boolean,
  arquivo_conferido_em timestamptz,
  data_execucao date,
  enviada_por_nome text,
  enviada_em timestamptz,
  conferente_nome text,
  conferida_em timestamptz,
  concluida_por_nome text,
  concluida_em timestamptz
)
language sql
stable
set search_path = ''
as $$
  with alvo as (
    select o.* from public.ocorrencia as o where o.id = p_ocorrencia_id
  ),
  escolhida as (
    select ev.* from public.evidencia as ev, alvo
    where ev.id = alvo.evidencia_aprovada_id
    union all
    select ev.* from public.evidencia as ev, alvo
    where alvo.evidencia_aprovada_id is null and ev.ocorrencia_id = alvo.id and ev.situacao = 'aprovada'
      and ev.numero = (select max(x.numero) from public.evidencia as x where x.ocorrencia_id = alvo.id)
  )
  select ev.id, ev.numero, v.id, v.caminho, v.nome_original, v.sha256, ca.confere, ca.conferida_em,
         ev.data_execucao, autor.nome, ev.enviada_em, conferente.nome, c.decidida_em,
         case when alvo.evidencia_aprovada_id = ev.id then quem.nome end,
         case when alvo.evidencia_aprovada_id = ev.id then alvo.concluida_em end
  from escolhida as ev
  cross join alvo
  join public.documento_versao as v on v.consultoria_id = ev.consultoria_id and v.id = ev.documento_versao_id
  join public.membro as autor on autor.consultoria_id = ev.consultoria_id and autor.id = ev.enviada_por
  left join public.conferencia as c on c.consultoria_id = ev.consultoria_id and c.evidencia_id = ev.id
  left join public.membro as conferente on conferente.consultoria_id = c.consultoria_id and conferente.id = c.conferente_id
  left join public.conferencia_de_arquivo as ca
    on ca.consultoria_id = v.consultoria_id and ca.documento_versao_id = v.id
  left join public.membro as quem on quem.consultoria_id = alvo.consultoria_id and quem.id = alvo.concluida_por
  limit 1
$$;

revoke all on function public.obter_evidencia_aprovada(uuid) from public, anon;
grant execute on function public.obter_evidencia_aprovada(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5b. Auditoria da ocorrência (só Gestão): a ocorrência, as etapas, as evidências, as conferências
-- e as conferências de arquivo, do mais novo para o mais antigo, em páginas.
-- ---------------------------------------------------------------------------
create function public.listar_auditoria_da_ocorrencia(
  p_ocorrencia_id uuid,
  p_limite integer default 50,
  p_deslocamento integer default 0
)
returns table (
  id bigint,
  instante timestamptz,
  entidade text,
  acao public.acao_auditoria,
  ator_nome text,
  antes jsonb,
  depois jsonb,
  motivo text,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cid uuid;
begin
  select o.consultoria_id into cid from public.ocorrencia as o where o.id = p_ocorrencia_id;
  if cid is null or not private.is_gestao(cid) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  return query
  with ids as (
    select 'ocorrencia'::text as entidade, p_ocorrencia_id as entidade_id
    union all
    select 'etapa', e.id from public.etapa as e where e.consultoria_id = cid and e.ocorrencia_id = p_ocorrencia_id
    union all
    select 'evidencia', ev.id from public.evidencia as ev
    where ev.consultoria_id = cid and ev.ocorrencia_id = p_ocorrencia_id
    union all
    select 'conferencia', c.id from public.conferencia as c
    join public.evidencia as ev on ev.consultoria_id = c.consultoria_id and ev.id = c.evidencia_id
    where c.consultoria_id = cid and ev.ocorrencia_id = p_ocorrencia_id
    union all
    select 'conferencia_de_arquivo', ca.id from public.conferencia_de_arquivo as ca
    join public.evidencia as ev
      on ev.consultoria_id = ca.consultoria_id and ev.documento_versao_id = ca.documento_versao_id
    where ca.consultoria_id = cid and ev.ocorrencia_id = p_ocorrencia_id
  )
  select a.id, a.instante, a.entidade, a.acao, m.nome, a.antes, a.depois, a.motivo, count(*) over ()
  from public.auditoria as a
  join ids on ids.entidade = a.entidade and ids.entidade_id = a.entidade_id
  left join public.membro as m on m.consultoria_id = a.consultoria_id and m.id = a.ator_membro_id
  where a.consultoria_id = cid
  order by a.instante desc, a.id desc
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0);
end;
$$;

revoke all on function public.listar_auditoria_da_ocorrencia(uuid, integer, integer) from public, anon;
grant execute on function public.listar_auditoria_da_ocorrencia(uuid, integer, integer) to authenticated;
