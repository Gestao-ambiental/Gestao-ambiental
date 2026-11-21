-- Vencimentos (P4, ADR-0046): só a Gestão cadastra, renova, edita, troca o PDF e exclui; cadastro e
-- renovação idempotentes por p_id; Alvará exige PDF; unidade, licença e responsável técnico
-- conferidos; renovar encadeia (um sucessor vivo) e o anterior deixa de gerar prazo; excluir o
-- novo devolve o anterior a vigente; controle de versão; auditoria; outra consultoria lê zero e não
-- escreve; ninguém grava direto pela API.
begin;

set local timezone to 'America/Sao_Paulo';

select plan(60);

select testes.criar_dados_sinteticos();

-- ---------------------------------------------------------------------------
-- Cenário (como dono das tabelas)
-- A: E1 com U1 e a licença I1; E2 com U2 e a licença I2. Fernanda desligada. B: EB.
-- ---------------------------------------------------------------------------
update public.membro set situacao = 'desligado', desligado_em = now()
where id = 'd0000000-0000-4000-8000-0000000000a6';

insert into public.empreendimento (id, consultoria_id, nome, criado_por) values
  ('75100000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a', 'Fundição Itaum',
   'd0000000-0000-4000-8000-0000000000a1'),
  ('75100000-0000-4000-8000-0000000000e2', 'c0000000-0000-4000-8000-00000000000a', 'Posto Boehmerwald',
   'd0000000-0000-4000-8000-0000000000a1'),
  ('75100000-0000-4000-8000-0000000000eb', 'c0000000-0000-4000-8000-00000000000b', 'Cerâmica Sulina',
   'd0000000-0000-4000-8000-0000000000b1');

insert into public.unidade (id, consultoria_id, empreendimento_id, nome) values
  ('75100000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
   '75100000-0000-4000-8000-0000000000e1', 'Matriz'),
  ('75100000-0000-4000-8000-0000000000f2', 'c0000000-0000-4000-8000-00000000000a',
   '75100000-0000-4000-8000-0000000000e2', 'Pista');

insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, tipo_id, numero, criado_por)
select x.id, 'c0000000-0000-4000-8000-00000000000a', x.eid, x.uid,
       (select t.id from public.tipo_instrumento as t
        where t.consultoria_id = 'c0000000-0000-4000-8000-00000000000a' and t.sigla = 'LAO'),
       x.numero, 'd0000000-0000-4000-8000-0000000000a1'
from (values
  ('75100000-0000-4000-8000-000000000011'::uuid, '75100000-0000-4000-8000-0000000000e1'::uuid,
   '75100000-0000-4000-8000-0000000000f1'::uuid, '1/2025'),
  ('75100000-0000-4000-8000-000000000012', '75100000-0000-4000-8000-0000000000e2',
   '75100000-0000-4000-8000-0000000000f2', '2/2025')
) as x (id, eid, uid, numero);

insert into storage.objects (bucket_id, name, metadata)
select 'arquivos', 'c0000000-0000-4000-8000-00000000000a/vencimento/75100000-0000-4000-8000-0000000004'
       || lpad(n::text, 2, '0') || '.pdf', jsonb_build_object('mimetype', 'application/pdf', 'size', 2048)
from generate_series(1, 6) as n;

select set_config('testes.alvara', (select id from public.tipo_vencimento
  where consultoria_id = 'c0000000-0000-4000-8000-00000000000a' and nome = 'Alvará')::text, true);
select set_config('testes.art', (select id from public.tipo_vencimento
  where consultoria_id = 'c0000000-0000-4000-8000-00000000000a' and nome = 'ART')::text, true);
select set_config('testes.certidao', (select id from public.tipo_vencimento
  where consultoria_id = 'c0000000-0000-4000-8000-00000000000a' and nome = 'Certidão')::text, true);
select set_config('testes.art_b', (select id from public.tipo_vencimento
  where consultoria_id = 'c0000000-0000-4000-8000-00000000000b' and nome = 'ART')::text, true);

-- Leitura sem RLS para conferir o que ficou gravado.
create function testes.vencimento_751(p_id uuid)
returns public.vencimento
language sql
stable
security definer
set search_path = ''
as $$
  select v.* from public.vencimento as v where v.id = p_id
