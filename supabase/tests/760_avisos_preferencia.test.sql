-- Avisos (P5, ADR-0047): preferência do resumo diário. Sem linha = ligado; definir com
-- row_version (0 sem linha) e conflito; cada pessoa só vê e muda a própria preferência (nem a
-- Gestão vê a dos outros; outra consultoria, zero linhas); desligado recebe sem_permissao; funciona
-- com a consultoria em somente leitura comercial; auditoria com a pessoa como ator.
begin;

select plan(26);

select testes.criar_dados_sinteticos();

-- ---------------------------------------------------------------------------
-- Estrutura
-- ---------------------------------------------------------------------------
select is(
  (select array_agg(c.relname::text order by c.relname)
   from pg_catalog.pg_class as c
   join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('preferencia_aviso', 'feed_calendario', 'aviso_envio')
     and c.relrowsecurity and c.relforcerowsecurity),
  array['aviso_envio', 'feed_calendario', 'preferencia_aviso'],
  'as três tabelas de avisos têm RLS habilitada e forçada'
);

select ok(
  not exists (
    select 1 from pg_catalog.pg_trigger as t
    where t.tgrelid in ('public.preferencia_aviso'::regclass, 'public.feed_calendario'::regclass)
      and t.tgname = '_comercial_somente_leitura')
  and exists (
    select 1 from pg_catalog.pg_trigger as t
    where t.tgrelid = 'public.aviso_envio'::regclass and t.tgname = '_comercial_somente_leitura'),
  'preferência e feed sem a barreira comercial; aviso_envio com ela'
);

select ok(
  has_function_privilege('authenticated', 'public.meus_avisos(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.definir_resumo_diario(uuid, boolean, integer)', 'execute')
  and not has_function_privilege('anon', 'public.meus_avisos(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.definir_resumo_diario(uuid, boolean, integer)', 'execute'),
  'meus_avisos e definir_resumo_diario: authenticated executa, anon não'
);

select ok(
  not has_table_privilege('authenticated', 'public.preferencia_aviso', 'insert')
  and not has_table_privilege('authenticated', 'public.preferencia_aviso', 'update')
  and not has_table_privilege('authenticated', 'public.preferencia_aviso', 'delete')
  and not has_table_privilege('anon', 'public.preferencia_aviso', 'select'),
  'o cliente só lê preferencia_aviso (escrita só por RPC); anon nem lê'
);

-- ---------------------------------------------------------------------------
-- Padrão: sem linha = ligado
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select results_eq(
  $$select resumo_diario, row_version, link_ativo, link_criado_em, link_ultimo_acesso_em
    from public.meus_avisos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values (true, 0, false, null::timestamptz, null::timestamptz)$$,
  'sem preferência gravada, o resumo está ligado (versão 0) e não há link'
);

select throws_ok(
  $$select public.definir_resumo_diario('c0000000-0000-4000-8000-00000000000a', false, 1)$$,
  'P0001', 'conflito_de_versao',
  'sem linha, a versão esperada é 0'
);

select throws_ok(
  $$select public.definir_resumo_diario('c0000000-0000-4000-8000-00000000000a', null, 0)$$,
  '22023', 'ligado_obrigatorio',
  'ligar ou desligar é obrigatório'
);

select is(
  public.definir_resumo_diario('c0000000-0000-4000-8000-00000000000a', false, 0),
  1,
  'desliga a partir da versão 0 e devolve a versão 1'
);

select results_eq(
  $$select resumo_diario, row_version from public.meus_avisos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values (false, 1)$$,
  'a pessoa vê o resumo desligado na versão 1'
);

select throws_ok(
  $$select public.definir_resumo_diario('c0000000-0000-4000-8000-00000000000a', true, 0)$$,
  'P0001', 'conflito_de_versao',
  'versão antiga dá conflito'
);

select is(
  public.definir_resumo_diario('c0000000-0000-4000-8000-00000000000a', true, 1),
  2,
  'religa com a versão atual e devolve a versão 2'
);

select results_eq(
  $$select membro_id, resumo_diario, origem, row_version from public.preferencia_aviso$$,
  $$values ('d0000000-0000-4000-8000-0000000000a2'::uuid, true, 'perfil'::text, 2)$$,
  'a pessoa lê só a própria linha, gravada pelo Perfil'
);

