-- Outras formações do membro (ADR-0021 §6): uma principal e outras concluídas, sem repetir; a
-- principal continua sendo a do orçamento. Quem é de outra consultoria não lê nem muda.
begin;

select plan(13);

select testes.criar_dados_sinteticos();

select testes.autenticar_como('eduardo@filtroville.test');

select lives_ok(
  $$select public.definir_profissao_e_cargo('d0000000-0000-4000-8000-0000000000a1',
      'eng_ambiental_sanitarista', 'diretor', array['tec_quimica', 'eng_seguranca_trabalho'])$$,
  'Gestão define principal e outras formações'
);

select is(
  (select outras_profissoes::text[] from public.membro where id = 'd0000000-0000-4000-8000-0000000000a1'),
  array['tec_quimica', 'eng_seguranca_trabalho'],
  'as outras ficam na ordem em que vieram'
);

select public.definir_profissao_e_cargo('d0000000-0000-4000-8000-0000000000a1',
  'eng_ambiental_sanitarista', 'gerente');
select is(
  (select outras_profissoes::text[] from public.membro where id = 'd0000000-0000-4000-8000-0000000000a1'),
  array['tec_quimica', 'eng_seguranca_trabalho'],
  'sem p_outras_profissoes, as outras continuam como estavam'
);

select public.definir_profissao_e_cargo('d0000000-0000-4000-8000-0000000000a1',
  'tec_quimica', 'gerente');
select is(
  (select array[profissao::text] || outras_profissoes::text[]
   from public.membro where id = 'd0000000-0000-4000-8000-0000000000a1'),
  array['tec_quimica', 'eng_seguranca_trabalho'],
  'escolher uma das outras como principal tira ela das outras'
);

select public.definir_profissao_e_cargo('d0000000-0000-4000-8000-0000000000a1',
  'eng_ambiental_sanitarista', 'gerente',
  array['tec_quimica', 'tec_quimica', 'eng_ambiental_sanitarista']);
select is(
  (select outras_profissoes::text[] from public.membro where id = 'd0000000-0000-4000-8000-0000000000a1'),
  array['tec_quimica'],
  'repetidas e a própria principal saem das outras'
);

select throws_ok(
  $$select public.definir_profissao_e_cargo('d0000000-0000-4000-8000-0000000000a1',
      null, 'gerente', array['tec_quimica'])$$,
  '22023', 'profissao_nao_pode_ficar_vazia',
  'a principal preenchida não fica vazia, nem para deixar só as outras'
);

select throws_ok(
  $$select public.definir_profissao_e_cargo('d0000000-0000-4000-8000-0000000000a1',
      'eng_ambiental', 'gerente', array['astronauta'])$$,
  '22023', 'profissao_invalida',
  'outra formação fora da lista é recusada'
);

select throws_ok(
  $$select public.definir_profissao_e_cargo('d0000000-0000-4000-8000-0000000000a1',
      null, 'gerente', array[]::text[])$$,
  '22023', 'profissao_nao_pode_ficar_vazia',
  'a principal preenchida não pode ser apagada, só trocada'
);

select throws_ok(
  $$select public.definir_profissao_e_cargo('d0000000-0000-4000-8000-0000000000a3',
      null, null, array['tec_quimica'])$$,
  '22023', 'profissao_principal_obrigatoria',
  'quem ainda não tem principal não ganha outras formações'
);

reset role;
select throws_ok(
  $$update public.membro set profissao = 'eng_civil', outras_profissoes = '{eng_civil}'
    where id = 'd0000000-0000-4000-8000-0000000000a1'$$,
  '23514', null,
  'o banco recusa a principal repetida nas outras, mesmo fora da função'
);

-- A própria pessoa (Equipe) muda as dela.
select testes.autenticar_como('ana@filtroville.test');
select lives_ok(
  $$select public.definir_profissao_e_cargo('d0000000-0000-4000-8000-0000000000a2',
      'biologo', null, array['tec_meio_ambiente'])$$,
  'a própria pessoa define as suas formações'
);

-- Teste negativo: Gestão de outra consultoria não muda nem lê.
select testes.autenticar_como('helena@verdesul.test');
select throws_ok(
  $$select public.definir_profissao_e_cargo('d0000000-0000-4000-8000-0000000000a2',
      'biologo', null, array['eng_civil'])$$,
  '42501', 'sem_permissao',
  'Gestão de outra consultoria não muda as formações'
);
select is(
  (select count(*)::int from public.membro where id = 'd0000000-0000-4000-8000-0000000000a2'),
  0,
  'usuário de outra consultoria não lê o membro (zero linhas)'
);

select * from finish();
rollback;
