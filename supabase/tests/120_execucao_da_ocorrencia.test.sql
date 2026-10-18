-- Execução da ocorrência (DEM-01 a DEM-04, DEM-09): etapas, evidência com data real, conferência
-- independente, conclusão só pela Gestão, sem evidência com justificativa, reabertura com motivo.
begin;

select plan(44);

select testes.criar_dados_sinteticos();
select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('e0000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
        'Metalúrgica Rio Cubatão', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome)
values ('f0000000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
        'e0000000-0000-4000-8000-0000000000e1', 'Matriz');

-- Licença ativa com duas obrigações únicas (em 5 e 10 dias), responsável Bruno.
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_instrumento('10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-0000000000f1');
select public.salvar_identificacao('10000000-0000-4000-8000-000000000001', 1, 'f0000000-0000-4000-8000-0000000000f1',
  (select id from public.tipo_instrumento where sigla = 'LAO' and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  '4821/2023', 'IMA', null, current_setting('testes.hoje')::date - 30, null, null, 'assinatura',
  current_setting('testes.hoje')::date + 400);
select public.salvar_condicionante(('30000000-0000-4000-8000-00000000000' || n::text)::uuid,
  '10000000-0000-4000-8000-000000000001', null, '4.' || n::text, 'Relatório ' || n::text, '', 'obrigacao')
from generate_series(1, 2) as n;
select public.confirmar_prazo(('30000000-0000-4000-8000-00000000000' || n::text)::uuid, 'unica', null, null,
  'corridos', null, current_setting('testes.hoje')::date + 5 * n, 'Documento')
from generate_series(1, 2) as n;
select public.atribuir_a_todos('10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a3');
select public.ativar_plano('10000000-0000-4000-8000-000000000001',
  (select row_version from public.instrumento where id = '10000000-0000-4000-8000-000000000001'), gen_random_uuid());

reset role;
select set_config('testes.o1', (select o.id::text from public.ocorrencia as o
  join public.condicionante_versao as v on v.id = o.condicionante_versao_id
  where v.condicionante_id = '30000000-0000-4000-8000-000000000001'), true);
select set_config('testes.o2', (select o.id::text from public.ocorrencia as o
  join public.condicionante_versao as v on v.id = o.condicionante_versao_id
  where v.condicionante_id = '30000000-0000-4000-8000-000000000002'), true);

-- Arquivos já enviados ao Storage (simulados como dono)
insert into storage.objects (bucket_id, name, metadata)
select 'arquivos', 'c0000000-0000-4000-8000-00000000000a/evidencia/5000000' || n::text || '-0000-4000-8000-000000000000.pdf',
       '{"mimetype": "application/pdf", "size": 2048}'
from generate_series(1, 6) as n;

-- ---------------------------------------------------------------------------
-- Detalhe e etapas
-- ---------------------------------------------------------------------------
select testes.autenticar_como('bruno@filtroville.test');

select results_eq(
  $$select codigo, titulo, licenca, ciclo, situacao, responsavel_nome, conferencia_independente,
           prazo_oficial_original - hoje
    from public.obter_ocorrencia(current_setting('testes.o1')::uuid)$$,
  $$values ('4.1', 'Relatório 1', 'LAO 4821/2023', 1, 'aberta'::public.situacao_ocorrencia, 'Bruno Tavares', true, 5)$$,
  'o detalhe traz a origem (licença, condicionante, ciclo), o responsável e a política'
);

select lives_ok(
  $$select public.criar_etapa('60000000-0000-4000-8000-000000000001', current_setting('testes.o1')::uuid,
      'Coletar amostras', 'trabalho', 'd0000000-0000-4000-8000-0000000000a3', null,
      current_setting('testes.hoje')::date + 1, 4);
    select public.criar_etapa('60000000-0000-4000-8000-000000000002', current_setting('testes.o1')::uuid,
      'Aguardar laudo', 'espera_externa', null, 'Laboratório Ambiental Joinville', null, null);$$,
  'Equipe (Bruno) cria etapas de trabalho e de espera externa'
);

select is(
  public.criar_etapa('60000000-0000-4000-8000-000000000001', current_setting('testes.o1')::uuid,
    'Coletar amostras', 'trabalho', null, null, null, null),
  '60000000-0000-4000-8000-000000000001'::uuid,
  'repetir a criação da etapa devolve a mesma'
);

select lives_ok(
  $$select public.concluir_etapa('60000000-0000-4000-8000-000000000001')$$,
  'Equipe conclui a etapa'
);

select results_eq(
  $$select titulo, concluida_em is not null, responsavel_externo from public.etapa
    where ocorrencia_id = current_setting('testes.o1')::uuid order by posicao$$,
  $$values ('Coletar amostras', true, null::text), ('Aguardar laudo', false, 'Laboratório Ambiental Joinville')$$,
  'as etapas guardam ordem, conclusão e responsável externo'
);

-- ---------------------------------------------------------------------------
-- Evidência
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.enviar_evidencia(current_setting('testes.o1')::uuid, gen_random_uuid(), gen_random_uuid(),
      'c0000000-0000-4000-8000-00000000000a/evidencia/50000001-0000-4000-8000-000000000000.pdf',
      'relatorio.pdf', repeat('a', 64), current_setting('testes.hoje')::date + 1)$$,
  '22023', 'data_execucao_futura',
  'data real de execução no futuro é recusada'
);

