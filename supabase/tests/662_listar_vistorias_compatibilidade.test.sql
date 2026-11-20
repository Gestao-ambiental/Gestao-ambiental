-- Compatibilidade da lista de vistorias (20261120211810): a assinatura antiga, de 4 parâmetros e
-- sem a consultoria, convive com a nova. A antiga segue a RLS: outra consultoria lê zero.
begin;

select plan(5);

select testes.criar_dados_sinteticos();
select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('e6200000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a',
        'Metalúrgica Rio Cubatão', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome, endereco)
values ('e6210000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a',
        'e6200000-0000-4000-8000-000000000001', 'Matriz', 'Rua Dona Francisca, 8300, Joinville/SC');

-- Licença ativa com uma obrigação única em 5 dias, responsável Bruno.
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_instrumento('e6220000-0000-4000-8000-000000000001', 'e6210000-0000-4000-8000-000000000001');
select public.salvar_identificacao('e6220000-0000-4000-8000-000000000001', 1, 'e6210000-0000-4000-8000-000000000001',
  (select id from public.tipo_instrumento where sigla = 'LAO' and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  '6601/2023', 'IMA', null, current_setting('testes.hoje')::date - 30, null, null, 'assinatura',
  current_setting('testes.hoje')::date + 400);
select public.salvar_condicionante('e6230000-0000-4000-8000-000000000001',
  'e6220000-0000-4000-8000-000000000001', null, '1.1', 'Relatório', '', 'obrigacao');
select public.confirmar_prazo('e6230000-0000-4000-8000-000000000001', 'unica', null, null,
  'corridos', null, current_setting('testes.hoje')::date + 5, 'Documento');
select public.atribuir_a_todos('e6220000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a3');
select public.ativar_plano('e6220000-0000-4000-8000-000000000001',
  (select row_version from public.instrumento where id = 'e6220000-0000-4000-8000-000000000001'), gen_random_uuid());

reset role;
select set_config('testes.o1', (select o.id::text from public.ocorrencia as o
  join public.condicionante_versao as v on v.id = o.condicionante_versao_id
  where v.condicionante_id = 'e6230000-0000-4000-8000-000000000001'), true);

-- Vistoria na Filtroville, com o Bruno como responsável.
select testes.autenticar_como('ana@filtroville.test');
select public.criar_vistoria('e6250000-0000-4000-8000-000000000001', current_setting('testes.o1')::uuid,
  'Vistoria da ETE', null, 'd0000000-0000-4000-8000-0000000000a3', current_setting('testes.hoje')::date,
  null, null, '[{"titulo": "Placa de identificação"}]'::jsonb);

reset role;

select ok(
  to_regprocedure('public.listar_vistorias(uuid, boolean, integer, integer)') is not null
  and to_regprocedure('public.listar_vistorias(uuid, uuid, boolean, integer, integer)') is not null,
  'as duas assinaturas existem'
);

select ok(
  has_function_privilege('authenticated', 'public.listar_vistorias(uuid, boolean, integer, integer)', 'execute')
  and not has_function_privilege('anon', 'public.listar_vistorias(uuid, boolean, integer, integer)', 'execute'),
  'a antiga executa para authenticated e não para anon'
);

select testes.autenticar_como('ana@filtroville.test');

select results_eq(
  $$select id from public.listar_vistorias(p_ocorrencia_id => null::uuid, p_somente_minhas => false)$$,
  $$values ('e6250000-0000-4000-8000-000000000001'::uuid)$$,
  'pela antiga, a Filtroville vê a sua vistoria'
);

select testes.autenticar_como('gustavo@verdesul.test');

select is(
  (select count(*) from public.listar_vistorias(p_ocorrencia_id => null::uuid, p_somente_minhas => false)),
  0::bigint,
  'pela antiga, outra consultoria lê zero vistorias'
);

select is(
  (select count(*) from public.listar_vistorias(p_ocorrencia_id => current_setting('testes.o1')::uuid)),
  0::bigint,
  'pela antiga, filtrar pela ocorrência de outra consultoria traz zero'
);

reset role;

select * from finish();

rollback;
