-- Central administrativa, fase 2 (ADM-01; ADR-0024, que complementa o ADR-0022; decisões do
-- Eduardo de 14/11/2026).
--
-- A. Dois fatores: as RPCs de dados da central passam a exigir, além de operador, sessão com
--    aal2 (TOTP do Supabase Auth verificado nesta sessão). Sem aal2: 'dois_fatores_necessarios'.
--    sou_operador continua respondendo só se é operador (sem dados), para o front saber que deve
--    pedir o código.
-- B. Sinal de uso diário: public.uso_diario, uma linha por pessoa, dia (no fuso da consultoria) e
--    área do sistema. Escrita só por registrar_uso (membro ativo); leitura só pelas RPCs da central.
--    A Gestão da consultoria não vê o uso individual.
-- C. A central mostra o uso: consultorias ativas agora, em 7 e em 30 dias, alerta de "sem uso",
--    último uso na lista, por pessoa e dias com uso por área.
--
-- Os limiares (15 minutos para "agora", 14 dias para o alerta) são regras do packages/domain
-- (uso-da-plataforma.ts); o front os passa como parâmetro, com estes mesmos valores como padrão.

-- ---------------------------------------------------------------------------
-- A. Dois fatores para a central
-- ---------------------------------------------------------------------------

-- A sessão foi confirmada com o segundo fator? O Supabase Auth grava o nível em `aal` no JWT:
-- aal1 = só senha; aal2 = senha + código do aplicativo autenticador.
create function private.sessao_com_dois_fatores()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
$$;

revoke all on function private.sessao_com_dois_fatores() from public, anon, authenticated;

-- Todas as RPCs de dados da central chamam esta função antes de qualquer leitura ou escrita.
-- Primeiro o papel (quem não é operador recebe sem_permissao, com ou sem dois fatores), depois o
-- nível da sessão. O código é o mesmo 42501 de permissão; a mensagem é estável e o front a
-- reconhece para pedir o código em vez de mostrar "sem permissão".
create or replace function private.exigir_operador()
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
  if not private.sessao_com_dois_fatores() then
    raise exception 'dois_fatores_necessarios' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.exigir_operador() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- B. Uso diário
-- ---------------------------------------------------------------------------
create table public.uso_diario (
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  membro_id uuid not null,
  dia date not null,
  modulo text not null,
  primeiro_em timestamptz not null default now(),
  ultimo_em timestamptz not null default now(),
  constraint uso_diario_pkey primary key (membro_id, dia, modulo),
  constraint uso_diario_membro_fk foreign key (consultoria_id, membro_id)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint uso_diario_modulo check (
    modulo in ('licencas_e_prazos', 'orcamentos', 'propostas', 'equipe_e_conta')
  ),
  constraint uso_diario_ordem check (ultimo_em >= primeiro_em)
);

comment on table public.uso_diario is
  'Sinal de uso: uma linha por pessoa, dia (fuso da consultoria) e área. Escrita só por registrar_uso; leitura só pelas RPCs da central (operador com dois fatores). Ver ADR-0024.';
comment on column public.uso_diario.dia is 'Data civil no fuso da consultoria, nunca no fuso do aparelho.';

create index uso_diario_consultoria_idx on public.uso_diario (consultoria_id, ultimo_em desc);
create index uso_diario_membro_idx on public.uso_diario (consultoria_id, membro_id, dia);

-- RLS habilitada e forçada: ninguém lê nem escreve direto, nem a Gestão nem o operador.
-- A única política é de select e nunca é verdadeira (toda tabela de public tem política, teste 020);
-- não há política de insert, update ou delete. O grant de select fica só para a consulta direta
-- devolver zero linhas, como nas outras tabelas; escrita não tem grant.
alter table public.uso_diario enable row level security;
alter table public.uso_diario force row level security;
revoke all on table public.uso_diario from public, anon, authenticated;
grant select on table public.uso_diario to authenticated;

create policy uso_diario_select_ninguem
  on public.uso_diario
  for select
  to authenticated
  using (false);

