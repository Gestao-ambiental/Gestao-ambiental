-- Orçamentos, fatia 1 (ORC-02, ORC-03, ORC-04): só a Gestão lê e escreve; numeração por
-- consultoria e ano; rascunho salvo inteiro com controle otimista; base de custos copiada;
-- preço calculado no banco com margem única no fim e repartido pelo custo (fatia 2); despesa a
-- cotar deixa o preço pendente; contas do mês e visitas técnicas; composição da hora pela equipe
-- (P9/P10); isolamento entre consultorias; FK composta.
begin;

select plan(63);

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
  $$values (true, 194047::bigint), (true, 19561::bigint)$$,
  'preço digitado é ignorado: total = (1.250 + 1.240 + 125 + 4 de assinatura) ÷ (1 − 30% − 6%) = 4.092,19, repartido pelo custo'
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
      "itens": [{"id": "10000000-0000-4000-8000-000000000009", "descricao": "Medição", "custo_direto_extra_centavos": -1}]}'::jsonb)$$,
  '22023', 'item_invalido',
  'outro custo negativo é recusado'
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
  $$values (1, 'Indústria Horizonte', 409219::bigint, 2::bigint),
           (2, 'Indústria Horizonte', null::bigint, 2::bigint)$$,
  'a lista traz o total dos itens e o total de linhas; sem base, o total é nulo (nunca zero)'
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
      {"id": "40000000-0000-4000-8000-000000000001", "membro_id": "d0000000-0000-4000-8000-0000000000a1", "socio": true,
       "custo_mensal_centavos": 1000000, "horas_disponiveis_mes": 160},
      {"id": "40000000-0000-4000-8000-000000000002", "membro_id": "d0000000-0000-4000-8000-0000000000a2", "socio": false,
       "custo_mensal_centavos": 500000, "horas_disponiveis_mes": 168},
      {"id": "40000000-0000-4000-8000-000000000003", "membro_id": "d0000000-0000-4000-8000-0000000000a3", "socio": false,
       "custo_mensal_centavos": 300000, "horas_disponiveis_mes": 168}
    ]$json$::jsonb)$sql$,
  'Gestão salva a base composta pela equipe (hora e horas enviadas são ignoradas)'
);

select results_eq(
  $$select b.hora_tecnica_centavos, b.horas_faturaveis_mes, b.custos_fixos_equipe_centavos,
           (select count(*) from public.orcamento_base_equipe as e where e.consultoria_id = b.consultoria_id)
    from public.orcamento_base_custos as b where b.consultoria_id = 'c0000000-0000-4000-8000-00000000000a'$$,
  $$values (3629::bigint, 496.00::numeric, 0::bigint, 3::bigint)$$,
  'hora técnica média = 18.000 ÷ 496 h = 36,29/h; nada da equipe vai para o rateio'
);

select results_eq(
  $$select array_agg(e.descricao order by e.ordem), b.custo_hora_membro -> 0 ->> 'hora_centavos'
    from public.orcamento_base_equipe as e
    join public.orcamento_base_custos as b on b.consultoria_id = e.consultoria_id
    where e.consultoria_id = 'c0000000-0000-4000-8000-00000000000a' group by b.custo_hora_membro$$,
  $$values (array['Eduardo Karnopp', 'Ana Ribeiro', 'Bruno Tavares'], '6250')$$,
  'cada linha é um membro (com o nome dele) e a hora de custo é custo ÷ horas: 10.000 ÷ 160 h = 62,50'
);

select throws_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      1, 960000, 1, 3000, 2500, 600, 0, 199, 400, '[{"id": "40000000-0000-4000-8000-000000000009",
      "membro_id": "d0000000-0000-4000-8000-0000000000a4", "custo_mensal_centavos": 100000,
      "horas_disponiveis_mes": 0}]'::jsonb)$sql$,
  '22023', 'equipe_sem_horas_faturaveis',
  'equipe sem nenhuma hora no mês é recusada'
);

