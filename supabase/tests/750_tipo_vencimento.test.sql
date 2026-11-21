-- Tipos de vencimento (P4, ADR-0046): semeados para as consultorias existentes (preenchimento da
-- migration) e para as novas (trigger); Alvará exige PDF; só a Gestão cria, edita e desativa;
-- nome repetido sem acento e sem caixa; outra consultoria lê zero e não escreve; ninguém grava
-- direto pela API.
begin;

set local timezone to 'America/Sao_Paulo';

select plan(26);

select testes.criar_dados_sinteticos();

select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
          and exists (select 1 from pg_catalog.pg_trigger as t where t.tgrelid = c.oid and t.tgname = '_suporte_somente_leitura')
          and exists (select 1 from pg_catalog.pg_trigger as t where t.tgrelid = c.oid and t.tgname = '_comercial_somente_leitura')
          and exists (select 1 from pg_catalog.pg_trigger as t where t.tgrelid = c.oid and t.tgname = 'tipo_vencimento_auditar')
   from pg_catalog.pg_class as c join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'tipo_vencimento'),
  'tipo_vencimento tem RLS forçada, auditoria e as barreiras de suporte e comercial'
);

-- ---------------------------------------------------------------------------
-- Semeadura
-- ---------------------------------------------------------------------------
select results_eq(
  $$select nome, antecedencia_dias, exige_pdf, ativo from public.tipo_vencimento
    where consultoria_id = 'c0000000-0000-4000-8000-00000000000a' order by nome_normalizado$$,
  $$values ('Alvará'::text, 60, true, true), ('ART', 60, false, true), ('AVCB', 60, false, true),
           ('Certidão', 60, false, true), ('CTF IBAMA', 60, false, true), ('Outorga', 60, false, true)$$,
  'consultoria nova nasce com os seis tipos; só o Alvará exige PDF'
);

-- Consultoria criada sem a trigger (como as que já existiam antes da migration).
alter table public.consultoria disable trigger consultoria_semear_tipos_vencimento;
insert into public.consultoria (id, nome) values ('75000000-0000-4000-8000-0000000000c1', 'Consultoria Antiga');
alter table public.consultoria enable trigger consultoria_semear_tipos_vencimento;

select is(
  (select count(*) from public.tipo_vencimento where consultoria_id = '75000000-0000-4000-8000-0000000000c1'),
  0::bigint,
  'sem a trigger, a consultoria fica sem tipos'
);

select private.semear_tipos_vencimento(c.id) from public.consultoria as c;

select is(
  (select count(*) from public.tipo_vencimento where consultoria_id = '75000000-0000-4000-8000-0000000000c1'),
  6::bigint,
  'o preenchimento da migration semeia as consultorias existentes'
);

