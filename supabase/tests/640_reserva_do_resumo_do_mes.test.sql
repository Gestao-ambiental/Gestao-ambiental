-- Resumo do mês (ADR-0027): reserva antes do envio. Só uma execução reserva cada consultoria e mês;
-- reserva com mais de 60 minutos pode ser retomada; envio já gravado nunca é reservado de novo.
begin;

select plan(12);

select testes.criar_dados_sinteticos();

-- ---------------------------------------------------------------------------
-- Quem executa
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'public.reservar_envio_do_resumo(uuid, date)', 'execute')
  and not has_function_privilege('anon', 'public.reservar_envio_do_resumo(uuid, date)', 'execute')
  and not has_function_privilege('authenticated', 'public.liberar_reserva_do_resumo(uuid, date)', 'execute')
  and not has_function_privilege('anon', 'public.liberar_reserva_do_resumo(uuid, date)', 'execute'),
  'reservar e liberar não são executáveis pelo cliente'
);
select ok(
  has_function_privilege('service_role', 'public.reservar_envio_do_resumo(uuid, date)', 'execute')
  and has_function_privilege('service_role', 'public.liberar_reserva_do_resumo(uuid, date)', 'execute'),
  'a Edge Function (service role) executa as duas'
);

select testes.autenticar_como('eduardo@filtroville.test');
select throws_ok(
  $$select count(*) from private.resumo_do_mes_reserva$$,
  '42501', null,
  'Gestão não lê a tabela de reservas'
);
reset role;

-- ---------------------------------------------------------------------------
-- Reserva
-- ---------------------------------------------------------------------------
select is(
  public.reservar_envio_do_resumo('c0000000-0000-4000-8000-00000000000a', '2026-02-15'),
  true,
  'a primeira execução reserva (o mês é normalizado para o dia 1)'
);
select is(
  public.reservar_envio_do_resumo('c0000000-0000-4000-8000-00000000000a', '2026-02-01'),
  false,
  'a segunda execução, com a reserva recente, não reserva (não envia)'
);
select is(
  public.reservar_envio_do_resumo('c0000000-0000-4000-8000-00000000000b', '2026-02-01'),
  true,
  'a reserva é por consultoria: a Verde Sul reserva o mesmo mês'
);

-- Falha no envio: libera, e a próxima execução tenta de novo.
select lives_ok(
  $$select public.liberar_reserva_do_resumo('c0000000-0000-4000-8000-00000000000a', '2026-02-01')$$,
  'libera a reserva depois de uma falha no envio'
);
select is(
  public.reservar_envio_do_resumo('c0000000-0000-4000-8000-00000000000a', '2026-02-01'),
  true,
  'depois de liberada, a próxima execução reserva'
);

-- Execução que caiu no meio: a reserva antiga pode ser retomada.
update private.resumo_do_mes_reserva
set reservada_em = now() - interval '61 minutes'
where consultoria_id = 'c0000000-0000-4000-8000-00000000000a';
select is(
  public.reservar_envio_do_resumo('c0000000-0000-4000-8000-00000000000a', '2026-02-01'),
  true,
  'reserva com mais de 60 minutos é retomada'
);

-- Envio gravado: nem a reserva antiga deixa enviar de novo.
select is(
  public.registrar_envio_do_resumo('c0000000-0000-4000-8000-00000000000a', '2026-02-01', 1),
  true,
  'grava o envio'
);
update private.resumo_do_mes_reserva
set reservada_em = now() - interval '2 hours'
where consultoria_id = 'c0000000-0000-4000-8000-00000000000a';
select is(
  public.reservar_envio_do_resumo('c0000000-0000-4000-8000-00000000000a', '2026-02-01'),
  false,
  'com o envio gravado, a reserva antiga não vale para enviar de novo'
);
select is(
  public.reservar_envio_do_resumo('c0000000-0000-4000-8000-00000000000a', '2026-03-01'),
  true,
  'o mês seguinte reserva normalmente'
);

select * from finish();
rollback;
