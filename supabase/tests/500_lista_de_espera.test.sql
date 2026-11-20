-- Lista de espera do site (ADR-0032): sem login, qualquer um entra com nome e e-mail ou WhatsApp;
-- o contato é normalizado e não repete; anon não lê a tabela; só o operador com dois fatores lista;
-- Gestão de uma consultoria não vê a lista.
begin;

select plan(16);

select testes.criar_dados_sinteticos();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000050', 'authenticated',
        'authenticated', 'operador50@grama.test', '', now(), '{"provider": "email", "providers": ["email"]}',
        '{"nome": "Operador Lista"}', now(), now());
insert into private.operador_plataforma (usuario_id) values ('e1000000-0000-4000-8000-000000000050');

-- ---------------------------------------------------------------- sem login
select testes.autenticar_como_anonimo();
select lives_ok(
  $$select public.entrar_lista_de_espera('  Marina   Souza ', 'Marina@Exemplo.test ')$$,
  'sem login, entra com e-mail');
select lives_ok(
  $$select public.entrar_lista_de_espera('João Lima', '(47) 99999-1234')$$,
  'sem login, entra com WhatsApp');
select lives_ok(
  $$select public.entrar_lista_de_espera('Marina de novo', 'marina@exemplo.test')$$,
  'contato repetido não dá erro');
select throws_ok(
  $$select public.entrar_lista_de_espera('M', 'm@exemplo.test')$$,
  '22023', 'nome_invalido', 'nome curto é recusado');
select throws_ok(
  $$select public.entrar_lista_de_espera('Pedro', 'pedro@semponto')$$,
  '22023', 'contato_invalido', 'e-mail sem domínio é recusado');
select throws_ok(
  $$select public.entrar_lista_de_espera('Pedro', '1234')$$,
  '22023', 'contato_invalido', 'telefone curto é recusado');
select throws_ok(
  $$select count(*) from private.lista_de_espera$$,
  '42501', null, 'anon não lê a tabela');
select throws_ok(
  $$select * from public.central_lista_de_espera()$$,
  '42501', null, 'anon não lista pela central');

reset role;
select results_eq(
  $$select nome, contato, tipo_contato from private.lista_de_espera order by criada_em, contato$$,
  $$values ('João Lima', '5547999991234', 'whatsapp'), ('Marina Souza', 'marina@exemplo.test', 'email')$$,
  'contatos normalizados e sem repetição'
);
-- Na mesma transação os dois têm o mesmo now(): a Marina fica 10 minutos antes, para a ordem ser certa.
update private.lista_de_espera set criada_em = now() - interval '10 minutes' where contato = 'marina@exemplo.test';

-- ---------------------------------------------------------------- logado sem ser operador
select testes.autenticar_com_dois_fatores('eduardo@filtroville.test');
select throws_ok(
  $$select * from public.central_lista_de_espera()$$,
  '42501', 'sem_permissao', 'Gestão de uma consultoria não vê a lista');
select throws_ok(
  $$select count(*) from private.lista_de_espera$$,
  '42501', null, 'logado não lê a tabela direto');
select testes.autenticar_com_dois_fatores('gustavo@verdesul.test');
select throws_ok(
  $$select * from public.central_lista_de_espera()$$,
  '42501', 'sem_permissao', 'outra consultoria também não vê');

-- ---------------------------------------------------------------- operador
select testes.autenticar_com_dois_fatores('operador50@grama.test');
select results_eq(
  $$select nome, tipo_contato, total from public.central_lista_de_espera(1, 0)$$,
  $$values ('João Lima', 'whatsapp', 2::bigint)$$,
  'operador lista os mais recentes primeiro, com o total'
);
select is(
  (select count(*)::integer from public.central_lista_de_espera(50, 1)),
  1,
  'paginação pelo deslocamento'
);

-- ---------------------------------------------------------------- teto por hora
reset role;
insert into private.lista_de_espera (nome, contato, tipo_contato)
select 'Robô ' || g, 'robo' || g || '@exemplo.test', 'email' from generate_series(1, 298) as g;
select testes.autenticar_como_anonimo();
select throws_ok(
  $$select public.entrar_lista_de_espera('Mais um', 'mais@exemplo.test')$$,
  'P0001', 'muitas_tentativas', 'passou de 300 na última hora (teto global): recusa');
reset role;
select is(
  (select count(*)::integer from private.lista_de_espera where contato = 'mais@exemplo.test'),
  0,
  'nada gravado depois do teto'
);

select * from finish();
rollback;
