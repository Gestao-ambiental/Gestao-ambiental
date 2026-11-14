-- Indicadores de valor, etapa 3 (ADR-0027): resumo do mês (cálculo num instante fixo, quem lê) e
-- o envio por e-mail (só service role, idempotente por consultoria e mês).
begin;

select plan(15);

select testes.criar_dados_sinteticos();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000046', 'authenticated',
        'authenticated', 'operador46@grama.test', '', now(), '{"provider": "email", "providers": ["email"]}',
        '{"nome": "Operador Resumo"}', now(), now());
insert into private.operador_plataforma (usuario_id) values ('e1000000-0000-4000-8000-000000000046');

-- Filtroville: linha de base (5 h por semana, 10 min por condicionante) e 20 condicionantes com IA
-- em 20 min em fevereiro de 2026 (3 h no cadastro + 20 h declaradas no acompanhamento = 23 h).
insert into public.linha_de_base (consultoria_id, respondido_por, licencas_ativas, horas_semana_conferindo,
                                  minutos_por_condicionante, surpresas_por_mes, respondido_em)
values ('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a1', 12, 5, 10, 2,
        '2026-01-10 12:00:00+00');
insert into public.tarefa_cronometrada (consultoria_id, membro_id, tipo, quantidade, segundos_ativos, instante)
values ('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a1', 'cadastro_licenca_ia',
        20, 1200, '2026-02-05 15:00:00+00'),
       ('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a1', 'acompanhamento',
        1, 3600, '2026-02-10 15:00:00+00');

-- ---------------------------------------------------------------------------
-- Cálculo num instante fixo (20/03/2026): fevereiro e janeiro
-- ---------------------------------------------------------------------------
select results_eq(
  $$select mes, horas_total, horas_estimadas, juntando_dados, prazo_previstas, renovacoes_vencendo
    from private.resumo_do_mes_em('c0000000-0000-4000-8000-00000000000a', '2026-02-01', '2026-03-20 15:00:00+00')$$,
  $$values ('2026-02-01'::date, 22.00::numeric, true, false, 0::bigint, 0::bigint),
           ('2026-01-01'::date, 0.00::numeric, true, false, 0::bigint, 0::bigint)$$,
  'fevereiro (3 h de cadastro + 5 h × 4 semanas − 1 h medida = 22 h) e janeiro sem uso (0 h)'
);

select throws_ok(
  $$select * from private.resumo_do_mes_em('c0000000-0000-4000-8000-00000000000a', '2026-04-01',
      '2026-03-20 15:00:00+00')$$,
  '22023', 'mes_invalido',
  'mês futuro é recusado'
);

-- ---------------------------------------------------------------------------
-- Quem lê a tela
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');
select is(
  (select count(*) from public.resumo_do_mes('c0000000-0000-4000-8000-00000000000a',
     date_trunc('month', now())::date)),
  2::bigint,
  'Gestão lê o resumo do mês (o mês e o anterior)'
);

select testes.autenticar_como('ana@filtroville.test');
select throws_ok(
  $$select * from public.resumo_do_mes('c0000000-0000-4000-8000-00000000000a', date_trunc('month', now())::date)$$,
  '42501', 'sem_permissao',
  'Equipe não lê o resumo do mês'
);

select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select * from public.resumo_do_mes('c0000000-0000-4000-8000-00000000000a', date_trunc('month', now())::date)$$,
  '42501', 'sem_permissao',
  'Gestão de outra consultoria não lê o resumo da Filtroville'
);
select is(
  (select count(*) from public.resumo_do_mes_envio),
  0::bigint,
  'registro de envios: zero linhas para quem consulta direto'
);

-- ---------------------------------------------------------------------------
-- Central (e-mail de teste)
-- ---------------------------------------------------------------------------
select testes.autenticar_com_dois_fatores('operador46@grama.test');
select results_eq(
  $$select consultoria_nome, mes_do_resumo
    from public.central_resumo_do_mes('c0000000-0000-4000-8000-00000000000a', '2026-02-01')$$,
  $$values ('Filtroville Consultoria Ambiental', '2026-02-01'::date),
           ('Filtroville Consultoria Ambiental', '2026-02-01'::date)$$,
  'operador com dois fatores lê o resumo de uma consultoria (duas linhas: o mês e o anterior)'
);

select testes.autenticar_com_dois_fatores('eduardo@filtroville.test');
select throws_ok(
  $$select * from public.central_resumo_do_mes('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', 'sem_permissao',
  'Gestão não usa a RPC da central'
);

-- ---------------------------------------------------------------------------
-- Envio: só service role, idempotente
-- ---------------------------------------------------------------------------
reset role;
select ok(
  not has_function_privilege('authenticated', 'public.resumos_do_mes_pendentes(date)', 'execute')
  and not has_function_privilege('anon', 'public.resumos_do_mes_pendentes(date)', 'execute'),
  'a lista para envio não é executável pelo cliente'
);
select ok(
  not has_function_privilege('authenticated', 'public.registrar_envio_do_resumo(uuid, date, integer)', 'execute'),
  'registrar o envio não é executável pelo cliente'
);
select ok(
  has_function_privilege('service_role', 'public.resumos_do_mes_pendentes(date)', 'execute')
  and has_function_privilege('service_role', 'public.registrar_envio_do_resumo(uuid, date, integer)', 'execute'),
  'a Edge Function (service role) executa as duas'
);

select is(
  (select count(*) from public.resumos_do_mes_pendentes('2026-02-01')
   where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  2::bigint,
  'antes do envio, a Filtroville está pendente'
);
select is(
  public.registrar_envio_do_resumo('c0000000-0000-4000-8000-00000000000a', '2026-02-01', 1),
  true,
  'registra o envio'
);
select is(
  public.registrar_envio_do_resumo('c0000000-0000-4000-8000-00000000000a', '2026-02-01', 1),
  false,
  'repetir não grava de novo'
);
select is(
  (select count(*) from public.resumos_do_mes_pendentes('2026-02-01')
   where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  0::bigint,
  'depois do envio, a Filtroville sai da lista do mês'
);

select * from finish();
rollback;
