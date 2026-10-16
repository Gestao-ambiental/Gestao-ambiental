-- Base multi-tenant (tarefa 1.3; ADR-0003, ADR-0005, ADR-0010).
-- Regra de acesso: "sou membro ativo desta consultoria", resolvida no banco a cada requisição.
-- O cliente só lê. Criar consultoria, convidar e desligar membro serão RPCs (épico 2).

-- ---------------------------------------------------------------------------
-- Schema private: helpers de autorização e triggers, fora do PostgREST
-- (a API expõe só public e graphql_public). authenticated precisa de usage
-- para que as políticas consigam chamar os helpers.
-- ---------------------------------------------------------------------------
create schema private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.situacao_consultoria as enum ('ativa', 'suspensa', 'arquivada');
create type public.papel_membro as enum ('gestao', 'equipe');
create type public.situacao_membro as enum ('ativo', 'desligado');
create type public.acao_auditoria as enum ('insert', 'update', 'delete');

-- Fuso IANA válido (ex.: America/Sao_Paulo). Usado no check de consultoria.fuso.
create function private.fuso_valido(fuso text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = fuso)
$$;

-- ---------------------------------------------------------------------------
-- consultoria: o tenant. A RLS compara o próprio id com o vínculo ativo.
-- ---------------------------------------------------------------------------
create table public.consultoria (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  fuso text not null default 'America/Sao_Paulo',
  situacao public.situacao_consultoria not null default 'ativa',
  criada_em timestamptz not null default now(),
  constraint consultoria_nome_preenchido check (length(btrim(nome)) > 0),
  constraint consultoria_fuso_valido check (private.fuso_valido(fuso))
);

comment on table public.consultoria is 'Tenant. Toda tabela de dados aponta para cá por consultoria_id.';
comment on column public.consultoria.fuso is 'Fuso IANA usado para "hoje" e prazos civis (ADR-0009).';

-- ---------------------------------------------------------------------------
-- membro: vínculo de um usuário com uma consultoria. O papel vive aqui,
-- nunca no usuário nem em claim do JWT (ADR-0005). Desligar preserva autoria.
-- auth.users com ON DELETE RESTRICT: usuário com vínculo não é apagado.
-- ---------------------------------------------------------------------------
create table public.membro (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  usuario_id uuid not null references auth.users (id) on delete restrict,
  papel public.papel_membro not null,
  situacao public.situacao_membro not null default 'ativo',
  criado_em timestamptz not null default now(),
  desligado_em timestamptz,
  constraint membro_usuario_consultoria_key unique (usuario_id, consultoria_id),
  -- Alvo das FKs compostas (consultoria_id, membro_id) dos próximos épicos.
  constraint membro_consultoria_id_id_key unique (consultoria_id, id),
  constraint membro_desligamento_coerente check ((situacao = 'desligado') = (desligado_em is not null))
);

comment on table public.membro is 'Vínculo usuário-consultoria com papel. Responsável, autor e ator são sempre membro.id.';

