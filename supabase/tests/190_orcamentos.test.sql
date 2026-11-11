-- Orçamentos, fatia 1 (ORC-02, ORC-03, ORC-04): só a Gestão lê e escreve; numeração por
-- consultoria e ano; rascunho salvo inteiro com controle otimista; base de custos copiada;
-- preço automático calculado no banco; despesa a cotar; composição da hora pela equipe (P9/P10);
-- isolamento entre consultorias; FK composta.
begin;

select plan(48);

select testes.criar_dados_sinteticos();

-- Empreendimentos de apoio (um em cada consultoria)
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_empreendimento('e0000000-0000-4000-8000-0000000000f1',
  'c0000000-0000-4000-8000-00000000000a', 'Indústria Horizonte');
select testes.autenticar_como('gustavo@verdesul.test');
select public.criar_empreendimento('e0000000-0000-4000-8000-0000000000f2',
  'c0000000-0000-4000-8000-00000000000b', 'Posto Rota Sul');

-- ---------------------------------------------------------------------------
-- Criar: só a Gestão, numerado, idempotente
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select throws_ok(
  $$select public.criar_orcamento('f0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a',
      'e0000000-0000-4000-8000-0000000000f1', 'Licenciamento (LO)')$$,
  '42501', 'sem_permissao',
  'Equipe (Ana) não cria orçamento'
);

select testes.autenticar_como('eduardo@filtroville.test');

select is(
  public.criar_orcamento('f0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a',
    'e0000000-0000-4000-8000-0000000000f1', '  Licenciamento (LO)  '),
  'f0000000-0000-4000-8000-000000000001'::uuid,
  'Gestão (Eduardo) cria o rascunho'
);

select results_eq(
  $$select o.sequencia, o.revisao, o.situacao::text, o.objeto, m.nome,
           o.ano = extract(year from (now() at time zone 'America/Sao_Paulo'))::integer,
           o.base_registrada_em is null
    from public.orcamento as o join public.membro as m on m.id = o.criado_por
    where o.id = 'f0000000-0000-4000-8000-000000000001'$$,
  $$values (1, 1, 'rascunho', 'Licenciamento (LO)', 'Eduardo Karnopp', true, true)$$,
  'nasce como rascunho nº 1, revisão 1, no ano do fuso da consultoria e sem base de custos'
);

select is(
  public.criar_orcamento('f0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a',
    'e0000000-0000-4000-8000-0000000000f1', 'Licenciamento (LO)'),
  'f0000000-0000-4000-8000-000000000001'::uuid,
  'repetir a criação devolve o mesmo orçamento'
);

select lives_ok(
  $$select public.criar_orcamento('f0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-00000000000a',
      'e0000000-0000-4000-8000-0000000000f1', 'Laudo de ruído')$$,
  'segundo orçamento do ano'
);

select results_eq(
  $$select sequencia from public.orcamento order by sequencia$$,
  $$values (1), (2)$$,
  'repetir não duplica e a numeração segue a ordem'
);

select throws_ok(
  $$select public.criar_orcamento(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a',
      'e0000000-0000-4000-8000-0000000000f1', '   ')$$,
  '22023', 'objeto_obrigatorio',
  'objeto vazio é recusado'
);

select throws_ok(
  $$select public.criar_orcamento(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a',
      'e0000000-0000-4000-8000-0000000000f2', 'Empreendimento de outra consultoria')$$,
  '22023', 'empreendimento_invalido',
  'empreendimento de outra consultoria é recusado'
);

-- ---------------------------------------------------------------------------
-- Base de custos: só a Gestão; percentuais precisam deixar preço possível
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select throws_ok(
  $$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      9500, 960000, 320, 3000, 2500, 600, 0, 199, 400)$$,
  '42501', 'sem_permissao',
  'Equipe não salva a base de custos'
);

select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      9500, 960000, 320, 8000, 2500, 1600, 400, 199, 400)$$,
  '22023', 'percentuais_invalidos',
  'margem + tributos + taxas em 100% não tem preço possível'
);

select throws_ok(
  $$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      9500, 960000, 0, 3000, 2500, 600, 0, 199, 400)$$,
  '22023', 'base_invalida',
  'horas faturáveis zeradas são recusadas (rateio nunca é zero)'
);

select lives_ok(
  $$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      9500, 960000, 320, 3000, 2500, 600, 0, 199, 400)$$,
  'Gestão salva a base de custos'
);