$$;

select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
          and exists (select 1 from pg_catalog.pg_trigger as t where t.tgrelid = c.oid and t.tgname = '_suporte_somente_leitura')
          and exists (select 1 from pg_catalog.pg_trigger as t where t.tgrelid = c.oid and t.tgname = '_comercial_somente_leitura')
          and exists (select 1 from pg_catalog.pg_trigger as t where t.tgrelid = c.oid and t.tgname = 'vencimento_auditar')
   from pg_catalog.pg_class as c join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'vencimento'),
  'vencimento tem RLS forçada, auditoria e as barreiras de suporte e comercial'
);

-- ---------------------------------------------------------------------------
-- Equipe não cadastra
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select throws_ok(
  $$select public.cadastrar_vencimento('75100000-0000-4000-8000-0000000001ff', '75100000-0000-4000-8000-0000000000e1',
      current_setting('testes.art')::uuid, current_date + 30)$$,
  '42501', 'sem_permissao',
  'Equipe não cadastra vencimento'
);

-- ---------------------------------------------------------------------------
-- Gestão cadastra: validações
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.cadastrar_vencimento('75100000-0000-4000-8000-0000000001ff', '75100000-0000-4000-8000-0000000000e1',
      current_setting('testes.alvara')::uuid, current_date + 30)$$,
  '22023', 'pdf_obrigatorio',
  'Alvará sem PDF é recusado'
);

select throws_ok(
  $$select public.cadastrar_vencimento('75100000-0000-4000-8000-0000000001ff', '75100000-0000-4000-8000-0000000000e1',
      current_setting('testes.art')::uuid, current_date + 30,
      p_versao_id => '75100000-0000-4000-8000-000000000401')$$,
  '22023', 'caminho_invalido',
  'dados do PDF pela metade são recusados'
);

select throws_ok(
  $$select public.cadastrar_vencimento('75100000-0000-4000-8000-0000000001ff', '75100000-0000-4000-8000-0000000000e1',
      current_setting('testes.art_b')::uuid, current_date + 30)$$,
  '22023', 'tipo_vencimento_invalido',
  'tipo de outra consultoria é recusado'
);

select throws_ok(
  $$select public.cadastrar_vencimento('75100000-0000-4000-8000-0000000001ff', '75100000-0000-4000-8000-0000000000e1',
      current_setting('testes.art')::uuid, current_date + 30, p_unidade_id => '75100000-0000-4000-8000-0000000000f2')$$,
  '22023', 'unidade_invalida',
  'unidade de outro empreendimento é recusada'
);

select throws_ok(
  $$select public.cadastrar_vencimento('75100000-0000-4000-8000-0000000001ff', '75100000-0000-4000-8000-0000000000e1',
      current_setting('testes.art')::uuid, current_date + 30,
      p_instrumento_id => '75100000-0000-4000-8000-000000000012')$$,
  '22023', 'instrumento_invalido',
  'licença de outro empreendimento é recusada'
);

select throws_ok(
  $$select public.cadastrar_vencimento('75100000-0000-4000-8000-0000000001ff', '75100000-0000-4000-8000-0000000000e1',
      current_setting('testes.art')::uuid, current_date + 30,
      p_responsavel_tecnico_id => 'd0000000-0000-4000-8000-0000000000a6')$$,
  '22023', 'responsavel_tecnico_invalido',
  'responsável técnico desligado é recusado'
);

select throws_ok(
  $$select public.cadastrar_vencimento('75100000-0000-4000-8000-0000000001ff', '75100000-0000-4000-8000-0000000000e1',
      current_setting('testes.art')::uuid, current_date + 30, p_emitido_em => current_date + 31)$$,
  '22023', 'datas_incoerentes',
  'emissão depois da validade é recusada'
);

select throws_ok(
  $$select public.cadastrar_vencimento('75100000-0000-4000-8000-0000000001ff', '75100000-0000-4000-8000-0000000000e1',
      current_setting('testes.art')::uuid, null)$$,
  '22023', 'validade_obrigatoria',
  'sem validade é recusado'
);

