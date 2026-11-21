-- Quiz "Antes do Grama" no site (ADR-0057): anon grava as 4 respostas com as mesmas faixas da
-- linha de base, contato validado e teto por origem; ninguém lê a tabela direto; a consultoria
-- criada por quem tem o mesmo e-mail nasce com a linha de base do quiz; outra consultoria não a vê.
begin;

select plan(14);

select testes.criar_dados_sinteticos();

-- ---------------------------------------------------------------- gravar (anon)
select testes.autenticar_como_anonimo();

select lives_ok(
  $$select public.responder_quiz_antes_do_grama('a7800000-0000-4000-8000-000000000001', 12, 6.54, 10, 2)$$,
  'anon responde o quiz sem contato'
);
select lives_ok(
  $$select public.responder_quiz_antes_do_grama('a7800000-0000-4000-8000-000000000001', 14, 6.5, 12, 3,
      ' Nova.Consultoria@Exemplo.test ')$$,
  'repetir com o mesmo id corrige e acrescenta o e-mail'
);
select throws_ok(
  $$select public.responder_quiz_antes_do_grama(gen_random_uuid(), 12, 200, 10, 2)$$,
  '22023', 'resposta_invalida',
  'horas por semana acima de 168 são recusadas'
);
select throws_ok(
  $$select public.responder_quiz_antes_do_grama(gen_random_uuid(), -1, 1, 10, 2)$$,
  '22023', 'resposta_invalida',
  'número negativo é recusado'
);
select throws_ok(
  $$select public.responder_quiz_antes_do_grama(gen_random_uuid(), 1, 1, 1, 1, 'não é contato')$$,
  '22023', 'contato_invalido',
  'contato inválido é recusado'
);
select throws_ok(
  $$select count(*) from private.quiz_antes_do_grama$$,
  '42501', null,
  'anon não lê as respostas'
);

reset role;
select results_eq(
  $$select licencas_ativas, horas_semana_conferindo, minutos_por_condicionante, surpresas_por_mes, contato, tipo_contato
    from private.quiz_antes_do_grama where id = 'a7800000-0000-4000-8000-000000000001'$$,
  $$values (14, 6.5::numeric(5,1), 12, 3, 'nova.consultoria@exemplo.test'::text, 'email'::text)$$,
  'respostas gravadas com o contato normalizado'
);

-- Teto por origem: 20 envios por hora.
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.80"}', true);
select public.responder_quiz_antes_do_grama(gen_random_uuid(), 1, 1, 1, 1) from generate_series(1, 20);
select throws_ok(
  $$select public.responder_quiz_antes_do_grama(gen_random_uuid(), 1, 1, 1, 1)$$,
  'P0001', 'muitas_tentativas',
  'o 21º envio da mesma origem na hora é recusado'
);
select set_config('request.headers', '', true);

-- ---------------------------------------------------------------- convite: consultoria nova
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '78000000-0000-4000-8000-0000000000e1', 'authenticated',
        'authenticated', 'nova.consultoria@exemplo.test', '', now(),
        '{"provider": "email", "providers": ["email"]}'::jsonb, '{"nome": "Nova Consultoria"}'::jsonb, now(), now()),
       ('00000000-0000-0000-0000-000000000000', '78000000-0000-4000-8000-0000000000e2', 'authenticated',
        'authenticated', 'sem.quiz@exemplo.test', '', now(),
        '{"provider": "email", "providers": ["email"]}'::jsonb, '{"nome": "Sem Quiz"}'::jsonb, now(), now());

select testes.convidar_para_o_beta('nova.consultoria@exemplo.test');
select testes.convidar_para_o_beta('sem.quiz@exemplo.test');
select testes.autenticar_como('nova.consultoria@exemplo.test');
select public.abrir_consultoria('c7800000-0000-4000-8000-0000000000c1', 'Nova Consultoria', '98765432000198');

select is(
  (select count(*) from public.ultima_linha_de_base('c7800000-0000-4000-8000-0000000000c1')),
  1::bigint,
  'a Gestão vê que já respondeu (o diálogo não precisa abrir)'
);

reset role;
select results_eq(
  $$select licencas_ativas, horas_semana_conferindo, minutos_por_condicionante, surpresas_por_mes
    from public.linha_de_base where consultoria_id = 'c7800000-0000-4000-8000-0000000000c1'$$,
  $$values (14, 6.5::numeric(5,1), 12, 3)$$,
  'a consultoria nova nasce com a linha de base do quiz'
);
select ok(
  (select usado_em is not null and usado_na_consultoria = 'c7800000-0000-4000-8000-0000000000c1'
   from private.quiz_antes_do_grama where id = 'a7800000-0000-4000-8000-000000000001'),
  'o quiz fica marcado como usado'
);
select lives_ok(
  $$select public.responder_quiz_antes_do_grama('a7800000-0000-4000-8000-000000000001', 99, 1, 1, 1)$$,
  'depois de usado, repetir não quebra'
);
select is(
  (select licencas_ativas from private.quiz_antes_do_grama where id = 'a7800000-0000-4000-8000-000000000001'),
  14,
  'e não muda mais as respostas'
);

select testes.autenticar_como('sem.quiz@exemplo.test');
select public.abrir_consultoria('c7800000-0000-4000-8000-0000000000c2', 'Sem Quiz', '13579135000103');
select testes.autenticar_como('gustavo@verdesul.test');
select is(
  (select count(*) from public.linha_de_base
   where consultoria_id in ('c7800000-0000-4000-8000-0000000000c1', 'c7800000-0000-4000-8000-0000000000c2')),
  0::bigint,
  'outra consultoria não lê a linha de base; quem não respondeu o quiz começa sem'
);

select * from finish();

rollback;
