-- Aviso do acesso de emergência guarda se o e-mail saiu (ADR-0025, atualização de 19/11/2026): só
-- a service role marca e consulta; o estado vai de livre a em andamento (reservado) e a enviado, e
-- volta a livre quando o envio falha e a reserva é liberada.
begin;

select plan(8);

select testes.criar_dados_sinteticos();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000606', 'authenticated',
        'authenticated', 'operador606@grama.test', '', now(), '{"provider": "email", "providers": ["email"]}',
        '{"nome": "Operador Resultado"}', now(), now());
insert into private.operador_plataforma (usuario_id) values ('e1000000-0000-4000-8000-000000000606');

select testes.autenticar_com_dois_fatores('operador606@grama.test');
select public.abrir_acesso_de_emergencia('a5000000-0000-4000-8000-000000006061',
  'c0000000-0000-4000-8000-00000000000b', 'falha_grave', 'Sistema fora para a Verde Sul');

select throws_ok(
  $$select public.estado_do_aviso_de_emergencia('a5000000-0000-4000-8000-000000006061')$$,
  '42501', null, 'operador logado não consulta o estado do aviso');
select throws_ok(
  $$select public.marcar_aviso_de_emergencia_enviado('a5000000-0000-4000-8000-000000006061')$$,
  '42501', null, 'operador logado não marca o aviso como enviado');

reset role;
set local role service_role;
select is(public.estado_do_aviso_de_emergencia('a5000000-0000-4000-8000-000000006061'), 'livre',
  'sem reserva: livre');
select is((select count(*)::integer from public.reservar_aviso_de_emergencia('a5000000-0000-4000-8000-000000006061')),
  1, 'reserva o aviso');
select is(public.estado_do_aviso_de_emergencia('a5000000-0000-4000-8000-000000006061'), 'em_andamento',
  'reservado, sem resultado: em andamento');
select public.liberar_aviso_de_emergencia('a5000000-0000-4000-8000-000000006061');
select is(public.estado_do_aviso_de_emergencia('a5000000-0000-4000-8000-000000006061'), 'livre',
  'o envio falhou e a reserva foi liberada: livre de novo');
select is((select count(*)::integer from public.reservar_aviso_de_emergencia('a5000000-0000-4000-8000-000000006061')),
  1, 'quem esperava reserva de novo');
select public.marcar_aviso_de_emergencia_enviado('a5000000-0000-4000-8000-000000006061');
select is(public.estado_do_aviso_de_emergencia('a5000000-0000-4000-8000-000000006061'), 'enviado',
  'o Resend aceitou: enviado');
reset role;

select * from finish();

rollback;
