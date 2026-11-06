-- Ocorrência na visão de quem executa (Tela 16 v2; DEM-01, DEM-03, DEM-09): envio com vários
-- arquivos e observações, cancelar envio, reenvio mantendo arquivos, comentários com menção,
-- prorrogação com ofício, pedido de encerramento, meta interna e atividade. Isolamento entre
-- consultorias nas tabelas novas.
begin;

select plan(40);

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

-- Arquivos já enviados ao Storage (simulados como dono): 4 de evidência e 2 de prorrogação.
insert into storage.objects (bucket_id, name, metadata) values
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/evidencia/50000001-0000-4000-8000-000000000000.pdf',
   '{"mimetype": "application/pdf", "size": 2048}'),
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/evidencia/50000002-0000-4000-8000-000000000000.jpg',
   '{"mimetype": "image/jpeg", "size": 4096}'),
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/evidencia/50000003-0000-4000-8000-000000000000.png',
   '{"mimetype": "image/png", "size": 1024}'),
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/evidencia/50000004-0000-4000-8000-000000000000.pdf',
   '{"mimetype": "application/pdf", "size": 512}'),
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/prorrogacao/60000001-0000-4000-8000-000000000000.pdf',
   '{"mimetype": "application/pdf", "size": 2048}'),
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/prorrogacao/60000002-0000-4000-8000-000000000000.png',
   '{"mimetype": "image/png", "size": 2048}');

create function pg_temp.arquivo(n integer, ext text)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'versao_id', '5000000' || n || '-0000-4000-8000-000000000000',
    'caminho', 'c0000000-0000-4000-8000-00000000000a/evidencia/5000000' || n || '-0000-4000-8000-000000000000.' || ext,
    'nome_original', 'arquivo-' || n || '.' || ext,
    'sha256', repeat(n::text, 64))
$$;
grant execute on function pg_temp.arquivo(integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Envio com vários arquivos
-- ---------------------------------------------------------------------------
select testes.autenticar_como('bruno@filtroville.test');

select throws_ok(
  $$select public.enviar_evidencia(current_setting('testes.o1')::uuid, gen_random_uuid(),
      current_setting('testes.hoje')::date, null, '[]', null)$$,
  '22023', 'arquivos_obrigatorios',
  'envio sem nenhum arquivo é recusado'
);

select is(
  public.enviar_evidencia(current_setting('testes.o1')::uuid, '71000000-0000-4000-8000-000000000001',
    current_setting('testes.hoje')::date - 1, '  Limpeza feita pela Limpatec.  ',
    jsonb_build_array(pg_temp.arquivo(1, 'pdf'), pg_temp.arquivo(2, 'jpg')), null),
  1,
  'Bruno envia dois arquivos com observações (v1)'
);

select is(
  public.enviar_evidencia(current_setting('testes.o1')::uuid, '71000000-0000-4000-8000-000000000001',
    current_setting('testes.hoje')::date - 1, 'Limpeza feita pela Limpatec.',
    jsonb_build_array(pg_temp.arquivo(1, 'pdf'), pg_temp.arquivo(2, 'jpg')), null),
  1,
  'repetir o mesmo envio (retry) não duplica'
);

select results_eq(
  $$select o.situacao, e.observacoes, (select count(*) from public.evidencia_arquivo as a where a.evidencia_id = e.id),
           (select array_agg(v.mime order by a.posicao) from public.evidencia_arquivo as a
            join public.documento_versao as v on v.id = a.documento_versao_id where a.evidencia_id = e.id)
    from public.ocorrencia as o join public.evidencia as e on e.ocorrencia_id = o.id
    where o.id = current_setting('testes.o1')::uuid$$,
  $$values ('em_conferencia'::public.situacao_ocorrencia, 'Limpeza feita pela Limpatec.', 2::bigint,
            array['application/pdf', 'image/jpeg'])$$,
  'o envio guarda os arquivos em ordem, com o tipo lido do Storage, e as observações'
);

-- ---------------------------------------------------------------------------
-- Cancelar envio
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select throws_ok(
  $$select public.cancelar_envio('71000000-0000-4000-8000-000000000001')$$,
  '42501', 'sem_permissao',
  'só quem enviou cancela o envio'
);

select testes.autenticar_como('bruno@filtroville.test');

select lives_ok(
  $$select public.cancelar_envio('71000000-0000-4000-8000-000000000001')$$,
  'quem enviou cancela enquanto ninguém conferiu'
);

select lives_ok(
  $$select public.cancelar_envio('71000000-0000-4000-8000-000000000001')$$,
  'cancelar de novo não faz nada'
);

select results_eq(
  $$select o.situacao, e.situacao, e.cancelada_em is not null, e.cancelada_por
    from public.ocorrencia as o join public.evidencia as e on e.ocorrencia_id = o.id
    where o.id = current_setting('testes.o1')::uuid$$,
  $$values ('aberta'::public.situacao_ocorrencia, 'cancelada'::public.situacao_evidencia, true,
            'd0000000-0000-4000-8000-0000000000a3'::uuid)$$,
  'cancelar volta para A fazer e marca o envio como cancelado'
);

-- ---------------------------------------------------------------------------
-- Reenvio mantendo arquivos do envio anterior
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.enviar_evidencia(current_setting('testes.o2')::uuid, gen_random_uuid(),
      current_setting('testes.hoje')::date, null, null, array['50000001-0000-4000-8000-000000000000'::uuid])$$,
  'P0001', 'arquivo_nao_encontrado',
  'não mantém arquivo de envio de outra ocorrência'
);

