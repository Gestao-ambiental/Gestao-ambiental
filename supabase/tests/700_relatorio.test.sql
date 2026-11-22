-- Relatório escrito no Grama (ADR-0040): versões, revisão com conferência independente, conferência
-- por IA de uma versão, apontamento ignorado e aprovação que vira a evidência da ocorrência. Outra
-- consultoria não vê, não cria, não edita nem aprova.
begin;

select plan(40);

select testes.criar_dados_sinteticos();
select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

update private.configuracao_comercial set fim_do_beta = current_date - 400;
update public.consultoria set criada_em = now() - interval '60 days' where id = 'c0000000-0000-4000-8000-00000000000a';
insert into public.consultoria_condicao_comercial (consultoria_id, plano_contrato)
values ('c0000000-0000-4000-8000-00000000000a', 'equipe')
on conflict (consultoria_id) do update set plano_contrato = excluded.plano_contrato, contrato_ate = null;

insert into public.empreendimento (id, consultoria_id, nome, cnpj, criado_por)
values ('e0000000-0000-4000-8000-000000000700', 'c0000000-0000-4000-8000-00000000000a',
        'Metalúrgica Rio Cubatão', '11222333000181', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome)
values ('f0000000-0000-4000-8000-000000000700', 'c0000000-0000-4000-8000-00000000000a',
        'e0000000-0000-4000-8000-000000000700', 'Matriz');