select lives_ok(
  $$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      9500, 960000, 320, 3000, 2500, 600, 0, 199, 400)$$,
  'salvar de novo substitui a linha única'
);

select results_eq(
  $$select count(*), max(row_version) from public.orcamento_base_custos$$,
  $$values (1::bigint, 2)$$,
  'uma base por consultoria, com a versão incrementada'
);

-- ---------------------------------------------------------------------------
-- Salvar o rascunho inteiro
-- ---------------------------------------------------------------------------
select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-000000000001', 1, $json${
    "objeto": "Licenciamento (LO)", "destinatario": " Marina Couto ", "validade_dias": 30,
    "premissas": ["Uma visita técnica", "  "], "exclusoes": ["EIA/RIMA"],
    "itens": [
      {"id": "10000000-0000-4000-8000-000000000001", "descricao": "Visita técnica", "minutos": 480,
       "preco_centavos": 170000, "custo_direto_extra_centavos": 24000},
      {"id": "10000000-0000-4000-8000-000000000002", "descricao": "RCA/PCA e PGRS", "minutos": 1440,
       "preco_centavos": 510000, "custo_direto_extra_centavos": 26000},
      {"id": "10000000-0000-4000-8000-000000000003", "descricao": "Protocolo", "minutos": 600,
       "preco_centavos": 210000, "custo_direto_extra_centavos": 0}
    ],
    "despesas": [
      {"id": "20000000-0000-4000-8000-000000000001", "descricao": "Taxa do órgão",
       "estimativa_centavos": 341200, "tratamento": "cliente_direto"},
      {"id": "20000000-0000-4000-8000-000000000002", "descricao": "Análises laboratoriais",
       "estimativa_centavos": null, "tratamento": "incluida"}
    ],
    "parcelas": [
      {"id": "30000000-0000-4000-8000-000000000001", "descricao": "Assinatura do contrato", "dias": 3, "percentual_pb": 4000},
      {"id": "30000000-0000-4000-8000-000000000002", "descricao": "Protocolo no órgão", "dias": 5, "percentual_pb": 3000},
      {"id": "30000000-0000-4000-8000-000000000003", "descricao": "Emissão da licença", "percentual_pb": 3000}
    ]}$json$::jsonb),
  2,
  'salvar devolve a nova versão'
);

select results_eq(
  $$select o.destinatario, o.premissas, o.base_hora_tecnica_centavos, o.base_custo_fixo_hora_centavos,
           o.base_margem_minima_pb,
           (select count(*) from public.orcamento_item where orcamento_id = o.id),
           (select count(*) from public.orcamento_despesa where orcamento_id = o.id),
           (select sum(percentual_pb) from public.orcamento_parcela where orcamento_id = o.id)
    from public.orcamento as o where o.id = 'f0000000-0000-4000-8000-000000000001'$$,
  $$values ('Marina Couto', array['Uma visita técnica'], 9500::bigint, 3000::bigint, 2500,
            3::bigint, 2::bigint, 10000::bigint)$$,
  'grava textos aparados, listas e a base de custos atual (custo fixo por hora = 9.600 ÷ 320)'
);

select results_eq(
  $$select (select estimativa_centavos from public.orcamento_despesa
            where id = '20000000-0000-4000-8000-000000000002'),
           (select array_agg(dias order by ordem) from public.orcamento_parcela
            where orcamento_id = 'f0000000-0000-4000-8000-000000000001')$$,
  $$values (null::bigint, array[3, 5, 0])$$,
  'despesa a cotar fica nula (nunca zero) e cada parcela guarda os dias após o marco'
);

select throws_ok(
  $$select public.salvar_orcamento('f0000000-0000-4000-8000-000000000001', 1,
      '{"objeto": "Licenciamento (LO)"}'::jsonb)$$,
  'P0001', 'conflito_de_versao',
  'versão antiga é recusada (controle otimista)'
);

select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-000000000001', 2, $json${
    "objeto": "Licenciamento (LO)", "validade_dias": 45,
    "itens": [
      {"id": "10000000-0000-4000-8000-000000000003", "descricao": "Protocolo e acompanhamento",
       "minutos": 600, "preco_centavos": 210000},
      {"id": "10000000-0000-4000-8000-000000000001", "descricao": "Visita técnica", "minutos": 480,
       "preco_centavos": 170000, "custo_direto_extra_centavos": 24000},
      {"id": "10000000-0000-4000-8000-000000000004", "descricao": "Revisão técnica", "minutos": 60,
       "preco_automatico": true, "preco_centavos": 1}
    ]}$json$::jsonb),
  3,
  'salvar de novo com menos itens e outra ordem'
);

