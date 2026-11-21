-- Requisitos legais por empreendimento (L6, ADR-0050, LEG-07 e LEG-08): sugestão pela triagem com a
-- mesma regra dos avisos, aplicabilidade (só a Gestão marca "não se aplica", com justificativa),
-- avaliação que só acrescenta e guarda a versão da norma, ação como linha de prazo, evidência em PDF,
-- leitura com os dados da situação, isolamento entre consultorias e o recurso 'legislacao' do plano.
begin;

select plan(42);

select testes.criar_dados_sinteticos();

select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

-- ---------------------------------------------------------------------------
-- Cenário (como dono)
-- A: E1 Fundição Teste (unidade em Joinville) com LAO do IMA ativa e atividade 99.10.00;
--    E2 Oficina Teste sem licença. B: EB.
-- Normas de teste: N1 atividade 99.10.00 (com versão e mudança publicada) · N2 prefixo 99 ·
-- N3 competência estadual · N4 revogada com 99.10.00 · N5 municipal de Blumenau com 99.10.00.
-- ---------------------------------------------------------------------------
insert into public.empreendimento (id, consultoria_id, nome, criado_por) values
  ('73700000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a', 'Fundição Teste',
   'd0000000-0000-4000-8000-0000000000a1'),
  ('73700000-0000-4000-8000-0000000000e2', 'c0000000-0000-4000-8000-00000000000a', 'Oficina Teste',
   'd0000000-0000-4000-8000-0000000000a1'),
  ('73700000-0000-4000-8000-0000000000eb', 'c0000000-0000-4000-8000-00000000000b', 'Fundição Sul',
   'd0000000-0000-4000-8000-0000000000b1');

insert into public.unidade (id, consultoria_id, empreendimento_id, nome, municipio_ibge, municipio_nome,
                            municipio_gravado_em) values
  ('73700000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
   '73700000-0000-4000-8000-0000000000e1', 'Matriz', '4209102', 'Joinville', now()),
  ('73700000-0000-4000-8000-0000000000f2', 'c0000000-0000-4000-8000-00000000000a',
   '73700000-0000-4000-8000-0000000000e2', 'Oficina', null, null, null),
  ('73700000-0000-4000-8000-0000000000fb', 'c0000000-0000-4000-8000-00000000000b',
   '73700000-0000-4000-8000-0000000000eb', 'Matriz', null, null, null);

insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, tipo_id, numero, orgao, situacao,
                                assinado_em, marco, validade, criado_por, ativado_em, ativado_por, chave_ativacao)
values ('73700000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-00000000000a',
        '73700000-0000-4000-8000-0000000000e1', '73700000-0000-4000-8000-0000000000f1',
        (select t.id from public.tipo_instrumento as t
         where t.consultoria_id = 'c0000000-0000-4000-8000-00000000000a' and t.sigla = 'LAO'),
        '737/2025', 'IMA', 'ativo', current_setting('testes.hoje')::date - 100, 'assinatura',
        current_setting('testes.hoje')::date + 900, 'd0000000-0000-4000-8000-0000000000a1', now(),
        'd0000000-0000-4000-8000-0000000000a1', gen_random_uuid());

insert into public.atividade_licenciada (consultoria_id, instrumento_id, codigo, descricao, porte, potencial, fonte,
                                         registrado_por)
values ('c0000000-0000-4000-8000-00000000000a', '73700000-0000-4000-8000-000000000011', '99.10.00',
        'Atividade de teste', 'pequeno', 'M', 'Resolução CONSEMA 250/2024', 'd0000000-0000-4000-8000-0000000000a1');

insert into private.norma (id, chave, esfera, municipio_ibge, orgao, tipo, numero, ano, titulo, situacao_na_fonte)
values
  ('73700000-0000-4000-8000-000000000101', 'sc;teste737;n1', 'estadual', null, 'IMA-TESTE', 'portaria', '7371', 2026,
   'Portaria Teste 737 um', 'vigente'),
  ('73700000-0000-4000-8000-000000000102', 'sc;teste737;n2', 'estadual', null, 'IMA-TESTE', 'portaria', '7372', 2026,
   'Portaria Teste 737 dois', 'vigente'),
  ('73700000-0000-4000-8000-000000000103', 'sc;teste737;n3', 'estadual', null, 'IMA-TESTE', 'portaria', '7373', 2026,
   'Portaria Teste 737 três', 'vigente'),
  ('73700000-0000-4000-8000-000000000104', 'sc;teste737;n4', 'estadual', null, 'IMA-TESTE', 'portaria', '7374', 2026,
   'Portaria Teste 737 quatro', 'revogada'),
  ('73700000-0000-4000-8000-000000000105', 'sc;4202404;teste737;n5', 'municipal', '4202404', 'SEMMAS-TESTE',
   'portaria', '7375', 2026, 'Portaria Teste 737 cinco', 'vigente');

