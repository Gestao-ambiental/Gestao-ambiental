-- P7 · Dinheiro do trabalho (ADR-0053): horas lançadas (só o autor e a Gestão leem), recebimentos
-- (só quem tem a permissão financeira), parcelas pelo maior resto, travas de reabrir e de apagar
-- parcela com recebimento, e outra consultoria sem nada.
begin;

set local timezone to 'America/Sao_Paulo';

select plan(22);

select testes.criar_dados_sinteticos();

select is(
  (select count(*) from pg_catalog.pg_class as c
   join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('apontamento_horas', 'orcamento_recebimento')
     and c.relrowsecurity and c.relforcerowsecurity
     and exists (select 1 from pg_catalog.pg_policy as p where p.polrelid = c.oid)),
  2::bigint,
  'apontamento e recebimento têm RLS forçada e política'
);

-- Orçamento de R$ 1.000,01 em 33,33% + 33,33% + 33,34%: 333,30 + 333,30 + 333,41 (o centavo que
-- sobra vai para o maior resto).
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_empreendimento('e7300000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-00000000000a', 'Cerâmica Itaum');
select public.criar_orcamento('f7300000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a',
  'e7300000-0000-4000-8000-000000000001', 'Renovação da LAO');
select public.salvar_orcamento('f7300000-0000-4000-8000-000000000001', 1, $json${
  "objeto": "Renovação da LAO", "forma_preco": "margem",
  "itens": [{"id": "17300000-0000-4000-8000-000000000001", "descricao": "Relatório", "minutos": 600,
             "preco_fechado_centavos": 100001}],
  "despesas": [],
  "parcelas": [
    {"id": "37300000-0000-4000-8000-000000000001", "descricao": "Aceite", "dias": 0, "percentual_pb": 3333},
    {"id": "37300000-0000-4000-8000-000000000002", "descricao": "Protocolo", "dias": 30, "percentual_pb": 3333},
    {"id": "37300000-0000-4000-8000-000000000003", "descricao": "Licença", "dias": 60, "percentual_pb": 3334}]
}$json$::jsonb);
select public.mudar_situacao_orcamento('f7300000-0000-4000-8000-000000000001', 2, 'enviada');

-- Antes de aprovar: não lança horas nem recebe.
select throws_ok(
  $$select public.lancar_horas(gen_random_uuid(), 'f7300000-0000-4000-8000-000000000001',
      '17300000-0000-4000-8000-000000000001', null, current_date, 60)$$,
  'P0001', 'orcamento_nao_aprovado',
  'orçamento enviado não recebe horas'
);

select public.aprovar_orcamento('f7300000-0000-4000-8000-000000000001', 3, 'Sr. Itaum', current_date - 40, 'e-mail',
  'email', true, '[{"item_id": "17300000-0000-4000-8000-000000000001", "titulo": "Relatório",
                    "responsavel_id": "d0000000-0000-4000-8000-0000000000a2"}]'::jsonb);

select results_eq(
  $$select p.valor_centavos from private.parcelas_com_valor('c0000000-0000-4000-8000-00000000000a') as p
    where p.orcamento_id = 'f7300000-0000-4000-8000-000000000001' order by p.ordem$$,
  $$values (33330::bigint), (33330::bigint), (33341::bigint)$$,
  'parcelas pelo maior resto fecham o total'
);

