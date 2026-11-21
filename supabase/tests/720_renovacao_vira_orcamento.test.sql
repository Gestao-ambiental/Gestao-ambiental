-- Renovação de LAO vira orçamento (ADR-0044, P2): orcamento.instrumento_id com FK composta e no
-- máximo um orçamento vivo por licença; criar_orcamento_de_renovacao só pela Gestão, para LAO
-- ativa com plano, idempotente pelo id e pela licença, com objeto e taxa do órgão como despesa do
-- cliente; recusado e lixeira liberam outro, e reabrir/restaurar com outro vivo é barrado;
-- listar_renovacoes com horizonte, só LAO, e o orçamento vivo (número só para a Gestão; situação
-- para todo membro). Outra consultoria recebe zero linhas.
begin;

select plan(53);

select testes.criar_dados_sinteticos();

select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

-- ---------------------------------------------------------------------------
-- Cenário (como dono das tabelas)
-- A: E1 com LAOs ativas L1 (IMA, h+400), L2 (sem órgão, h+130), L5 (SAMA, fim de 3 meses),
--    L6 (fim de 3 meses + 1), L7 (vencida, h-10), L8 (fim de 12 meses); AuA ativa L3; LAO em
--    rascunho L4. B: EB com LAO ativa LB (h+60).
-- ---------------------------------------------------------------------------
insert into public.empreendimento (id, consultoria_id, nome, criado_por) values
  ('72000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a', 'Metalúrgica Rio Cubatão',
   'd0000000-0000-4000-8000-0000000000a1'),
  ('72000000-0000-4000-8000-0000000000eb', 'c0000000-0000-4000-8000-00000000000b', 'Posto Rota Sul',
   'd0000000-0000-4000-8000-0000000000b1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome) values
  ('72000000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
   '72000000-0000-4000-8000-0000000000e1', 'Matriz'),
  ('72000000-0000-4000-8000-0000000000fb', 'c0000000-0000-4000-8000-00000000000b',
   '72000000-0000-4000-8000-0000000000eb', 'Matriz');

insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, tipo_id, numero, orgao, situacao,
                                assinado_em, marco, validade, criado_por, ativado_em, ativado_por, chave_ativacao)
select x.id, x.cid, x.eid, x.uid,
       (select t.id from public.tipo_instrumento as t where t.sigla = x.sigla and t.consultoria_id = x.cid),
       x.numero, x.orgao, x.situacao::public.situacao_instrumento, current_setting('testes.hoje')::date - 300,
       'assinatura', x.validade, x.autor,
       case when x.situacao = 'ativo' then now() end,
       case when x.situacao = 'ativo' then x.autor end,
       case when x.situacao = 'ativo' then gen_random_uuid() end
from (
  select v.*, 'c0000000-0000-4000-8000-00000000000a'::uuid as cid, '72000000-0000-4000-8000-0000000000e1'::uuid as eid,
         '72000000-0000-4000-8000-0000000000f1'::uuid as uid, 'd0000000-0000-4000-8000-0000000000a1'::uuid as autor
  from (values
    ('72000000-0000-4000-8000-000000000011'::uuid, 'LAO', '4821/2023', 'IMA', 'ativo',
     current_setting('testes.hoje')::date + 400),
    ('72000000-0000-4000-8000-000000000012'::uuid, 'LAO', '2207/2023', null, 'ativo',
     current_setting('testes.hoje')::date + 130),
    ('72000000-0000-4000-8000-000000000013'::uuid, 'AuA', '77/2024', 'IMA', 'ativo',
     current_setting('testes.hoje')::date + 30),
    ('72000000-0000-4000-8000-000000000014'::uuid, 'LAO', '9/2026', 'IMA', 'rascunho',
     current_setting('testes.hoje')::date + 500),
    ('72000000-0000-4000-8000-000000000015'::uuid, 'LAO', '15/2020', 'SAMA', 'ativo',
     private.fim_do_horizonte_da_renovacao(current_setting('testes.hoje')::date, 3)),
    ('72000000-0000-4000-8000-000000000016'::uuid, 'LAO', '16/2020', 'IMA', 'ativo',
     private.fim_do_horizonte_da_renovacao(current_setting('testes.hoje')::date, 3) + 1),
    ('72000000-0000-4000-8000-000000000017'::uuid, 'LAO', '17/2020', 'IMA', 'ativo',
     current_setting('testes.hoje')::date - 10),
    ('72000000-0000-4000-8000-000000000018'::uuid, 'LAO', '18/2020', 'IMA', 'ativo',
     private.fim_do_horizonte_da_renovacao(current_setting('testes.hoje')::date, 12))
  ) as v (id, sigla, numero, orgao, situacao, validade)
  union all
  select '72000000-0000-4000-8000-0000000000b1'::uuid, 'LAO', '1/2024', 'IMA', 'ativo',
         current_setting('testes.hoje')::date + 60,
         'c0000000-0000-4000-8000-00000000000b'::uuid, '72000000-0000-4000-8000-0000000000eb'::uuid,
         '72000000-0000-4000-8000-0000000000fb'::uuid, 'd0000000-0000-4000-8000-0000000000b1'::uuid
) as x;

