-- Avisos (P5, ADR-0047): descadastro pelo link do e-mail (desligar_resumo_por_link, só service
-- role). Desliga sem login; repetir não grava de novo; membro inexistente ou de outra consultoria
-- devolve falso; vale para membro desligado e com a consultoria em somente leitura comercial; a
-- pessoa religa pelo Perfil.
begin;

select plan(14);

select testes.criar_dados_sinteticos();

select ok(
  has_function_privilege('service_role', 'public.desligar_resumo_por_link(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.desligar_resumo_por_link(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.desligar_resumo_por_link(uuid, uuid)', 'execute'),
  'só a Edge Function (service role) desliga pelo link'
);

select testes.autenticar_como_anonimo();
select throws_ok(
  $$select public.desligar_resumo_por_link('c0000000-0000-4000-8000-00000000000a',
                                           'd0000000-0000-4000-8000-0000000000a2')$$,
  '42501', null,
  'anon não chama a RPC direto'
);
reset role;

-- ---------------------------------------------------------------------------
-- Desligar
-- ---------------------------------------------------------------------------
select is(
  public.desligar_resumo_por_link('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a2'),
  true, 'sem preferência gravada: desliga'
);
select results_eq(
  $$select resumo_diario, origem, row_version from public.preferencia_aviso
    where membro_id = 'd0000000-0000-4000-8000-0000000000a2'$$,
  $$values (false, 'link'::text, 1)$$,
  'grava desligado, com origem link, na versão 1'
);
select is(
  public.desligar_resumo_por_link('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a2'),
  true, 'repetir devolve verdadeiro'
);
select is(
  (select row_version from public.preferencia_aviso where membro_id = 'd0000000-0000-4000-8000-0000000000a2'),
  1, 'repetir não grava de novo'
);

-- Com preferência ligada gravada pelo Perfil.
select testes.autenticar_como('bruno@filtroville.test');
select public.definir_resumo_diario('c0000000-0000-4000-8000-00000000000a', true, 0);
reset role;
select is(
  public.desligar_resumo_por_link('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a3'),
  true, 'com preferência ligada: desliga'
);
select results_eq(
  $$select resumo_diario, origem, row_version from public.preferencia_aviso
    where membro_id = 'd0000000-0000-4000-8000-0000000000a3'$$,
  $$values (false, 'link'::text, 2)$$,
  'atualiza a linha e sobe a versão'
);

-- ---------------------------------------------------------------------------
-- Membro inexistente ou de outra consultoria
-- ---------------------------------------------------------------------------
select ok(
  public.desligar_resumo_por_link('c0000000-0000-4000-8000-00000000000a', gen_random_uuid()) = false
  and public.desligar_resumo_por_link('c0000000-0000-4000-8000-00000000000a',
                                      'd0000000-0000-4000-8000-0000000000b1') = false
  and public.desligar_resumo_por_link(null, null) = false,
  'membro inexistente, de outra consultoria ou nulo: falso, nada gravado'
);
select is(
  (select count(*) from public.preferencia_aviso where membro_id = 'd0000000-0000-4000-8000-0000000000b1'),
  0::bigint, 'nada gravado para o membro da outra consultoria'
);

-- ---------------------------------------------------------------------------
-- Membro desligado e somente leitura comercial
-- ---------------------------------------------------------------------------
update public.membro set situacao = 'desligado', desligado_em = now()
where id = 'd0000000-0000-4000-8000-0000000000a5';
select is(
  public.desligar_resumo_por_link('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a5'),
  true, 'membro desligado também desliga pelo link'
);

update private.configuracao_comercial set fim_do_beta = current_date - 400;
update public.consultoria set criada_em = now() - interval '60 days'
where id = 'c0000000-0000-4000-8000-00000000000a';
delete from public.consultoria_condicao_comercial where consultoria_id = 'c0000000-0000-4000-8000-00000000000a';
select ok(
  private.consultoria_somente_leitura('c0000000-0000-4000-8000-00000000000a')
  and public.desligar_resumo_por_link('c0000000-0000-4000-8000-00000000000a',
                                      'd0000000-0000-4000-8000-0000000000a4'),
  'consultoria em somente leitura: desliga do mesmo jeito'
);

-- ---------------------------------------------------------------------------
-- Religar pelo Perfil
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');
select is(
  public.definir_resumo_diario('c0000000-0000-4000-8000-00000000000a', true, 1),
  2, 'a pessoa religa pelo Perfil'
);
select results_eq(
  $$select resumo_diario, row_version from public.meus_avisos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values (true, 2)$$,
  'o Perfil mostra ligado de novo'
);

select * from finish();

rollback;