select throws_ok(
  $$select public.cadastrar_vencimento('75100000-0000-4000-8000-0000000001ff', '75100000-0000-4000-8000-0000000000e1',
      current_setting('testes.art')::uuid, current_date + 30, p_antecedencia_dias => 800)$$,
  '22023', 'antecedencia_invalida',
  'antecedência acima de 730 dias é recusada'
);

-- ---------------------------------------------------------------------------
-- Gestão cadastra
-- ---------------------------------------------------------------------------
select is(
  public.cadastrar_vencimento('75100000-0000-4000-8000-000000000101', '75100000-0000-4000-8000-0000000000e1',
    current_setting('testes.alvara')::uuid, current_date + 30,
    p_unidade_id => '75100000-0000-4000-8000-0000000000f1',
    p_instrumento_id => '75100000-0000-4000-8000-000000000011',
    p_numero => ' 100/2026 ', p_orgao => 'Prefeitura de Joinville', p_notas => '  ',
    p_emitido_em => current_date - 300, p_emitido_texto => ' 10 de janeiro ', p_validade_texto => 'um ano',
    p_versao_id => '75100000-0000-4000-8000-000000000401',
    p_caminho => 'c0000000-0000-4000-8000-00000000000a/vencimento/75100000-0000-4000-8000-000000000401.pdf',
    p_nome_original => ' alvara.pdf ', p_sha256 => repeat('a', 64)),
  '75100000-0000-4000-8000-000000000101'::uuid,
  'Gestão cadastra o alvará com PDF'
);

select results_eq(
  $$select (v).numero, (v).orgao, (v).notas, (v).emitido_texto, (v).validade_texto, (v).antecedencia_dias,
           (v).unidade_id, (v).instrumento_id, (v).anterior_id, (v).criado_por, (v).row_version
    from (select testes.vencimento_751('75100000-0000-4000-8000-000000000101') as v) as x$$,
  $$values ('100/2026'::text, 'Prefeitura de Joinville'::text, null::text, '10 de janeiro'::text, 'um ano'::text, 60,
            '75100000-0000-4000-8000-0000000000f1'::uuid, '75100000-0000-4000-8000-000000000011'::uuid, null::uuid,
            'd0000000-0000-4000-8000-0000000000a1'::uuid, 1)$$,
  'textos aparados, vazio vira nulo, antecedência do tipo, autor = membro'
);

select results_eq(
  $$select d.entidade, dv.numero, dv.mime, dv.tamanho_bytes, dv.nome_original, d.versao_vigente_id = dv.id
    from public.documento as d
    join public.documento_versao as dv on dv.documento_id = d.id
    where d.id = (testes.vencimento_751('75100000-0000-4000-8000-000000000101')).documento_id$$,
  $$values ('vencimento'::text, 1, 'application/pdf'::text, 2048::bigint, 'alvara.pdf'::text, true)$$,
  'o PDF vira documento de entidade vencimento, versão 1 vigente'
);

select is(
  public.cadastrar_vencimento('75100000-0000-4000-8000-000000000101', '75100000-0000-4000-8000-0000000000e1',
    current_setting('testes.alvara')::uuid, current_date + 99,
    p_versao_id => '75100000-0000-4000-8000-000000000401',
    p_caminho => 'c0000000-0000-4000-8000-00000000000a/vencimento/75100000-0000-4000-8000-000000000401.pdf',
    p_nome_original => 'alvara.pdf', p_sha256 => repeat('a', 64)),
  '75100000-0000-4000-8000-000000000101'::uuid,
  'repetir com o mesmo p_id devolve o mesmo vencimento'
);

select results_eq(
  $$select (select count(*) from public.vencimento where empreendimento_id = '75100000-0000-4000-8000-0000000000e1'),
           (select count(*) from public.documento_versao where id = '75100000-0000-4000-8000-000000000401'),
           (testes.vencimento_751('75100000-0000-4000-8000-000000000101')).valido_ate - current_date$$,
  $$values (1::bigint, 1::bigint, 30)$$,
  'repetir não duplica nem muda nada'
);

