-- Preço pela tabela de hora de venda, custo por profissão e remuneração pelo piso (12/11/2026):
-- tabela de hora por profissão e atividade; quem está "pelo piso" recebe horas × piso por hora;
-- hora técnica por profissão derivada da equipe; orçamento novo nasce pela tabela; preço do item =
-- horas × hora de venda + outros custos; pela margem, o custo do item usa a hora técnica da
-- profissão (sem ninguém da profissão, a média); só a Gestão da consultoria lê.
begin;

select plan(19);

select testes.criar_dados_sinteticos();

select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_empreendimento('e0000000-0000-4000-8000-0000000000d1',
  'c0000000-0000-4000-8000-00000000000a', 'Indústria Horizonte');

-- ---------------------------------------------------------------------------
-- Base: tabela de hora de venda, piso por hora, equipe com profissão
-- ---------------------------------------------------------------------------
select throws_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      9500, 25000, 260, 3000, 0, 0, 0, 0, 0, '[]'::jsonb, '[]'::jsonb, 25000, 0, $json$[
      {"id": "a", "profissao": "Eng. ambiental", "atividade": "Júnior", "valor_centavos": 21419},
      {"id": "b", "profissao": " eng. ambiental ", "atividade": "júnior", "valor_centavos": 1}
    ]$json$::jsonb, 7949)$sql$,
  '22023', 'horas_de_venda_invalidas',
  'a mesma profissão e atividade duas vezes é recusada'
);

select lives_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      1, 25000, 1, 3000, 0, 0, 0, 0, 0, $json$[
      {"id": "40000000-0000-4000-8000-0000000000d1", "membro_id": "d0000000-0000-4000-8000-0000000000a1",
       "socio": true, "tipo_recebimento": "pro_labore", "custo_mensal_centavos": 1375177,
       "profissao": "Eng. ambiental", "horas_disponiveis_mes": 173},
      {"id": "40000000-0000-4000-8000-0000000000d2", "membro_id": "d0000000-0000-4000-8000-0000000000a2",
       "socio": true, "profissao": "Biólogo", "custo_mensal_centavos": 500000, "horas_disponiveis_mes": 87}
    ]$json$::jsonb, '[]'::jsonb, 25000, 0, $json$[
      {"id": "h-eng-jr", "profissao": "Eng. ambiental", "atividade": "Júnior", "valor_centavos": 21419,
       "fonte": "ACEAMB 2015 corrigida (ago/2026)"},
      {"id": "h-eng-pericia", "profissao": "Eng. ambiental", "atividade": "Perícia ambiental", "valor_centavos": 35698},
      {"id": "h-bio-sr", "profissao": " Biólogo ", "atividade": "Sênior", "valor_centavos": 30000},
      {"id": "h-civil", "profissao": "Eng. civil", "atividade": "Júnior", "valor_centavos": 25000}
    ]$json$::jsonb, 7949)$sql$,
  'Gestão salva a tabela de hora de venda, o piso e a equipe com profissão'
);

select results_eq(
  $$select array_agg(e.custo_mensal_centavos order by e.ordem), array_agg(e.profissao order by e.ordem),
           (select hora_tecnica_centavos from public.orcamento_base_custos where consultoria_id = 'c0000000-0000-4000-8000-00000000000a')
    from public.orcamento_base_equipe as e where e.consultoria_id = 'c0000000-0000-4000-8000-00000000000a'$$,
  $$values (array[1375177, 500000]::bigint[], array['Eng. ambiental', 'Biólogo'], 7212::bigint)$$,
  'pelo piso: 173 h × 79,49; a média da equipe é 18.751,77 ÷ 260 h = 72,12'
);

select results_eq(
  $$select custo_hora_profissao from public.orcamento_base_custos
    where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'$$,
  $$values ('[{"profissao": "Biólogo", "hora_tecnica_centavos": 5747},
             {"profissao": "Eng. ambiental", "hora_tecnica_centavos": 7949}]'::jsonb)$$,
  'hora técnica por profissão: bióloga 5.000 ÷ 87 h = 57,47; engenheiro 13.751,77 ÷ 173 h = 79,49'
);

