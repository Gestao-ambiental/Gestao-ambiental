-- Lista de espera, parte 2 (ADR-0034): o operador marca contatado e registra convite; a leitura traz
-- as marcações e filtra os pendentes; o aviso de cadastro novo só pela service role; quem não é
-- operador (Gestão, outra consultoria, anon) não marca nem convida. Sem pg_net/Vault o gatilho
-- não impede o cadastro.
begin;

select plan(18);

select testes.criar_dados_sinteticos();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000051', 'authenticated',
        'authenticated', 'operador51@grama.test', '', now(), '{"provider": "email", "providers": ["email"]}',
        '{"nome": "Operador Convite"}', now(), now());
insert into private.operador_plataforma (usuario_id) values ('e1000000-0000-4000-8000-000000000051');

-- ---------------------------------------------------------------- cadastro com o gatilho
select testes.autenticar_como_anonimo();
select lives_ok(
  $$select public.entrar_lista_de_espera('Ana Prado', 'ana@exemplo.test')$$,
  'cadastro passa mesmo sem pg_net ou Vault');
select lives_ok(
  $$select public.entrar_lista_de_espera('Bruno Reis', '(47) 98888-7777')$$,
  'segundo cadastro');
reset role;
update private.lista_de_espera set criada_em = now() - interval '10 minutes', id = 'a5300000-0000-4000-8000-000000000001'
  where contato = 'ana@exemplo.test';
update private.lista_de_espera set id = 'a5300000-0000-4000-8000-000000000002' where contato = '5547988887777';

select results_eq(
  $$select count(*)::integer from private.lista_de_espera where avisado_em is null$$,
  $$values (2)$$,
  'cadastros novos ficam pendentes de aviso');

-- ---------------------------------------------------------------- quem não é operador
select testes.autenticar_com_dois_fatores('eduardo@filtroville.test');
select throws_ok(
  $$select public.central_marcar_contatado('a5300000-0000-4000-8000-000000000001', true)$$,
  '42501', 'sem_permissao', 'Gestão de uma consultoria não marca contatado');
select throws_ok(
  $$select * from public.central_registrar_convite('a5300000-0000-4000-8000-000000000001')$$,
  '42501', 'sem_permissao', 'Gestão de uma consultoria não convida');
select throws_ok(
  $$select public.lista_de_espera_pendente_de_aviso()$$,
  '42501', null, 'logado não lê os pendentes de aviso');
select testes.autenticar_com_dois_fatores('gustavo@verdesul.test');
select throws_ok(
  $$select public.central_marcar_contatado('a5300000-0000-4000-8000-000000000001', true)$$,
  '42501', 'sem_permissao', 'outra consultoria também não marca');
select testes.autenticar_como_anonimo();
select throws_ok(
  $$select public.central_marcar_contatado(gen_random_uuid(), true)$$,
  '42501', null, 'anon não marca');
select throws_ok(
  $$select public.lista_de_espera_marcar_avisados(array[gen_random_uuid()])$$,
  '42501', null, 'anon não marca avisados');
reset role;

-- ---------------------------------------------------------------- operador
select testes.autenticar_com_dois_fatores('operador51@grama.test');
select lives_ok(
  $$select public.central_marcar_contatado('a5300000-0000-4000-8000-000000000001', true)$$,
  'operador marca contatado');
select results_eq(
  $$select nome, contatado_em is not null, convidado_em is not null, total
    from public.central_lista_de_espera(50, 0) order by nome$$,
  $$values ('Ana Prado', true, false, 2::bigint), ('Bruno Reis', false, false, 2::bigint)$$,
  'a leitura traz contatado e convidado');
select results_eq(
  $$select nome, total from public.central_lista_de_espera(50, 0, true)$$,
  $$values ('Bruno Reis', 1::bigint)$$,
  'filtro dos pendentes deixa só quem não foi contatado');
select lives_ok(
  $$select public.central_marcar_contatado('a5300000-0000-4000-8000-000000000001', false)$$,
  'operador desmarca');
select results_eq(
  $$select nome, contato, tipo_contato from public.central_registrar_convite('a5300000-0000-4000-8000-000000000002')$$,
  $$values ('Bruno Reis', '5547988887777', 'whatsapp')$$,
  'convite devolve o contato para enviar');
select throws_ok(
  $$select * from public.central_registrar_convite(gen_random_uuid())$$,
  'P0001', 'cadastro_inexistente', 'convite de cadastro que não existe');
reset role;
select results_eq(
  $$select contato, contatado_por is not null, convidado_por = 'e1000000-0000-4000-8000-000000000051'
    from private.lista_de_espera order by contato$$,
  $$values ('5547988887777', true, true), ('ana@exemplo.test', false, null::boolean)$$,
  'convite também marca contatado e guarda quem convidou; desmarcar limpa quem marcou');

-- ---------------------------------------------------------------- aviso pela service role
set local role service_role;
select ok(
  jsonb_array_length(public.lista_de_espera_pendente_de_aviso() -> 'cadastros') = 2
    and (public.lista_de_espera_pendente_de_aviso() -> 'destinatarios') ? 'operador51@grama.test',
  'service role lê os cadastros pendentes e os e-mails dos operadores');
select is(
  public.lista_de_espera_marcar_avisados(
    array(select (c ->> 'id')::uuid
          from jsonb_array_elements(public.lista_de_espera_pendente_de_aviso() -> 'cadastros') as c)),
  2,
  'marca os dois como avisados');
reset role;

select * from finish();
rollback;
