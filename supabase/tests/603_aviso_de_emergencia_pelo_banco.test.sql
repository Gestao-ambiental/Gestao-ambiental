-- Aviso do acesso de emergência pelo banco (ADR-0025, atualização de 19/11/2026): o gatilho existe
-- e não impede o acesso sem pg_net/Vault; só a service role reserva e libera o aviso; a reserva sai
-- uma vez só por acesso (o gatilho e o front não mandam e-mail em dobro) e só para emergência.
begin;

select plan(10);

select testes.criar_dados_sinteticos();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000603', 'authenticated',
        'authenticated', 'operador603@grama.test', '', now(), '{"provider": "email", "providers": ["email"]}',
        '{"nome": "Operador Aviso"}', now(), now());
insert into private.operador_plataforma (usuario_id) values ('e1000000-0000-4000-8000-000000000603');

select has_trigger('public', 'acesso_suporte', 'acesso_suporte_avisar_emergencia',
  'acesso de emergência novo chama o aviso pelo banco');

select testes.autenticar_com_dois_fatores('operador603@grama.test');
select lives_ok(
  $$select public.abrir_acesso_de_emergencia('a5000000-0000-4000-8000-000000006031',
      'c0000000-0000-4000-8000-00000000000b', 'falha_grave', 'Sistema fora para a Verde Sul')$$,
  'a emergência abre mesmo sem pg_net, Vault ou segredos');

select testes.autenticar_como('eduardo@filtroville.test');
select lives_ok(
  $$select public.autorizar_acesso_de_suporte('a5000000-0000-4000-8000-000000006032',
      'c0000000-0000-4000-8000-00000000000a', 2, null)$$,
  'a Gestão autoriza um acesso (sem aviso por e-mail)');

-- Quem está logado (nem o operador) não reserva nem libera: só a service role da Edge Function.
select testes.autenticar_com_dois_fatores('operador603@grama.test');
select throws_ok(
  $$select * from public.reservar_aviso_de_emergencia('a5000000-0000-4000-8000-000000006031')$$,
  '42501', null, 'operador logado não reserva o aviso');
select throws_ok(
  $$select public.liberar_aviso_de_emergencia('a5000000-0000-4000-8000-000000006031')$$,
  '42501', null, 'operador logado não libera o aviso');

reset role;
set local role service_role;
select results_eq(
  $$select acesso_id, consultoria_nome, categoria, operador_nome
    from public.reservar_aviso_de_emergencia('a5000000-0000-4000-8000-000000006031')$$,
  $$values ('a5000000-0000-4000-8000-000000006031'::uuid, 'Verde Sul Ambiental'::text, 'falha_grave'::text,
            'Operador Aviso'::text)$$,
  'a primeira reserva devolve os dados do e-mail');
select is((select count(*)::integer from public.reservar_aviso_de_emergencia('a5000000-0000-4000-8000-000000006031')),
  0, 'a segunda reserva não devolve nada (um e-mail só)');
select lives_ok($$select public.liberar_aviso_de_emergencia('a5000000-0000-4000-8000-000000006031')$$,
  'falhou o envio: libera a reserva');
select is((select count(*)::integer from public.reservar_aviso_de_emergencia('a5000000-0000-4000-8000-000000006031')),
  1, 'liberada, a reserva vale de novo');
select is((select count(*)::integer from public.reservar_aviso_de_emergencia('a5000000-0000-4000-8000-000000006032')),
  0, 'acesso autorizado pela Gestão não tem aviso por e-mail');
reset role;

select * from finish();

rollback;
