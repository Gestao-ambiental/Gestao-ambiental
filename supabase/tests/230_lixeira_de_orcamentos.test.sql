-- Lixeira de orçamentos (12/11/2026): exclusão lógica com controle otimista; a lista e a lixeira
-- são filtros da mesma consulta; na lixeira o orçamento não muda; restaurar devolve à lista;
-- aprovado não vai para a lixeira; só a Gestão da consultoria exclui, restaura e vê a lixeira.
begin;

select plan(14);

select testes.criar_dados_sinteticos();

select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_empreendimento('e0000000-0000-4000-8000-0000000000f1',
  'c0000000-0000-4000-8000-00000000000a', 'Indústria Horizonte');
select public.criar_orcamento('f0000000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
  'e0000000-0000-4000-8000-0000000000f1', 'Licença de operação');
select public.criar_orcamento('f0000000-0000-4000-8000-0000000000f2', 'c0000000-0000-4000-8000-00000000000a',
  'e0000000-0000-4000-8000-0000000000f1', 'Laudo de ruído');

select throws_ok(
  $$select public.excluir_orcamento('f0000000-0000-4000-8000-0000000000f1', 9)$$,
  'P0001', 'conflito_de_versao',
  'versão antiga não exclui'
);

select is(
  public.excluir_orcamento('f0000000-0000-4000-8000-0000000000f1', 1),
  2,
  'Gestão manda o orçamento para a lixeira'
);

select results_eq(
  $$select count(*) filter (where id = 'f0000000-0000-4000-8000-0000000000f1'), count(*)
    from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values (0::bigint, 1::bigint)$$,
  'na lista, o excluído some'
);

select results_eq(
  $$select id, excluido_em is not null, row_version
    from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a', null, 50, 0, true)$$,
  $$values ('f0000000-0000-4000-8000-0000000000f1'::uuid, true, 2)$$,
  'na lixeira, aparece com a data e a versão'
);

select results_eq(
  $$select excluido_por from public.orcamento where id = 'f0000000-0000-4000-8000-0000000000f1'$$,
  $$values ('d0000000-0000-4000-8000-0000000000a1'::uuid)$$,
  'guarda quem excluiu (membro)'
);

select is(
  public.excluir_orcamento('f0000000-0000-4000-8000-0000000000f1', 1),
  2,
  'excluir de novo não muda nada'
);

select throws_ok(
  $$select public.salvar_orcamento('f0000000-0000-4000-8000-0000000000f1', 2,
      '{"objeto": "Licença de operação"}'::jsonb)$$,
  'P0001', 'orcamento_na_lixeira',
  'na lixeira, o orçamento não é editado'
);

select ok(
  (select (j ->> 'excluido_em') is not null
   from public.obter_orcamento('f0000000-0000-4000-8000-0000000000f1') as j),
  'o detalhe diz que está na lixeira'
);

select is(
  public.restaurar_orcamento('f0000000-0000-4000-8000-0000000000f1', 2),
  3,
  'restaurar devolve à lista'
);

select results_eq(
  $$select count(*) from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values (2::bigint)$$,
  'restaurado volta para a lista'
);

reset role;
update public.orcamento set situacao = 'aprovada' where id = 'f0000000-0000-4000-8000-0000000000f2';
select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.excluir_orcamento('f0000000-0000-4000-8000-0000000000f2', 1)$$,
  'P0001', 'orcamento_aprovado_nao_exclui',
  'aprovado não vai para a lixeira'
);

-- ---------------------------------------------------------------------------
-- Isolamento
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');
select throws_ok(
  $$select public.excluir_orcamento('f0000000-0000-4000-8000-0000000000f1', 3)$$,
  '42501', 'sem_permissao',
  'Equipe (Ana) não exclui'
);

select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select public.restaurar_orcamento('f0000000-0000-4000-8000-0000000000f1', 3)$$,
  '42501', 'sem_permissao',
  'Gestão de outra consultoria não restaura'
);

select results_eq(
  $$select count(*) from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a', null, 50, 0, true)$$,
  $$values (0::bigint)$$,
  'Gestão de outra consultoria não vê a lixeira'
);

select * from finish();

rollback;