insert into private.norma_criterio (norma_id, tipo, valor, origem) values
  ('73700000-0000-4000-8000-000000000101', 'atividade', '99.10.00', 'curadoria'),
  ('73700000-0000-4000-8000-000000000102', 'prefixo_atividade', '99', 'curadoria'),
  ('73700000-0000-4000-8000-000000000103', 'competencia', 'estadual', 'curadoria'),
  ('73700000-0000-4000-8000-000000000104', 'atividade', '99.10.00', 'curadoria'),
  ('73700000-0000-4000-8000-000000000105', 'atividade', '99.10.00', 'curadoria');

insert into private.norma_versao (id, norma_id, numero, sha256, texto) values
  ('73700000-0000-4000-8000-000000000201', '73700000-0000-4000-8000-000000000101', 1, repeat('a', 64), 'Art. 1º Texto.');

-- PDF da evidência já no Storage.
insert into storage.objects (bucket_id, name, metadata) values
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/requisito_legal/73700000-0000-4000-8000-000000000301.pdf',
   '{"mimetype": "application/pdf", "size": 2048}'::jsonb);

-- ---------------------------------------------------------------------------
-- Estrutura
-- ---------------------------------------------------------------------------
select ok(
  (select bool_and(c.relrowsecurity and c.relforcerowsecurity) from pg_catalog.pg_class as c
   where c.oid in ('public.requisito_legal'::regclass, 'public.avaliacao_conformidade'::regclass,
                   'public.acao_legal'::regclass, 'public.evidencia_de_requisito'::regclass)),
  'as quatro tabelas têm RLS forçada'
);

select ok(
  (select bool_and(not has_table_privilege('authenticated', t, 'INSERT')
                   and not has_table_privilege('authenticated', t, 'UPDATE'))
   from unnest(array['public.requisito_legal', 'public.avaliacao_conformidade', 'public.acao_legal',
                     'public.evidencia_de_requisito']) as t),
  'authenticated não escreve direto nas tabelas'
);

select ok(
  (select 'legislacao' = any (p.recursos) from private.plano_catalogo as p where p.codigo = 'equipe')
  and (select 'legislacao' = any (p.recursos) from private.plano_catalogo as p where p.codigo = 'escala')
  and not (select 'legislacao' = any (p.recursos) from private.plano_catalogo as p where p.codigo = 'essencial'),
  'recurso legislacao nos planos Equipe e Escala, fora do Essencial'
);

select is(
  (select array_agg(n.norma_id order by n.norma_id::text)
   from private.normas_aplicaveis('c0000000-0000-4000-8000-00000000000a', '73700000-0000-4000-8000-0000000000e1') as n
   where n.norma_id::text like '73700000%'),
  array['73700000-0000-4000-8000-000000000101', '73700000-0000-4000-8000-000000000102',
        '73700000-0000-4000-8000-000000000103']::uuid[],
  'normas aplicáveis: atividade, prefixo e competência; revogada e municipal de outro município ficam fora'
);

select is(
  (select n.motivo from private.normas_aplicaveis('c0000000-0000-4000-8000-00000000000a',
                                                  '73700000-0000-4000-8000-0000000000e1') as n
   where n.norma_id = '73700000-0000-4000-8000-000000000102'),
  '{"criterio": "prefixo_atividade", "valor": "99"}'::jsonb,
  'o motivo diz o critério que casou'
);

select ok(
  exists (select 1 from private.normas_aplicaveis('c0000000-0000-4000-8000-00000000000a',
                                                  '73700000-0000-4000-8000-0000000000e1') as n
          join private.norma as x on x.id = n.norma_id where x.chave = 'sc;consema;resolucao;250;2024'),
  'a carga também entra: CONSEMA 250 para licença do IMA'
);

select is(
  (select count(*)::integer from private.normas_aplicaveis('c0000000-0000-4000-8000-00000000000a',
                                                           '73700000-0000-4000-8000-0000000000e2') as n
   where n.norma_id::text like '73700000%'),
  0,
  'empreendimento sem atividade nem licença não recebe norma de teste'
);

-- ---------------------------------------------------------------------------
-- Sugerir e adicionar (Equipe)
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select set_config('testes.sugeridos',
  public.sugerir_requisitos('c0000000-0000-4000-8000-00000000000a', '73700000-0000-4000-8000-0000000000e1')::text,
  true);

