-- Coleta federal (pacote L8, ADR-0050, LEG-02): DOU pelo INLABS e leis e decretos compilados no
-- Planalto. Só aditiva.
--
-- - As leis federais vigiadas entram no catálogo com a fonte 'planalto' e o caminho da página como
--   id externo (o coletor monta a URL e faz o pedido condicional com o ETag da última versão).
-- - private.ligar_coleta_de_normas aceita inlabs (dias úteis, 10h13 UTC) e planalto (todo dia, 11h19
--   UTC). Mesma assinatura e o mesmo padrão de p_fontes do L1; continua sem ser chamada: o INLABS
--   precisa da conta (segredos INLABS_EMAIL e INLABS_SENHA na Edge Function) e o Eduardo avisa a
--   Imprensa Nacional antes (docs/contatos-com-orgaos.md).
-- - A fonte 'senado' fica sem coletor: o pedido condicional ao Planalto já diz quando a lei mudou.

-- ---------------------------------------------------------------------------
-- 1. Leis federais vigiadas
-- ---------------------------------------------------------------------------
insert into private.norma (chave, esfera, orgao, tipo, numero, ano, titulo, ementa, url_oficial, fonte,
                           id_externo, temas)
values
  ('br;federal;lei;6938;1981', 'federal', 'Presidência da República', 'lei', '6938', 1981,
   'Lei 6.938/1981 · Política Nacional do Meio Ambiente', null,
   'https://www.planalto.gov.br/ccivil_03/leis/l6938.htm', 'planalto', 'ccivil_03/leis/l6938.htm',
   '{procedimento}'),
  ('br;federal;lei;9605;1998', 'federal', 'Presidência da República', 'lei', '9605', 1998,
   'Lei 9.605/1998 · Crimes ambientais', null,
   'https://www.planalto.gov.br/ccivil_03/leis/l9605.htm', 'planalto', 'ccivil_03/leis/l9605.htm',
   '{procedimento}'),
  ('br;federal;lei;12651;2012', 'federal', 'Presidência da República', 'lei', '12651', 2012,
   'Lei 12.651/2012 · Código Florestal', null,
   'https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2012/lei/l12651.htm', 'planalto',
   'ccivil_03/_ato2011-2014/2012/lei/l12651.htm', '{app,supressao}'),
  ('br;federal;lei_complementar;140;2011', 'federal', 'Presidência da República', 'lei_complementar',
   '140', 2011, 'Lei Complementar 140/2011 · Competências ambientais', null,
   'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp140.htm', 'planalto', 'ccivil_03/leis/lcp/lcp140.htm',
   '{procedimento}'),
  ('br;federal;decreto;6514;2008', 'federal', 'Presidência da República', 'decreto', '6514', 2008,
   'Decreto 6.514/2008 · Infrações e sanções ambientais', null,
   'https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2008/decreto/d6514.htm', 'planalto',
   'ccivil_03/_ato2007-2010/2008/decreto/d6514.htm', '{procedimento}'),
  ('br;federal;lei;15190;2025', 'federal', 'Presidência da República', 'lei', '15190', 2025,
   'Lei 15.190/2025 · Lei Geral do Licenciamento Ambiental', null,
   'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15190.htm', 'planalto',
   'ccivil_03/_ato2023-2026/2025/lei/l15190.htm', '{procedimento}')
on conflict (chave) do nothing;

-- Valem para todo empreendimento licenciado, pelo IMA ou pelo município.
insert into private.norma_criterio (norma_id, tipo, valor, origem)
select n.id, 'competencia', c.valor, 'curadoria'
from private.norma as n
cross join (values ('estadual'), ('municipal')) as c (valor)
where n.chave in ('br;federal;lei;6938;1981', 'br;federal;lei;9605;1998', 'br;federal;lei;12651;2012',
                  'br;federal;lei_complementar;140;2011', 'br;federal;decreto;6514;2008',
                  'br;federal;lei;15190;2025')
on conflict on constraint norma_criterio_key do nothing;

-- ---------------------------------------------------------------------------
-- 2. Agendamento com as fontes federais (mesmo corpo do L2, com inlabs e planalto no mapa)
-- ---------------------------------------------------------------------------
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
    'planalto', '19 11 * * *'
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
  'as do L2 (doe_sc, alesc, joinville_doem) e as federais (inlabs, planalto) só quando pedidas. Só o '
  'dono; nenhuma migration chama.';

revoke all on function private.ligar_coleta_de_normas(text[]) from public, anon, authenticated, service_role;
