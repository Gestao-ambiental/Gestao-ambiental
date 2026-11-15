-- Resíduos, fase 1 (MTR e CDF sem integração): registrar MTR com itens e CDF ligado; conferência
-- (MTR sem CDF e quantidade diferente); Equipe registra e Gestão liga obrigação; prazos calculados;
-- outra consultoria lê zero e não registra; regra do 020 nas tabelas novas.
begin;

-- current_date no fuso da consultoria (America/Sao_Paulo): as RPCs comparam com o dia de lá,
-- e em UTC o dia vira às 21h, o que fazia o teste falhar à noite.
set local timezone to 'America/Sao_Paulo';

select plan(25);

select testes.criar_dados_sinteticos();

-- ---------------------------------------------------------------------------
-- Regra do 020 nas tabelas novas: RLS forçada, política e as duas barreiras de escrita.
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from pg_catalog.pg_class as c
   join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('mtr', 'mtr_item', 'cdf', 'cdf_mtr', 'obrigacao_residuo')
     and c.relrowsecurity and c.relforcerowsecurity
     and exists (select 1 from pg_catalog.pg_policy as p where p.polrelid = c.oid)
     and exists (select 1 from pg_catalog.pg_trigger as t where t.tgrelid = c.oid and t.tgname = '_suporte_somente_leitura')
     and exists (select 1 from pg_catalog.pg_trigger as t where t.tgrelid = c.oid and t.tgname = '_comercial_somente_leitura')),
  5::bigint,
  'as 5 tabelas de resíduos têm RLS forçada, política e as barreiras de suporte e comercial'
);

-- ---------------------------------------------------------------------------
-- Equipe (Ana) registra MTRs com itens
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select public.criar_empreendimento('e4700000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a',
  'Metalúrgica Rio Cubatão');

select is(
  public.registrar_mtr('f4700000-0000-4000-8000-000000000001', 'e4700000-0000-4000-8000-000000000001',
    ' 2610001 ', current_date - 40, 'recebido', 'Transportes Itapocu', null, 'Aterro Norte', '12.345.678/0001-90',
    '[{"id": "f4710000-0000-4000-8000-000000000001", "residuo_codigo": "200301",
       "residuo_descricao": "Resíduos urbanos misturados", "classe": "II A", "quantidade": 1.5, "unidade": "t"},
      {"id": "f4710000-0000-4000-8000-000000000002", "residuo_codigo": "130205",
       "residuo_descricao": "Óleo lubrificante usado", "classe": "I", "quantidade": "200", "unidade": "kg"}]'::jsonb),
  'f4700000-0000-4000-8000-000000000001'::uuid,
  'Equipe registra MTR com dois itens'
);

select is(
  public.registrar_mtr('f4700000-0000-4000-8000-000000000001', 'e4700000-0000-4000-8000-000000000001',
    '2610001', current_date - 40, 'recebido', 'Transportes Itapocu', null, 'Aterro Norte', null,
    '[{"residuo_codigo": "x", "residuo_descricao": "x", "quantidade": 1, "unidade": "t"}]'::jsonb),
  'f4700000-0000-4000-8000-000000000001'::uuid,
  'repetir o registro devolve o mesmo MTR'
);

select results_eq(
  $$select m.numero, m.destinador_cnpj, (select count(*) from public.mtr_item as i where i.mtr_id = m.id)
    from public.mtr as m where m.id = 'f4700000-0000-4000-8000-000000000001'$$,
  $$values ('2610001', '12345678000190', 2::bigint)$$,
  'grava número aparado, CNPJ normalizado e não duplica itens ao repetir'
);

select lives_ok(
  $$select public.registrar_mtr('f4700000-0000-4000-8000-000000000002', 'e4700000-0000-4000-8000-000000000001',
      '2610002', current_date - 40, 'salvo', 'Transportes Itapocu', null, 'Aterro Norte', null,
      '[{"residuo_codigo": "200301", "residuo_descricao": "Resíduos urbanos misturados", "quantidade": 3, "unidade": "t"}]')$$,
  'MTR salvo há 40 dias, sem CDF'
);

select lives_ok(
  $$select public.registrar_mtr('f4700000-0000-4000-8000-000000000003', 'e4700000-0000-4000-8000-000000000001',
      '2610003', current_date - 5, 'recebido', 'Transportes Itapocu', null, 'Aterro Norte', null,
      '[{"residuo_codigo": "200301", "residuo_descricao": "Resíduos urbanos misturados", "quantidade": 500, "unidade": "kg"}]')$$,
  'MTR recente, sem CDF'
);