select results_eq(
  $$select jsonb_array_length(horas_venda), horas_venda -> 2 ->> 'profissao', horas_venda -> 1 ->> 'fonte'
    from public.orcamento_base_custos where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'$$,
  $$values (4, 'Biólogo', null::text)$$,
  'tabela gravada na ordem, com nomes aparados e fonte opcional'
);

-- ---------------------------------------------------------------------------
-- Orçamento pela tabela
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select public.criar_orcamento('f0000000-0000-4000-8000-0000000000d1', 'c0000000-0000-4000-8000-00000000000a',
      'e0000000-0000-4000-8000-0000000000d1', 'Licença com fauna')$$,
  'cria o orçamento'
);

select results_eq(
  $$select forma_preco, jsonb_array_length(base_horas_venda), jsonb_array_length(base_custo_hora_profissao)
    from public.orcamento where id = 'f0000000-0000-4000-8000-0000000000d1'$$,
  $$values ('tabela', 4, 2)$$,
  'com hora de venda cadastrada, nasce pela tabela e copia a tabela e o custo por profissão'
);

select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000d1', 1, $json${
    "objeto": "Licença com fauna", "forma_preco": "tabela",
    "visitas": {"quantidade": 1},
    "itens": [
      {"id": "10000000-0000-4000-8000-0000000000d1", "descricao": "Vistoria e relatório", "minutos": 600, "hora_venda_id": "h-eng-jr"},
      {"id": "10000000-0000-4000-8000-0000000000d2", "descricao": "Inventário de fauna", "minutos": 480, "hora_venda_id": "h-bio-sr"},
      {"id": "10000000-0000-4000-8000-0000000000d3", "descricao": "Perícia", "minutos": 120, "hora_venda_id": "h-eng-pericia"}
    ],
    "despesas": [{"id": "20000000-0000-4000-8000-0000000000d1", "descricao": "Laboratório",
                  "estimativa_centavos": 5000, "tratamento": "incluida"}]
  }$json$::jsonb),
  2,
  'salva o orçamento pela tabela com horas de profissões diferentes'
);

select results_eq(
  $$select array_agg(i.preco_centavos order by i.ordem), o.preco_visitas_centavos
    from public.orcamento as o join public.orcamento_item as i on i.orcamento_id = o.id
    where o.id = 'f0000000-0000-4000-8000-0000000000d1' group by o.preco_visitas_centavos$$,
  $$values (array[216228, 242283, 72075]::bigint[], 25000::bigint)$$,
  '10h × 214,19, 8h × 300,00 e 2h × 356,98, com os 50 da despesa repartidos; visita fixa de 250'
);

select results_eq(
  $$select total_centavos from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a', 'horizonte')$$,
  $$values (555586::bigint)$$,
  'a lista soma itens e visita'
);

select results_eq(
  $$select j ->> 'forma_preco', jsonb_array_length(j -> 'base' -> 'horas_venda'),
           jsonb_array_length(j -> 'base' -> 'custo_hora_profissao'), j -> 'itens' -> 1 ->> 'hora_venda_id'
    from public.obter_orcamento('f0000000-0000-4000-8000-0000000000d1') as j$$,
  $$values ('tabela', 4, 2, 'h-bio-sr')$$,
  'o detalhe traz a forma de preço, a tabela, o custo por profissão e a hora de cada item'
);

select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000d1', 2, $json${
    "objeto": "Licença com fauna", "forma_preco": "tabela",
    "itens": [{"id": "10000000-0000-4000-8000-0000000000d1", "descricao": "Vistoria", "minutos": 600,
               "hora_venda_id": "nao-existe"}]
  }$json$::jsonb),
  3,
  'item com hora de venda que não existe na base ainda salva'
);

