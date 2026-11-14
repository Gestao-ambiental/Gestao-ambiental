-- Vistoria móvel (ADR-0029; CAMPO-01): agendar idempotente, iniciar, registrar itens com comentário
-- obrigatório, foto com localização coerente e idempotente, enviar só sem pendências, conferência
-- independente, devolver com motivo e reabrir o registro, aprovar, cancelar só pela Gestão,
-- ocorrência concluída recusa agendar, Equipe que não é responsável não registra; outra
-- consultoria lê zero e não registra; regra do 020 nas tabelas novas.
begin;

select plan(51);

select testes.criar_dados_sinteticos();
select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('e4800000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a',
        'Metalúrgica Rio Cubatão', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome, endereco)
values ('e4810000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a',
        'e4800000-0000-4000-8000-000000000001', 'Matriz', 'Rua Dona Francisca, 8300, Joinville/SC');

-- Licença ativa com duas obrigações únicas (em 5 e 10 dias), responsável Bruno.
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_instrumento('e4820000-0000-4000-8000-000000000001', 'e4810000-0000-4000-8000-000000000001');
select public.salvar_identificacao('e4820000-0000-4000-8000-000000000001', 1, 'e4810000-0000-4000-8000-000000000001',
  (select id from public.tipo_instrumento where sigla = 'LAO' and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  '4821/2023', 'IMA', null, current_setting('testes.hoje')::date - 30, null, null, 'assinatura',
  current_setting('testes.hoje')::date + 400);
select public.salvar_condicionante(('e4830000-0000-4000-8000-00000000000' || n::text)::uuid,
  'e4820000-0000-4000-8000-000000000001', null, '4.' || n::text, 'Relatório ' || n::text, '', 'obrigacao')
from generate_series(1, 2) as n;
select public.confirmar_prazo(('e4830000-0000-4000-8000-00000000000' || n::text)::uuid, 'unica', null, null,
  'corridos', null, current_setting('testes.hoje')::date + 5 * n, 'Documento')
from generate_series(1, 2) as n;
select public.atribuir_a_todos('e4820000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a3');
select public.ativar_plano('e4820000-0000-4000-8000-000000000001',
  (select row_version from public.instrumento where id = 'e4820000-0000-4000-8000-000000000001'), gen_random_uuid());

reset role;
select set_config('testes.o1', (select o.id::text from public.ocorrencia as o
  join public.condicionante_versao as v on v.id = o.condicionante_versao_id
  where v.condicionante_id = 'e4830000-0000-4000-8000-000000000001'), true);
select set_config('testes.o2', (select o.id::text from public.ocorrencia as o
  join public.condicionante_versao as v on v.id = o.condicionante_versao_id
  where v.condicionante_id = 'e4830000-0000-4000-8000-000000000002'), true);

-- Fotos já enviadas ao Storage (simuladas como dono)
insert into storage.objects (bucket_id, name, metadata) values
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/vistoria/e4840000-0000-4000-8000-000000000001.jpg',
   '{"mimetype": "image/jpeg", "size": 345678}'),
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/vistoria/e4840000-0000-4000-8000-000000000002.png',
   '{"mimetype": "image/png", "size": 1024}');

-- ---------------------------------------------------------------------------
-- Regra do 020 nas tabelas novas
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from pg_catalog.pg_class as c
   join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('vistoria', 'vistoria_item', 'vistoria_foto', 'vistoria_decisao')
     and c.relrowsecurity and c.relforcerowsecurity
     and exists (select 1 from pg_catalog.pg_policy as p where p.polrelid = c.oid)
     and exists (select 1 from pg_catalog.pg_trigger as t where t.tgrelid = c.oid and t.tgname = '_suporte_somente_leitura')
     and exists (select 1 from pg_catalog.pg_trigger as t where t.tgrelid = c.oid and t.tgname = '_comercial_somente_leitura')
     and exists (select 1 from pg_catalog.pg_trigger as t where t.tgrelid = c.oid and t.tgname = c.relname || '_auditar')),
  4::bigint,
  'as 4 tabelas de vistoria têm RLS forçada, política, auditoria e as barreiras de suporte e comercial'
);

