-- Modelos próprios e duplicação (ADR-0018, fatia 5; P7). O modelo guarda só escopo, unidade e horas:
-- nunca cliente, preço, estimativa, responsável ou mês. A cópia é um rascunho novo; os preços do
-- orçamento só vão junto quando pedido. Outra consultoria e a Equipe não veem nem copiam nada.
begin;

select plan(22);

select testes.criar_dados_sinteticos();
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_empreendimento('e0000000-0000-4000-8000-0000000000f5',
  'c0000000-0000-4000-8000-00000000000a', 'Fazenda Boa Vista');

select lives_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      3000, 160000, 160, 3000, 0, 0, 0, 0, 0, '[]'::jsonb, '[]'::jsonb, 0, 0, $json$[
      {"id": "h", "profissao": "Eng.", "atividade": "Hora", "valor_centavos": 16000},
      {"id": "pac", "profissao": "Eng.", "atividade": "PGRSS", "valor_centavos": 120000, "unidade": "pacote"}
    ]$json$::jsonb, 0)$sql$,
  'tabela de preços com hora e pacote'
);

select public.criar_orcamento('f0000000-0000-4000-8000-0000000000f5', 'c0000000-0000-4000-8000-00000000000a',
  'e0000000-0000-4000-8000-0000000000f5', 'Licença de operação');

select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000f5', 1, $json${
    "objeto": "Licença de operação", "forma_preco": "tabela", "margem_pb": 2500, "prazos": "60 dias",
    "destinatario": "Sr. Cliente",
    "premissas": ["Cliente fornece as plantas"], "exclusoes": ["Taxas do órgão"],
    "visitas": {"quantidade": 2, "km_por_visita": 40, "outros_por_visita_centavos": 1500},
    "itens": [
      {"id": "10000000-0000-4000-8000-0000000000d1", "descricao": "Diagnóstico", "minutos": 600,
       "hora_venda_id": "h", "custo_direto_extra_centavos": 3000,
       "responsavel_id": "d0000000-0000-4000-8000-0000000000a1", "mes_previsto": "2026-12-01"},
      {"id": "10000000-0000-4000-8000-0000000000d2", "descricao": "PGRSS", "minutos": 1200,
       "hora_venda_id": "pac", "preco_fechado_centavos": 120000}
    ],
    "despesas": [{"id": "20000000-0000-4000-8000-0000000000d1", "descricao": "Laboratório",
                  "estimativa_centavos": 10001, "tratamento": "incluida"}],
    "parcelas": [
      {"id": "30000000-0000-4000-8000-0000000000d1", "descricao": "Assinatura", "dias": 0, "percentual_pb": 5000},
      {"id": "30000000-0000-4000-8000-0000000000d2", "descricao": "Protocolo", "dias": 30, "percentual_pb": 5000}
    ]
  }$json$::jsonb),
  2,
  'orçamento de origem salvo'
);

-- ---------------------------------------------------------------- modelo
select is(
  public.salvar_modelo_de_orcamento('f0000000-0000-4000-8000-0000000000f5',
    '60000000-0000-4000-8000-0000000000d1', '  Licença de operação rural '),
  '60000000-0000-4000-8000-0000000000d1'::uuid,
  'Gestão salva o orçamento como modelo'
);

select results_eq(
  $$select nome, objeto, itens, despesas, premissas, exclusoes
    from public.orcamento_modelo where id = '60000000-0000-4000-8000-0000000000d1'$$,
  $$values ('Licença de operação rural', 'Licença de operação',
            '[{"descricao": "Diagnóstico", "minutos": 600, "hora_venda_id": "h", "unidade": "hora"},
              {"descricao": "PGRSS", "minutos": 1200, "hora_venda_id": "pac", "unidade": "pacote"}]'::jsonb,
            '[{"descricao": "Laboratório", "tratamento": "incluida"}]'::jsonb,
            array['Cliente fornece as plantas'], array['Taxas do órgão'])$$,
  'o modelo guarda só escopo, unidade e horas'
);