select is(
  public.enviar_evidencia(current_setting('testes.o1')::uuid, '70000000-0000-4000-8000-000000000001',
    '50000001-0000-4000-8000-000000000000',
    'c0000000-0000-4000-8000-00000000000a/evidencia/50000001-0000-4000-8000-000000000000.pdf',
    'Relatório v1.pdf', repeat('a', 64), current_setting('testes.hoje')::date - 2),
  1,
  'Equipe envia a evidência (v1)'
);

select is(
  public.enviar_evidencia(current_setting('testes.o1')::uuid, '70000000-0000-4000-8000-000000000001',
    '50000001-0000-4000-8000-000000000000',
    'c0000000-0000-4000-8000-00000000000a/evidencia/50000001-0000-4000-8000-000000000000.pdf',
    'Relatório v1.pdf', repeat('a', 64), current_setting('testes.hoje')::date - 2),
  1,
  'reenviar o mesmo envio (retry) devolve a mesma versão'
);

select results_eq(
  $$select o.situacao, e.situacao, e.data_execucao = current_setting('testes.hoje')::date - 2, v.tamanho_bytes
    from public.ocorrencia as o
    join public.evidencia as e on e.ocorrencia_id = o.id
    join public.documento_versao as v on v.id = e.documento_versao_id
    where o.id = current_setting('testes.o1')::uuid$$,
  $$values ('em_conferencia'::public.situacao_ocorrencia, 'em_conferencia'::public.situacao_evidencia, true, 2048::bigint)$$,
  'upload deixa a ocorrência em conferência (não conclui) e guarda a data real'
);

select throws_ok(
  $$select public.enviar_evidencia(current_setting('testes.o1')::uuid, gen_random_uuid(),
      '50000002-0000-4000-8000-000000000000',
      'c0000000-0000-4000-8000-00000000000a/evidencia/50000002-0000-4000-8000-000000000000.pdf',
      'outro.pdf', repeat('b', 64), current_setting('testes.hoje')::date)$$,
  'P0001', 'aguardando_conferencia',
  'não envia outra evidência enquanto a anterior está em conferência'
);

-- ---------------------------------------------------------------------------
-- Conferente e conferência
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select throws_ok(
  $$select public.designar_conferente(current_setting('testes.o1')::uuid, 'd0000000-0000-4000-8000-0000000000a4')$$,
  '42501', 'sem_permissao',
  'Equipe (Ana) não designa conferente'
);

