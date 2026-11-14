-- Acesso de suporte, fase 3 da central (ADM-01; ADR-0025; Termos de Uso §13; Acordo de Dados §8;
-- decisões do Eduardo de 14/11/2026).
--
-- Sem senha mestra. Só operador da plataforma (private.is_operador) com sessão de dois fatores
-- (aal2) entra como suporte, sempre pela central, e SÓ LÊ. Dois modos:
--   autorizado: a Gestão permite por 2, 24 ou 48 horas (motivo opcional) e pode encerrar a
--               qualquer momento; o operador entra pela central enquanto vale.
--   emergência: sem autorização, com categoria (incidente de segurança, falha grave que impede o
--               uso, ordem legal ou judicial) e motivo obrigatórios; 2 horas fixas; a Gestão é
--               avisada (faixa na tela até um Gestão marcar como visto e e-mail pela Edge Function
--               avisar-acesso-de-suporte).
-- O acesso vale enquanto agora < fim previsto, sem cron. Encerrar (Gestão ou operador) grava o fim;
-- o fim pelo prazo é o próprio fim previsto.
--
-- Como a leitura passa: is_membro e is_gestao aceitam, além do vínculo ativo, o acesso de suporte
-- ativo de quem chama (tabela própria; o suporte NUNCA ganha linha em membro). Assim as políticas
-- de select, as RPCs de leitura e o Storage passam a ler para o suporte como para a Gestão.
-- Como a escrita é barrada: trigger BEFORE INSERT/UPDATE/DELETE "_suporte_somente_leitura" em
-- toda tabela de public com consultoria_id (e em consultoria), criada por laço nesta migration.
-- Ela recusa ('acesso_de_suporte_somente_leitura') quando quem escreve tem só acesso de suporte
-- naquela consultoria. Trigger dispara também dentro de RPC security definer. O teste 020 exige a
-- trigger em toda tabela nova. No Storage, a política de envio passa a exigir vínculo de verdade.
--
-- Registro: append-only, em duas tabelas próprias (não a auditoria, cujo ator é membro):
--   acesso_suporte         uma linha por acesso (quem abriu ou autorizou, modo, categoria, motivo,
--                          início e fim previsto). Nunca muda.
--   acesso_suporte_evento  entradas efetivas do operador, encerramento (pela Gestão ou pelo
--                          operador) e "aviso visto". Nunca muda.
-- Nenhuma das duas aceita update, delete nem truncate (mesma trigger da auditoria). O estado atual
-- (ativo, encerrado, por quem) é calculado dos eventos.

