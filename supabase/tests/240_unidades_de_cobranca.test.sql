-- Unidades de cobrança (ADR-0018, fatia 2): a tabela de preços tem unidade (hora, m2, ha, diaria,
-- campanha, pacote); o item tem quantidade ou preço fechado; as horas seguem no custo. Pela margem,
-- o pacote fica fora do acréscimo. Mesmos centavos de packages/domain/src/preco-unidades.test.ts.
begin;

select plan(17);

select testes.criar_dados_sinteticos();

select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_empreendimento('e0000000-0000-4000-8000-0000000000f2',
  'c0000000-0000-4000-8000-00000000000a', 'Indústria Horizonte');

-- Hora técnica 30,00 digitada; contas 1.600,00 ÷ 160 h = 10,00 por hora.
select throws_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      3000, 160000, 160, 3000, 0, 0, 0, 0, 0, '[]'::jsonb, '[]'::jsonb, 0, 0,
      '[{"id": "x", "profissao": "Eng.", "atividade": "Hora", "valor_centavos": 100, "unidade": "litro"}]'::jsonb, 0)$sql$,
  '22023', 'horas_de_venda_invalidas',
  'unidade desconhecida é recusada'
);

select lives_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      3000, 160000, 160, 3000, 0, 0, 0, 0, 0, '[]'::jsonb, '[]'::jsonb, 0, 0, $json$[
      {"id": "h", "profissao": "Eng.", "atividade": "Hora", "valor_centavos": 16000},
      {"id": "ha", "profissao": "Bio.", "atividade": "Levantamento", "valor_centavos": 8000, "unidade": "ha",
       "minutos_por_unidade": 96},
      {"id": "pac", "profissao": "Eng.", "atividade": "PGRSS", "valor_centavos": 120000, "unidade": "pacote"},
      {"id": "dia", "profissao": "Bio.", "atividade": "Campo", "valor_centavos": 50000, "unidade": "diaria"}
    ]$json$::jsonb, 0)$sql$,
  'Gestão salva a tabela de preços com unidades'
);

select results_eq(
  $$select horas_venda -> 0 ->> 'unidade', horas_venda -> 1 ->> 'unidade', horas_venda -> 1 ->> 'minutos_por_unidade'
    from public.orcamento_base_custos where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'$$,
  $$values ('hora', 'ha', '96')$$,
  'linha sem unidade vale como hora; o tempo sugerido por unidade é guardado'
);

select lives_ok(
  $$select public.criar_orcamento('f0000000-0000-4000-8000-0000000000f2', 'c0000000-0000-4000-8000-00000000000a',
      'e0000000-0000-4000-8000-0000000000f2', 'Levantamento de fauna')$$,
  'cria o orçamento'
);

-- Hectare: 12,5 ha × 80,00 = 1.000,00.
select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000f2', 1, $json${
    "objeto": "Levantamento de fauna", "forma_preco": "tabela",
    "itens": [{"id": "10000000-0000-4000-8000-0000000000f1", "descricao": "Levantamento", "minutos": 1200,
               "hora_venda_id": "ha", "quantidade": "12.5"}]
  }$json$::jsonb),
  2,
  'salva o item por hectare com a quantidade'
);

select results_eq(
  $$select preco_centavos, quantidade from public.orcamento_item where id = '10000000-0000-4000-8000-0000000000f1'$$,
  $$values (100000::bigint, 12.5::numeric)$$,
  'hectare: quantidade × preço da unidade'
);

-- Pacote e hora: despesa de 100,01 repartida 50,01 + 50,00.
select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000f2', 2, $json${
    "objeto": "Levantamento de fauna", "forma_preco": "tabela",
    "itens": [
      {"id": "10000000-0000-4000-8000-0000000000f2", "descricao": "PGRSS", "minutos": 1200,
       "hora_venda_id": "pac", "preco_fechado_centavos": 120000},
      {"id": "10000000-0000-4000-8000-0000000000f3", "descricao": "Revisão", "minutos": 450, "hora_venda_id": "h"}
    ],
    "despesas": [{"id": "20000000-0000-4000-8000-0000000000f1", "descricao": "Laboratório",
                  "estimativa_centavos": 10001, "tratamento": "incluida"}]
  }$json$::jsonb),
  3,
  'salva pacote e hora no mesmo orçamento'
);

