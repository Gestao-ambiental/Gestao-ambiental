-- Desfazer a confirmação do prazo (passo 4, LIC-03): só a Gestão da própria consultoria, só em
-- rascunho; volta a pendente e mantém o que foi preenchido.
begin;

select plan(7);

select testes.criar_dados_sinteticos();

insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('e0000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
        'Metalúrgica Rio Cubatão', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome)
values ('f0000000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
        'e0000000-0000-4000-8000-0000000000e1', 'Matriz');

select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_instrumento('10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-0000000000f1');
select public.salvar_condicionante('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
  null, '3.3.8', 'Anuência para alterações', 'Quaisquer alterações…', 'obrigacao');
select public.confirmar_prazo('30000000-0000-4000-8000-000000000001', 'unica', null, null, 'corridos',
  '2020-08-20', '2021-08-20', 'Item 3.3.8');
reset role;

-- ---------------------------------------------------------------------------
-- Quem pode desfazer
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');
select throws_ok(
  $$select public.desfazer_confirmacao_prazo('30000000-0000-4000-8000-000000000001')$$,
  '42501', 'sem_permissao',
  'Equipe (Ana) não desfaz a confirmação'
);

select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select public.desfazer_confirmacao_prazo('30000000-0000-4000-8000-000000000001')$$,
  '42501', 'sem_permissao',
  'Gestão de outra consultoria não desfaz confirmação de A, mesmo sabendo o id'
);

select throws_ok(
  $$select public.desfazer_confirmacao_prazo(gen_random_uuid())$$,
  '42501', 'sem_permissao',
  'item inexistente responde como sem permissão'
);

-- ---------------------------------------------------------------------------
-- O que muda
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');

select lives_ok(
  $$select public.desfazer_confirmacao_prazo('30000000-0000-4000-8000-000000000001')$$,
  'Gestão desfaz a confirmação'
);

select results_eq(
  $$select v.prazo_confirmado_em is null, v.prazo_confirmado_por is null, v.recorrencia::text, v.primeira_data,
           v.fonte_regra
    from public.condicionante as c join public.condicionante_versao as v on v.id = c.versao_vigente_id
    where c.id = '30000000-0000-4000-8000-000000000001'$$,
  $$values (true, true, 'unica', '2021-08-20'::date, 'Item 3.3.8')$$,
  'volta a pendente e mantém recorrência, datas e fonte'
);

select lives_ok(
  $$select public.desfazer_confirmacao_prazo('30000000-0000-4000-8000-000000000001')$$,
  'repetir não dá erro'
);

select is(
  (select count(*) from public.auditoria
   where entidade = 'condicionante_versao' and acao = 'update'
     and antes ->> 'prazo_confirmado_em' is not null and depois ->> 'prazo_confirmado_em' is null),
  1::bigint,
  'desfazer fica na auditoria uma vez só'
);

select * from finish();
rollback;
