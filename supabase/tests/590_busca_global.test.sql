-- Busca global (Ctrl+K): acha empreendimento, licença, condicionante e orçamento por trecho, sem
-- acento e sem caixa; respeita lixeira e condicionante descartada; no máximo 5 por tipo; termo
-- curto não busca. Equipe não vê orçamento; outra consultoria recebe zero linhas mesmo passando
-- o id alheio; anon não executa.
begin;

select plan(19);

select testes.criar_dados_sinteticos();

-- Carteira de A (como dono da tabela; a escrita do cliente é por RPC, testada no 090 e no 100).
insert into public.cliente (id, consultoria_id, nome)
values ('54000000-0000-4000-8000-0000000000c1', 'c0000000-0000-4000-8000-00000000000a', 'Grupo Açoriano');
insert into public.empreendimento (id, consultoria_id, nome, cliente_id, cnpj, criado_por)
values ('54000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
        'Metalúrgica São João', '54000000-0000-4000-8000-0000000000c1', '11222333000181',
        'd0000000-0000-4000-8000-0000000000a1'),
       ('54000000-0000-4000-8000-0000000000e2', 'c0000000-0000-4000-8000-00000000000a',
        'Padaria Central', null, null, 'd0000000-0000-4000-8000-0000000000a1');
insert into public.empreendimento (consultoria_id, nome, criado_por)
select 'c0000000-0000-4000-8000-00000000000a', 'Posto Alfa ' || n::text, 'd0000000-0000-4000-8000-0000000000a1'
from generate_series(1, 7) as n;
insert into public.unidade (id, consultoria_id, empreendimento_id, nome)
values ('54000000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
        '54000000-0000-4000-8000-0000000000e1', 'Matriz');

-- LAO 4821/2023 em rascunho, com uma condicionante aceita e uma descartada.
insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, tipo_id, numero, criado_por)
values ('54000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-00000000000a',
        '54000000-0000-4000-8000-0000000000e1', '54000000-0000-4000-8000-0000000000f1',
        (select t.id from public.tipo_instrumento as t
         where t.consultoria_id = 'c0000000-0000-4000-8000-00000000000a' and t.sigla = 'LAO'),
        '4821/2023', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.condicionante (id, consultoria_id, instrumento_id, codigo, posicao, revisao)
values ('54000000-0000-4000-8000-000000000021', 'c0000000-0000-4000-8000-00000000000a',
        '54000000-0000-4000-8000-000000000011', '2.1', 1, 'aceita'),
       ('54000000-0000-4000-8000-000000000022', 'c0000000-0000-4000-8000-00000000000a',
        '54000000-0000-4000-8000-000000000011', '2.2', 2, 'descartada');
insert into public.condicionante_versao (id, consultoria_id, condicionante_id, titulo, natureza)
values ('54000000-0000-4000-8000-000000000031', 'c0000000-0000-4000-8000-00000000000a',
        '54000000-0000-4000-8000-000000000021', 'Relatório de Monitoramento de Efluentes', 'obrigacao'),
       ('54000000-0000-4000-8000-000000000032', 'c0000000-0000-4000-8000-00000000000a',
        '54000000-0000-4000-8000-000000000022', 'Monitoramento descartado', 'obrigacao');
update public.condicionante as c
set versao_vigente_id = v.id
from public.condicionante_versao as v
where v.condicionante_id = c.id and c.id in ('54000000-0000-4000-8000-000000000021',
                                             '54000000-0000-4000-8000-000000000022');

-- ORC-2026-007 na lista e ORC-2026-008 na lixeira.
insert into public.orcamento (id, consultoria_id, ano, sequencia, empreendimento_id, objeto, criado_por,
                              excluido_em, excluido_por)
values ('54000000-0000-4000-8000-000000000041', 'c0000000-0000-4000-8000-00000000000a', 2026, 7,
        '54000000-0000-4000-8000-0000000000e1', 'Licenciamento da Metalúrgica',
        'd0000000-0000-4000-8000-0000000000a1', null, null),
       ('54000000-0000-4000-8000-000000000042', 'c0000000-0000-4000-8000-00000000000a', 2026, 8,
        '54000000-0000-4000-8000-0000000000e2', 'Monitoramento na lixeira',
        'd0000000-0000-4000-8000-0000000000a1', now(), 'd0000000-0000-4000-8000-0000000000a1');

-- Carteira de B, com nome parecido.
insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('54000000-0000-4000-8000-0000000000b1', 'c0000000-0000-4000-8000-00000000000b',
        'Metalúrgica Verde Sul', 'd0000000-0000-4000-8000-0000000000b1');

-- ---------------------------------------------------------------------------
-- Contrato da função
-- ---------------------------------------------------------------------------
select ok(
  not (select p.prosecdef from pg_catalog.pg_proc as p
       where p.oid = 'public.buscar_no_grama(uuid, text)'::regprocedure),
  'security invoker: a RLS de quem chama decide o que volta'
);

select ok(
  has_function_privilege('authenticated', 'public.buscar_no_grama(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.buscar_no_grama(uuid, text)', 'execute'),
  'só authenticated executa'
);

-- ---------------------------------------------------------------------------
-- Gestão de A
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');

select results_eq(
  $$select tipo, id from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'METALURGICA sao joao')$$,
  $$values ('empreendimento'::text, '54000000-0000-4000-8000-0000000000e1'::uuid),
           ('orcamento'::text, '54000000-0000-4000-8000-000000000041'::uuid)$$,
  'acha empreendimento e orçamento por trecho sem acento e sem caixa, empreendimento primeiro'
);