-- ---------------------------------------------------------------------------
-- Agendar (Equipe agenda para o Bruno)
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select is(
  public.criar_vistoria('e4850000-0000-4000-8000-000000000001', current_setting('testes.o1')::uuid,
    ' Vistoria da ETE ', 'Conferir a estação de tratamento', 'd0000000-0000-4000-8000-0000000000a3',
    current_setting('testes.hoje')::date, '09:30', 90,
    '[{"titulo": "Placa de identificação", "descricao": "Visível na entrada"},
      {"titulo": "Caixa separadora"}, {"titulo": "Bacia de contenção", "descricao": ""}]'::jsonb),
  'e4850000-0000-4000-8000-000000000001'::uuid,
  'Equipe agenda a vistoria com três itens'
);

select is(
  public.criar_vistoria('e4850000-0000-4000-8000-000000000001', current_setting('testes.o1')::uuid,
    'Outra', null, 'd0000000-0000-4000-8000-0000000000a3', current_setting('testes.hoje')::date, null, null,
    '[{"titulo": "x"}]'::jsonb),
  'e4850000-0000-4000-8000-000000000001'::uuid,
  'repetir o agendamento devolve a mesma vistoria'
);

select results_eq(
  $$select v.titulo, v.situacao, v.hora_planejada, v.row_version,
           (select count(*) from public.vistoria_item as i where i.vistoria_id = v.id),
           (select string_agg(coalesce(i.descricao, '-'), '|' order by i.posicao) from public.vistoria_item as i where i.vistoria_id = v.id)
    from public.vistoria as v where v.id = 'e4850000-0000-4000-8000-000000000001'$$,
  $$values ('Vistoria da ETE', 'planejada'::public.situacao_vistoria, '09:30'::time, 1, 3::bigint,
            'Visível na entrada|-|-')$$,
  'grava título aparado, hora, itens na ordem e não duplica ao repetir'
);

select throws_ok(
  $$select public.criar_vistoria(gen_random_uuid(), current_setting('testes.o1')::uuid, 'Sem itens', null,
      'd0000000-0000-4000-8000-0000000000a3', current_setting('testes.hoje')::date, null, null, '[]')$$,
  '22023', 'itens_obrigatorios',
  'vistoria sem itens é recusada'
);

select is(
  (select count(*) from public.ocorrencia_historico
   where ocorrencia_id = current_setting('testes.o1')::uuid and tipo = 'vistoria_agendada'),
  1::bigint,
  'o agendamento entra no histórico da ocorrência uma vez'
);

-- Equipe que não é a responsável não inicia nem registra
select throws_ok(
  $$select public.iniciar_vistoria('e4850000-0000-4000-8000-000000000001')$$,
  '42501', 'sem_permissao',
  'Equipe que não é responsável não inicia'
);

-- ---------------------------------------------------------------------------
-- Iniciar e registrar (Bruno, responsável)
-- ---------------------------------------------------------------------------
select testes.autenticar_como('bruno@filtroville.test');
reset role;
select set_config('testes.i1', (select id::text from public.vistoria_item
  where vistoria_id = 'e4850000-0000-4000-8000-000000000001' and posicao = 1), true);
select set_config('testes.i2', (select id::text from public.vistoria_item
  where vistoria_id = 'e4850000-0000-4000-8000-000000000001' and posicao = 2), true);
select set_config('testes.i3', (select id::text from public.vistoria_item
  where vistoria_id = 'e4850000-0000-4000-8000-000000000001' and posicao = 3), true);
select testes.autenticar_como('bruno@filtroville.test');

select throws_ok(
  $$select public.registrar_item_da_vistoria(current_setting('testes.i1')::uuid, 'conforme', null)$$,
  'P0001', 'vistoria_nao_iniciada',
  'não registra antes de iniciar'
);

select is(public.iniciar_vistoria('e4850000-0000-4000-8000-000000000001'), 2, 'responsável inicia a vistoria');
select is(public.iniciar_vistoria('e4850000-0000-4000-8000-000000000001'), 2, 'iniciar de novo não muda nada');

