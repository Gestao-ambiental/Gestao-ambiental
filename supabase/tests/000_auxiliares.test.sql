-- Auxiliares dos testes pgTAP. Roda primeiro (ordem alfabética) e faz COMMIT de propósito:
-- o schema "testes" fica no banco descartável do CI/local para os arquivos seguintes.
-- Nunca existe em staging ou produção (não é migration).
begin;

create extension if not exists pgtap with schema extensions;

create schema if not exists testes;
grant usage on schema testes to anon, authenticated;

-- Dados sintéticos (os mesmos IDs de supabase/seed.sql). Idempotente: funciona com ou sem o seed.
create or replace function testes.criar_dados_sinteticos()
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.consultoria (id, nome, fuso) values
    ('c0000000-0000-4000-8000-00000000000a', 'Filtroville Consultoria Ambiental', 'America/Sao_Paulo'),
    ('c0000000-0000-4000-8000-00000000000b', 'Verde Sul Ambiental', 'America/Sao_Paulo')
  on conflict (id) do nothing;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', p.usuario_id, 'authenticated', 'authenticated', p.email,
         '', now(), '{"provider": "email", "providers": ["email"]}'::jsonb,
         jsonb_build_object('nome', p.nome), now(), now()
  from (values
    ('a0000000-0000-4000-8000-000000000001'::uuid, 'eduardo@filtroville.test',  'Eduardo Karnopp'),
    ('a0000000-0000-4000-8000-000000000002'::uuid, 'ana@filtroville.test',      'Ana Ribeiro'),
    ('a0000000-0000-4000-8000-000000000003'::uuid, 'bruno@filtroville.test',    'Bruno Tavares'),
    ('a0000000-0000-4000-8000-000000000004'::uuid, 'camila@filtroville.test',   'Camila Souza'),
    ('a0000000-0000-4000-8000-000000000005'::uuid, 'diego@filtroville.test',    'Diego Martins'),
    ('a0000000-0000-4000-8000-000000000006'::uuid, 'fernanda@filtroville.test', 'Fernanda Lopes'),
    ('b0000000-0000-4000-8000-000000000001'::uuid, 'gustavo@verdesul.test',     'Gustavo Pereira'),
    ('b0000000-0000-4000-8000-000000000002'::uuid, 'helena@verdesul.test',      'Helena Costa')
  ) as p (usuario_id, email, nome)
  on conflict (id) do nothing;

  insert into public.membro (id, consultoria_id, usuario_id, papel) values
    ('d0000000-0000-4000-8000-0000000000a1', 'c0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000001', 'gestao'),
    ('d0000000-0000-4000-8000-0000000000a2', 'c0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000002', 'equipe'),
    ('d0000000-0000-4000-8000-0000000000a3', 'c0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000003', 'equipe'),
    ('d0000000-0000-4000-8000-0000000000a4', 'c0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000004', 'equipe'),
    ('d0000000-0000-4000-8000-0000000000a5', 'c0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000005', 'equipe'),
    ('d0000000-0000-4000-8000-0000000000a6', 'c0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000006', 'equipe'),
    ('d0000000-0000-4000-8000-0000000000b1', 'c0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000001', 'gestao'),
    ('d0000000-0000-4000-8000-0000000000b2', 'c0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000002', 'equipe')
  on conflict (id) do nothing;
end;
$$;

-- Id do usuário pelo e-mail. security definer porque a troca de usuário pode acontecer
-- já com role authenticated, que não lê auth.users.
create or replace function testes.id_do_usuario(email_usuario text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users as u where u.email = email_usuario
$$;

-- Simula a requisição de um usuário logado: role authenticated + claims do JWT (lidas por auth.uid()).
-- Volte para o superusuário do teste com: reset role;
-- Sem cláusula SET de propósito: ela desfaria o set_config local ao sair da função.
create or replace function testes.autenticar_como(email_usuario text)
returns void
language plpgsql
as $$
declare
  usuario uuid;
begin
  usuario := testes.id_do_usuario(email_usuario);
  if usuario is null then
    raise exception 'usuário de teste % não existe', email_usuario;
  end if;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', usuario, 'role', 'authenticated', 'email', email_usuario)::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Simula uma requisição sem login (chave anônima, sem JWT de usuário).
create or replace function testes.autenticar_como_anonimo()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end;
$$;

grant execute on all functions in schema testes to anon, authenticated;

select plan(1);
select pass('auxiliares de teste instalados');
select * from finish();

commit;