select lives_ok(
  $$select public.cadastrar_vencimento('75100000-0000-4000-8000-000000000102', '75100000-0000-4000-8000-0000000000e1',
      current_setting('testes.art')::uuid, current_date + 200, p_numero => 'ART 55', p_antecedencia_dias => 30,
      p_responsavel_tecnico_id => 'd0000000-0000-4000-8000-0000000000a2')$$,
  'Gestão cadastra a ART sem PDF, sem unidade, com responsável técnico e antecedência própria'
);

select throws_ok(
  $$insert into public.vencimento (consultoria_id, empreendimento_id, tipo_vencimento_id, valido_ate,
                                   antecedencia_dias, criado_por)
    values ('c0000000-0000-4000-8000-00000000000a', '75100000-0000-4000-8000-0000000000e1',
            current_setting('testes.art')::uuid, current_date, 60, 'd0000000-0000-4000-8000-0000000000a1')$$,
  '42501', null,
  'ninguém grava vencimento direto pela API'
);

select public.editar_tipo_vencimento(current_setting('testes.art')::uuid, 'ART', 90, false, true);

select is(
  (testes.vencimento_751('75100000-0000-4000-8000-000000000102')).antecedencia_dias,
  30,
  'mudar a antecedência do tipo não muda a dos vencimentos já cadastrados'
);

-- ---------------------------------------------------------------------------
-- Renovar
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.renovar_vencimento('75100000-0000-4000-8000-000000000103', '75100000-0000-4000-8000-000000000101',
      1, current_date + 400)$$,
  '22023', 'pdf_obrigatorio',
  'renovar Alvará sem PDF é recusado'
);

select throws_ok(
  $$select public.renovar_vencimento('75100000-0000-4000-8000-000000000103', '75100000-0000-4000-8000-000000000101',
      2, current_date + 400, p_versao_id => '75100000-0000-4000-8000-000000000402',
      p_caminho => 'c0000000-0000-4000-8000-00000000000a/vencimento/75100000-0000-4000-8000-000000000402.pdf',
      p_nome_original => 'alvara-2027.pdf', p_sha256 => repeat('b', 64))$$,
  'P0001', 'conflito_de_versao',
  'renovar com versão antiga do anterior é recusado'
);

select is(
  public.renovar_vencimento('75100000-0000-4000-8000-000000000103', '75100000-0000-4000-8000-000000000101',
    1, current_date + 400, p_numero => '200/2027', p_versao_id => '75100000-0000-4000-8000-000000000402',
    p_caminho => 'c0000000-0000-4000-8000-00000000000a/vencimento/75100000-0000-4000-8000-000000000402.pdf',
    p_nome_original => 'alvara-2027.pdf', p_sha256 => repeat('b', 64)),
  '75100000-0000-4000-8000-000000000103'::uuid,
  'Gestão renova o alvará'
);

select results_eq(
  $$select (n).empreendimento_id, (n).unidade_id, (n).tipo_vencimento_id, (n).antecedencia_dias, (n).anterior_id,
           (n).instrumento_id, (a).row_version, (a).excluido_em is null
    from (select testes.vencimento_751('75100000-0000-4000-8000-000000000103') as n,
                 testes.vencimento_751('75100000-0000-4000-8000-000000000101') as a) as x$$,
  $$values ('75100000-0000-4000-8000-0000000000e1'::uuid, '75100000-0000-4000-8000-0000000000f1'::uuid,
            current_setting('testes.alvara')::uuid, 60, '75100000-0000-4000-8000-000000000101'::uuid, null::uuid,
            1, true)$$,
  'o novo herda empreendimento, unidade, tipo e antecedência; o anterior fica guardado, sem mudar'
);

select is(
  public.renovar_vencimento('75100000-0000-4000-8000-000000000103', '75100000-0000-4000-8000-000000000101',
    1, current_date + 400),
  '75100000-0000-4000-8000-000000000103'::uuid,
  'repetir a renovação com o mesmo p_id devolve o mesmo vencimento'
);

select throws_ok(
  $$select public.renovar_vencimento('75100000-0000-4000-8000-0000000001ff', '75100000-0000-4000-8000-000000000101',
      1, current_date + 500, p_versao_id => '75100000-0000-4000-8000-000000000406',
      p_caminho => 'c0000000-0000-4000-8000-00000000000a/vencimento/75100000-0000-4000-8000-000000000406.pdf',
      p_nome_original => 'outro.pdf', p_sha256 => repeat('c', 64))$$,
  'P0001', 'vencimento_ja_renovado',
  'um vencimento já renovado não ganha um segundo sucessor'
);

