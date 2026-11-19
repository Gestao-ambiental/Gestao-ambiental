-- Lista de espera (ADR-0032 e ADR-0034): teto de 10 tentativas por hora por origem (hash do IP dos
-- headers da requisição), sem gravar o IP; sem header de IP vale só o teto global; o aviso de
-- cadastro novo dispara no máximo uma vez a cada 10 minutos.
begin;

select plan(17);

-- ---------------------------------------------------------------- teto por origem
select testes.autenticar_como_anonimo();
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.7, 10.0.0.1"}', true);
select lives_ok(
  $$select public.entrar_lista_de_espera('Pessoa ' || g, 'p' || g || '@limite.test')
    from generate_series(1, 10) as g$$,
  '10 tentativas da mesma origem na hora passam');
select throws_ok(
  $$select public.entrar_lista_de_espera('Pessoa Onze', 'p11@limite.test')$$,
  'P0001', 'muitas_tentativas', 'a 11ª tentativa da mesma origem na hora é recusada');
select throws_ok(
  $$select public.entrar_lista_de_espera('Pessoa Um', 'p1@limite.test')$$,
  'P0001', 'muitas_tentativas', 'contato repetido também conta como tentativa');

select set_config('request.headers', '{"x-forwarded-for": "198.51.100.9"}', true);
select lives_ok(
  $$select public.entrar_lista_de_espera('Outra Origem', 'outra@limite.test')$$,
  'outra origem continua entrando');

select set_config('request.headers',
  '{"cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "192.0.2.55"}', true);
select throws_ok(
  $$select public.entrar_lista_de_espera('Disfarce', 'disfarce@limite.test')$$,
  'P0001', 'muitas_tentativas', 'trocar o x-forwarded-for não escapa quando o proxy informa o IP');

select set_config('request.headers', '', true);
select lives_ok(
  $$select public.entrar_lista_de_espera('Sem Header', 'semheader@limite.test')$$,
  'sem header de IP, vale só o teto global');

select throws_ok(
  $$select count(*) from private.lista_de_espera_tentativa$$,
  '42501', null, 'anon não lê as tentativas');

reset role;
select is(
  (select count(*)::integer from private.lista_de_espera where contato like '%@limite.test'),
  12,
  'gravou as 10 da primeira origem, a da outra origem e a sem header'
);
select is(
  (select count(distinct origem)::integer from private.lista_de_espera_tentativa),
  2,
  'uma linha de tentativa por origem conhecida'
);
select ok(
  not exists (select 1 from private.lista_de_espera_tentativa
              where origem like '%203.0.113%' or origem like '%198.51.100%'),
  'o IP não é gravado, só o hash'
);

-- Depois de 1 hora, a origem volta a entrar e as tentativas antigas são apagadas.
update private.lista_de_espera_tentativa set criada_em = now() - interval '61 minutes';
select testes.autenticar_como_anonimo();
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.7"}', true);
select lives_ok(
  $$select public.entrar_lista_de_espera('Pessoa Onze', 'p11@limite.test')$$,
  'depois de 1 hora a mesma origem volta a entrar');
reset role;
select is(
  (select count(*)::integer from private.lista_de_espera_tentativa),
  1,
  'tentativas com mais de 1 hora são apagadas'
);

-- ---------------------------------------------------------------- aviso agrupado
select ok(
  not has_function_privilege('anon', 'private.reservar_aviso_da_lista_de_espera()', 'execute')
  and not has_function_privilege('authenticated', 'private.reservar_aviso_da_lista_de_espera()', 'execute'),
  'o cliente não reserva o aviso'
);

update private.lista_de_espera_aviso set disparado_em = '-infinity';
select is(private.reservar_aviso_da_lista_de_espera(), true, 'o primeiro cadastro dispara o aviso');
select is(private.reservar_aviso_da_lista_de_espera(), false,
  'outro cadastro logo depois não dispara (vai no próximo aviso)');

update private.lista_de_espera_aviso set disparado_em = now() - interval '9 minutes';
select is(private.reservar_aviso_da_lista_de_espera(), false, 'com 9 minutos ainda não dispara');

update private.lista_de_espera_aviso set disparado_em = now() - interval '11 minutes';
select is(private.reservar_aviso_da_lista_de_espera(), true, 'depois de 10 minutos dispara de novo');

select * from finish();
rollback;
