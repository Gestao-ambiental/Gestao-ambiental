-- Triagem vira orçamento (ADR-0056): sem valores da modalidade, o rascunho sai com a modalidade e a
-- taxa como repasse; salvos os valores, o próximo Orçar traz os itens e preços, sem repetir a taxa;
-- um modelo vivo por modalidade; idempotente; Equipe e outra consultoria não orçam nem leem.
begin;

set local timezone to 'America/Sao_Paulo';

select plan(20);

select testes.criar_dados_sinteticos();

select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_empreendimento('e7700000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-00000000000a', 'Cerâmica Itaum');

-- ---------------------------------------------------------------- sem valores cadastrados
select is(
  public.criar_orcamento_da_triagem('f7700000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a',
    'e7700000-0000-4000-8000-000000000001', 'trifasica', 'Licenciamento trifásico · Cerâmica Itaum',
    '{"descricao": "Taxa do IMA (Lei estadual 14.262/2007)", "estimativa_centavos": 312345}'),
  '{"orcamento_id": "f7700000-0000-4000-8000-000000000001", "modelo_id": null}'::jsonb,
  'sem valores da modalidade: rascunho sem modelo'
);
select results_eq(
  $$select o.modalidade, o.situacao::text,
           (select count(*) from public.orcamento_item as i where i.orcamento_id = o.id)
    from public.orcamento as o where o.id = 'f7700000-0000-4000-8000-000000000001'$$,
  $$values ('trifasica'::text, 'rascunho'::text, 0::bigint)$$,
  'rascunho com a modalidade e sem itens'
);
select results_eq(
  $$select descricao, estimativa_centavos, tratamento::text from public.orcamento_despesa
    where orcamento_id = 'f7700000-0000-4000-8000-000000000001'$$,
  $$values ('Taxa do IMA (Lei estadual 14.262/2007)'::text, 312345::bigint, 'cliente_direto'::text)$$,
  'a taxa entra como repasse pago direto pelo cliente, com o valor e a base legal'
);

-- A Gestão monta os itens e guarda como valores da modalidade.
select public.salvar_orcamento('f7700000-0000-4000-8000-000000000001',
  (select row_version from public.orcamento where id = 'f7700000-0000-4000-8000-000000000001'),
  $json${
    "objeto": "Licenciamento trifásico · Cerâmica Itaum", "forma_preco": "margem",
    "itens": [
      {"id": "17700000-0000-4000-8000-000000000001", "descricao": "LAP: estudo e protocolo", "minutos": 1200,
       "preco_fechado_centavos": 800000},
      {"id": "17700000-0000-4000-8000-000000000002", "descricao": "LAI e LAO: acompanhamento", "minutos": 600,
       "preco_fechado_centavos": 450000}
    ],
    "despesas": [{"id": "27700000-0000-4000-8000-000000000001", "descricao": "Taxa do IMA (Lei estadual 14.262/2007)",
                  "estimativa_centavos": 312345, "tratamento": "cliente_direto"},
                 {"id": "27700000-0000-4000-8000-000000000002", "descricao": "Laboratório", "tratamento": "reembolsavel"}],
    "parcelas": []
  }$json$::jsonb);

select is(
  public.salvar_valores_da_modalidade('f7700000-0000-4000-8000-000000000001',
    'a7700000-0000-4000-8000-000000000001', 'trifasica', 'Valores · Licenciamento trifásico'),
  'a7700000-0000-4000-8000-000000000001'::uuid,
  'guarda os itens como valores da modalidade'
);
select is(
  (select despesas from public.orcamento_modelo where id = 'a7700000-0000-4000-8000-000000000001'),
  '[{"descricao": "Laboratório", "tratamento": "reembolsavel"}]'::jsonb,
  'a taxa do órgão não vai para os valores'
);

-- ---------------------------------------------------------------- com valores cadastrados
select is(
  public.criar_orcamento_da_triagem('f7700000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-00000000000a',
    'e7700000-0000-4000-8000-000000000001', 'trifasica', 'Licenciamento trifásico · Cerâmica Itaum',
    '{"descricao": "Taxa do IMA (Lei estadual 14.262/2007)", "estimativa_centavos": 400000}') ->> 'modelo_id',
  'a7700000-0000-4000-8000-000000000001',
  'com valores: Orçar usa o modelo da modalidade'
);
select results_eq(
  $$select descricao, preco_fechado_centavos from public.orcamento_item
    where orcamento_id = 'f7700000-0000-4000-8000-000000000002' order by ordem$$,
  $$values ('LAP: estudo e protocolo'::text, 800000::bigint), ('LAI e LAO: acompanhamento', 450000::bigint)$$,
  'itens e valores importados'
);
select results_eq(
  $$select descricao, estimativa_centavos from public.orcamento_despesa
    where orcamento_id = 'f7700000-0000-4000-8000-000000000002' order by ordem$$,
  $$values ('Laboratório'::text, null::bigint), ('Taxa do IMA (Lei estadual 14.262/2007)', 400000::bigint)$$,
  'despesas dos valores a cotar e a taxa desta triagem, uma vez só'
);
select is(
  public.criar_orcamento_da_triagem('f7700000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-00000000000a',
    'e7700000-0000-4000-8000-000000000001', 'trifasica', 'Outro objeto', null) ->> 'orcamento_id',
  'f7700000-0000-4000-8000-000000000002',
  'repetir com o mesmo id devolve o mesmo rascunho'
);

