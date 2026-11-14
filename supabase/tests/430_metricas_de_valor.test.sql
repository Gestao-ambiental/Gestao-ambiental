-- Métricas de valor, etapa 1 (central): os números de uma consultoria num instante fixo
-- (ocorrências no prazo, urgente, atrasadas e não planejada), o total da plataforma e o acesso
-- (só operador com dois fatores).
begin;

select plan(12);

select testes.criar_dados_sinteticos();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000043', 'authenticated',
        'authenticated', 'operador43@grama.test', '', now(), '{"provider": "email", "providers": ["email"]}',
        '{"nome": "Operador Valor"}', now(), now());
insert into private.operador_plataforma (usuario_id) values ('e1000000-0000-4000-8000-000000000043');

-- Uma licença em cada consultoria, com uma condicionante e as ocorrências direto no banco.
insert into public.empreendimento (id, consultoria_id, nome, criado_por) values
  ('e0000000-0000-4000-8000-0000000004a1', 'c0000000-0000-4000-8000-00000000000a', 'Empreendimento A',
   'd0000000-0000-4000-8000-0000000000a1'),
  ('e0000000-0000-4000-8000-0000000004b1', 'c0000000-0000-4000-8000-00000000000b', 'Empreendimento B',
   'd0000000-0000-4000-8000-0000000000b1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome) values
  ('f0000000-0000-4000-8000-0000000004a1', 'c0000000-0000-4000-8000-00000000000a',
   'e0000000-0000-4000-8000-0000000004a1', 'Matriz'),
  ('f0000000-0000-4000-8000-0000000004b1', 'c0000000-0000-4000-8000-00000000000b',
   'e0000000-0000-4000-8000-0000000004b1', 'Matriz');
insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, criado_por) values
  ('10000000-0000-4000-8000-0000000004a1', 'c0000000-0000-4000-8000-00000000000a',
   'e0000000-0000-4000-8000-0000000004a1', 'f0000000-0000-4000-8000-0000000004a1',
   'd0000000-0000-4000-8000-0000000000a1'),
  ('10000000-0000-4000-8000-0000000004b1', 'c0000000-0000-4000-8000-00000000000b',
   'e0000000-0000-4000-8000-0000000004b1', 'f0000000-0000-4000-8000-0000000004b1',
   'd0000000-0000-4000-8000-0000000000b1');
insert into public.condicionante (id, consultoria_id, instrumento_id, codigo, posicao) values
  ('30000000-0000-4000-8000-0000000004a1', 'c0000000-0000-4000-8000-00000000000a',
   '10000000-0000-4000-8000-0000000004a1', '1', 1),
  ('30000000-0000-4000-8000-0000000004b1', 'c0000000-0000-4000-8000-00000000000b',
   '10000000-0000-4000-8000-0000000004b1', '1', 1);
insert into public.condicionante_versao (id, consultoria_id, condicionante_id, titulo, natureza) values
  ('40000000-0000-4000-8000-0000000004a1', 'c0000000-0000-4000-8000-00000000000a',
   '30000000-0000-4000-8000-0000000004a1', 'Relatório', 'obrigacao'),
  ('40000000-0000-4000-8000-0000000004b1', 'c0000000-0000-4000-8000-00000000000b',
   '30000000-0000-4000-8000-0000000004b1', 'Relatório', 'obrigacao');

-- Instante fixo: 20/03/2026 12:00 em São Paulo (sexta). Todas criadas em 02/02/2026.
-- 1: prazo 13/02, meta 09/02, concluída 10/02 → no prazo, 3 dias úteis de folga (urgência), meta perdida
-- 2: prazo 27/02, meta 20/02, concluída 02/02 → no prazo, 19 dias úteis, meta cumprida
-- 3: prazo 20/02, aberta → atrasada 28 dias
-- 4: prazo 05/02, concluída 09/02 → atrasada 4 dias; criada a 3 dias úteis do prazo (não planejada)
-- 5: prazo 25/03, aberta → ainda não venceu (fora do denominador de março)
-- 6 (Verde Sul): prazo 10/02, concluída 10/02 → no prazo, folga zero (urgência)
insert into public.ocorrencia (consultoria_id, instrumento_id, condicionante_versao_id, ciclo,
                               prazo_oficial_original, prazo_oficial_atual, meta_interna, responsavel_id,
                               situacao, concluida_em, concluida_por, chave_idempotencia, criado_em)
select o.cid, o.iid, o.vid, o.ciclo, o.prazo::date, o.prazo::date, o.meta::date, o.resp,
       case when o.concluida is null then 'aberta' else 'concluida' end::public.situacao_ocorrencia,
       o.concluida::timestamptz, case when o.concluida is not null then o.resp end,
       'metricas:' || o.ciclo::text, '2026-02-02 12:00:00+00'
