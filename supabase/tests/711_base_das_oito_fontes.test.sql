-- Base das oito funções (P0): fontes de prazo e grupos da busca em funções separadas; filtro por
-- cliente; "sem responsável" por tipo; documento com as entidades novas. Os stubs de exigência e
-- vencimento nascem vazios; aqui são redefinidos dentro da transação (como o P3 e o P4 farão) para
-- provar que a união e os filtros já os tratam. Outra consultoria recebe zero linhas.
begin;

set local timezone to 'America/Sao_Paulo';

select plan(36);

select testes.criar_dados_sinteticos();

select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

-- ---------------------------------------------------------------------------
-- Cenário (como dono das tabelas)
-- A: E1 (cliente C1) com LAO ativa (validade h+300, limite h+180); E2 sem cliente com AuA ativa
--    (validade h+50). Para a busca, "Zeta": 6 empreendimentos, 6 licenças em rascunho,
--    6 condicionantes e 6 orçamentos.
-- B: EB (cliente CB) com AuA ativa (validade h+20).
-- ---------------------------------------------------------------------------
insert into public.cliente (id, consultoria_id, nome) values
  ('71100000-0000-4000-8000-0000000000c1', 'c0000000-0000-4000-8000-00000000000a', 'Grupo Açoriano'),
  ('71100000-0000-4000-8000-0000000000cb', 'c0000000-0000-4000-8000-00000000000b', 'Grupo Sulino');

insert into public.empreendimento (id, consultoria_id, nome, cliente_id, criado_por) values
  ('71100000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a', 'Metalúrgica Açores',
   '71100000-0000-4000-8000-0000000000c1', 'd0000000-0000-4000-8000-0000000000a1'),
  ('71100000-0000-4000-8000-0000000000e2', 'c0000000-0000-4000-8000-00000000000a', 'Padaria Central',
   null, 'd0000000-0000-4000-8000-0000000000a1'),
  ('71100000-0000-4000-8000-0000000000eb', 'c0000000-0000-4000-8000-00000000000b', 'Metalúrgica Verde Sul',
   '71100000-0000-4000-8000-0000000000cb', 'd0000000-0000-4000-8000-0000000000b1');
insert into public.empreendimento (consultoria_id, nome, criado_por)
select 'c0000000-0000-4000-8000-00000000000a', 'Zeta ' || n::text, 'd0000000-0000-4000-8000-0000000000a1'
from generate_series(1, 6) as n;

insert into public.unidade (id, consultoria_id, empreendimento_id, nome) values
  ('71100000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
   '71100000-0000-4000-8000-0000000000e1', 'Matriz'),
  ('71100000-0000-4000-8000-0000000000f2', 'c0000000-0000-4000-8000-00000000000a',
   '71100000-0000-4000-8000-0000000000e2', 'Loja'),
  ('71100000-0000-4000-8000-0000000000fb', 'c0000000-0000-4000-8000-00000000000b',
   '71100000-0000-4000-8000-0000000000eb', 'Fábrica');

insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, tipo_id, numero, situacao,
                                assinado_em, marco, validade, criado_por, ativado_em, ativado_por,
                                chave_ativacao)
select x.id, x.cid, x.eid, x.uid,
       (select t.id from public.tipo_instrumento as t where t.consultoria_id = x.cid and t.sigla = x.sigla),
       x.numero, 'ativo', current_setting('testes.hoje')::date - 30, 'assinatura',
       current_setting('testes.hoje')::date + x.validade, x.autor, now(), x.autor, gen_random_uuid()
