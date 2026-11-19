-- Prazo em meses a partir de uma referência no fim do mês (vistoria de 19/11/2026): quando a
-- primeira data é a sugerida (referência + um intervalo), a série conta da referência e não fica
-- presa no dia 28. Os mesmos casos de packages/domain/src/prazo.test.ts.
begin;

select plan(8);

-- ---------------------------------------------------------------------------
-- private.datas_do_prazo
-- ---------------------------------------------------------------------------
select results_eq(
  $$select prazo from private.datas_do_prazo('mensal', null, null, '2026-02-28', '2026-05-31', '2026-01-31')$$,
  $$values ('2026-02-28'::date), ('2026-03-31'), ('2026-04-30'), ('2026-05-31')$$,
  'mensal sugerido de 31/01: 28/02, 31/03, 30/04 e 31/05 (não 28/03 e 28/04)'
);

select results_eq(
  $$select prazo from private.datas_do_prazo('trimestral', null, null, '2026-02-28', '2026-08-30', '2025-11-30')$$,
  $$values ('2026-02-28'::date), ('2026-05-30'), ('2026-08-30')$$,
  'trimestral sugerido de 30/11: 28/02, 30/05 e 30/08'
);

select results_eq(
  $$select prazo from private.datas_do_prazo('mensal', null, null, '2026-02-27', '2026-04-30', '2026-01-31')$$,
  $$values ('2026-02-27'::date), ('2026-03-27'), ('2026-04-27')$$,
  'primeira data escolhida à mão (não é a sugerida) segue contando dela'
);

select results_eq(
  $$select prazo from private.datas_do_prazo('mensal', null, null, '2026-02-28', '2026-04-30')$$,
  $$values ('2026-02-28'::date), ('2026-03-28'), ('2026-04-28')$$,
  'sem referência, conta da primeira data, como antes'
);

select results_eq(
  $$select prazo from private.datas_do_prazo('personalizada', 'dia', 30, '2026-03-02', '2026-04-01', '2026-01-31')$$,
  $$values ('2026-03-02'::date), ('2026-04-01')$$,
  'em dias corridos a referência não muda nada'
);

-- ---------------------------------------------------------------------------
-- A ativação grava a série contando da referência da versão
-- ---------------------------------------------------------------------------
select testes.criar_dados_sinteticos();

insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('e0000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
        'Metalúrgica Rio Cubatão', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome)
values ('f0000000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
        'e0000000-0000-4000-8000-0000000000e1', 'Matriz');

select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_instrumento('10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-0000000000f1');
select public.salvar_identificacao('10000000-0000-4000-8000-000000000001', 1, 'f0000000-0000-4000-8000-0000000000f1',
  (select id from public.tipo_instrumento where sigla = 'LAO' and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  '4821/2026', 'IMA', null, '2026-01-31', null, null, 'assinatura', '2026-05-31');
select public.salvar_condicionante('30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', null, '4.1', 'Relatório mensal', '', 'obrigacao');
select public.salvar_condicionante('30000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001', null, '4.2', 'Planilha mensal', '', 'obrigacao');
select public.confirmar_prazo('30000000-0000-4000-8000-000000000001', 'mensal', null, null,
  'corridos', '2026-01-31', '2026-02-28', 'Item 4.1');
select public.confirmar_prazo('30000000-0000-4000-8000-000000000002', 'mensal', null, null,
  'corridos', '2026-01-31', '2026-02-27', 'Item 4.2');
select public.atribuir_a_todos('10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a3');

select is(
  public.ativar_plano('10000000-0000-4000-8000-000000000001',
    (select row_version from public.instrumento where id = '10000000-0000-4000-8000-000000000001'),
    gen_random_uuid()),
  8,
  'ativar gera 4 + 4 mensais'
);

select results_eq(
  $$select o.prazo_oficial_original from public.ocorrencia as o
    join public.condicionante_versao as v on v.id = o.condicionante_versao_id
    where v.condicionante_id = '30000000-0000-4000-8000-000000000001' order by o.ciclo$$,
  $$values ('2026-02-28'::date), ('2026-03-31'), ('2026-04-30'), ('2026-05-31')$$,
  'primeira data sugerida: as ocorrências voltam ao fim de mês'
);

select results_eq(
  $$select o.prazo_oficial_original from public.ocorrencia as o
    join public.condicionante_versao as v on v.id = o.condicionante_versao_id
    where v.condicionante_id = '30000000-0000-4000-8000-000000000002' order by o.ciclo$$,
  $$values ('2026-02-27'::date), ('2026-03-27'), ('2026-04-27'), ('2026-05-27')$$,
  'primeira data à mão: as ocorrências contam dela'
);

select * from finish();
rollback;