select results_eq(
  $$select descricao, ordem from public.orcamento_item
    where orcamento_id = 'f0000000-0000-4000-8000-000000000001' order by ordem$$,
  $$values ('Protocolo e acompanhamento', 1), ('Visita técnica', 2), ('Revisão técnica', 3)$$,
  'o item que não veio sai, o que veio muda e a ordem é a da lista'
);

select results_eq(
  $$select preco_automatico, preco_centavos from public.orcamento_item
    where id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004')
    order by ordem$$,
  $$values (false, 170000::bigint), (true, 19531::bigint)$$,
  'preço manual vale o digitado; o automático é calculado no banco: 1h custa 95 + 30 = 125 ÷ (1 − 30% − 6%) = 195,31'
);

select results_eq(
  $$select (select count(*) from public.orcamento_despesa where orcamento_id = 'f0000000-0000-4000-8000-000000000001'),
           (select count(*) from public.orcamento_parcela where orcamento_id = 'f0000000-0000-4000-8000-000000000001'),
           (select validade_dias from public.orcamento where id = 'f0000000-0000-4000-8000-000000000001')$$,
  $$values (0::bigint, 0::bigint, 45)$$,
  'listas ausentes ficam vazias e o cabeçalho é atualizado'
);

select throws_ok(
  $$select public.salvar_orcamento('f0000000-0000-4000-8000-000000000002', 1, '{"objeto": "Laudo de ruído",
      "itens": [{"id": "10000000-0000-4000-8000-000000000001", "descricao": "Item de outro orçamento"}]}'::jsonb)$$,
  '22023', 'item_invalido',
  'id de item de outro orçamento não é reaproveitado'
);

select throws_ok(
  $$select public.salvar_orcamento('f0000000-0000-4000-8000-000000000002', 1, '{"objeto": "Laudo de ruído",
      "itens": [{"id": "10000000-0000-4000-8000-000000000009", "descricao": "Medição", "preco_centavos": -1}]}'::jsonb)$$,
  '22023', 'item_invalido',
  'preço negativo é recusado'
);

select throws_ok(
  $$select public.salvar_orcamento('f0000000-0000-4000-8000-000000000002', 1, '{"objeto": "Laudo de ruído",
      "despesas": [{"id": "20000000-0000-4000-8000-000000000009", "descricao": "ART", "tratamento": "talvez"}]}'::jsonb)$$,
  '22023', 'despesa_invalida',
  'toda despesa precisa de um tratamento conhecido'
);

select throws_ok(
  $$select public.salvar_orcamento('f0000000-0000-4000-8000-000000000002', 1, '{"objeto": "Laudo de ruído",
      "validade_dias": 0}'::jsonb)$$,
  '22023', 'validade_invalida',
  'validade fora de 1 a 365 dias é recusada'
);

-- Só rascunho é editável (ORC-04)
reset role;
update public.orcamento set situacao = 'enviada' where id = 'f0000000-0000-4000-8000-000000000002';
select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.salvar_orcamento('f0000000-0000-4000-8000-000000000002', 1, '{"objeto": "Laudo de ruído"}'::jsonb)$$,
  'P0001', 'orcamento_nao_editavel',
  'proposta enviada não é editada no lugar'
);

-- ---------------------------------------------------------------------------
-- Leitura: lista, detalhe e auditoria
-- ---------------------------------------------------------------------------
select results_eq(
  $$select sequencia, empreendimento_nome, total_centavos, total
    from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a', 'horizonte')
    order by sequencia$$,
  $$values (1, 'Indústria Horizonte', 399531::bigint, 2::bigint),
           (2, 'Indústria Horizonte', 0::bigint, 2::bigint)$$,
  'a lista traz o total dos itens e o total de linhas'
);

select results_eq(
  $$select (j ->> 'row_version')::integer, jsonb_array_length(j -> 'itens'),
           (j -> 'base' ->> 'custo_fixo_hora_centavos')::bigint, j -> 'itens' -> 0 ->> 'descricao'
    from public.obter_orcamento('f0000000-0000-4000-8000-000000000001') as j$$,
  $$values (3, 3, 3000::bigint, 'Protocolo e acompanhamento')$$,
  'o detalhe traz cabeçalho, base e itens na ordem'
);