from (values
  ('71100000-0000-4000-8000-000000000011'::uuid, 'c0000000-0000-4000-8000-00000000000a'::uuid,
   '71100000-0000-4000-8000-0000000000e1'::uuid, '71100000-0000-4000-8000-0000000000f1'::uuid,
   'LAO', '2001/2024', 300, 'd0000000-0000-4000-8000-0000000000a1'::uuid),
  ('71100000-0000-4000-8000-000000000012', 'c0000000-0000-4000-8000-00000000000a',
   '71100000-0000-4000-8000-0000000000e2', '71100000-0000-4000-8000-0000000000f2',
   'AuA', '20/2025', 50, 'd0000000-0000-4000-8000-0000000000a1'),
  ('71100000-0000-4000-8000-0000000000b1', 'c0000000-0000-4000-8000-00000000000b',
   '71100000-0000-4000-8000-0000000000eb', '71100000-0000-4000-8000-0000000000fb',
   'AuA', '30/2025', 20, 'd0000000-0000-4000-8000-0000000000b1')
) as x (id, cid, eid, uid, sigla, numero, validade, autor);

-- Licenças "Zeta" em rascunho (não geram prazo), com uma condicionante aceita cada.
insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, tipo_id, numero, criado_por)
select ('71100000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid,
       'c0000000-0000-4000-8000-00000000000a', '71100000-0000-4000-8000-0000000000e1',
       '71100000-0000-4000-8000-0000000000f1',
       (select t.id from public.tipo_instrumento as t
        where t.consultoria_id = 'c0000000-0000-4000-8000-00000000000a' and t.sigla = 'LAO'),
       'ZETA-' || n::text, 'd0000000-0000-4000-8000-0000000000a1'
from generate_series(1, 6) as n;
insert into public.condicionante (id, consultoria_id, instrumento_id, codigo, posicao, revisao)
select ('71100000-0000-4000-8000-0000000003' || lpad(n::text, 2, '0'))::uuid,
       'c0000000-0000-4000-8000-00000000000a',
       ('71100000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid, 'Z.' || n::text, 1, 'aceita'
from generate_series(1, 6) as n;
insert into public.condicionante_versao (id, consultoria_id, condicionante_id, titulo, natureza)
select ('71100000-0000-4000-8000-0000000004' || lpad(n::text, 2, '0'))::uuid,
       'c0000000-0000-4000-8000-00000000000a',
       ('71100000-0000-4000-8000-0000000003' || lpad(n::text, 2, '0'))::uuid, 'Zeta ' || n::text, 'obrigacao'
from generate_series(1, 6) as n;
update public.condicionante as c
set versao_vigente_id = v.id
from public.condicionante_versao as v
where v.condicionante_id = c.id and c.codigo like 'Z.%';
insert into public.orcamento (consultoria_id, ano, sequencia, empreendimento_id, objeto, criado_por)
select 'c0000000-0000-4000-8000-00000000000a', 2026, 700 + n, '71100000-0000-4000-8000-0000000000e1',
       'Zeta ' || n::text, 'd0000000-0000-4000-8000-0000000000a1'
from generate_series(1, 6) as n;

-- ---------------------------------------------------------------------------
-- Estrutura: fontes, grupos e grants
-- ---------------------------------------------------------------------------
select ok(
  to_regprocedure('private.linhas_de_prazo_ocorrencia(uuid)') is not null
  and to_regprocedure('private.linhas_de_prazo_validade(uuid)') is not null
  and to_regprocedure('private.linhas_de_prazo_limite_protocolo(uuid)') is not null
  and to_regprocedure('private.linhas_de_prazo_alvara(uuid)') is not null
  and to_regprocedure('private.linhas_de_prazo_exigencia(uuid)') is not null
  and to_regprocedure('private.linhas_de_prazo_vencimento(uuid)') is not null,
  'as seis fontes de prazo existem'
);

select ok(
  (select bool_and(pg_catalog.pg_get_functiondef('private.linhas_de_prazo(uuid)'::regprocedure)
                   like '%private.linhas_de_prazo_' || f || '(cid)%')
   from unnest(array['ocorrencia', 'validade', 'limite_protocolo', 'alvara', 'exigencia', 'vencimento']) as f),
  'private.linhas_de_prazo é a união das seis fontes'
);

select ok(
  to_regprocedure('private.busca_empreendimentos(uuid, text)') is not null
  and to_regprocedure('private.busca_licencas(uuid, text)') is not null
  and to_regprocedure('private.busca_condicionantes(uuid, text)') is not null
  and to_regprocedure('private.busca_orcamentos(uuid, text)') is not null
  and to_regprocedure('private.busca_exigencias(uuid, text)') is not null
  and to_regprocedure('private.busca_vencimentos(uuid, text)') is not null,
  'os seis grupos da busca existem'
);

select ok(
  (select bool_and(pg_catalog.pg_get_functiondef('public.buscar_no_grama(uuid, text)'::regprocedure)
                   like '%private.busca_' || g || '(p_consultoria_id, p_termo)%')
   from unnest(array['empreendimentos', 'licencas', 'condicionantes', 'orcamentos', 'exigencias',
                     'vencimentos']) as g),
  'buscar_no_grama é a união dos seis grupos'
);

select ok(
  has_function_privilege('authenticated', 'private.linhas_de_prazo_exigencia(uuid)', 'execute')
  and has_function_privilege('authenticated', 'private.linhas_de_prazo_vencimento(uuid)', 'execute')
  and has_function_privilege('authenticated', 'private.busca_exigencias(uuid, text)', 'execute')
  and has_function_privilege('authenticated', 'private.busca_vencimentos(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'private.linhas_de_prazo_exigencia(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.busca_vencimentos(uuid, text)', 'execute'),
  'fontes e grupos novos: authenticated executa, anon não'
);

select ok(
  has_function_privilege('authenticated',
    'public.listar_prazos(uuid, text, uuid, boolean, uuid, uuid, text, text, integer, integer, uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.contar_prazos(uuid, text, uuid, boolean, uuid, uuid, uuid)',
    'execute')
  and not has_function_privilege('anon',
    'public.listar_prazos(uuid, text, uuid, boolean, uuid, uuid, text, text, integer, integer, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.contar_prazos(uuid, text, uuid, boolean, uuid, uuid, uuid)',
    'execute')
  and to_regprocedure('public.listar_prazos(uuid, text, uuid, boolean, uuid, uuid, text, text, integer, integer)')
    is null
  and to_regprocedure('public.contar_prazos(uuid, text, uuid, boolean, uuid, uuid)') is null,
  'listar_prazos e contar_prazos só na assinatura nova, só para authenticated'
);

-- ---------------------------------------------------------------------------
-- Stubs vazios
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');

select is(
  (select count(*) from private.linhas_de_prazo_exigencia('c0000000-0000-4000-8000-00000000000a')),
  0::bigint,
  'fonte de exigência nasce vazia'
);

select is(
  (select count(*) from private.linhas_de_prazo_vencimento('c0000000-0000-4000-8000-00000000000a')),
  0::bigint,
  'fonte de vencimento nasce vazia'
);

select is(
  (select count(*) from private.busca_exigencias('c0000000-0000-4000-8000-00000000000a', 'zeta'))
  + (select count(*) from private.busca_vencimentos('c0000000-0000-4000-8000-00000000000a', 'zeta')),
  0::bigint,
  'grupos de exigências e vencimentos da busca nascem vazios'
);

select results_eq(
  $$select tipo, count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'zeta')
    group by tipo order by tipo$$,
  $$values ('condicionante'::text, 5::bigint), ('empreendimento', 5::bigint), ('licenca', 5::bigint),
           ('orcamento', 5::bigint)$$,
  'busca: 5 por grupo e nada de exigência ou vencimento enquanto vazios'
);

-- ---------------------------------------------------------------------------
-- Filtro por cliente
-- ---------------------------------------------------------------------------
select results_eq(
  $$select tipo_linha, id from public.listar_prazos('c0000000-0000-4000-8000-00000000000a',
      p_cliente_id => '71100000-0000-4000-8000-0000000000c1')$$,
  $$values ('limite_protocolo', '71100000-0000-4000-8000-000000000011'::uuid),
           ('validade', '71100000-0000-4000-8000-000000000011'::uuid)$$,
  'listar_prazos por cliente: só os empreendimentos do cliente'
);

select results_eq(
  $$select total from public.contar_prazos('c0000000-0000-4000-8000-00000000000a',
      p_cliente_id => '71100000-0000-4000-8000-0000000000c1')$$,
  $$values (2::bigint)$$,
  'contar_prazos por cliente'
);

select is(
  (select count(*) from public.listar_prazos('c0000000-0000-4000-8000-00000000000a',
     p_cliente_id => '71100000-0000-4000-8000-0000000000cb')),
  0::bigint,
  'cliente de outra consultoria devolve zero linhas'
);

select results_eq(
  $$select atrasadas, hoje, proximos_7, sem_responsavel, total
    from public.contar_prazos('c0000000-0000-4000-8000-00000000000a',
      p_cliente_id => '71100000-0000-4000-8000-0000000000cb')$$,
  $$values (0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint)$$,
  'cliente de outra consultoria conta zero'
);

-- ---------------------------------------------------------------------------
-- P3 e P4 redefinem só a fonte e o grupo (create or replace): a união e os filtros já os tratam.
-- Exigência E1 h+2 sem responsável; exigência E1 h+3 da Ana; vencimento E2 h+5.
-- ---------------------------------------------------------------------------
reset role;

create or replace function private.linhas_de_prazo_exigencia(cid uuid)
returns table (
  tipo_linha text, id uuid, instrumento_id uuid, prazo date, dias integer, codigo text, titulo text,
  empreendimento_id uuid, empreendimento_nome text, unidade_id uuid, unidade_nome text, licenca text,
  tipo_id uuid, responsavel_id uuid, responsavel_nome text, situacao_ocorrencia public.situacao_ocorrencia,
  meta_interna date, row_version integer
)
language sql
stable
set search_path = ''
as $$
  select 'exigencia'::text, x.id, '71100000-0000-4000-8000-000000000011'::uuid,
         private.hoje_da_consultoria(cid) + x.d, x.d, null::text, x.titulo, e.id, e.nome, u.id, u.nome,
         null::text, null::uuid, x.resp, m.nome, null::public.situacao_ocorrencia, null::date, 1
  from (values ('71100000-0000-4000-8000-000000000081'::uuid, 2, 'Exigência sem dono', null::uuid),
               ('71100000-0000-4000-8000-000000000082', 3, 'Exigência da Ana',
                'd0000000-0000-4000-8000-0000000000a2'::uuid)) as x (id, d, titulo, resp)
  join public.empreendimento as e
    on e.consultoria_id = cid and e.id = '71100000-0000-4000-8000-0000000000e1'
  join public.unidade as u on u.consultoria_id = e.consultoria_id and u.empreendimento_id = e.id
  left join public.membro as m on m.consultoria_id = cid and m.id = x.resp
$$;

create or replace function private.linhas_de_prazo_vencimento(cid uuid)
returns table (
  tipo_linha text, id uuid, instrumento_id uuid, prazo date, dias integer, codigo text, titulo text,
  empreendimento_id uuid, empreendimento_nome text, unidade_id uuid, unidade_nome text, licenca text,
  tipo_id uuid, responsavel_id uuid, responsavel_nome text, situacao_ocorrencia public.situacao_ocorrencia,
  meta_interna date, row_version integer
)
language sql
stable
set search_path = ''
as $$
  select 'vencimento'::text, '71100000-0000-4000-8000-000000000091'::uuid, null::uuid,
         private.hoje_da_consultoria(cid) + 5, 5, null::text, 'Seguro'::text, e.id, e.nome, u.id, u.nome,
         null::text, null::uuid, null::uuid, null::text, null::public.situacao_ocorrencia, null::date, 1
  from public.empreendimento as e
  join public.unidade as u on u.consultoria_id = e.consultoria_id and u.empreendimento_id = e.id
  where e.consultoria_id = cid and e.id = '71100000-0000-4000-8000-0000000000e2'
$$;

create or replace function private.busca_exigencias(p_consultoria_id uuid, p_termo text)
returns table (id uuid, titulo text, detalhe text, referencia_id uuid, posicao bigint)
language sql
stable
set search_path = ''
as $$
  select e.id, e.nome, null::text, e.id, row_number() over (order by e.nome_normalizado)
  from private.termo_de_busca(p_termo) as b
  join public.empreendimento as e on e.consultoria_id = p_consultoria_id and e.nome_normalizado like b.padrao
$$;

create or replace function private.busca_vencimentos(p_consultoria_id uuid, p_termo text)
returns table (id uuid, titulo text, detalhe text, referencia_id uuid, posicao bigint)
language sql
stable
set search_path = ''
as $$
  select e.id, e.nome, null::text, e.id, row_number() over (order by e.nome_normalizado)
  from private.termo_de_busca(p_termo) as b
  join public.empreendimento as e on e.consultoria_id = p_consultoria_id and e.nome_normalizado like b.padrao
$$;

select testes.autenticar_como('eduardo@filtroville.test');

select results_eq(
  $$select tipo_linha, id, dias, total from public.listar_prazos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values ('exigencia', '71100000-0000-4000-8000-000000000081'::uuid, 2, 6::bigint),
           ('exigencia', '71100000-0000-4000-8000-000000000082'::uuid, 3, 6::bigint),
           ('vencimento', '71100000-0000-4000-8000-000000000091'::uuid, 5, 6::bigint),
           ('validade', '71100000-0000-4000-8000-000000000012'::uuid, 50, 6::bigint),
           ('limite_protocolo', '71100000-0000-4000-8000-000000000011'::uuid, 180, 6::bigint),
           ('validade', '71100000-0000-4000-8000-000000000011'::uuid, 300, 6::bigint)$$,
  'exigência e vencimento entram na lista sem mexer na união'
);

select results_eq(
  $$select id from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_sem_responsavel => true)$$,
  $$values ('71100000-0000-4000-8000-000000000081'::uuid)$$,
  'sem responsável: exigência sem dono entra; vencimento, validade e limite não'
);

select results_eq(
  $$select id from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_faixa => 'sem_responsavel')$$,
  $$values ('71100000-0000-4000-8000-000000000081'::uuid)$$,
  'faixa sem responsável: só tipos que têm responsável'
);

select results_eq(
  $$select atrasadas, hoje, proximos_7, sem_responsavel, total
    from public.contar_prazos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values (0::bigint, 0::bigint, 3::bigint, 1::bigint, 6::bigint)$$,
  'contadores: vencimento conta no prazo, não em sem responsável'
);

select results_eq(
  $$select tipo_linha, id from public.listar_prazos('c0000000-0000-4000-8000-00000000000a',
      p_cliente_id => '71100000-0000-4000-8000-0000000000c1')$$,
  $$values ('exigencia', '71100000-0000-4000-8000-000000000081'::uuid),
           ('exigencia', '71100000-0000-4000-8000-000000000082'::uuid),
           ('limite_protocolo', '71100000-0000-4000-8000-000000000011'::uuid),
           ('validade', '71100000-0000-4000-8000-000000000011'::uuid)$$,
  'filtro por cliente vale para as fontes novas'
);

select results_eq(
  $$select sem_responsavel, total from public.contar_prazos('c0000000-0000-4000-8000-00000000000a',
      p_cliente_id => '71100000-0000-4000-8000-0000000000c1')$$,
  $$values (1::bigint, 4::bigint)$$,
  'contar por cliente com as fontes novas'
);

select is(
  (select count(*) from public.listar_prazos('c0000000-0000-4000-8000-00000000000a',
     p_tipo_id => (select id from public.tipo_instrumento where sigla = 'LAO'
                     and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'))),
  2::bigint,
  'filtro por tipo de licença não traz exigência nem vencimento (tipo_id nulo)'
);

select testes.autenticar_como('ana@filtroville.test');

select results_eq(
  $$select id from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_aba => 'minhas')$$,
  $$values ('71100000-0000-4000-8000-000000000082'::uuid)$$,
  'Minhas ações traz a exigência da Ana'
);

select results_eq(
  $$select tipo_evento, id, sem_responsavel
    from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
      current_setting('testes.hoje')::date, current_setting('testes.hoje')::date + 10)$$,
  $$values ('exigencia'::text, '71100000-0000-4000-8000-000000000081'::uuid, true),
           ('exigencia', '71100000-0000-4000-8000-000000000082'::uuid, false),
           ('vencimento', '71100000-0000-4000-8000-000000000091'::uuid, false)$$,
  'calendário: exigência e vencimento com o tipo próprio; vencimento nunca "sem responsável"'
);

select results_eq(
  $$select id from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
      current_setting('testes.hoje')::date, current_setting('testes.hoje')::date + 10, p_sem_responsavel => true)$$,
  $$values ('71100000-0000-4000-8000-000000000081'::uuid)$$,
  'calendário sem responsável: só a exigência sem dono'
);

select testes.autenticar_como('eduardo@filtroville.test');

select is(
  (select count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'zeta')),
  30::bigint,
  'busca com os seis grupos cheios: 30 no total'
);