select throws_ok(
  $$insert into public.preferencia_aviso (consultoria_id, membro_id, resumo_diario)
    values ('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a2', false)$$,
  '42501', null,
  'o cliente não grava direto na tabela'
);

-- Outro membro da mesma consultoria (Gestão) não vê a linha da Ana.
select testes.autenticar_como('eduardo@filtroville.test');
select is(
  (select count(*) from public.preferencia_aviso),
  0::bigint,
  'a Gestão não vê a preferência de outro membro'
);
select results_eq(
  $$select resumo_diario, row_version from public.meus_avisos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values (true, 0)$$,
  'a preferência da Ana não muda a da Gestão'
);

-- Outra consultoria.
select testes.autenticar_como('gustavo@verdesul.test');
select is(
  (select count(*) from public.preferencia_aviso),
  0::bigint,
  'usuário de outra consultoria não vê nenhuma linha'
);
select throws_ok(
  $$select * from public.meus_avisos('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', 'sem_permissao',
  'outra consultoria: meus_avisos recusa'
);
select throws_ok(
  $$select public.definir_resumo_diario('c0000000-0000-4000-8000-00000000000a', false, 0)$$,
  '42501', 'sem_permissao',
  'outra consultoria: definir_resumo_diario recusa'
);

-- Anônimo.
select testes.autenticar_como_anonimo();
select throws_ok(
  $$select count(*) from public.preferencia_aviso$$,
  '42501', null,
  'anon não lê preferencia_aviso'
);

-- ---------------------------------------------------------------------------
-- Membro desligado
-- ---------------------------------------------------------------------------
reset role;
update public.membro set situacao = 'desligado', desligado_em = now()
where id = 'd0000000-0000-4000-8000-0000000000a3';

select testes.autenticar_como('bruno@filtroville.test');
select throws_ok(
  $$select * from public.meus_avisos('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', 'sem_permissao',
  'membro desligado: meus_avisos recusa'
);
select throws_ok(
  $$select public.definir_resumo_diario('c0000000-0000-4000-8000-00000000000a', false, 0)$$,
  '42501', 'sem_permissao',
  'membro desligado: definir_resumo_diario recusa'
);

-- ---------------------------------------------------------------------------
-- Somente leitura comercial: a pessoa ainda desliga o aviso e mexe no link
-- ---------------------------------------------------------------------------
reset role;
update private.configuracao_comercial set fim_do_beta = current_date - 400;
update public.consultoria set criada_em = now() - interval '60 days'
where id = 'c0000000-0000-4000-8000-00000000000a';
delete from public.consultoria_condicao_comercial where consultoria_id = 'c0000000-0000-4000-8000-00000000000a';

select ok(
  private.consultoria_somente_leitura('c0000000-0000-4000-8000-00000000000a'),
  'a Filtroville está em somente leitura comercial (teste acabado sem plano)'
);

select testes.autenticar_como('camila@filtroville.test');
select is(
  public.definir_resumo_diario('c0000000-0000-4000-8000-00000000000a', false, 0),
  1,
  'em somente leitura, a pessoa desliga o resumo'
);
select ok(
  public.gerar_link_do_calendario('c0000000-0000-4000-8000-00000000000a') ~ '^[0-9a-f]{64}$'
  and public.revogar_link_do_calendario('c0000000-0000-4000-8000-00000000000a'),
  'em somente leitura, a pessoa gera e revoga o link do calendário'
);

-- ---------------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------------
reset role;
select is(
  (select array_agg(a.acao::text || ':' || coalesce(a.depois ->> 'resumo_diario', '') order by a.id)
   from public.auditoria as a
   where a.entidade = 'preferencia_aviso' and a.ator_membro_id = 'd0000000-0000-4000-8000-0000000000a2'),
  array['insert:false', 'update:true'],
  'cada mudança da Ana fica na auditoria, com ela como ator'
);
select ok(
  exists (select 1 from public.auditoria as a
          where a.entidade = 'preferencia_aviso' and a.ator_membro_id = 'd0000000-0000-4000-8000-0000000000a4'
            and a.acao = 'insert'),
  'a mudança em somente leitura também é auditada'
);

select * from finish();

rollback;
