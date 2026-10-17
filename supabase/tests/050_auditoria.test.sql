-- Auditoria append-only por trigger (ADR-0010): registra ator, antes/depois e motivo;
-- só a Gestão da consultoria lê; ninguém altera nem apaga.
begin;

select plan(19);

select testes.criar_dados_sinteticos();

-- Simula uma RPC da Gestão de A: a sessão tem o JWT do Eduardo e define o motivo.
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
select set_config('gestao_ambiental.motivo', 'promoção de teste', true);

update public.membro set papel = 'gestao' where id = 'd0000000-0000-4000-8000-0000000000a3';

select is(
  (select count(*) from public.auditoria
   where entidade = 'membro' and entidade_id = 'd0000000-0000-4000-8000-0000000000a3' and acao = 'update'),
  1::bigint,
  'update em membro gera uma linha de auditoria'
);

select results_eq(
  $$select consultoria_id, ator_membro_id, antes ->> 'papel', depois ->> 'papel', motivo
    from public.auditoria
    where entidade = 'membro' and entidade_id = 'd0000000-0000-4000-8000-0000000000a3' and acao = 'update'$$,
  $$values ('c0000000-0000-4000-8000-00000000000a'::uuid, 'd0000000-0000-4000-8000-0000000000a1'::uuid,
            'equipe', 'gestao', 'promoção de teste')$$,
  'a linha registra consultoria, ator (membro do Eduardo), antes, depois e motivo'
);

select ok(
  (select instante is not null from public.auditoria
   where entidade = 'membro' and entidade_id = 'd0000000-0000-4000-8000-0000000000a3' and acao = 'update'),
  'a linha registra o instante do servidor'
);

-- Update sem mudança não gera linha
update public.membro set papel = 'gestao' where id = 'd0000000-0000-4000-8000-0000000000a3';

select is(
  (select count(*) from public.auditoria
   where entidade = 'membro' and entidade_id = 'd0000000-0000-4000-8000-0000000000a3' and acao = 'update'),
  1::bigint,
  'update sem mudança não gera linha'
);

-- Insert gera linha com antes nulo
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000099', 'authenticated',
        'authenticated', 'novo@filtroville.test', '', now(), now(), now());
insert into public.membro (id, consultoria_id, usuario_id, papel)
values ('d0000000-0000-4000-8000-0000000000a9', 'c0000000-0000-4000-8000-00000000000a',
        'a0000000-0000-4000-8000-000000000099', 'equipe');

select results_eq(
  $$select acao, antes is null, depois ->> 'papel'
    from public.auditoria where entidade_id = 'd0000000-0000-4000-8000-0000000000a9'$$,
  $$values ('insert'::public.acao_auditoria, true, 'equipe')$$,
  'insert em membro gera linha com antes nulo e depois preenchido'
);

-- Sem usuário na sessão (migration, seed, service role) o ator fica nulo
select set_config('request.jwt.claims', '', true);
select set_config('gestao_ambiental.motivo', '', true);
update public.membro set papel = 'equipe' where id = 'd0000000-0000-4000-8000-0000000000a3';

select results_eq(
  $$select ator_membro_id, motivo from public.auditoria
    where entidade_id = 'd0000000-0000-4000-8000-0000000000a3' and acao = 'update'
      and depois ->> 'papel' = 'equipe'$$,
  $$values (null::uuid, null::text)$$,
  'sem usuário na sessão, ator e motivo ficam nulos'
);

-- Leitura: Equipe não lê; Gestão lê a da própria consultoria
select testes.autenticar_como('ana@filtroville.test');

select is(
  (select count(*) from public.auditoria),
  0::bigint,
  'Equipe (Ana) não lê a auditoria'
);

select testes.autenticar_como('eduardo@filtroville.test');

select ok(
  (select count(*) from public.auditoria where entidade_id = 'd0000000-0000-4000-8000-0000000000a3') >= 2,
  'Gestão (Eduardo) lê a auditoria da Filtroville'
);

select is(
  (select count(*) from public.auditoria where consultoria_id <> 'c0000000-0000-4000-8000-00000000000a'),
  0::bigint,
  'Gestão (Eduardo) não lê auditoria de outra consultoria'
);

-- Ninguém altera nem apaga: Equipe, Gestão, service role e o próprio dono
select throws_ok(
  'update public.auditoria set motivo = $$adulterado$$',
  '42501', null,
  'Gestão não altera auditoria'
);

select throws_ok(
  'delete from public.auditoria',
  '42501', null,
  'Gestão não apaga auditoria'
);

select throws_ok(
  $$insert into public.auditoria (consultoria_id, entidade, entidade_id, acao)
    values ('c0000000-0000-4000-8000-00000000000a', 'membro', gen_random_uuid(), 'insert')$$,
  '42501', null,
  'Gestão não forja linha de auditoria'
);

select testes.autenticar_como('ana@filtroville.test');

select throws_ok(
  'update public.auditoria set motivo = $$adulterado$$',
  '42501', null,
  'Equipe não altera auditoria'
);

select throws_ok(
  'delete from public.auditoria',
  '42501', null,
  'Equipe não apaga auditoria'
);

reset role;
set local role service_role;

select throws_ok(
  'update public.auditoria set motivo = $$adulterado$$',
  '42501', null,
  'service role não altera auditoria'
);

select throws_ok(
  'delete from public.auditoria',
  '42501', null,
  'service role não apaga auditoria'
);

reset role;

select throws_ok(
  'update public.auditoria set motivo = $$adulterado$$',
  '42501', null,
  'nem o dono da tabela altera auditoria (trigger)'
);

select throws_ok(
  'delete from public.auditoria',
  '42501', null,
  'nem o dono da tabela apaga auditoria (trigger)'
);

select throws_ok(
  'truncate public.auditoria',
  '42501', null,
  'nem o dono da tabela trunca auditoria (trigger)'
);

select * from finish();

rollback;
