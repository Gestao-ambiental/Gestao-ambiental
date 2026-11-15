-- Central administrativa, primeira versão (ADM-01; ADR-0022; decisões do Eduardo de 14/11/2026).
-- Operadores da plataforma (Eduardo e Cadu) veem a lista de consultorias com contagens, as pessoas
-- de cada uma (sem alterar nada delas) e mudam a situação da consultoria com motivo, versão e
-- idempotência, numa trilha própria append-only.
--
-- Acesso: só quem está em private.operador_plataforma. Esta migration NÃO cadastra ninguém (e-mails
-- não vão para o repositório); o cadastro é feito à parte, por SQL no banco.
-- Toda leitura e escrita da central é por RPC security definer que confere private.is_operador() e
-- devolve só os campos permitidos: contagens, nomes, e-mails, papel e situação do vínculo. Nada de
-- documentos, licenças, orçamentos ou arquivos. As tabelas das consultorias continuam com a RLS de
-- sempre: um operador que não é membro segue lendo zero linhas delas por consulta direta.
--
-- EFEITO DA SITUAÇÃO NESTA VERSÃO: só registra e mostra (selo na central). NÃO bloqueia o acesso de
-- ninguém: is_membro/is_gestao e as políticas não olham consultoria.situacao. Bloqueio por situação
-- fica para depois (ADR-0022).

-- ---------------------------------------------------------------------------
-- 1. Situação "teste". O tipo já existe (ativa, suspensa, arquivada) e já é a coluna
-- consultoria.situacao, com padrão 'ativa'. O valor novo não é usado em SQL desta migration
-- (só dentro de plpgsql), porque valor recém-acrescentado a enum não pode ser usado na mesma
-- transação.
-- ---------------------------------------------------------------------------
alter type public.situacao_consultoria add value if not exists 'teste' before 'ativa';

-- ---------------------------------------------------------------------------
-- 2. Operadores da plataforma. Schema private: fora do PostgREST. Sem grant para anon nem
-- authenticated; RLS forçada sem política (só o dono, que ignora RLS, lê). Preenchida à mão.
-- ---------------------------------------------------------------------------
create table private.operador_plataforma (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);

comment on table private.operador_plataforma is
  'Quem opera a plataforma (central administrativa, ADM-01). Preenchida por SQL no banco, nunca pela migration nem pelo app.';

alter table private.operador_plataforma enable row level security;
alter table private.operador_plataforma force row level security;
revoke all on table private.operador_plataforma from public, anon, authenticated;

create function private.is_operador()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.operador_plataforma as o
    where o.usuario_id = (select auth.uid())
  )
$$;

revoke all on function private.is_operador() from public, anon;
grant execute on function private.is_operador() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Situação na consultoria: motivo, quando, quem (usuário operador, não membro) e row_version.
-- row_version é o controle otimista da situação: só a central escreve nestas colunas e cada
-- mudança confere e incrementa.
-- Os membros da consultoria leem a própria linha (RLS de sempre), inclusive estas colunas.
-- ---------------------------------------------------------------------------
alter table public.consultoria
  add column situacao_motivo text,
  add column situacao_alterada_em timestamptz,
  add column situacao_alterada_por uuid references auth.users (id) on delete restrict,
  add column row_version integer not null default 1,
  add constraint consultoria_situacao_motivo_tamanho
    check (situacao_motivo is null or length(situacao_motivo) between 1 and 500),
  add constraint consultoria_situacao_alteracao_coerente
    check ((situacao_alterada_em is null) = (situacao_alterada_por is null));

comment on column public.consultoria.situacao is
  'teste | ativa | suspensa | arquivada. Nesta versão só registra e mostra; não bloqueia acesso (ADR-0022).';
comment on column public.consultoria.situacao_alterada_por is 'Usuário operador da plataforma (auth.users), não membro.';
comment on column public.consultoria.row_version is 'Controle otimista da situação: cada mudança confere e incrementa.';

