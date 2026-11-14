-- Aprovação do orçamento com tarefas (ADR-0029; FIN-01, FIN-03): aceite obrigatório e validado
-- sem efeitos parciais; tarefas geradas dos itens (horas em branco = não estimada); Equipe lê e
-- conclui só a própria; carga conta a tarefa no lugar do item; nova revisão não duplica e marca
-- a tarefa cujo item saiu; outra consultoria lê zero e não escreve; regra do 020 nas tabelas.
begin;

select plan(26);

select testes.criar_dados_sinteticos();

select is(
  (select count(*) from pg_catalog.pg_class as c
   join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('orcamento_aceite', 'tarefa_servico')
     and c.relrowsecurity and c.relforcerowsecurity
     and exists (select 1 from pg_catalog.pg_policy as p where p.polrelid = c.oid)
     and exists (select 1 from pg_catalog.pg_trigger as t where t.tgrelid = c.oid and t.tgname = '_suporte_somente_leitura')
     and exists (select 1 from pg_catalog.pg_trigger as t where t.tgrelid = c.oid and t.tgname = '_comercial_somente_leitura')),
  2::bigint,
  'aceite e tarefa têm RLS forçada, política e as barreiras de suporte e comercial'
);

-- ---------------------------------------------------------------- orçamento enviado
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_empreendimento('e4800000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-00000000000a', 'Cerâmica Itaum');
select public.criar_orcamento('f4800000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a',
  'e4800000-0000-4000-8000-000000000001', 'Renovação da LAO');

select is(
  public.salvar_orcamento('f4800000-0000-4000-8000-000000000001', 1, format($json${
    "objeto": "Renovação da LAO", "forma_preco": "margem",
    "itens": [
      {"id": "14800000-0000-4000-8000-000000000001", "descricao": "Relatório de renovação", "minutos": 600,
       "responsavel_id": "d0000000-0000-4000-8000-0000000000a2", "mes_previsto": "%s",
       "preco_fechado_centavos": 300000},
      {"id": "14800000-0000-4000-8000-000000000002", "descricao": "Protocolo", "minutos": 60,
       "preco_fechado_centavos": 50000}
    ],
    "despesas": [],
    "parcelas": [{"id": "34800000-0000-4000-8000-000000000001", "descricao": "Aceite", "dias": 0,
                  "percentual_pb": 10000}]
  }$json$, date_trunc('month', current_date + 40)::date)::jsonb),
  2,
  'salva o orçamento com dois serviços'
);
select is(public.mudar_situacao_orcamento('f4800000-0000-4000-8000-000000000001', 2, 'enviada'), 3, 'enviado');

-- ---------------------------------------------------------------- validação antes de gravar
select throws_ok(
  $$select public.aprovar_orcamento('f4800000-0000-4000-8000-000000000001', 3, '  ', current_date, 'e-mail')$$,
  '22023', 'aceite_sem_pessoa',
  'aceite sem quem aprovou é recusado'
);
select throws_ok(
  $$select public.aprovar_orcamento('f4800000-0000-4000-8000-000000000001', 3, 'Sr. Itaum', current_date + 1, 'e-mail')$$,
  '22023', 'aceite_data_invalida',
  'aceite com data no futuro é recusado'
);
select throws_ok(
  $$select public.aprovar_orcamento('f4800000-0000-4000-8000-000000000001', 3, 'Sr. Itaum', current_date, 'e-mail',
      'email', true, '[{"titulo": "Relatório", "responsavel_id": "d0000000-0000-4000-8000-0000000000b1"}]')$$,
  'P0001', 'responsavel_invalido',
  'tarefa com responsável de outra consultoria é recusada'
);
select results_eq(
  $$select o.situacao::text, (select count(*) from public.tarefa_servico as x where x.orcamento_id = o.id),
           (select count(*) from public.orcamento_aceite as a where a.orcamento_id = o.id)
    from public.orcamento as o where o.id = 'f4800000-0000-4000-8000-000000000001'$$,
  $$values ('enviada', 0::bigint, 0::bigint)$$,
  'falha não deixa nada gravado: continua enviada, sem tarefa nem aceite'
);

