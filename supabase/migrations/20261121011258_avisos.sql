-- Avisos até a pessoa (P5, ADR-0047): resumo diário por e-mail e feed do calendário.
--
-- 1. preferencia_aviso  uma linha por membro (resumo_diario, row_version). SEM LINHA = LIGADO: todo
--                       membro ativo, inclusive quem entra depois, recebe sem precisar de linha.
--                       Sem _comercial_somente_leitura (exceção do pgTAP 020): consultoria
--                       inadimplente não impede ninguém de parar de receber aviso.
-- 2. feed_calendario    só o hash do token (o token sai uma vez, em gerar_link_do_calendario). Um
--                       ativo por membro; gerar de novo revoga o anterior. Sem
--                       _comercial_somente_leitura (exceção do pgTAP 020).
-- 3. aviso_envio        um registro por membro e dia (nunca dois e-mails no mesmo dia). Sem
--                       conteúdo do e-mail e sem auditoria (é ele mesmo o registro). Tem a barreira
--                       comercial, sem efeito prático: só a service role escreve, e a trigger libera
--                       escrita sem usuário.
-- 4. RPCs da pessoa (authenticated, só a própria linha): meus_avisos, definir_resumo_diario,
--    gerar_link_do_calendario, revogar_link_do_calendario.
-- 5. RPCs das Edge Functions (só service_role): avisos_do_dia_pendentes, itens_do_resumo_diario,
--    reservar_aviso_do_dia, registrar_aviso_do_dia, desligar_resumo_por_link, feed_do_calendario.
-- 6. Disparo: job do pg_cron a cada 15 minutos chama a Edge Function enviar-avisos-do-dia pelo
--    pg_net, com URL e token no Vault (avisos_do_dia_url e avisos_do_dia_token, gravados por SQL
--    no painel, nunca no repositório). Sem pg_cron, pg_net, Vault ou segredos, não faz nada.
--
-- Hora fixa (7 h no fuso da consultoria, recuperação até 9 h 59), antecedência fixa (7 dias), só
-- em dia útil nacional e só em consultoria em teste ou ativa.

-- ---------------------------------------------------------------------------
-- 1. preferencia_aviso
-- ---------------------------------------------------------------------------
create table public.preferencia_aviso (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  membro_id uuid not null,
  resumo_diario boolean not null default true,
  origem text not null default 'perfil',
  alterada_em timestamptz not null default now(),
  row_version integer not null default 1,
  constraint preferencia_aviso_consultoria_id_id_key unique (consultoria_id, id),
  constraint preferencia_aviso_membro_key unique (consultoria_id, membro_id),
  constraint preferencia_aviso_membro_fk foreign key (consultoria_id, membro_id)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint preferencia_aviso_origem check (origem in ('perfil', 'link')),
  constraint preferencia_aviso_row_version check (row_version >= 1)
);

comment on table public.preferencia_aviso is
  'Preferência de aviso por membro (ADR-0047). Sem linha = resumo diário ligado. Escrita só pelas RPCs definir_resumo_diario e desligar_resumo_por_link.';
comment on column public.preferencia_aviso.origem is
  'Onde a pessoa mudou por último: perfil (no Grama) ou link (descadastro do e-mail).';

alter table public.preferencia_aviso enable row level security;
alter table public.preferencia_aviso force row level security;
revoke all on table public.preferencia_aviso from public, anon, authenticated;
grant select on table public.preferencia_aviso to authenticated;

-- Só a própria pessoa (nem a Gestão lê a preferência dos outros).
create policy preferencia_aviso_select_propria
  on public.preferencia_aviso
  for select
  to authenticated
  using (membro_id = (select private.membro_atual(consultoria_id)));

create trigger preferencia_aviso_auditar
  after insert or update or delete on public.preferencia_aviso
  for each row execute function private.auditar('consultoria_id');

create trigger _suporte_somente_leitura
  before insert or update or delete on public.preferencia_aviso
  for each row execute function private.bloquear_escrita_do_suporte();
-- Sem _comercial_somente_leitura (exceção listada no pgTAP 020).

