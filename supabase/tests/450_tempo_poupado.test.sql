-- Indicadores de valor, etapa 2 (ADR-0027): registrar_tarefa e linha de base (quem grava, quem
-- lê), o cálculo das horas poupadas num instante fixo e a RPC da central.
begin;

select plan(16);

select testes.criar_dados_sinteticos();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000045', 'authenticated',
        'authenticated', 'operador45@grama.test', '', now(), '{"provider": "email", "providers": ["email"]}',
        '{"nome": "Operador Horas"}', now(), now());
insert into private.operador_plataforma (usuario_id) values ('e1000000-0000-4000-8000-000000000045');

-- ---------------------------------------------------------------------------
-- registrar_tarefa
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');
select lives_ok(
  $$select public.registrar_tarefa('c0000000-0000-4000-8000-00000000000a', 'cadastro_condicionante_manual', 1, 240)$$,
  'Equipe (Ana) registra uma condicionante digitada'
);
select is(
  (select count(*) from public.tarefa_cronometrada),
  0::bigint,
  'nem quem registrou lê a tabela direto'
);
select throws_ok(
  $$select public.registrar_tarefa('c0000000-0000-4000-8000-00000000000a', 'outra', 1, 10)$$,
  '22023', 'tipo_invalido',
  'tipo fora da lista é recusado'
);

select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select public.registrar_tarefa('c0000000-0000-4000-8000-00000000000a', 'acompanhamento', 1, 60)$$,
  '42501', 'sem_permissao',
  'Gestão de outra consultoria não registra na Filtroville'
);

reset role;
select results_eq(
  $$select membro_id, tipo, quantidade, segundos_ativos from public.tarefa_cronometrada$$,
  $$values ('d0000000-0000-4000-8000-0000000000a2'::uuid, 'cadastro_condicionante_manual', 1, 240)$$,
  'grava uma linha só, com o membro de quem chamou'
);

-- ---------------------------------------------------------------------------
-- Linha de base
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');
select throws_ok(
  $$select public.responder_linha_de_base('c0000000-0000-4000-8000-00000000000a', 12, 6, 10, 2)$$,
  '42501', 'sem_permissao',
  'Equipe não responde a linha de base'
);

select testes.autenticar_como('eduardo@filtroville.test');
select lives_ok(
  $$select public.responder_linha_de_base('c0000000-0000-4000-8000-00000000000a', 12, 6.5, 10, 2)$$,
  'Gestão responde a linha de base'
);
select is(
  (select count(*) from public.ultima_linha_de_base('c0000000-0000-4000-8000-00000000000a')),
  1::bigint,
  'Gestão lê a data da última resposta'
);

select testes.autenticar_como('gustavo@verdesul.test');
select is(
  (select count(*) from public.linha_de_base),
  0::bigint,
  'outra consultoria não lê respostas (zero linhas)'
);
select throws_ok(
  $$select * from public.ultima_linha_de_base('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', 'sem_permissao',
  'outra consultoria não lê a data da última resposta'
);

-- ---------------------------------------------------------------------------
-- Cálculo num instante fixo: 20/03/2026 12:00 em São Paulo.
-- Linha de base (01/02): 5 h por semana conferindo, 10 min por condicionante à mão.
-- Fevereiro (28 dias = 4 semanas): 20 condicionantes com IA em 20 min (1 min cada) e 2 h de
-- acompanhamento. Cadastro (10 − 1) × 20 ÷ 60 = 3 h; acompanhamento 5 × 4 − 2 = 18 h; total 21 h.
-- Hora técnica R$ 100,00: R$ 2.100,00.
-- ---------------------------------------------------------------------------
reset role;
insert into public.linha_de_base (consultoria_id, respondido_por, licencas_ativas, horas_semana_conferindo,
                                  minutos_por_condicionante, surpresas_por_mes, respondido_em)
values ('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a1', 12, 5, 10, 2,
        '2026-02-01 12:00:00+00');
insert into public.tarefa_cronometrada (consultoria_id, membro_id, tipo, quantidade, segundos_ativos, instante)
values
  ('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a1', 'cadastro_licenca_ia', 20, 1200,
   '2026-02-05 15:00:00+00'),
  ('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a2', 'acompanhamento', 1, 1800,
   '2026-02-10 15:00:00+00'),
  ('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a3', 'acompanhamento', 1, 1800,
   '2026-02-11 15:00:00+00'),
  ('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a3', 'acompanhamento', 1, 1800,
   '2026-02-12 15:00:00+00'),
  ('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a3', 'acompanhamento', 1, 1800,
   '2026-02-13 15:00:00+00');
insert into public.orcamento_base_custos (consultoria_id, hora_tecnica_centavos, custos_fixos_mensais_centavos,
                                          horas_faturaveis_mes, margem_desejada_pb, margem_minima_pb,
                                          tributos_pb, atualizado_por)
values ('c0000000-0000-4000-8000-00000000000a', 10000, 0, 160, 2000, 1000, 1000,
        'd0000000-0000-4000-8000-0000000000a1');

select results_eq(
  $$select horas_cadastro, horas_acompanhamento, horas_total, reais_centavos, manual_medido, estimado, juntando_dados
    from private.horas_poupadas_em('c0000000-0000-4000-8000-00000000000a', 6, '2026-03-20 15:00:00+00')
    where mes = '2026-02-01'$$,
  $$values (3.00::numeric, 18.00::numeric, 21.00::numeric, 210000::bigint, false, true, false)$$,
  'fevereiro: 3 h no cadastro, 18 h no acompanhamento, R$ 2.100,00, estimado pela linha de base'
);

select results_eq(
  $$select horas_cadastro, horas_acompanhamento
    from private.horas_poupadas_em('c0000000-0000-4000-8000-00000000000a', 6, '2026-03-20 15:00:00+00')
    where mes = '2026-03-01'$$,
  $$values (0.00::numeric, 0.00::numeric)$$,
  'março sem nenhum acompanhamento medido: não devolve as horas declaradas'
);

select is(
  (select juntando_dados from private.horas_poupadas_em('c0000000-0000-4000-8000-00000000000a', 0,
     '2026-02-04 15:00:00+00')),
  true,
  'antes da primeira tarefa (nem 30 dias nem 10 condicionantes): juntando dados'
);

-- ---------------------------------------------------------------------------
-- Central: total (a Verde Sul junta dados e fica fora da soma) e acesso.
-- ---------------------------------------------------------------------------
select results_eq(
  $$select horas_total, consultorias_com_dados
    from private.central_horas_poupadas_em(null, 6, '2026-03-20 15:00:00+00') where mes = '2026-02-01'$$,
  $$values (21.00::numeric, 1::bigint)$$,
  'total da plataforma soma só quem já tem dados'
);

select testes.autenticar_com_dois_fatores('operador45@grama.test');
select is(
  (select count(*) from public.central_horas_poupadas('c0000000-0000-4000-8000-00000000000a')),
  7::bigint,
  'operador com dois fatores lê as horas por mês da consultoria'
);

select testes.autenticar_com_dois_fatores('eduardo@filtroville.test');
select throws_ok(
  $$select * from public.central_horas_poupadas('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', 'sem_permissao',
  'Gestão não usa a RPC da central'
);

select * from finish();
rollback;
