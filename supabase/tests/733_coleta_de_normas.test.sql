-- Coleta de normas (L1, ADR-0050, LEG-02 e LEG-03): RPCs da coleta só para a service role,
-- coleta idempotente por janela, versão-base sem mudança, mudança alterada/nova/revogada sem
-- duplicar, revogação da IN 84 (carga) idempotente, agendamento sem pg_cron só avisa, bucket privado.
-- Usa a carga inicial (IN 2, 3, 4 e 84 e a Portaria IMA 096/2026). Os ids passam entre os passos
-- por set_config('teste.*'), que vale para qualquer papel.
begin;

select plan(77);

-- ---------------------------------------------------------------------------
-- Estrutura: security definer, search_path fixo e execute só para a service role
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from pg_catalog.pg_proc as p
   join pg_catalog.pg_namespace as s on s.oid = p.pronamespace
   where s.nspname = 'public'
     and p.proname in ('iniciar_coleta', 'concluir_coleta', 'garantir_norma', 'versoes_conhecidas',
                       'texto_da_ultima_versao', 'registrar_versao_de_norma', 'registrar_revogacao')
     and p.prosecdef
     and 'search_path=""' = any (p.proconfig)),
  7::bigint,
  'as sete RPCs da coleta são security definer com search_path vazio'
);

select ok(
  (select bool_and(has_function_privilege('service_role', f, 'execute'))
   from unnest(array[
     'public.iniciar_coleta(text, text, boolean)', 'public.concluir_coleta(uuid, integer, text)',
     'public.garantir_norma(jsonb)', 'public.versoes_conhecidas(text)', 'public.texto_da_ultima_versao(uuid)',
     'public.registrar_versao_de_norma(uuid, uuid, jsonb, jsonb, boolean)',
     'public.registrar_revogacao(uuid, text, text, date)'
   ]) as f),
  'service_role executa as sete RPCs da coleta'
);

select ok(
  (select bool_and(not has_function_privilege(r, f, 'execute'))
   from unnest(array[
     'public.iniciar_coleta(text, text, boolean)', 'public.concluir_coleta(uuid, integer, text)',
     'public.garantir_norma(jsonb)', 'public.versoes_conhecidas(text)', 'public.texto_da_ultima_versao(uuid)',
     'public.registrar_versao_de_norma(uuid, uuid, jsonb, jsonb, boolean)',
     'public.registrar_revogacao(uuid, text, text, date)'
   ]) as f
   cross join unnest(array['anon', 'authenticated']) as r),
  'anon e authenticated não executam nenhuma RPC da coleta'
);

select ok(
  (select bool_and(not has_function_privilege(r, f, 'execute'))
   from unnest(array['private.ligar_coleta_de_normas(text[])', 'private.desligar_coleta_de_normas(text[])']) as f
   cross join unnest(array['anon', 'authenticated', 'service_role']) as r),
  'ligar e desligar a coleta: só o dono executa'
);

select results_eq(
  $$select public from storage.buckets where id = 'normas'$$,
  $$values (false)$$,
  'bucket normas existe e é privado'
);

select is(
  (select count(*) from pg_catalog.pg_policies
   where schemaname = 'storage'
     and (coalesce(qual, '') like '%normas%' or coalesce(with_check, '') like '%normas%')),
  0::bigint,
  'nenhuma política do Storage abre o bucket normas'
);

-- ---------------------------------------------------------------------------
-- iniciar_coleta
-- ---------------------------------------------------------------------------
set local role service_role;

select throws_ok(
  $$select public.iniciar_coleta('nao_existe', '2026-11-21')$$,
  'P0001', 'fonte_inexistente',
  'fonte inexistente é recusada'
);

select throws_ok(
  $$select public.iniciar_coleta('ima_in', '2026-11-21')$$,
  'P0001', 'fonte_desligada',
  'fonte desligada não coleta sem forçar'
);

