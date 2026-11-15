-- Gênero e formação no cadastro da conta (ADR-0021 §7): o vínculo novo copia formação e gênero dos
-- metadados da conta; a própria pessoa completa ou muda os dela; ninguém muda os de outra pessoa.
begin;

select plan(12);

select testes.criar_dados_sinteticos();

-- Conta nova com formação e gênero no cadastro; outra com valores fora das listas.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000031', 'authenticated',
   'authenticated', 'mateus@exemplo.test', '', now(), '{"provider": "email"}',
   '{"nome": "Mateus Lima", "profissao": "eng_ambiental", "genero": "masculino"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000032', 'authenticated',
   'authenticated', 'lia@exemplo.test', '', now(), '{"provider": "email"}',
   '{"nome": "Lia Souza", "profissao": "astronauta", "genero": "outro"}', now(), now());

select testes.autenticar_como('mateus@exemplo.test');
select lives_ok(
  $$select public.criar_consultoria('c0000000-0000-4000-8000-0000000000f3', 'Empresa do Mateus')$$,
  'conta nova cria a própria consultoria'
);
reset role;
select results_eq(
  $$select profissao::text, genero::text from public.membro
    where usuario_id = 'e0000000-0000-4000-8000-000000000031'$$,
  $$values ('eng_ambiental', 'masculino')$$,
  'o vínculo novo copia formação e gênero do cadastro da conta'
);

select testes.autenticar_como('lia@exemplo.test');
select public.criar_consultoria('c0000000-0000-4000-8000-0000000000f4', 'Empresa da Lia');
reset role;
select results_eq(
  $$select profissao::text, genero::text from public.membro
    where usuario_id = 'e0000000-0000-4000-8000-000000000032'$$,
  $$values (null::text, null::text)$$,
  'valor fora das listas não entra: fica vazio e a tela pede de novo'
);

-- Completar o cadastro: a própria pessoa, em todos os vínculos ativos dela.
select testes.autenticar_como('lia@exemplo.test');
select lives_ok(
  $$select public.completar_cadastro('biologo', 'feminino')$$,
  'a própria pessoa completa formação e gênero'
);
reset role;
select results_eq(
  $$select profissao::text, genero::text from public.membro
    where usuario_id = 'e0000000-0000-4000-8000-000000000032'$$,
  $$values ('biologo', 'feminino')$$,
  'formação e gênero gravados no vínculo'
);

select testes.autenticar_como('lia@exemplo.test');
select throws_ok(
  $$select public.completar_cadastro('biologo', 'outro')$$,
  '22023', 'genero_invalido',
  'gênero fora da lista é recusado'
);
select throws_ok(
  $$select public.completar_cadastro(null, 'feminino')$$,
  '22023', 'profissao_invalida',
  'completar exige a formação'
);
select lives_ok(
  $$select public.definir_meu_genero('nao_informar')$$,
  'a própria pessoa muda só o gênero'
);
reset role;
select is(
  (select genero::text from public.membro where usuario_id = 'e0000000-0000-4000-8000-000000000032'),
  'nao_informar',
  'gênero trocado'
);

-- Teste negativo: ninguém muda o gênero ou a formação de outra pessoa.
select testes.autenticar_como('eduardo@filtroville.test');
select public.definir_meu_genero('feminino');
reset role;
select is(
  (select genero::text from public.membro where usuario_id = 'e0000000-0000-4000-8000-000000000032'),
  'nao_informar',
  'a Gestão de outra consultoria não muda o gênero de quem não é ela'
);
select testes.autenticar_como_anonimo();
select throws_ok(
  $$select public.completar_cadastro('biologo', 'feminino')$$,
  '42501', null,
  'sem login não completa cadastro'
);
reset role;

-- Usuário de outra consultoria não lê o vínculo (zero linhas).
select testes.autenticar_como('mateus@exemplo.test');
select is(
  (select count(*)::int from public.membro where usuario_id = 'e0000000-0000-4000-8000-000000000032'),
  0,
  'outra consultoria não lê formação nem gênero (zero linhas)'
);

select * from finish();
rollback;