select throws_ok(
  $$select public.registrar_mtr(gen_random_uuid(), 'e4700000-0000-4000-8000-000000000001',
      '2610002', current_date, 'salvo', 'T', null, 'D', null,
      '[{"residuo_codigo": "1", "residuo_descricao": "x", "quantidade": 1, "unidade": "t"}]')$$,
  'P0001', 'numero_existente',
  'número de MTR repetido na consultoria é recusado'
);

select throws_ok(
  $$select public.registrar_mtr(gen_random_uuid(), 'e4700000-0000-4000-8000-000000000001',
      '2610009', current_date, 'salvo', 'T', null, 'D', null,
      '[{"residuo_codigo": "1", "residuo_descricao": "x", "quantidade": 0, "unidade": "t"}]')$$,
  '22023', 'quantidade_invalida',
  'quantidade zero é recusada'
);

-- ---------------------------------------------------------------------------
-- CDF ligado ao MTR 2610001, com quantidade diferente no primeiro item
-- ---------------------------------------------------------------------------
select is(
  public.registrar_cdf('f4720000-0000-4000-8000-000000000001', 'e4700000-0000-4000-8000-000000000001',
    'CDF-77', current_date - 10, 'Aterro Norte', null, current_date - 45, current_date - 30,
    '[{"mtr_id": "f4700000-0000-4000-8000-000000000001", "itens": [
        {"mtr_item_id": "f4710000-0000-4000-8000-000000000001", "quantidade": 1499.9, "unidade": "kg"},
        {"mtr_item_id": "f4710000-0000-4000-8000-000000000002", "quantidade": 0.2, "unidade": "t"}]}]'::jsonb),
  'f4720000-0000-4000-8000-000000000001'::uuid,
  'Equipe registra CDF ligado ao MTR'
);

select is(
  (select count(*) from public.cdf_mtr where cdf_id = 'f4720000-0000-4000-8000-000000000001'),
  2::bigint,
  'o CDF cobre os dois itens do MTR'
);

select results_eq(
  $$select numero, tem_cdf, jsonb_array_length(itens), total::integer
    from public.listar_mtrs('c0000000-0000-4000-8000-00000000000a', 'e4700000-0000-4000-8000-000000000001')
    order by numero$$,
  $$values ('2610001', true, 2, 3), ('2610002', false, 1, 3), ('2610003', false, 1, 3)$$,
  'lista de MTRs traz itens e se tem CDF'
);

select results_eq(
  $$select tipo, numero, residuo_codigo, quantidade_mtr, quantidade_cdf, diferenca
    from public.conferencia_residuos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values ('quantidade_diferente'::text, '2610001'::text, '200301'::text, 1.5::numeric, 1.4999::numeric, -0.0001::numeric),
           ('mtr_sem_cdf', '2610002', null, null, null, null)$$,
  'conferência acusa a quantidade diferente (kg convertido em t) e o MTR sem CDF há mais de 30 dias'
);

select results_eq(
  $$select mes, residuo_codigo, unidade, quantidade, mtrs::integer
    from public.painel_residuos('c0000000-0000-4000-8000-00000000000a') order by residuo_codigo, mes$$,
  $$select * from (values
      (date_trunc('month', current_date - 40)::date, '130205'::text, 't'::text, 0.2::numeric, 1),
      (date_trunc('month', current_date - 40)::date, '200301', 't', 4.5::numeric, 2),
      (date_trunc('month', current_date - 5)::date, '200301', 't', 0.5::numeric, 1)) as v
    order by 2, 1$$,
  'painel soma por mês, resíduo e destinador, com kg em t'
);

select throws_ok(
  $$select public.excluir_mtr('f4700000-0000-4000-8000-000000000001', 1)$$,
  'P0001', 'mtr_com_cdf',
  'MTR coberto por CDF não é excluído'
);

select throws_ok(
  $$select public.editar_mtr('f4700000-0000-4000-8000-000000000002', 9, '2610002', current_date - 40, 'salvo',
      'T', null, 'D', null, '[{"residuo_codigo": "1", "residuo_descricao": "x", "quantidade": 1, "unidade": "t"}]')$$,
  'P0001', 'conflito_de_versao',
  'editar com versão antiga é recusado'
);

-- PDF do MTR (o arquivo já está no Storage)
reset role;
insert into storage.objects (bucket_id, name, metadata) values
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/mtr/f4730000-0000-4000-8000-000000000001.pdf',
   '{"mimetype": "application/pdf", "size": 2048}');
