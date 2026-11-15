-- Titular pessoa física: empreendimento e cliente do orçamento aceitam CNPJ ou CPF (o CPF
-- confere os dígitos verificadores); o CNPJ continua aceito como antes; outra consultoria não
-- vê o CPF gravado.
begin;

select plan(7);

select testes.criar_dados_sinteticos();

select testes.autenticar_como('ana@filtroville.test');

select is(
  public.criar_empreendimento('e0000000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
    'Supressão de vegetação no sítio', 'João da Silva', '529.982.247-25'),
  'e0000000-0000-4000-8000-0000000000f1'::uuid,
  'empreendimento aceita CPF válido'
);

select is(
  (select cnpj from public.empreendimento where id = 'e0000000-0000-4000-8000-0000000000f1'),
  '52998224725',
  'grava o CPF só com os 11 dígitos'
);

select throws_ok(
  $$select public.criar_empreendimento(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a',
      'CPF errado', null, '529.982.247-26')$$,
  '22023', 'cpf_invalido',
  'CPF com dígito verificador errado é recusado'
);

select lives_ok(
  $$select public.criar_empreendimento(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a',
      'Empresa de sempre', null, '11.222.333/0001-81')$$,
  'CNPJ continua aceito'
);

select testes.autenticar_como('eduardo@filtroville.test');

select is(
  public.criar_orcamento('f0000000-0000-4000-8000-0000000000f2', 'c0000000-0000-4000-8000-00000000000a', null,
    'Autorização de corte', '{"nome": "João da Silva", "cnpj": "529.982.247-25"}'::jsonb),
  'f0000000-0000-4000-8000-0000000000f2'::uuid,
  'cliente do orçamento aceita CPF'
);

select is(
  (select prospecto_cnpj from public.orcamento where id = 'f0000000-0000-4000-8000-0000000000f2'),
  '52998224725',
  'grava o CPF do cliente só com os 11 dígitos'
);

-- Negativo: Gestão de outra consultoria não lê o empreendimento com CPF.
select testes.autenticar_como('gustavo@verdesul.test');

select is(
  (select count(*) from public.empreendimento where id = 'e0000000-0000-4000-8000-0000000000f1'),
  0::bigint,
  'outra consultoria não vê o empreendimento nem o CPF'
);

select * from finish();
rollback;