-- Anomalia de propósito: plano para a AuA (o radar filtra a sigla, não só o plano).
insert into public.plano_renovacao (consultoria_id, instrumento_id)
values ('c0000000-0000-4000-8000-00000000000a', '72000000-0000-4000-8000-000000000013');

-- Orçamento comum (sem licença), para a FK e o id já usado.
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_orcamento('72000000-0000-4000-8000-0000000000a0', 'c0000000-0000-4000-8000-00000000000a',
  '72000000-0000-4000-8000-0000000000e1', 'Laudo de ruído');

-- ---------------------------------------------------------------------------
-- Estrutura
-- ---------------------------------------------------------------------------
reset role;
select ok(
  exists (select 1 from pg_catalog.pg_indexes
          where schemaname = 'public' and indexname = 'orcamento_um_vivo_por_licenca'
            and indexdef like 'CREATE UNIQUE INDEX%' and indexdef like '%excluido_em IS NULL%'),
  'índice único parcial: um orçamento vivo por licença'
);

select throws_ok(
  $$update public.orcamento set instrumento_id = '72000000-0000-4000-8000-0000000000b1'
    where id = '72000000-0000-4000-8000-0000000000a0'$$,
  '23503', null,
  'FK composta: orçamento da Filtroville não liga em licença da Verde Sul'
);

select is(
  (select count(*)::integer from pg_catalog.pg_proc as p
   join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'listar_renovacoes'),
  1,
  'listar_renovacoes tem uma assinatura só (a de 3 argumentos saiu)'
);

-- ---------------------------------------------------------------------------
-- Quem pode
-- ---------------------------------------------------------------------------
select testes.autenticar_como('bruno@filtroville.test');
select throws_ok(
  $$select public.criar_orcamento_de_renovacao('c0000000-0000-4000-8000-00000000000a',
      '72000000-0000-4000-8000-000000000011', '72000000-0000-4000-8000-0000000000a1', 1000)$$,
  '42501', 'sem_permissao',
  'Equipe (Bruno) não gera orçamento de renovação'
);
select throws_ok(
  $$select public.criar_orcamento_de_renovacao('c0000000-0000-4000-8000-00000000000a',
      '72000000-0000-4000-8000-0000000000ff', null, -1)$$,
  '42501', 'sem_permissao',
  'Equipe recebe sem_permissao antes de qualquer outra conferência'
);

select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select public.criar_orcamento_de_renovacao('c0000000-0000-4000-8000-00000000000a',
      '72000000-0000-4000-8000-000000000011', '72000000-0000-4000-8000-0000000000a1', 1000)$$,
  '42501', 'sem_permissao',
  'Gestão da Verde Sul não gera orçamento na Filtroville'
);
select throws_ok(
  $$select public.criar_orcamento_de_renovacao('c0000000-0000-4000-8000-00000000000b',
      '72000000-0000-4000-8000-000000000011', '72000000-0000-4000-8000-0000000000a1', 1000)$$,
  '22023', 'licenca_invalida',
  'licença de outra consultoria é licença inválida'
);

select testes.autenticar_como_anonimo();
select throws_ok(
  $$select public.criar_orcamento_de_renovacao('c0000000-0000-4000-8000-00000000000a',
      '72000000-0000-4000-8000-000000000011', '72000000-0000-4000-8000-0000000000a1', 1000)$$,
  '42501', null,
  'anônimo não executa criar_orcamento_de_renovacao'
);

