-- Coleta dos diários municipais pelos dados abertos do CIGA (pacote L9, ADR-0050, LEG-02). Só
-- aditiva.
--
-- - public.municipios_vigiados (service role): municípios (IBGE e nome) das unidades com município
--   gravado (L3). A coleta do CIGA só olha esses: o JSON do DOM-SC traz o nome do município.
-- - private.ligar_coleta_de_normas aceita ciga, três vezes por dia (03h50, 15h50 e 19h50 UTC, depois
--   de cada janela postada pelo CIGA). Continua sem ser chamada: o Eduardo pede o aceite do CIGA antes
--   (docs/contatos-com-orgaos.md).

create function public.municipios_vigiados()
returns table (ibge text, nome text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (u.municipio_ibge) u.municipio_ibge, u.municipio_nome
  from public.unidade as u
  where u.municipio_ibge is not null and u.municipio_nome is not null
  order by u.municipio_ibge, u.municipio_gravado_em desc
$$;

comment on function public.municipios_vigiados() is
  'Municípios com unidade cadastrada (código IBGE e nome), para a coleta do CIGA. Só a service role.';

revoke all on function public.municipios_vigiados() from public, anon, authenticated;
grant execute on function public.municipios_vigiados() to service_role;

-- Agendamento com a fonte ciga (mesmo corpo do L8, com ciga no mapa).
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
  -- Um job por fonte; o do doe_sc roda duas vezes por dia com uma expressão só. inlabs nos dias
  -- úteis (o DOU não sai no fim de semana) e planalto todo dia (pedido condicional, quase sempre 304).
  v_horarios constant jsonb := jsonb_build_object(
    'ima_in', '17 10 * * 1-5',
    'ima_portaria', '23 10 * * 1-5',
    'consema', '29 10 * * 1-5',
    'doe_sc', '41 11,23 * * 1-5',
    'alesc', '47 10 * * 1-5',
    'joinville_doem', '53 10 * * 1-5',
    'inlabs', '13 10 * * 1-5',
    'planalto', '19 11 * * *',
    'ciga', '50 3,15,19 * * *'
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
  'as do L2, as federais (L8) e a ciga (L9) só quando pedidas. Só o dono; nenhuma migration chama.';

revoke all on function private.ligar_coleta_de_normas(text[]) from public, anon, authenticated, service_role;
