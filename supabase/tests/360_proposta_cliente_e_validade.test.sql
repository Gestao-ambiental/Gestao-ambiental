-- Proposta: cliente contratante, CNPJ e unidade (Protótipo 21). Só a Gestão da consultoria lê;
-- Equipe e outra consultoria recebem nulo; prospecto sem empreendimento também.
begin;

select plan(8);

select testes.criar_dados_sinteticos();

select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_empreendimento('e0000000-0000-4000-8000-000000000361',
  'c0000000-0000-4000-8000-00000000000a', 'Granja Sol Nascente', 'Agro Sol Ltda.', '11222333000181',
  'Matriz');
select public.criar_empreendimento('e0000000-0000-4000-8000-000000000362',
  'c0000000-0000-4000-8000-00000000000a', 'Posto Rio Branco');
select public.criar_orcamento('f0000000-0000-4000-8000-000000000361', 'c0000000-0000-4000-8000-00000000000a',
  'e0000000-0000-4000-8000-000000000361', 'Licença de operação');
select public.criar_orcamento('f0000000-0000-4000-8000-000000000362', 'c0000000-0000-4000-8000-00000000000a',
  'e0000000-0000-4000-8000-000000000362', 'Outorga');

select has_function('public', 'obter_contratante_da_proposta', array['uuid'],
  'a leitura da proposta existe');

select results_eq(
  $$select j ->> 'cliente_nome', j ->> 'empreendimento_nome', j ->> 'empreendimento_cnpj',
           jsonb_array_length(j -> 'unidades'), j -> 'unidades' -> 0 ->> 'nome'
    from public.obter_contratante_da_proposta('f0000000-0000-4000-8000-000000000361') as j$$,
  $$values ('Agro Sol Ltda.', 'Granja Sol Nascente', '11222333000181', 1, 'Matriz')$$,
  'Gestão lê cliente contratante, CNPJ e a unidade do empreendimento'
);

select results_eq(
  $$select j ->> 'cliente_nome', j ->> 'empreendimento_cnpj', j -> 'unidades'
    from public.obter_contratante_da_proposta('f0000000-0000-4000-8000-000000000362') as j$$,
  $$values (null::text, null::text, '[]'::jsonb)$$,
  'sem cliente, CNPJ nem unidade: campos nulos e lista vazia'
);

select public.criar_unidade('70000000-0000-4000-8000-000000000361', 'e0000000-0000-4000-8000-000000000361',
  'Filial Araquari', 'Rod. BR-101, km 60');

select results_eq(
  $$select jsonb_array_length(j -> 'unidades'), j -> 'unidades' -> 0 ->> 'nome',
           j -> 'unidades' -> 0 ->> 'endereco'
    from public.obter_contratante_da_proposta('f0000000-0000-4000-8000-000000000361') as j$$,
  $$values (2, 'Filial Araquari', 'Rod. BR-101, km 60')$$,
  'várias unidades vêm em ordem de nome, com endereço'
);

select public.criar_orcamento('f0000000-0000-4000-8000-000000000363', 'c0000000-0000-4000-8000-00000000000a',
  null, 'Diagnóstico', '{"nome": "Cerâmica Nova"}'::jsonb);

select is(
  public.obter_contratante_da_proposta('f0000000-0000-4000-8000-000000000363'),
  null::jsonb,
  'orçamento de prospecto (sem empreendimento) devolve nulo'
);

-- ---------------------------------------------------------------- isolamento (testes negativos)
select testes.autenticar_como('ana@filtroville.test');

select is(
  public.obter_contratante_da_proposta('f0000000-0000-4000-8000-000000000361'),
  null::jsonb,
  'Equipe (Ana) não lê o contratante da proposta'
);

select testes.autenticar_como('gustavo@verdesul.test');

select is(
  public.obter_contratante_da_proposta('f0000000-0000-4000-8000-000000000361'),
  null::jsonb,
  'Gestão de outra consultoria (Gustavo) não lê o contratante da proposta'
);

select testes.autenticar_como_anonimo();

select throws_ok(
  $$select public.obter_contratante_da_proposta('f0000000-0000-4000-8000-000000000361')$$,
  '42501', null,
  'sem login, a função nem executa'
);

select * from finish();

rollback;