select isnt(
  set_config('teste.c1', public.iniciar_coleta('ima_in', '2026-11-21', true)::text, true),
  null,
  'forçar abre a coleta da fonte desligada'
);

select is(
  public.iniciar_coleta('ima_in', '2026-11-21', true),
  null::uuid,
  'a mesma janela em andamento há menos de 30 minutos devolve nulo'
);

reset role;
update private.coleta set iniciada_em = now() - interval '31 minutes'
where id = current_setting('teste.c1')::uuid;
set local role service_role;

select is(
  public.iniciar_coleta('ima_in', '2026-11-21', true),
  current_setting('teste.c1')::uuid,
  'coleta presa há 30 minutos ou mais volta com o mesmo id'
);

reset role;

select results_eq(
  $$select situacao, iniciada_em = now(), concluida_em is null from private.coleta
    where id = current_setting('teste.c1')::uuid$$,
  $$values ('em_andamento'::text, true, true)$$,
  'coleta presa recomeça em andamento com iniciada_em de agora'
);

select is(
  (select count(*) from private.coleta where fonte = 'ima_in' and janela = '2026-11-21'),
  1::bigint,
  'repetir a janela não cria outra coleta'
);

update private.fonte_legal set ativa = true where codigo = 'consema';
set local role service_role;

select isnt(
  set_config('teste.cc', public.iniciar_coleta('consema', '2026-11-21')::text, true),
  null,
  'fonte ativa coleta sem forçar'
);

select lives_ok(
  $$select public.concluir_coleta(current_setting('teste.cc')::uuid, 0, repeat('x', 600))$$,
  'concluir com erro marca a falha'
);

reset role;

select results_eq(
  $$select c.situacao, length(c.erro), c.concluida_em is not null, length(f.ultimo_erro), f.ultima_coleta_em
    from private.coleta as c join private.fonte_legal as f on f.codigo = c.fonte
    where c.id = current_setting('teste.cc')::uuid$$,
  $$values ('falhou'::text, 500, true, 500, null::timestamptz)$$,
  'falha: coleta falhou com erro de até 500 caracteres; a fonte guarda o erro e não a data'
);

set local role service_role;

select is(
  public.iniciar_coleta('consema', '2026-11-21'),
  current_setting('teste.cc')::uuid,
  'coleta que falhou volta com o mesmo id'
);

reset role;

select results_eq(
  $$select situacao, erro, concluida_em from private.coleta where id = current_setting('teste.cc')::uuid$$,
  $$values ('em_andamento'::text, null::text, null::timestamptz)$$,
  'coleta que falhou volta a em andamento sem erro nem conclusão'
);

set local role service_role;

select lives_ok(
  $$select public.concluir_coleta(current_setting('teste.cc')::uuid, 3)$$,
  'concluir sem erro'
);

reset role;

select results_eq(
  $$select c.situacao, c.itens_novos, c.erro, f.ultima_coleta_em = now(), f.ultimo_erro
    from private.coleta as c join private.fonte_legal as f on f.codigo = c.fonte
    where c.id = current_setting('teste.cc')::uuid$$,
  $$values ('concluida'::text, 3, null::text, true, null::text)$$,
  'sucesso: coleta concluída com os itens; a fonte ganha a data e perde o erro'
);

set local role service_role;

select is(
  public.iniciar_coleta('consema', '2026-11-21'),
  null::uuid,
  'janela já concluída devolve nulo'
);

select throws_ok(
  $$select public.concluir_coleta('73300000-0000-4000-8000-0000000000ff', 0)$$,
  'P0001', 'coleta_inexistente',
  'concluir coleta inexistente é recusado'
);