select throws_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      1, 960000, 1, 3000, 2500, 600, 0, 199, 400, '[{"id": "40000000-0000-4000-8000-000000000009",
      "membro_id": "d0000000-0000-4000-8000-0000000000b2", "custo_mensal_centavos": 100000,
      "horas_disponiveis_mes": 160}]'::jsonb)$sql$,
  '22023', 'equipe_invalida',
  'membro de outra consultoria não entra na equipe'
);

select throws_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      1, 960000, 1, 3000, 2500, 600, 0, 199, 400, '[
      {"id": "40000000-0000-4000-8000-000000000009", "membro_id": "d0000000-0000-4000-8000-0000000000a4",
       "custo_mensal_centavos": 100000, "horas_disponiveis_mes": 160},
      {"id": "40000000-0000-4000-8000-00000000000a", "membro_id": "d0000000-0000-4000-8000-0000000000a4",
       "custo_mensal_centavos": 100000, "horas_disponiveis_mes": 160}]'::jsonb)$sql$,
  '22023', 'equipe_invalida',
  'o mesmo membro duas vezes é recusado'
);

select throws_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      1, 960000, 1, 3000, 2500, 600, 0, 199, 400, '[{"id": "40000000-0000-4000-8000-000000000009",
      "descricao": "Perfil sem login", "custo_mensal_centavos": 100000, "horas_disponiveis_mes": 160}]'::jsonb)$sql$,
  '22023', 'equipe_invalida',
  'linha sem membro (perfil sem login) é recusada'
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
      {"id": "40000000-0000-4000-8000-000000000001", "membro_id": "d0000000-0000-4000-8000-0000000000a1", "socio": true,
       "custo_mensal_centavos": 1000000, "horas_disponiveis_mes": 160},
      {"id": "40000000-0000-4000-8000-000000000002", "membro_id": "d0000000-0000-4000-8000-0000000000a2", "socio": false,
       "custo_mensal_centavos": 500000, "horas_disponiveis_mes": 168},
      {"id": "40000000-0000-4000-8000-000000000003", "membro_id": "d0000000-0000-4000-8000-0000000000a3", "socio": false,
       "custo_mensal_centavos": 300000, "horas_disponiveis_mes": 168}
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
  $$values (3629::bigint, 1935::bigint, 9319::bigint)$$,
  'rateio = 9.600 ÷ 496 h = 19,35/h; 1h custa 36,29 + 19,35 = 55,64; com a assinatura (4,00), ÷ 0,64 = 93,19'
);

-- ---------------------------------------------------------------------------
-- Fatia 2: contas do mês, visitas técnicas e margem escolhida no fim
-- ---------------------------------------------------------------------------
select lives_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      9500, 1, 320, 3000, 2500, 600, 0, 199, 400, '[]'::jsonb, $json$[
      {"descricao": " Aluguel e condomínio ", "valor_centavos": 800000},
      {"descricao": "Energia elétrica", "valor_centavos": 100000},
      {"descricao": "Internet", "valor_centavos": 60000}
    ]$json$::jsonb, 15000, 120)$sql$,
  'Gestão salva as contas do mês, o valor da visita e o custo por km'
);

select results_eq(
  $$select custos_fixos_mensais_centavos, custos_fixos_detalhe -> 0 ->> 'descricao',
           jsonb_array_length(custos_fixos_detalhe), valor_visita_centavos, custo_km_centavos
    from public.orcamento_base_custos where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'$$,
  $$values (960000::bigint, 'Aluguel e condomínio', 3, 15000::bigint, 120::bigint)$$,
  'o custo fixo do mês é a soma das contas (o total enviado é ignorado) e as descrições ficam aparadas'
);

select throws_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      9500, 1, 320, 3000, 2500, 600, 0, 199, 400, '[]'::jsonb,
      '[{"descricao": "  ", "valor_centavos": 100}]'::jsonb, 15000, 120)$sql$,
  '22023', 'contas_invalidas',
  'conta do mês sem descrição é recusada'
);