select is(
  (select count(*) from public.orcamento_modelo as m,
     lateral jsonb_array_elements(m.itens || m.despesas) as x (valor)
   where m.id = '60000000-0000-4000-8000-0000000000d1'
     and (x.valor ?| array['preco_fechado_centavos', 'custo_direto_extra_centavos', 'preco_centavos',
                           'responsavel_id', 'mes_previsto', 'quantidade', 'estimativa_centavos'])),
  0::bigint,
  'nenhum preço, estimativa, responsável, mês ou quantidade vai para o modelo'
);

select is(
  public.salvar_modelo_de_orcamento('f0000000-0000-4000-8000-0000000000f5',
    '60000000-0000-4000-8000-0000000000d1', 'Outro nome'),
  '60000000-0000-4000-8000-0000000000d1'::uuid,
  'repetir a mesma chamada devolve o mesmo modelo'
);

select throws_ok(
  $$select public.salvar_modelo_de_orcamento('f0000000-0000-4000-8000-0000000000f5',
      '60000000-0000-4000-8000-0000000000d2', 'licença de operação RURAL')$$,
  'P0001', 'modelo_com_mesmo_nome',
  'dois modelos ativos não têm o mesmo nome'
);

select results_eq(
  $$select (r ->> 'total')::integer, r -> 'itens' -> 0 ->> 'nome'
    from public.listar_modelos_de_orcamento('c0000000-0000-4000-8000-00000000000a', 'rural') as r$$,
  $$values (1, 'Licença de operação rural')$$,
  'a lista de modelos busca pelo nome'
);

-- ---------------------------------------------------------------- duplicar sem preços
select is(
  public.duplicar_orcamento('f0000000-0000-4000-8000-0000000000f5', 'f0000000-0000-4000-8000-0000000000f6', false),
  'f0000000-0000-4000-8000-0000000000f6'::uuid,
  'Gestão duplica sem os preços'
);

select results_eq(
  $$select n.situacao::text, n.sequencia = o.sequencia + 1, n.duplicado_de, n.empreendimento_id, n.margem_pb,
           n.prazos, n.destinatario, n.visitas, n.km_por_visita, n.outros_por_visita_centavos, n.premissas
    from public.orcamento as n, public.orcamento as o
    where n.id = 'f0000000-0000-4000-8000-0000000000f6' and o.id = 'f0000000-0000-4000-8000-0000000000f5'$$,
  $$values ('rascunho', true, 'f0000000-0000-4000-8000-0000000000f5'::uuid,
            'e0000000-0000-4000-8000-0000000000f5'::uuid, null::integer, '60 dias', 'Sr. Cliente',
            2, 40, 0::bigint, array['Cliente fornece as plantas'])$$,
  'rascunho novo, número seguinte, mesmo cliente; sem o acréscimo e sem outros gastos da visita'
);

select results_eq(
  $$select array_agg(descricao order by ordem), array_agg(minutos order by ordem),
           array_agg(custo_direto_extra_centavos order by ordem), array_agg(preco_fechado_centavos order by ordem),
           array_agg(responsavel_id order by ordem), array_agg(mes_previsto order by ordem)
    from public.orcamento_item where orcamento_id = 'f0000000-0000-4000-8000-0000000000f6'$$,
  $$values (array['Diagnóstico', 'PGRSS'], array[600, 1200], array[0, 0]::bigint[], array[null, null]::bigint[],
            array['d0000000-0000-4000-8000-0000000000a1', null]::uuid[], array[null, null]::date[])$$,
  'itens com escopo e responsável; sem outros custos, preço fechado nem mês'
);

select results_eq(
  $$select (select array_agg(estimativa_centavos) from public.orcamento_despesa
            where orcamento_id = 'f0000000-0000-4000-8000-0000000000f6'),
           (select array_agg(percentual_pb order by ordem) from public.orcamento_parcela
            where orcamento_id = 'f0000000-0000-4000-8000-0000000000f6')$$,
  $$values (array[null]::bigint[], array[5000, 5000])$$,
  'despesa volta a cotar; parcelas copiadas'
);