-- ---------------------------------------------------------------------------
-- 4. Histórico de situações: trilha própria, append-only.
-- Por que não a tabela auditoria: lá o ator é membro (FK composta para membro) e a Gestão da
-- consultoria lê tudo; o operador não é membro, e o ADM-01 pede auditoria própria da central.
-- Sem grant para o cliente: a leitura é só por central_historico_situacao. A política fica como
-- segunda barreira (operador), e as triggers recusam update, delete e truncate até do dono.
-- chave: idempotência da mudança (repetir com a mesma chave não duplica).
-- ---------------------------------------------------------------------------
create table public.consultoria_situacao_historico (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  chave uuid not null,
  situacao_anterior public.situacao_consultoria not null,
  situacao_nova public.situacao_consultoria not null,
  motivo text not null,
  alterada_por uuid not null references auth.users (id) on delete restrict,
  alterada_em timestamptz not null default now(),
  row_version_resultante integer not null,
  constraint consultoria_situacao_historico_chave_key unique (chave),
  constraint consultoria_situacao_historico_motivo check (length(btrim(motivo)) between 1 and 500),
  constraint consultoria_situacao_historico_mudou check (situacao_anterior <> situacao_nova)
);

comment on table public.consultoria_situacao_historico is
  'Trilha append-only das mudanças de situação feitas pela central administrativa (ADM-01).';

create index consultoria_situacao_historico_consultoria_idx
  on public.consultoria_situacao_historico (consultoria_id, alterada_em desc);

alter table public.consultoria_situacao_historico enable row level security;
alter table public.consultoria_situacao_historico force row level security;
revoke all on table public.consultoria_situacao_historico from public, anon, authenticated;

create policy consultoria_situacao_historico_select_operador
  on public.consultoria_situacao_historico
  for select
  to authenticated
  using ((select private.is_operador()));

create trigger consultoria_situacao_historico_bloquear_update_delete
  before update or delete on public.consultoria_situacao_historico
  for each row execute function private.bloquear_alteracao_auditoria();

create trigger consultoria_situacao_historico_bloquear_truncate
  before truncate on public.consultoria_situacao_historico
  for each statement execute function private.bloquear_alteracao_auditoria();

-- ---------------------------------------------------------------------------
-- 5. Helpers das RPCs (só dentro das RPCs security definer)
-- ---------------------------------------------------------------------------
create function private.exigir_operador()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_operador() then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
end;
$$;

-- Gestão ativa da consultoria como [{nome, email}], em ordem de nome.
create function private.gestores_da_consultoria(cid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('nome', m.nome, 'email', m.email) order by m.nome, m.id),
    '[]'::jsonb
  )
  from public.membro as m
  where m.consultoria_id = cid and m.situacao = 'ativo' and m.papel = 'gestao'
$$;

