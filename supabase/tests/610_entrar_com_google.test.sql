-- Entrar com Google (ADR-0040): nome vindo do Google e convite que não pede senha a quem já entra
-- pelo Google. O token do convite continua guardado só como hash.
begin;

select plan(6);

select testes.criar_dados_sinteticos();

-- Pessoa que entrou pelo Google: sem senha, com identidade "google" e o nome em full_name.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-0000000000f1',
        'authenticated', 'authenticated', 'marina@gmail.test', '', now(),
        '{"provider": "google", "providers": ["google"]}'::jsonb,
        '{"full_name": "Marina Couto", "name": "Marina Couto", "email_verified": true}'::jsonb,
        now(), now());

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
values (gen_random_uuid(), 'a0000000-0000-4000-8000-0000000000f1', '1098765432',
        'google', '{"sub": "1098765432", "email": "marina@gmail.test"}'::jsonb, now(), now());

select is(
  private.nome_do_usuario('{"full_name": "Marina Couto"}'::jsonb, 'marina@gmail.test'),
  'Marina Couto',
  'o nome vem do full_name do Google'
);

select is(
  private.nome_do_usuario('{"nome": "Marina C.", "full_name": "Marina Couto"}'::jsonb, 'marina@gmail.test'),
  'Marina C.',
  'o nome do cadastro por senha continua tendo preferência'
);

select is(
  private.nome_do_usuario('{}'::jsonb, 'marina@gmail.test'),
  'marina',
  'sem nome nenhum, fica o pedaço do e-mail antes do @'
);

-- Convite para a pessoa do Google e para alguém sem conta.
select testes.autenticar_como('eduardo@filtroville.test');

select set_config('testes.token_google',
  (select token from public.criar_convite('c0000000-0000-4000-8000-00000000000a', 'marina@gmail.test', 'equipe')),
  true);
select set_config('testes.token_novo',
  (select token from public.criar_convite('c0000000-0000-4000-8000-00000000000a', 'ninguem@exemplo.test', 'equipe')),
  true);

select testes.autenticar_como_anonimo();

select is(
  (select conta_com_senha from public.consultar_convite(current_setting('testes.token_google'))),
  true,
  'quem já entra pelo Google tem conta pronta: o convite não pede senha'
);

select is(
  (select conta_com_senha from public.consultar_convite(current_setting('testes.token_novo'))),
  false,
  'quem ainda não tem conta continua criando a dela'
);

reset role;

select is(
  (select count(*) from public.convite where token_hash = current_setting('testes.token_google')),
  0::bigint,
  'o token do convite não fica gravado em claro'
);

select * from finish();

rollback;
