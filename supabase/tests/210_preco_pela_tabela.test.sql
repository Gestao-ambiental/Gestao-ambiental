-- Preço pela tabela de hora de venda e remuneração pelo piso (12/11/2026): níveis na base; quem
-- está "pelo piso" recebe horas × piso por hora; orçamento novo nasce pela tabela; preço do item =
-- horas × hora de venda + outros custos, com despesa incluída repartida e visita com preço fixo;
-- item sem nível válido deixa o preço pendente; só a Gestão da consultoria lê.
begin;

select plan(16);

select testes.criar_dados_sinteticos();

select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_empreendimento('e0000000-0000-4000-8000-0000000000d1',
  'c0000000-0000-4000-8000-00000000000a', 'Indústria Horizonte');

-- ---------------------------------------------------------------------------
-- Base: níveis, piso por hora e equipe pelo piso
-- ---------------------------------------------------------------------------
select throws_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      9500, 25000, 260, 3000, 0, 0, 0, 0, 0, '[]'::jsonb, '[]'::jsonb, 25000, 0,
      '[{"nome": "Júnior", "valor_centavos": 21419}, {"nome": " júnior ", "valor_centavos": 1}]'::jsonb, 7949)$sql$,
  '22023', 'niveis_invalidos',
  'dois níveis com o mesmo nome são recusados'
);

select lives_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      1, 25000, 1, 3000, 0, 0, 0, 0, 0, $json$[
      {"id": "40000000-0000-4000-8000-0000000000d1", "descricao": "Sócio 1", "socio": true, "pelo_piso": true,
       "horas_disponiveis_mes": 173, "aproveitamento_pb": 10000, "parte_tecnica_pb": 10000},
      {"id": "40000000-0000-4000-8000-0000000000d2", "descricao": "Sócia 2", "socio": true, "pelo_piso": true,
       "custo_mensal_centavos": 1, "horas_disponiveis_mes": 87, "aproveitamento_pb": 10000, "parte_tecnica_pb": 10000}
    ]$json$::jsonb, '[]'::jsonb, 25000, 0, $json$[
      {"nome": " Júnior ", "valor_centavos": 21419},
      {"nome": "Sênior", "valor_centavos": 35698},
      {"nome": "Máster", "valor_centavos": 44622}
    ]$json$::jsonb, 7949)$sql$,
  'Gestão salva níveis, piso por hora e equipe pelo piso'
);

select results_eq(
  $$select array_agg(e.custo_mensal_centavos order by e.ordem), bool_and(e.pelo_piso),
           (select hora_tecnica_centavos from public.orcamento_base_custos where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
           (select horas_faturaveis_mes from public.orcamento_base_custos where consultoria_id = 'c0000000-0000-4000-8000-00000000000a')
    from public.orcamento_base_equipe as e where e.consultoria_id = 'c0000000-0000-4000-8000-00000000000a'$$,
  $$values (array[1375177, 691563]::bigint[], true, 7949::bigint, 260.00::numeric)$$,
  'pelo piso: 173 h e 87 h × 79,49 (o custo enviado é ignorado); hora técnica = 20.667,40 ÷ 260 h'
);

select results_eq(
  $$select niveis_hora -> 0 ->> 'nome', jsonb_array_length(niveis_hora), piso_hora_centavos
    from public.orcamento_base_custos where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'$$,
  $$values ('Júnior', 3, 7949::bigint)$$,
  'níveis gravados com nome aparado, na ordem'
);

-- ---------------------------------------------------------------------------
-- Orçamento pela tabela
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select public.criar_orcamento('f0000000-0000-4000-8000-0000000000d1', 'c0000000-0000-4000-8000-00000000000a',
      'e0000000-0000-4000-8000-0000000000d1', 'RAP')$$,
  'cria o orçamento'
);

select results_eq(
  $$select forma_preco, jsonb_array_length(base_niveis_hora) from public.orcamento
    where id = 'f0000000-0000-4000-8000-0000000000d1'$$,
  $$values ('tabela', 3)$$,
  'com hora de venda cadastrada, o orçamento nasce pela tabela e copia os níveis'
);

