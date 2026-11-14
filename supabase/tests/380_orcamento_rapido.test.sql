-- Orçamento rápido (ADR-0023): serviço com preço digitado (sem linha da tabela) e orçamento sem
-- custos e taxas configurados. Sem base, preço = digitados + despesas incluídas + visitas × valor de
-- cada visita, sem tributo nem margem; com base, o digitado vale como preço fechado (igual ao
-- pacote). Mesmos centavos de packages/domain/src/preco-orcamento-rapido.test.ts.
begin;

select plan(21);

select testes.criar_dados_sinteticos();

select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_empreendimento('e0000000-0000-4000-8000-0000000000f8',
  'c0000000-0000-4000-8000-00000000000a', 'Pousada Rápida');

-- ---------------------------------------------------------------- sem base
select lives_ok(
  $$select public.criar_orcamento('f0000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
      'e0000000-0000-4000-8000-0000000000f8', 'Licença simplificada')$$,
  'cria o orçamento sem custos e taxas configurados'
);

-- Despesa de 100,01 repartida 150.000 : 80.000 por maior resto; 2 visitas de 200,00 (o km não entra).
select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000e1', 1, $json${
    "objeto": "Licença simplificada", "forma_preco": "margem", "margem_pb": 3000,
    "visitas": {"quantidade": 2, "km_por_visita": 50, "outros_por_visita_centavos": 20000},
    "itens": [
      {"id": "10000000-0000-4000-8000-0000000000e1", "descricao": "Diagnóstico", "minutos": 120,
       "preco_fechado_centavos": 150000},
      {"id": "10000000-0000-4000-8000-0000000000e2", "descricao": "Protocolo", "minutos": 60,
       "custo_direto_extra_centavos": 5000, "preco_fechado_centavos": 80000}
    ],
    "despesas": [{"id": "20000000-0000-4000-8000-0000000000e1", "descricao": "Laboratório",
                  "estimativa_centavos": 10001, "tratamento": "incluida"}],
    "parcelas": [{"id": "30000000-0000-4000-8000-0000000000e1", "descricao": "Assinatura", "dias": 0,
                  "percentual_pb": 10000}]
  }$json$::jsonb),
  2,
  'salva serviços com preço digitado sem a base'
);

select results_eq(
  $$select (select array_agg(preco_centavos order by ordem) from public.orcamento_item
            where orcamento_id = 'f0000000-0000-4000-8000-0000000000e1'),
           preco_visitas_centavos, base_registrada_em is null
    from public.orcamento where id = 'f0000000-0000-4000-8000-0000000000e1'$$,
  $$values (array[156522, 83479]::bigint[], 40000::bigint, true)$$,
  'sem base: digitados + despesas repartidas; visitas × valor de cada visita, sem tributo nem margem'
);

select results_eq(
  $$select total_centavos from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a', 'pousada')
    where id = 'f0000000-0000-4000-8000-0000000000e1'$$,
  $$values (280001::bigint)$$,
  'a lista mostra o total, não "pendente"'
);

select results_eq(
  $$select j -> 'base', j -> 'itens' -> 0 ->> 'hora_venda_id', j -> 'itens' -> 0 ->> 'preco_fechado_centavos'
    from public.obter_orcamento('f0000000-0000-4000-8000-0000000000e1') as j$$,
  $$values ('null'::jsonb, null::text, '150000')$$,
  'o detalhe traz o preço digitado, sem linha da tabela'
);

-- ---------------------------------------------------------------- modelo e cópia
select is(
  public.salvar_modelo_de_orcamento('f0000000-0000-4000-8000-0000000000e1',
    '60000000-0000-4000-8000-0000000000e1', 'Licença simplificada'),
  '60000000-0000-4000-8000-0000000000e1'::uuid,
  'salva como modelo sem a base'
);

select results_eq(
  $$select itens from public.orcamento_modelo where id = '60000000-0000-4000-8000-0000000000e1'$$,
  $$values ('[{"descricao": "Diagnóstico", "minutos": 120, "hora_venda_id": null, "unidade": "hora",
               "preco_digitado_centavos": 150000},
              {"descricao": "Protocolo", "minutos": 60, "hora_venda_id": null, "unidade": "hora",
               "preco_digitado_centavos": 80000}]'::jsonb)$$,
  'o modelo guarda o preço digitado de cada serviço'
);

select is(
  public.duplicar_orcamento('f0000000-0000-4000-8000-0000000000e1', 'f0000000-0000-4000-8000-0000000000e2', true),
  'f0000000-0000-4000-8000-0000000000e2'::uuid,
  'duplica com os preços sem a base'
);

select results_eq(
  $$select (select array_agg(preco_fechado_centavos order by ordem) from public.orcamento_item
            where orcamento_id = n.id),
           (select sum(preco_centavos) from public.orcamento_item where orcamento_id = n.id)
             + n.preco_visitas_centavos
    from public.orcamento as n where n.id = 'f0000000-0000-4000-8000-0000000000e2'$$,
  $$values (array[150000, 80000]::bigint[], 280001::numeric)$$,
  'a cópia mantém os preços digitados e o mesmo total'
);

-- ---------------------------------------------------------------- pendências sem base
select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000e1', 2, $json${
    "objeto": "Licença simplificada",
    "itens": [
      {"id": "10000000-0000-4000-8000-0000000000e1", "descricao": "Diagnóstico", "minutos": 120,
       "preco_fechado_centavos": 150000},
      {"id": "10000000-0000-4000-8000-0000000000e2", "descricao": "Protocolo", "minutos": 60,
       "hora_venda_id": "venda"}
    ]
  }$json$::jsonb),
  3,
  'salva um serviço ligado à tabela de preços, mesmo sem a base'
);