select results_eq(
  $$select tipo, id, titulo, detalhe, referencia_id
    from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'monitoramento')$$,
  $$values ('condicionante'::text, '54000000-0000-4000-8000-000000000021'::uuid,
            'Relatório de Monitoramento de Efluentes'::text,
            'Condicionante 2.1 · LAO 4821/2023 · Metalúrgica São João'::text,
            '54000000-0000-4000-8000-0000000000e1'::uuid)$$,
  'condicionante aponta para o empreendimento; descartada e orçamento na lixeira não aparecem'
);

select results_eq(
  $$select id from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'relatório')$$,
  $$values ('54000000-0000-4000-8000-000000000021'::uuid)$$,
  'termo com acento acha o mesmo'
);

select results_eq(
  $$select tipo, id, titulo, detalhe, referencia_id
    from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', '4821')$$,
  $$values ('licenca'::text, '54000000-0000-4000-8000-000000000011'::uuid, 'LAO 4821/2023'::text,
            'Metalúrgica São João'::text, '54000000-0000-4000-8000-0000000000e1'::uuid)$$,
  'acha a licença pelo número e aponta para o empreendimento'
);

select results_eq(
  $$select tipo, id from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'lao 4821')$$,
  $$values ('licenca'::text, '54000000-0000-4000-8000-000000000011'::uuid)$$,
  'acha a licença pelo tipo e número'
);

select results_eq(
  $$select tipo, id from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', '11.222.333')$$,
  $$values ('empreendimento'::text, '54000000-0000-4000-8000-0000000000e1'::uuid)$$,
  'acha o empreendimento por trecho do CNPJ com pontuação'
);

select results_eq(
  $$select tipo, id, titulo from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'acoriano')$$,
  $$values ('empreendimento'::text, '54000000-0000-4000-8000-0000000000e1'::uuid, 'Metalúrgica São João'::text)$$,
  'acha o empreendimento pelo nome do cliente'
);

select results_eq(
  $$select tipo, id, titulo, detalhe, referencia_id
    from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'ORC-2026-007')$$,
  $$values ('orcamento'::text, '54000000-0000-4000-8000-000000000041'::uuid, 'Licenciamento da Metalúrgica'::text,
            'ORC-2026-007 · Metalúrgica São João'::text, '54000000-0000-4000-8000-000000000041'::uuid)$$,
  'acha o orçamento pelo número'
);

select is(
  (select count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'posto alfa')),
  5::bigint,
  'no máximo 5 por tipo'
);

select is(
  (select count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', ' m '))
  + (select count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', ''))
  + (select count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', null)),
  0::bigint,
  'termo com menos de 2 caracteres (ou vazio) não busca'
);

select is(
  (select count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', '%%')),
  0::bigint,
  'curinga do LIKE é texto, não padrão'
);

-- ---------------------------------------------------------------------------
-- Equipe de A: tudo menos orçamento (a RLS de orcamento é só da Gestão)
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select results_eq(
  $$select tipo, id from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'metalurgica')$$,
  $$values ('empreendimento'::text, '54000000-0000-4000-8000-0000000000e1'::uuid)$$,
  'Equipe (Ana) acha o empreendimento, mas não o orçamento'
);

select is(
  (select count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'ORC-2026-007')),
  0::bigint,
  'Equipe (Ana) não acha orçamento nem pelo número'
);

select results_eq(
  $$select tipo from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', '4821')$$,
  $$values ('licenca'::text)$$,
  'Equipe (Ana) acha a licença'
);

-- ---------------------------------------------------------------------------
-- Outra consultoria e anon
-- ---------------------------------------------------------------------------
select testes.autenticar_como('gustavo@verdesul.test');

select is(
  (select count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'metalurgica'))
  + (select count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', '4821'))
  + (select count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'monitoramento'))
  + (select count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'ORC-2026-007')),
  0::bigint,
  'Gestão de outra consultoria recebe zero linhas mesmo passando o id de A'
);

select results_eq(
  $$select tipo, id from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000b', 'metalurgica')$$,
  $$values ('empreendimento'::text, '54000000-0000-4000-8000-0000000000b1'::uuid)$$,
  'na própria consultoria, Gustavo só acha o que é de B'
);

select testes.autenticar_como_anonimo();
select throws_ok(
  $$select * from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'metalurgica')$$,
  '42501', null,
  'sem login não executa a busca'
);

select * from finish();

rollback;