-- ---------------------------------------------------------------------------
-- 2. feed_calendario
-- ---------------------------------------------------------------------------
create table public.feed_calendario (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  membro_id uuid not null,
  token_hash text not null,
  criado_em timestamptz not null default now(),
  revogado_em timestamptz,
  ultimo_acesso_em timestamptz,
  constraint feed_calendario_consultoria_id_id_key unique (consultoria_id, id),
  constraint feed_calendario_token_hash_key unique (token_hash),
  constraint feed_calendario_token_hash_formato check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint feed_calendario_membro_fk foreign key (consultoria_id, membro_id)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint feed_calendario_revogacao_coerente check (revogado_em is null or revogado_em >= criado_em)
);

create unique index feed_calendario_ativo_por_membro_key
  on public.feed_calendario (consultoria_id, membro_id)
  where revogado_em is null;

comment on table public.feed_calendario is
  'Link do calendário (feed ICS) por membro (ADR-0047). Guarda só o SHA-256 do token; o token sai uma vez, em gerar_link_do_calendario.';

alter table public.feed_calendario enable row level security;
alter table public.feed_calendario force row level security;
revoke all on table public.feed_calendario from public, anon, authenticated;
-- Grant por coluna: o hash do token nunca sai pela API.
grant select (id, consultoria_id, membro_id, criado_em, revogado_em, ultimo_acesso_em)
  on public.feed_calendario to authenticated;

create policy feed_calendario_select_proprio
  on public.feed_calendario
  for select
  to authenticated
  using (membro_id = (select private.membro_atual(consultoria_id)));

-- Sem o hash e sem o último acesso (o uso do calendário não enche a auditoria).
create trigger feed_calendario_auditar
  after insert or update or delete on public.feed_calendario
  for each row execute function private.auditar('consultoria_id', 'token_hash', 'ultimo_acesso_em');

create trigger _suporte_somente_leitura
  before insert or update or delete on public.feed_calendario
  for each row execute function private.bloquear_escrita_do_suporte();
-- Sem _comercial_somente_leitura (exceção listada no pgTAP 020).

-- ---------------------------------------------------------------------------
-- 3. aviso_envio
-- ---------------------------------------------------------------------------
create table public.aviso_envio (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  membro_id uuid not null,
  dia date not null,
  situacao text not null default 'reservado',
  tentativas integer not null default 1,
  provedor_id text,
  reservado_em timestamptz not null default now(),
  enviado_em timestamptz,
  constraint aviso_envio_consultoria_id_id_key unique (consultoria_id, id),
  constraint aviso_envio_membro_dia_key unique (consultoria_id, membro_id, dia),
  constraint aviso_envio_membro_fk foreign key (consultoria_id, membro_id)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint aviso_envio_situacao check (situacao in ('reservado', 'enviado', 'falhou')),
  constraint aviso_envio_tentativas check (tentativas between 1 and 3),
  constraint aviso_envio_enviado_coerente check ((situacao = 'enviado') = (enviado_em is not null)),
  constraint aviso_envio_provedor_id check (provedor_id is null or length(provedor_id) between 1 and 200)
);

comment on table public.aviso_envio is
  'Resumo diário por membro e dia (ADR-0047): reservado antes de enviar, depois enviado ou falhou. Um por membro e dia. Sem conteúdo do e-mail.';
comment on column public.aviso_envio.dia is 'Data civil do resumo no fuso da consultoria.';
comment on column public.aviso_envio.provedor_id is 'Id do e-mail no Resend, quando enviado.';

alter table public.aviso_envio enable row level security;
alter table public.aviso_envio force row level security;
revoke all on table public.aviso_envio from public, anon, authenticated;
grant select on table public.aviso_envio to authenticated;

create policy aviso_envio_select_proprio
  on public.aviso_envio
  for select
  to authenticated
  using (membro_id = (select private.membro_atual(consultoria_id)));

create trigger _suporte_somente_leitura
  before insert or update or delete on public.aviso_envio
  for each row execute function private.bloquear_escrita_do_suporte();