from (values
  ('c0000000-0000-4000-8000-00000000000a'::uuid, '10000000-0000-4000-8000-0000000004a1'::uuid,
   '40000000-0000-4000-8000-0000000004a1'::uuid, 1, '2026-02-13', '2026-02-09',
   'd0000000-0000-4000-8000-0000000000a3'::uuid, '2026-02-10 15:00:00+00'),
  ('c0000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-0000000004a1',
   '40000000-0000-4000-8000-0000000004a1', 2, '2026-02-27', '2026-02-20',
   'd0000000-0000-4000-8000-0000000000a3', '2026-02-02 15:00:00+00'),
  ('c0000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-0000000004a1',
   '40000000-0000-4000-8000-0000000004a1', 3, '2026-02-20', null,
   'd0000000-0000-4000-8000-0000000000a2', null),
  ('c0000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-0000000004a1',
   '40000000-0000-4000-8000-0000000004a1', 4, '2026-02-05', null,
   'd0000000-0000-4000-8000-0000000000a3', '2026-02-09 15:00:00+00'),
  ('c0000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-0000000004a1',
   '40000000-0000-4000-8000-0000000004a1', 5, '2026-03-25', null,
   'd0000000-0000-4000-8000-0000000000a2', null),
  ('c0000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-0000000004b1',
   '40000000-0000-4000-8000-0000000004b1', 6, '2026-02-10', null,
   'd0000000-0000-4000-8000-0000000000b2', '2026-02-10 15:00:00+00')
) as o (cid, iid, vid, ciclo, prazo, meta, resp, concluida);

-- ---------------------------------------------------------------------------
-- Números de uma consultoria (Filtroville), fevereiro de 2026
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from private.metricas_de_valor_em('c0000000-0000-4000-8000-00000000000a', 6,
     '2026-03-20 15:00:00+00')),
  7::bigint,
  'seis meses fechados e o mês atual'
);

select results_eq(
  $$select prazo_previstas, prazo_cumpridas, antecedencia_media, urgencias, meta_previstas, meta_cumpridas
    from private.metricas_de_valor_em('c0000000-0000-4000-8000-00000000000a', 6, '2026-03-20 15:00:00+00')
    where mes = '2026-02-01'$$,
  $$values (4::bigint, 2::bigint, 11.0::numeric, 1::bigint, 2::bigint, 1::bigint)$$,
  'fevereiro: 2 de 4 no prazo, antecedência média de 11 dias úteis, 1 urgência, 1 de 2 metas'
);

select results_eq(
  $$select atrasadas, dias_de_atraso, criadas, nao_planejadas, concluidas, concluidas_com_evidencia
    from private.metricas_de_valor_em('c0000000-0000-4000-8000-00000000000a', 6, '2026-03-20 15:00:00+00')
    where mes = '2026-02-01'$$,
  $$values (2::bigint, 32::bigint, 5::bigint, 1::bigint, 3::bigint, 0::bigint)$$,
  'fevereiro: 2 atrasadas (28 + 4 dias), 1 de 5 não planejada, 3 concluídas sem evidência'
);

select results_eq(
  $$select carga_entregas, carga_pico, carga_celulas
    from private.metricas_de_valor_em('c0000000-0000-4000-8000-00000000000a', 6, '2026-03-20 15:00:00+00')
    where mes = '2026-02-01'$$,
  $$values (4::bigint, 1::bigint, 10::bigint)$$,
  'carga de fevereiro: 4 entregas, pico 1, 2 responsáveis × 5 semanas'
);

select results_eq(
  $$select prazo_previstas, atrasadas, carga_entregas
    from private.metricas_de_valor_em('c0000000-0000-4000-8000-00000000000a', 6, '2026-03-20 15:00:00+00')
    where mes = '2026-03-01'$$,
  $$values (0::bigint, 0::bigint, 1::bigint)$$,
  'março: o prazo que ainda não venceu não entra no denominador nem nos atrasos'
);

select results_eq(
  $$select condicionantes_ativas is null, condicionantes_com_responsavel is null
    from private.metricas_de_valor_em('c0000000-0000-4000-8000-00000000000a', 6, '2026-03-20 15:00:00+00')
    order by mes$$,
  $$values (true, true), (true, true), (true, true), (true, true), (true, true), (true, true),
           (false, false)$$,
  'condicionantes com responsável: retrato só no mês atual'
);

-- ---------------------------------------------------------------------------
-- Total da plataforma
-- ---------------------------------------------------------------------------
select results_eq(
  $$select prazo_previstas, prazo_cumpridas, urgencias
    from private.metricas_de_valor_em(null, 6, '2026-03-20 15:00:00+00') where mes = '2026-02-01'$$,
  $$values (5::bigint, 3::bigint, 2::bigint)$$,
  'total: soma as consultorias (a Verde Sul entregou no próprio dia do prazo)'
);

-- ---------------------------------------------------------------------------
-- Acesso
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated',
    'private.metricas_de_valor_em(uuid, integer, timestamptz)', 'execute'),
  'o cálculo interno não é executável pelo cliente'
);

select testes.autenticar_com_dois_fatores('operador43@grama.test');
select is(
  (select count(*) from public.central_metricas_de_valor('c0000000-0000-4000-8000-00000000000a')),
  7::bigint,
  'operador com dois fatores lê as métricas'
);

select testes.autenticar_como('operador43@grama.test');
select throws_ok(
  $$select * from public.central_metricas_de_valor()$$,
  '42501', 'dois_fatores_necessarios',
  'operador só com senha (aal1) é recusado'
);

select testes.autenticar_com_dois_fatores('eduardo@filtroville.test');
select throws_ok(
  $$select * from public.central_metricas_de_valor('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', 'sem_permissao',
  'quem não é operador (Gestão com dois fatores) é recusado, mesmo na própria consultoria'
);

select testes.autenticar_como_anonimo();
select throws_ok(
  $$select * from public.central_metricas_de_valor()$$,
  '42501', null,
  'anônimo nem executa'
);

select * from finish();
rollback;