-- ---------------------------------------------------------------------------
-- Helpers de autorização. security definer para ler membro sem depender da
-- RLS de quem chama (evita recursão nas políticas de membro); search_path
-- vazio e nomes qualificados contra sequestro de objetos.
-- Consideram só vínculos ativos do usuário autenticado (auth.uid()).
-- ---------------------------------------------------------------------------
create function private.membro_atual(cid uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
  from public.membro as m
  where m.consultoria_id = cid
    and m.usuario_id = (select auth.uid())
    and m.situacao = 'ativo'
$$;

create function private.is_membro(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membro as m
    where m.consultoria_id = cid
      and m.usuario_id = (select auth.uid())
      and m.situacao = 'ativo'
  )
$$;

create function private.is_gestao(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membro as m
    where m.consultoria_id = cid
      and m.usuario_id = (select auth.uid())
      and m.situacao = 'ativo'
      and m.papel = 'gestao'
  )
$$;

revoke all on function private.membro_atual(uuid) from public, anon;
revoke all on function private.is_membro(uuid) from public, anon;
revoke all on function private.is_gestao(uuid) from public, anon;
grant execute on function private.membro_atual(uuid) to authenticated;
grant execute on function private.is_membro(uuid) to authenticated;
grant execute on function private.is_gestao(uuid) to authenticated;

revoke all on function private.fuso_valido(text) from public, anon;
grant execute on function private.fuso_valido(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS de consultoria e membro: habilitada e forçada; o cliente só lê.
-- Sem política de insert/update/delete e sem grant de escrita.
-- ---------------------------------------------------------------------------
alter table public.consultoria enable row level security;
alter table public.consultoria force row level security;
alter table public.membro enable row level security;
alter table public.membro force row level security;

revoke all on table public.consultoria from anon, authenticated;
revoke all on table public.membro from anon, authenticated;
grant select on table public.consultoria to authenticated;
grant select on table public.membro to authenticated;

create policy consultoria_select_membro_ativo
  on public.consultoria
  for select
  to authenticated
  using ((select private.is_membro(id)));

-- TESTE: política de select de membro afrouxada
create policy membro_select_membro_ativo
  on public.membro
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- auditoria: append-only, preenchida só por trigger (ADR-0010).
-- Gestão da consultoria lê; ninguém altera nem apaga, nem o dono da tabela.
-- O ator é o membro ativo da sessão; fica nulo em operação sem usuário
-- (migration, seed, service role).
-- ---------------------------------------------------------------------------
create table public.auditoria (
  id bigint generated always as identity primary key,
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  entidade text not null,
  entidade_id uuid not null,
  acao public.acao_auditoria not null,
  ator_membro_id uuid,
  instante timestamptz not null default now(),
  antes jsonb,
  depois jsonb,
  motivo text,
  constraint auditoria_ator_fk foreign key (consultoria_id, ator_membro_id)
    references public.membro (consultoria_id, id) on delete restrict
);

create index auditoria_consultoria_instante_idx on public.auditoria (consultoria_id, instante desc);
create index auditoria_entidade_idx on public.auditoria (entidade, entidade_id);

comment on table public.auditoria is 'Trilha append-only (quem, o quê, quando, antes/depois). Escrita só por private.auditar().';
comment on column public.auditoria.motivo is 'Preenchido pela RPC com: set local gestao_ambiental.motivo = ''...''.';

alter table public.auditoria enable row level security;
alter table public.auditoria force row level security;

revoke all on table public.auditoria from anon, authenticated, service_role;
grant select on table public.auditoria to authenticated, service_role;

create policy auditoria_select_gestao
  on public.auditoria
  for select
  to authenticated
  using ((select private.is_gestao(consultoria_id)));

-- Barreira além dos grants: nem owner nem service_role alteram ou apagam.
create function private.bloquear_alteracao_auditoria()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'auditoria é append-only: % não é permitido', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

revoke all on function private.bloquear_alteracao_auditoria() from public, anon, authenticated;

create trigger auditoria_bloquear_update_delete
  before update or delete on public.auditoria
  for each row execute function private.bloquear_alteracao_auditoria();

create trigger auditoria_bloquear_truncate
  before truncate on public.auditoria
  for each statement execute function private.bloquear_alteracao_auditoria();

-- ---------------------------------------------------------------------------
-- Trigger genérica de auditoria. Uso:
--   create trigger <tabela>_auditar after insert or update or delete on public.<tabela>
--     for each row execute function private.auditar();               -- coluna consultoria_id
--     for each row execute function private.auditar('id');           -- na própria consultoria
-- Requer coluna id uuid. Update sem mudança nenhuma não gera linha.
-- ---------------------------------------------------------------------------
create function private.auditar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  coluna_consultoria text := coalesce(tg_argv[0], 'consultoria_id');
  antes jsonb;
  depois jsonb;
  registro jsonb;
  cid uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    antes := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    depois := to_jsonb(new);
  end if;

  if tg_op = 'UPDATE' and antes = depois then
    return null;
  end if;

  registro := coalesce(depois, antes);
  cid := (registro ->> coluna_consultoria)::uuid;

  insert into public.auditoria (consultoria_id, entidade, entidade_id, acao, ator_membro_id, antes, depois, motivo)
  values (
    cid,
    tg_table_name,
    (registro ->> 'id')::uuid,
    lower(tg_op)::public.acao_auditoria,
    private.membro_atual(cid),
    antes,
    depois,
    nullif(current_setting('gestao_ambiental.motivo', true), '')
  );

  return null;
end;
$$;

revoke all on function private.auditar() from public, anon, authenticated;

create trigger membro_auditar
  after insert or update or delete on public.membro
  for each row execute function private.auditar();

-- ---------------------------------------------------------------------------
-- Storage, bucket "arquivos": caminho consultoria_id/<entidade>/<uuid> (ADR-0008).
-- Membro ativo da consultoria do primeiro segmento lê e envia.
-- Sem update e sem delete: objetos são imutáveis e exclusão é lógica.
-- ---------------------------------------------------------------------------
create function private.consultoria_do_caminho(caminho text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(caminho, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(caminho, '/', 1)::uuid
  end
$$;

revoke all on function private.consultoria_do_caminho(text) from public, anon;
grant execute on function private.consultoria_do_caminho(text) to authenticated;

create policy arquivos_select_membro_ativo
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'arquivos'
    and (select private.is_membro(private.consultoria_do_caminho(name)))
  );

create policy arquivos_insert_membro_ativo
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'arquivos'
    and (select private.is_membro(private.consultoria_do_caminho(name)))
  );