-- Sem efeito prático (só a service role escreve, e a trigger libera escrita sem usuário); fica
-- para não abrir exceção nova no pgTAP 020.
create trigger _comercial_somente_leitura
  before insert or update or delete on public.aviso_envio
  for each row execute function private.bloquear_escrita_comercial();

-- ---------------------------------------------------------------------------
-- 4. RPCs da própria pessoa (Perfil › Avisos). Gestão e Equipe iguais; funcionam com a
--    consultoria em somente leitura comercial.
-- ---------------------------------------------------------------------------

-- Sempre uma linha: sem preferência, (true, 0); sem link ativo, (false, null, null).
create function public.meus_avisos(p_consultoria_id uuid)
returns table (
  resumo_diario boolean,
  row_version integer,
  link_ativo boolean,
  link_criado_em timestamptz,
  link_ultimo_acesso_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  eu uuid := private.membro_atual(p_consultoria_id);
begin
  if eu is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  return query
  select
    coalesce(p.resumo_diario, true),
    coalesce(p.row_version, 0),
    f.id is not null,
    f.criado_em,
    f.ultimo_acesso_em
  from (select 1) as um
  left join public.preferencia_aviso as p
    on p.consultoria_id = p_consultoria_id and p.membro_id = eu
  left join public.feed_calendario as f
    on f.consultoria_id = p_consultoria_id and f.membro_id = eu and f.revogado_em is null;
end;
$$;

-- Liga ou desliga o resumo diário. Sem linha, a versão esperada é 0. Devolve a versão nova.
create function public.definir_resumo_diario(p_consultoria_id uuid, p_ligado boolean, p_row_version integer)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  eu uuid := private.membro_atual(p_consultoria_id);
  atual public.preferencia_aviso;
begin
  if eu is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_ligado is null then
    raise exception 'ligado_obrigatorio' using errcode = '22023';
  end if;

  -- Serializa a primeira gravação (sem linha ainda) e as mudanças da mesma pessoa.
  perform 1 from public.membro as m where m.consultoria_id = p_consultoria_id and m.id = eu for update;

  select * into atual
  from public.preferencia_aviso as p
  where p.consultoria_id = p_consultoria_id and p.membro_id = eu
  for update;

  if not found then
    if p_row_version is distinct from 0 then
      raise exception 'conflito_de_versao' using errcode = 'P0001';
    end if;
    insert into public.preferencia_aviso (consultoria_id, membro_id, resumo_diario, origem, alterada_em, row_version)
    values (p_consultoria_id, eu, p_ligado, 'perfil', now(), 1);
    return 1;
  end if;

  if p_row_version is distinct from atual.row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;

  update public.preferencia_aviso as p
  set resumo_diario = p_ligado,
      origem = 'perfil',
      alterada_em = now(),
      row_version = atual.row_version + 1
  where p.id = atual.id;
  return atual.row_version + 1;
end;
$$;

-- Gera o link do calendário: revoga o ativo e devolve o token novo (única vez que sai em claro).
create function public.gerar_link_do_calendario(p_consultoria_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  eu uuid := private.membro_atual(p_consultoria_id);
  token text;
begin
  if eu is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  perform 1 from public.membro as m where m.consultoria_id = p_consultoria_id and m.id = eu for update;

  update public.feed_calendario as f
  set revogado_em = now()
  where f.consultoria_id = p_consultoria_id and f.membro_id = eu and f.revogado_em is null;

  token := private.novo_token();
  insert into public.feed_calendario (consultoria_id, membro_id, token_hash)
  values (p_consultoria_id, eu, private.hash_do_token(token));
  return token;
end;
$$;

-- Revoga o link ativo. Verdadeiro se revogou; falso se não havia (repetir não faz mal).
create function public.revogar_link_do_calendario(p_consultoria_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  eu uuid := private.membro_atual(p_consultoria_id);
begin
  if eu is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  update public.feed_calendario as f
  set revogado_em = now()
  where f.consultoria_id = p_consultoria_id and f.membro_id = eu and f.revogado_em is null;
  return found;
end;
$$;

revoke all on function public.meus_avisos(uuid) from public, anon;
revoke all on function public.definir_resumo_diario(uuid, boolean, integer) from public, anon;
revoke all on function public.gerar_link_do_calendario(uuid) from public, anon;
revoke all on function public.revogar_link_do_calendario(uuid) from public, anon;
grant execute on function public.meus_avisos(uuid) to authenticated;
grant execute on function public.definir_resumo_diario(uuid, boolean, integer) to authenticated;
grant execute on function public.gerar_link_do_calendario(uuid) to authenticated;
grant execute on function public.revogar_link_do_calendario(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPCs das Edge Functions (só service_role)
-- ---------------------------------------------------------------------------

-- Quem deve receber o resumo agora: consultoria em teste ou ativa; das 7 h às 9 h 59 no fuso
-- dela; dia útil nacional; membro ativo com e-mail; resumo ligado (sem linha = ligado); e sem
-- envio do dia já feito, esgotado (3 tentativas) ou reservado há menos de 30 minutos.
create function public.avisos_do_dia_pendentes(p_agora timestamptz default now())
returns table (
  consultoria_id uuid,
  consultoria_nome text,
  membro_id uuid,
  membro_nome text,
  email text,
  papel public.papel_membro,
  dia date
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.nome, m.id, m.nome, m.email, m.papel, l.dia
  from public.consultoria as c
  cross join lateral (
    select (coalesce(p_agora, now()) at time zone c.fuso) as local,
           (coalesce(p_agora, now()) at time zone c.fuso)::date as dia
  ) as l
  join public.membro as m
    on m.consultoria_id = c.id and m.situacao = 'ativo' and position('@' in m.email) > 0
  left join public.preferencia_aviso as p
    on p.consultoria_id = m.consultoria_id and p.membro_id = m.id
  where c.situacao in ('teste', 'ativa')
    and l.local::time >= time '07:00'
    and l.local::time < time '10:00'
    and private.eh_dia_util_nacional(l.dia)
    and coalesce(p.resumo_diario, true)
    and not exists (
      select 1 from public.aviso_envio as e
      where e.consultoria_id = m.consultoria_id and e.membro_id = m.id and e.dia = l.dia
        and (e.situacao = 'enviado'
             or e.tentativas >= 3
             or (e.situacao = 'reservado'
                 and e.reservado_em >= coalesce(p_agora, now()) - interval '30 minutes'))
    )
  order by c.id, m.id
$$;

-- Itens do resumo de um membro: prazos oficiais atrasados, de hoje e dos próximos 7 dias, de
-- todas as fontes da base (private.linhas_de_prazo). Todos recebem os seus (grupo 'meus'); a
-- Gestão recebe também os sem responsável ('sem_responsavel': tipos que têm responsável e estão
-- sem; 'da_consultoria': tipos sem responsável, como validade, limite de protocolo, alvará e
-- vencimento). Membro não ativo: nada.
create function public.itens_do_resumo_diario(p_consultoria_id uuid, p_membro_id uuid, p_dia date)
returns table (
  grupo text,
  tipo_linha text,
  id uuid,
  prazo date,
  dias integer,
  codigo text,
  titulo text,
  empreendimento_nome text,
  unidade_nome text,
  licenca text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_papel public.papel_membro;
begin
  if p_dia is null then
    raise exception 'dia_obrigatorio' using errcode = '22023';
  end if;

  select m.papel into v_papel
  from public.membro as m
  where m.consultoria_id = p_consultoria_id and m.id = p_membro_id and m.situacao = 'ativo';
  if not found then
    return;
  end if;

  return query
  select x.g, x.tl, x.lid, x.pz, x.d, x.cod, x.tit, x.emp, x.uni, x.lic
  from (
    select
      case
        when l.responsavel_id = p_membro_id then 'meus'
        when private.tipo_linha_tem_responsavel(l.tipo_linha) then 'sem_responsavel'
        else 'da_consultoria'
      end as g,
      l.tipo_linha as tl, l.id as lid, l.prazo as pz, (l.prazo - p_dia) as d, l.codigo as cod,
      l.titulo as tit, l.empreendimento_nome as emp, l.unidade_nome as uni, l.licenca as lic
    from private.linhas_de_prazo(p_consultoria_id) as l
    where l.prazo <= p_dia + 7
      and (l.responsavel_id = p_membro_id or (v_papel = 'gestao' and l.responsavel_id is null))
  ) as x
  order by case x.g when 'meus' then 1 when 'sem_responsavel' then 2 else 3 end, x.pz, x.tit, x.lid
  limit 500;
end;
$$;

-- Reserva o resumo do dia antes de enviar. Devolve o id reservado, ou nulo quando outra execução
-- reservou há menos de 30 minutos, o resumo já saiu, as 3 tentativas acabaram, o membro não está
-- ativo ou desligou o resumo. Duas chamadas seguidas: só a primeira devolve o id.
create function public.reservar_aviso_do_dia(p_consultoria_id uuid, p_membro_id uuid, p_dia date)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_dia is null then
    raise exception 'dia_obrigatorio' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.membro as m
    where m.consultoria_id = p_consultoria_id and m.id = p_membro_id and m.situacao = 'ativo'
  ) then
    return null;
  end if;
  if exists (
    select 1 from public.preferencia_aviso as p
    where p.consultoria_id = p_consultoria_id and p.membro_id = p_membro_id and not p.resumo_diario
  ) then
    return null;
  end if;

  insert into public.aviso_envio as e (consultoria_id, membro_id, dia)
  values (p_consultoria_id, p_membro_id, p_dia)
  on conflict on constraint aviso_envio_membro_dia_key do update
    set situacao = 'reservado',
        tentativas = e.tentativas + 1,
        reservado_em = now()
    where e.tentativas < 3
      and (e.situacao = 'falhou'
           or (e.situacao = 'reservado' and e.reservado_em < now() - interval '30 minutes'))
  returning e.id into v_id;
  return v_id;
end;
$$;

-- Resultado do envio de uma reserva. Só muda o que ainda está reservado.
create function public.registrar_aviso_do_dia(p_id uuid, p_situacao text, p_provedor_id text default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_situacao is null or p_situacao not in ('enviado', 'falhou') then
    raise exception 'situacao_invalida' using errcode = '22023';
  end if;

  update public.aviso_envio as e
  set situacao = p_situacao,
      enviado_em = case when p_situacao = 'enviado' then now() end,
      provedor_id = case
        when p_situacao = 'enviado' then nullif(left(p_provedor_id, 200), '')
        else e.provedor_id
      end
  where e.id = p_id and e.situacao = 'reservado';
  return found;
end;
$$;

-- Descadastro pelo link do e-mail (assinado na Edge Function). Falso quando o membro não existe;
-- verdadeiro quando desligou ou já estava desligado. Vale para membro ativo ou desligado e com a
-- consultoria em somente leitura.
create function public.desligar_resumo_por_link(p_consultoria_id uuid, p_membro_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  atual public.preferencia_aviso;
begin
  perform 1 from public.membro as m
  where m.consultoria_id = p_consultoria_id and m.id = p_membro_id
  for update;
  if not found then
    return false;
  end if;

  select * into atual
  from public.preferencia_aviso as p
  where p.consultoria_id = p_consultoria_id and p.membro_id = p_membro_id
  for update;

  if not found then
    insert into public.preferencia_aviso (consultoria_id, membro_id, resumo_diario, origem, alterada_em, row_version)
    values (p_consultoria_id, p_membro_id, false, 'link', now(), 1);
    return true;
  end if;

  if not atual.resumo_diario then
    return true;
  end if;

  update public.preferencia_aviso as p
  set resumo_diario = false,
      origem = 'link',
      alterada_em = now(),
      row_version = atual.row_version + 1
  where p.id = atual.id;
  return true;
end;
$$;

-- Feed do calendário pelo hash do token. Token inválido, revogado, membro não ativo ou
-- consultoria fora de teste/ativa: sempre o mesmo erro. Só os prazos em que o membro é o
-- responsável, de hoje − 60 a hoje + 400 dias, só o prazo oficial, sem título nem cliente.
create function public.feed_do_calendario(p_token_hash text)
returns table (
  tipo_linha text,
  id uuid,
  prazo date,
  codigo text,
  empreendimento_nome text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_feed uuid;
  v_cid uuid;
  v_membro uuid;
  v_hoje date;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'token_invalido' using errcode = 'P0001';
  end if;

  select f.id, f.consultoria_id, f.membro_id into v_feed, v_cid, v_membro
  from public.feed_calendario as f
  join public.membro as m on m.consultoria_id = f.consultoria_id and m.id = f.membro_id
  join public.consultoria as c on c.id = f.consultoria_id
  where f.token_hash = p_token_hash
    and f.revogado_em is null
    and m.situacao = 'ativo'
    and c.situacao in ('teste', 'ativa');
  if not found then
    raise exception 'token_invalido' using errcode = 'P0001';
  end if;

  update public.feed_calendario as f
  set ultimo_acesso_em = now()
  where f.id = v_feed and (f.ultimo_acesso_em is null or f.ultimo_acesso_em < now() - interval '1 hour');

  v_hoje := private.hoje_da_consultoria(v_cid);

  return query
  select l.tipo_linha, l.id, l.prazo, l.codigo, l.empreendimento_nome
  from private.linhas_de_prazo(v_cid) as l
  where l.responsavel_id = v_membro
    and l.prazo between v_hoje - 60 and v_hoje + 400
  order by l.prazo, l.id
  limit 2000;
end;
$$;

revoke all on function public.avisos_do_dia_pendentes(timestamptz) from public, anon, authenticated;
revoke all on function public.itens_do_resumo_diario(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.reservar_aviso_do_dia(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.registrar_aviso_do_dia(uuid, text, text) from public, anon, authenticated;
revoke all on function public.desligar_resumo_por_link(uuid, uuid) from public, anon, authenticated;
revoke all on function public.feed_do_calendario(text) from public, anon, authenticated;
grant execute on function public.avisos_do_dia_pendentes(timestamptz) to service_role;
grant execute on function public.itens_do_resumo_diario(uuid, uuid, date) to service_role;
grant execute on function public.reservar_aviso_do_dia(uuid, uuid, date) to service_role;
grant execute on function public.registrar_aviso_do_dia(uuid, text, text) to service_role;
grant execute on function public.desligar_resumo_por_link(uuid, uuid) to service_role;
grant execute on function public.feed_do_calendario(text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Disparo pelo pg_cron (mesmo padrão do aviso da lista de espera, ADR-0034)
-- ---------------------------------------------------------------------------
create function private.disparar_avisos_do_dia()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_token text;
  v_schema_net text;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return;
  end if;
  -- O schema do pg_net vem do catálogo: sem a extensão (banco local, CI) não há o que chamar, e o
  -- plpgsql_check do CI falharia com um nome fixo.
  select n.nspname into v_schema_net
  from pg_catalog.pg_extension as e
  join pg_catalog.pg_namespace as n on n.oid = e.extnamespace
  where e.extname = 'pg_net';
  if v_schema_net is null then
    return;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1'
    into v_url using 'avisos_do_dia_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1'
    into v_token using 'avisos_do_dia_token';
  if v_url is null or v_token is null then
    return;
  end if;
  -- Ninguém para receber agora (fora da janela, fim de semana, todos enviados): não chama.
  if not exists (select 1 from public.avisos_do_dia_pendentes(now())) then
    return;
  end if;
  execute format('select %I.http_post(url := $1, body := $2, headers := $3)', v_schema_net)
    using v_url, '{}'::jsonb,
          jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', v_token);
end;
$$;

revoke all on function private.disparar_avisos_do_dia() from public, anon, authenticated;

-- Só onde há pg_cron (Supabase); cron.schedule com o mesmo nome substitui o job.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('avisos-do-dia', '*/15 * * * *', 'select private.disparar_avisos_do_dia()');
  end if;
end;
$$;
