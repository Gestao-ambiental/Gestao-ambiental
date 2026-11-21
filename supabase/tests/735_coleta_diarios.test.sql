-- Coleta dos diários de SC e de Joinville (L2, ADR-0050, LEG-02 e LEG-03): o agendamento aceita
-- doe_sc, alesc e joinville_doem; fonte sem coletor continua recusada (antes de olhar o pg_cron);
-- sem pg_cron ligar e desligar só avisam; o padrão segue com as três fontes do L1; as leis da ALESC
-- da carga ficam ligadas à fonte alesc; nenhuma fonte foi ligada. Ligar e desligar são chamados
-- como o dono, como no 733.
begin;

select plan(15);

-- ---------------------------------------------------------------------------
-- Estado depois das migrations
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from private.fonte_legal where ativa),
  0::bigint,
  'nenhuma fonte foi ligada pelas migrations'
);

select results_eq(
  $$select chave, fonte, id_externo from private.norma
    where chave in ('sc;alesc;lei;14675;2009', 'sc;alesc;lei;14262;2007') order by chave$$,
  $$values ('sc;alesc;lei;14262;2007'::text, 'alesc'::text, null::text),
           ('sc;alesc;lei;14675;2009'::text, 'alesc'::text, '16618'::text)$$,
  'Lei 14.675/2009 na fonte alesc com o id 16618; Lei 14.262/2007 na fonte alesc sem id externo'
);

select is(
  (select count(*) from private.norma where fonte = 'alesc'),
  2::bigint,
  'só as duas leis da carga estão na fonte alesc'
);

-- ---------------------------------------------------------------------------
-- Estrutura: mesma assinatura, mesmo padrão e só o dono executa
-- ---------------------------------------------------------------------------
select is(
  pg_catalog.pg_get_function_arguments('private.ligar_coleta_de_normas(text[])'::regprocedure),
  $$p_fontes text[] DEFAULT ARRAY['ima_in'::text, 'ima_portaria'::text, 'consema'::text]$$,
  'ligar continua com o padrão só das três fontes do L1'
);

select is(
  pg_catalog.pg_get_function_arguments('private.desligar_coleta_de_normas(text[])'::regprocedure),
  $$p_fontes text[] DEFAULT ARRAY['ima_in'::text, 'ima_portaria'::text, 'consema'::text]$$,
  'desligar continua com o padrão só das três fontes do L1'
);

select ok(
  (select bool_and(not has_function_privilege(r, f, 'execute'))
   from unnest(array['private.ligar_coleta_de_normas(text[])', 'private.desligar_coleta_de_normas(text[])']) as f
   cross join unnest(array['anon', 'authenticated', 'service_role']) as r),
  'ligar e desligar a coleta: só o dono executa'
);

select ok(
  (select bool_and(strpos(pg_catalog.pg_get_functiondef('private.ligar_coleta_de_normas(text[])'::regprocedure), h) > 0)
   from unnest(array['41 11,23 * * 1-5', '47 10 * * 1-5', '53 10 * * 1-5']) as h),
  'ligar tem os horários do doe_sc (dois por dia), da alesc e do joinville_doem'
);

-- ---------------------------------------------------------------------------
-- Sem pg_cron e pg_net: as fontes novas são aceitas e nada muda
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select private.ligar_coleta_de_normas(array['doe_sc', 'alesc', 'joinville_doem'])$$,
  'ligar as fontes do L2 sem pg_cron não falha nem dá fonte_sem_coletor'
);

select lives_ok(
  $$select private.ligar_coleta_de_normas(array['ima_in', 'ima_portaria', 'consema', 'doe_sc', 'alesc', 'joinville_doem'])$$,
  'ligar as seis fontes com coletor juntas não falha'
);

select lives_ok(
  $$select private.ligar_coleta_de_normas()$$,
  'ligar com o padrão continua sem falhar'
);

select lives_ok(
  $$select private.desligar_coleta_de_normas(array['doe_sc', 'alesc', 'joinville_doem'])$$,
  'desligar as fontes do L2 sem pg_cron não falha'
);

select is(
  (select count(*) from private.fonte_legal where ativa),
  0::bigint,
  'ligar e desligar sem pg_cron não ligam nenhuma fonte'
);

-- ---------------------------------------------------------------------------
-- Fonte sem coletor continua recusada
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select private.ligar_coleta_de_normas(array['nao_existe'])$$,
  'P0001', 'fonte_sem_coletor',
  'fonte desconhecida dá fonte_sem_coletor'
);

select throws_ok(
  $$select private.ligar_coleta_de_normas(array['ciga'])$$,
  'P0001', 'fonte_sem_coletor',
  'fonte do catálogo ainda sem coletor (ciga) dá fonte_sem_coletor'
);

select throws_ok(
  $$select private.ligar_coleta_de_normas(array['doe_sc', 'nao_existe'])$$,
  'P0001', 'fonte_sem_coletor',
  'uma fonte desconhecida na lista recusa a lista inteira'
);

select * from finish();

rollback;