select throws_ok(
  $$select public.registrar_item_da_vistoria(current_setting('testes.i1')::uuid, 'nao_conforme', '  ')$$,
  '22023', 'comentario_obrigatorio',
  'não conforme sem comentário é recusado'
);

select throws_ok(
  $$select public.registrar_item_da_vistoria(current_setting('testes.i1')::uuid, 'requer_avaliacao', null)$$,
  '22023', 'comentario_obrigatorio',
  'requer avaliação sem comentário é recusado'
);

select lives_ok(
  $$select public.registrar_item_da_vistoria(current_setting('testes.i1')::uuid, 'conforme', null);
    select public.registrar_item_da_vistoria(current_setting('testes.i2')::uuid, 'nao_conforme', 'Óleo acumulado');
    select public.salvar_observacao_da_vistoria('e4850000-0000-4000-8000-000000000001', 'Chuva forte no dia');$$,
  'responsável registra itens e a observação geral'
);

select results_eq(
  $$select resultado, comentario, registrado_por, registrado_em is not null from public.vistoria_item
    where vistoria_id = 'e4850000-0000-4000-8000-000000000001' order by posicao$$,
  $$values ('conforme'::public.resultado_item_vistoria, null::text, 'd0000000-0000-4000-8000-0000000000a3'::uuid, true),
           ('nao_conforme', 'Óleo acumulado', 'd0000000-0000-4000-8000-0000000000a3', true),
           ('pendente', null, null, false)$$,
  'os itens guardam resultado, comentário e quem registrou'
);

-- ---------------------------------------------------------------------------
-- Fotos
-- ---------------------------------------------------------------------------
select is(
  public.adicionar_foto_da_vistoria('e4840000-0000-4000-8000-000000000001', current_setting('testes.i1')::uuid,
    'c0000000-0000-4000-8000-00000000000a/vistoria/e4840000-0000-4000-8000-000000000001.jpg', 'IMG_0001.jpg',
    repeat('A', 64), 'Placa na entrada', now() - interval '1 minute', -26.304408, -48.848747, 8.5, 'aparelho', null),
  'e4840000-0000-4000-8000-000000000001'::uuid,
  'responsável vincula a foto com a localização do aparelho'
);

select is(
  public.adicionar_foto_da_vistoria('e4840000-0000-4000-8000-000000000001', current_setting('testes.i1')::uuid,
    'c0000000-0000-4000-8000-00000000000a/vistoria/e4840000-0000-4000-8000-000000000001.jpg', 'IMG_0001.jpg',
    repeat('a', 64), 'Placa na entrada', now(), -26.304408, -48.848747, 8.5, 'aparelho', null),
  'e4840000-0000-4000-8000-000000000001'::uuid,
  'repetir o vínculo (retry) devolve a mesma foto'
);

select results_eq(
  $$select count(*), min(mime), min(tamanho_bytes), min(sha256), min(latitude), min(autor_id::text)
    from public.vistoria_foto where vistoria_id = 'e4850000-0000-4000-8000-000000000001'$$,
  $$values (1::bigint, 'image/jpeg'::text, 345678::bigint, repeat('a', 64), -26.304408::numeric,
            'd0000000-0000-4000-8000-0000000000a3'::text)$$,
  'uma foto só, com mime e tamanho lidos do Storage'
);

select throws_ok(
  $$select public.adicionar_foto_da_vistoria(gen_random_uuid(), current_setting('testes.i2')::uuid,
      'c0000000-0000-4000-8000-00000000000a/vistoria/e4840000-0000-4000-8000-000000000002.png', 'x.png',
      repeat('b', 64), null, now(), null, null, null, 'aparelho', null)$$,
  '22023', 'local_invalido',
  'origem "aparelho" sem coordenada é recusada'
);

