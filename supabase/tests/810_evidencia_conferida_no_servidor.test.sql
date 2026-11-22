-- Evidência com prova de origem (20261122071000): hash conferido no servidor antes de aprovar,
-- evidência e conferência imutáveis, conclusão ligada à evidência aprovada, destaque da versão que
-- valeu e auditoria da ocorrência só para a Gestão, com o negativo de outra consultoria.
begin;

select plan(31);

select testes.criar_dados_sinteticos();
select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('e0000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
        'Metalúrgica Rio Cubatão', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome)
values ('f0000000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
        'e0000000-0000-4000-8000-0000000000e1', 'Matriz');

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

insert into storage.objects (bucket_id, name, metadata)
select 'arquivos', 'c0000000-0000-4000-8000-00000000000a/evidencia/5000000' || n::text || '-0000-4000-8000-000000000000.pdf',
       '{"mimetype": "application/pdf", "size": 2048}'
from generate_series(1, 3) as n;

-- Bruno envia a v1 da o1 (hash declarado: "a…") e a v1 da o2 (hash "c…").
select testes.autenticar_como('bruno@filtroville.test');
select public.enviar_evidencia(current_setting('testes.o1')::uuid, '70000000-0000-4000-8000-000000000001',
  '50000001-0000-4000-8000-000000000000',
  'c0000000-0000-4000-8000-00000000000a/evidencia/50000001-0000-4000-8000-000000000000.pdf',
  'Relatório v1.pdf', repeat('a', 64), current_setting('testes.hoje')::date - 2);
select public.enviar_evidencia(current_setting('testes.o2')::uuid, '70000000-0000-4000-8000-000000000003',
  '50000003-0000-4000-8000-000000000000',
  'c0000000-0000-4000-8000-00000000000a/evidencia/50000003-0000-4000-8000-000000000000.pdf',
  'Outro.pdf', repeat('c', 64), current_setting('testes.hoje')::date - 2);

-- ---------------------------------------------------------------------------
-- Hash conferido no servidor
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.registrar_conferencia_de_arquivo('50000001-0000-4000-8000-000000000000', repeat('a', 64))$$,
  '42501', null,
  'quem está logado não grava a conferência do arquivo (só a Edge Function, com service role)'
);

select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.conferir_evidencia('70000000-0000-4000-8000-000000000001', 'aprovada', null)$$,
  'P0001', 'arquivo_nao_conferido',
  'sem o hash conferido no servidor, a evidência não é aprovada'
);

reset role;
set local role service_role;

select is(
  public.registrar_conferencia_de_arquivo('50000001-0000-4000-8000-000000000000', repeat('f', 64)),
  false,
  'hash calculado diferente do declarado: não confere'
);

select is(
  public.registrar_conferencia_de_arquivo('50000001-0000-4000-8000-000000000000', repeat('a', 64)),
  false,
  'repetir devolve o resultado já gravado (não troca o hash conferido)'
);

select throws_ok(
  $$select public.registrar_conferencia_de_arquivo('50000001-0000-4000-8000-000000000000', 'xyz')$$,
  '22023', 'sha256_invalido',
  'hash fora do formato é recusado'
);

reset role;

select is(
  (select count(*) from public.conferencia_de_arquivo
   where documento_versao_id = '50000001-0000-4000-8000-000000000000'),
  1::bigint,
  'uma conferência por versão'
);

select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.conferir_evidencia('70000000-0000-4000-8000-000000000001', 'aprovada', null)$$,
  'P0001', 'arquivo_divergente',
  'com o hash divergente, a evidência não é aprovada'
);

select lives_ok(
  $$select public.conferir_evidencia('70000000-0000-4000-8000-000000000001', 'devolvida',
      'O arquivo guardado não é o enviado.')$$,
  'com o hash divergente, devolver continua possível'
);

-- v2 corrigida, com o hash conferido igual.
-- O objeto da v2 já está no Storage (inserido no começo).
select testes.autenticar_como('bruno@filtroville.test');
select public.enviar_evidencia(current_setting('testes.o1')::uuid, '70000000-0000-4000-8000-000000000002',
  '50000002-0000-4000-8000-000000000000',
  'c0000000-0000-4000-8000-00000000000a/evidencia/50000002-0000-4000-8000-000000000000.pdf',
  'Relatório v2.pdf', repeat('b', 64), current_setting('testes.hoje')::date - 1);
reset role;
set local role service_role;
select public.registrar_conferencia_de_arquivo('50000002-0000-4000-8000-000000000000', upper(repeat('b', 64)));
reset role;

select testes.autenticar_como('eduardo@filtroville.test');

select lives_ok(
  $$select public.conferir_evidencia('70000000-0000-4000-8000-000000000002', 'aprovada', null)$$,
  'com o hash conferido igual, a Gestão aprova a v2'
);

select results_eq(
  $$select numero, nome_original, sha256, arquivo_confere, enviada_por_nome, conferente_nome,
           conferida_em is not null, concluida_por_nome
    from public.obter_evidencia_aprovada(current_setting('testes.o1')::uuid)$$,
  $$values (2, 'Relatório v2.pdf', repeat('b', 64), true, 'Bruno Tavares', 'Eduardo Karnopp', true, null::text)$$,
  'o destaque mostra a versão aprovada, quem enviou, quem conferiu e o hash conferido'
);

-- ---------------------------------------------------------------------------
-- Conclusão ligada à evidência aprovada
-- ---------------------------------------------------------------------------
select public.concluir_ocorrencia(current_setting('testes.o1')::uuid,
  (select row_version from public.ocorrencia where id = current_setting('testes.o1')::uuid));