select throws_ok(
  $$select public.excluir_vencimento('75100000-0000-4000-8000-000000000101', 1)$$,
  'P0001', 'vencimento_ja_renovado',
  'não exclui o anterior de uma renovação'
);

select results_eq(
  $$select id from private.linhas_de_prazo_vencimento('c0000000-0000-4000-8000-00000000000a') order by id$$,
  $$values ('75100000-0000-4000-8000-000000000102'::uuid), ('75100000-0000-4000-8000-000000000103'::uuid)$$,
  'o anterior deixa de gerar prazo'
);

-- ---------------------------------------------------------------------------
-- Editar
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.editar_vencimento('75100000-0000-4000-8000-000000000103', 5, current_setting('testes.alvara')::uuid,
      current_date + 400, 60)$$,
  'P0001', 'conflito_de_versao',
  'editar com versão antiga é recusado'
);

select is(
  public.editar_vencimento('75100000-0000-4000-8000-000000000103', 1, current_setting('testes.alvara')::uuid,
    current_date + 400, 60, '75100000-0000-4000-8000-0000000000f1', null, '200/2027', null, 'Vistoria junto'),
  2,
  'Gestão edita as notas'
);

select is(
  public.editar_vencimento('75100000-0000-4000-8000-000000000103', 2, current_setting('testes.alvara')::uuid,
    current_date + 400, 60, '75100000-0000-4000-8000-0000000000f1', null, ' 200/2027 ', '', 'Vistoria junto'),
  2,
  'editar sem mudar nada devolve a mesma versão'
);

select public.editar_tipo_vencimento(current_setting('testes.certidao')::uuid, 'Certidão', 60, false, false);

select throws_ok(
  $$select public.editar_vencimento('75100000-0000-4000-8000-000000000102', 1, current_setting('testes.certidao')::uuid,
      current_date + 200, 30)$$,
  'P0001', 'tipo_vencimento_inativo',
  'trocar para um tipo desativado é recusado'
);

select throws_ok(
  $$select public.editar_vencimento('75100000-0000-4000-8000-000000000102', 1, current_setting('testes.alvara')::uuid,
      current_date + 200, 30)$$,
  '22023', 'pdf_obrigatorio',
  'trocar para um tipo que exige PDF, sem PDF, é recusado'
);

select throws_ok(
  $$select public.editar_vencimento('75100000-0000-4000-8000-000000000102', 1, current_setting('testes.art')::uuid,
      current_date + 200, 30, p_responsavel_tecnico_id => 'd0000000-0000-4000-8000-0000000000a6')$$,
  '22023', 'responsavel_tecnico_invalido',
  'trocar o responsável técnico por um desligado é recusado'
);

-- ---------------------------------------------------------------------------
-- Trocar PDF
-- ---------------------------------------------------------------------------
select is(
  public.trocar_pdf_vencimento('75100000-0000-4000-8000-000000000102', '75100000-0000-4000-8000-000000000403',
    'c0000000-0000-4000-8000-00000000000a/vencimento/75100000-0000-4000-8000-000000000403.pdf', 'art.pdf',
    repeat('d', 64)),
  '75100000-0000-4000-8000-000000000403'::uuid,
  'Gestão anexa PDF à ART que não tinha'
);

select results_eq(
  $$select (v).row_version, d.entidade, d.versao_vigente_id
    from (select testes.vencimento_751('75100000-0000-4000-8000-000000000102') as v) as x
    join public.documento as d on d.id = (v).documento_id$$,
  $$values (2, 'vencimento'::text, '75100000-0000-4000-8000-000000000403'::uuid)$$,
  'documento criado e ligado; a versão do vencimento anda'
);

select is(
  public.trocar_pdf_vencimento('75100000-0000-4000-8000-000000000102', '75100000-0000-4000-8000-000000000403',
    'c0000000-0000-4000-8000-00000000000a/vencimento/75100000-0000-4000-8000-000000000403.pdf', 'art.pdf',
    repeat('d', 64)),
  '75100000-0000-4000-8000-000000000403'::uuid,
  'repetir a troca com a mesma versão devolve a versão'
);