-- ---------------------------------------------------------------------------
-- Conferências da entrada e da licença
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');
select throws_ok(
  $$select public.criar_orcamento_de_renovacao('c0000000-0000-4000-8000-00000000000a',
      '72000000-0000-4000-8000-000000000011', null, 1000)$$,
  '22023', 'id_obrigatorio',
  'sem id não cria'
);
select throws_ok(
  $$select public.criar_orcamento_de_renovacao('c0000000-0000-4000-8000-00000000000a',
      '72000000-0000-4000-8000-000000000011', '72000000-0000-4000-8000-0000000000a1', -1)$$,
  '22023', 'taxa_invalida',
  'taxa negativa é recusada'
);
select throws_ok(
  $$select public.criar_orcamento_de_renovacao('c0000000-0000-4000-8000-00000000000a',
      '72000000-0000-4000-8000-000000000011', '72000000-0000-4000-8000-0000000000a1', 100000000000)$$,
  '22023', 'taxa_invalida',
  'taxa acima do teto é recusada'
);
select throws_ok(
  $$select public.criar_orcamento_de_renovacao('c0000000-0000-4000-8000-00000000000a',
      '72000000-0000-4000-8000-0000000000ff', '72000000-0000-4000-8000-0000000000a1', 1000)$$,
  '22023', 'licenca_invalida',
  'licença inexistente é recusada'
);
select throws_ok(
  $$select public.criar_orcamento_de_renovacao('c0000000-0000-4000-8000-00000000000a',
      '72000000-0000-4000-8000-000000000013', '72000000-0000-4000-8000-0000000000a1', 1000)$$,
  'P0001', 'licenca_sem_renovacao',
  'AuA (mesmo com plano) não gera orçamento de renovação'
);
select throws_ok(
  $$select public.criar_orcamento_de_renovacao('c0000000-0000-4000-8000-00000000000a',
      '72000000-0000-4000-8000-000000000014', '72000000-0000-4000-8000-0000000000a1', 1000)$$,
  'P0001', 'licenca_sem_renovacao',
  'LAO em rascunho não gera orçamento de renovação'
);
select throws_ok(
  $$select public.criar_orcamento_de_renovacao('c0000000-0000-4000-8000-00000000000a',
      '72000000-0000-4000-8000-000000000015', '72000000-0000-4000-8000-0000000000a0', 1000)$$,
  'P0001', 'orcamento_existente',
  'id de um orçamento que não é desta licença é recusado'
);
select is(
  (select count(*)::integer from public.orcamento where id = '72000000-0000-4000-8000-0000000000a1'),
  0,
  'nenhuma recusa deixou orçamento criado'
);

-- ---------------------------------------------------------------------------
-- Gestão cria o rascunho
-- ---------------------------------------------------------------------------
select is(
  public.criar_orcamento_de_renovacao('c0000000-0000-4000-8000-00000000000a',
    '72000000-0000-4000-8000-000000000011', '72000000-0000-4000-8000-0000000000a1', 123456),
  '72000000-0000-4000-8000-0000000000a1'::uuid,
  'Gestão (Eduardo) gera o orçamento da renovação da L1'
);
select results_eq(
  $$select objeto, empreendimento_id, instrumento_id, situacao::text, row_version, criado_por, excluido_em is null
    from public.orcamento where id = '72000000-0000-4000-8000-0000000000a1'$$,
  $$values ('Renovação da LAO 4821/2023', '72000000-0000-4000-8000-0000000000e1'::uuid,
            '72000000-0000-4000-8000-000000000011'::uuid, 'rascunho', 1, 'd0000000-0000-4000-8000-0000000000a1'::uuid,
            true)$$,
  'rascunho com objeto da licença, cliente do empreendimento, licença ligada e versão 1'
);
select results_eq(
  $$select ordem, descricao, estimativa_centavos, tratamento::text
    from public.orcamento_despesa where orcamento_id = '72000000-0000-4000-8000-0000000000a1'$$,
  $$values (1, 'Taxa do órgão na renovação (IMA)', 123456::bigint, 'cliente_direto')$$,
  'a taxa entra como despesa paga pelo cliente, com o órgão'
);
select is(
  (select count(*)::integer from public.orcamento_item where orcamento_id = '72000000-0000-4000-8000-0000000000a1'),
  0,
  'sem itens: o modelo é escolhido no editor'
);