select is(
  (select evidencia_aprovada_id from public.ocorrencia where id = current_setting('testes.o1')::uuid),
  '70000000-0000-4000-8000-000000000002'::uuid,
  'a conclusão aponta para a evidência aprovada (v2)'
);

select results_eq(
  $$select numero, concluida_por_nome, concluida_em is not null
    from public.obter_evidencia_aprovada(current_setting('testes.o1')::uuid)$$,
  $$values (2, 'Eduardo Karnopp', true)$$,
  'o destaque traz quem concluiu e quando'
);

reset role;

select throws_ok(
  $$update public.ocorrencia set evidencia_aprovada_id = '70000000-0000-4000-8000-000000000001'
    where id = current_setting('testes.o1')::uuid$$,
  '23514', 'evidencia_de_outra_ocorrencia',
  'a conclusão não aponta para uma evidência devolvida'
);

select throws_ok(
  $$update public.ocorrencia set evidencia_aprovada_id = '70000000-0000-4000-8000-000000000002'
    where id = current_setting('testes.o2')::uuid$$,
  '23514', null,
  'a conclusão não aponta para evidência de outra ocorrência'
);

-- ---------------------------------------------------------------------------
-- Imutabilidade (nem o dono das tabelas altera)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$update public.evidencia set data_execucao = data_execucao - 1
    where id = '70000000-0000-4000-8000-000000000002'$$,
  '42501', null,
  'a data de execução da evidência não muda'
);

select throws_ok(
  $$update public.evidencia set documento_versao_id = '50000001-0000-4000-8000-000000000000'
    where id = '70000000-0000-4000-8000-000000000002'$$,
  '42501', null,
  'a versão do arquivo da evidência não é trocada'
);

select throws_ok(
  $$update public.evidencia set situacao = 'devolvida' where id = '70000000-0000-4000-8000-000000000002'$$,
  '42501', null,
  'evidência aprovada não muda de situação'
);

select throws_ok(
  $$delete from public.evidencia where id = '70000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'evidência não é apagada'
);

select throws_ok(
  $$update public.conferencia set motivo = 'outro' where evidencia_id = '70000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'a conferência não muda'
);

select throws_ok(
  $$delete from public.conferencia_de_arquivo where documento_versao_id = '50000002-0000-4000-8000-000000000000'$$,
  '42501', null,
  'a conferência do arquivo não é apagada'
);

select is(
  (select count(*) from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and cmd in ('UPDATE', 'DELETE', 'ALL')),
  0::bigint,
  'o Storage não tem política de update nem de delete: objeto não é sobrescrito'
);

-- ---------------------------------------------------------------------------
-- Reabrir desfaz o vínculo
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');
select public.reabrir_ocorrencia(current_setting('testes.o1')::uuid, 'Órgão pediu complemento',
  (select row_version from public.ocorrencia where id = current_setting('testes.o1')::uuid));

select is(
  (select evidencia_aprovada_id from public.ocorrencia where id = current_setting('testes.o1')::uuid),
  null::uuid,
  'reaberta, a ocorrência não aponta mais para a evidência'
);

-- ---------------------------------------------------------------------------
-- Auditoria da ocorrência (só Gestão)
-- ---------------------------------------------------------------------------
select ok(
  (select array_agg(distinct entidade order by entidade)
   from public.listar_auditoria_da_ocorrencia(current_setting('testes.o1')::uuid, 100, 0))
  @> array['conferencia', 'conferencia_de_arquivo', 'evidencia', 'ocorrencia'],
  'a Gestão vê a auditoria da ocorrência: ocorrência, evidências, conferências e arquivos'
);

select ok(
  exists (select 1 from public.listar_auditoria_da_ocorrencia(current_setting('testes.o1')::uuid, 100, 0)
          where entidade = 'evidencia' and acao = 'insert' and ator_nome = 'Bruno Tavares'),
  'a auditoria diz quem enviou'
);

select ok(
  not exists (select 1 from public.listar_auditoria_da_ocorrencia(current_setting('testes.o1')::uuid, 100, 0)
              where (coalesce(depois, antes) ->> 'id') = '70000000-0000-4000-8000-000000000003'),
  'a auditoria de uma ocorrência não traz a evidência de outra'
);

select is(
  (select count(*) from public.listar_auditoria_da_ocorrencia(current_setting('testes.o1')::uuid, 2, 0)),
  2::bigint,
  'a auditoria vem em páginas'
);

select testes.autenticar_como('bruno@filtroville.test');

select throws_ok(
  $$select * from public.listar_auditoria_da_ocorrencia(current_setting('testes.o1')::uuid, 50, 0)$$,
  '42501', 'sem_permissao',
  'Equipe não vê a auditoria da ocorrência'
);

-- Outra consultoria
select testes.autenticar_como('gustavo@verdesul.test');

select throws_ok(
  $$select * from public.listar_auditoria_da_ocorrencia(current_setting('testes.o1')::uuid, 50, 0)$$,
  '42501', 'sem_permissao',
  'Gestão de outra consultoria não vê a auditoria'
);

select is(
  (select count(*) from public.auditoria where entidade_id = current_setting('testes.o1')::uuid),
  0::bigint,
  'Gestão de outra consultoria não lê a auditoria direto na tabela'
);

select is(
  (select count(*) from public.conferencia_de_arquivo),
  0::bigint,
  'outra consultoria não vê as conferências de arquivo'
);

select is(
  (select count(*) from public.obter_evidencia_aprovada(current_setting('testes.o1')::uuid)),
  0::bigint,
  'outra consultoria não vê o destaque da evidência'
);

select * from finish();
rollback;
