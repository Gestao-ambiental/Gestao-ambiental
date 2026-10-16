-- Seed do ambiente local e do CI (roda só em `supabase db reset`; nunca em staging ou produção).
-- Dados sintéticos do épico 1. Senha de todos: grama-dev-123 (só aqui).
-- IDs fixos e legíveis; os mesmos de supabase/tests/000_auxiliares.test.sql (manter em sincronia).
--   consultoria  c0000000-0000-4000-8000-00000000000a Filtroville | ...0b Verde Sul
--   usuário      a0000000-...-00000000000N (Filtroville)          | b0000000-...-00000000000N (Verde Sul)
--   membro       d0000000-...-0000000000aN (Filtroville)          | d0000000-...-0000000000bN (Verde Sul)

create temporary table pessoas_seed (
  usuario_id uuid,
  membro_id uuid,
  consultoria_id uuid,
  email text,
  nome text,
  papel public.papel_membro
);

insert into pessoas_seed values
  ('a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a1', 'c0000000-0000-4000-8000-00000000000a', 'eduardo@filtroville.test',  'Eduardo Karnopp',  'gestao'),
  ('a0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-0000000000a2', 'c0000000-0000-4000-8000-00000000000a', 'ana@filtroville.test',      'Ana Ribeiro',      'equipe'),
  ('a0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-0000000000a3', 'c0000000-0000-4000-8000-00000000000a', 'bruno@filtroville.test',    'Bruno Tavares',    'equipe'),
  ('a0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-0000000000a4', 'c0000000-0000-4000-8000-00000000000a', 'camila@filtroville.test',   'Camila Souza',     'equipe'),
  ('a0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-0000000000a5', 'c0000000-0000-4000-8000-00000000000a', 'diego@filtroville.test',    'Diego Martins',    'equipe'),
  ('a0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-0000000000a6', 'c0000000-0000-4000-8000-00000000000a', 'fernanda@filtroville.test', 'Fernanda Lopes',   'equipe'),
  ('b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000b1', 'c0000000-0000-4000-8000-00000000000b', 'gustavo@verdesul.test',     'Gustavo Pereira',  'gestao'),
  ('b0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-0000000000b2', 'c0000000-0000-4000-8000-00000000000b', 'helena@verdesul.test',      'Helena Costa',     'equipe');

insert into public.consultoria (id, nome, fuso) values
  ('c0000000-0000-4000-8000-00000000000a', 'Filtroville Consultoria Ambiental', 'America/Sao_Paulo'),
  ('c0000000-0000-4000-8000-00000000000b', 'Verde Sul Ambiental', 'America/Sao_Paulo');

-- Usuários do Auth com e-mail já confirmado. Os campos de token vazios ('') são exigidos pelo GoTrue no login.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
select
  '00000000-0000-0000-0000-000000000000', p.usuario_id, 'authenticated', 'authenticated', p.email,
  extensions.crypt('grama-dev-123', extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb, jsonb_build_object('nome', p.nome), now(), now(),
  '', '', '', ''
from pessoas_seed as p;

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select
  gen_random_uuid(), p.usuario_id, p.usuario_id::text, 'email',
  jsonb_build_object('sub', p.usuario_id::text, 'email', p.email, 'email_verified', true),
  now(), now(), now()
from pessoas_seed as p;

insert into public.membro (id, consultoria_id, usuario_id, papel)
select p.membro_id, p.consultoria_id, p.usuario_id, p.papel
from pessoas_seed as p;

drop table pessoas_seed;
