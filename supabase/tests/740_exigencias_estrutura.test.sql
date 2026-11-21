-- Exigências do órgão (P3, ADR-0045): estrutura. RLS forçada, só leitura para authenticated,
-- nada para anon, triggers (auditoria, suporte, comercial, prazo original, licença da unidade,
-- travas e só acréscimo), FKs compostas e as RPCs com a segurança certa.
begin;

select plan(30);

-- ---------------------------------------------------------------------------
-- RLS, políticas e grants
-- ---------------------------------------------------------------------------
select ok(
  (select bool_and(c.relrowsecurity and c.relforcerowsecurity)
   from pg_catalog.pg_class as c join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('exigencia', 'exigencia_resposta')),
  'exigencia e exigencia_resposta têm RLS habilitada e forçada'
);

select policies_are('public', 'exigencia', array['exigencia_select_membro_ativo'],
  'exigencia tem só a política de leitura do membro ativo');
select policies_are('public', 'exigencia_resposta', array['exigencia_resposta_select_membro_ativo'],
  'exigencia_resposta tem só a política de leitura do membro ativo');

select is(
  (select array_agg(p.polcmd::text || ':' || array_to_string(array(
            select r.rolname::text from pg_catalog.pg_roles as r where r.oid = any (p.polroles)), ',')
          order by c.relname)
   from pg_catalog.pg_policy as p join pg_catalog.pg_class as c on c.oid = p.polrelid
   where c.relname in ('exigencia', 'exigencia_resposta')),
  array['r:authenticated', 'r:authenticated'],
  'as duas políticas são só de select, para authenticated'
);

select table_privs_are('public', 'exigencia', 'authenticated', array['SELECT'],
  'authenticated só lê exigencia');
select table_privs_are('public', 'exigencia_resposta', 'authenticated', array['SELECT'],
  'authenticated só lê exigencia_resposta');
select table_privs_are('public', 'exigencia', 'anon', array[]::text[], 'anon não tem nada em exigencia');
select table_privs_are('public', 'exigencia_resposta', 'anon', array[]::text[],
  'anon não tem nada em exigencia_resposta');

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
select triggers_are('public', 'exigencia', array[
  '_comercial_somente_leitura', '_suporte_somente_leitura', 'exigencia_auditar',
  'exigencia_licenca_da_unidade', 'exigencia_prazo_original_imutavel', 'exigencia_travas'],
  'exigencia tem auditoria, barreiras, prazo original, licença da unidade e travas');
select triggers_are('public', 'exigencia_resposta', array[
  '_comercial_somente_leitura', '_suporte_somente_leitura', 'exigencia_resposta_auditar',
  'exigencia_resposta_bloquear_truncate', 'exigencia_resposta_bloquear_update_delete'],
  'exigencia_resposta tem auditoria, barreiras e o bloqueio de alteração');

select trigger_is('public', 'exigencia', 'exigencia_auditar', 'private', 'auditar',
  'exigencia é auditada');
select trigger_is('public', 'exigencia_resposta', 'exigencia_resposta_auditar', 'private', 'auditar',
  'exigencia_resposta é auditada');
select trigger_is('public', 'exigencia', 'exigencia_prazo_original_imutavel', 'private',
  'preservar_prazo_original', 'prazo_oficial_original travado pela mesma trigger da ocorrência');
select trigger_is('public', 'exigencia_resposta', 'exigencia_resposta_bloquear_update_delete', 'private',
  'bloquear_alteracao_exigencia_resposta', 'update e delete barrados na exigencia_resposta');

select ok(
  (select (t.tgtype & 1) = 0 and (t.tgtype & 2) = 2 and (t.tgtype & 32) = 32
   from pg_catalog.pg_trigger as t
   where t.tgrelid = 'public.exigencia_resposta'::regclass and t.tgname = 'exigencia_resposta_bloquear_truncate'),
  'truncate barrado na exigencia_resposta (before, por comando)'
);

-- ---------------------------------------------------------------------------
-- FKs compostas
-- ---------------------------------------------------------------------------
select fk_ok('public', 'exigencia', array['consultoria_id', 'empreendimento_id', 'unidade_id'],
  'public', 'unidade', array['consultoria_id', 'empreendimento_id', 'id'],
  'exigencia → unidade pela FK tripla');