select is(
  public.criar_orcamento_de_renovacao('c0000000-0000-4000-8000-00000000000a',
    '72000000-0000-4000-8000-000000000011', '72000000-0000-4000-8000-0000000000a1', 999),
  '72000000-0000-4000-8000-0000000000a1'::uuid,
  'repetir com o mesmo id devolve o mesmo orçamento'
);
select is(
  public.criar_orcamento_de_renovacao('c0000000-0000-4000-8000-00000000000a',
    '72000000-0000-4000-8000-000000000011', '72000000-0000-4000-8000-0000000000a9', 999),
  '72000000-0000-4000-8000-0000000000a1'::uuid,
  'repetir com outro id devolve o orçamento vivo da licença'
);
select results_eq(
  $$select (select count(*)::integer from public.orcamento where id = '72000000-0000-4000-8000-0000000000a9'),
           (select count(*)::integer from public.orcamento_despesa
            where orcamento_id = '72000000-0000-4000-8000-0000000000a1'),
           (select estimativa_centavos from public.orcamento_despesa
            where orcamento_id = '72000000-0000-4000-8000-0000000000a1')$$,
  $$values (0, 1, 123456::bigint)$$,
  'a repetição não cria outro orçamento nem outra despesa, e não muda a taxa'
);

select is(
  public.criar_orcamento_de_renovacao('c0000000-0000-4000-8000-00000000000a',
    '72000000-0000-4000-8000-000000000012', '72000000-0000-4000-8000-0000000000a2'),
  '72000000-0000-4000-8000-0000000000a2'::uuid,
  'sem taxa informada também cria'
);
select results_eq(
  $$select o.objeto, d.descricao, d.estimativa_centavos is null
    from public.orcamento as o join public.orcamento_despesa as d on d.orcamento_id = o.id
    where o.id = '72000000-0000-4000-8000-0000000000a2'$$,
  $$values ('Renovação da LAO 2207/2023', 'Taxa do órgão na renovação', true)$$,
  'licença sem órgão: despesa sem parênteses e a cotar (estimativa nula, nunca zero)'
);

-- ---------------------------------------------------------------------------
-- Recusado libera um novo; reabrir com outro vivo é barrado
-- ---------------------------------------------------------------------------
reset role;
update public.orcamento set situacao = 'recusada' where id = '72000000-0000-4000-8000-0000000000a1';
select testes.autenticar_como('eduardo@filtroville.test');

select is(
  public.criar_orcamento_de_renovacao('c0000000-0000-4000-8000-00000000000a',
    '72000000-0000-4000-8000-000000000011', '72000000-0000-4000-8000-0000000000a3', 50000),
  '72000000-0000-4000-8000-0000000000a3'::uuid,
  'com o orçamento recusado, a licença ganha um novo'
);
select throws_ok(
  $$select public.mudar_situacao_orcamento('72000000-0000-4000-8000-0000000000a1',
      (select row_version from public.orcamento where id = '72000000-0000-4000-8000-0000000000a1'), 'rascunho')$$,
  'P0001', 'licenca_ja_tem_orcamento',
  'reabrir o recusado com outro vivo na licença é barrado'
);
select is(
  (select situacao::text from public.orcamento where id = '72000000-0000-4000-8000-0000000000a1'),
  'recusada',
  'o recusado continua recusado'
);

-- ---------------------------------------------------------------------------
-- Lixeira libera um novo; restaurar com outro vivo é barrado
-- ---------------------------------------------------------------------------
select public.excluir_orcamento('72000000-0000-4000-8000-0000000000a2',
  (select row_version from public.orcamento where id = '72000000-0000-4000-8000-0000000000a2'));
select is(
  public.criar_orcamento_de_renovacao('c0000000-0000-4000-8000-00000000000a',
    '72000000-0000-4000-8000-000000000012', '72000000-0000-4000-8000-0000000000a4', 0),
  '72000000-0000-4000-8000-0000000000a4'::uuid,
  'com o orçamento na lixeira, a licença ganha um novo'
);
select is(
  (select estimativa_centavos from public.orcamento_despesa where orcamento_id = '72000000-0000-4000-8000-0000000000a4'),
  0::bigint,
  'taxa zero é aceita e gravada como zero'
);
select throws_ok(
  $$select public.restaurar_orcamento('72000000-0000-4000-8000-0000000000a2',
      (select row_version from public.orcamento where id = '72000000-0000-4000-8000-0000000000a2'))$$,
  'P0001', 'licenca_ja_tem_orcamento',
  'restaurar da lixeira com outro vivo na licença é barrado'
);