select throws_ok(
  $$select public.adicionar_foto_da_vistoria(gen_random_uuid(), current_setting('testes.i2')::uuid,
      'c0000000-0000-4000-8000-00000000000a/vistoria/e4840000-0000-4000-8000-000000000002.png', 'x.png',
      repeat('b', 64), null, now(), null, null, null, 'nenhum', 'Portão 2')$$,
  '22023', 'local_invalido',
  'origem "nenhum" com local descrito é recusada'
);

select throws_ok(
  $$select public.adicionar_foto_da_vistoria(gen_random_uuid(), current_setting('testes.i2')::uuid,
      'c0000000-0000-4000-8000-00000000000a/vistoria/e4840000-0000-4000-8000-000000000002.png', 'x.png',
      repeat('b', 64), null, now() + interval '10 minutes', null, null, null, 'manual', 'Portão 2')$$,
  '22023', 'captura_no_futuro',
  'hora de captura além de agora + 5 min é recusada'
);

select throws_ok(
  $$select public.adicionar_foto_da_vistoria(gen_random_uuid(), current_setting('testes.i2')::uuid,
      'c0000000-0000-4000-8000-00000000000a/vistoria/e4840000-0000-4000-8000-000000000009.jpg', 'x.jpg',
      repeat('b', 64), null, now(), null, null, null, 'nenhum', null)$$,
  'P0001', 'arquivo_nao_encontrado',
  'foto que não está no Storage é recusada'
);

-- ---------------------------------------------------------------------------
-- Enviar
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.enviar_vistoria('e4850000-0000-4000-8000-000000000001', 2)$$,
  'P0001', 'itens_pendentes',
  'enviar com item pendente é recusado'
);

select lives_ok(
  $$select public.registrar_item_da_vistoria(current_setting('testes.i3')::uuid, 'nao_aplicavel', null)$$,
  'registra o último item'
);

select throws_ok(
  $$select public.enviar_vistoria('e4850000-0000-4000-8000-000000000001', 1)$$,
  'P0001', 'conflito_de_versao',
  'enviar com versão antiga é recusado'
);

select is(public.enviar_vistoria('e4850000-0000-4000-8000-000000000001', 2), 3, 'responsável envia para conferência');
select is(public.enviar_vistoria('e4850000-0000-4000-8000-000000000001', 2), 3, 'reenviar (retry) devolve a mesma versão');

select is(
  (select count(*) from public.ocorrencia_historico
   where ocorrencia_id = current_setting('testes.o1')::uuid and tipo = 'vistoria_enviada'),
  1::bigint,
  'o envio entra no histórico uma vez'
);

select throws_ok(
  $$select public.registrar_item_da_vistoria(current_setting('testes.i3')::uuid, 'conforme', null)$$,
  'P0001', 'vistoria_fechada',
  'vistoria enviada não aceita registro'
);

-- ---------------------------------------------------------------------------
-- Conferir: independência, devolver com motivo, novo envio e aprovar
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');
select public.designar_conferente(current_setting('testes.o1')::uuid, 'd0000000-0000-4000-8000-0000000000a3');

select testes.autenticar_como('bruno@filtroville.test');
select throws_ok(
  $$select public.conferir_vistoria('e4850000-0000-4000-8000-000000000001', 'aprovada', null, 3)$$,
  'P0001', 'conferencia_independente',
  'quem registrou a vistoria não confere (independência)'
);

select testes.autenticar_como('eduardo@filtroville.test');
select throws_ok(
  $$select public.conferir_vistoria('e4850000-0000-4000-8000-000000000001', 'aprovada', null, 3)$$,
  '42501', 'sem_permissao',
  'com conferente designado, a Gestão não confere no lugar dele'
);

select public.designar_conferente(current_setting('testes.o1')::uuid, null);

select is(
  (select pode_conferir from public.obter_vistoria('e4850000-0000-4000-8000-000000000001')),
  true,
  'sem designação, a Gestão pode conferir'
);

select throws_ok(
  $$select public.conferir_vistoria('e4850000-0000-4000-8000-000000000001', 'devolvida', '  ', 3)$$,
  '22023', 'motivo_obrigatorio',
  'devolver sem motivo é recusado'
);

