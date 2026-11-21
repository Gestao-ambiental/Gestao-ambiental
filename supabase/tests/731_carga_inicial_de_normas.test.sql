-- Carga inicial do catálogo de normas (migration 20261120230100, gerada por
-- scripts/normas/gerar-carga-inicial.mjs): as 82 INs da página in.ima.sc.gov.br (24 revogadas,
-- contando a IN 84), a Portaria IMA 096/2026 que revogou a IN 84, as normas estaduais de base e os
-- 309 critérios de atividade do Simulador do IMA. Se a carga for gerada de novo com outra página,
-- os números fixos daqui mudam de propósito.
begin;

select plan(17);

select testes.criar_dados_sinteticos();

-- ---------------------------------------------------------------------------
-- INs do IMA (como dono das tabelas)
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from private.norma where fonte = 'ima_in' and tipo = 'instrucao_normativa'),
  82::bigint,
  'carga traz as 82 INs da página do IMA'
);

select is(
  (select count(*) from private.norma where fonte = 'ima_in' and situacao_na_fonte = 'revogada'),
  24::bigint,
  '24 INs revogadas (as 23 que o site marca e a IN 84)'
);

select is(
  (select count(*) from private.norma where fonte = 'ima_in' and titulo ilike '%revogada%'),
  0::bigint,
  'título da IN sai sem o sufixo (REVOGADA)'
);

select results_eq(
  $$select titulo, url_oficial, id_externo, situacao_na_fonte
    from private.norma where chave = 'sc;ima;instrucao_normativa;2'$$,
  $$values ('IN 2 · Disposição final de rejeitos em aterros',
            'https://in.ima.sc.gov.br/instrucaoNormativa/visualizar/344', '2', 'vigente')$$,
  'IN 2 em caixa de frase, com o link da versão e vigente'
);

select is(
  (select titulo from private.norma where chave = 'sc;ima;instrucao_normativa;43'),
  'IN 43 · Supressão de vegetação (espécies exóticas) em áreas de preservação permanente (APP) - em área urbana e rural',
  'caixa de frase mantém a sigla APP'
);

-- ---------------------------------------------------------------------------
-- Correção da IN 84 (Portaria IMA 096/2026, DOE 22734 de 14/04/2026)
-- ---------------------------------------------------------------------------
select results_eq(
  $$select esfera, orgao, tipo, numero, ano, titulo, fonte
    from private.norma where chave = 'sc;ima;portaria;96;2026'$$,
  $$values ('estadual', 'IMA', 'portaria', '96', 2026, 'Portaria IMA 096/2026', 'ima_portaria')$$,
  'Portaria IMA 096/2026 está no catálogo'
);

select results_eq(
  $$select situacao_na_fonte, revogada_em from private.norma where chave = 'sc;ima;instrucao_normativa;84'$$,
  $$values ('revogada', '2026-04-14'::date)$$,
  'IN 84 revogada em 14/04/2026 mesmo sem o site marcar'
);

select is(
  (select revogada_por from private.norma where chave = 'sc;ima;instrucao_normativa;84'),
  (select id from private.norma where chave = 'sc;ima;portaria;96;2026'),
  'IN 84 aponta para a portaria que a revogou'
);

-- ---------------------------------------------------------------------------
-- Critérios de atividade do Simulador do IMA
-- ---------------------------------------------------------------------------
select ok(
  (select count(*) >= 1 from private.norma_criterio as c
   join private.norma as n on n.id = c.norma_id
   where n.chave = 'sc;ima;instrucao_normativa;2' and c.tipo = 'atividade'
     and c.origem = 'simulador_ima'),
  'IN 2 tem ao menos uma atividade CONSEMA'
);

select is(
  (select count(*) from private.norma_criterio where tipo = 'atividade' and origem = 'simulador_ima'),
  309::bigint,
  'as 309 atividades do simulador ligadas a uma IN'
);

select is(
  (select count(*) from private.norma_criterio
   where tipo = 'atividade' and valor !~ '^[0-9]{2}\.[0-9]{2}\.[0-9]{2}$'),
  0::bigint,
  'nenhum critério de atividade fora do formato 00.00.00'
);

select is(
  (select count(*) from private.norma_criterio as c
   join private.norma as n on n.id = c.norma_id
   where c.tipo = 'atividade' and n.tipo <> 'instrucao_normativa'),
  0::bigint,
  'critério de atividade do simulador só liga IN'
);

-- ---------------------------------------------------------------------------
-- Normas estaduais de base
-- ---------------------------------------------------------------------------
select results_eq(
  $$select n.fonte, n.id_externo, n.url_oficial, c.valor
    from private.norma as n join private.norma_criterio as c on c.norma_id = n.id and c.tipo = 'competencia'
    where n.chave = 'sc;consema;resolucao;250;2024'$$,
  $$values ('consema', '3480', 'https://www.semae.sc.gov.br/?wpdmdl=3480', 'estadual')$$,
  'CONSEMA 250/2024 presente, com competência estadual'
);

select results_eq(
  $$select n.fonte, n.id_externo, n.url_oficial, c.valor
    from private.norma as n join private.norma_criterio as c on c.norma_id = n.id and c.tipo = 'competencia'
    where n.chave = 'sc;consema;resolucao;251;2024'$$,
  $$values ('consema', '3481', 'https://www.semae.sc.gov.br/?wpdmdl=3481', 'municipal')$$,
  'CONSEMA 251/2024 presente, com competência municipal'
);

select results_eq(
  $$select c.valor from private.norma as n
    join private.norma_criterio as c on c.norma_id = n.id and c.tipo = 'competencia'
    where n.chave = 'sc;alesc;lei;14675;2009' order by c.valor$$,
  $$values ('estadual'), ('municipal')$$,
  'Código Estadual do Meio Ambiente vale para as duas competências'
);

select results_eq(
  $$select chave from private.norma where 'taxas' = any (temas) order by chave$$,
  $$values ('sc;alesc;lei;14262;2007'), ('sc;executivo;decreto;421;2023')$$,
  'Lei 14.262/2007 e Decreto 421/2023 no tema taxas'
);

-- ---------------------------------------------------------------------------
-- Membro ativo encontra a carga pela busca
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');

select results_eq(
  $$select chave from public.buscar_normas('IN 02') where chave like 'sc;ima;%'$$,
  $$values ('sc;ima;instrucao_normativa;2')$$,
  'busca "IN 02" acha a IN 2 da carga'
);

select * from finish();
rollback;