select is(
  current_setting('testes.sugeridos')::integer,
  (select count(*)::integer from public.requisito_legal as r
   where r.empreendimento_id = '73700000-0000-4000-8000-0000000000e1'),
  'sugerir cria um requisito por norma aplicável e devolve quantos criou'
);

select is(
  (select count(*)::integer from public.requisito_legal as r
   where r.empreendimento_id = '73700000-0000-4000-8000-0000000000e1' and r.norma_id::text like '73700000%'),
  3,
  'os três de teste foram sugeridos'
);

select ok(
  (select bool_and(r.origem = 'sugerido' and r.aplicavel is null) from public.requisito_legal as r
   where r.empreendimento_id = '73700000-0000-4000-8000-0000000000e1'),
  'sugeridos nascem sem decisão'
);

select is(
  public.sugerir_requisitos('c0000000-0000-4000-8000-00000000000a', '73700000-0000-4000-8000-0000000000e1'),
  0,
  'sugerir de novo não duplica'
);

select throws_ok(
  $$select public.sugerir_requisitos('c0000000-0000-4000-8000-00000000000a', '73700000-0000-4000-8000-0000000000eb')$$,
  '22023', 'empreendimento_invalido',
  'empreendimento de outra consultoria é recusado'
);

select set_config('testes.manual',
  public.adicionar_requisito('c0000000-0000-4000-8000-00000000000a', '73700000-0000-4000-8000-0000000000e2',
                             '73700000-0000-4000-8000-000000000101', 'art. 3º', null)::text, true);

select is(
  public.adicionar_requisito('c0000000-0000-4000-8000-00000000000a', '73700000-0000-4000-8000-0000000000e2',
                             '73700000-0000-4000-8000-000000000101', ' art. 3º ', null)::text,
  current_setting('testes.manual'),
  'adicionar de novo a mesma norma e dispositivo devolve o mesmo requisito'
);

select ok(
  (select r.aplicavel and r.origem = 'manual' from public.requisito_legal as r
   where r.id = current_setting('testes.manual')::uuid),
  'requisito à mão já nasce aplicável'
);

-- ---------------------------------------------------------------------------
-- Aplicabilidade
-- ---------------------------------------------------------------------------
select set_config('testes.r1', (select r.id::text from public.requisito_legal as r
  where r.empreendimento_id = '73700000-0000-4000-8000-0000000000e1'
    and r.norma_id = '73700000-0000-4000-8000-000000000101'), true);
select set_config('testes.r2', (select r.id::text from public.requisito_legal as r
  where r.empreendimento_id = '73700000-0000-4000-8000-0000000000e1'
    and r.norma_id = '73700000-0000-4000-8000-000000000102'), true);
select set_config('testes.r3', (select r.id::text from public.requisito_legal as r
  where r.empreendimento_id = '73700000-0000-4000-8000-0000000000e1'
    and r.norma_id = '73700000-0000-4000-8000-000000000103'), true);

select throws_ok(
  format($$select public.decidir_aplicabilidade('c0000000-0000-4000-8000-00000000000a', %L, false, 'Não temos', 1)$$,
         current_setting('testes.r2')),
  '42501', 'sem_permissao',
  'Equipe não marca "não se aplica"'
);

select is(
  public.decidir_aplicabilidade('c0000000-0000-4000-8000-00000000000a', current_setting('testes.r3')::uuid, true, null, 1),
  2,
  'Equipe confirma que se aplica'
);

select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  format($$select public.decidir_aplicabilidade('c0000000-0000-4000-8000-00000000000a', %L, false, '  ', 1)$$,
         current_setting('testes.r2')),
  '22023', 'justificativa_obrigatoria',
  '"não se aplica" exige justificativa'
);

select is(
  public.decidir_aplicabilidade('c0000000-0000-4000-8000-00000000000a', current_setting('testes.r2')::uuid, false,
                                'A unidade não faz essa etapa do processo.', 1),
  2,
  'Gestão marca "não se aplica" com justificativa'
);

select throws_ok(
  format($$select public.decidir_aplicabilidade('c0000000-0000-4000-8000-00000000000a', %L, true, null, 1)$$,
         current_setting('testes.r2')),
  'P0001', 'conflito_de_versao',
  'versão velha dá conflito'
);

-- ---------------------------------------------------------------------------
-- Avaliação e ação (Equipe)
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select throws_ok(
  format($$select public.avaliar_requisito('c0000000-0000-4000-8000-00000000000a', %L, 'conforme', %L::date, null, null, 1)$$,
         current_setting('testes.r1'), current_setting('testes.hoje')::date + 1),
  '22023', 'data_invalida',
  'avaliação com data futura é recusada'
);