select results_eq(
  $$select tipo, count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'zeta')
    group by tipo order by tipo$$,
  $$values ('condicionante'::text, 5::bigint), ('empreendimento', 5::bigint), ('exigencia', 5::bigint),
           ('licenca', 5::bigint), ('orcamento', 5::bigint), ('vencimento', 5::bigint)$$,
  'busca: 5 por grupo, inclusive exigências e vencimentos'
);

select results_eq(
  $$select distinct tipo from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'zeta')
    where tipo in ('exigencia', 'vencimento') order by tipo$$,
  $$values ('exigencia'::text), ('vencimento')$$,
  'grupos novos usam os tipos exigencia e vencimento'
);

select testes.autenticar_como('ana@filtroville.test');

select results_eq(
  $$select tipo, count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'zeta')
    group by tipo order by tipo$$,
  $$values ('condicionante'::text, 5::bigint), ('empreendimento', 5::bigint), ('exigencia', 5::bigint),
           ('licenca', 5::bigint), ('vencimento', 5::bigint)$$,
  'Equipe continua sem orçamento na busca'
);

-- ---------------------------------------------------------------------------
-- Outra consultoria
-- ---------------------------------------------------------------------------
select testes.autenticar_como('gustavo@verdesul.test');

select is(
  (select count(*) from public.listar_prazos('c0000000-0000-4000-8000-00000000000a')),
  0::bigint,
  'Gestão de B lista prazos de A (com as fontes novas) e recebe zero linhas'
);

