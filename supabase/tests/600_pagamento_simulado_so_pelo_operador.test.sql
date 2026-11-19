-- Pagamento simulado só pelo operador (ADR-0026, atualização de 19/11/2026): a Gestão não marca a
-- própria cobrança como paga, nem em só leitura; o operador sem dois fatores também não; o operador
-- com dois fatores paga, e repetir não muda nada.
begin;

select plan(8);

select testes.criar_dados_sinteticos();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000600', 'authenticated',
        'authenticated', 'operador600@grama.test', '', now(), '{"provider": "email", "providers": ["email"]}',
        '{"nome": "Operador Pagamento"}', now(), now());
insert into private.operador_plataforma (usuario_id) values ('e1000000-0000-4000-8000-000000000600');

-- Teste acabado, sem plano: a Gestão assina; o operador deixa a cobrança vencida há 10 dias.
update private.configuracao_comercial set fim_do_beta = current_date - 400;
update public.consultoria set criada_em = now() - interval '60 days' where id = 'c0000000-0000-4000-8000-00000000000a';
select testes.autenticar_como('eduardo@filtroville.test');
select * from public.assinar_plano_simulado('c0000000-0000-4000-8000-00000000000a', 'equipe', 'mensal', 'pix');
select testes.autenticar_com_dois_fatores('operador600@grama.test');
select set_config('testes.cobranca',
  public.central_simular_atraso('c0000000-0000-4000-8000-00000000000a', 10)::text, true);

select testes.autenticar_com_dois_fatores('eduardo@filtroville.test');
select is((select s.somente_leitura from public.situacao_comercial('c0000000-0000-4000-8000-00000000000a') as s),
  true, 'atraso de 10 dias: só leitura');
select throws_ok(
  $$select public.pagar_cobranca_simulada(current_setting('testes.cobranca')::uuid)$$,
  '42501', 'sem_permissao',
  'Gestão (mesmo com dois fatores) não marca a própria cobrança como paga');

select testes.autenticar_como('ana@filtroville.test');
select throws_ok(
  $$select public.pagar_cobranca_simulada(current_setting('testes.cobranca')::uuid)$$,
  '42501', 'sem_permissao', 'Equipe não paga');

select testes.autenticar_como('operador600@grama.test');
select throws_ok(
  $$select public.pagar_cobranca_simulada(current_setting('testes.cobranca')::uuid)$$,
  '42501', 'dois_fatores_necessarios', 'operador só com senha não paga');

reset role;
select is((select situacao from public.cobranca where id = current_setting('testes.cobranca')::uuid),
  'vencida', 'ninguém sem permissão mudou a cobrança');

select testes.autenticar_com_dois_fatores('operador600@grama.test');
select lives_ok(
  $$select public.pagar_cobranca_simulada(current_setting('testes.cobranca')::uuid)$$,
  'operador com dois fatores paga');
select lives_ok(
  $$select public.pagar_cobranca_simulada(current_setting('testes.cobranca')::uuid)$$,
  'repetir é aceito (idempotente)');

reset role;
select is((select situacao from public.cobranca where id = current_setting('testes.cobranca')::uuid),
  'paga', 'a cobrança ficou paga');

select * from finish();

rollback;