select testes.autenticar_como('eduardo@filtroville.test');
-- A Gestão liga a conferência por IA (ADR-0061).
select public.definir_autorizacao_ia('c0000000-0000-4000-8000-00000000000a', 'conferencia_relatorio', true);
select public.criar_instrumento('10000000-0000-4000-8000-000000000700', 'f0000000-0000-4000-8000-000000000700');
select public.salvar_identificacao('10000000-0000-4000-8000-000000000700', 1, 'f0000000-0000-4000-8000-000000000700',
  (select id from public.tipo_instrumento where sigla = 'LAO' and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  '4821/2023', 'IMA', null, current_setting('testes.hoje')::date - 30, null, null, 'assinatura',
  current_setting('testes.hoje')::date + 400);
select public.salvar_condicionante('30000000-0000-4000-8000-000000000700',
  '10000000-0000-4000-8000-000000000700', null, '4.1', 'Monitoramento de efluentes',
  'Apresentar relatório semestral de efluentes.', 'obrigacao');
select public.confirmar_prazo('30000000-0000-4000-8000-000000000700', 'unica', null, null,
  'corridos', null, current_setting('testes.hoje')::date + 5, 'Documento');
select public.atribuir_a_todos('10000000-0000-4000-8000-000000000700', 'd0000000-0000-4000-8000-0000000000a3');
select public.ativar_plano('10000000-0000-4000-8000-000000000700',
  (select row_version from public.instrumento where id = '10000000-0000-4000-8000-000000000700'), gen_random_uuid());

reset role;
select set_config('testes.oc', (select o.id::text from public.ocorrencia as o
  join public.condicionante_versao as v on v.id = o.condicionante_versao_id
  where v.condicionante_id = '30000000-0000-4000-8000-000000000700'), true);

-- ---------------------------------------------------------------- criar e salvar (Bruno, Equipe)
select testes.autenticar_como('bruno@filtroville.test');

select is(
  public.criar_relatorio('80000000-0000-4000-8000-000000000701', 'e0000000-0000-4000-8000-000000000700',
    current_setting('testes.oc')::uuid, null, ' Relatório semestral ',
    '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "LAO 4812/2023"}]}]}'),
  1,
  'a Equipe cria o relatório da ocorrência'
);

select is(
  public.criar_relatorio('80000000-0000-4000-8000-000000000701', 'e0000000-0000-4000-8000-000000000700',
    current_setting('testes.oc')::uuid, null, 'Outro', '{"type": "doc"}'),
  1,
  'repetir a criação devolve o relatório já criado'
);

select results_eq(
  $$select titulo, situacao, versao, (select count(*)::integer from public.relatorio_versao)
    from public.relatorio where id = '80000000-0000-4000-8000-000000000701'$$,
  $$values ('Relatório semestral', 'rascunho', 1, 1)$$,
  'nasce como rascunho na versão 1'
);

select is(
  public.salvar_relatorio('80000000-0000-4000-8000-000000000701', 'Relatório semestral',
    '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "LAO 4812/2023, IMA"}]}]}', 1),
  2,
  'salvar conteúdo novo sobe a versão'
);

select is(
  public.salvar_relatorio('80000000-0000-4000-8000-000000000701', 'Relatório semestral',
    '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "LAO 4812/2023, IMA"}]}]}', 2),
  2,
  'salvar sem mudança não cria versão'
);

select is(
  (select count(*)::integer from public.relatorio_versao where relatorio_id = '80000000-0000-4000-8000-000000000701'),
  2,
  'duas versões guardadas'
);

select throws_ok(
  $$select public.salvar_relatorio('80000000-0000-4000-8000-000000000701', 'X', '{"type": "doc"}', 1)$$,
  'P0001', 'conflito_de_versao',
  'salvar com versão antiga é recusado'
);

-- ---------------------------------------------------------------- conferência por IA da versão 2
select results_eq(
  $$select nova, situacao, ia_liberada, conteudo #>> '{content,0,content,0,text}',
           contexto #>> '{condicionante,codigo}', contexto #>> '{licenca,numero}'
    from public.iniciar_conferencia_relatorio('70000000-0000-4000-8000-000000000701',
      '80000000-0000-4000-8000-000000000701', 2)$$,
  $$values (true, 'em_andamento', true, 'LAO 4812/2023, IMA', '4.1', '4821/2023')$$,
  'o autor confere a versão salva e recebe o texto e o contexto do cadastro'
);

select results_eq(
  $$select conferencia_id, nova
    from public.iniciar_conferencia_relatorio('70000000-0000-4000-8000-000000000799',
      '80000000-0000-4000-8000-000000000701', 2)$$,
  $$values ('70000000-0000-4000-8000-000000000701'::uuid, false)$$,
  'pedir de novo para a mesma versão devolve a conferência viva'
);

select throws_ok(
  $$select * from public.iniciar_conferencia_relatorio('70000000-0000-4000-8000-000000000798',
    '80000000-0000-4000-8000-000000000701', 9)$$,
  'P0001', 'versao_inexistente',
  'versão que não existe não é conferida'
);

reset role;
set local role service_role;
select is(public.reservar_conferencia_ia('70000000-0000-4000-8000-000000000701'), true,
  'a conferência do relatório reserva a cota como as outras');
select is(
  public.concluir_conferencia_ia('70000000-0000-4000-8000-000000000701', 'Número da licença trocado.',
    '[{"origem": "ia", "categoria": "licenca", "gravidade": "corrigir", "trecho": "LAO 4812/2023",
       "problema": "Número da licença diferente do cadastro.", "sugestao": "Use LAO 4821/2023.",
       "substituicao": "LAO 4821/2023"}]',
    'openai/gpt-4.1-mini', 'conferencia-v2', 900, 120, 700, 3000),
  1,
  'a service role conclui com a substituição'
);

reset role;
select testes.autenticar_como('bruno@filtroville.test');
select lives_ok(
  $$select public.ignorar_apontamento('70000000-0000-4000-8000-000000000701', 0)$$,
  'o autor ignora um apontamento'
);
select lives_ok(
  $$select public.ignorar_apontamento('70000000-0000-4000-8000-000000000701', 0)$$,
  'ignorar de novo não muda nada'
);
select is(
  (select ignorados from public.conferencia_ia where id = '70000000-0000-4000-8000-000000000701'),
  '{0}'::integer[],
  'o apontamento ignorado fica gravado uma vez'
);
select throws_ok(
  $$select public.ignorar_apontamento('70000000-0000-4000-8000-000000000701', 5)$$,
  '22023', 'apontamento_inexistente',
  'índice fora da lista é recusado'
);