select throws_ok(
  $$select public.conferir_evidencia('70000000-0000-4000-8000-000000000001', 'aprovada', null)$$,
  '42501', 'sem_permissao',
  'sem conferente designado, Equipe não confere'
);

select testes.autenticar_como('eduardo@filtroville.test');

select lives_ok(
  $$select public.designar_conferente(current_setting('testes.o1')::uuid, 'd0000000-0000-4000-8000-0000000000a4')$$,
  'Gestão designa Camila como conferente'
);

select throws_ok(
  $$select public.conferir_evidencia('70000000-0000-4000-8000-000000000001', 'aprovada', null)$$,
  '42501', 'sem_permissao',
  'com conferente designado, nem a Gestão confere no lugar'
);

select testes.autenticar_como('camila@filtroville.test');

select throws_ok(
  $$select public.conferir_evidencia('70000000-0000-4000-8000-000000000001', 'devolvida', '  ')$$,
  '22023', 'motivo_obrigatorio',
  'devolver exige motivo'
);

select lives_ok(
  $$select public.conferir_evidencia('70000000-0000-4000-8000-000000000001', 'devolvida',
      'Faltam os laudos de pH de setembro.')$$,
  'a conferente devolve com motivo'
);

select results_eq(
  $$select o.situacao, e.situacao, c.motivo, m.nome
    from public.ocorrencia as o
    join public.evidencia as e on e.ocorrencia_id = o.id
    join public.conferencia as c on c.evidencia_id = e.id
    join public.membro as m on m.id = c.conferente_id
    where o.id = current_setting('testes.o1')::uuid$$,
  $$values ('aberta'::public.situacao_ocorrencia, 'devolvida'::public.situacao_evidencia,
            'Faltam os laudos de pH de setembro.', 'Camila Souza')$$,
  'devolvida: a ocorrência volta a aberta, com o motivo e quem decidiu'
);

select throws_ok(
  $$select public.conferir_evidencia('70000000-0000-4000-8000-000000000001', 'aprovada', null)$$,
  'P0001', 'evidencia_ja_conferida',
  'evidência já conferida não é conferida de novo'
);

select testes.autenticar_como('bruno@filtroville.test');

select is(
  public.enviar_evidencia(current_setting('testes.o1')::uuid, '70000000-0000-4000-8000-000000000002',
    '50000002-0000-4000-8000-000000000000',
    'c0000000-0000-4000-8000-00000000000a/evidencia/50000002-0000-4000-8000-000000000000.pdf',
    'Relatório v2.pdf', repeat('b', 64), current_setting('testes.hoje')::date - 1),
  2,
  'Equipe corrige e envia a v2'
);

select is(
  (select count(*) from public.evidencia where ocorrencia_id = current_setting('testes.o1')::uuid),
  2::bigint,
  'a v1 devolvida continua no histórico'
);

-- Independência: Bruno enviou a v2; mesmo designado, não confere.
select testes.autenticar_como('eduardo@filtroville.test');
select public.designar_conferente(current_setting('testes.o1')::uuid, 'd0000000-0000-4000-8000-0000000000a3');
select testes.autenticar_como('bruno@filtroville.test');

select throws_ok(
  $$select public.conferir_evidencia('70000000-0000-4000-8000-000000000002', 'aprovada', null)$$,
  'P0001', 'conferencia_independente',
  'quem enviou a evidência não confere (conferência independente)'
);

select testes.autenticar_como('eduardo@filtroville.test');
select public.designar_conferente(current_setting('testes.o1')::uuid, 'd0000000-0000-4000-8000-0000000000a4');
select testes.autenticar_como('camila@filtroville.test');

select lives_ok(
  $$select public.conferir_evidencia('70000000-0000-4000-8000-000000000002', 'aprovada', null)$$,
  'a conferente aprova a v2'
);