select results_eq(
  $$select (select array_agg(preco_centavos order by ordem) from public.orcamento_item
            where orcamento_id = 'f0000000-0000-4000-8000-0000000000e1'),
           (select total_centavos from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a', 'pousada')
            where id = 'f0000000-0000-4000-8000-0000000000e1')$$,
  $$values (array[0, 0]::bigint[], null::bigint)$$,
  'sem base, serviço da tabela deixa o preço pendente'
);

select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000e1', 3, $json${
    "objeto": "Licença simplificada",
    "itens": [{"id": "10000000-0000-4000-8000-0000000000e1", "descricao": "Diagnóstico", "minutos": 120,
               "preco_fechado_centavos": 150000}],
    "despesas": [{"id": "20000000-0000-4000-8000-0000000000e1", "descricao": "Laboratório",
                  "estimativa_centavos": null, "tratamento": "incluida"}]
  }$json$::jsonb),
  4,
  'salva com a despesa incluída a cotar'
);

select results_eq(
  $$select total_centavos from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a', 'pousada')
    where id = 'f0000000-0000-4000-8000-0000000000e1'$$,
  $$values (null::bigint)$$,
  'despesa incluída a cotar continua deixando pendente'
);

-- ---------------------------------------------------------------- com base
-- Hora técnica 100,00; contas 8.000,00 ÷ 160 h = 50,00 por hora; tributos 6%; R$ 2 por cobrança e
-- R$ 4 de assinatura; hora de venda 100,00.
select lives_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      10000, 800000, 160, 3000, 0, 600, 0, 200, 400, '[]'::jsonb, '[]'::jsonb, 0, 0,
      '[{"id": "venda", "profissao": "Engenheiro", "atividade": "Venda", "valor_centavos": 10000}]'::jsonb, 0)$sql$,
  'a consultoria configura custos e taxas'
);

select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000e1', 4, $json${
    "objeto": "Licença simplificada", "forma_preco": "tabela",
    "itens": [{"id": "10000000-0000-4000-8000-0000000000e1", "descricao": "Diagnóstico", "minutos": 120,
               "preco_fechado_centavos": 100000}],
    "parcelas": [{"id": "30000000-0000-4000-8000-0000000000e1", "descricao": "Assinatura", "dias": 0,
                  "percentual_pb": 10000}]
  }$json$::jsonb),
  5,
  'com base, salva o preço digitado pela tabela'
);

select results_eq(
  $$select (select array_agg(preco_centavos order by ordem) from public.orcamento_item
            where orcamento_id = o.id), o.base_registrada_em is not null
    from public.orcamento as o where o.id = 'f0000000-0000-4000-8000-0000000000e1'$$,
  $$values (array[100000]::bigint[], true)$$,
  'com base, o preço digitado vale como preço fechado'
);

select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000e1', 5, $json${
    "objeto": "Licença simplificada", "forma_preco": "margem", "margem_pb": 3000,
    "itens": [
      {"id": "10000000-0000-4000-8000-0000000000e1", "descricao": "Diagnóstico", "minutos": 120,
       "hora_venda_id": "venda"},
      {"id": "10000000-0000-4000-8000-0000000000e2", "descricao": "Protocolo", "minutos": 60,
       "preco_fechado_centavos": 50000}
    ]
  }$json$::jsonb),
  6,
  'com base, mistura hora da tabela e preço digitado pela margem'
);

-- Hora: (200 + 100 de contas) × 1,30 + 4 de assinatura, com os 6% sobre tudo, inclusive os 500
-- do digitado: (394 × 10.000 + 500 × 600) ÷ 9.400 = 451,06. O digitado fica em 500,00.
select results_eq(
  $$select array_agg(preco_centavos order by ordem) from public.orcamento_item
    where orcamento_id = 'f0000000-0000-4000-8000-0000000000e1'$$,
  $$values (array[45106, 50000]::bigint[])$$,
  'só a hora recebe o acréscimo; tributos cobrem o preço digitado também'
);

-- ---------------------------------------------------------------- negativos
select testes.autenticar_como('ana@filtroville.test');
select results_eq(
  $$select count(*) from public.orcamento_item where preco_fechado_centavos is not null$$,
  $$values (0::bigint)$$,
  'Equipe (Ana) não lê preços digitados'
);

select testes.autenticar_como('gustavo@verdesul.test');
select results_eq(
  $$select (select count(*) from public.orcamento_item
            where orcamento_id in ('f0000000-0000-4000-8000-0000000000e1', 'f0000000-0000-4000-8000-0000000000e2')),
           public.obter_orcamento('f0000000-0000-4000-8000-0000000000e1') is null$$,
  $$values (0::bigint, true)$$,
  'Gestão de outra consultoria (Gustavo) recebe zero itens e nenhum orçamento'
);

select throws_ok(
  $sql$select public.salvar_orcamento('f0000000-0000-4000-8000-0000000000e1', 6, $json${
    "objeto": "Invasão",
    "itens": [{"id": "10000000-0000-4000-8000-0000000000e9", "descricao": "Invasão", "minutos": 60,
               "preco_fechado_centavos": 1}]
  }$json$::jsonb)$sql$,
  '42501', 'sem_permissao',
  'outra consultoria não altera o preço digitado de orçamento alheio'
);

select * from finish();

rollback;