-- ---------------------------------------------------------------- outras pessoas e outra consultoria
select testes.autenticar_como('ana@filtroville.test');
select throws_ok(
  $$select public.salvar_relatorio('80000000-0000-4000-8000-000000000701', 'Da Ana', '{"type": "doc"}', 2)$$,
  '42501', 'sem_permissao',
  'quem não escreveu nem é Gestão não edita o rascunho'
);
select throws_ok(
  $$select * from public.iniciar_conferencia_relatorio('70000000-0000-4000-8000-000000000797',
    '80000000-0000-4000-8000-000000000701', 2)$$,
  '42501', 'sem_permissao',
  'quem não edita nem revisa não pede a conferência'
);

select testes.autenticar_como('gustavo@verdesul.test');
select is(
  (select count(*)::integer from public.relatorio) + (select count(*)::integer from public.relatorio_versao),
  0,
  'outra consultoria não vê o relatório nem as versões'
);
select throws_ok(
  $$select public.salvar_relatorio('80000000-0000-4000-8000-000000000701', 'Tomado', '{"type": "doc"}', 2)$$,
  '42501', 'sem_permissao',
  'outra consultoria não edita pelo id conhecido'
);
select throws_ok(
  $$select public.criar_relatorio('80000000-0000-4000-8000-000000000702', 'e0000000-0000-4000-8000-000000000700',
    null, null, 'Alheio', '{"type": "doc"}')$$,
  '42501', 'sem_permissao',
  'outra consultoria não cria relatório no empreendimento alheio'
);
select throws_ok(
  $$select * from public.iniciar_conferencia_relatorio('70000000-0000-4000-8000-000000000796',
    '80000000-0000-4000-8000-000000000701', 2)$$,
  '42501', 'sem_permissao',
  'outra consultoria não pede a conferência'
);
select throws_ok(
  $$insert into public.relatorio_versao (consultoria_id, relatorio_id, numero, titulo, conteudo, autor_id)
    values ('c0000000-0000-4000-8000-00000000000a', '80000000-0000-4000-8000-000000000701', 9, 'x',
            '{"type": "doc"}', 'd0000000-0000-4000-8000-0000000000b1')$$,
  '42501', null,
  'escrita direta na tabela de versões é negada'
);

-- ---------------------------------------------------------------- revisão
select testes.autenticar_como('bruno@filtroville.test');
select is(public.enviar_relatorio('80000000-0000-4000-8000-000000000701', 2), 3, 'o autor envia para revisão');
select throws_ok(
  $$select public.salvar_relatorio('80000000-0000-4000-8000-000000000701', 'X', '{"type": "doc"}', 3)$$,
  '42501', 'sem_permissao',
  'na revisão, o autor não edita'
);
select throws_ok(
  $$select public.aprovar_relatorio('80000000-0000-4000-8000-000000000701', 3)$$,
  'P0001', 'autor_nao_revisa',
  'com a conferência independente, o autor não aprova'
);

select testes.autenticar_como('eduardo@filtroville.test');
select results_eq(
  $$select pode_editar, pode_revisar from public.permissoes_do_relatorio('80000000-0000-4000-8000-000000000701')$$,
  $$values (true, true)$$,
  'a Gestão revisa e corrige no mesmo texto'
);
select is(
  public.salvar_relatorio('80000000-0000-4000-8000-000000000701', 'Relatório semestral',
    '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "LAO 4821/2023, IMA"}]}]}', 3),
  4,
  'a correção da revisão vira uma versão nova'
);
select throws_ok(
  $$select public.devolver_relatorio('80000000-0000-4000-8000-000000000701', '  ', 4)$$,
  '22023', 'motivo_obrigatorio',
  'devolver exige motivo'
);
select is(
  public.devolver_relatorio('80000000-0000-4000-8000-000000000701', 'Falta o período de referência.', 4),
  5,
  'a Gestão devolve com motivo'
);

select testes.autenticar_como('bruno@filtroville.test');
select is(public.enviar_relatorio('80000000-0000-4000-8000-000000000701', 5), 6, 'o autor reenvia');

