-- Coleta de normas (pacote L1, ADR-0050, LEG-02 e LEG-03): IMA (INs e portarias) e CONSEMA.
--
-- Só aditiva. As Edge Functions de coleta (service role) escrevem no catálogo por estas RPCs; ninguém
-- mais executa. Todas são security definer com search_path vazio e só service_role tem execute.
--
-- Regras daqui:
-- - Coleta idempotente por (fonte, janela): repetir a janela concluída não faz nada; coleta que
--   falhou ou ficou presa (30 minutos ou mais em andamento) volta para em andamento.
-- - Versão nova só quando o SHA-256 muda (unique (norma_id, sha256)).
-- - Primeira versão de uma norma é a versão-base, sem mudança (regra 4 do ADR-0050). Só vira
--   mudança 'nova' quando o coletor diz que é ato novo e a fonte já tem uma coleta concluída.
-- - A revogação vem das portarias do IMA, porque a página das INs não marca.
--
-- O pg_cron fica desligado: private.ligar_coleta_de_normas agenda os jobs e liga as fontes, mas
-- nenhuma migration chama. Quem publica decide (regra 7 do ADR-0050).

-- ---------------------------------------------------------------------------
-- 1. Bucket privado dos arquivos de norma (normas/<norma>/<uuid>)
-- ---------------------------------------------------------------------------
-- Sem política: authenticated e anon não leem nem gravam; só a service role da coleta.
insert into storage.buckets (id, name, public)
values ('normas', 'normas', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Coleta: início e conclusão
-- ---------------------------------------------------------------------------
create function public.iniciar_coleta(p_fonte text, p_janela text, p_forcar boolean default false)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ativa boolean;
  v_id uuid;
  v_situacao text;
  v_iniciada_em timestamptz;
begin
  select f.ativa into v_ativa from private.fonte_legal as f where f.codigo = p_fonte;
  if not found then
    raise exception 'fonte_inexistente' using errcode = 'P0001';
  end if;
  if not v_ativa and not coalesce(p_forcar, false) then
    raise exception 'fonte_desligada' using errcode = 'P0001';
  end if;

  insert into private.coleta (fonte, janela)
  values (p_fonte, p_janela)
  on conflict (fonte, janela) do nothing
  returning id into v_id;
  if v_id is not null then
    return v_id;
  end if;

  select c.id, c.situacao, c.iniciada_em into v_id, v_situacao, v_iniciada_em
  from private.coleta as c
  where c.fonte = p_fonte and c.janela = p_janela
  for update;

  -- Já concluída, ou em andamento há menos de 30 minutos (outra execução cuida dela).
  if v_situacao = 'concluida'
     or (v_situacao = 'em_andamento' and v_iniciada_em > now() - interval '30 minutes') then
    return null;
  end if;

  -- Falhou ou ficou presa: recomeça a mesma coleta.
  update private.coleta
  set situacao = 'em_andamento', iniciada_em = now(), concluida_em = null, erro = null
  where id = v_id;
  return v_id;
end;
$$;

comment on function public.iniciar_coleta(text, text, boolean) is
  'Coleta: abre (fonte, janela). Nulo se já concluída ou em andamento há menos de 30 min. Só service role.';

create function public.concluir_coleta(p_coleta_id uuid, p_itens_novos integer, p_erro text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fonte text;
  v_erro text := left(p_erro, 500);
begin
  update private.coleta
  set situacao = case when v_erro is null then 'concluida' else 'falhou' end,
      concluida_em = now(),
      itens_novos = coalesce(p_itens_novos, 0),
      erro = v_erro
  where id = p_coleta_id
  returning fonte into v_fonte;
  if not found then
    raise exception 'coleta_inexistente' using errcode = 'P0001';
  end if;

  if v_erro is null then
    update private.fonte_legal set ultima_coleta_em = now(), ultimo_erro = null where codigo = v_fonte;
  else
    update private.fonte_legal set ultimo_erro = v_erro where codigo = v_fonte;
  end if;
end;
$$;

comment on function public.concluir_coleta(uuid, integer, text) is
  'Coleta: conclui (ou marca falha, erro até 500 caracteres) e atualiza a fonte. Só service role.';

-- ---------------------------------------------------------------------------
-- 3. Norma e versões
-- ---------------------------------------------------------------------------
-- Upsert pela chave (ou, se a chave não existe, pela fonte e id externo). Nunca troca a chave nem
-- a identidade da norma; só atualiza título, ementa, URL e situação na fonte quando mudaram.
-- Revogada não volta a vigente: a página das INs não marca a revogação que veio de portaria (IN 84).
create function public.garantir_norma(p_norma jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_chave text := p_norma ->> 'chave';
  v_fonte text := nullif(p_norma ->> 'fonte', '');
  v_id_externo text := nullif(p_norma ->> 'id_externo', '');
  v_situacao text := nullif(p_norma ->> 'situacao_na_fonte', '');
begin
  select n.id into v_id from private.norma as n where n.chave = v_chave for update;
  if not found and v_fonte is not null and v_id_externo is not null then
    select n.id into v_id
    from private.norma as n
    where n.fonte = v_fonte and n.id_externo = v_id_externo
    for update;
  end if;

  if v_id is null then
    insert into private.norma (chave, esfera, municipio_ibge, orgao, tipo, numero, ano, titulo, ementa,
                               url_oficial, fonte, id_externo, situacao_na_fonte)
    values (v_chave, p_norma ->> 'esfera', nullif(p_norma ->> 'municipio_ibge', ''), p_norma ->> 'orgao',
            p_norma ->> 'tipo', p_norma ->> 'numero', (nullif(p_norma ->> 'ano', ''))::integer,
            p_norma ->> 'titulo', p_norma ->> 'ementa', p_norma ->> 'url_oficial', v_fonte, v_id_externo,
            coalesce(v_situacao, 'vigente'))
    on conflict (chave) do nothing
    returning id into v_id;
    if v_id is null then
      -- Outra coleta inseriu a mesma chave ao mesmo tempo.
      select n.id into v_id from private.norma as n where n.chave = v_chave;
    end if;
    return v_id;
  end if;

  update private.norma as n
  set titulo = coalesce(p_norma ->> 'titulo', n.titulo),
      ementa = case when p_norma ? 'ementa' then p_norma ->> 'ementa' else n.ementa end,
      url_oficial = case when p_norma ? 'url_oficial' then p_norma ->> 'url_oficial' else n.url_oficial end,
      situacao_na_fonte = case when n.situacao_na_fonte = 'revogada' then 'revogada'
                               else coalesce(v_situacao, n.situacao_na_fonte) end
  where n.id = v_id
    and (n.titulo, n.ementa, n.url_oficial, n.situacao_na_fonte) is distinct from (
      coalesce(p_norma ->> 'titulo', n.titulo),
      case when p_norma ? 'ementa' then p_norma ->> 'ementa' else n.ementa end,
      case when p_norma ? 'url_oficial' then p_norma ->> 'url_oficial' else n.url_oficial end,
      case when n.situacao_na_fonte = 'revogada' then 'revogada'
           else coalesce(v_situacao, n.situacao_na_fonte) end
    );
  return v_id;
end;
$$;

comment on function public.garantir_norma(jsonb) is
  'Coleta: cria a norma ou atualiza título, ementa, URL e situação na fonte. Nunca troca a chave. Só service role.';

-- O que a coleta já conhece da fonte: a norma e a última versão (para comparar id externo e SHA-256).
create function public.versoes_conhecidas(p_fonte text)
returns table (
  norma_id uuid,
  chave text,
  id_externo text,
  situacao_na_fonte text,
  ultima_versao_id_externo text,
  ultimo_sha256 text,
  ultima_versao_numero integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.chave, n.id_externo, n.situacao_na_fonte, v.id_externo, v.sha256, v.numero
  from private.norma as n
  left join lateral (
    select x.id_externo, x.sha256, x.numero
    from private.norma_versao as x
    where x.norma_id = n.id
    order by x.numero desc
    limit 1
  ) as v on true
  where n.fonte = p_fonte
  order by n.chave
$$;

comment on function public.versoes_conhecidas(text) is
  'Coleta: normas da fonte com a última versão (id externo, SHA-256 e número). Só service role.';

create function public.texto_da_ultima_versao(p_norma_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select v.texto
  from private.norma_versao as v
  where v.norma_id = p_norma_id
  order by v.numero desc
  limit 1
$$;

comment on function public.texto_da_ultima_versao(uuid) is
  'Coleta: texto extraído da última versão, para calcular a diferença. Só service role.';

-- Versão nova (SHA-256 novo) e a mudança que ela gera. Idempotente: o mesmo arquivo devolve a
-- versão existente sem mudança.
create function public.registrar_versao_de_norma(
  p_coleta_id uuid,
  p_norma_id uuid,
  p_versao jsonb,
  p_diferenca jsonb default null,
  p_ato_novo boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fonte text;
  v_sha256 text := p_versao ->> 'sha256';
  v_publicada_em text := nullif(p_versao ->> 'publicada_em', '');
  v_versao_id uuid;
  v_anterior_id uuid;
  v_numero integer;
  v_mudanca_id uuid;
begin
  select c.fonte into v_fonte from private.coleta as c where c.id = p_coleta_id;
  if not found then
    raise exception 'coleta_inexistente' using errcode = 'P0001';
  end if;

  -- Trava a norma: duas coletas da mesma norma não disputam o número da versão.
  perform 1 from private.norma as n where n.id = p_norma_id for update;
  if not found then
    raise exception 'norma_inexistente' using errcode = 'P0001';
  end if;

  if v_publicada_em is not null and v_publicada_em !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'publicada_em_invalida' using errcode = 'P0001';
  end if;

  select v.id into v_versao_id
  from private.norma_versao as v
  where v.norma_id = p_norma_id and v.sha256 = v_sha256;
  if found then
    return jsonb_build_object('versao_id', v_versao_id, 'versao_nova', false, 'mudanca_id', null);
  end if;

  select v.id, v.numero into v_anterior_id, v_numero
  from private.norma_versao as v
  where v.norma_id = p_norma_id
  order by v.numero desc
  limit 1;

  insert into private.norma_versao (norma_id, numero, publicada_em, publicada_em_texto, coleta_id,
                                    id_externo, sha256, objeto, mime, tamanho, texto)
  values (p_norma_id, coalesce(v_numero, 0) + 1, v_publicada_em::date, p_versao ->> 'publicada_em_texto',
          p_coleta_id, p_versao ->> 'id_externo', v_sha256, p_versao ->> 'objeto', p_versao ->> 'mime',
          (nullif(p_versao ->> 'tamanho', ''))::bigint, p_versao ->> 'texto')
  on conflict do nothing
  returning id into v_versao_id;
  if v_versao_id is null then
    select v.id into v_versao_id
    from private.norma_versao as v
    where v.norma_id = p_norma_id and v.sha256 = v_sha256;
    return jsonb_build_object('versao_id', v_versao_id, 'versao_nova', false, 'mudanca_id', null);
  end if;

  if v_anterior_id is not null then
    insert into private.norma_mudanca (norma_id, versao_anterior_id, versao_nova_id, tipo, diferenca)
    values (p_norma_id, v_anterior_id, v_versao_id, 'alterada', coalesce(p_diferenca, '{}'::jsonb))
    on conflict do nothing
    returning id into v_mudanca_id;
  elsif coalesce(p_ato_novo, false) and exists (
    select 1 from private.coleta as c
    where c.fonte = v_fonte and c.situacao = 'concluida' and c.id <> p_coleta_id
  ) then
    insert into private.norma_mudanca (norma_id, versao_nova_id, tipo, diferenca)
    values (p_norma_id, v_versao_id, 'nova', coalesce(p_diferenca, '{}'::jsonb))
    on conflict do nothing
    returning id into v_mudanca_id;
  end if;
  -- Senão é a versão-base: sem mudança (regra 4 do ADR-0050).

  return jsonb_build_object('versao_id', v_versao_id, 'versao_nova', true, 'mudanca_id', v_mudanca_id);
end;
$$;

comment on function public.registrar_versao_de_norma(uuid, uuid, jsonb, jsonb, boolean) is
  'Coleta: grava a versão se o SHA-256 é novo e a mudança (alterada, ou nova para ato novo depois da primeira coleta concluída). Só service role.';

-- Revogação publicada pela fonte (portaria do IMA). Marca a norma e cria a mudança 'revogada'.
-- Se a norma já estava revogada pelo mesmo ato, devolve a mudança existente (nula quando a
-- revogação veio da carga inicial, como a IN 84).
create function public.registrar_revogacao(
  p_coleta_id uuid,
  p_chave_revogada text,
  p_chave_ato text,
  p_revogada_em date
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_norma_id uuid;
  v_situacao text;
  v_revogada_por uuid;
  v_ato_id uuid;
  v_anterior_id uuid;
  v_mudanca_id uuid;
begin
  perform 1 from private.coleta as c where c.id = p_coleta_id;
  if not found then
    raise exception 'coleta_inexistente' using errcode = 'P0001';
  end if;

  select n.id, n.situacao_na_fonte, n.revogada_por into v_norma_id, v_situacao, v_revogada_por
  from private.norma as n
  where n.chave = p_chave_revogada
  for update;
  if not found then
    raise exception 'norma_inexistente' using errcode = 'P0001';
  end if;

  select n.id into v_ato_id from private.norma as n where n.chave = p_chave_ato;

  if v_situacao = 'revogada' and v_revogada_por is not distinct from v_ato_id then
    select m.id into v_mudanca_id
    from private.norma_mudanca as m
    where m.norma_id = v_norma_id and m.tipo = 'revogada' and m.ato_id is not distinct from v_ato_id;
    return v_mudanca_id;
  end if;

  update private.norma as n
  set situacao_na_fonte = 'revogada',
      revogada_em = coalesce(p_revogada_em, n.revogada_em),
      revogada_por = v_ato_id
  where n.id = v_norma_id;

  select v.id into v_anterior_id
  from private.norma_versao as v
  where v.norma_id = v_norma_id
  order by v.numero desc
  limit 1;

  insert into private.norma_mudanca (norma_id, versao_anterior_id, ato_id, tipo)
  values (v_norma_id, v_anterior_id, v_ato_id, 'revogada')
  on conflict do nothing
  returning id into v_mudanca_id;
  if v_mudanca_id is null then
    select m.id into v_mudanca_id
    from private.norma_mudanca as m
    where m.norma_id = v_norma_id and m.tipo = 'revogada' and m.versao_nova_id is null
      and m.ato_id is not distinct from v_ato_id;
  end if;
  return v_mudanca_id;
end;
$$;

comment on function public.registrar_revogacao(uuid, text, text, date) is
  'Coleta: marca a norma revogada pelo ato e cria a mudança revogada (idempotente). Só service role.';

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.iniciar_coleta(text, text, boolean)',
    'public.concluir_coleta(uuid, integer, text)',
    'public.garantir_norma(jsonb)',
    'public.versoes_conhecidas(text)',
    'public.texto_da_ultima_versao(uuid)',
    'public.registrar_versao_de_norma(uuid, uuid, jsonb, jsonb, boolean)',
    'public.registrar_revogacao(uuid, text, text, date)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Agendamento (pg_cron + pg_net), desligado até a publicação
-- ---------------------------------------------------------------------------
-- Ligar agenda um job diário por fonte (dias úteis, fora do minuto redondo, em UTC) que chama a
-- Edge Function coletar-normas com a URL e o token do Vault, e liga a fonte. Desligar remove o job
-- e desliga a fonte. Sem pg_cron e pg_net (banco local, CI) só avisam. Nomes de schema vêm do
-- catálogo e as chamadas são dinâmicas: o plpgsql_check do CI falharia com cron./net. fixos.
create function private.ligar_coleta_de_normas(p_fontes text[] default array['ima_in', 'ima_portaria', 'consema'])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cron text;
  v_net text;
  v_fonte text;
  v_horario text;
  v_url text;
  v_token text;
  v_comando text;
begin
  select n.nspname into v_cron
  from pg_catalog.pg_extension as e
  join pg_catalog.pg_namespace as n on n.oid = e.extnamespace
  where e.extname = 'pg_cron';
  select n.nspname into v_net
  from pg_catalog.pg_extension as e
  join pg_catalog.pg_namespace as n on n.oid = e.extnamespace
  where e.extname = 'pg_net';
  if v_cron is null or v_net is null then
    raise notice 'coleta de normas: sem pg_cron e pg_net, nada foi agendado';
    return;
  end if;

  if to_regclass('vault.decrypted_secrets') is not null then
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1'
      into v_url using 'coleta_normas_url';
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1'
      into v_token using 'coleta_normas_token';
  end if;
  if v_url is null or v_token is null then
    raise exception 'segredos_da_coleta_ausentes' using errcode = 'P0001';
  end if;

  foreach v_fonte in array coalesce(p_fontes, '{}'::text[])
  loop
    v_horario := case v_fonte
      when 'ima_in' then '17 10 * * 1-5'
      when 'ima_portaria' then '23 10 * * 1-5'
      when 'consema' then '29 10 * * 1-5'
    end;
    if v_horario is null or not exists (select 1 from private.fonte_legal as f where f.codigo = v_fonte) then
      raise exception 'fonte_sem_coletor' using errcode = 'P0001';
    end if;

    -- O job lê os segredos do Vault a cada execução: trocar o token não exige reagendar.
    v_comando := format(
      $cmd$select %1$I.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name = 'coleta_normas_url'),
  body := %2$L::jsonb,
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'coleta_normas_token')
  )
)$cmd$,
      v_net, jsonb_build_object('fonte', v_fonte)::text);

    execute format('select %I.schedule($1, $2, $3)', v_cron)
      using 'coleta-normas-' || v_fonte, v_horario, v_comando;
    update private.fonte_legal set ativa = true where codigo = v_fonte;
  end loop;
end;
$$;

comment on function private.ligar_coleta_de_normas(text[]) is
  'Agenda a coleta diária das fontes (pg_cron + pg_net) e liga as fontes. Só o dono; nenhuma migration chama.';

create function private.desligar_coleta_de_normas(p_fontes text[] default array['ima_in', 'ima_portaria', 'consema'])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cron text;
  v_net text;
  v_fonte text;
  v_existe boolean;
begin
  select n.nspname into v_cron
  from pg_catalog.pg_extension as e
  join pg_catalog.pg_namespace as n on n.oid = e.extnamespace
  where e.extname = 'pg_cron';
  select n.nspname into v_net
  from pg_catalog.pg_extension as e
  join pg_catalog.pg_namespace as n on n.oid = e.extnamespace
  where e.extname = 'pg_net';
  if v_cron is null or v_net is null then
    raise notice 'coleta de normas: sem pg_cron e pg_net, nada foi desagendado';
    return;
  end if;

  foreach v_fonte in array coalesce(p_fontes, '{}'::text[])
  loop
    execute format('select exists (select 1 from %I.job where jobname = $1)', v_cron)
      into v_existe using 'coleta-normas-' || v_fonte;
    if v_existe then
      execute format('select %I.unschedule($1)', v_cron) using 'coleta-normas-' || v_fonte;
    end if;
    update private.fonte_legal set ativa = false where codigo = v_fonte;
  end loop;
end;
$$;

comment on function private.desligar_coleta_de_normas(text[]) is
  'Remove os jobs de coleta das fontes (ignora job inexistente) e desliga as fontes. Só o dono.';

revoke all on function private.ligar_coleta_de_normas(text[]) from public, anon, authenticated, service_role;
revoke all on function private.desligar_coleta_de_normas(text[]) from public, anon, authenticated, service_role;
