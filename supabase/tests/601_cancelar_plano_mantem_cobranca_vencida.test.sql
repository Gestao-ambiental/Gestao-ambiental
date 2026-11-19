-- Cancelar o plano não apaga dívida (ADR-0026, atualização de 19/11/2026): a cobrança pendente já
-- vencida continua devida; a que ainda não venceu sai; assinar de novo com dívida vencida é
-- recusado ('cobranca_em_atraso') até o pagamento.
begin;

select plan(7);

select testes.criar_dados_sinteticos();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000601', 'authenticated',
        'authenticated', 'operador601@grama.test', '', now(), '{"provider": "email", "providers": ["email"]}',
        '{"nome": "Operador Cancelamento"}', now(), now());
insert into private.operador_plataforma (usuario_id) values ('e1000000-0000-4000-8000-000000000601');

-- Teste acabado, sem plano: a Gestão assina (cobrança pendente vencendo hoje).
update private.configuracao_comercial set fim_do_beta = current_date - 400;
update public.consultoria set criada_em = now() - interval '60 days' where id = 'c0000000-0000-4000-8000-00000000000a';
select testes.autenticar_como('eduardo@filtroville.test');
select * from public.assinar_plano_simulado('c0000000-0000-4000-8000-00000000000a', 'equipe', 'mensal', 'pix');

-- A primeira cobrança fica pendente e vencida há 10 dias (sem passar pela central); outra pendente
-- vence hoje (ainda não venceu).
reset role;
select set_config('request.jwt.claims', '', true); -- sem usuário, como a service role
update public.cobranca
set id = 'cb000000-0000-4000-8000-000000000601',
    vencimento = private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a') - 10
where consultoria_id = 'c0000000-0000-4000-8000-00000000000a';
insert into public.cobranca (id, consultoria_id, assinatura_id, tipo, valor_centavos, vencimento, situacao, forma)
select 'cb000000-0000-4000-8000-000000000602', a.consultoria_id, a.id, 'plano', 129000,
       private.hoje_da_consultoria(a.consultoria_id), 'pendente', 'pix'
from public.assinatura as a where a.consultoria_id = 'c0000000-0000-4000-8000-00000000000a';

select testes.autenticar_como('eduardo@filtroville.test');
select lives_ok(
  $$select public.cancelar_plano_simulado('c0000000-0000-4000-8000-00000000000a')$$,
  'a Gestão cancela');

reset role;
select results_eq(
  $$select id, situacao from public.cobranca
    where consultoria_id = 'c0000000-0000-4000-8000-00000000000a' order by id$$,
  $$values ('cb000000-0000-4000-8000-000000000601'::uuid, 'pendente'::text),
           ('cb000000-0000-4000-8000-000000000602'::uuid, 'removida'::text)$$,
  'cancelar mantém a cobrança vencida e remove só a que ainda não venceu');

select testes.autenticar_como('eduardo@filtroville.test');
select is((select s.cobranca_aberta_id from public.situacao_comercial('c0000000-0000-4000-8000-00000000000a') as s),
  'cb000000-0000-4000-8000-000000000601'::uuid, 'a Gestão continua vendo a cobrança vencida em aberto');
select throws_ok(
  $$select * from public.assinar_plano_simulado('c0000000-0000-4000-8000-00000000000a', 'equipe', 'mensal', 'pix')$$,
  'P0001', 'cobranca_em_atraso',
  'assinar de novo com cobrança vencida é recusado');
select throws_ok(
  $$select * from public.assinar_plano_simulado('c0000000-0000-4000-8000-00000000000a', 'essencial', 'anual', 'cartao')$$,
  'P0001', 'cobranca_em_atraso',
  'nem trocando o plano, o ciclo ou a forma');

-- Pago pela central, volta a poder assinar.
select testes.autenticar_com_dois_fatores('operador601@grama.test');
select is(public.central_simular_pagamento('c0000000-0000-4000-8000-00000000000a'), 1,
  'a central confirma o pagamento da cobrança vencida');
select testes.autenticar_como('eduardo@filtroville.test');
select lives_ok(
  $$select * from public.assinar_plano_simulado('c0000000-0000-4000-8000-00000000000a', 'equipe', 'mensal', 'pix')$$,
  'pago: assina de novo');

select * from finish();

rollback;