select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select public.aprovar_relatorio('80000000-0000-4000-8000-000000000701', 6)$$,
  '42501', 'sem_permissao',
  'outra consultoria não aprova pelo id conhecido'
);

select testes.autenticar_como('eduardo@filtroville.test');
select throws_ok(
  $$select public.aprovar_relatorio('80000000-0000-4000-8000-000000000701', 6)$$,
  '22023', 'arquivo_obrigatorio',
  'com ocorrência, aprovar exige o .docx da versão aprovada'
);

reset role;
insert into storage.objects (bucket_id, name, metadata) values
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/evidencia/50000000-0000-4000-8000-000000000701.docx',
   '{"mimetype": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "size": 9000}');
select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.aprovar_relatorio('80000000-0000-4000-8000-000000000701', 6,
    '51000000-0000-4000-8000-000000000701',
    'c0000000-0000-4000-8000-00000000000a/evidencia/50000000-0000-4000-8000-000000000701.docx',
    'Relatório semestral.docx', repeat('d', 64), current_setting('testes.hoje')::date + 1)$$,
  '22023', 'data_execucao_futura',
  'a data real de execução não pode estar no futuro'
);

select is(
  public.aprovar_relatorio('80000000-0000-4000-8000-000000000701', 6,
    '51000000-0000-4000-8000-000000000701',
    'c0000000-0000-4000-8000-00000000000a/evidencia/50000000-0000-4000-8000-000000000701.docx',
    'Relatório semestral.docx', repeat('d', 64), current_setting('testes.hoje')::date - 1),
  7,
  'a Gestão aprova e o relatório vira a evidência da ocorrência'
);

select results_eq(
  $$select ev.numero, ev.situacao::text, ev.enviada_por, c.decisao::text, c.conferente_id, v.nome_original, v.mime,
           v.autor_id, (select r.evidencia_id = ev.id from public.relatorio as r
                        where r.id = '80000000-0000-4000-8000-000000000701')
    from public.evidencia as ev
    join public.conferencia as c on c.evidencia_id = ev.id
    join public.documento_versao as v on v.id = ev.documento_versao_id
    where ev.ocorrencia_id = current_setting('testes.oc')::uuid$$,
  $$values (1, 'aprovada', 'd0000000-0000-4000-8000-0000000000a3'::uuid, 'aprovada',
            'd0000000-0000-4000-8000-0000000000a1'::uuid, 'Relatório semestral.docx',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'd0000000-0000-4000-8000-0000000000a1'::uuid, true)$$,
  'evidência aprovada: enviada por quem escreveu, conferida por quem revisou, com o arquivo versionado'
);

select throws_ok(
  $$select public.salvar_relatorio('80000000-0000-4000-8000-000000000701', 'X', '{"type": "doc"}', 7)$$,
  'P0001', 'relatorio_aprovado',
  'relatório aprovado não se edita'
);

select lives_ok(
  $$select public.concluir_ocorrencia(current_setting('testes.oc')::uuid,
    (select row_version from public.ocorrencia where id = current_setting('testes.oc')::uuid))$$,
  'a Gestão conclui a ocorrência com essa evidência, pelas regras de sempre'
);

-- ---------------------------------------------------------------- sem ocorrência
select testes.autenticar_como('bruno@filtroville.test');
select public.criar_relatorio('80000000-0000-4000-8000-000000000703', 'e0000000-0000-4000-8000-000000000700',
  null, null, 'Ofício', '{"type": "doc", "content": [{"type": "paragraph"}]}');
select public.enviar_relatorio('80000000-0000-4000-8000-000000000703', 1);

select testes.autenticar_como('eduardo@filtroville.test');
select is(
  public.aprovar_relatorio('80000000-0000-4000-8000-000000000703', 2),
  3,
  'sem ocorrência, só aprova'
);
select is(
  (select count(*)::integer from public.evidencia) || ':'
    || (select coalesce(evidencia_id::text, 'sem evidência') from public.relatorio
        where id = '80000000-0000-4000-8000-000000000703'),
  '1:sem evidência',
  'sem ocorrência, nenhuma evidência é criada'
);

select * from finish();
rollback;