select is(
  (select count(*) from public.tipo_vencimento where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  6::bigint,
  'semear de novo não duplica'
);

insert into public.consultoria (id, nome) values ('75000000-0000-4000-8000-0000000000c2', 'Consultoria Nova');

select is(
  (select count(*) from public.tipo_vencimento where consultoria_id = '75000000-0000-4000-8000-0000000000c2'),
  6::bigint,
  'consultoria criada depois ganha os seis tipos pela trigger'
);

-- ---------------------------------------------------------------------------
-- Gestão cria e edita
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');

select set_config('testes.tipo_novo',
  public.criar_tipo_vencimento('c0000000-0000-4000-8000-00000000000a', ' Licença sanitária ', 30)::text, true);

select results_eq(
  $$select nome, antecedencia_dias, exige_pdf, ativo from public.tipo_vencimento
    where id = current_setting('testes.tipo_novo')::uuid$$,
  $$values ('Licença sanitária'::text, 30, false, true)$$,
  'Gestão cria tipo (nome aparado, exige_pdf falso por padrão)'
);

select is(
  public.criar_tipo_vencimento('c0000000-0000-4000-8000-00000000000a', 'LICENCA SANITARIA', 90, true),
  current_setting('testes.tipo_novo')::uuid,
  'criar com o mesmo nome (sem acento e sem caixa) devolve o tipo existente'
);

select results_eq(
  $$select antecedencia_dias, exige_pdf from public.tipo_vencimento
    where id = current_setting('testes.tipo_novo')::uuid$$,
  $$values (30, false)$$,
  'repetir não muda o tipo existente'
);

select throws_ok(
  $$select public.criar_tipo_vencimento('c0000000-0000-4000-8000-00000000000a', '   ')$$,
  '22023', 'nome_obrigatorio',
  'nome vazio é recusado'
);

select throws_ok(
  $$select public.criar_tipo_vencimento('c0000000-0000-4000-8000-00000000000a', repeat('x', 61))$$,
  '22023', 'texto_longo_demais',
  'nome com mais de 60 caracteres é recusado'
);

select throws_ok(
  $$select public.criar_tipo_vencimento('c0000000-0000-4000-8000-00000000000a', 'Laudo', 731)$$,
  '22023', 'antecedencia_invalida',
  'antecedência acima de 730 dias é recusada'
);

select lives_ok(
  $$select public.editar_tipo_vencimento(current_setting('testes.tipo_novo')::uuid,
      'Licença sanitária municipal', 45, true, true)$$,
  'Gestão renomeia, muda a antecedência e passa a exigir PDF'
);

select results_eq(
  $$select nome, antecedencia_dias, exige_pdf, ativo from public.tipo_vencimento
    where id = current_setting('testes.tipo_novo')::uuid$$,
  $$values ('Licença sanitária municipal'::text, 45, true, true)$$,
  'edição gravada'
);

select throws_ok(
  $$select public.editar_tipo_vencimento(current_setting('testes.tipo_novo')::uuid, 'art', 45, true, true)$$,
  'P0001', 'tipo_vencimento_existente',
  'renomear para o nome de outro tipo é recusado'
);

select throws_ok(
  $$select public.editar_tipo_vencimento(current_setting('testes.tipo_novo')::uuid, 'Licença', -1, true, true)$$,
  '22023', 'antecedencia_invalida',
  'antecedência negativa é recusada'
);

select lives_ok(
  $$select public.editar_tipo_vencimento(current_setting('testes.tipo_novo')::uuid,
      'Licença sanitária municipal', 45, true, false)$$,
  'Gestão desativa o tipo'
);

select throws_ok(
  $$select public.criar_tipo_vencimento('c0000000-0000-4000-8000-00000000000a', 'Licença Sanitária Municipal')$$,
  'P0001', 'tipo_vencimento_existente',
  'criar com o nome de um tipo desativado é recusado (reativa-se pelo editar)'
);

select ok(
  exists (select 1 from public.auditoria
          where entidade = 'tipo_vencimento' and entidade_id = current_setting('testes.tipo_novo')::uuid
            and acao = 'update' and ator_membro_id = 'd0000000-0000-4000-8000-0000000000a1'),
  'a edição do tipo fica na auditoria com o autor'
);

-- ---------------------------------------------------------------------------
-- Equipe lê, não escreve
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select is(
  (select count(*) from public.tipo_vencimento where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  7::bigint,
  'Equipe lê os tipos da consultoria (inclusive o desativado)'
);

select throws_ok(
  $$select public.criar_tipo_vencimento('c0000000-0000-4000-8000-00000000000a', 'Laudo')$$,
  '42501', 'sem_permissao',
  'Equipe não cria tipo'
);

select throws_ok(
  $$select public.editar_tipo_vencimento(current_setting('testes.tipo_novo')::uuid, 'Outro', 10, false, true)$$,
  '42501', 'sem_permissao',
  'Equipe não edita tipo'
);

select throws_ok(
  $$insert into public.tipo_vencimento (consultoria_id, nome) values ('c0000000-0000-4000-8000-00000000000a', 'Laudo')$$,
  '42501', null,
  'ninguém grava tipo direto pela API'
);

-- ---------------------------------------------------------------------------
-- Outra consultoria
-- ---------------------------------------------------------------------------
select testes.autenticar_como('gustavo@verdesul.test');

select is(
  (select count(*) from public.tipo_vencimento where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  0::bigint,
  'Gestão de B lê zero tipos de A'
);

select throws_ok(
  $$select public.editar_tipo_vencimento(current_setting('testes.tipo_novo')::uuid, 'Invadido', 10, false, true)$$,
  '42501', 'sem_permissao',
  'Gestão de B não edita tipo de A, mesmo sabendo o id'
);

select testes.autenticar_como_anonimo();

select throws_ok(
  $$select public.criar_tipo_vencimento('c0000000-0000-4000-8000-00000000000a', 'Laudo')$$,
  '42501', null,
  'anon não executa criar_tipo_vencimento'
);

select * from finish();

rollback;