select is(
  (select count(*) from public.orcamento_item as n
   join public.orcamento_item as o on o.id = n.id
   where n.orcamento_id = 'f0000000-0000-4000-8000-0000000000f6'
     and o.orcamento_id = 'f0000000-0000-4000-8000-0000000000f5'),
  0::bigint,
  'a cópia tem itens novos, não os mesmos registros'
);

select is(
  public.obter_orcamento('f0000000-0000-4000-8000-0000000000f6') -> 'duplicado_de' ->> 'id',
  'f0000000-0000-4000-8000-0000000000f5',
  'a leitura diz de onde veio a cópia'
);

-- ---------------------------------------------------------------- duplicar com preços
select is(
  public.duplicar_orcamento('f0000000-0000-4000-8000-0000000000f5', 'f0000000-0000-4000-8000-0000000000f7', true),
  'f0000000-0000-4000-8000-0000000000f7'::uuid,
  'Gestão duplica com os preços'
);

select results_eq(
  $$select n.margem_pb, n.outros_por_visita_centavos,
           (select array_agg(custo_direto_extra_centavos order by ordem) from public.orcamento_item
            where orcamento_id = n.id),
           (select array_agg(preco_fechado_centavos order by ordem) from public.orcamento_item
            where orcamento_id = n.id),
           (select array_agg(estimativa_centavos) from public.orcamento_despesa where orcamento_id = n.id),
           (select array_agg(preco_centavos order by ordem) from public.orcamento_item where orcamento_id = n.id)
           = (select array_agg(preco_centavos order by ordem) from public.orcamento_item
              where orcamento_id = 'f0000000-0000-4000-8000-0000000000f5')
    from public.orcamento as n where n.id = 'f0000000-0000-4000-8000-0000000000f7'$$,
  $$values (2500, 1500::bigint, array[3000, 0]::bigint[], array[null, 120000]::bigint[], array[10001]::bigint[], true)$$,
  'com preços: acréscimo, outros custos, preço fechado e estimativas; o mesmo preço final'
);

select is(
  public.duplicar_orcamento('f0000000-0000-4000-8000-0000000000f5', 'f0000000-0000-4000-8000-0000000000f7', true),
  'f0000000-0000-4000-8000-0000000000f7'::uuid,
  'repetir a duplicação não cria outra cópia'
);

-- ---------------------------------------------------------------- excluir modelo
select throws_ok(
  $$select public.excluir_modelo_de_orcamento('60000000-0000-4000-8000-0000000000d1', 9)$$,
  'P0001', 'conflito_de_versao',
  'excluir confere a versão'
);

select lives_ok(
  $$select public.excluir_modelo_de_orcamento('60000000-0000-4000-8000-0000000000d1', 1)$$,
  'Gestão exclui o modelo (lógico)'
);

-- ---------------------------------------------------------------- negativos
select testes.autenticar_como('ana@filtroville.test');
select throws_ok(
  $$select public.duplicar_orcamento('f0000000-0000-4000-8000-0000000000f5', 'f0000000-0000-4000-8000-0000000000f8', false)$$,
  '42501', 'sem_permissao',
  'Equipe (Ana) não duplica'
);

select testes.autenticar_como('gustavo@verdesul.test');
select results_eq(
  $$select (select count(*) from public.orcamento_modelo),
           (select (r ->> 'total')::bigint from public.listar_modelos_de_orcamento('c0000000-0000-4000-8000-00000000000a') as r)$$,
  $$values (0::bigint, 0::bigint)$$,
  'Gestão de outra consultoria (Gustavo) recebe zero modelos'
);

select throws_ok(
  $$select public.salvar_modelo_de_orcamento('f0000000-0000-4000-8000-0000000000f5',
      '60000000-0000-4000-8000-0000000000d3', 'Invasão')$$,
  '42501', 'sem_permissao',
  'outra consultoria não salva modelo de orçamento alheio'
);

select * from finish();

rollback;