-- ---------------------------------------------------------------------------
-- garantir_norma
-- ---------------------------------------------------------------------------
select isnt(
  set_config('teste.n901', public.garantir_norma(
    '{"chave": "sc;ima;instrucao_normativa;901", "esfera": "estadual", "orgao": "IMA",
      "tipo": "instrucao_normativa", "numero": "901", "titulo": "IN 901 · Teste de coleta",
      "url_oficial": "https://in.ima.sc.gov.br/instrucaoNormativa/visualizar/901",
      "fonte": "ima_in", "id_externo": "901"}'::jsonb)::text, true),
  null,
  'garantir_norma cria a norma nova'
);

select is(
  public.garantir_norma(
    '{"chave": "sc;ima;instrucao_normativa;901", "esfera": "estadual", "orgao": "IMA",
      "tipo": "instrucao_normativa", "numero": "901", "titulo": "IN 901 · Teste de coleta",
      "url_oficial": "https://in.ima.sc.gov.br/instrucaoNormativa/visualizar/901",
      "fonte": "ima_in", "id_externo": "901"}'::jsonb),
  current_setting('teste.n901')::uuid,
  'a mesma norma de novo devolve o mesmo id'
);

select is(
  public.garantir_norma(
    '{"chave": "sc;ima;instrucao_normativa;901", "esfera": "estadual", "orgao": "IMA",
      "tipo": "instrucao_normativa", "numero": "999", "titulo": "IN 901 · Teste de coleta revisado",
      "ementa": "Ementa nova", "fonte": "ima_in", "id_externo": "901"}'::jsonb),
  current_setting('teste.n901')::uuid,
  'título novo atualiza a mesma norma'
);

select isnt(
  public.garantir_norma(
    '{"chave": "sc;consema;resolucao;250", "esfera": "estadual", "orgao": "CONSEMA", "tipo": "resolucao",
      "numero": "250", "titulo": "Resolução CONSEMA 250/2024", "fonte": "consema", "id_externo": "3480"}'::jsonb),
  null,
  'chave diferente com a mesma fonte e id externo acha a norma da carga'
);

select is(
  public.garantir_norma(
    '{"chave": "sc;ima;instrucao_normativa;84", "esfera": "estadual", "orgao": "IMA",
      "tipo": "instrucao_normativa", "numero": "84", "titulo": "IN 84 · Compensação de reserva legal",
      "fonte": "ima_in", "id_externo": "84", "situacao_na_fonte": "vigente"}'::jsonb) is not null,
  true,
  'garantir_norma da IN 84 como vigente (a página não marca) não falha'
);

select throws_ok(
  $$select public.garantir_norma(
    '{"chave": "sc;ima;instrucao_normativa;902", "esfera": "estadual", "orgao": "IMA",
      "tipo": "instrucao", "numero": "902", "titulo": "IN 902"}'::jsonb)$$,
  '23514', null,
  'tipo inválido é barrado pelo check da tabela'
);

reset role;

select results_eq(
  $$select chave, numero, titulo, ementa, url_oficial, situacao_na_fonte from private.norma
    where id = current_setting('teste.n901')::uuid$$,
  $$values ('sc;ima;instrucao_normativa;901'::text, '901'::text, 'IN 901 · Teste de coleta revisado'::text,
            'Ementa nova'::text, 'https://in.ima.sc.gov.br/instrucaoNormativa/visualizar/901'::text,
            'vigente'::text)$$,
  'atualização troca título e ementa, mantém chave, número e a URL não enviada'
);

select results_eq(
  $$select count(*), min(chave) from private.norma where fonte = 'consema' and id_externo = '3480'$$,
  $$values (1::bigint, 'sc;consema;resolucao;250;2024'::text)$$,
  'achar pela fonte e id externo não troca a chave nem duplica'
);

select results_eq(
  $$select n.situacao_na_fonte, n.revogada_em, n.revogada_por = p.id
    from private.norma as n, private.norma as p
    where n.chave = 'sc;ima;instrucao_normativa;84' and p.chave = 'sc;ima;portaria;96;2026'$$,
  $$values ('revogada'::text, '2026-04-14'::date, true)$$,
  'revogada não volta a vigente pela página das INs'
);

-- ---------------------------------------------------------------------------
-- versoes_conhecidas e registrar_versao_de_norma
-- ---------------------------------------------------------------------------
select set_config('teste.in2', (select id::text from private.norma where chave = 'sc;ima;instrucao_normativa;2'), true);
select set_config('teste.in3', (select id::text from private.norma where chave = 'sc;ima;instrucao_normativa;3'), true);

set local role service_role;

select results_eq(
  $$select count(*), count(ultimo_sha256) from public.versoes_conhecidas('ima_in')$$,
  $$values (83::bigint, 0::bigint)$$,
  'versoes_conhecidas: as 82 INs da carga e a nova, ainda sem versão'
);

select is(
  (select count(*) from public.versoes_conhecidas('nao_existe')),
  0::bigint,
  'versoes_conhecidas de fonte sem normas é vazio'
);

select results_eq(
  $$select (r ->> 'versao_nova')::boolean, r ->> 'mudanca_id'
    from (select public.registrar_versao_de_norma(
      current_setting('teste.c1')::uuid, current_setting('teste.in2')::uuid,
      jsonb_build_object('sha256', repeat('a', 64), 'id_externo', '344', 'publicada_em', '2021-03-01',
                         'publicada_em_texto', '01/03/2021', 'mime', 'application/pdf', 'tamanho', 1000,
                         'texto', 'texto v1'),
      null, true) as r) as x$$,
  $$values (true, null::text)$$,
  'primeira coleta: versão-base sem mudança, mesmo marcada como ato novo'
);

reset role;

select results_eq(
  $$select numero, coleta_id::text = current_setting('teste.c1'), publicada_em, publicada_em_texto, tamanho
    from private.norma_versao where norma_id = current_setting('teste.in2')::uuid$$,
  $$values (1, true, '2021-03-01'::date, '01/03/2021'::text, 1000::bigint)$$,
  'versão 1 gravada com a coleta, a data e o texto original da data'
);

select is(
  (select count(*) from private.norma_mudanca where norma_id = current_setting('teste.in2')::uuid),
  0::bigint,
  'versão-base não gera mudança'
);

select set_config('teste.v1', (select id::text from private.norma_versao
                               where norma_id = current_setting('teste.in2')::uuid and numero = 1), true);

set local role service_role;

select results_eq(
  $$select ultima_versao_id_externo, ultimo_sha256, ultima_versao_numero
    from public.versoes_conhecidas('ima_in') where chave = 'sc;ima;instrucao_normativa;2'$$,
  $$values ('344'::text, repeat('a', 64), 1)$$,
  'versoes_conhecidas traz a última versão'
);

select is(
  public.texto_da_ultima_versao(current_setting('teste.in2')::uuid),
  'texto v1',
  'texto_da_ultima_versao traz o texto da versão 1'
);

select is(
  public.texto_da_ultima_versao(current_setting('teste.n901')::uuid),
  null,
  'texto_da_ultima_versao de norma sem versão é nulo'
);

select is(
  public.registrar_versao_de_norma(
    current_setting('teste.c1')::uuid, current_setting('teste.in2')::uuid,
    jsonb_build_object('sha256', repeat('a', 64), 'texto', 'outro texto')),
  jsonb_build_object('versao_id', current_setting('teste.v1'), 'versao_nova', false, 'mudanca_id', null),
  'o mesmo SHA-256 devolve a versão existente, sem mudança'
);

select throws_ok(
  $$select public.registrar_versao_de_norma(
    current_setting('teste.c1')::uuid, current_setting('teste.in2')::uuid,
    jsonb_build_object('sha256', repeat('f', 64), 'publicada_em', '01/03/2021'))$$,
  'P0001', 'publicada_em_invalida',
  'publicada_em fora de aaaa-mm-dd é recusada'
);

select throws_ok(
  $$select public.registrar_versao_de_norma(
    '73300000-0000-4000-8000-0000000000ff', current_setting('teste.in2')::uuid,
    jsonb_build_object('sha256', repeat('f', 64)))$$,
  'P0001', 'coleta_inexistente',
  'coleta inexistente é recusada'
);

select throws_ok(
  $$select public.registrar_versao_de_norma(
    current_setting('teste.c1')::uuid, '73300000-0000-4000-8000-0000000000ff',
    jsonb_build_object('sha256', repeat('f', 64)))$$,
  'P0001', 'norma_inexistente',
  'norma inexistente é recusada'
);

select throws_ok(
  $$select public.registrar_versao_de_norma(
    current_setting('teste.c1')::uuid, current_setting('teste.in2')::uuid,
    jsonb_build_object('sha256', 'nao-e-sha'))$$,
  '23514', null,
  'SHA-256 fora do formato é barrado pelo check'
);

select lives_ok(
  $$select public.concluir_coleta(current_setting('teste.c1')::uuid, 1)$$,
  'primeira coleta das INs concluída'
);

select isnt(
  set_config('teste.c2', public.iniciar_coleta('ima_in', '2026-11-22', true)::text, true),
  null,
  'segunda coleta das INs aberta'
);

select ok(
  set_config('teste.r2', public.registrar_versao_de_norma(
    current_setting('teste.c2')::uuid, current_setting('teste.in2')::uuid,
    jsonb_build_object('sha256', repeat('b', 64), 'id_externo', '400', 'texto', 'texto v2'),
    '{"trechos": [{"antes": "texto v1", "depois": "texto v2"}]}'::jsonb)::text, true)::jsonb
  @> '{"versao_nova": true}'
  and current_setting('teste.r2')::jsonb ->> 'mudanca_id' is not null,
  'segunda versão (SHA-256 novo) devolve versão nova e mudança'
);

reset role;

select results_eq(
  $$select m.tipo, m.versao_anterior_id::text = current_setting('teste.v1'),
           m.versao_nova_id::text = current_setting('teste.r2')::jsonb ->> 'versao_id', m.diferenca, m.situacao
    from private.norma_mudanca as m where m.id = (current_setting('teste.r2')::jsonb ->> 'mudanca_id')::uuid$$,
  $$values ('alterada'::text, true, true, '{"trechos": [{"antes": "texto v1", "depois": "texto v2"}]}'::jsonb,
            'detectada'::text)$$,
  'mudança alterada liga a versão 1 à 2, com a diferença, para revisar'
);

select is(
  (select numero from private.norma_versao
   where id = (current_setting('teste.r2')::jsonb ->> 'versao_id')::uuid),
  2,
  'a nova versão é a número 2'
);

set local role service_role;

select is(
  public.texto_da_ultima_versao(current_setting('teste.in2')::uuid),
  'texto v2',
  'texto_da_ultima_versao passa a trazer a versão 2'
);

select is(
  public.registrar_versao_de_norma(
    current_setting('teste.c2')::uuid, current_setting('teste.in2')::uuid,
    jsonb_build_object('sha256', repeat('b', 64)), '{"x": 1}'::jsonb),
  jsonb_build_object('versao_id', current_setting('teste.r2')::jsonb ->> 'versao_id', 'versao_nova', false,
                     'mudanca_id', null),
  'repetir o SHA-256 da versão 2 não cria nada'
);

select ok(
  set_config('teste.r901', public.registrar_versao_de_norma(
    current_setting('teste.c2')::uuid, current_setting('teste.n901')::uuid,
    jsonb_build_object('sha256', repeat('c', 64), 'texto', 'IN nova'), null, true)::text, true)::jsonb
  ->> 'mudanca_id' is not null,
  'ato novo depois de uma coleta concluída gera mudança'
);

select is(
  public.registrar_versao_de_norma(
    current_setting('teste.c2')::uuid, current_setting('teste.n901')::uuid,
    jsonb_build_object('sha256', repeat('c', 64)), null, true) ->> 'versao_nova',
  'false',
  'repetir o ato novo devolve a versão existente'
);

select results_eq(
  $$select (r ->> 'versao_nova')::boolean, r ->> 'mudanca_id'
    from (select public.registrar_versao_de_norma(
      current_setting('teste.c2')::uuid, current_setting('teste.in3')::uuid,
      jsonb_build_object('sha256', repeat('d', 64), 'texto', 'IN 3 v1')) as r) as x$$,
  $$values (true, null::text)$$,
  'primeira versão de norma da carga, sem ato novo, é versão-base mesmo depois da primeira coleta'
);

reset role;

select results_eq(
  $$select tipo, versao_anterior_id, versao_nova_id::text = current_setting('teste.r901')::jsonb ->> 'versao_id'
    from private.norma_mudanca where norma_id = current_setting('teste.n901')::uuid$$,
  $$values ('nova'::text, null::uuid, true)$$,
  'uma só mudança nova, sem versão anterior'
);

select results_eq(
  $$select (select count(*) from private.norma_versao where norma_id = current_setting('teste.in2')::uuid),
           (select count(*) from private.norma_mudanca where norma_id = current_setting('teste.in2')::uuid),
           (select count(*) from private.norma_mudanca where norma_id = current_setting('teste.in3')::uuid)$$,
  $$values (2::bigint, 1::bigint, 0::bigint)$$,
  'IN 2 com duas versões e uma mudança; IN 3 sem mudança'
);

-- ---------------------------------------------------------------------------
-- registrar_revogacao
-- ---------------------------------------------------------------------------
set local role service_role;

select isnt(
  set_config('teste.cp', public.iniciar_coleta('ima_portaria', '2026-11-22', true)::text, true),
  null,
  'coleta das portarias aberta'
);

select is(
  public.registrar_revogacao(current_setting('teste.cp')::uuid, 'sc;ima;instrucao_normativa;84',
                             'sc;ima;portaria;96;2026', '2026-04-14'),
  null::uuid,
  'IN 84, já revogada pela Portaria 096/2026 na carga, não gera mudança'
);

select is(
  public.registrar_revogacao(current_setting('teste.cp')::uuid, 'sc;ima;instrucao_normativa;84',
                             'sc;ima;portaria;96;2026', '2026-04-14'),
  null::uuid,
  'repetir a revogação da IN 84 continua sem mudança'
);

select isnt(
  set_config('teste.m3', public.registrar_revogacao(current_setting('teste.cp')::uuid, 'sc;ima;instrucao_normativa;3',
                                                    'sc;ima;portaria;96;2026', '2026-11-21')::text, true),
  null,
  'revogar a IN 3 cria a mudança'
);

select is(
  public.registrar_revogacao(current_setting('teste.cp')::uuid, 'sc;ima;instrucao_normativa;3',
                             'sc;ima;portaria;96;2026', '2026-11-21'),
  current_setting('teste.m3')::uuid,
  'repetir a revogação da IN 3 devolve a mesma mudança'
);

select isnt(
  set_config('teste.m4', public.registrar_revogacao(current_setting('teste.cp')::uuid, 'sc;ima;instrucao_normativa;4',
                                                    'sc;ima;portaria;999;2026', null)::text, true),
  null,
  'revogar por ato fora do catálogo também cria a mudança'
);

select is(
  public.registrar_revogacao(current_setting('teste.cp')::uuid, 'sc;ima;instrucao_normativa;4',
                             'sc;ima;portaria;999;2026', null),
  current_setting('teste.m4')::uuid,
  'repetir a revogação por ato fora do catálogo devolve a mesma mudança'
);

select throws_ok(
  $$select public.registrar_revogacao(current_setting('teste.cp')::uuid, 'sc;ima;instrucao_normativa;9999',
                                      'sc;ima;portaria;96;2026', '2026-11-21')$$,
  'P0001', 'norma_inexistente',
  'revogar norma inexistente é recusado'
);

select throws_ok(
  $$select public.registrar_revogacao('73300000-0000-4000-8000-0000000000ff', 'sc;ima;instrucao_normativa;3',
                                      'sc;ima;portaria;96;2026', '2026-11-21')$$,
  'P0001', 'coleta_inexistente',
  'revogar com coleta inexistente é recusado'
);

reset role;

select is(
  (select count(*) from private.norma_mudanca as m
   join private.norma as n on n.id = m.norma_id where n.chave = 'sc;ima;instrucao_normativa;84'),
  0::bigint,
  'IN 84 continua sem mudança'
);

select results_eq(
  $$select n.situacao_na_fonte, n.revogada_em, n.revogada_por = p.id, m.tipo, m.ato_id = p.id,
           m.versao_anterior_id = v.id, m.versao_nova_id
    from private.norma as n
    join private.norma as p on p.chave = 'sc;ima;portaria;96;2026'
    join private.norma_mudanca as m on m.norma_id = n.id
    join private.norma_versao as v on v.norma_id = n.id and v.numero = 1
    where n.chave = 'sc;ima;instrucao_normativa;3'$$,
  $$values ('revogada'::text, '2026-11-21'::date, true, 'revogada'::text, true, true, null::uuid)$$,
  'IN 3 revogada pela portaria, com uma só mudança ligada ao ato e à última versão'
);

select results_eq(
  $$select n.situacao_na_fonte, n.revogada_em, n.revogada_por, m.ato_id, count(*) over ()
    from private.norma as n join private.norma_mudanca as m on m.norma_id = n.id
    where n.chave = 'sc;ima;instrucao_normativa;4'$$,
  $$values ('revogada'::text, null::date, null::uuid, null::uuid, 1::bigint)$$,
  'IN 4 revogada sem data e sem ato no catálogo, uma só mudança'
);

-- ---------------------------------------------------------------------------
-- Agendamento: sem pg_cron e pg_net, ligar e desligar só avisam
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select private.ligar_coleta_de_normas()$$,
  'ligar sem pg_cron não falha'
);