select results_eq(
  $$select (select preco_centavos from public.orcamento_item where id = '10000000-0000-4000-8000-0000000000d1'),
           (select total_centavos from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a', 'horizonte'))$$,
  $$values (0::bigint, null::bigint)$$,
  'mas o preço fica pendente (zero no item, nulo na lista)'
);

select throws_ok(
  $$select public.salvar_orcamento('f0000000-0000-4000-8000-0000000000d1', 3,
      '{"objeto": "Licença com fauna", "forma_preco": "chute"}'::jsonb)$$,
  '22023', 'forma_de_preco_invalida',
  'forma de preço desconhecida é recusada'
);

-- ---------------------------------------------------------------------------
-- Pela margem, o custo do item é o da profissão da hora escolhida
-- ---------------------------------------------------------------------------
select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000d1', 3, $json${
    "objeto": "Licença com fauna", "forma_preco": "margem", "margem_pb": 2000,
    "itens": [
      {"id": "10000000-0000-4000-8000-0000000000d1", "descricao": "Vistoria", "minutos": 600, "hora_venda_id": "h-eng-jr"},
      {"id": "10000000-0000-4000-8000-0000000000d2", "descricao": "Fauna", "minutos": 480, "hora_venda_id": "h-bio-sr"},
      {"id": "10000000-0000-4000-8000-0000000000d4", "descricao": "Muro", "minutos": 60, "hora_venda_id": "h-civil"}
    ]
  }$json$::jsonb),
  4,
  'o mesmo orçamento pode ir para a margem'
);

-- Custos: 10h × (79,49 + 0,96) = 804,50 · 8h × (57,47 + 0,96) = 467,44 · 1h × (72,12 + 0,96) = 73,08
-- (engenheiro civil sem ninguém da profissão: média da equipe). O preço usa as horas de venda mais as contas, com acréscimo de 20%.
select results_eq(
  $$select array_agg(preco_centavos order by ordem) from public.orcamento_item
    where orcamento_id = 'f0000000-0000-4000-8000-0000000000d1'$$,
  $$values (array[258180, 288922, 30115]::bigint[])$$,
  'pela margem, cada item usa a hora técnica da profissão; sem ninguém da profissão, a média'
);

-- Mesmo exemplo do domínio: 3 × R$ 214,19 + 3 × R$ 0,96, com 30%.
select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000d1', 4, $json${
    "objeto": "Exemplo hora de venda", "forma_preco": "margem", "margem_pb": 3000,
    "visitas": {"quantidade": 0},
    "itens": [
      {"id": "10000000-0000-4000-8000-0000000000d1", "descricao": "Etapa 1", "minutos": 60, "hora_venda_id": "h-eng-jr"},
      {"id": "10000000-0000-4000-8000-0000000000d2", "descricao": "Etapa 2", "minutos": 60, "hora_venda_id": "h-eng-jr"},
      {"id": "10000000-0000-4000-8000-0000000000d4", "descricao": "Etapa 3", "minutos": 60, "hora_venda_id": "h-eng-jr"}
    ], "despesas": []
  }$json$::jsonb),
  5,
  'salva o exemplo de três horas de venda com acréscimo de 30%'
);
select results_eq(
  $$select sum(preco_centavos)::bigint from public.orcamento_item where orcamento_id = 'f0000000-0000-4000-8000-0000000000d1'$$,
  $$values (83909::bigint)$$,
  'três horas de 214,19 mais contas de 2,88, com 30%, totalizam 839,09'
);

-- ---------------------------------------------------------------------------
-- Isolamento
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select results_eq(
  $$select (select count(*) from public.orcamento_base_equipe), (select count(*) from public.orcamento_base_custos),
           (select count(*) from public.orcamento_item)$$,
  $$values (0::bigint, 0::bigint, 0::bigint)$$,
  'Equipe (Ana) não lê piso, tabela, custo por profissão nem preços'
);

select * from finish();

rollback;
