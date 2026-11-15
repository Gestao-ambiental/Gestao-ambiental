-- Cobrança simulada do protótipo (ADR-0026): assinar, pagar, simular atraso (só leitura) e
-- pagamento na central; quem não pode, não faz; tabelas da condição comercial isoladas.
begin;

select plan(14);

select testes.criar_dados_sinteticos();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000042', 'authenticated',
        'authenticated', 'operador42@grama.test', '', now(), '{"provider": "email", "providers": ["email"]}',
        '{"nome": "Operador Demo"}', now(), now());
insert into private.operador_plataforma (usuario_id) values ('e1000000-0000-4000-8000-000000000042');

-- Beta no passado e a Filtroville criada há 60 dias: teste acabado, sem plano.
update private.configuracao_comercial set fim_do_beta = current_date - 400;
update public.consultoria set criada_em = now() - interval '60 days' where id = 'c0000000-0000-4000-8000-00000000000a';

select testes.autenticar_como('ana@filtroville.test');
select throws_ok(
  $$select * from public.assinar_plano_simulado('c0000000-0000-4000-8000-00000000000a', 'equipe', 'mensal', 'pix')$$,
  '42501', 'sem_permissao', 'Equipe não assina');

-- Assinar: assinatura e cobrança pendente vencendo hoje; volta a escrever.
select testes.autenticar_como('eduardo@filtroville.test');
select isnt(
  (select a.cobranca_id from public.assinar_plano_simulado('c0000000-0000-4000-8000-00000000000a', 'equipe', 'mensal', 'pix') as a),
  null::uuid, 'Gestão assina: grava a assinatura e a primeira cobrança');
select is((select count(*)::integer from public.cobranca where situacao = 'pendente'), 1,
  'uma cobrança pendente (6 pessoas cabem no Equipe: sem adicionais)');
select lives_ok(
  $$select public.criar_empreendimento('e0000000-0000-4000-8000-000000004201',
      'c0000000-0000-4000-8000-00000000000a', 'Depois de assinar')$$,
  'com plano, a consultoria volta a escrever');

-- Central simula 10 dias de atraso: só leitura; simula pagamento: libera.
select testes.autenticar_com_dois_fatores('eduardo@filtroville.test');
select throws_ok(
  $$select public.central_simular_atraso('c0000000-0000-4000-8000-00000000000a', 10)$$,
  '42501', 'sem_permissao', 'Gestão não simula atraso');
select testes.autenticar_com_dois_fatores('operador42@grama.test');
select isnt(public.central_simular_atraso('c0000000-0000-4000-8000-00000000000a', 10), null::uuid,
  'operador simula atraso');
select testes.autenticar_como('eduardo@filtroville.test');
select throws_ok(
  $$select public.criar_empreendimento('e0000000-0000-4000-8000-000000004202',
      'c0000000-0000-4000-8000-00000000000a', 'Em atraso')$$,
  '42501', 'consultoria_somente_leitura', 'atraso de 10 dias: só leitura');
select lives_ok(
  $$select public.pagar_cobranca_simulada(s.cobranca_aberta_id)
    from public.situacao_comercial('c0000000-0000-4000-8000-00000000000a') as s$$,
  'a Gestão paga mesmo em só leitura');
select lives_ok(
  $$select public.criar_empreendimento('e0000000-0000-4000-8000-000000004202',
      'c0000000-0000-4000-8000-00000000000a', 'Depois de pagar')$$,
  'pagou: volta a escrever');
select testes.autenticar_com_dois_fatores('operador42@grama.test');
select lives_ok($$select public.central_simular_atraso('c0000000-0000-4000-8000-00000000000a', 10)$$,
  'novo atraso simulado');
select is(public.central_simular_pagamento('c0000000-0000-4000-8000-00000000000a'), 1,
  'operador simula o pagamento');

-- Negativos das tabelas da condição comercial (outra consultoria e Equipe: zero linhas).
select public.central_ajustar_dias_de_teste('c0000000-0000-4000-8000-00000000000a', 12, 'Demonstração', 0);
select testes.autenticar_como('gustavo@verdesul.test');
select is((select count(*)::integer from public.consultoria_condicao_comercial), 0,
  'outra consultoria: zero condições comerciais');
select throws_ok($$select count(*) from public.condicao_comercial_historico$$, '42501', null,
  'Gestão de consultoria não lê o histórico da central');
select testes.autenticar_como_anonimo();
select throws_ok(
  $$select * from public.assinar_plano_simulado('c0000000-0000-4000-8000-00000000000a', 'equipe', 'mensal', 'pix')$$,
  '42501', null, 'anônimo nem executa');

select * from finish();

rollback;