select is(
  (select situacao from public.ocorrencia where id = current_setting('testes.o1')::uuid),
  'em_conferencia'::public.situacao_ocorrencia,
  'aprovar não conclui'
);

-- ---------------------------------------------------------------------------
-- Conclusão
-- ---------------------------------------------------------------------------
select set_config('testes.versao',
  (select row_version::text from public.ocorrencia where id = current_setting('testes.o1')::uuid), true);

select throws_ok(
  $$select public.concluir_ocorrencia(current_setting('testes.o1')::uuid, current_setting('testes.versao')::integer)$$,
  '42501', 'sem_permissao',
  'a conferente (Equipe) não conclui'
);

select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.concluir_ocorrencia(current_setting('testes.o1')::uuid, 1)$$,
  'P0001', 'conflito_de_versao',
  'concluir com versão desatualizada é recusado'
);

select is(
  public.concluir_ocorrencia(current_setting('testes.o1')::uuid, current_setting('testes.versao')::integer),
  current_setting('testes.versao')::integer + 1,
  'Gestão conclui com a evidência aprovada'
);

select results_eq(
  $$select situacao, concluida_em is not null, concluida_sem_evidencia from public.ocorrencia
    where id = current_setting('testes.o1')::uuid$$,
  $$values ('concluida'::public.situacao_ocorrencia, true, false)$$,
  'a ocorrência fica concluída, com quem e quando'
);

select is(
  (select count(*) from public.listar_prazos('c0000000-0000-4000-8000-00000000000a')
   where id = current_setting('testes.o1')::uuid),
  0::bigint,
  'concluída sai da visão da equipe'
);

select testes.autenticar_como('bruno@filtroville.test');

select throws_ok(
  $$select public.enviar_evidencia(current_setting('testes.o1')::uuid, gen_random_uuid(),
      '50000003-0000-4000-8000-000000000000',
      'c0000000-0000-4000-8000-00000000000a/evidencia/50000003-0000-4000-8000-000000000000.pdf',
      'tarde.pdf', repeat('c', 64), current_setting('testes.hoje')::date)$$,
  'P0001', 'ocorrencia_concluida',
  'concluída bloqueia novos envios'
);

select throws_ok(
  $$select public.criar_etapa(gen_random_uuid(), current_setting('testes.o1')::uuid, 'Depois', 'trabalho',
      null, null, null, null)$$,
  'P0001', 'ocorrencia_concluida',
  'concluída bloqueia novas etapas'
);

-- Reabrir
select testes.autenticar_como('eduardo@filtroville.test');
select set_config('testes.versao',
  (select row_version::text from public.ocorrencia where id = current_setting('testes.o1')::uuid), true);

select throws_ok(
  $$select public.reabrir_ocorrencia(current_setting('testes.o1')::uuid, '', current_setting('testes.versao')::integer)$$,
  '22023', 'motivo_obrigatorio',
  'reabrir exige motivo'
);

select lives_ok(
  $$select public.reabrir_ocorrencia(current_setting('testes.o1')::uuid, 'Órgão pediu complemento',
      current_setting('testes.versao')::integer)$$,
  'Gestão reabre com motivo'
);

select results_eq(
  $$select situacao, concluida_em is null from public.ocorrencia where id = current_setting('testes.o1')::uuid$$,
  $$values ('aberta'::public.situacao_ocorrencia, true)$$,
  'reaberta volta a aberta e libera envios'
);

select ok(
  exists (
    select 1 from public.auditoria
    where entidade = 'ocorrencia' and entidade_id = current_setting('testes.o1')::uuid
      and motivo = 'Órgão pediu complemento' and depois ->> 'situacao' = 'aberta'
  ),
  'a reabertura fica na auditoria com o motivo'
);