select is(
  public.trocar_pdf_vencimento('75100000-0000-4000-8000-000000000103', '75100000-0000-4000-8000-000000000404',
    'c0000000-0000-4000-8000-00000000000a/vencimento/75100000-0000-4000-8000-000000000404.pdf',
    'alvara-2027-corrigido.pdf', repeat('e', 64)),
  '75100000-0000-4000-8000-000000000404'::uuid,
  'Gestão troca o PDF do alvará renovado'
);

select results_eq(
  $$select (select count(*) from public.documento_versao
            where documento_id = (testes.vencimento_751('75100000-0000-4000-8000-000000000102')).documento_id),
           (select count(*) from public.documento_versao
            where documento_id = (testes.vencimento_751('75100000-0000-4000-8000-000000000103')).documento_id),
           (select max(numero) from public.documento_versao
            where documento_id = (testes.vencimento_751('75100000-0000-4000-8000-000000000103')).documento_id)$$,
  $$values (1::bigint, 2::bigint, 2)$$,
  'repetir não cria versão; a troca cria a versão 2 e guarda a 1'
);

select throws_ok(
  $$select public.trocar_pdf_vencimento('75100000-0000-4000-8000-000000000103', '75100000-0000-4000-8000-000000000401',
      'c0000000-0000-4000-8000-00000000000a/vencimento/75100000-0000-4000-8000-000000000401.pdf', 'x.pdf',
      repeat('a', 64))$$,
  'P0001', 'versao_existente',
  'versão de outro documento é recusada'
);

-- ---------------------------------------------------------------------------
-- Excluir
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.excluir_vencimento('75100000-0000-4000-8000-000000000103', 1)$$,
  'P0001', 'conflito_de_versao',
  'excluir com versão antiga é recusado'
);

select lives_ok(
  $$select public.excluir_vencimento('75100000-0000-4000-8000-000000000103', 3)$$,
  'Gestão exclui o alvará renovado (lógico)'
);

select results_eq(
  $$select id from private.linhas_de_prazo_vencimento('c0000000-0000-4000-8000-00000000000a') order by id$$,
  $$values ('75100000-0000-4000-8000-000000000101'::uuid), ('75100000-0000-4000-8000-000000000102'::uuid)$$,
  'excluído o novo, o anterior volta a ser o vigente'
);

select lives_ok(
  $$select public.excluir_vencimento('75100000-0000-4000-8000-000000000103', 3)$$,
  'excluir de novo é inofensivo'
);

select throws_ok(
  $$select public.editar_vencimento('75100000-0000-4000-8000-000000000103', 4, current_setting('testes.alvara')::uuid,
      current_date + 400, 60)$$,
  'P0001', 'vencimento_excluido',
  'vencimento excluído não é editado'
);

select throws_ok(
  $$select public.renovar_vencimento('75100000-0000-4000-8000-0000000001ff', '75100000-0000-4000-8000-000000000103',
      4, current_date + 500)$$,
  '22023', 'vencimento_anterior_invalido',
  'vencimento excluído não é renovado'
);

select lives_ok(
  $$select public.renovar_vencimento('75100000-0000-4000-8000-000000000105', '75100000-0000-4000-8000-000000000101',
      1, current_date + 410, p_versao_id => '75100000-0000-4000-8000-000000000405',
      p_caminho => 'c0000000-0000-4000-8000-00000000000a/vencimento/75100000-0000-4000-8000-000000000405.pdf',
      p_nome_original => 'alvara-novo.pdf', p_sha256 => repeat('f', 64))$$,
  'excluído o sucessor, o anterior pode ser renovado de novo'
);

-- ---------------------------------------------------------------------------
-- Tipo desativado: não serve para vencimento novo, mas renova
-- ---------------------------------------------------------------------------
select public.editar_tipo_vencimento(current_setting('testes.art')::uuid, 'ART', 90, false, false);

select throws_ok(
  $$select public.cadastrar_vencimento('75100000-0000-4000-8000-0000000001ff', '75100000-0000-4000-8000-0000000000e1',
      current_setting('testes.art')::uuid, current_date + 30)$$,
  'P0001', 'tipo_vencimento_inativo',
  'tipo desativado não serve para vencimento novo'
);

