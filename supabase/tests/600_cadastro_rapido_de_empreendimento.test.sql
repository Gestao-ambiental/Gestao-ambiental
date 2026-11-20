-- Cadastro rápido de empreendimento no passo Documento da licença: empreendimento e unidade numa
-- transação, idempotente pelos ids; outra consultoria não cadastra nem enxerga nada.
begin;

select plan(11);

select testes.criar_dados_sinteticos();

select testes.autenticar_como('eduardo@filtroville.test');

select is(
  public.cadastrar_empreendimento_com_unidade(
    'e0000000-0000-4000-8000-0000000006e1', 'c0000000-0000-4000-8000-00000000000a',
    ' Indústria Horizonte Ltda. ', '11.222.333/0001-81',
    'f0000000-0000-4000-8000-0000000006f1', 'Matriz Joinville', 'Rua Dona Francisca, 8300, Joinville/SC'),
  'f0000000-0000-4000-8000-0000000006f1'::uuid,
  'Gestão cadastra empreendimento e unidade e recebe o id da unidade'
);

select results_eq(
  $$select e.nome, e.cnpj, u.nome, u.endereco
    from public.empreendimento as e
    join public.unidade as u on u.empreendimento_id = e.id
    where e.id = 'e0000000-0000-4000-8000-0000000006e1'$$,
  $$values ('Indústria Horizonte Ltda.', '11222333000181', 'Matriz Joinville',
            'Rua Dona Francisca, 8300, Joinville/SC')$$,
  'grava nome aparado, CNPJ só com dígitos, unidade com endereço'
);

select is(
  public.cadastrar_empreendimento_com_unidade(
    'e0000000-0000-4000-8000-0000000006e1', 'c0000000-0000-4000-8000-00000000000a',
    'Indústria Horizonte Ltda.', '11.222.333/0001-81',
    'f0000000-0000-4000-8000-0000000006f1', 'Matriz Joinville', null),
  'f0000000-0000-4000-8000-0000000006f1'::uuid,
  'repetir (erro de rede) devolve a mesma unidade'
);

select results_eq(
  $$select (select count(*) from public.empreendimento where id = 'e0000000-0000-4000-8000-0000000006e1'),
           (select count(*) from public.unidade where empreendimento_id = 'e0000000-0000-4000-8000-0000000006e1')$$,
  $$values (1::bigint, 1::bigint)$$,
  'repetir não duplica empreendimento nem unidade'
);

select throws_ok(
  $$select public.cadastrar_empreendimento_com_unidade(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a',
      'Outro', null, gen_random_uuid(), '   ')$$,
  '22023', 'nome_obrigatorio',
  'unidade sem nome é recusada'
);

select throws_ok(
  $$select public.cadastrar_empreendimento_com_unidade(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a',
      '  ', null, gen_random_uuid(), 'Matriz')$$,
  '22023', 'nome_obrigatorio',
  'empreendimento sem nome é recusado'
);

select is(
  (select count(*) from public.empreendimento where nome = 'Outro'),
  0::bigint,
  'a recusa não deixa empreendimento pela metade'
);

-- ---------------------------------------------------------------------------
-- Outra consultoria
-- ---------------------------------------------------------------------------
select testes.autenticar_como('helena@verdesul.test');

select throws_ok(
  $$select public.cadastrar_empreendimento_com_unidade(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a',
      'Invasor Ltda.', null, gen_random_uuid(), 'Matriz')$$,
  '42501', 'sem_permissao',
  'membro de outra consultoria não cadastra empreendimento na Filtroville'
);

select throws_ok(
  $$select public.cadastrar_empreendimento_com_unidade('e0000000-0000-4000-8000-0000000006e1',
      'c0000000-0000-4000-8000-00000000000b', 'Sequestro', null, gen_random_uuid(), 'Matriz')$$,
  'P0001', 'empreendimento_existente',
  'id conhecido de outra consultoria não é reaproveitado'
);

select is(
  (select count(*) from public.empreendimento where id = 'e0000000-0000-4000-8000-0000000006e1'),
  0::bigint,
  'outra consultoria recebe zero linhas do empreendimento novo'
);

select is(
  (select count(*) from public.unidade where id = 'f0000000-0000-4000-8000-0000000006f1'),
  0::bigint,
  'outra consultoria recebe zero linhas da unidade nova'
);

select * from finish();
rollback;