select is(
  public.enviar_evidencia(current_setting('testes.o1')::uuid, '71000000-0000-4000-8000-000000000002',
    current_setting('testes.hoje')::date, null, jsonb_build_array(pg_temp.arquivo(3, 'png')),
    array['50000001-0000-4000-8000-000000000000'::uuid]),
  2,
  'reenvio (v2) mantém o PDF do envio anterior e acrescenta uma foto'
);

select results_eq(
  $$select a.documento_versao_id::text, a.posicao from public.evidencia_arquivo as a
    where a.evidencia_id = '71000000-0000-4000-8000-000000000002' order by a.posicao$$,
  $$values ('50000001-0000-4000-8000-000000000000', 1), ('50000003-0000-4000-8000-000000000000', 2)$$,
  'o arquivo mantido é a mesma versão imutável, sem novo upload'
);

select testes.autenticar_como('eduardo@filtroville.test');
select public.conferir_evidencia('71000000-0000-4000-8000-000000000002', 'devolvida', 'Faltam fotos da caixa 2');
select testes.autenticar_como('bruno@filtroville.test');

select throws_ok(
  $$select public.cancelar_envio('71000000-0000-4000-8000-000000000002')$$,
  'P0001', 'evidencia_ja_conferida',
  'envio já conferido não pode ser cancelado'
);

-- ---------------------------------------------------------------------------
-- Comentários
-- ---------------------------------------------------------------------------
select isnt(
  public.comentar_ocorrencia('72000000-0000-4000-8000-000000000001', current_setting('testes.o1')::uuid,
    '@Ana Ribeiro pedi a NF para a Limpatec.', array['d0000000-0000-4000-8000-0000000000a2'::uuid]),
  null,
  'Bruno comenta mencionando Ana'
);

select is(
  public.comentar_ocorrencia('72000000-0000-4000-8000-000000000001', current_setting('testes.o1')::uuid,
    '@Ana Ribeiro pedi a NF para a Limpatec.', array['d0000000-0000-4000-8000-0000000000a2'::uuid]),
  (select h.id from public.ocorrencia_historico as h where h.chave = '72000000-0000-4000-8000-000000000001'),
  'repetir o comentário com a mesma chave não duplica'
);

select results_eq(
  $$select h.tipo, h.detalhe, h.ator_id::text, h.dados -> 'mencoes'
    from public.ocorrencia_historico as h where h.chave = '72000000-0000-4000-8000-000000000001'$$,
  $$values ('comentario', '@Ana Ribeiro pedi a NF para a Limpatec.', 'd0000000-0000-4000-8000-0000000000a3',
            '["d0000000-0000-4000-8000-0000000000a2"]'::jsonb)$$,
  'o comentário guarda autor, texto e menções'
);

select throws_ok(
  $$select public.comentar_ocorrencia(gen_random_uuid(), current_setting('testes.o1')::uuid, 'Olá',
      array['d0000000-0000-4000-8000-0000000000b2'::uuid])$$,
  '22023', 'mencao_invalida',
  'não menciona pessoa de outra consultoria'
);

select throws_ok(
  $$select public.comentar_ocorrencia(gen_random_uuid(), current_setting('testes.o1')::uuid, '   ', null)$$,
  '22023', 'comentario_obrigatorio',
  'comentário vazio é recusado'
);