select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-000000000001', 4, $json${
    "objeto": "Licenciamento (LO)", "margem_pb": 2000,
    "visitas": {"quantidade": 2, "km_por_visita": 50, "outros_por_visita_centavos": 1000},
    "itens": [{"id": "10000000-0000-4000-8000-000000000004", "descricao": "Revisão técnica", "minutos": 60}],
    "parcelas": [{"id": "30000000-0000-4000-8000-000000000004", "descricao": "Assinatura do contrato",
                  "percentual_pb": 10000}]}$json$::jsonb),
  5,
  'salva a margem do orçamento e as visitas técnicas'
);

select results_eq(
  $$select i.preco_centavos, o.preco_visitas_centavos, o.margem_pb
    from public.orcamento as o join public.orcamento_item as i on i.orcamento_id = o.id
    where o.id = 'f0000000-0000-4000-8000-000000000001'$$,
  $$values (17701::bigint, 44000::bigint, 2000)$$,
  'serviços = (125 + 5,99 de taxas) ÷ (1 − 20% − 6%) = 177,01; visitas com preço fixo, sem margem: 2 × (150 + 50 km × 1,20 + 10) = 440'
);

select results_eq(
  $$select total_centavos from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a', 'horizonte')
    where sequencia = 1$$,
  $$values (61701::bigint)$$,
  'o total da lista soma os itens e a linha de visitas'
);

select results_eq(
  $$select (j ->> 'margem_pb')::integer, (j -> 'visitas' ->> 'quantidade')::integer,
           (j ->> 'preco_visitas_centavos')::bigint, (j -> 'base' ->> 'valor_visita_centavos')::bigint,
           jsonb_array_length(j -> 'base' -> 'custos_fixos_detalhe')
    from public.obter_orcamento('f0000000-0000-4000-8000-000000000001') as j$$,
  $$values (2000, 2, 44000::bigint, 15000::bigint, 3)$$,
  'o detalhe traz a margem, as visitas e a base com as contas do mês'
);

select throws_ok(
  $$select public.salvar_orcamento('f0000000-0000-4000-8000-000000000001', 5,
      '{"objeto": "Licenciamento (LO)", "margem_pb": 9400}'::jsonb)$$,
  '22023', 'percentuais_invalidos',
  'margem que, com tributos e taxas, chega a 100% é recusada'
);

select throws_ok(
  $$select public.salvar_orcamento('f0000000-0000-4000-8000-000000000001', 5,
      '{"objeto": "Licenciamento (LO)", "visitas": {"quantidade": -1}}'::jsonb)$$,
  '22023', 'visitas_invalidas',
  'quantidade de visitas negativa é recusada'
);

select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-000000000001', 5, $json${
    "objeto": "Licenciamento (LO)",
    "itens": [{"id": "10000000-0000-4000-8000-000000000004", "descricao": "Revisão técnica", "minutos": 60}],
    "despesas": [{"id": "20000000-0000-4000-8000-000000000003", "descricao": "Análises laboratoriais",
                  "estimativa_centavos": null, "tratamento": "incluida"}]}$json$::jsonb),
  6,
  'despesa incluída ainda a cotar não impede salvar'
);

select results_eq(
  $$select i.preco_centavos, o.preco_visitas_centavos,
           (select l.total_centavos from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a', 'horizonte') as l
            where l.sequencia = 1)
    from public.orcamento as o join public.orcamento_item as i on i.orcamento_id = o.id
    where o.id = 'f0000000-0000-4000-8000-000000000001'$$,
  $$values (0::bigint, 0::bigint, null::bigint)$$,
  'com despesa incluída a cotar o preço fica pendente: itens a zero e total nulo na lista'
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

select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000b1', 1, '{"objeto": "Outorga",
      "itens": [{"id": "10000000-0000-4000-8000-0000000000b1", "descricao": "Requerimento", "minutos": 120}]}'::jsonb),
  2,
  'sem custos e taxas configurados o rascunho salva, com o preço pendente'
);

select results_eq(
  $$select l.total_centavos, (select i.preco_centavos from public.orcamento_item as i
                              where i.id = '10000000-0000-4000-8000-0000000000b1')
    from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000b') as l$$,
  $$values (null::bigint, 0::bigint)$$,
  'preço pendente aparece como nulo na lista, nunca como zero'
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