select is(
  public.conferir_vistoria('e4850000-0000-4000-8000-000000000001', 'devolvida', 'Falta foto da caixa separadora', 3),
  4,
  'Gestão devolve com motivo'
);

select testes.autenticar_como('bruno@filtroville.test');

select results_eq(
  $$select situacao, pode_registrar, pode_conferir, ultima_decisao, ultima_decisao_motivo
    from public.obter_vistoria('e4850000-0000-4000-8000-000000000001')$$,
  $$values ('devolvida'::public.situacao_vistoria, true, false, 'devolvida'::public.decisao_conferencia,
            'Falta foto da caixa separadora'::text)$$,
  'devolvida volta a aceitar registro e mostra a última decisão'
);

select lives_ok(
  $$select public.adicionar_foto_da_vistoria('e4840000-0000-4000-8000-000000000002', current_setting('testes.i2')::uuid,
      'c0000000-0000-4000-8000-00000000000a/vistoria/e4840000-0000-4000-8000-000000000002.png', 'caixa.png',
      repeat('c', 64), 'Caixa separadora', now(), null, null, null, 'manual', 'Fundos, ao lado do galpão 2');
    select public.registrar_item_da_vistoria(current_setting('testes.i2')::uuid, 'requer_avaliacao', 'Avaliar com o laboratório');
    select public.excluir_foto_da_vistoria('e4840000-0000-4000-8000-000000000001');$$,
  'depois de devolvida, o responsável registra, vincula foto e exclui outra'
);

select results_eq(
  $$select id, excluida_em is not null, local_origem, local_manual from public.vistoria_foto
    where vistoria_id = 'e4850000-0000-4000-8000-000000000001' order by id$$,
  $$values ('e4840000-0000-4000-8000-000000000001'::uuid, true, 'aparelho'::text, null::text),
           ('e4840000-0000-4000-8000-000000000002', false, 'manual', 'Fundos, ao lado do galpão 2')$$,
  'a exclusão da foto é lógica'
);

select is(public.enviar_vistoria('e4850000-0000-4000-8000-000000000001', 4), 5, 'responsável reenvia');

select testes.autenticar_como('eduardo@filtroville.test');
select is(
  public.conferir_vistoria('e4850000-0000-4000-8000-000000000001', 'aprovada', null, 5),
  6,
  'Gestão aprova o novo envio'
);

select throws_ok(
  $$select public.conferir_vistoria('e4850000-0000-4000-8000-000000000001', 'aprovada', null, 6)$$,
  'P0001', 'vistoria_ja_conferida',
  'vistoria já aprovada não é conferida de novo'
);

select results_eq(
  $$select decisao, conferente_id from public.vistoria_decisao
    where vistoria_id = 'e4850000-0000-4000-8000-000000000001' order by decidida_em$$,
  $$values ('devolvida'::public.decisao_conferencia, 'd0000000-0000-4000-8000-0000000000a1'::uuid),
           ('aprovada', 'd0000000-0000-4000-8000-0000000000a1')$$,
  'cada envio tem a sua decisão (append-only)'
);

select testes.autenticar_como('bruno@filtroville.test');

select results_eq(
  $$select situacao, pode_registrar, licenca, empreendimento_nome, unidade_endereco, condicionante_codigo,
           ultima_decisao, hoje = current_setting('testes.hoje')::date
    from public.obter_vistoria('e4850000-0000-4000-8000-000000000001')$$,
  $$values ('aprovada'::public.situacao_vistoria, false, 'LAO 4821/2023'::text, 'Metalúrgica Rio Cubatão'::text,
            'Rua Dona Francisca, 8300, Joinville/SC'::text, '4.1'::text, 'aprovada'::public.decisao_conferencia, true)$$,
  'o detalhe traz o contexto e a aprovação'
);

select results_eq(
  $$select titulo, responsavel_nome, total_itens, itens_registrados, licenca, total::integer
    from public.listar_vistorias(null, true)$$,
  $$values ('Vistoria da ETE'::text, 'Bruno Tavares'::text, 3, 3, 'LAO 4821/2023'::text, 1)$$,
  'minhas vistorias traz a vistoria com o progresso'
);