-- ---------------------------------------------------------------------------
-- 1. Tabelas do registro
-- ---------------------------------------------------------------------------
create table public.acesso_suporte (
  id uuid primary key,
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  modo text not null,
  categoria text,
  motivo text,
  inicio timestamptz not null default now(),
  fim_previsto timestamptz not null,
  autorizado_por uuid,
  aberto_por uuid references auth.users (id) on delete restrict,
  constraint acesso_suporte_consultoria_id_id_key unique (consultoria_id, id),
  constraint acesso_suporte_autorizado_por_fk foreign key (consultoria_id, autorizado_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint acesso_suporte_modo check (modo in ('autorizado', 'emergencia')),
  constraint acesso_suporte_categoria check (
    categoria is null or categoria in ('incidente_de_seguranca', 'falha_grave', 'ordem_legal')
  ),
  constraint acesso_suporte_motivo check (motivo is null or length(btrim(motivo)) between 1 and 500),
  constraint acesso_suporte_no_maximo_48_horas check (
    fim_previsto > inicio and fim_previsto - inicio <= interval '48 hours'
  ),
  constraint acesso_suporte_modo_coerente check (
    (modo = 'autorizado'
      and autorizado_por is not null and aberto_por is null and categoria is null
      and fim_previsto - inicio in (interval '2 hours', interval '24 hours', interval '48 hours'))
    or
    (modo = 'emergencia'
      and aberto_por is not null and autorizado_por is null
      and categoria is not null and motivo is not null
      and fim_previsto - inicio = interval '2 hours')
  )
);

comment on table public.acesso_suporte is
  'Acesso de suporte (ADR-0025): uma linha por autorização da Gestão ou acesso de emergência. Append-only.';
comment on column public.acesso_suporte.autorizado_por is 'Membro da Gestão que autorizou (modo autorizado).';
comment on column public.acesso_suporte.aberto_por is 'Usuário operador que abriu a emergência (auth.users, não membro).';

create index acesso_suporte_consultoria_idx on public.acesso_suporte (consultoria_id, inicio desc);

create table public.acesso_suporte_evento (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  acesso_id uuid not null,
  tipo text not null,
  instante timestamptz not null default now(),
  usuario_id uuid references auth.users (id) on delete restrict,
  membro_id uuid,
  constraint acesso_suporte_evento_acesso_fk foreign key (consultoria_id, acesso_id)
    references public.acesso_suporte (consultoria_id, id) on delete restrict,
  constraint acesso_suporte_evento_membro_fk foreign key (consultoria_id, membro_id)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint acesso_suporte_evento_tipo check (
    tipo in ('entrada', 'encerrado_pela_gestao', 'encerrado_pelo_operador', 'aviso_visto')
  ),
  constraint acesso_suporte_evento_autor check (
    (tipo in ('entrada', 'encerrado_pelo_operador') and usuario_id is not null and membro_id is null)
    or (tipo in ('encerrado_pela_gestao', 'aviso_visto') and membro_id is not null and usuario_id is null)
  )
);

comment on table public.acesso_suporte_evento is
  'Eventos do acesso de suporte (ADR-0025): entradas do operador, encerramento e aviso visto. Append-only.';

create index acesso_suporte_evento_acesso_idx on public.acesso_suporte_evento (acesso_id, tipo);
create unique index acesso_suporte_evento_um_encerramento on public.acesso_suporte_evento (acesso_id)
  where tipo in ('encerrado_pela_gestao', 'encerrado_pelo_operador');
create unique index acesso_suporte_evento_um_aviso_visto on public.acesso_suporte_evento (acesso_id)
  where tipo = 'aviso_visto';

-- Append-only, até para o dono: a mesma trigger da auditoria.
create trigger acesso_suporte_bloquear_update_delete
  before update or delete on public.acesso_suporte
  for each row execute function private.bloquear_alteracao_auditoria();
create trigger acesso_suporte_bloquear_truncate
  before truncate on public.acesso_suporte
  for each statement execute function private.bloquear_alteracao_auditoria();
create trigger acesso_suporte_evento_bloquear_update_delete
  before update or delete on public.acesso_suporte_evento
  for each row execute function private.bloquear_alteracao_auditoria();
create trigger acesso_suporte_evento_bloquear_truncate
  before truncate on public.acesso_suporte_evento
  for each statement execute function private.bloquear_alteracao_auditoria();

-- ---------------------------------------------------------------------------
-- 2. Helpers. Todos security definer (leem as tabelas como o dono, que ignora RLS), stable e com
-- search_path vazio.
-- ---------------------------------------------------------------------------

-- Vínculo de verdade (sem suporte): os helpers originais de membro e Gestão.
create function private.is_membro_vinculado(cid uuid)
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

create function private.is_gestao_vinculada(cid uuid)
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

-- O usuário tem, neste instante, acesso de suporte valendo na consultoria: um acesso começado,
-- antes do fim previsto, não encerrado, e com entrada efetiva dele. Recebe o instante para os
-- testes simularem o tempo (o app sempre passa now()).
create function private.suporte_ativo_em(cid uuid, usuario uuid, instante timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.acesso_suporte as a
    where a.consultoria_id = cid
      and a.inicio <= instante
      and instante < a.fim_previsto
      and exists (
        select 1 from public.acesso_suporte_evento as e
        where e.acesso_id = a.id and e.tipo = 'entrada' and e.usuario_id = usuario
          and e.instante <= instante
      )
      and not exists (
        select 1 from public.acesso_suporte_evento as x
        where x.acesso_id = a.id
          and x.tipo in ('encerrado_pela_gestao', 'encerrado_pelo_operador')
          and x.instante <= instante
      )
  )
$$;

-- Leitura como suporte: operador, sessão com dois fatores e acesso ativo com entrada dele, agora.
create function private.suporte_ativo(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_operador()
    and private.sessao_com_dois_fatores()
    and private.suporte_ativo_em(cid, (select auth.uid()), now())
$$;

-- Para barrar escrita: tem acesso de suporte valendo (com qualquer nível de sessão) e não tem
-- vínculo de verdade com a consultoria.
create function private.somente_suporte(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and private.is_operador()
    and not private.is_membro_vinculado(cid)
    and private.suporte_ativo_em(cid, (select auth.uid()), now())
$$;

revoke all on function private.is_membro_vinculado(uuid) from public, anon;
revoke all on function private.is_gestao_vinculada(uuid) from public, anon;
revoke all on function private.suporte_ativo_em(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.suporte_ativo(uuid) from public, anon, authenticated;
revoke all on function private.somente_suporte(uuid) from public, anon, authenticated;
-- A política de envio do Storage chama is_membro_vinculado com o papel de quem envia.
grant execute on function private.is_membro_vinculado(uuid) to authenticated;
grant execute on function private.is_gestao_vinculada(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. is_membro e is_gestao passam a aceitar o acesso de suporte ativo (só leitura: a escrita é
-- barrada pela trigger da seção 4). membro_atual NÃO muda: o suporte não tem membro, e autor e
-- ator continuam sendo sempre membro.
-- O "or" para no primeiro verdadeiro: membro de verdade não chega a consultar o suporte, e quem não
-- é operador para em is_operador (uma busca pela chave primária).
-- ---------------------------------------------------------------------------
create or replace function private.is_membro(cid uuid)
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
  ) or private.suporte_ativo(cid)
$$;

create or replace function private.is_gestao(cid uuid)
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
  ) or private.suporte_ativo(cid)
$$;

-- ---------------------------------------------------------------------------
-- 4. Barreira de escrita do suporte.
-- Argumento: a coluna com o id da consultoria (padrão consultoria_id; em consultoria, 'id').
-- Quem não é operador sai na primeira linha. Exceção única: a central mudando a situação da
-- consultoria (ADR-0022), que é ação da plataforma, não dado da consultoria: operador com dois
-- fatores alterando só as colunas da situação.
-- ---------------------------------------------------------------------------
create function private.bloquear_escrita_do_suporte()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  coluna text := coalesce(tg_argv[0], 'consultoria_id');
  colunas_da_situacao text[] := array[
    'situacao', 'situacao_motivo', 'situacao_alterada_em', 'situacao_alterada_por', 'row_version'
  ];
  cid_novo uuid;
  cid_antigo uuid;
begin
  if (select auth.uid()) is null or not private.is_operador() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    cid_novo := (to_jsonb(new) ->> coluna)::uuid;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    cid_antigo := (to_jsonb(old) ->> coluna)::uuid;
  end if;

  if tg_table_name = 'consultoria' and tg_op = 'UPDATE'
     and private.sessao_com_dois_fatores()
     and (to_jsonb(new) - colunas_da_situacao) = (to_jsonb(old) - colunas_da_situacao) then
    return new;
  end if;

  if (cid_novo is not null and private.somente_suporte(cid_novo))
     or (cid_antigo is not null and private.somente_suporte(cid_antigo)) then
    raise exception 'acesso_de_suporte_somente_leitura' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.bloquear_escrita_do_suporte() from public, anon, authenticated;

-- Em toda tabela de public com consultoria_id, menos as da própria plataforma (escritas só por
-- RPCs com conferência própria: histórico de situação da central e o registro do suporte).
-- O nome começa com "_" para disparar antes das outras triggers BEFORE (ordem alfabética).
do $$
declare
  tabela record;
begin
  for tabela in
    select c.relname
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and exists (
        select 1 from pg_catalog.pg_attribute as a
        where a.attrelid = c.oid and a.attname = 'consultoria_id' and not a.attisdropped
      )
      and c.relname not in ('acesso_suporte', 'acesso_suporte_evento', 'consultoria_situacao_historico')
    order by c.relname
  loop
    execute format(
      'create trigger _suporte_somente_leitura before insert or update or delete on public.%I '
      'for each row execute function private.bloquear_escrita_do_suporte()',
      tabela.relname
    );
  end loop;
end;
$$;

create trigger _suporte_somente_leitura
  before insert or update or delete on public.consultoria
  for each row execute function private.bloquear_escrita_do_suporte('id');

-- Storage: ler continua com is_membro (o suporte lê os arquivos); enviar exige vínculo de verdade.
drop policy arquivos_insert_membro_ativo on storage.objects;

create policy arquivos_insert_membro_ativo
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'arquivos'
    and (select private.is_membro_vinculado(private.consultoria_do_caminho(name)))
  );

-- ---------------------------------------------------------------------------
-- 5. RLS do registro: a Gestão da consultoria lê direto (o suporte ativo também, pelo is_gestao);
-- Equipe e outras consultorias, zero linhas. Escrita só pelas RPCs abaixo (sem grant de escrita).
-- ---------------------------------------------------------------------------
alter table public.acesso_suporte enable row level security;
alter table public.acesso_suporte force row level security;
alter table public.acesso_suporte_evento enable row level security;
alter table public.acesso_suporte_evento force row level security;

revoke all on table public.acesso_suporte from public, anon, authenticated;
revoke all on table public.acesso_suporte_evento from public, anon, authenticated;
grant select on table public.acesso_suporte to authenticated;
grant select on table public.acesso_suporte_evento to authenticated;

create policy acesso_suporte_select_gestao
  on public.acesso_suporte
  for select
  to authenticated
  using ((select private.is_gestao(consultoria_id)));

create policy acesso_suporte_evento_select_gestao
  on public.acesso_suporte_evento
  for select
  to authenticated
  using ((select private.is_gestao(consultoria_id)));

-- ---------------------------------------------------------------------------
-- 6. Helpers das RPCs
-- ---------------------------------------------------------------------------

-- Acesso ainda valendo agora (antes do fim previsto e sem encerramento), qualquer modo.
create function private.acesso_valendo(acesso public.acesso_suporte)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select now() < acesso.fim_previsto
    and not exists (
      select 1 from public.acesso_suporte_evento as x
      where x.acesso_id = acesso.id
        and x.tipo in ('encerrado_pela_gestao', 'encerrado_pelo_operador')
    )
$$;

revoke all on function private.acesso_valendo(public.acesso_suporte) from public, anon, authenticated;

-- Histórico de acessos de uma consultoria, mais recente primeiro, paginado. Sem conferência de
-- permissão: quem chama (as RPCs públicas) confere antes.
create function private.historico_de_acessos(cid uuid, p_limite integer, p_deslocamento integer)
returns table (
  id uuid,
  modo text,
  categoria text,
  motivo text,
  inicio timestamptz,
  fim_previsto timestamptz,
  ativo boolean,
  encerrado_em timestamptz,
  encerramento text,
  encerrado_por_nome text,
  autorizado_por_nome text,
  aberto_por_nome text,
  entradas jsonb,
  aviso_visto_em timestamptz,
  aviso_visto_por_nome text,
  total bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    a.modo,
    a.categoria,
    a.motivo,
    a.inicio,
    a.fim_previsto,
    enc.id is null and now() < a.fim_previsto,
    case when enc.id is not null then enc.instante when now() >= a.fim_previsto then a.fim_previsto end,
    case
      when enc.tipo = 'encerrado_pela_gestao' then 'gestao'
      when enc.tipo = 'encerrado_pelo_operador' then 'operador'
      when now() >= a.fim_previsto then 'prazo'
    end,
    case
      when enc.membro_id is not null then mg.nome
      when enc.usuario_id is not null then private.nome_do_usuario(ue.raw_user_meta_data, ue.email)
    end,
    ma.nome,
    case when a.aberto_por is null then null else private.nome_do_usuario(uo.raw_user_meta_data, uo.email) end,
    coalesce((
      select jsonb_agg(
        jsonb_build_object('nome', private.nome_do_usuario(u.raw_user_meta_data, u.email), 'instante', e.instante)
        order by e.instante, e.id)
      from public.acesso_suporte_evento as e
      join auth.users as u on u.id = e.usuario_id
      where e.acesso_id = a.id and e.tipo = 'entrada'
    ), '[]'::jsonb),
    vis.instante,
    mv.nome,
    count(*) over ()
  from public.acesso_suporte as a
  left join public.acesso_suporte_evento as enc
    on enc.acesso_id = a.id and enc.tipo in ('encerrado_pela_gestao', 'encerrado_pelo_operador')
  left join public.membro as mg on mg.consultoria_id = a.consultoria_id and mg.id = enc.membro_id
  left join auth.users as ue on ue.id = enc.usuario_id
  left join public.membro as ma on ma.consultoria_id = a.consultoria_id and ma.id = a.autorizado_por
  left join auth.users as uo on uo.id = a.aberto_por
  left join public.acesso_suporte_evento as vis on vis.acesso_id = a.id and vis.tipo = 'aviso_visto'
  left join public.membro as mv on mv.consultoria_id = a.consultoria_id and mv.id = vis.membro_id
  where a.consultoria_id = cid
  order by a.inicio desc, a.id
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0)
$$;

revoke all on function private.historico_de_acessos(uuid, integer, integer) from public, anon, authenticated;

-- Motivo: sem espaços nas pontas; vazio vira nulo; até 500 caracteres.
create function private.motivo_do_suporte(motivo text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  limpo text := nullif(btrim(coalesce(motivo, '')), '');
begin
  if limpo is not null and length(limpo) > 500 then
    raise exception 'texto_longo_demais' using errcode = '22023';
  end if;
  return limpo;
end;
$$;

revoke all on function private.motivo_do_suporte(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. RPCs da Gestão (só vínculo de verdade: o suporte nunca autoriza, encerra pela Gestão nem
-- marca aviso como visto)
-- ---------------------------------------------------------------------------

-- Permitir acesso do suporte por 2, 24 ou 48 horas, com motivo opcional. Idempotente pelo id:
-- repetir devolve o mesmo acesso. Com autorização valendo, recusa (encerre antes).
create function public.autorizar_acesso_de_suporte(
  p_id uuid,
  p_consultoria_id uuid,
  p_horas integer,
  p_motivo text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  gestor uuid;
  motivo_limpo text;
  existente public.acesso_suporte;
begin
  if not private.is_gestao_vinculada(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'chave_obrigatoria' using errcode = '22023';
  end if;
  if p_horas is null or p_horas not in (2, 24, 48) then
    raise exception 'duracao_invalida' using errcode = '22023';
  end if;
  motivo_limpo := private.motivo_do_suporte(p_motivo);

  -- Uma autorização por vez: trava a consultoria enquanto confere e grava.
  perform 1 from public.consultoria as c where c.id = p_consultoria_id for update;

  select * into existente from public.acesso_suporte as a where a.id = p_id;
  if found then
    if existente.consultoria_id = p_consultoria_id and existente.modo = 'autorizado' then
      return existente.id;
    end if;
    raise exception 'chave_reutilizada' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.acesso_suporte as a
    where a.consultoria_id = p_consultoria_id and a.modo = 'autorizado' and private.acesso_valendo(a)
  ) then
    raise exception 'autorizacao_ativa' using errcode = 'P0001';
  end if;

  gestor := private.membro_atual(p_consultoria_id);
  insert into public.acesso_suporte (id, consultoria_id, modo, motivo, inicio, fim_previsto, autorizado_por)
  values (p_id, p_consultoria_id, 'autorizado', motivo_limpo, now(),
          now() + make_interval(hours => p_horas), gestor);
  return p_id;
end;
$$;

-- Encerrar acesso do suporte (autorizado ou de emergência): corta na hora. Idempotente: acesso já
-- encerrado ou vencido não muda nada.
create function public.encerrar_acesso_de_suporte(p_acesso_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.acesso_suporte;
begin
  select * into alvo from public.acesso_suporte as a where a.id = p_acesso_id;
  if not found or not private.is_gestao_vinculada(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  perform 1 from public.consultoria as c where c.id = alvo.consultoria_id for update;
  if not private.acesso_valendo(alvo) then
    return;
  end if;
  insert into public.acesso_suporte_evento (consultoria_id, acesso_id, tipo, membro_id)
  values (alvo.consultoria_id, alvo.id, 'encerrado_pela_gestao', private.membro_atual(alvo.consultoria_id));
end;
$$;

-- Marcar o aviso de emergência como visto (some a faixa para toda a Gestão). Idempotente.
create function public.marcar_aviso_de_suporte_visto(p_acesso_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.acesso_suporte;
begin
  select * into alvo from public.acesso_suporte as a where a.id = p_acesso_id;
  if not found or not private.is_gestao_vinculada(alvo.consultoria_id) or alvo.modo <> 'emergencia' then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  insert into public.acesso_suporte_evento (consultoria_id, acesso_id, tipo, membro_id)
  values (alvo.consultoria_id, alvo.id, 'aviso_visto', private.membro_atual(alvo.consultoria_id))
  on conflict (acesso_id) where tipo = 'aviso_visto' do nothing;
end;
$$;

-- Avisos de emergência ainda não vistos (faixa da Gestão), mais recente primeiro.
create function public.avisos_de_suporte_pendentes(p_consultoria_id uuid)
returns table (
  id uuid,
  categoria text,
  motivo text,
  inicio timestamptz,
  fim_previsto timestamptz,
  operador_nome text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_gestao_vinculada(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  return query
  select a.id, a.categoria, a.motivo, a.inicio, a.fim_previsto,
         private.nome_do_usuario(u.raw_user_meta_data, u.email)
  from public.acesso_suporte as a
  join auth.users as u on u.id = a.aberto_por
  where a.consultoria_id = p_consultoria_id
    and a.modo = 'emergencia'
    and not exists (
      select 1 from public.acesso_suporte_evento as v
      where v.acesso_id = a.id and v.tipo = 'aviso_visto'
    )
  order by a.inicio desc, a.id
  limit 20;
end;
$$;

-- "Acessos do suporte" na Equipe: o histórico da consultoria (Gestão; o suporte ativo também lê).
create function public.listar_acessos_de_suporte(
  p_consultoria_id uuid,
  p_limite integer default 50,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  modo text,
  categoria text,
  motivo text,
  inicio timestamptz,
  fim_previsto timestamptz,
  ativo boolean,
  encerrado_em timestamptz,
  encerramento text,
  encerrado_por_nome text,
  autorizado_por_nome text,
  aberto_por_nome text,
  entradas jsonb,
  aviso_visto_em timestamptz,
  aviso_visto_por_nome text,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_gestao(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return query select * from private.historico_de_acessos(p_consultoria_id, p_limite, p_deslocamento);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. RPCs do operador (operador com dois fatores, private.exigir_operador)
-- ---------------------------------------------------------------------------

-- Histórico de acessos no detalhe da consultoria, na central.
create function public.central_acessos_de_suporte(
  p_consultoria_id uuid,
  p_limite integer default 50,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  modo text,
  categoria text,
  motivo text,
  inicio timestamptz,
  fim_previsto timestamptz,
  ativo boolean,
  encerrado_em timestamptz,
  encerramento text,
  encerrado_por_nome text,
  autorizado_por_nome text,
  aberto_por_nome text,
  entradas jsonb,
  aviso_visto_em timestamptz,
  aviso_visto_por_nome text,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_operador();
  return query select * from private.historico_de_acessos(p_consultoria_id, p_limite, p_deslocamento);
end;
$$;

-- Entrar como suporte numa consultoria com acesso valendo (autorização da Gestão ou emergência já
-- aberta). Registra a entrada efetiva e devolve o id do acesso.
create function public.entrar_como_suporte(p_consultoria_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.acesso_suporte;
begin
  perform private.exigir_operador();
  if private.is_membro_vinculado(p_consultoria_id) then
    raise exception 'suporte_em_consultoria_propria' using errcode = 'P0001';
  end if;

  select * into alvo
  from public.acesso_suporte as a
  where a.consultoria_id = p_consultoria_id and private.acesso_valendo(a)
  order by (a.modo = 'autorizado') desc, a.fim_previsto desc
  limit 1;
  if not found then
    raise exception 'sem_autorizacao_de_suporte' using errcode = 'P0001';
  end if;

  insert into public.acesso_suporte_evento (consultoria_id, acesso_id, tipo, usuario_id)
  values (alvo.consultoria_id, alvo.id, 'entrada', (select auth.uid()));
  return alvo.id;
end;
$$;

-- Acesso de emergência: categoria e motivo obrigatórios, 2 horas fixas. Já entra (registra a
-- entrada). Idempotente pelo id. Com acesso valendo na consultoria, recusa: use "Entrar como
-- suporte".
create function public.abrir_acesso_de_emergencia(
  p_id uuid,
  p_consultoria_id uuid,
  p_categoria text,
  p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  operador uuid := (select auth.uid());
  motivo_limpo text;
  existente public.acesso_suporte;
begin
  perform private.exigir_operador();
  if p_id is null then
    raise exception 'chave_obrigatoria' using errcode = '22023';
  end if;
  if p_categoria is null
     or p_categoria not in ('incidente_de_seguranca', 'falha_grave', 'ordem_legal') then
    raise exception 'categoria_obrigatoria' using errcode = '22023';
  end if;
  motivo_limpo := private.motivo_do_suporte(p_motivo);
  if motivo_limpo is null then
    raise exception 'motivo_obrigatorio' using errcode = '22023';
  end if;

  perform 1 from public.consultoria as c where c.id = p_consultoria_id for update;
  if not found then
    raise exception 'consultoria_inexistente' using errcode = 'P0001';
  end if;
  if private.is_membro_vinculado(p_consultoria_id) then
    raise exception 'suporte_em_consultoria_propria' using errcode = 'P0001';
  end if;

  select * into existente from public.acesso_suporte as a where a.id = p_id;
  if found then
    if existente.consultoria_id = p_consultoria_id and existente.modo = 'emergencia'
       and existente.aberto_por = operador then
      return existente.id;
    end if;
    raise exception 'chave_reutilizada' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.acesso_suporte as a
    where a.consultoria_id = p_consultoria_id and private.acesso_valendo(a)
  ) then
    raise exception 'acesso_de_suporte_ativo' using errcode = 'P0001';
  end if;

  insert into public.acesso_suporte (id, consultoria_id, modo, categoria, motivo, inicio, fim_previsto, aberto_por)
  values (p_id, p_consultoria_id, 'emergencia', p_categoria, motivo_limpo, now(),
          now() + interval '2 hours', operador);
  insert into public.acesso_suporte_evento (consultoria_id, acesso_id, tipo, usuario_id)
  values (p_consultoria_id, p_id, 'entrada', operador);
  return p_id;
end;
$$;

-- Sair do acesso de suporte: encerra, na hora, o acesso valendo em que o operador entrou.
-- Só exige ser operador (sair nunca depende do segundo fator). Idempotente.
create function public.sair_do_acesso_de_suporte(p_consultoria_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  operador uuid := (select auth.uid());
  alvo public.acesso_suporte;
begin
  if not private.is_operador() then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  perform 1 from public.consultoria as c where c.id = p_consultoria_id for update;

  for alvo in
    select a.* from public.acesso_suporte as a
    where a.consultoria_id = p_consultoria_id
      and private.acesso_valendo(a)
      and exists (
        select 1 from public.acesso_suporte_evento as e
        where e.acesso_id = a.id and e.tipo = 'entrada' and e.usuario_id = operador
      )
  loop
    insert into public.acesso_suporte_evento (consultoria_id, acesso_id, tipo, usuario_id)
    values (alvo.consultoria_id, alvo.id, 'encerrado_pelo_operador', operador);
  end loop;
end;
$$;

-- Acessos de suporte valendo em que o operador entrou: o app mostra a consultoria em modo suporte.
create function public.meus_acessos_de_suporte()
returns table (
  acesso_id uuid,
  consultoria_id uuid,
  consultoria_nome text,
  consultoria_fuso text,
  modo text,
  fim_previsto timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_operador();

  return query
  select a.id, c.id, c.nome, c.fuso, a.modo, a.fim_previsto
  from public.acesso_suporte as a
  join public.consultoria as c on c.id = a.consultoria_id
  where private.acesso_valendo(a)
    and exists (
      select 1 from public.acesso_suporte_evento as e
      where e.acesso_id = a.id and e.tipo = 'entrada' and e.usuario_id = (select auth.uid())
    )
    and not private.is_membro_vinculado(c.id)
  order by c.nome, a.fim_previsto desc;
end;
$$;

-- Dados do aviso de emergência para a Edge Function avisar-acesso-de-suporte: só o operador que
-- abriu, só emergência valendo. Não devolve e-mails (a função os lê com a service role).
create function public.dados_do_aviso_de_emergencia(p_acesso_id uuid)
returns table (
  acesso_id uuid,
  consultoria_id uuid,
  consultoria_nome text,
  consultoria_fuso text,
  categoria text,
  motivo text,
  inicio timestamptz,
  fim_previsto timestamptz,
  operador_nome text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  alvo public.acesso_suporte;
begin
  perform private.exigir_operador();
  select * into alvo from public.acesso_suporte as a where a.id = p_acesso_id;
  if not found or alvo.modo <> 'emergencia' or alvo.aberto_por is distinct from (select auth.uid())
     or not private.acesso_valendo(alvo) then
    raise exception 'sem_acesso_de_emergencia' using errcode = '42501';
  end if;

  return query
  select alvo.id, c.id, c.nome, c.fuso, alvo.categoria, alvo.motivo, alvo.inicio, alvo.fim_previsto,
         private.nome_do_usuario(u.raw_user_meta_data, u.email)
  from public.consultoria as c
  join auth.users as u on u.id = alvo.aberto_por
  where c.id = alvo.consultoria_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Permissões das RPCs: só usuário logado (anon é barrado antes de rodar).
-- ---------------------------------------------------------------------------
revoke all on function public.autorizar_acesso_de_suporte(uuid, uuid, integer, text) from public, anon;
revoke all on function public.encerrar_acesso_de_suporte(uuid) from public, anon;
revoke all on function public.marcar_aviso_de_suporte_visto(uuid) from public, anon;
revoke all on function public.avisos_de_suporte_pendentes(uuid) from public, anon;
revoke all on function public.listar_acessos_de_suporte(uuid, integer, integer) from public, anon;
revoke all on function public.central_acessos_de_suporte(uuid, integer, integer) from public, anon;
revoke all on function public.entrar_como_suporte(uuid) from public, anon;
revoke all on function public.abrir_acesso_de_emergencia(uuid, uuid, text, text) from public, anon;
revoke all on function public.sair_do_acesso_de_suporte(uuid) from public, anon;
revoke all on function public.meus_acessos_de_suporte() from public, anon;
revoke all on function public.dados_do_aviso_de_emergencia(uuid) from public, anon;

grant execute on function public.autorizar_acesso_de_suporte(uuid, uuid, integer, text) to authenticated;
grant execute on function public.encerrar_acesso_de_suporte(uuid) to authenticated;
grant execute on function public.marcar_aviso_de_suporte_visto(uuid) to authenticated;
grant execute on function public.avisos_de_suporte_pendentes(uuid) to authenticated;
grant execute on function public.listar_acessos_de_suporte(uuid, integer, integer) to authenticated;
grant execute on function public.central_acessos_de_suporte(uuid, integer, integer) to authenticated;
grant execute on function public.entrar_como_suporte(uuid) to authenticated;
grant execute on function public.abrir_acesso_de_emergencia(uuid, uuid, text, text) to authenticated;
grant execute on function public.sair_do_acesso_de_suporte(uuid) to authenticated;
grant execute on function public.meus_acessos_de_suporte() to authenticated;
grant execute on function public.dados_do_aviso_de_emergencia(uuid) to authenticated;