revoke all on function private.exigir_operador() from public, anon, authenticated;
revoke all on function private.gestores_da_consultoria(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC: sou operador? Só para o front decidir se mostra o link da central (apresentação).
-- ---------------------------------------------------------------------------
create function public.sou_operador()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_operador()
$$;

-- ---------------------------------------------------------------------------
-- 7. RPC: lista de consultorias, paginada, com busca por nome (sem acento, sem caixa) e filtro por
-- situação. Contagens: pessoas com vínculo ativo, orçamentos fora da lixeira, empreendimentos e
-- licenças (instrumentos, rascunho ou ativos).
-- Último acesso: omitido de propósito. Não há dado confiável (auth.users.last_sign_in_at só muda
-- no login com senha; a sessão renova por refresh token sem tocá-lo). Ver ADR-0022.
-- ---------------------------------------------------------------------------
create function public.central_listar_consultorias(
  p_busca text default null,
  p_situacao public.situacao_consultoria default null,
  p_limite integer default 50,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  nome text,
  criada_em timestamptz,
  fuso text,
  situacao public.situacao_consultoria,
  situacao_alterada_em timestamptz,
  gestao jsonb,
  pessoas_ativas bigint,
  orcamentos bigint,
  empreendimentos bigint,
  licencas bigint,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  busca text := btrim(coalesce(p_busca, ''));
begin
  perform private.exigir_operador();

  return query
  with pagina as (
    select c.id, c.nome, c.criada_em, c.fuso, c.situacao, c.situacao_alterada_em,
           count(*) over () as total
    from public.consultoria as c
    where (p_situacao is null or c.situacao = p_situacao)
      and (busca = '' or private.normalizar_nome(c.nome) like private.padrao_de_busca(busca))
    order by private.normalizar_nome(c.nome), c.id
    limit least(greatest(coalesce(p_limite, 50), 1), 100)
    offset greatest(coalesce(p_deslocamento, 0), 0)
  )
  select
    p.id,
    p.nome,
    p.criada_em,
    p.fuso,
    p.situacao,
    p.situacao_alterada_em,
    private.gestores_da_consultoria(p.id),
    (select count(*) from public.membro as m where m.consultoria_id = p.id and m.situacao = 'ativo'),
    (select count(*) from public.orcamento as o where o.consultoria_id = p.id and o.excluido_em is null),
    (select count(*) from public.empreendimento as e where e.consultoria_id = p.id),
    (select count(*) from public.instrumento as i where i.consultoria_id = p.id),
    p.total
  from pagina as p
  order by private.normalizar_nome(p.nome), p.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. RPC: detalhe de uma consultoria (mesmos números, situação com motivo e versão).
-- Consultoria inexistente: zero linhas.
-- ---------------------------------------------------------------------------
create function public.central_detalhar_consultoria(p_consultoria_id uuid)
returns table (
  id uuid,
  nome text,
  criada_em timestamptz,
  fuso text,
  situacao public.situacao_consultoria,
  situacao_motivo text,
  situacao_alterada_em timestamptz,
  situacao_alterada_por_nome text,
  row_version integer,
  gestao jsonb,
  pessoas_ativas bigint,
  orcamentos bigint,
  empreendimentos bigint,
  licencas bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_operador();

  return query
  select
    c.id,
    c.nome,
    c.criada_em,
    c.fuso,
    c.situacao,
    c.situacao_motivo,
    c.situacao_alterada_em,
    case when u.id is null then null else private.nome_do_usuario(u.raw_user_meta_data, u.email) end,
    c.row_version,
    private.gestores_da_consultoria(c.id),
    (select count(*) from public.membro as m where m.consultoria_id = c.id and m.situacao = 'ativo'),
    (select count(*) from public.orcamento as o where o.consultoria_id = c.id and o.excluido_em is null),
    (select count(*) from public.empreendimento as e where e.consultoria_id = c.id),
    (select count(*) from public.instrumento as i where i.consultoria_id = c.id)
  from public.consultoria as c
  left join auth.users as u on u.id = c.situacao_alterada_por
  where c.id = p_consultoria_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. RPC: pessoas da consultoria (só leitura): nome, e-mail, papel e situação do vínculo.
-- Ativas primeiro, depois por nome. Paginada.
-- ---------------------------------------------------------------------------
create function public.central_listar_pessoas(
  p_consultoria_id uuid,
  p_limite integer default 50,
  p_deslocamento integer default 0
)
returns table (
  membro_id uuid,
  nome text,
  email text,
  papel public.papel_membro,
  situacao public.situacao_membro,
  criado_em timestamptz,
  desligado_em timestamptz,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_operador();

  return query
  select m.id, m.nome, m.email, m.papel, m.situacao, m.criado_em, m.desligado_em, count(*) over ()
  from public.membro as m
  where m.consultoria_id = p_consultoria_id
  order by (m.situacao = 'ativo') desc, m.nome, m.id
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. RPC: histórico de situações da consultoria, mais recente primeiro. Paginado.
-- ---------------------------------------------------------------------------
create function public.central_historico_situacao(
  p_consultoria_id uuid,
  p_limite integer default 50,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  situacao_anterior public.situacao_consultoria,
  situacao_nova public.situacao_consultoria,
  motivo text,
  alterada_em timestamptz,
  alterada_por_nome text,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_operador();

  return query
  select h.id, h.situacao_anterior, h.situacao_nova, h.motivo, h.alterada_em,
         private.nome_do_usuario(u.raw_user_meta_data, u.email), count(*) over ()
  from public.consultoria_situacao_historico as h
  join auth.users as u on u.id = h.alterada_por
  where h.consultoria_id = p_consultoria_id
  order by h.alterada_em desc, h.row_version_resultante desc
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. RPC: mudar a situação. Uma transação: trava a consultoria, confere a chave (repetir a mesma
-- operação devolve a mesma versão, sem duplicar), o motivo e a versão; grava a situação e o
-- histórico. Devolve a row_version nova.
-- A chave é conferida depois da trava: duas chamadas iguais ao mesmo tempo esperam uma pela outra
-- e a segunda encontra a primeira já gravada.
-- ---------------------------------------------------------------------------
create function public.central_mudar_situacao(
  p_consultoria_id uuid,
  p_situacao public.situacao_consultoria,
  p_motivo text,
  p_row_version integer,
  p_chave uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  operador uuid := auth.uid();
  motivo_limpo text := btrim(coalesce(p_motivo, ''));
  alvo public.consultoria;
  feita public.consultoria_situacao_historico;
begin
  perform private.exigir_operador();

  if p_chave is null then
    raise exception 'chave_obrigatoria' using errcode = '22023';
  end if;

  select * into alvo from public.consultoria as c where c.id = p_consultoria_id for update;
  if not found then
    raise exception 'consultoria_inexistente' using errcode = 'P0001';
  end if;

  select * into feita from public.consultoria_situacao_historico as h where h.chave = p_chave;
  if found then
    if feita.consultoria_id = p_consultoria_id and feita.situacao_nova = p_situacao then
      return feita.row_version_resultante;
    end if;
    raise exception 'chave_reutilizada' using errcode = 'P0001';
  end if;

  if p_situacao is null then
    raise exception 'situacao_obrigatoria' using errcode = '22023';
  end if;
  if motivo_limpo = '' then
    raise exception 'motivo_obrigatorio' using errcode = '22023';
  end if;
  if length(motivo_limpo) > 500 then
    raise exception 'texto_longo_demais' using errcode = '22023';
  end if;
  if alvo.row_version is distinct from p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  if alvo.situacao = p_situacao then
    raise exception 'mesma_situacao' using errcode = 'P0001';
  end if;

  update public.consultoria as c
  set situacao = p_situacao,
      situacao_motivo = motivo_limpo,
      situacao_alterada_em = now(),
      situacao_alterada_por = operador,
      row_version = c.row_version + 1
  where c.id = alvo.id;

  insert into public.consultoria_situacao_historico
    (consultoria_id, chave, situacao_anterior, situacao_nova, motivo, alterada_por, row_version_resultante)
  values
    (alvo.id, p_chave, alvo.situacao, p_situacao, motivo_limpo, operador, alvo.row_version + 1);

  return alvo.row_version + 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Permissões das RPCs: só usuário logado (anon é barrado antes de rodar). Dentro, só operador.
-- ---------------------------------------------------------------------------
revoke all on function public.sou_operador() from public, anon;
revoke all on function public.central_listar_consultorias(text, public.situacao_consultoria, integer, integer)
  from public, anon;
revoke all on function public.central_detalhar_consultoria(uuid) from public, anon;
revoke all on function public.central_listar_pessoas(uuid, integer, integer) from public, anon;
revoke all on function public.central_historico_situacao(uuid, integer, integer) from public, anon;
revoke all on function public.central_mudar_situacao(uuid, public.situacao_consultoria, text, integer, uuid)
  from public, anon;

grant execute on function public.sou_operador() to authenticated;
grant execute on function public.central_listar_consultorias(text, public.situacao_consultoria, integer, integer)
  to authenticated;
grant execute on function public.central_detalhar_consultoria(uuid) to authenticated;
grant execute on function public.central_listar_pessoas(uuid, integer, integer) to authenticated;
grant execute on function public.central_historico_situacao(uuid, integer, integer) to authenticated;
grant execute on function public.central_mudar_situacao(uuid, public.situacao_consultoria, text, integer, uuid)
  to authenticated;