select lives_ok(
  $$select public.renovar_vencimento('75100000-0000-4000-8000-000000000104', '75100000-0000-4000-8000-000000000102',
      2, current_date + 565, p_numero => 'ART 56')$$,
  'vencimento de tipo desativado pode ser renovado'
);

select ok(
  exists (select 1 from public.auditoria
          where entidade = 'vencimento' and entidade_id = '75100000-0000-4000-8000-000000000101'
            and acao = 'insert' and ator_membro_id = 'd0000000-0000-4000-8000-0000000000a1')
  and (select count(*) from public.auditoria
       where entidade = 'vencimento' and entidade_id = '75100000-0000-4000-8000-000000000103'
         and acao = 'update') = 3,
  'cadastro, edição, troca de PDF e exclusão ficam na auditoria com o autor'
);

-- ---------------------------------------------------------------------------
-- Equipe lê, não escreve
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select is(
  (select count(*) from public.vencimento where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  5::bigint,
  'Equipe lê os vencimentos da consultoria'
);

select throws_ok(
  $$select public.excluir_vencimento('75100000-0000-4000-8000-000000000104', 1)$$,
  '42501', 'sem_permissao',
  'Equipe não exclui vencimento'
);

select throws_ok(
  $$select public.renovar_vencimento('75100000-0000-4000-8000-0000000001ff', '75100000-0000-4000-8000-000000000104',
      1, current_date + 900)$$,
  '42501', 'sem_permissao',
  'Equipe não renova vencimento'
);

-- ---------------------------------------------------------------------------
-- Outra consultoria
-- ---------------------------------------------------------------------------
select testes.autenticar_como('gustavo@verdesul.test');

select is(
  (select count(*) from public.vencimento where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  0::bigint,
  'Gestão de B lê zero vencimentos de A'
);

select throws_ok(
  $$select public.cadastrar_vencimento('75100000-0000-4000-8000-0000000001ff', '75100000-0000-4000-8000-0000000000e1',
      current_setting('testes.art_b')::uuid, current_date + 30)$$,
  '42501', 'sem_permissao',
  'Gestão de B não cadastra em empreendimento de A'
);

select throws_ok(
  $$select public.cadastrar_vencimento('75100000-0000-4000-8000-000000000101', '75100000-0000-4000-8000-0000000000eb',
      current_setting('testes.art_b')::uuid, current_date + 30)$$,
  '42501', 'sem_permissao',
  'Gestão de B não reaproveita o p_id de um vencimento de A'
);

select throws_ok(
  $$select public.editar_vencimento('75100000-0000-4000-8000-000000000104', 1, current_setting('testes.art_b')::uuid,
      current_date + 30, 60)$$,
  '42501', 'sem_permissao',
  'Gestão de B não edita vencimento de A, mesmo sabendo o id'
);

select throws_ok(
  $$select public.trocar_pdf_vencimento('75100000-0000-4000-8000-000000000104', '75100000-0000-4000-8000-0000000004ff',
      'c0000000-0000-4000-8000-00000000000b/vencimento/75100000-0000-4000-8000-0000000004ff.pdf', 'x.pdf',
      repeat('a', 64))$$,
  '42501', 'sem_permissao',
  'Gestão de B não troca o PDF de vencimento de A'
);

select throws_ok(
  $$select public.excluir_vencimento('75100000-0000-4000-8000-000000000104', 1)$$,
  '42501', 'sem_permissao',
  'Gestão de B não exclui vencimento de A'
);

select throws_ok(
  $$select public.renovar_vencimento('75100000-0000-4000-8000-0000000001ff', '75100000-0000-4000-8000-000000000104',
      1, current_date + 900)$$,
  '42501', 'sem_permissao',
  'Gestão de B não renova vencimento de A'
);

select testes.autenticar_como_anonimo();

select throws_ok(
  $$select public.cadastrar_vencimento('75100000-0000-4000-8000-0000000001ff', '75100000-0000-4000-8000-0000000000e1',
      current_setting('testes.art')::uuid, current_date + 30)$$,
  '42501', null,
  'anon não executa cadastrar_vencimento'
);

select * from finish();

rollback;
