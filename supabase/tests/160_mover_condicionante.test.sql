-- Mover condicionante na árvore (passo 3, LIC-02): só a Gestão da própria consultoria, só para
-- dentro de agrupador não descartado da mesma licença, nunca para dentro de si mesmo; só muda o pai.
begin;

select plan(13);

select testes.criar_dados_sinteticos();

insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('e0000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
        'Metalúrgica Rio Cubatão', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome)
values ('f0000000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
        'e0000000-0000-4000-8000-0000000000e1', 'Matriz');

-- Licença 1: 3 > 3.2 > 3.2.2 (agrupadores), 3.2.2.1 solto na raiz, 4 descartado.
-- Licença 2: agrupador 9, de outra licença.
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_instrumento('10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-0000000000f1');
select public.criar_instrumento('10000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-0000000000f1');
select public.salvar_condicionante('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
  null, '3', 'Controle ambiental', '', 'agrupador');
select public.salvar_condicionante('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001', '3.2', 'Resíduos', '', 'agrupador');
select public.salvar_condicionante('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002', '3.2.2', 'Resíduos sólidos', '', 'agrupador');
select public.salvar_condicionante('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001',
  null, '3.2.2.1', 'Inventário anual', 'Apresentar inventário…', 'obrigacao');
select public.salvar_condicionante('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001',
  null, '4', 'Antigo', '', 'agrupador');
select public.revisar_condicionante('30000000-0000-4000-8000-000000000005', 'descartada');
select public.salvar_condicionante('30000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000002',
  null, '9', 'De outra licença', '', 'agrupador');
reset role;

-- ---------------------------------------------------------------------------
-- Quem pode mover
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');
select throws_ok(
  $$select public.mover_condicionante('30000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000003')$$,
  '42501', 'sem_permissao',
  'Equipe (Ana) não move condicionante'
);

select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select public.mover_condicionante('30000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000003')$$,
  '42501', 'sem_permissao',
  'Gestão de outra consultoria não move condicionante de A, mesmo sabendo o id'
);

-- ---------------------------------------------------------------------------
-- Para onde pode ir
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');

select lives_ok(
  $$select public.mover_condicionante('30000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000003')$$,
  'Gestão arrasta o item solto para dentro do agrupador'
);

select results_eq(
  $$select pai_id, codigo, revisao::text from public.condicionante where id = '30000000-0000-4000-8000-000000000004'$$,
  $$values ('30000000-0000-4000-8000-000000000003'::uuid, '3.2.2.1', 'aceita')$$,
  'só o pai muda: código e revisão ficam'
);

select lives_ok(
  $$select public.mover_condicionante('30000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000003')$$,
  'repetir o mesmo movimento não dá erro'
);

select is(
  (select count(*) from public.auditoria
   where entidade = 'condicionante' and entidade_id = '30000000-0000-4000-8000-000000000004' and acao = 'update'
     and antes ->> 'pai_id' is null and depois ->> 'pai_id' = '30000000-0000-4000-8000-000000000003'),
  1::bigint,
  'o movimento fica na auditoria uma vez só'
);

select throws_ok(
  $$select public.mover_condicionante('30000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000004')$$,
  'P0001', 'agrupador_invalido',
  'não entra dentro de obrigação'
);

select throws_ok(
  $$select public.mover_condicionante('30000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000005')$$,
  'P0001', 'agrupador_invalido',
  'não entra em agrupador descartado'
);

select throws_ok(
  $$select public.mover_condicionante('30000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000009')$$,
  'P0001', 'agrupador_invalido',
  'não entra em agrupador de outra licença'
);

select throws_ok(
  $$select public.mover_condicionante('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003')$$,
  'P0001', 'agrupador_dentro_de_si',
  'agrupador não entra num agrupador que está abaixo dele'
);

select throws_ok(
  $$select public.mover_condicionante('30000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002')$$,
  'P0001', 'agrupador_dentro_de_si',
  'agrupador não entra em si mesmo'
);

select lives_ok(
  $$select public.mover_condicionante('30000000-0000-4000-8000-000000000003', null)$$,
  'arrastar para fora leva o agrupador para a raiz, com os subitens'
);

select results_eq(
  $$select id, pai_id from public.condicionante
    where id in ('30000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000004') order by id$$,
  $$values ('30000000-0000-4000-8000-000000000003'::uuid, null::uuid),
           ('30000000-0000-4000-8000-000000000004'::uuid, '30000000-0000-4000-8000-000000000003'::uuid)$$,
  'os subitens acompanham o agrupador'
);

select * from finish();
rollback;
