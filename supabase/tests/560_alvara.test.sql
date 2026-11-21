-- Alvará (ALV-01 e ALV-02): só a Gestão registra, com PDF e validade; repetir não duplica; renovar
-- cria um novo ligado ao anterior, que fica guardado; só o vigente entra na visão da equipe;
-- excluir é lógico; nada atravessa consultorias e ninguém escreve direto na tabela.
-- Desde o P4 (ADR-0046) o alvará entra no prazo como vencimento do tipo Alvará (espelhado pela
-- trigger): as leituras filtram tipo_linha 'vencimento' e comparam o título. Como a Visão
-- (listar_prazos) só mostra o vencimento a partir da antecedência (decisão do Eduardo, 20/11/2026)
-- e estes alvarás vencem em mais de 60 dias, a vigência é conferida na fonte (private.linhas_de_prazo).
begin;

set local timezone to 'America/Sao_Paulo';

select plan(23);

select testes.criar_dados_sinteticos();

select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
          and exists (select 1 from pg_catalog.pg_trigger as t where t.tgrelid = c.oid and t.tgname = '_suporte_somente_leitura')
          and exists (select 1 from pg_catalog.pg_trigger as t where t.tgrelid = c.oid and t.tgname = '_comercial_somente_leitura')
   from pg_catalog.pg_class as c join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'alvara'),
  'alvara tem RLS forçada e as barreiras de suporte e comercial'
);

select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_empreendimento('e5600000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a',
  'Padaria Boa Vista');
select public.criar_unidade('e5610000-0000-4000-8000-000000000001', 'e5600000-0000-4000-8000-000000000001',
  'Loja Centro');

reset role;
insert into storage.objects (bucket_id, name, metadata) values
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/alvara/a5600000-0000-4000-8000-000000000001.pdf',
   '{"mimetype": "application/pdf", "size": 2048}'),
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/alvara/a5600000-0000-4000-8000-000000000002.pdf',
   '{"mimetype": "application/pdf", "size": 4096}'),
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/alvara/a5600000-0000-4000-8000-000000000003.png',
   '{"mimetype": "image/png", "size": 1024}'),
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/alvara/a5600000-0000-4000-8000-000000000004.pdf',
   '{"mimetype": "application/pdf", "size": 1024}');

-- Alvará vigente da unidade, lido sem RLS.
create function testes.alvara_de(versao uuid)
returns public.alvara
language sql
stable
security definer
set search_path = ''
as $$
  select a.* from public.alvara as a
  join public.documento_versao as v on v.consultoria_id = a.consultoria_id and v.documento_id = a.documento_id
  where v.id = versao
$$;

-- ---------------------------------------------------------------------------
-- Equipe não registra
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select throws_ok(
  $$select public.registrar_alvara('e5610000-0000-4000-8000-000000000001', current_date + 200,
      'a5600000-0000-4000-8000-000000000001',
      'c0000000-0000-4000-8000-00000000000a/alvara/a5600000-0000-4000-8000-000000000001.pdf',
      'alvara.pdf', repeat('a', 64))$$,
  '42501', 'sem_permissao',
  'Equipe não registra alvará'
);

-- ---------------------------------------------------------------------------
-- Gestão registra
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.registrar_alvara('e5610000-0000-4000-8000-000000000001', null,
      'a5600000-0000-4000-8000-000000000001',
      'c0000000-0000-4000-8000-00000000000a/alvara/a5600000-0000-4000-8000-000000000001.pdf',
      'alvara.pdf', repeat('a', 64))$$,
  '22023', 'validade_do_alvara_obrigatoria',
  'sem validade é recusado'
);

select throws_ok(
  $$select public.registrar_alvara('e5610000-0000-4000-8000-000000000001', current_date + 200,
      'a5600000-0000-4000-8000-000000000003',
      'c0000000-0000-4000-8000-00000000000a/alvara/a5600000-0000-4000-8000-000000000003.png',
      'foto.png', repeat('a', 64))$$,
  '22023', 'caminho_invalido',
  'arquivo que não é PDF é recusado'
);

select lives_ok(
  $$select public.registrar_alvara('e5610000-0000-4000-8000-000000000001', current_date + 200,
      'a5600000-0000-4000-8000-000000000001',
      'c0000000-0000-4000-8000-00000000000a/alvara/a5600000-0000-4000-8000-000000000001.pdf',
      ' alvara-2026.pdf ', repeat('a', 64), ' 1234/2026 ', 'Prefeitura de Joinville', '  ')$$,
  'Gestão registra alvará com PDF e validade'
);

select results_eq(
  $$select (a).numero, (a).orgao, (a).notas, (a).anterior_id, (a).empreendimento_id
    from (select testes.alvara_de('a5600000-0000-4000-8000-000000000001') as a) as x$$,
  $$values ('1234/2026'::text, 'Prefeitura de Joinville'::text, null::text, null::uuid,
            'e5600000-0000-4000-8000-000000000001'::uuid)$$,
  'textos aparados, notas vazias viram nulo, empreendimento vem da unidade'
);

select is(
  public.registrar_alvara('e5610000-0000-4000-8000-000000000001', current_date + 200,
    'a5600000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-00000000000a/alvara/a5600000-0000-4000-8000-000000000001.pdf',
    'alvara-2026.pdf', repeat('a', 64), '1234/2026'),
  (testes.alvara_de('a5600000-0000-4000-8000-000000000001')).id,
  'repetir com a mesma versão devolve o mesmo alvará'
);

select is(
  (select count(*) from public.alvara where unidade_id = 'e5610000-0000-4000-8000-000000000001'),
  1::bigint,
  'repetir não duplica'
);