select is(
  (select count(*) from public.listar_prazos('c0000000-0000-4000-8000-00000000000a',
     p_cliente_id => '71100000-0000-4000-8000-0000000000c1')),
  0::bigint,
  'Gestão de B filtra pelo cliente de A e recebe zero linhas'
);

select results_eq(
  $$select total from public.contar_prazos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values (0::bigint)$$,
  'Gestão de B conta prazos de A e recebe zero'
);

select is(
  (select count(*) from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
     current_setting('testes.hoje')::date, current_setting('testes.hoje')::date + 10)),
  0::bigint,
  'Gestão de B não vê o calendário de A'
);

select is(
  (select count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'zeta')),
  0::bigint,
  'Gestão de B busca em A e recebe zero linhas'
);

select results_eq(
  $$select tipo_linha, id from public.listar_prazos('c0000000-0000-4000-8000-00000000000b',
      p_cliente_id => '71100000-0000-4000-8000-0000000000cb')$$,
  $$values ('validade', '71100000-0000-4000-8000-0000000000b1'::uuid)$$,
  'B filtra pelo próprio cliente'
);

-- ---------------------------------------------------------------------------
-- Documento: entidades novas
-- ---------------------------------------------------------------------------
reset role;

select lives_ok(
  $$insert into public.documento (consultoria_id, entidade)
    select 'c0000000-0000-4000-8000-00000000000a', e
    from unnest(array['alvara', 'exigencia', 'exigencia_resposta', 'vencimento', 'importacao']) as e$$,
  'documento aceita alvara, exigencia, exigencia_resposta, vencimento e importacao'
);

select throws_ok(
  $$insert into public.documento (consultoria_id, entidade)
    values ('c0000000-0000-4000-8000-00000000000a', 'inventada')$$,
  '23514', null,
  'documento recusa entidade inventada'
);

select * from finish();

rollback;