select results_eq(
  $$select codigo, ativa from private.fonte_legal where codigo in ('ima_in', 'ima_portaria') order by codigo$$,
  $$values ('ima_in'::text, false), ('ima_portaria'::text, false)$$,
  'ligar sem pg_cron não liga as fontes'
);

select lives_ok(
  $$select private.desligar_coleta_de_normas(array['consema'])$$,
  'desligar sem pg_cron não falha'
);

select is(
  (select ativa from private.fonte_legal where codigo = 'consema'),
  true,
  'desligar sem pg_cron não mexe na fonte'
);

-- ---------------------------------------------------------------------------
-- Negativos por papel
-- ---------------------------------------------------------------------------
set local role service_role;

select throws_ok(
  $$select private.ligar_coleta_de_normas()$$,
  '42501', null,
  'service_role não liga a coleta'
);

reset role;
set local role authenticated;

select throws_ok(
  $$select public.registrar_versao_de_norma(current_setting('teste.c2')::uuid, current_setting('teste.in2')::uuid,
                                            jsonb_build_object('sha256', repeat('e', 64)))$$,
  '42501', null,
  'authenticated não registra versão'
);

select throws_ok(
  $$select public.garantir_norma('{"chave": "sc;ima;instrucao_normativa;903"}'::jsonb)$$,
  '42501', null,
  'authenticated não cria norma'
);

reset role;
select testes.autenticar_como_anonimo();

select throws_ok(
  $$select public.iniciar_coleta('ima_in', '2026-11-23', true)$$,
  '42501', null,
  'anônimo não abre coleta'
);

select throws_ok(
  $$select count(*) from public.versoes_conhecidas('ima_in')$$,
  '42501', null,
  'anônimo não lê as versões conhecidas'
);

reset role;

select * from finish();

rollback;