-- ---------------------------------------------------------------------------
-- Prorrogação com ofício
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.registrar_prorrogacao(gen_random_uuid(), current_setting('testes.o2')::uuid, '1123/2026',
      current_setting('testes.hoje')::date, '60000001-0000-4000-8000-000000000000',
      'c0000000-0000-4000-8000-00000000000a/prorrogacao/60000001-0000-4000-8000-000000000000.pdf',
      'oficio.pdf', repeat('c', 64))$$,
  '22023', 'novo_prazo_no_passado',
  'o novo prazo oficial precisa ser futuro'
);

select throws_ok(
  $$select public.registrar_prorrogacao(gen_random_uuid(), current_setting('testes.o2')::uuid, '1123/2026',
      current_setting('testes.hoje')::date + 60, '60000002-0000-4000-8000-000000000000',
      'c0000000-0000-4000-8000-00000000000a/prorrogacao/60000002-0000-4000-8000-000000000000.png',
      'oficio.png', repeat('c', 64))$$,
  '22023', 'arquivo_tipo_invalido',
  'o ofício precisa ser PDF'
);

select throws_ok(
  $$select public.registrar_prorrogacao(gen_random_uuid(), current_setting('testes.o2')::uuid, '  ',
      current_setting('testes.hoje')::date + 60, '60000001-0000-4000-8000-000000000000',
      'c0000000-0000-4000-8000-00000000000a/prorrogacao/60000001-0000-4000-8000-000000000000.pdf',
      'oficio.pdf', repeat('c', 64))$$,
  '22023', 'oficio_obrigatorio',
  'o número do ofício é obrigatório'
);

select lives_ok(
  $$select public.registrar_prorrogacao('73000000-0000-4000-8000-000000000001', current_setting('testes.o2')::uuid,
      ' 1123/2026 ', current_setting('testes.hoje')::date + 60, '60000001-0000-4000-8000-000000000000',
      'c0000000-0000-4000-8000-00000000000a/prorrogacao/60000001-0000-4000-8000-000000000000.pdf',
      'oficio.pdf', repeat('c', 64))$$,
  'Bruno registra a prorrogação com ofício'
);

select results_eq(
  $$select o.prazo_oficial_original - current_setting('testes.hoje')::date,
           o.prazo_oficial_atual - current_setting('testes.hoje')::date,
           p.numero_oficio, p.prazo_anterior - current_setting('testes.hoje')::date
    from public.ocorrencia as o join public.prorrogacao as p on p.ocorrencia_id = o.id
    where o.id = current_setting('testes.o2')::uuid$$,
  $$values (10, 60, '1123/2026', 10)$$,
  'a prorrogação muda só o prazo atual e guarda o prazo anterior; o original não muda'
);

-- ---------------------------------------------------------------------------
-- Pedido de encerramento (Não se aplica)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.solicitar_encerramento(gen_random_uuid(), current_setting('testes.o2')::uuid, ' ')$$,
  '22023', 'justificativa_obrigatoria',
  'pedido de encerramento exige justificativa'
);

select lives_ok(
  $$select public.solicitar_encerramento('74000000-0000-4000-8000-000000000001', current_setting('testes.o2')::uuid,
      'Equipamento desativado em 2021.')$$,
  'Bruno pede o encerramento à Gestão'
);

select lives_ok(
  $$select public.solicitar_encerramento('74000000-0000-4000-8000-000000000001', current_setting('testes.o2')::uuid,
      'Equipamento desativado em 2021.')$$,
  'repetir o mesmo pedido não duplica'
);

select throws_ok(
  $$select public.solicitar_encerramento(gen_random_uuid(), current_setting('testes.o2')::uuid, 'De novo')$$,
  'P0001', 'encerramento_ja_solicitado',
  'só um pedido aguardando decisão por ocorrência'
);

select results_eq(
  $$select situacao, encerramento_solicitado_em is not null, recorrencia, ocorrencia_anterior_id
    from public.obter_ocorrencia(current_setting('testes.o2')::uuid)$$,
  $$values ('aberta'::public.situacao_ocorrencia, true, 'unica'::public.recorrencia_prazo, null::uuid)$$,
  'o pedido não encerra: a ocorrência continua aberta e o detalhe mostra o pedido pendente'
);

-- ---------------------------------------------------------------------------
-- Meta interna (Fazer agora)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.definir_meta_interna(current_setting('testes.o2')::uuid, current_setting('testes.hoje')::date)$$,
  '22023', 'meta_no_passado',
  'a nova meta interna precisa ser futura'
);

