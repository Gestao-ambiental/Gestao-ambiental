-- Lista de vistorias por consultoria: quem é membro de duas consultorias vê no Campo só as
-- vistorias da consultoria selecionada (p_consultoria_id), mesmo que a RLS mostre as duas.
-- Outra consultoria lê zero. A assinatura antiga, sem consultoria, voltou ao lado da nova
-- (20261120211810, compatibilidade); por isso as chamadas de um argumento usam o nome do parâmetro.
begin;

select plan(8);

select testes.criar_dados_sinteticos();
select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('e6600000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a',
        'Metalúrgica Rio Cubatão', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome, endereco)
values ('e6610000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a',
        'e6600000-0000-4000-8000-000000000001', 'Matriz', 'Rua Dona Francisca, 8300, Joinville/SC');

-- Licença ativa com uma obrigação única em 5 dias, responsável Bruno.
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_instrumento('e6620000-0000-4000-8000-000000000001', 'e6610000-0000-4000-8000-000000000001');
select public.salvar_identificacao('e6620000-0000-4000-8000-000000000001', 1, 'e6610000-0000-4000-8000-000000000001',
  (select id from public.tipo_instrumento where sigla = 'LAO' and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  '6601/2023', 'IMA', null, current_setting('testes.hoje')::date - 30, null, null, 'assinatura',
  current_setting('testes.hoje')::date + 400);
select public.salvar_condicionante('e6630000-0000-4000-8000-000000000001',
  'e6620000-0000-4000-8000-000000000001', null, '1.1', 'Relatório', '', 'obrigacao');
select public.confirmar_prazo('e6630000-0000-4000-8000-000000000001', 'unica', null, null,
  'corridos', null, current_setting('testes.hoje')::date + 5, 'Documento');
select public.atribuir_a_todos('e6620000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a3');
select public.ativar_plano('e6620000-0000-4000-8000-000000000001',
  (select row_version from public.instrumento where id = 'e6620000-0000-4000-8000-000000000001'), gen_random_uuid());

reset role;
select set_config('testes.o1', (select o.id::text from public.ocorrencia as o
  join public.condicionante_versao as v on v.id = o.condicionante_versao_id
  where v.condicionante_id = 'e6630000-0000-4000-8000-000000000001'), true);

-- Bruno também é Equipe na Verde Sul.
insert into public.membro (id, consultoria_id, usuario_id, papel)
values ('d0000000-0000-4000-8000-0000000006b3', 'c0000000-0000-4000-8000-00000000000b',
        'a0000000-0000-4000-8000-000000000003', 'equipe');

-- Vistoria na Filtroville, com o Bruno como responsável.
select testes.autenticar_como('ana@filtroville.test');
select public.criar_vistoria('e6650000-0000-4000-8000-000000000001', current_setting('testes.o1')::uuid,
  'Vistoria da ETE', null, 'd0000000-0000-4000-8000-0000000000a3', current_setting('testes.hoje')::date,
  null, null, '[{"titulo": "Placa de identificação"}]'::jsonb);

-- ---------------------------------------------------------------------------
-- Bruno, membro das duas consultorias
-- ---------------------------------------------------------------------------
select testes.autenticar_como('bruno@filtroville.test');

select is(
  (select count(*) from public.vistoria),
  1::bigint,
  'a RLS mostra ao Bruno a vistoria da Filtroville'
);

select results_eq(
  $$select id, consultoria_id, total::integer
    from public.listar_vistorias('c0000000-0000-4000-8000-00000000000a', null, true)$$,
  $$values ('e6650000-0000-4000-8000-000000000001'::uuid, 'c0000000-0000-4000-8000-00000000000a'::uuid, 1)$$,
  'na Filtroville, minhas vistorias traz a vistoria dela'
);

select is(
  (select count(*) from public.listar_vistorias('c0000000-0000-4000-8000-00000000000b', null, true))
  + (select count(*) from public.listar_vistorias(p_consultoria_id => 'c0000000-0000-4000-8000-00000000000b')),
  0::bigint,
  'na Verde Sul, a lista não traz a vistoria da Filtroville'
);

select is(
  (select count(*) from public.listar_vistorias('c0000000-0000-4000-8000-00000000000b',
    current_setting('testes.o1')::uuid)),
  0::bigint,
  'filtrar pela ocorrência da Filtroville com a Verde Sul selecionada traz zero'
);

select is(
  (select count(*) from public.listar_vistorias(p_consultoria_id => null)),
  0::bigint,
  'sem consultoria a lista vem vazia'
);

-- ---------------------------------------------------------------------------
-- Outra consultoria e assinatura
-- ---------------------------------------------------------------------------
select testes.autenticar_como('gustavo@verdesul.test');

select is(
  (select count(*) from public.listar_vistorias(p_consultoria_id => 'c0000000-0000-4000-8000-00000000000a')),
  0::bigint,
  'quem não é membro da Filtroville lê zero vistorias dela'
);

reset role;

select ok(
  to_regprocedure('public.listar_vistorias(uuid, uuid, boolean, integer, integer)') is not null,
  'a assinatura nova, com a consultoria, existe'
);

select ok(
  has_function_privilege('authenticated', 'public.listar_vistorias(uuid, uuid, boolean, integer, integer)', 'execute')
  and not has_function_privilege('anon', 'public.listar_vistorias(uuid, uuid, boolean, integer, integer)', 'execute'),
  'a lista nova executa para authenticated e não para anon'
);

select * from finish();

rollback;
