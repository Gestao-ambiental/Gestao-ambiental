-- Coleta federal (L8, ADR-0050, LEG-02): leis federais vigiadas pela fonte planalto, com o caminho
-- da página como id externo e as duas competências; o agendamento aceita inlabs e planalto e
-- continua desligado; ciga segue sem coletor (L9).
begin;

select plan(8);

select is(
  (select count(*)::integer from private.norma as n where n.fonte = 'planalto'),
  6,
  'seis leis federais vigiadas pela fonte planalto'
);

select ok(
  (select bool_and(n.id_externo ~ '^ccivil_03/[\w./-]+\.htm$' and n.url_oficial = 'https://www.planalto.gov.br/' || n.id_externo
                   and n.esfera = 'federal' and n.chave like 'br;federal;%')
   from private.norma as n where n.fonte = 'planalto'),
  'id externo é o caminho da página, a URL bate com ele e a chave é federal'
);

select is(
  (select count(*)::integer from private.norma_criterio as c
   join private.norma as n on n.id = c.norma_id
   where n.fonte = 'planalto' and c.tipo = 'competencia'),
  12,
  'cada lei federal vale para as duas competências'
);

select lives_ok(
  $$select private.ligar_coleta_de_normas(array['inlabs', 'planalto'])$$,
  'ligar aceita inlabs e planalto (sem pg_cron só avisa)'
);

select lives_ok(
  $$select private.desligar_coleta_de_normas(array['inlabs', 'planalto'])$$,
  'desligar aceita as fontes federais'
);

select throws_ok(
  $$select private.ligar_coleta_de_normas(array['ciga'])$$,
  'P0001', 'fonte_sem_coletor',
  'ciga continua sem coletor'
);

select is(
  (select count(*)::integer from private.fonte_legal as f where f.ativa),
  0,
  'nenhuma fonte foi ligada'
);

select ok(
  not has_function_privilege('service_role', 'private.ligar_coleta_de_normas(text[])', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.ligar_coleta_de_normas(text[])', 'EXECUTE'),
  'só o dono liga a coleta'
);

select * from finish();
rollback;