-- ---------------------------------------------------------------- aprovar
select is(
  public.aprovar_orcamento('f4800000-0000-4000-8000-000000000001', 3, ' Sr. Itaum ', current_date, ' e-mail de hoje ',
    'email', true, format($json$[
      {"item_id": "14800000-0000-4000-8000-000000000001", "titulo": "Relatório de renovação",
       "responsavel_id": "d0000000-0000-4000-8000-0000000000a2", "minutos": 600, "prazo_interno": "%s"},
      {"item_id": "14800000-0000-4000-8000-000000000002", "titulo": "Protocolo"},
      {"titulo": "Visitar a fábrica", "responsavel_id": "d0000000-0000-4000-8000-0000000000a3", "minutos": 240}
    ]$json$, current_date + 40)::jsonb),
  4,
  'aprova com aceite e três tarefas'
);
select results_eq(
  $$select titulo, responsavel_id, minutos_estimados, gerada_do_item, situacao::text
    from public.tarefa_servico where orcamento_id = 'f4800000-0000-4000-8000-000000000001' order by ordem$$,
  $$values ('Relatório de renovação', 'd0000000-0000-4000-8000-0000000000a2'::uuid, 600, true, 'a_fazer'),
           ('Protocolo', null::uuid, null::integer, true, 'a_fazer'),
           ('Visitar a fábrica', 'd0000000-0000-4000-8000-0000000000a3'::uuid, 240, false, 'a_fazer')$$,
  'tarefas na ordem; hora em branco fica nula (não estimada), nunca zero'
);
select results_eq(
  $$select aprovado_por, referencia, metodo, length(conteudo_sha256), revisao
    from public.orcamento_aceite where orcamento_id = 'f4800000-0000-4000-8000-000000000001'$$,
  $$values ('Sr. Itaum', 'e-mail de hoje', 'email', 64, 1)$$,
  'aceite gravado aparado, com hash SHA-256 da revisão'
);
select results_eq(
  $$select (c -> 'comprometido') @> jsonb_build_array(jsonb_build_object(
              'membro_id', 'd0000000-0000-4000-8000-0000000000a2', 'minutos', 600)),
           (select sum((e ->> 'minutos')::integer) from jsonb_array_elements(c -> 'comprometido') as e
            where e ->> 'membro_id' = 'd0000000-0000-4000-8000-0000000000a2')
    from public.carga_da_equipe('c0000000-0000-4000-8000-00000000000a') as c$$,
  $$values (true, 600::bigint)$$,
  'a carga conta a tarefa no lugar do item, sem somar duas vezes'
);
select is(
  (select row_version from public.orcamento where id = 'f4800000-0000-4000-8000-000000000001'),
  4,
  'orçamento aprovado com a versão devolvida'
);