select throws_ok(
  $$insert into public.alvara (consultoria_id, empreendimento_id, unidade_id, validade, documento_id, criado_por)
    values ('c0000000-0000-4000-8000-00000000000a', 'e5600000-0000-4000-8000-000000000001',
            'e5610000-0000-4000-8000-000000000001', current_date,
            (testes.alvara_de('a5600000-0000-4000-8000-000000000001')).documento_id,
            'd0000000-0000-4000-8000-0000000000a1')$$,
  '42501', null,
  'ninguém grava alvará direto pela API'
);

select is(
  (select count(*) from private.linhas_de_prazo('c0000000-0000-4000-8000-00000000000a')
   where titulo = 'Alvará 1234/2026' and tipo_linha = 'vencimento' and prazo = current_date + 200),
  1::bigint,
  'o alvará entra no prazo como linha de vencimento (ADR-0046)'
);

-- ---------------------------------------------------------------------------
-- Editar
-- ---------------------------------------------------------------------------
select is(
  public.editar_alvara((testes.alvara_de('a5600000-0000-4000-8000-000000000001')).id, 1, current_date + 210,
    '1234/2026', 'Prefeitura de Joinville', 'Vistoria dos bombeiros junto'),
  2,
  'Gestão edita validade e notas'
);

select throws_ok(
  $$select public.editar_alvara((testes.alvara_de('a5600000-0000-4000-8000-000000000001')).id, 1,
      current_date + 220)$$,
  'P0001', 'conflito_de_versao',
  'editar com versão antiga é recusado'
);

-- ---------------------------------------------------------------------------
-- Renovar: novo ligado ao anterior; o anterior fica guardado
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select public.registrar_alvara('e5610000-0000-4000-8000-000000000001', current_date + 565,
      'a5600000-0000-4000-8000-000000000002',
      'c0000000-0000-4000-8000-00000000000a/alvara/a5600000-0000-4000-8000-000000000002.pdf',
      'alvara-2027.pdf', repeat('b', 64), '2200/2027', 'Prefeitura de Joinville', null,
      (testes.alvara_de('a5600000-0000-4000-8000-000000000001')).id)$$,
  'Gestão renova o alvará'
);

select results_eq(
  $$select (select count(*) from public.alvara where unidade_id = 'e5610000-0000-4000-8000-000000000001'),
           (testes.alvara_de('a5600000-0000-4000-8000-000000000002')).anterior_id,
           (testes.alvara_de('a5600000-0000-4000-8000-000000000001')).excluido_em is null$$,
  $$values (2::bigint, (testes.alvara_de('a5600000-0000-4000-8000-000000000001')).id, true)$$,
  'o novo aponta para o anterior, que continua guardado'
);

select results_eq(
  $$select titulo from private.linhas_de_prazo('c0000000-0000-4000-8000-00000000000a')
    where tipo_linha = 'vencimento'$$,
  $$values ('Alvará 2200/2027'::text)$$,
  'no prazo fica só o alvará vigente'
);

select throws_ok(
  $$select public.registrar_alvara('e5610000-0000-4000-8000-000000000001', current_date + 600,
      'a5600000-0000-4000-8000-000000000004',
      'c0000000-0000-4000-8000-00000000000a/alvara/a5600000-0000-4000-8000-000000000004.pdf',
      'outro.pdf', repeat('c', 64), null, null, null,
      (testes.alvara_de('a5600000-0000-4000-8000-000000000001')).id)$$,
  'P0001', 'alvara_ja_renovado',
  'um alvará já renovado não é renovado de novo'
);

select throws_ok(
  $$select public.excluir_alvara((testes.alvara_de('a5600000-0000-4000-8000-000000000001')).id, 2)$$,
  'P0001', 'alvara_ja_renovado',
  'não exclui o anterior de uma renovação'
);

-- ---------------------------------------------------------------------------
-- Trocar PDF e excluir
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select public.trocar_pdf_alvara((testes.alvara_de('a5600000-0000-4000-8000-000000000002')).id,
      'a5600000-0000-4000-8000-000000000004',
      'c0000000-0000-4000-8000-00000000000a/alvara/a5600000-0000-4000-8000-000000000004.pdf',
      'alvara-2027-corrigido.pdf', repeat('d', 64))$$,
  'Gestão troca o PDF por uma versão nova'
);

select is(
  (select count(*) from public.documento_versao
   where documento_id = (testes.alvara_de('a5600000-0000-4000-8000-000000000002')).documento_id),
  2::bigint,
  'a versão anterior do PDF continua guardada'
);

-- ---------------------------------------------------------------------------
-- Isolamento
-- ---------------------------------------------------------------------------
select testes.autenticar_como('gustavo@verdesul.test');

select is(
  (select count(*) from public.alvara where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  0::bigint,
  'usuário de outra consultoria vê zero alvarás de A'
);

select throws_ok(
  $$select public.excluir_alvara((testes.alvara_de('a5600000-0000-4000-8000-000000000002')).id, 2)$$,
  '42501', 'sem_permissao',
  'Gestão de outra consultoria não exclui alvará de A, mesmo sabendo o id'
);

select testes.autenticar_como('eduardo@filtroville.test');

select lives_ok(
  $$select public.excluir_alvara((testes.alvara_de('a5600000-0000-4000-8000-000000000002')).id, 2)$$,
  'Gestão exclui o alvará novo (lógico)'
);

select results_eq(
  $$select titulo from private.linhas_de_prazo('c0000000-0000-4000-8000-00000000000a')
    where tipo_linha = 'vencimento'$$,
  $$values ('Alvará 1234/2026'::text)$$,
  'excluído o novo, o anterior volta a ser o vigente'
);

select * from finish();
rollback;
