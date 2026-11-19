-- Teto por origem da lista de espera (ADR-0032): IPv6 conta pelo prefixo /64, porque quem tem um
-- /64 troca de endereço a cada pedido; IPv4 (também o mapeado em IPv6) conta pelo endereço exato.
begin;

select plan(6);

select testes.autenticar_como_anonimo();

-- 10 endereços diferentes do mesmo /64 gastam o mesmo contador.
select lives_ok(
  $$select set_config('request.headers',
             jsonb_build_object('cf-connecting-ip', '2001:db8:0:1::' || to_hex(g))::text, true),
           public.entrar_lista_de_espera('Rotação ' || g, 'r' || g || '@ipv6.test')
    from generate_series(1, 10) as g$$,
  '10 tentativas de endereços diferentes do mesmo /64 passam');
select set_config('request.headers', '{"cf-connecting-ip": "2001:db8:0:1:abcd::99"}', true);
select throws_ok(
  $$select public.entrar_lista_de_espera('Rotação Onze', 'r11@ipv6.test')$$,
  'P0001', 'muitas_tentativas', 'trocar de endereço dentro do mesmo /64 não escapa do teto');

select set_config('request.headers', '{"cf-connecting-ip": "2001:db8:0:2::1"}', true);
select lives_ok(
  $$select public.entrar_lista_de_espera('Outro Prefixo', 'outro@ipv6.test')$$,
  'outro /64 é outra origem');

-- IPv4 continua pelo endereço exato, e o IPv4 mapeado não junta todos num /64 só.
select set_config('request.headers', '{"cf-connecting-ip": "::ffff:198.51.100.1"}', true);
select lives_ok(
  $$select public.entrar_lista_de_espera('Mapeado Um', 'm1@ipv6.test')$$,
  'IPv4 mapeado em IPv6 entra');
select set_config('request.headers', '{"cf-connecting-ip": "::ffff:198.51.100.2"}', true);
select lives_ok(
  $$select public.entrar_lista_de_espera('Mapeado Dois', 'm2@ipv6.test')$$,
  'outro IPv4 mapeado entra');

reset role;
select is(
  (select count(distinct origem)::integer from private.lista_de_espera_tentativa),
  4,
  'um contador para cada /64 e um para cada IPv4 mapeado (não um /64 só para todos)'
);

select * from finish();
rollback;