-- Salvar de novo substitui: um vivo por modalidade, o anterior na lixeira.
select public.salvar_valores_da_modalidade('f7700000-0000-4000-8000-000000000002',
  'a7700000-0000-4000-8000-000000000002', 'trifasica', 'Valores · Licenciamento trifásico');
select results_eq(
  $$select id, excluido_em is null from public.orcamento_modelo where modalidade = 'trifasica' order by criado_em, id$$,
  $$values ('a7700000-0000-4000-8000-000000000001'::uuid, false), ('a7700000-0000-4000-8000-000000000002', true)$$,
  'um modelo vivo por modalidade; o anterior vai para a lixeira'
);

-- ---------------------------------------------------------------- triagem avulsa
select is(
  public.criar_orcamento_da_triagem(
    'f7700000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-00000000000a',
    null, 'trifasica', 'Licenciamento trifásico · Oficina Norte',
    '{"descricao": "Taxa do IMA", "estimativa_centavos": 42100}', '  Oficina Norte  '
  ) ->> 'modelo_id',
  'a7700000-0000-4000-8000-000000000002',
  'triagem avulsa também usa os valores da modalidade'
);
select results_eq(
  $$select empreendimento_id, prospecto_nome, modalidade, situacao::text
    from public.orcamento where id = 'f7700000-0000-4000-8000-000000000003'$$,
  $$values (null::uuid, 'Oficina Norte'::text, 'trifasica'::text, 'rascunho'::text)$$,
  'o rascunho usa o nome do prospecto sem vínculo com empreendimento'
);
select is(
  public.criar_orcamento_da_triagem(
    'f7700000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-00000000000a',
    null, 'trifasica', 'Outra tentativa',
    '{"descricao": "Taxa do IMA", "estimativa_centavos": 99900}', 'Oficina Norte'
  ) ->> 'orcamento_id',
  'f7700000-0000-4000-8000-000000000003',
  'repetir a criação para prospecto abre o mesmo rascunho'
);
select results_eq(
  $$select descricao, preco_fechado_centavos from public.orcamento_item
    where orcamento_id = 'f7700000-0000-4000-8000-000000000003' order by ordem$$,
  $$values ('LAP: estudo e protocolo'::text, 800000::bigint), ('LAI e LAO: acompanhamento', 450000::bigint)$$,
  'os itens e preços do modelo são importados uma vez para o prospecto'
);
select results_eq(
  $$select estimativa_centavos, tratamento::text from public.orcamento_despesa
    where orcamento_id = 'f7700000-0000-4000-8000-000000000003' and descricao like 'Taxa do IMA%'$$,
  $$values (42100::bigint, 'cliente_direto'::text)$$,
  'a taxa original do prospecto fica como repasse, sem duplicação'
);
select throws_ok(
  $$select public.criar_orcamento_da_triagem(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a',
      null, 'AuA', 'Autorização Ambiental', null, '   ')$$,
  '22023', 'prospecto_sem_nome',
  'um prospecto com nome em branco é recusado'
);

-- ---------------------------------------------------------------- acesso
select testes.autenticar_como('ana@filtroville.test');
select throws_ok(
  $$select public.criar_orcamento_da_triagem(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a',
      'e7700000-0000-4000-8000-000000000001', 'trifasica', 'X', null)$$,
  '42501', 'sem_permissao',
  'a Equipe não orça'
);

select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select public.criar_orcamento_da_triagem(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a',
      null, 'AuA', 'Autorização Ambiental', null, 'Oficina Norte')$$,
  '42501', 'sem_permissao',
  'Gestão de B também não orça para prospecto de A'
);
select throws_ok(
  $$select public.criar_orcamento_da_triagem(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a',
      'e7700000-0000-4000-8000-000000000001', 'trifasica', 'X', null)$$,
  '42501', 'sem_permissao',
  'Gestão de B não orça em A'
);
select is(
  (select count(*) from public.orcamento_modelo where modalidade is not null),
  0::bigint,
  'Gestão de B não lê os valores de A'
);

select * from finish();

rollback;