select ok(
  (select count(*) from public.auditoria where entidade = 'orcamento_item') >= 4,
  'itens do orçamento são auditados'
);

-- ---------------------------------------------------------------------------
-- Composição pela equipe (P9 e P10): hora técnica e horas faturáveis derivadas no banco
-- ---------------------------------------------------------------------------
select lives_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      1, 960000, 1, 3000, 2500, 600, 0, 199, 400, $json$[
      {"id": "40000000-0000-4000-8000-000000000001", "descricao": "Sócio técnico", "socio": true,
       "custo_mensal_centavos": 1000000, "horas_disponiveis_mes": 160, "aproveitamento_pb": 4000, "parte_tecnica_pb": 6000},
      {"id": "40000000-0000-4000-8000-000000000002", "descricao": "Analista", "socio": false,
       "custo_mensal_centavos": 500000, "horas_disponiveis_mes": 168, "aproveitamento_pb": 7500, "parte_tecnica_pb": 10000},
      {"id": "40000000-0000-4000-8000-000000000003", "descricao": "Administrativo", "socio": false,
       "custo_mensal_centavos": 300000, "horas_disponiveis_mes": 168, "aproveitamento_pb": 0, "parte_tecnica_pb": 0}
    ]$json$::jsonb)$sql$,
  'Gestão salva a base composta pela equipe (hora e horas enviadas são ignoradas)'
);

select results_eq(
  $$select b.hora_tecnica_centavos, b.horas_faturaveis_mes, b.custos_fixos_equipe_centavos,
           (select count(*) from public.orcamento_base_equipe as e where e.consultoria_id = b.consultoria_id)
    from public.orcamento_base_custos as b where b.consultoria_id = 'c0000000-0000-4000-8000-00000000000a'$$,
  $$values (5789::bigint, 190.00::numeric, 700000::bigint, 3::bigint)$$,
  'técnico 11.000 ÷ 190 h faturáveis = 57,89/h; pró-labore administrativo e apoio (7.000) vão para o rateio'
);

select throws_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      1, 960000, 1, 3000, 2500, 600, 0, 199, 400, '[{"id": "40000000-0000-4000-8000-000000000009",
      "descricao": "Sem horas", "custo_mensal_centavos": 100000, "horas_disponiveis_mes": 160,
      "aproveitamento_pb": 0, "parte_tecnica_pb": 10000}]'::jsonb)$sql$,
  '22023', 'equipe_sem_horas_faturaveis',
  'equipe sem nenhuma hora faturável é recusada'
);

select throws_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      1, 960000, 1, 3000, 2500, 600, 0, 199, 400, '[{"id": "40000000-0000-4000-8000-000000000009",
      "descricao": "Aproveitamento impossível", "custo_mensal_centavos": 100000, "horas_disponiveis_mes": 160,
      "aproveitamento_pb": 10001, "parte_tecnica_pb": 10000}]'::jsonb)$sql$,
  '22023', 'equipe_invalida',
  'aproveitamento acima de 100% é recusado'
);

select lives_ok(
  $$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      9500, 960000, 320, 3000, 2500, 600, 0, 199, 400, '[]'::jsonb)$$,
  'lista vazia volta aos valores digitados'
);

select results_eq(
  $$select b.hora_tecnica_centavos, b.horas_faturaveis_mes, b.custos_fixos_equipe_centavos,
           (select count(*) from public.orcamento_base_equipe as e where e.consultoria_id = b.consultoria_id)
    from public.orcamento_base_custos as b where b.consultoria_id = 'c0000000-0000-4000-8000-00000000000a'$$,
  $$values (9500::bigint, 320.00::numeric, 0::bigint, 0::bigint)$$,
  'sem composição, vale o digitado e a remuneração administrativa zera'
);

select lives_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      1, 960000, 1, 3000, 2500, 600, 0, 199, 400, $json$[
      {"id": "40000000-0000-4000-8000-000000000001", "descricao": "Sócio técnico", "socio": true,
       "custo_mensal_centavos": 1000000, "horas_disponiveis_mes": 160, "aproveitamento_pb": 4000, "parte_tecnica_pb": 6000},
      {"id": "40000000-0000-4000-8000-000000000002", "descricao": "Analista", "socio": false,
       "custo_mensal_centavos": 500000, "horas_disponiveis_mes": 168, "aproveitamento_pb": 7500, "parte_tecnica_pb": 10000},
      {"id": "40000000-0000-4000-8000-000000000003", "descricao": "Administrativo", "socio": false,
       "custo_mensal_centavos": 300000, "horas_disponiveis_mes": 168, "aproveitamento_pb": 0, "parte_tecnica_pb": 0}
    ]$json$::jsonb)$sql$,
  'volta a compor pela equipe'
);