-- ---------------------------------------------------------------------------
-- Sem conferente: Gestão confere; concluir sem evidência
-- ---------------------------------------------------------------------------
select testes.autenticar_como('bruno@filtroville.test');
select public.enviar_evidencia(current_setting('testes.o2')::uuid, '70000000-0000-4000-8000-000000000003',
  '50000004-0000-4000-8000-000000000000',
  'c0000000-0000-4000-8000-00000000000a/evidencia/50000004-0000-4000-8000-000000000000.pdf',
  'Relatório 2.pdf', repeat('d', 64), current_setting('testes.hoje')::date);
select testes.autenticar_como('eduardo@filtroville.test');

select lives_ok(
  $$select public.conferir_evidencia('70000000-0000-4000-8000-000000000003', 'devolvida', 'Ilegível')$$,
  'sem conferente designado, a Gestão confere'
);

select set_config('testes.versao',
  (select row_version::text from public.ocorrencia where id = current_setting('testes.o2')::uuid), true);

select throws_ok(
  $$select public.concluir_ocorrencia(current_setting('testes.o2')::uuid, current_setting('testes.versao')::integer)$$,
  'P0001', 'evidencia_nao_aprovada',
  'sem evidência aprovada, concluir normal é recusado'
);

select throws_ok(
  $$select public.concluir_sem_evidencia(current_setting('testes.o2')::uuid, ' ', current_setting('testes.versao')::integer)$$,
  '22023', 'justificativa_obrigatoria',
  'concluir sem evidência exige justificativa'
);

select testes.autenticar_como('bruno@filtroville.test');

select throws_ok(
  $$select public.concluir_sem_evidencia(current_setting('testes.o2')::uuid, 'Atalho',
      current_setting('testes.versao')::integer)$$,
  '42501', 'sem_permissao',
  'Equipe não conclui sem evidência'
);

select testes.autenticar_como('eduardo@filtroville.test');

select lives_ok(
  $$select public.concluir_sem_evidencia(current_setting('testes.o2')::uuid, 'Atividade suspensa pelo órgão',
      current_setting('testes.versao')::integer)$$,
  'Gestão conclui sem evidência, com justificativa'
);

select results_eq(
  $$select situacao, concluida_sem_evidencia from public.ocorrencia where id = current_setting('testes.o2')::uuid$$,
  $$values ('concluida'::public.situacao_ocorrencia, true)$$,
  'a conclusão sem evidência fica marcada'
);

select results_eq(
  $$select tipo, evidencia_numero, detalhe from public.ocorrencia_historico
    where ocorrencia_id = current_setting('testes.o2')::uuid order by id$$,
  $$values ('evidencia_enviada', 1, null::text), ('evidencia_devolvida', 1, 'Ilegível'),
           ('concluida_sem_evidencia', null::integer, 'Atividade suspensa pelo órgão')$$,
  'o histórico registra cada passo, com motivo e justificativa'
);

reset role;

select throws_ok(
  $$update public.ocorrencia_historico set detalhe = 'adulterado'$$,
  '42501', null,
  'o histórico é append-only, nem o dono altera'
);

-- ---------------------------------------------------------------------------
-- Isolamento
-- ---------------------------------------------------------------------------
select testes.autenticar_como('helena@verdesul.test');

select results_eq(
  $$select (select count(*) from public.etapa), (select count(*) from public.evidencia),
           (select count(*) from public.conferencia), (select count(*) from public.ocorrencia_historico),
           (select count(*) from public.obter_ocorrencia(current_setting('testes.o1')::uuid))$$,
  $$values (0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint)$$,
  'Helena (B) recebe zero etapas, evidências, conferências, histórico e detalhe de A'
);

select throws_ok(
  $$select public.criar_etapa(gen_random_uuid(), current_setting('testes.o1')::uuid, 'Intrusa', 'trabalho',
      null, null, null, null)$$,
  '42501', 'sem_permissao',
  'Helena (B) não cria etapa em ocorrência de A'
);

select * from finish();

rollback;