reset role;
select throws_ok(
  $$insert into public.orcamento (consultoria_id, ano, sequencia, empreendimento_id, objeto, criado_por,
                                  instrumento_id)
    values ('c0000000-0000-4000-8000-00000000000a', 1999, 1, '72000000-0000-4000-8000-0000000000e1', 'Intruso',
            'd0000000-0000-4000-8000-0000000000a1', '72000000-0000-4000-8000-000000000011')$$,
  'P0001', 'licenca_ja_tem_orcamento',
  'nem como dono entra um segundo orçamento vivo para a licença'
);

-- ---------------------------------------------------------------------------
-- Radar: horizonte e só LAO
-- ---------------------------------------------------------------------------
select is(private.fim_do_horizonte_da_renovacao('2026-08-31', 6), '2027-02-28'::date,
  'fim do horizonte: 31/08 + 6 meses = 28/02');
select is(private.fim_do_horizonte_da_renovacao('2027-08-31', 6), '2028-02-29'::date,
  'fim do horizonte no ano bissexto: 31/08/2027 + 6 meses = 29/02/2028');
select is(private.fim_do_horizonte_da_renovacao('2026-01-15', 0), '2026-02-15'::date,
  'horizonte abaixo de 1 mês vale 1');
select is(private.fim_do_horizonte_da_renovacao('2026-01-15', 99), '2028-01-15'::date,
  'horizonte acima de 24 meses vale 24');

select testes.autenticar_como('eduardo@filtroville.test');
select set_eq(
  $$select instrumento_id from public.listar_renovacoes('c0000000-0000-4000-8000-00000000000a')$$,
  $$values ('72000000-0000-4000-8000-000000000011'::uuid), ('72000000-0000-4000-8000-000000000012'::uuid),
           ('72000000-0000-4000-8000-000000000015'::uuid), ('72000000-0000-4000-8000-000000000016'::uuid),
           ('72000000-0000-4000-8000-000000000017'::uuid), ('72000000-0000-4000-8000-000000000018'::uuid)$$,
  'sem horizonte: toda LAO ativa com plano, como antes (AuA com plano e rascunho fora)'
);
select set_eq(
  $$select instrumento_id from public.listar_renovacoes('c0000000-0000-4000-8000-00000000000a', 50, 0, 3)$$,
  $$values ('72000000-0000-4000-8000-000000000015'::uuid), ('72000000-0000-4000-8000-000000000017'::uuid)$$,
  '3 meses: a que vence no último dia entra, a do dia seguinte não; vencida entra'
);
select set_eq(
  $$select instrumento_id from public.listar_renovacoes('c0000000-0000-4000-8000-00000000000a', 50, 0, 6)$$,
  $$values ('72000000-0000-4000-8000-000000000012'::uuid), ('72000000-0000-4000-8000-000000000015'::uuid),
           ('72000000-0000-4000-8000-000000000016'::uuid), ('72000000-0000-4000-8000-000000000017'::uuid)$$,
  '6 meses'
);
select set_eq(
  $$select instrumento_id from public.listar_renovacoes('c0000000-0000-4000-8000-00000000000a', 50, 0, 12)$$,
  $$values ('72000000-0000-4000-8000-000000000012'::uuid), ('72000000-0000-4000-8000-000000000015'::uuid),
           ('72000000-0000-4000-8000-000000000016'::uuid), ('72000000-0000-4000-8000-000000000017'::uuid),
           ('72000000-0000-4000-8000-000000000018'::uuid)$$,
  '12 meses: a que vence no último dia entra; h+400 fica fora'
);
select results_eq(
  $$select count(*)::integer, max(total) from public.listar_renovacoes('c0000000-0000-4000-8000-00000000000a', 1, 0, 6)$$,
  $$values (1, 4::bigint)$$,
  'paginado, com o total contado no horizonte'
);