-- Grava (ou renova) o uso de um membro num instante. Interna: registrar_uso passa now(); os testes
-- passam um instante fixo para conferir o dia no fuso da consultoria.
-- Idempotente: a linha é única por (membro, dia, área); repetir só renova ultimo_em, e só quando o
-- último registro tem mais de 5 minutos (no máximo uma escrita útil a cada 5 minutos).
create function private.registrar_uso_em(
  p_consultoria_id uuid,
  p_membro_id uuid,
  p_modulo text,
  p_instante timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fuso text;
begin
  select c.fuso into fuso from public.consultoria as c where c.id = p_consultoria_id;
  if not found then
    raise exception 'consultoria_inexistente' using errcode = 'P0001';
  end if;

  insert into public.uso_diario as u (consultoria_id, membro_id, dia, modulo, primeiro_em, ultimo_em)
  values (p_consultoria_id, p_membro_id, (p_instante at time zone fuso)::date, p_modulo,
          p_instante, p_instante)
  on conflict (membro_id, dia, modulo) do update
    set ultimo_em = excluded.ultimo_em
    where u.ultimo_em <= excluded.ultimo_em - interval '5 minutes';
end;
$$;

revoke all on function private.registrar_uso_em(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;

-- RPC do front: registra que quem chama usou esta área da consultoria agora. Só membro ativo.
create function public.registrar_uso(p_consultoria_id uuid, p_modulo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid;
begin
  if p_modulo is null
     or p_modulo not in ('licencas_e_prazos', 'orcamentos', 'propostas', 'equipe_e_conta') then
    raise exception 'modulo_invalido' using errcode = '22023';
  end if;

  select m.id into eu
  from public.membro as m
  where m.consultoria_id = p_consultoria_id
    and m.usuario_id = (select auth.uid())
    and m.situacao = 'ativo';
  if eu is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  perform private.registrar_uso_em(p_consultoria_id, eu, p_modulo, now());
end;
$$;

revoke all on function public.registrar_uso(uuid, text) from public, anon;
grant execute on function public.registrar_uso(uuid, text) to authenticated;

-- Último uso de uma consultoria (qualquer pessoa, qualquer área).
create function private.ultimo_uso_da_consultoria(cid uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(u.ultimo_em) from public.uso_diario as u where u.consultoria_id = cid
$$;

revoke all on function private.ultimo_uso_da_consultoria(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- C. A central mostra o uso
-- ---------------------------------------------------------------------------

-- Lista de consultorias: a mesma da fase 1 com a coluna ultimo_uso_em. O tipo de retorno muda,
-- então a função é recriada (mesmos argumentos e permissões).
drop function public.central_listar_consultorias(text, public.situacao_consultoria, integer, integer);

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
  ultimo_uso_em timestamptz,
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
    private.ultimo_uso_da_consultoria(p.id),
    p.total
  from pagina as p
  order by private.normalizar_nome(p.nome), p.id;
end;
$$;

-- Pessoas: a mesma da fase 1 com último uso e dias com uso nos últimos 30 dias (hoje incluído, no
-- fuso da consultoria).
drop function public.central_listar_pessoas(uuid, integer, integer);

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
  ultimo_uso_em timestamptz,
  dias_com_uso_30 bigint,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hoje date;
begin
  perform private.exigir_operador();

  select (now() at time zone c.fuso)::date into hoje
  from public.consultoria as c where c.id = p_consultoria_id;

  return query
  select
    m.id,
    m.nome,
    m.email,
    m.papel,
    m.situacao,
    m.criado_em,
    m.desligado_em,
    (select max(u.ultimo_em) from public.uso_diario as u
     where u.consultoria_id = m.consultoria_id and u.membro_id = m.id),
    (select count(distinct u.dia) from public.uso_diario as u
     where u.consultoria_id = m.consultoria_id and u.membro_id = m.id
       and u.dia between hoje - 29 and hoje),
    count(*) over ()
  from public.membro as m
  where m.consultoria_id = p_consultoria_id
  order by (m.situacao = 'ativo') desc, m.nome, m.id
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0);
end;
$$;

-- Dias com uso por área nos últimos 30 dias (hoje incluído, fuso da consultoria). As quatro áreas
-- sempre aparecem, na ordem do menu; sem uso, zero.
create function public.central_uso_por_modulo(p_consultoria_id uuid)
returns table (
  modulo text,
  dias bigint,
  ultimo_uso_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hoje date;
begin
  perform private.exigir_operador();

  select (now() at time zone c.fuso)::date into hoje
  from public.consultoria as c where c.id = p_consultoria_id;

  return query
  select
    a.modulo,
    (select count(distinct u.dia) from public.uso_diario as u
     where u.consultoria_id = p_consultoria_id and u.modulo = a.modulo
       and u.dia between hoje - 29 and hoje),
    (select max(u.ultimo_em) from public.uso_diario as u
     where u.consultoria_id = p_consultoria_id and u.modulo = a.modulo)
  from (values (1, 'licencas_e_prazos'), (2, 'orcamentos'), (3, 'propostas'), (4, 'equipe_e_conta'))
    as a (ordem, modulo)
  where hoje is not null
  order by a.ordem;
end;
$$;

-- Visão geral: quantas consultorias tiveram uso agora (últimos p_minutos_agora minutos), nos
-- últimos 7 dias e nos últimos 30 dias. Contagem por instante (independe de fuso).
create function public.central_resumo_de_uso(p_minutos_agora integer default 15)
returns table (
  agora bigint,
  ultimos_7_dias bigint,
  ultimos_30_dias bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  minutos integer := least(greatest(coalesce(p_minutos_agora, 15), 1), 1440);
begin
  perform private.exigir_operador();

  return query
  with ultimo as (
    select u.consultoria_id, max(u.ultimo_em) as em
    from public.uso_diario as u
    group by u.consultoria_id
  )
  select
    count(*) filter (where l.em >= now() - make_interval(mins => minutos)),
    count(*) filter (where l.em >= now() - interval '7 days'),
    count(*) filter (where l.em >= now() - interval '30 days')
  from ultimo as l;
end;
$$;

-- Alerta "sem uso": consultorias com pessoas ativas e nenhum uso nos últimos p_dias dias. Entram as
-- que nunca usaram, se foram criadas há mais de p_dias dias. Arquivadas ficam de fora (já estão
-- encerradas de propósito). Mais tempo sem uso primeiro. Paginada.
create function public.central_alertas_sem_uso(
  p_dias integer default 14,
  p_limite integer default 50,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  nome text,
  criada_em timestamptz,
  fuso text,
  situacao public.situacao_consultoria,
  pessoas_ativas bigint,
  ultimo_uso_em timestamptz,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  limite timestamptz := now() - make_interval(days => least(greatest(coalesce(p_dias, 14), 1), 365));
begin
  perform private.exigir_operador();

  return query
  with base as (
    select c.id, c.nome, c.criada_em, c.fuso, c.situacao,
           (select count(*) from public.membro as m
            where m.consultoria_id = c.id and m.situacao = 'ativo') as pessoas_ativas,
           private.ultimo_uso_da_consultoria(c.id) as ultimo_uso_em
    from public.consultoria as c
    where c.situacao <> 'arquivada'
  )
  select b.id, b.nome, b.criada_em, b.fuso, b.situacao, b.pessoas_ativas, b.ultimo_uso_em,
         count(*) over ()
  from base as b
  where b.pessoas_ativas > 0
    and coalesce(b.ultimo_uso_em, b.criada_em) < limite
  order by coalesce(b.ultimo_uso_em, b.criada_em), private.normalizar_nome(b.nome), b.id
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões: só usuário logado (anon é barrado antes de rodar). Dentro, operador com dois fatores.
-- ---------------------------------------------------------------------------
revoke all on function public.central_listar_consultorias(text, public.situacao_consultoria, integer, integer)
  from public, anon;
revoke all on function public.central_listar_pessoas(uuid, integer, integer) from public, anon;
revoke all on function public.central_uso_por_modulo(uuid) from public, anon;
revoke all on function public.central_resumo_de_uso(integer) from public, anon;
revoke all on function public.central_alertas_sem_uso(integer, integer, integer) from public, anon;

grant execute on function public.central_listar_consultorias(text, public.situacao_consultoria, integer, integer)
  to authenticated;
grant execute on function public.central_listar_pessoas(uuid, integer, integer) to authenticated;
grant execute on function public.central_uso_por_modulo(uuid) to authenticated;
grant execute on function public.central_resumo_de_uso(integer) to authenticated;
grant execute on function public.central_alertas_sem_uso(integer, integer, integer) to authenticated;