select lives_ok(
  $$select public.definir_meta_interna(current_setting('testes.o2')::uuid, current_setting('testes.hoje')::date + 3)$$,
  'Bruno define a nova meta interna'
);

select is(
  (select meta_interna - current_setting('testes.hoje')::date from public.ocorrencia
   where id = current_setting('testes.o2')::uuid),
  3,
  'a meta interna foi gravada'
);

-- ---------------------------------------------------------------------------
-- Responsável e atividade
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');
select public.atribuir_ocorrencia(current_setting('testes.o2')::uuid, 'd0000000-0000-4000-8000-0000000000a2',
  (select row_version from public.ocorrencia where id = current_setting('testes.o2')::uuid));

select results_eq(
  $$select tipo, evidencia_numero from public.ocorrencia_historico
    where ocorrencia_id = current_setting('testes.o1')::uuid order by id$$,
  $$values ('evidencia_enviada', 1), ('evidencia_cancelada', 1), ('evidencia_enviada', 2),
           ('evidencia_devolvida', 2), ('comentario', null::integer)$$,
  'a atividade registra envio, cancelamento, reenvio, devolução e comentário em ordem'
);

select results_eq(
  $$select tipo, detalhe from public.ocorrencia_historico
    where ocorrencia_id = current_setting('testes.o2')::uuid order by id$$,
  $$values ('prazo_prorrogado', '1123/2026'), ('encerramento_solicitado', 'Equipamento desativado em 2021.'),
           ('meta_definida', null::text), ('responsavel_definido', 'Ana Ribeiro')$$,
  'a atividade registra prorrogação, pedido de encerramento, meta e troca de responsável'
);

-- ---------------------------------------------------------------------------
-- Escrita direta e isolamento
-- ---------------------------------------------------------------------------
select testes.autenticar_como('bruno@filtroville.test');

select throws_ok(
  $$insert into public.pedido_encerramento (consultoria_id, ocorrencia_id, justificativa, solicitado_por)
    values ('c0000000-0000-4000-8000-00000000000a', current_setting('testes.o1')::uuid, 'x',
            'd0000000-0000-4000-8000-0000000000a3')$$,
  '42501', null,
  'pedido de encerramento só por RPC'
);

select testes.autenticar_como('helena@verdesul.test');

select results_eq(
  $$select (select count(*) from public.evidencia_arquivo), (select count(*) from public.prorrogacao),
           (select count(*) from public.pedido_encerramento), (select count(*) from public.ocorrencia_historico)$$,
  $$values (0::bigint, 0::bigint, 0::bigint, 0::bigint)$$,
  'Helena (B) recebe zero arquivos de envio, prorrogações, pedidos e atividade de A'
);

select throws_ok(
  $$select public.comentar_ocorrencia(gen_random_uuid(), current_setting('testes.o1')::uuid, 'Intrusa', null)$$,
  '42501', 'sem_permissao',
  'Helena (B) não comenta em ocorrência de A'
);

select throws_ok(
  $$select public.cancelar_envio('71000000-0000-4000-8000-000000000001')$$,
  '42501', 'sem_permissao',
  'Helena (B) não cancela envio de A'
);

select throws_ok(
  $$select public.solicitar_encerramento(gen_random_uuid(), current_setting('testes.o1')::uuid, 'Intrusa')$$,
  '42501', 'sem_permissao',
  'Helena (B) não pede encerramento em ocorrência de A'
);

select throws_ok(
  $$select public.definir_meta_interna(current_setting('testes.o1')::uuid, current_setting('testes.hoje')::date + 9)$$,
  '42501', 'sem_permissao',
  'Helena (B) não define meta em ocorrência de A'
);

select throws_ok(
  $$select public.registrar_prorrogacao(gen_random_uuid(), current_setting('testes.o1')::uuid, '1/2026',
      current_setting('testes.hoje')::date + 60, gen_random_uuid(),
      'c0000000-0000-4000-8000-00000000000a/prorrogacao/60000001-0000-4000-8000-000000000000.pdf',
      'oficio.pdf', repeat('c', 64))$$,
  '42501', 'sem_permissao',
  'Helena (B) não prorroga ocorrência de A'
);

select throws_ok(
  $$select public.enviar_evidencia(current_setting('testes.o1')::uuid, gen_random_uuid(),
      current_setting('testes.hoje')::date, null, jsonb_build_array(pg_temp.arquivo(4, 'pdf')), null)$$,
  '42501', 'sem_permissao',
  'Helena (B) não envia evidência em ocorrência de A'
);

select * from finish();

rollback;