select throws_ok(
  format($$select public.avaliar_requisito('c0000000-0000-4000-8000-00000000000a', %L, 'conforme', %L::date, null, null, 2)$$,
         current_setting('testes.r2'), current_setting('testes.hoje')),
  'P0001', 'requisito_nao_se_aplica',
  'requisito que não se aplica não é avaliado'
);

select is(
  (public.avaliar_requisito('c0000000-0000-4000-8000-00000000000a', current_setting('testes.r1')::uuid, 'conforme',
                            current_setting('testes.hoje')::date, 'Licença em dia.', null, 1)) ->> 'row_version',
  '2',
  'Equipe avalia o sugerido como conforme'
);

select ok(
  (select r.aplicavel from public.requisito_legal as r where r.id = current_setting('testes.r1')::uuid),
  'avaliar um sugerido o torna aplicável'
);

select is(
  (select a.norma_versao_id from public.avaliacao_conformidade as a
   where a.requisito_id = current_setting('testes.r1')::uuid),
  '73700000-0000-4000-8000-000000000201'::uuid,
  'a avaliação guarda a versão da norma avaliada'
);

select throws_ok(
  format($$select public.avaliar_requisito('c0000000-0000-4000-8000-00000000000a', %L, 'nao_conforme', %L::date, null,
           '{"descricao": "Trocar filtro", "prazo": "2026-12-30", "responsavel_id": "d0000000-0000-4000-8000-0000000000b1"}'::jsonb, 2)$$,
         current_setting('testes.r3'), current_setting('testes.hoje')),
  '22023', 'responsavel_invalido',
  'responsável de outra consultoria é recusado'
);

select set_config('testes.avaliacao_r3',
  public.avaliar_requisito('c0000000-0000-4000-8000-00000000000a', current_setting('testes.r3')::uuid, 'nao_conforme',
    current_setting('testes.hoje')::date, null,
    jsonb_build_object('descricao', 'Atualizar o plano de gerenciamento',
                       'prazo', (current_setting('testes.hoje')::date + 10)::text,
                       'responsavel_id', 'd0000000-0000-4000-8000-0000000000a2'), 2)::text, true);

select ok(
  (current_setting('testes.avaliacao_r3')::jsonb ->> 'acao_id') is not null,
  'não conforme com ação cria a ação na mesma transação'
);

select is(
  (select row(l.tipo_linha, l.dias, l.titulo, l.responsavel_id::text, l.empreendimento_nome)::text
   from private.linhas_de_prazo_acao_legal('c0000000-0000-4000-8000-00000000000a') as l),
  row('acao_legal', 10, 'Atualizar o plano de gerenciamento', 'd0000000-0000-4000-8000-0000000000a2',
      'Fundição Teste')::text,
  'a ação aberta vira linha de prazo acao_legal'
);

select is(
  (select count(*)::integer from private.linhas_de_prazo('c0000000-0000-4000-8000-00000000000a') as l
   where l.tipo_linha = 'acao_legal'),
  1,
  'a união das fontes inclui a ação'
);

select throws_ok(
  format($$select public.atribuir_acao_legal('c0000000-0000-4000-8000-00000000000a', %L, null, 1)$$,
         current_setting('testes.avaliacao_r3')::jsonb ->> 'acao_id'),
  '42501', 'sem_permissao',
  'Equipe não reatribui a ação'
);

select is(
  public.concluir_acao_legal('c0000000-0000-4000-8000-00000000000a',
                             (current_setting('testes.avaliacao_r3')::jsonb ->> 'acao_id')::uuid, 1),
  2,
  'Equipe conclui a ação'
);

select is(
  (select count(*)::integer from private.linhas_de_prazo_acao_legal('c0000000-0000-4000-8000-00000000000a')),
  0,
  'ação concluída sai dos prazos'
);

-- ---------------------------------------------------------------------------
-- Evidência e leitura
-- ---------------------------------------------------------------------------
select set_config('testes.evidencia',
  public.anexar_evidencia_ao_requisito('c0000000-0000-4000-8000-00000000000a', current_setting('testes.r1')::uuid,
    '73700000-0000-4000-8000-000000000301',
    'c0000000-0000-4000-8000-00000000000a/requisito_legal/73700000-0000-4000-8000-000000000301.pdf',
    'licenca.pdf', repeat('b', 64), (current_setting('testes.hoje')::date + 365))::text, true);