select results_eq(
  $$select array_agg(preco_centavos order by ordem) from public.orcamento_item
    where orcamento_id = 'f0000000-0000-4000-8000-0000000000f2'$$,
  $$values (array[125001, 125000]::bigint[])$$,
  'pela tabela: preço fechado e horas × preço, com a despesa repartida por maior resto'
);

select results_eq(
  $$select total_centavos from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a', 'horizonte')$$,
  $$values (250001::bigint)$$,
  'a lista soma o total'
);

-- Pela margem com tributos de 10%: o pacote não recebe acréscimo.
select lives_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      3000, 160000, 160, 3000, 0, 1000, 0, 0, 0, '[]'::jsonb, '[]'::jsonb, 0, 0,
      (select horas_venda from public.orcamento_base_custos where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
      0)$sql$,
  'tributos de 10%'
);

select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000f2', 3, $json${
    "objeto": "Levantamento de fauna", "forma_preco": "margem", "margem_pb": 2000,
    "itens": [
      {"id": "10000000-0000-4000-8000-0000000000f2", "descricao": "PGRSS", "minutos": 1200,
       "hora_venda_id": "pac", "preco_fechado_centavos": 120000},
      {"id": "10000000-0000-4000-8000-0000000000f3", "descricao": "Revisão", "minutos": 450, "hora_venda_id": "h"},
      {"id": "10000000-0000-4000-8000-0000000000f4", "descricao": "Campo", "minutos": 0, "hora_venda_id": "dia"}
    ]
  }$json$::jsonb),
  4,
  'item de diária sem quantidade ainda salva'
);

select results_eq(
  $$select (select array_agg(preco_centavos order by ordem) from public.orcamento_item
            where orcamento_id = 'f0000000-0000-4000-8000-0000000000f2'),
           (select total_centavos from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a', 'horizonte'))$$,
  $$values (array[0, 0, 0]::bigint[], null::bigint)$$,
  'mas, sem a quantidade, o preço fica pendente'
);

select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000f2', 4, $json${
    "objeto": "Levantamento de fauna", "forma_preco": "margem", "margem_pb": 2000,
    "itens": [
      {"id": "10000000-0000-4000-8000-0000000000f2", "descricao": "PGRSS", "minutos": 1200,
       "hora_venda_id": "pac", "preco_fechado_centavos": 120000},
      {"id": "10000000-0000-4000-8000-0000000000f3", "descricao": "Revisão", "minutos": 450, "hora_venda_id": "h"}
    ]
  }$json$::jsonb),
  5,
  'pela margem, com pacote e hora'
);

-- Base do acréscimo 1.275,00 (venda 1.200 + contas 75); acréscimo 255,00;
-- (1.275 + 255) ÷ 0,90 + 1.200 × 10% ÷ 0,90 = 1.833,33. O pacote fica em 1.200,00.
select results_eq(
  $$select array_agg(preco_centavos order by ordem) from public.orcamento_item
    where orcamento_id = 'f0000000-0000-4000-8000-0000000000f2'$$,
  $$values (array[120000, 183333]::bigint[])$$,
  'o pacote fica fora do acréscimo; tributos cobrem o pacote também'
);

select results_eq(
  $$select j -> 'itens' -> 0 ->> 'preco_fechado_centavos', j -> 'itens' -> 1 ->> 'quantidade'
    from public.obter_orcamento('f0000000-0000-4000-8000-0000000000f2') as j$$,
  $$values ('120000', null::text)$$,
  'o detalhe traz o preço fechado e a quantidade de cada item'
);

select throws_ok(
  $sql$select public.salvar_orcamento('f0000000-0000-4000-8000-0000000000f2', 5, $json${
    "objeto": "Levantamento de fauna",
    "itens": [{"id": "10000000-0000-4000-8000-0000000000f1", "descricao": "Levantamento", "minutos": 60,
               "hora_venda_id": "ha", "quantidade": "-1"}]
  }$json$::jsonb)$sql$,
  '22023', 'item_invalido',
  'quantidade negativa é recusada'
);

select testes.autenticar_como('ana@filtroville.test');
select results_eq(
  $$select count(*) from public.orcamento_item where quantidade is not null or preco_fechado_centavos is not null$$,
  $$values (0::bigint)$$,
  'Equipe (Ana) não lê quantidades nem preços fechados'
);

select * from finish();

rollback;
