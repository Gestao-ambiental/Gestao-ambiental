-- Coleta dos diários de SC e de Joinville (pacote L2, ADR-0050, LEG-02 e LEG-03): DOE-SC, ALESC e
-- DOEM de Joinville.
--
-- Só aditiva. As três fontes ganham coletor na Edge Function coletar-normas; aqui o agendamento as
-- aceita e a carga inicial liga as duas leis da ALESC à fonte.
--
-- Regras daqui:
-- - private.ligar_coleta_de_normas e private.desligar_coleta_de_normas mantêm a assinatura e o
--   padrão de p_fontes do L1 (só as três fontes do L1): ligar as do L2 é escolha explícita.
-- - Horários em UTC, dias úteis, fora do minuto redondo: doe_sc às 11h41 e 23h41 (8h41 e 20h41 de
--   Brasília, para pegar as edições extras; uma expressão só, um job só), alesc às 10h47 e
--   joinville_doem às 10h53.
-- - A fonte é conferida antes de olhar o pg_cron: fonte sem coletor dá 'fonte_sem_coletor' mesmo
--   sem pg_cron, e nada é agendado quando uma das fontes da lista é desconhecida.
--
-- O pg_cron continua desligado: nenhuma migration chama ligar (regra 7 do ADR-0050).

-- ---------------------------------------------------------------------------
-- 1. Agendamento com as fontes do L2
-- ---------------------------------------------------------------------------
-- Mesma assinatura e mesmo retorno: create or replace mantém os grants (o revoke abaixo reforça).
create or replace function private.ligar_coleta_de_normas(
  p_fontes text[] default array['ima_in', 'ima_portaria', 'consema']
)
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
  -- Um job por fonte; o do doe_sc roda duas vezes por dia com uma expressão só.
  v_horarios constant jsonb := jsonb_build_object(
    'ima_in', '17 10 * * 1-5',
    'ima_portaria', '23 10 * * 1-5',
    'consema', '29 10 * * 1-5',
    'doe_sc', '41 11,23 * * 1-5',
    'alesc', '47 10 * * 1-5',
    'joinville_doem', '53 10 * * 1-5'
  );
begin
  foreach v_fonte in array coalesce(p_fontes, '{}'::text[])
  loop
    if v_horarios ->> v_fonte is null
       or not exists (select 1 from private.fonte_legal as f where f.codigo = v_fonte) then
      raise exception 'fonte_sem_coletor' using errcode = 'P0001';
    end if;
  end loop;

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
    v_horario := v_horarios ->> v_fonte;

    -- O job lê os segredos do Vault a cada execução: trocar o token não exige reagendar.
    -- A janela leva a hora de Brasília (aaaa-mm-ddTHH): o DOE-SC roda duas vezes no dia e a
    -- segunda execução não pode voltar "ignorada" pela coleta da manhã.
    v_comando := format(
      $cmd$select %1$I.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name = 'coleta_normas_url'),
  body := %2$L::jsonb || jsonb_build_object(
    'janela', to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24')),
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
  'Agenda a coleta das fontes com coletor (pg_cron + pg_net) e liga as fontes. Padrão: as três do L1; '
  'doe_sc, alesc e joinville_doem só quando pedidas. Só o dono; nenhuma migration chama.';

create or replace function private.desligar_coleta_de_normas(
  p_fontes text[] default array['ima_in', 'ima_portaria', 'consema']
)
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
  'Remove os jobs de coleta das fontes, do L1 e do L2 (ignora job inexistente), e desliga as fontes. '
  'Só o dono.';

revoke all on function private.ligar_coleta_de_normas(text[]) from public, anon, authenticated, service_role;
revoke all on function private.desligar_coleta_de_normas(text[]) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Leis da carga inicial ligadas à fonte alesc
-- ---------------------------------------------------------------------------
-- A Lei 14.675/2009 já tem o id do ato na ALESC (16618, o da url_oficial); a 14.262/2007 fica sem
-- id externo e o coletor o acha pela busca. Só mexe em quem ainda está sem fonte (idempotente).
update private.norma
set fonte = 'alesc', id_externo = '16618'
where chave = 'sc;alesc;lei;14675;2009'
  and fonte is null;

update private.norma
set fonte = 'alesc', id_externo = null
where chave = 'sc;alesc;lei;14262;2007'
  and fonte is null;