select testes.autenticar_como('ana@filtroville.test');

select is(
  public.anexar_pdf_residuo('mtr', 'f4700000-0000-4000-8000-000000000001', 'f4730000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-00000000000a/mtr/f4730000-0000-4000-8000-000000000001.pdf', 'MTR 2610001.pdf',
    repeat('a', 64)),
  'f4730000-0000-4000-8000-000000000001'::uuid,
  'anexa o PDF ao MTR'
);

select is(
  (select pdf_nome from public.listar_mtrs('c0000000-0000-4000-8000-00000000000a') where numero = '2610001'),
  'MTR 2610001.pdf',
  'a lista mostra o PDF vigente'
);

-- ---------------------------------------------------------------------------
-- Obrigações: Equipe não liga; Gestão liga; prazos calculados
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.definir_obrigacao_residuo('e4700000-0000-4000-8000-000000000001', 'dmr_trimestral', true)$$,
  '42501', 'sem_permissao',
  'Equipe não liga obrigação'
);

select testes.autenticar_como('eduardo@filtroville.test');

select lives_ok(
  $$select public.definir_obrigacao_residuo('e4700000-0000-4000-8000-000000000001', 'dmr_trimestral', true)$$,
  'Gestão liga a DMR trimestral'
);

select results_eq(
  $$select tipo, ativa from public.obrigacoes_residuo('e4700000-0000-4000-8000-000000000001')$$,
  $$values ('dmr_trimestral'::text, true), ('dmrsu_mensal', false), ('inventario_nacional', false), ('rapp_ibama', false)$$,
  'as 4 obrigações do empreendimento, com a DMR ligada'
);

select results_eq(
  $$select tipo, referencia, prazo
    from public.prazos_obrigacoes_residuo('c0000000-0000-4000-8000-00000000000a', '2026-11-14', '2027-05-01')$$,
  $$values ('dmr_trimestral'::text, '4º trimestre de 2026'::text, '2027-01-31'::date),
           ('dmr_trimestral', '1º trimestre de 2027', '2027-04-30')$$,
  'prazos da obrigação ligada para o calendário'
);

reset role;
select results_eq(
  $$select referencia, inicio, prazo from private.prazos_da_obrigacao_residuo('dmr_trimestral', '2026-01-01', '2027-08-01')$$,
  $$values ('1º semestre de 2026'::text, '2026-07-01'::date, '2026-09-30'::date),
           ('3º trimestre de 2026', '2026-10-01', '2026-10-31'),
           ('4º trimestre de 2026', '2027-01-01', '2027-01-31'),
           ('1º trimestre de 2027', '2027-04-01', '2027-04-30'),
           ('2º trimestre de 2027', '2027-07-01', '2027-07-31')$$,
  'DMR: mesmos casos do domínio, com a transição do 1º semestre de 2026'
);

-- ---------------------------------------------------------------------------
-- Outra consultoria (Verde Sul) lê zero e não registra
-- ---------------------------------------------------------------------------
select testes.autenticar_como('gustavo@verdesul.test');

select results_eq(
  $$select (select count(*) from public.mtr) + (select count(*) from public.mtr_item) + (select count(*) from public.cdf)
         + (select count(*) from public.cdf_mtr) + (select count(*) from public.obrigacao_residuo)
         + (select count(*) from public.listar_mtrs('c0000000-0000-4000-8000-00000000000a'))
         + (select count(*) from public.conferencia_residuos('c0000000-0000-4000-8000-00000000000a'))
         + (select count(*) from public.prazos_obrigacoes_residuo('c0000000-0000-4000-8000-00000000000a'))$$,
  $$values (0::bigint)$$,
  'outra consultoria lê zero linhas das tabelas e das listas'
);

select throws_ok(
  $$select public.registrar_mtr(gen_random_uuid(), 'e4700000-0000-4000-8000-000000000001',
      '999', current_date, 'salvo', 'T', null, 'D', null,
      '[{"residuo_codigo": "1", "residuo_descricao": "x", "quantidade": 1, "unidade": "t"}]')$$,
  '42501', 'sem_permissao',
  'outra consultoria não registra MTR no empreendimento alheio'
);

select throws_ok(
  $$select public.registrar_cdf(gen_random_uuid(), 'e4700000-0000-4000-8000-000000000001',
      '999', current_date, 'D', null, current_date, current_date, '[]')$$,
  '42501', 'sem_permissao',
  'outra consultoria não registra CDF no empreendimento alheio'
);

select * from finish();

rollback;