-- ---------------------------------------------------------------- Equipe
select testes.autenticar_como('ana@filtroville.test');
select is(
  (select count(*) from public.listar_tarefas_servico('c0000000-0000-4000-8000-00000000000a',
     p_orcamento_id => 'f4800000-0000-4000-8000-000000000001')),
  3::bigint,
  'Equipe lista as tarefas do orçamento'
);
select results_eq(
  $$select empreendimento_nome, orcamento_ano > 2000, responsavel_nome
    from public.listar_tarefas_servico('c0000000-0000-4000-8000-00000000000a',
      p_responsavel_id => 'd0000000-0000-4000-8000-0000000000a2')$$,
  $$values ('Cerâmica Itaum', true, 'Ana Ribeiro')$$,
  'a lista traz o empreendimento e o responsável, filtrada pela pessoa'
);
select is(
  (select count(*) from public.orcamento_aceite),
  0::bigint,
  'Equipe não lê o aceite (dado comercial)'
);
select is(
  public.mudar_situacao_tarefa_servico(
    (select id from public.tarefa_servico where titulo = 'Relatório de renovação'), 1, 'concluida'),
  2,
  'o responsável conclui a própria tarefa'
);
select throws_ok(
  $$select public.mudar_situacao_tarefa_servico(
      (select id from public.tarefa_servico where titulo = 'Protocolo'), 1, 'em_andamento')$$,
  '42501', 'sem_permissao',
  'Equipe não mexe em tarefa de outra pessoa (ou sem responsável)'
);
select throws_ok(
  $$select public.editar_tarefa_servico(
      (select id from public.tarefa_servico where titulo = 'Protocolo'), 1, 'Protocolo', null, 60, null)$$,
  '42501', 'sem_permissao',
  'Equipe não edita tarefa'
);

-- ---------------------------------------------------------------- nova revisão
select testes.autenticar_como('eduardo@filtroville.test');
select is(public.mudar_situacao_orcamento('f4800000-0000-4000-8000-000000000001', 4, 'rascunho'), 5, 'reaberto');
select is(
  public.salvar_orcamento('f4800000-0000-4000-8000-000000000001', 5, $json${
    "objeto": "Renovação da LAO", "forma_preco": "margem",
    "itens": [
      {"id": "14800000-0000-4000-8000-000000000001", "descricao": "Relatório de renovação", "minutos": 600,
       "preco_fechado_centavos": 300000},
      {"id": "14800000-0000-4000-8000-000000000003", "descricao": "Inventário de resíduos", "minutos": 120,
       "preco_fechado_centavos": 80000}
    ],
    "despesas": [],
    "parcelas": [{"id": "34800000-0000-4000-8000-000000000001", "descricao": "Aceite", "dias": 0,
                  "percentual_pb": 10000}]
  }$json$::jsonb),
  6,
  'revisão 2 tira o protocolo e põe o inventário'
);
select is(
  public.aprovar_orcamento('f4800000-0000-4000-8000-000000000001', 6, 'Sr. Itaum', current_date, 'WhatsApp',
    null, true, '[
      {"item_id": "14800000-0000-4000-8000-000000000001", "titulo": "Relatório de novo"},
      {"item_id": "14800000-0000-4000-8000-000000000003", "titulo": "Inventário de resíduos", "minutos": 120}
    ]'::jsonb),
  7,
  'aprova a revisão 2'
);
select results_eq(
  $$select titulo, situacao::text, fora_da_revisao
    from public.tarefa_servico where orcamento_id = 'f4800000-0000-4000-8000-000000000001' order by ordem$$,
  $$values ('Relatório de renovação', 'concluida', false), ('Protocolo', 'a_fazer', true),
           ('Visitar a fábrica', 'a_fazer', false), ('Inventário de resíduos', 'a_fazer', false)$$,
  'item que já tinha tarefa não ganha outra; a do item que saiu fica, marcada fora da revisão'
);
select is(
  (select count(*) from public.orcamento_aceite where orcamento_id = 'f4800000-0000-4000-8000-000000000001'),
  2::bigint,
  'um aceite por revisão'
);

-- ---------------------------------------------------------------- outra consultoria
select testes.autenticar_como('gustavo@verdesul.test');
select is((select count(*) from public.tarefa_servico), 0::bigint, 'outra consultoria lê zero tarefas');
select throws_ok(
  $$select * from public.listar_tarefas_servico('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', 'sem_permissao',
  'outra consultoria não lista as tarefas'
);
select throws_ok(
  $$select public.adicionar_tarefa_servico('f4800000-0000-4000-8000-000000000001', gen_random_uuid(),
      'Invasão', null, null, null)$$,
  '42501', 'sem_permissao',
  'outra consultoria não acrescenta tarefa'
);

select * from finish();
rollback;