select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000d1', 1, $json${
    "objeto": "RAP", "forma_preco": "tabela",
    "visitas": {"quantidade": 1},
    "itens": [
      {"id": "10000000-0000-4000-8000-0000000000d1", "descricao": "Relatório", "minutos": 600, "nivel": "Júnior"},
      {"id": "10000000-0000-4000-8000-0000000000d2", "descricao": "ART", "minutos": 60, "nivel": "Júnior",
       "custo_direto_extra_centavos": 10000}
    ],
    "despesas": [{"id": "20000000-0000-4000-8000-0000000000d1", "descricao": "Laboratório",
                  "estimativa_centavos": 5000, "tratamento": "incluida"}]
  }$json$::jsonb),
  2,
  'salva o orçamento pela tabela'
);

select results_eq(
  $$select array_agg(i.preco_centavos order by i.ordem), o.preco_visitas_centavos
    from public.orcamento as o join public.orcamento_item as i on i.orcamento_id = o.id
    where o.id = 'f0000000-0000-4000-8000-0000000000d1' group by o.preco_visitas_centavos$$,
  $$values (array[218550, 32059]::bigint[], 25000::bigint)$$,
  '10h × 214,19 = 2.141,90 e 1h × 214,19 + 100 = 314,19; os 50 da despesa repartidos (43,60 e 6,40); visita fixa de 250'
);

select results_eq(
  $$select total_centavos from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a', 'horizonte')$$,
  $$values (275609::bigint)$$,
  'a lista soma itens e visita'
);

select results_eq(
  $$select j ->> 'forma_preco', jsonb_array_length(j -> 'base' -> 'niveis_hora'), j -> 'itens' -> 0 ->> 'nivel'
    from public.obter_orcamento('f0000000-0000-4000-8000-0000000000d1') as j$$,
  $$values ('tabela', 3, 'Júnior')$$,
  'o detalhe traz a forma de preço, os níveis da base e o nível de cada item'
);

select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000d1', 2, $json${
    "objeto": "RAP", "forma_preco": "tabela",
    "itens": [{"id": "10000000-0000-4000-8000-0000000000d1", "descricao": "Relatório", "minutos": 600,
               "nivel": "Doutor"}]
  }$json$::jsonb),
  3,
  'item com nível que não existe na base ainda salva'
);

select results_eq(
  $$select (select preco_centavos from public.orcamento_item where id = '10000000-0000-4000-8000-0000000000d1'),
           (select total_centavos from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a', 'horizonte'))$$,
  $$values (0::bigint, null::bigint)$$,
  'mas o preço fica pendente (zero no item, nulo na lista)'
);

select throws_ok(
  $$select public.salvar_orcamento('f0000000-0000-4000-8000-0000000000d1', 3,
      '{"objeto": "RAP", "forma_preco": "chute"}'::jsonb)$$,
  '22023', 'forma_de_preco_invalida',
  'forma de preço desconhecida é recusada'
);

select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000d1', 3, $json${
    "objeto": "RAP", "forma_preco": "margem", "margem_pb": 2000,
    "itens": [{"id": "10000000-0000-4000-8000-0000000000d1", "descricao": "Relatório", "minutos": 600}]
  }$json$::jsonb),
  4,
  'o mesmo orçamento pode voltar para a margem'
);

-- Pela margem: 10h × (79,49 + 0,96) = 804,50 ÷ 0,80 = 1.005,63
select results_eq(
  $$select preco_centavos from public.orcamento_item where id = '10000000-0000-4000-8000-0000000000d1'$$,
  $$values (100563::bigint)$$,
  'pela margem, o preço volta a sair do custo'
);

-- ---------------------------------------------------------------------------
-- Isolamento
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select results_eq(
  $$select (select count(*) from public.orcamento_base_equipe), (select count(*) from public.orcamento_base_custos),
           (select count(*) from public.orcamento_item)$$,
  $$values (0::bigint, 0::bigint, 0::bigint)$$,
  'Equipe (Ana) não lê piso, níveis nem preços'
);

select * from finish();

rollback;