select is(
  public.anexar_evidencia_ao_requisito('c0000000-0000-4000-8000-00000000000a', current_setting('testes.r1')::uuid,
    '73700000-0000-4000-8000-000000000301',
    'c0000000-0000-4000-8000-00000000000a/requisito_legal/73700000-0000-4000-8000-000000000301.pdf',
    'licenca.pdf', repeat('b', 64), null)::text,
  current_setting('testes.evidencia'),
  'reenviar a mesma versão devolve a mesma evidência'
);

select is(
  (select count(*)::integer from public.listar_evidencias_do_requisito('c0000000-0000-4000-8000-00000000000a',
                                                                       current_setting('testes.r1')::uuid)),
  1,
  'a evidência aparece na lista do requisito'
);

reset role;
insert into private.norma_mudanca (norma_id, versao_nova_id, tipo, situacao, revisada_por, publicada_em)
values ('73700000-0000-4000-8000-000000000101', '73700000-0000-4000-8000-000000000201', 'nova', 'publicada',
        'a0000000-0000-4000-8000-000000000001', now() + interval '1 minute');

select throws_ok(
  $$update public.avaliacao_conformidade set observacao = 'outra' where true$$,
  'P0001', 'avaliacao_imutavel',
  'avaliação não muda depois de gravada'
);

select testes.autenticar_como('ana@filtroville.test');

select is(
  (select row(l.avaliacao_resultado, l.avaliada_por_nome, l.evidencias, l.menor_validade,
              l.ultima_mudanca_publicada_em is not null)::text
   from public.listar_requisitos_do_empreendimento('c0000000-0000-4000-8000-00000000000a',
                                                   '73700000-0000-4000-8000-0000000000e1') as l
   where l.id = current_setting('testes.r1')::uuid),
  row('conforme', 'Ana Ribeiro', 1, current_setting('testes.hoje')::date + 365, true)::text,
  'a lista traz a última avaliação, a evidência e a última mudança publicada da norma'
);

select is(
  (select l.total::integer from public.listar_requisitos_do_empreendimento('c0000000-0000-4000-8000-00000000000a',
                                                                           '73700000-0000-4000-8000-0000000000e1',
                                                                           1, 0) as l),
  (select count(*)::integer from public.requisito_legal as r
   where r.empreendimento_id = '73700000-0000-4000-8000-0000000000e1'),
  'a lista é paginada e traz o total'
);

-- ---------------------------------------------------------------------------
-- Outra consultoria e anônimo
-- ---------------------------------------------------------------------------
select testes.autenticar_como('gustavo@verdesul.test');

select is(
  (select count(*)::integer from public.requisito_legal),
  0,
  'outra consultoria lê zero requisitos'
);

select is(
  (select count(*)::integer from public.listar_requisitos_do_empreendimento('c0000000-0000-4000-8000-00000000000a',
                                                                           '73700000-0000-4000-8000-0000000000e1')),
  0,
  'outra consultoria recebe zero linhas na lista'
);

select throws_ok(
  $$select public.sugerir_requisitos('c0000000-0000-4000-8000-00000000000a', '73700000-0000-4000-8000-0000000000e1')$$,
  '42501', 'sem_permissao',
  'outra consultoria não sugere'
);

select testes.autenticar_como_anonimo();

select throws_ok(
  $$select public.sugerir_requisitos('c0000000-0000-4000-8000-00000000000a', '73700000-0000-4000-8000-0000000000e1')$$,
  '42501', null,
  'anônimo não sugere'
);

-- ---------------------------------------------------------------------------
-- Plano sem o recurso
-- ---------------------------------------------------------------------------
reset role;
update private.configuracao_comercial set fim_do_beta = current_date - 400;
update public.consultoria set criada_em = now() - interval '60 days' where id = 'c0000000-0000-4000-8000-00000000000a';
insert into public.consultoria_condicao_comercial (consultoria_id, plano_contrato)
values ('c0000000-0000-4000-8000-00000000000a', 'essencial')
on conflict (consultoria_id) do update set plano_contrato = excluded.plano_contrato, contrato_ate = null;

select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.sugerir_requisitos('c0000000-0000-4000-8000-00000000000a', '73700000-0000-4000-8000-0000000000e2')$$,
  '42501', 'recurso_fora_do_plano',
  'plano Essencial não escreve requisitos'
);

select is(
  (select count(*)::integer from public.listar_requisitos_do_empreendimento('c0000000-0000-4000-8000-00000000000a',
                                                                           '73700000-0000-4000-8000-0000000000e1')) > 0,
  true,
  'sem o recurso, o que já existe continua legível'
);

reset role;

select * from finish();
rollback;
