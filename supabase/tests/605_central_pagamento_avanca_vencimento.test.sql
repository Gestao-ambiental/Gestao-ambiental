-- Pagamento pela central avança o próximo vencimento (ADR-0026, atualização de 19/11/2026): a
-- cobrança do plano paga por central_simular_pagamento leva proximo_vencimento a um ciclo depois,
-- e a troca de plano seguinte fica para esse dia, não para amanhã.
begin;

select plan(5);

select testes.criar_dados_sinteticos();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000605', 'authenticated',
        'authenticated', 'operador605@grama.test', '', now(), '{"provider": "email", "providers": ["email"]}',
        '{"nome": "Operador Vencimento"}', now(), now());
insert into private.operador_plataforma (usuario_id) values ('e1000000-0000-4000-8000-000000000605');

-- Teste acabado, sem plano: a Gestão assina o Escala anual.
update private.configuracao_comercial set fim_do_beta = current_date - 400;
update public.consultoria set criada_em = now() - interval '60 days' where id = 'c0000000-0000-4000-8000-00000000000a';
select testes.autenticar_como('eduardo@filtroville.test');
select * from public.assinar_plano_simulado('c0000000-0000-4000-8000-00000000000a', 'escala', 'anual', 'pix');

reset role;
select set_config('testes.vencimento',
  (select proximo_vencimento::text from public.assinatura
   where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'), true);

select testes.autenticar_com_dois_fatores('operador605@grama.test');
select ok(public.central_simular_pagamento('c0000000-0000-4000-8000-00000000000a') >= 1,
  'a central paga as cobranças em aberto');

reset role;
select is(
  (select proximo_vencimento from public.assinatura where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  (current_setting('testes.vencimento')::date + interval '1 year')::date,
  'plano anual pago: o próximo vencimento vai um ano adiante');
select is(
  (select count(*)::integer from public.cobranca
   where consultoria_id = 'c0000000-0000-4000-8000-00000000000a' and situacao in ('pendente', 'vencida')),
  0, 'nada fica em aberto');

-- Repetir sem cobrança em aberto não mexe na assinatura.
select testes.autenticar_com_dois_fatores('operador605@grama.test');
select public.central_simular_pagamento('c0000000-0000-4000-8000-00000000000a');
reset role;
select is(
  (select proximo_vencimento from public.assinatura where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  (current_setting('testes.vencimento')::date + interval '1 year')::date,
  'pagar de novo sem nada em aberto não avança outra vez');

-- A troca para um plano menor fica para o fim do ano pago.
select testes.autenticar_como('eduardo@filtroville.test');
select is(
  (select t.mudanca_em from public.assinar_plano_simulado(
     'c0000000-0000-4000-8000-00000000000a', 'essencial', 'anual', 'pix') as t),
  (current_setting('testes.vencimento')::date + interval '1 year')::date,
  'trocar de plano depois de pagar vale no próximo vencimento, não amanhã');

select * from finish();

rollback;
