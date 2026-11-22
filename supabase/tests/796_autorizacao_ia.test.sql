-- Autorização da Gestão para a conferência de relatórios por IA (ADR-0061). Desligada por padrão; só
-- a Gestão liga e desliga; repetir a decisão não grava; histórico só de acréscimo; a Equipe só lê;
-- outra consultoria recebe zero linhas e não decide pela Filtroville, mesmo com o UUID.
begin;

select plan(16);

select testes.criar_dados_sinteticos();

select has_table('public', 'autorizacao_ia', 'tabela autorizacao_ia existe');
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity from pg_class as c
   where c.oid = 'public.autorizacao_ia'::regclass),
  'RLS habilitada e forçada em autorizacao_ia'
);

-- ---------------------------------------------------------------- padrão: desligada
select testes.autenticar_como('eduardo@filtroville.test');
select results_eq(
  $$select finalidade, autorizada, decidida_em is null
    from public.autorizacao_ia_atual('c0000000-0000-4000-8000-00000000000a')$$,
  $$values ('conferencia_relatorio'::text, false, true)$$,
  'sem decisão, a conferência por IA está desligada'
);

-- ---------------------------------------------------------------- a Equipe não decide
select testes.autenticar_como('ana@filtroville.test');
select throws_ok(
  $$select public.definir_autorizacao_ia('c0000000-0000-4000-8000-00000000000a', 'conferencia_relatorio', true)$$,
  '42501', 'sem_permissao',
  'Equipe não liga a conferência por IA'
);

-- ---------------------------------------------------------------- a Gestão liga
select testes.autenticar_como('eduardo@filtroville.test');
select is(
  public.definir_autorizacao_ia('c0000000-0000-4000-8000-00000000000a', 'conferencia_relatorio', true),
  true,
  'Gestão liga a conferência por IA'
);
select is(
  public.definir_autorizacao_ia('c0000000-0000-4000-8000-00000000000a', 'conferencia_relatorio', true),
  true,
  'ligar de novo devolve a mesma situação'
);
select is(
  (select count(*)::integer from public.autorizacao_ia),
  1,
  'repetir a mesma decisão não grava linha nova'
);
select throws_ok(
  $$select public.definir_autorizacao_ia('c0000000-0000-4000-8000-00000000000a', 'extracao', true)$$,
  '22023', 'dados_invalidos',
  'finalidade desconhecida é recusada'
);

-- A Equipe lê quem ligou e quando.
select testes.autenticar_como('ana@filtroville.test');
select results_eq(
  $$select autorizada, decidida_em is not null, decidida_por_nome is not null
    from public.autorizacao_ia_atual('c0000000-0000-4000-8000-00000000000a')$$,
  $$values (true, true, true)$$,
  'Equipe vê a conferência ligada, com quem decidiu'
);

-- ---------------------------------------------------------------- outra consultoria
select testes.autenticar_como('gustavo@verdesul.test');
select is(
  (select count(*)::integer from public.autorizacao_ia
   where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  0,
  'outra consultoria não vê as decisões da Filtroville'
);
select is(
  (select count(*)::integer from public.autorizacao_ia_atual('c0000000-0000-4000-8000-00000000000a')),
  0,
  'outra consultoria recebe zero linhas da situação da Filtroville'
);
select throws_ok(
  $$select public.definir_autorizacao_ia('c0000000-0000-4000-8000-00000000000a', 'conferencia_relatorio', false)$$,
  '42501', 'sem_permissao',
  'Gestão de outra consultoria não desliga pela Filtroville'
);
select throws_ok(
  $$insert into public.autorizacao_ia (consultoria_id, finalidade, autorizada, decidida_por)
    values ('c0000000-0000-4000-8000-00000000000a', 'conferencia_relatorio', false,
            'd0000000-0000-4000-8000-0000000000a1')$$,
  '42501', null,
  'ninguém grava direto na tabela'
);

-- ---------------------------------------------------------------- desligar e histórico
select testes.autenticar_como('eduardo@filtroville.test');
select is(
  public.definir_autorizacao_ia('c0000000-0000-4000-8000-00000000000a', 'conferencia_relatorio', false),
  false,
  'Gestão desliga a conferência por IA'
);
select is(
  (select autorizada from public.autorizacao_ia_atual('c0000000-0000-4000-8000-00000000000a')),
  false,
  'vale a última decisão'
);

reset role;
select throws_ok(
  $$update public.autorizacao_ia set autorizada = true$$,
  '42501', null,
  'o histórico de decisões é só de acréscimo'
);

select * from finish();

rollback;
