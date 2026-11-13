-- Faixas progressivas e preço mínimo (ADR-0018, fatia 4): faixas só em m², ha, diária e campanha,
-- limites crescentes e só a última aberta; mínimo só sobre os honorários e nunca no pacote.
-- Mesmos centavos de packages/domain/src/preco-faixas.test.ts.
begin;

select plan(14);

select testes.criar_dados_sinteticos();

select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_empreendimento('e0000000-0000-4000-8000-0000000000f4',
  'c0000000-0000-4000-8000-00000000000a', 'Loteamento Aurora');

select throws_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      4000, 192000, 160, 3000, 0, 0, 0, 0, 0, '[]'::jsonb, '[]'::jsonb, 0, 0,
      '[{"id": "h", "profissao": "Eng.", "atividade": "Hora", "valor_centavos": 100,
         "faixas": [{"ate": 10, "valor_centavos": 100}, {"ate": null, "valor_centavos": 90}]}]'::jsonb, 0)$sql$,
  '22023', 'horas_de_venda_invalidas',
  'hora não aceita faixas'
);

select throws_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      4000, 192000, 160, 3000, 0, 0, 0, 0, 0, '[]'::jsonb, '[]'::jsonb, 0, 0,
      '[{"id": "m2", "profissao": "Arq.", "atividade": "Projeto", "valor_centavos": 200, "unidade": "m2",
         "faixas": [{"ate": 500, "valor_centavos": 200}, {"ate": 1000, "valor_centavos": 150}]}]'::jsonb, 0)$sql$,
  '22023', 'horas_de_venda_invalidas',
  'a última faixa precisa ser aberta (sem lacuna no fim)'
);

select throws_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      4000, 192000, 160, 3000, 0, 0, 0, 0, 0, '[]'::jsonb, '[]'::jsonb, 0, 0,
      '[{"id": "m2", "profissao": "Arq.", "atividade": "Projeto", "valor_centavos": 200, "unidade": "m2",
         "faixas": [{"ate": 500, "valor_centavos": 200}, {"ate": 500, "valor_centavos": 150},
                    {"ate": null, "valor_centavos": 100}]}]'::jsonb, 0)$sql$,
  '22023', 'horas_de_venda_invalidas',
  'limites repetidos ou fora de ordem são recusados'
);

select throws_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      4000, 192000, 160, 3000, 0, 0, 0, 0, 0, '[]'::jsonb, '[]'::jsonb, 0, 0,
      '[{"id": "pac", "profissao": "Eng.", "atividade": "PGRSS", "valor_centavos": 100000, "unidade": "pacote",
         "minimo_centavos": 50000}]'::jsonb, 0)$sql$,
  '22023', 'horas_de_venda_invalidas',
  'pacote não tem preço mínimo'
);

-- Contas 1.920,00 ÷ 160 h = 12,00 por hora; hora técnica 40,00.
select lives_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      4000, 192000, 160, 3000, 0, 0, 0, 0, 0, '[]'::jsonb, '[]'::jsonb, 0, 0, $json$[
      {"id": "m2", "profissao": "Arq.", "atividade": "Projeto", "valor_centavos": 200, "unidade": "m2",
       "faixas": [{"ate": "500", "valor_centavos": 200}, {"ate": null, "valor_centavos": 150}]},
      {"id": "h", "profissao": "Eng.", "atividade": "Consulta", "valor_centavos": 16000, "minimo_centavos": 50000}
    ]$json$::jsonb, 0)$sql$,
  'Gestão salva faixas e preço mínimo'
);

select results_eq(
  $$select horas_venda -> 0 -> 'faixas', horas_venda -> 1 ->> 'minimo_centavos', horas_venda -> 1 -> 'faixas'
    from public.orcamento_base_custos where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'$$,
  $$values ('[{"ate": 500.0000, "valor_centavos": 200}, {"ate": null, "valor_centavos": 150}]'::jsonb,
            '50000', '[]'::jsonb)$$,
  'as faixas ficam normalizadas e o mínimo guardado'
);

select lives_ok(
  $$select public.criar_orcamento('f0000000-0000-4000-8000-0000000000f4', 'c0000000-0000-4000-8000-00000000000a',
      'e0000000-0000-4000-8000-0000000000f4', 'Projeto do loteamento')$$,
  'cria o orçamento'
);

-- 1.250 m²: 500 × 2,00 + 750 × 1,50 = 2.125,00; despesa incluída 100,00 → 2.225,00.
select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000f4', 1, $json${
    "objeto": "Projeto do loteamento", "forma_preco": "tabela",
    "itens": [{"id": "10000000-0000-4000-8000-0000000000e1", "descricao": "Projeto", "minutos": 1800,
               "hora_venda_id": "m2", "quantidade": "1250"}],
    "despesas": [{"id": "20000000-0000-4000-8000-0000000000e1", "descricao": "Topografia",
                  "estimativa_centavos": 10000, "tratamento": "incluida"}]
  }$json$::jsonb),
  2,
  'salva o item por m² com faixas'
);

select results_eq(
  $$select preco_centavos from public.orcamento_item where id = '10000000-0000-4000-8000-0000000000e1'$$,
  $$values (222500::bigint)$$,
  'faixas progressivas: 2.125,00 + despesa 100,00'
);

select results_eq(
  $$select total_centavos from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a', 'aurora')$$,
  $$values (222500::bigint)$$,
  'a lista soma o total'
);

-- Fronteira: 500,0001 m² = 1.000,00 + 0,0001 × 1,50 = 1.000,00015 → 1.000,00.
select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000f4', 2, $json${
    "objeto": "Projeto do loteamento", "forma_preco": "tabela",
    "itens": [{"id": "10000000-0000-4000-8000-0000000000e1", "descricao": "Projeto", "minutos": 1800,
               "hora_venda_id": "m2", "quantidade": "500.0001"}]
  }$json$::jsonb),
  3,
  'salva a fronteira da faixa'
);

select results_eq(
  $$select preco_centavos from public.orcamento_item where id = '10000000-0000-4000-8000-0000000000e1'$$,
  $$values (100000::bigint)$$,
  'só o excedente vai para a segunda faixa, arredondado uma vez'
);

-- Mínimo: 1 h × 160,00 < 500,00 → 500,00 + outros custos 30,00 + despesa 20,00 = 550,00.
select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000f4', 3, $json${
    "objeto": "Projeto do loteamento", "forma_preco": "tabela",
    "itens": [{"id": "10000000-0000-4000-8000-0000000000e2", "descricao": "Consulta", "minutos": 60,
               "hora_venda_id": "h", "custo_direto_extra_centavos": 3000}],
    "despesas": [{"id": "20000000-0000-4000-8000-0000000000e2", "descricao": "Deslocamento",
                  "estimativa_centavos": 2000, "tratamento": "incluida"}]
  }$json$::jsonb),
  4,
  'salva o serviço com preço mínimo'
);

select results_eq(
  $$select preco_centavos from public.orcamento_item where id = '10000000-0000-4000-8000-0000000000e2'$$,
  $$values (55000::bigint)$$,
  'o mínimo vale só para os honorários; outros custos e despesas vêm depois'
);

select * from finish();

rollback;