-- ---------------------------------------------------------------------------
-- Cancelar (só a Gestão, com motivo) e ocorrência concluída
-- ---------------------------------------------------------------------------
select public.criar_vistoria('e4850000-0000-4000-8000-000000000002', current_setting('testes.o1')::uuid,
  'Retorno', null, 'd0000000-0000-4000-8000-0000000000a3', current_setting('testes.hoje')::date + 7, null, 30,
  '[{"titulo": "Caixa separadora"}]'::jsonb);

select throws_ok(
  $$select public.cancelar_vistoria('e4850000-0000-4000-8000-000000000002', 'Não precisa', 1)$$,
  '42501', 'sem_permissao',
  'Equipe não cancela vistoria'
);

select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.cancelar_vistoria('e4850000-0000-4000-8000-000000000002', '', 1)$$,
  '22023', 'motivo_obrigatorio',
  'cancelar sem motivo é recusado'
);

select is(
  public.cancelar_vistoria('e4850000-0000-4000-8000-000000000002', 'Cliente remarcou', 1),
  2,
  'Gestão cancela com motivo'
);

select public.concluir_sem_evidencia(current_setting('testes.o2')::uuid, 'Dispensada pelo órgão',
  (select row_version from public.ocorrencia where id = current_setting('testes.o2')::uuid));

select throws_ok(
  $$select public.criar_vistoria(gen_random_uuid(), current_setting('testes.o2')::uuid, 'Tarde demais', null,
      'd0000000-0000-4000-8000-0000000000a3', current_setting('testes.hoje')::date, null, null,
      '[{"titulo": "x"}]')$$,
  'P0001', 'ocorrencia_concluida',
  'ocorrência concluída não aceita vistoria nova'
);

reset role;
select results_eq(
  $$select tipo from public.ocorrencia_historico
    where ocorrencia_id = current_setting('testes.o1')::uuid and tipo like 'vistoria_%' order by id$$,
  $$values ('vistoria_agendada'::text), ('vistoria_enviada'), ('vistoria_devolvida'), ('vistoria_enviada'),
           ('vistoria_aprovada'), ('vistoria_agendada'), ('vistoria_cancelada')$$,
  'a linha do tempo da ocorrência registra agendar, enviar, devolver, aprovar e cancelar'
);

select throws_ok(
  $$update public.vistoria_foto set legenda = 'trocada' where id = 'e4840000-0000-4000-8000-000000000002'$$,
  '42501', 'vistoria_foto_imutavel',
  'a foto é imutável, nem o dono altera'
);

-- ---------------------------------------------------------------------------
-- Outra consultoria (Verde Sul) lê zero e não registra
-- ---------------------------------------------------------------------------
select testes.autenticar_como('gustavo@verdesul.test');

select results_eq(
  $$select (select count(*) from public.vistoria) + (select count(*) from public.vistoria_item)
         + (select count(*) from public.vistoria_foto) + (select count(*) from public.vistoria_decisao)
         + (select count(*) from public.listar_vistorias())
         + (select count(*) from public.listar_vistorias(current_setting('testes.o1')::uuid))
         + (select count(*) from public.obter_vistoria('e4850000-0000-4000-8000-000000000001'))$$,
  $$values (0::bigint)$$,
  'outra consultoria lê zero linhas das 4 tabelas, da lista e do detalhe'
);

select throws_ok(
  $$select public.registrar_item_da_vistoria(current_setting('testes.i1')::uuid, 'conforme', null)$$,
  '42501', 'sem_permissao',
  'outra consultoria não registra item'
);

select throws_ok(
  $$select public.criar_vistoria(gen_random_uuid(), current_setting('testes.o1')::uuid, 'Invasão', null,
      'd0000000-0000-4000-8000-0000000000b1', current_setting('testes.hoje')::date, null, null, '[{"titulo": "x"}]')$$,
  '42501', 'sem_permissao',
  'outra consultoria não agenda na ocorrência alheia'
);

select * from finish();

rollback;