select fk_ok('public', 'exigencia', array['consultoria_id', 'instrumento_id'],
  'public', 'instrumento', array['consultoria_id', 'id'], 'exigencia → licença pela FK composta');
select fk_ok('public', 'exigencia', array['consultoria_id', 'responsavel_id'],
  'public', 'membro', array['consultoria_id', 'id'], 'exigencia → responsável pela FK composta');
select fk_ok('public', 'exigencia', array['consultoria_id', 'documento_id'],
  'public', 'documento', array['consultoria_id', 'id'], 'exigencia → PDF do ofício pela FK composta');
select fk_ok('public', 'exigencia_resposta', array['consultoria_id', 'exigencia_id'],
  'public', 'exigencia', array['consultoria_id', 'id'], 'exigencia_resposta → exigencia pela FK composta');
select fk_ok('public', 'exigencia_resposta', array['consultoria_id', 'registrado_por'],
  'public', 'membro', array['consultoria_id', 'id'], 'exigencia_resposta → autor pela FK composta');

select has_column('public', 'instrumento', 'numero_processo', 'licença ganha numero_processo');

-- ---------------------------------------------------------------------------
-- RPCs: escrita security definer, leitura invoker; anon não executa nada
-- ---------------------------------------------------------------------------
select ok(
  (select bool_and(p.prosecdef)
   from pg_catalog.pg_proc as p join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('registrar_exigencia', 'editar_exigencia', 'responder_exigencia', 'anexar_a_exigencia',
                       'prorrogar_exigencia', 'atribuir_exigencia', 'excluir_exigencia',
                       'definir_processo_da_licenca')),
  'as RPCs de escrita são security definer'
);

select ok(
  (select bool_and(not p.prosecdef and p.provolatile = 's')
   from pg_catalog.pg_proc as p join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('listar_exigencias', 'listar_respostas_da_exigencia')),
  'as RPCs de leitura são security invoker e stable'
);

select is(
  (select count(*)::integer
   from pg_catalog.pg_proc as p join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('registrar_exigencia', 'editar_exigencia', 'responder_exigencia', 'anexar_a_exigencia',
                       'prorrogar_exigencia', 'atribuir_exigencia', 'excluir_exigencia',
                       'definir_processo_da_licenca', 'listar_exigencias', 'listar_respostas_da_exigencia')
     and has_function_privilege('authenticated', p.oid, 'execute')
     and not has_function_privilege('anon', p.oid, 'execute')),
  10,
  'as 10 RPCs: authenticated executa, anon não'
);

select ok(
  not exists (
    select 1 from pg_catalog.pg_proc as p join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in ('prazo_da_exigencia', 'conferir_textos_da_exigencia', 'pdf_da_exigencia_informado',
                        'registrar_pdf_da_exigencia', 'exigencia_para_gestao', 'exigencia_para_responder',
                        'conferir_licenca_da_exigencia', 'travar_exigencia',
                        'bloquear_alteracao_exigencia_resposta')
      and (has_function_privilege('authenticated', p.oid, 'execute')
           or has_function_privilege('anon', p.oid, 'execute'))),
  'os helpers novos de private não são executáveis por authenticated nem anon'
);

-- ---------------------------------------------------------------------------
-- Ninguém escreve direto; anon não lê
-- ---------------------------------------------------------------------------
select testes.criar_dados_sinteticos();

select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$insert into public.exigencia (consultoria_id, empreendimento_id, unidade_id, assunto, recebido_em,
      prazo_oficial_original, prazo_oficial, prazo_oficial_texto, meta_interna, criado_por)
    values ('c0000000-0000-4000-8000-00000000000a', gen_random_uuid(), gen_random_uuid(), 'x', current_date,
            current_date + 5, current_date + 5, '5 dias', current_date, 'd0000000-0000-4000-8000-0000000000a1')$$,
  '42501', null,
  'nem a Gestão insere direto em exigencia'
);

select throws_ok(
  $$delete from public.exigencia_resposta$$,
  '42501', null,
  'nem a Gestão apaga direto em exigencia_resposta'
);

select testes.autenticar_como_anonimo();

select throws_ok(
  $$select * from public.listar_exigencias('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', null,
  'anon não chama listar_exigencias'
);

select throws_ok(
  $$select count(*) from public.exigencia$$,
  '42501', null,
  'anon não lê exigencia'
);

select * from finish();

rollback;