-- ---------------------------------------------------------------------------
-- Radar: coluna do orçamento
-- ---------------------------------------------------------------------------
select results_eq(
  $$select r.orcamento_id, r.orcamento_ano = o.ano, r.orcamento_sequencia = o.sequencia, r.orcamento_revisao,
           r.orcamento_situacao::text
    from public.listar_renovacoes('c0000000-0000-4000-8000-00000000000a') as r
    join public.orcamento as o on o.id = r.orcamento_id
    where r.instrumento_id = '72000000-0000-4000-8000-000000000011'$$,
  $$values ('72000000-0000-4000-8000-0000000000a3'::uuid, true, true, 1, 'rascunho')$$,
  'Gestão vê o orçamento vivo (o novo, não o recusado) com número e situação'
);
select results_eq(
  $$select orcamento_id, orcamento_situacao::text from public.listar_renovacoes('c0000000-0000-4000-8000-00000000000a')
    where instrumento_id = '72000000-0000-4000-8000-000000000012'$$,
  $$values ('72000000-0000-4000-8000-0000000000a4'::uuid, 'rascunho')$$,
  'Gestão vê o orçamento vivo, não o da lixeira'
);
select results_eq(
  $$select orcamento_id is null, orcamento_situacao is null from public.listar_renovacoes('c0000000-0000-4000-8000-00000000000a')
    where instrumento_id = '72000000-0000-4000-8000-000000000015'$$,
  $$values (true, true)$$,
  'licença sem orçamento vem com as colunas do orçamento nulas'
);

select testes.autenticar_como('bruno@filtroville.test');
select results_eq(
  $$select orcamento_id, orcamento_ano, orcamento_sequencia, orcamento_revisao, orcamento_situacao::text
    from public.listar_renovacoes('c0000000-0000-4000-8000-00000000000a')
    where instrumento_id = '72000000-0000-4000-8000-000000000011'$$,
  $$values (null::uuid, null::integer, null::integer, null::integer, 'rascunho')$$,
  'Equipe vê só a situação do orçamento, sem id nem número'
);
select is(
  (select count(*)::integer from public.orcamento where instrumento_id is not null),
  0,
  'Equipe continua sem ler orcamento'
);
select is(
  private.situacao_do_orcamento_da_licenca('c0000000-0000-4000-8000-00000000000b',
    '72000000-0000-4000-8000-0000000000b1'),
  null::public.situacao_orcamento,
  'a situação de licença de outra consultoria vem nula'
);

select testes.autenticar_como('gustavo@verdesul.test');
select is(
  (select count(*)::integer from public.listar_renovacoes('c0000000-0000-4000-8000-00000000000a')),
  0,
  'Gestão da Verde Sul recebe zero linhas do radar da Filtroville'
);
select is(
  (select count(*)::integer from public.listar_renovacoes('c0000000-0000-4000-8000-00000000000a', 50, 0, 12)),
  0,
  'zero linhas também com horizonte'
);
select results_eq(
  $$select instrumento_id, orcamento_situacao from public.listar_renovacoes('c0000000-0000-4000-8000-00000000000b')$$,
  $$values ('72000000-0000-4000-8000-0000000000b1'::uuid, null::public.situacao_orcamento)$$,
  'a Verde Sul vê o próprio radar'
);

select testes.autenticar_como_anonimo();
select throws_ok(
  $$select * from public.listar_renovacoes('c0000000-0000-4000-8000-00000000000a', 50, 0, 6)$$,
  '42501', null,
  'anônimo não executa listar_renovacoes'
);

-- ---------------------------------------------------------------------------
-- Plano sem orçamentos
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '', true); -- sem usuário, como a service role
-- Fora do beta e do teste grátis, com plano Essencial em dia (sem orçamentos).
update private.configuracao_comercial set fim_do_beta = current_date - 400;
update public.consultoria set criada_em = now() - interval '60 days'
where id = 'c0000000-0000-4000-8000-00000000000a';
insert into public.assinatura (id, consultoria_id, plano, ciclo, forma, asaas_cliente_id, asaas_assinatura_id,
                               proximo_vencimento)
values ('72000000-0000-4000-8000-0000000000c1', 'c0000000-0000-4000-8000-00000000000a', 'essencial', 'mensal', 'pix',
        'cus_teste_720', 'sub_teste_720', current_date + 20);

select testes.autenticar_como('eduardo@filtroville.test');
select throws_ok(
  $$select public.criar_orcamento_de_renovacao('c0000000-0000-4000-8000-00000000000a',
      '72000000-0000-4000-8000-000000000015', '72000000-0000-4000-8000-0000000000a5', 1000)$$,
  '42501', 'orcamentos_fora_do_plano',
  'plano Essencial: gerar orçamento de renovação falha com o erro do plano'
);
select is(
  (select count(*)::integer from public.orcamento where id = '72000000-0000-4000-8000-0000000000a5'),
  0,
  'e nada fica gravado'
);

select * from finish();

rollback;