-- ---------------------------------------------------------------- horas
select testes.autenticar_como('ana@filtroville.test');
select lives_ok(
  $$select public.lancar_horas('a7300000-0000-4000-8000-000000000001', 'f7300000-0000-4000-8000-000000000001',
      null, (select id from public.tarefa_servico where orcamento_id = 'f7300000-0000-4000-8000-000000000001'),
      current_date, 90, 'Visita')$$,
  'Ana lança horas na tarefa dela'
);
select lives_ok(
  $$select public.lancar_horas('a7300000-0000-4000-8000-000000000001', 'f7300000-0000-4000-8000-000000000001',
      null, (select id from public.tarefa_servico where orcamento_id = 'f7300000-0000-4000-8000-000000000001'),
      current_date, 90, 'Visita')$$,
  'repetir com o mesmo id não duplica'
);
select is((select count(*) from public.apontamento_horas), 1::bigint, 'um apontamento só');
select throws_ok(
  $$select public.lancar_horas(gen_random_uuid(), 'f7300000-0000-4000-8000-000000000001',
      '17300000-0000-4000-8000-000000000001', null, current_date, 1441)$$,
  '22023', 'horas_invalidas',
  '1441 minutos são recusados'
);
select is((select count(*) from public.orcamento_recebimento), 0::bigint, 'Equipe não lê recebimentos');

select testes.autenticar_como('bruno@filtroville.test');
select is((select count(*) from public.apontamento_horas), 0::bigint, 'Bruno não lê o apontamento da Ana');

select testes.autenticar_como('eduardo@filtroville.test');
select is((select count(*) from public.apontamento_horas), 1::bigint, 'a Gestão lê o apontamento da Ana');
select is(
  (public.execucao_do_orcamento('f7300000-0000-4000-8000-000000000001') -> 'itens' -> 0 ->> 'lancado_minutos')::integer,
  90,
  'execução soma as horas da tarefa no item de origem'
);

-- ---------------------------------------------------------------- recebimentos
select lives_ok(
  $$select public.registrar_recebimento('b7300000-0000-4000-8000-000000000001',
      '37300000-0000-4000-8000-000000000001', 33330, current_date)$$,
  'Gestão registra o recebido da primeira parcela'
);
select results_eq(
  $$select a_receber_centavos, vencido_centavos
    from public.a_receber_dos_orcamentos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values (66671::bigint, 33330::bigint)$$,
  'a receber 666,71; vencido 333,30 (a segunda venceu 30 dias depois do aceite)'
);
select throws_ok(
  $$select public.mudar_situacao_orcamento('f7300000-0000-4000-8000-000000000001',
      (select row_version from public.orcamento where id = 'f7300000-0000-4000-8000-000000000001'), 'rascunho')$$,
  'P0001', 'orcamento_com_recebimento',
  'orçamento com recebimento não volta a rascunho'
);
select throws_ok(
  $$delete from public.orcamento_parcela where id = '37300000-0000-4000-8000-000000000001'$$,
  null, null,
  'parcela com recebimento não é apagada'
);
select is(
  public.estornar_recebimento('b7300000-0000-4000-8000-000000000001', 1),
  2,
  'estorno marca a linha'
);
select is(
  (select count(*) from public.orcamento_recebimento where estornado_em is not null),
  1::bigint,
  'estorno preserva a linha'
);

-- Permissão financeira: tirada, a Gestão não vê mais dinheiro; a última não sai.
select throws_ok(
  $$select public.definir_permissao_financeira('d0000000-0000-4000-8000-0000000000a1', false)$$,
  'P0001', 'ultimo_financeiro',
  'a última pessoa com permissão financeira não sai'
);
select throws_ok(
  $$select public.definir_permissao_financeira('d0000000-0000-4000-8000-0000000000a2', true)$$,
  'P0001', 'financeiro_so_na_gestao',
  'a Equipe não recebe permissão financeira'
);

-- ---------------------------------------------------------------- outra consultoria
select testes.autenticar_como('gustavo@verdesul.test');
select is((select count(*) from public.apontamento_horas), 0::bigint, 'Gestão de B não lê apontamentos de A');
select is((select count(*) from public.orcamento_recebimento), 0::bigint, 'Gestão de B não lê recebimentos de A');
select throws_ok(
  $$select public.registrar_recebimento(gen_random_uuid(), '37300000-0000-4000-8000-000000000002', 100, current_date)$$,
  '42501', 'sem_permissao',
  'Gestão de B não registra recebimento em A'
);

select * from finish();

rollback;
