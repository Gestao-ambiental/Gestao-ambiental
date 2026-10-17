-- Regras estruturais que valem para TODA tabela de public, inclusive as dos próximos épicos
-- (ADR-0003, DoD item 2). Uma tabela nova sem RLS forçada, sem consultoria_id ou sem política
-- quebra este teste.
begin;

select plan(14);

select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
   from pg_catalog.pg_class as c
   join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and not (c.relrowsecurity and c.relforcerowsecurity)),
  '{}'::text[],
  'toda tabela de public tem RLS habilitada e forçada'
);

select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
   from pg_catalog.pg_class as c
   join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and c.relname <> 'consultoria'
     and not exists (
       select 1 from pg_catalog.pg_attribute as a
       where a.attrelid = c.oid and a.attname = 'consultoria_id' and not a.attisdropped
     )),
  '{}'::text[],
  'toda tabela de public (exceto consultoria) tem consultoria_id'
);

select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
   from pg_catalog.pg_class as c
   join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and not exists (select 1 from pg_catalog.pg_policy as p where p.polrelid = c.oid)),
  '{}'::text[],
  'toda tabela de public tem ao menos uma política'
);

select is(
  (select coalesce(array_agg(distinct table_name::text order by table_name::text), '{}')
   from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public'),
  '{}'::text[],
  'anon não tem nenhum privilégio em tabelas de public'
);

select is(
  (select coalesce(array_agg(table_name::text || ':' || privilege_type order by table_name::text, privilege_type), '{}')
   from information_schema.role_table_grants
   where grantee = 'authenticated' and table_schema = 'public'
     and table_name in ('consultoria', 'membro', 'auditoria')
     and privilege_type <> 'SELECT'),
  '{}'::text[],
  'authenticated só lê consultoria, membro e auditoria (escrita será por RPC)'
);

-- Schema private fora do alcance de anon e com helpers blindados
select ok(
  not has_schema_privilege('anon', 'private', 'usage'),
  'anon não usa o schema private'
);

select ok(
  not exists (
    select 1 from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'private' and has_function_privilege('anon', p.oid, 'execute')
  ),
  'anon não executa nenhuma função de private'
);

select is_definer('private', 'is_membro', array['uuid'], 'is_membro é security definer');
select is_definer('private', 'is_gestao', array['uuid'], 'is_gestao é security definer');
select is_definer('private', 'membro_atual', array['uuid'], 'membro_atual é security definer');

select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
   from pg_catalog.pg_proc as p
   join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and not exists (select 1 from unnest(p.proconfig) as cfg where cfg like 'search_path=%')),
  '{}'::text[],
  'toda função de private fixa o search_path'
);

select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
   from pg_catalog.pg_proc as p
   join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname in ('is_membro', 'is_gestao', 'membro_atual')
     and p.provolatile <> 's'),
  '{}'::text[],
  'helpers de autorização são stable'
);

-- Os helpers leem membro como o dono (security definer). Se o dono não ignorar RLS,
-- a política de membro (que chama is_membro) devolveria zero linhas para todos.
select ok(
  (select r.rolbypassrls
   from pg_catalog.pg_proc as p
   join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
   join pg_catalog.pg_roles as r on r.oid = p.proowner
   where n.nspname = 'private' and p.proname = 'is_membro'),
  'o dono dos helpers ignora RLS (premissa do security definer)'
);

select col_is_unique('public', 'membro', array['consultoria_id', 'id'],
  'membro tem unique (consultoria_id, id) para FKs compostas');

select * from finish();

rollback;