select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-000000000001', 3, $json${
    "objeto": "Licenciamento (LO)",
    "itens": [{"id": "10000000-0000-4000-8000-000000000004", "descricao": "Revisão técnica", "minutos": 60,
               "preco_automatico": true}]}$json$::jsonb),
  4,
  'o rascunho salvo de novo passa a usar a base composta'
);

select results_eq(
  $$select o.base_hora_tecnica_centavos, o.base_custo_fixo_hora_centavos, i.preco_centavos
    from public.orcamento as o join public.orcamento_item as i on i.orcamento_id = o.id
    where o.id = 'f0000000-0000-4000-8000-000000000001'$$,
  $$values (5789::bigint, 8737::bigint, 22697::bigint)$$,
  'rateio = (9.600 + 7.000) ÷ 190 = 87,37/h; 1h custa 57,89 + 87,37 = 145,26 ÷ 0,64 = 226,97'
);

-- ---------------------------------------------------------------------------
-- Equipe e outra consultoria não leem nada
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select results_eq(
  $$select (select count(*) from public.orcamento), (select count(*) from public.orcamento_item),
           (select count(*) from public.orcamento_base_custos),
           (select count(*) from public.orcamento_base_equipe),
           (select count(*) from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a'))$$,
  $$values (0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint)$$,
  'Equipe (Ana) recebe zero linhas de orçamento, de custos e da remuneração da equipe'
);

select is(
  public.obter_base_de_custos('c0000000-0000-4000-8000-00000000000a'), null::jsonb,
  'Equipe não abre a base de custos nem a composição'
);

select is(
  public.obter_orcamento('f0000000-0000-4000-8000-000000000001'), null::jsonb,
  'Equipe não abre o detalhe'
);

select testes.autenticar_como('gustavo@verdesul.test');

select results_eq(
  $$select (select count(*) from public.orcamento), (select count(*) from public.orcamento_item),
           (select count(*) from public.orcamento_base_custos),
           (select count(*) from public.orcamento_base_equipe),
           (select count(*) from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a'))$$,
  $$values (0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint)$$,
  'Gestão de outra consultoria (Gustavo) recebe zero linhas, sem erro'
);

select throws_ok(
  $$select public.salvar_orcamento('f0000000-0000-4000-8000-000000000001', 3, '{"objeto": "Invasão"}'::jsonb)$$,
  '42501', 'sem_permissao',
  'Gestão de outra consultoria não salva orçamento alheio'
);

select throws_ok(
  $$select public.criar_orcamento('f0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000b',
      'e0000000-0000-4000-8000-0000000000f2', 'Mesmo id')$$,
  'P0001', 'orcamento_existente',
  'id de orçamento de A não é reaproveitado em B'
);

select lives_ok(
  $$select public.criar_orcamento('f0000000-0000-4000-8000-0000000000b1', 'c0000000-0000-4000-8000-00000000000b',
      'e0000000-0000-4000-8000-0000000000f2', 'Outorga')$$,
  'a numeração de B é independente da de A'
);

select throws_ok(
  $$select public.salvar_orcamento('f0000000-0000-4000-8000-0000000000b1', 1, '{"objeto": "Outorga",
      "itens": [{"id": "10000000-0000-4000-8000-0000000000b1", "descricao": "Requerimento", "minutos": 120,
                 "preco_automatico": true}]}'::jsonb)$$,
  '22023', 'preco_automatico_sem_base',
  'sem custos e taxas configurados não há preço automático (nunca vira zero)'
);

-- FK composta: item de B não aponta para orçamento de A, nem como dono da tabela
reset role;

select throws_ok(
  $$insert into public.orcamento_item (consultoria_id, orcamento_id, ordem, descricao)
    values ('c0000000-0000-4000-8000-00000000000b', 'f0000000-0000-4000-8000-000000000001', 1, 'Cruzado')$$,
  '23503', null,
  'FK composta impede item de B em orçamento de A'
);

select * from finish();

rollback;
