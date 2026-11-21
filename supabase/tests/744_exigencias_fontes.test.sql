-- Exigências do órgão (P3, ADR-0045): a fonte de prazo e o grupo da busca, com dados reais.
-- Exigência aberta aparece na Visão (listar_prazos e contar_prazos), no Calendário e na busca
-- (título "Ofício N"); "sem responsável" e "Minhas" valem para ela; respondida e excluída saem da
-- fonte; o filtro por tipo de licença não a traz; outra consultoria recebe zero.
begin;

set local timezone to 'America/Sao_Paulo';

select plan(23);

select testes.criar_dados_sinteticos();

select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

create function testes.h(n integer)
returns date
language sql
stable
as $$
  select current_setting('testes.hoje')::date + n
$$;

grant execute on function testes.h(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Cenário: licença em rascunho (não gera prazo) e quatro exigências:
--   a1 aberta, ofício 45/2026, Ana responsável, licença ligada, prazo h+5;
--   a2 aberta, sem ofício e sem responsável, prazo informado h-2 (atrasada);
--   a3 respondida (ofício 46/2026); a4 excluída (ofício 47/2026).
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_empreendimento('74400000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
  'Mineradora Quartzito');
select public.criar_unidade('74400000-0000-4000-8000-0000000000f1', '74400000-0000-4000-8000-0000000000e1',
  'Lavra');

reset role;
insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, tipo_id, numero, criado_por)
select '74400000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-00000000000a',
       '74400000-0000-4000-8000-0000000000e1', '74400000-0000-4000-8000-0000000000f1', t.id, '744/2026',
       'd0000000-0000-4000-8000-0000000000a1'
from public.tipo_instrumento as t
where t.consultoria_id = 'c0000000-0000-4000-8000-00000000000a' and t.sigla = 'LAO';

select testes.autenticar_como('eduardo@filtroville.test');
select public.registrar_exigencia(p_id => '74400000-0000-4000-8000-0000000000a1',
  p_unidade_id => '74400000-0000-4000-8000-0000000000f1', p_assunto => 'Plano de recuperação de área degradada',
  p_recebido_em => testes.h(-5), p_prazo_oficial => testes.h(5), p_meta_interna => testes.h(4),
  p_prazo_dias => 10, p_prazo_contagem => 'corridos', p_instrumento_id => '74400000-0000-4000-8000-000000000011',
  p_numero_oficio => '45/2026', p_orgao => 'IMA', p_numero_processo => 'PROC-744',
  p_responsavel_id => 'd0000000-0000-4000-8000-0000000000a2');
select public.registrar_exigencia(p_id => '74400000-0000-4000-8000-0000000000a2',
  p_unidade_id => '74400000-0000-4000-8000-0000000000f1', p_assunto => 'Estudo de quelônios',
  p_recebido_em => testes.h(-20), p_prazo_oficial => testes.h(-2), p_meta_interna => testes.h(-3),
  p_prazo_oficial_texto => 'ofício de 18 dias');
select public.registrar_exigencia(p_id => '74400000-0000-4000-8000-0000000000a3',
  p_unidade_id => '74400000-0000-4000-8000-0000000000f1', p_assunto => 'Relatório de poeira',
  p_recebido_em => testes.h(-10), p_prazo_oficial => testes.h(0), p_meta_interna => testes.h(-1),
  p_prazo_dias => 10, p_prazo_contagem => 'corridos', p_numero_oficio => '46/2026');
select public.responder_exigencia(p_resposta_id => '74400000-0000-4000-8000-0000000000b3',
  p_exigencia_id => '74400000-0000-4000-8000-0000000000a3', p_protocolado_em => testes.h(-1),
  p_protocolo_numero => 'PROT-46');
select public.registrar_exigencia(p_id => '74400000-0000-4000-8000-0000000000a4',
  p_unidade_id => '74400000-0000-4000-8000-0000000000f1', p_assunto => 'Registrada por engano',
  p_recebido_em => testes.h(-3), p_prazo_oficial => testes.h(4), p_meta_interna => testes.h(3),
  p_prazo_dias => 7, p_prazo_contagem => 'corridos', p_numero_oficio => '47/2026');
select public.excluir_exigencia('74400000-0000-4000-8000-0000000000a4', 1);

-- ---------------------------------------------------------------------------
-- Visão da equipe
-- ---------------------------------------------------------------------------
select results_eq(
  $$select id, instrumento_id, prazo, dias, codigo, titulo, empreendimento_nome, unidade_nome, licenca,
           responsavel_nome, situacao_ocorrencia, row_version
    from public.listar_prazos(p_consultoria_id => 'c0000000-0000-4000-8000-00000000000a',
                              p_empreendimento_id => '74400000-0000-4000-8000-0000000000e1')
    where tipo_linha = 'exigencia'$$,
  $$values
    ('74400000-0000-4000-8000-0000000000a2'::uuid, null::uuid, testes.h(-2), -2, null::text,
     'Estudo de quelônios'::text, 'Mineradora Quartzito'::text, 'Lavra'::text, null::text, null::text,
     null::public.situacao_ocorrencia, 1),
    ('74400000-0000-4000-8000-0000000000a1', '74400000-0000-4000-8000-000000000011', testes.h(5), 5, '45/2026',
     'Plano de recuperação de área degradada', 'Mineradora Quartzito', 'Lavra', 'LAO 744/2026', 'Ana Ribeiro',
     null, 1)$$,
  'listar_prazos traz as exigências abertas: código = número do ofício, título = assunto, por prazo'
);

select is(
  (select count(*) from public.listar_prazos(p_consultoria_id => 'c0000000-0000-4000-8000-00000000000a',
                                             p_empreendimento_id => '74400000-0000-4000-8000-0000000000e1')
   where tipo_linha <> 'exigencia'),
  0::bigint,
  'a licença em rascunho não gera linha (o cenário só tem exigências)'
);

select is(
  (select count(*) from public.listar_prazos(p_consultoria_id => 'c0000000-0000-4000-8000-00000000000a',
                                             p_empreendimento_id => '74400000-0000-4000-8000-0000000000e1', p_limite => 100)
   where id in ('74400000-0000-4000-8000-0000000000a3', '74400000-0000-4000-8000-0000000000a4')),
  0::bigint,
  'respondida e excluída saem da Visão'
);

select results_eq(
  $$select id from public.listar_prazos(p_consultoria_id => 'c0000000-0000-4000-8000-00000000000a',
      p_empreendimento_id => '74400000-0000-4000-8000-0000000000e1', p_sem_responsavel => true)$$,
  $$values ('74400000-0000-4000-8000-0000000000a2'::uuid)$$,
  '"sem responsável" traz a exigência sem responsável'
);

select results_eq(
  $$select id from public.listar_prazos(p_consultoria_id => 'c0000000-0000-4000-8000-00000000000a',
      p_empreendimento_id => '74400000-0000-4000-8000-0000000000e1', p_faixa => 'sem_responsavel')$$,
  $$values ('74400000-0000-4000-8000-0000000000a2'::uuid)$$,
  'a faixa "sem responsável" traz a exigência sem responsável'
);

select results_eq(
  $$select id from public.listar_prazos(p_consultoria_id => 'c0000000-0000-4000-8000-00000000000a',
      p_empreendimento_id => '74400000-0000-4000-8000-0000000000e1', p_faixa => 'atrasadas')$$,
  $$values ('74400000-0000-4000-8000-0000000000a2'::uuid)$$,
  'a faixa "atrasadas" traz a exigência vencida'
);

select is(
  (select count(*) from public.listar_prazos(p_consultoria_id => 'c0000000-0000-4000-8000-00000000000a',
     p_empreendimento_id => '74400000-0000-4000-8000-0000000000e1',
     p_tipo_id => (select t.id from public.tipo_instrumento as t
                   where t.consultoria_id = 'c0000000-0000-4000-8000-00000000000a' and t.sigla = 'LAO'))),
  0::bigint,
  'o filtro por tipo de licença não traz exigência, nem a ligada a uma LAO'
);

select results_eq(
  $$select atrasadas, hoje, proximos_7, sem_responsavel, total
    from public.contar_prazos(p_consultoria_id => 'c0000000-0000-4000-8000-00000000000a',
                              p_empreendimento_id => '74400000-0000-4000-8000-0000000000e1')$$,
  $$values (1::bigint, 0::bigint, 1::bigint, 1::bigint, 2::bigint)$$,
  'contar_prazos conta as exigências abertas, com "sem responsável"'
);

select testes.autenticar_como('ana@filtroville.test');

select results_eq(
  $$select id from public.listar_prazos(p_consultoria_id => 'c0000000-0000-4000-8000-00000000000a',
      p_aba => 'minhas', p_empreendimento_id => '74400000-0000-4000-8000-0000000000e1')$$,
  $$values ('74400000-0000-4000-8000-0000000000a1'::uuid)$$,
  '"Minhas" da Ana traz a exigência de que ela é responsável'
);

select results_eq(
  $$select total from public.contar_prazos(p_consultoria_id => 'c0000000-0000-4000-8000-00000000000a',
      p_aba => 'minhas', p_empreendimento_id => '74400000-0000-4000-8000-0000000000e1')$$,
  $$values (1::bigint)$$,
  'contar_prazos de "Minhas" da Ana conta a exigência dela'
);

select testes.autenticar_como('bruno@filtroville.test');

select is(
  (select count(*) from public.listar_prazos(p_consultoria_id => 'c0000000-0000-4000-8000-00000000000a',
     p_aba => 'minhas', p_empreendimento_id => '74400000-0000-4000-8000-0000000000e1')),
  0::bigint,
  '"Minhas" do Bruno não traz a exigência da Ana'
);

-- ---------------------------------------------------------------------------
-- Calendário
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');

select results_eq(
  $$select tipo_evento, data, id, codigo, titulo, licenca, responsavel_nome, sem_responsavel, dias
    from public.listar_calendario('c0000000-0000-4000-8000-00000000000a', testes.h(-10), testes.h(10))
    where id in ('74400000-0000-4000-8000-0000000000a1', '74400000-0000-4000-8000-0000000000a2',
                 '74400000-0000-4000-8000-0000000000a3', '74400000-0000-4000-8000-0000000000a4')$$,
  $$values
    ('exigencia'::text, testes.h(-2), '74400000-0000-4000-8000-0000000000a2'::uuid, null::text,
     'Estudo de quelônios'::text, null::text, null::text, true, -2),
    ('exigencia', testes.h(5), '74400000-0000-4000-8000-0000000000a1', '45/2026',
     'Plano de recuperação de área degradada', 'LAO 744/2026', 'Ana Ribeiro', false, 5)$$,
  'o Calendário traz as exigências abertas como "exigencia", sem evento de meta, sem respondida e excluída'
);

select is(
  (select count(*) from public.listar_calendario('c0000000-0000-4000-8000-00000000000a', testes.h(-10), testes.h(10),
     p_sem_responsavel => true)
   where id in ('74400000-0000-4000-8000-0000000000a1', '74400000-0000-4000-8000-0000000000a2')),
  1::bigint,
  '"sem responsável" no Calendário traz só a exigência sem responsável'
);

-- ---------------------------------------------------------------------------
-- Busca global
-- ---------------------------------------------------------------------------
select results_eq(
  $$select tipo, id, titulo, detalhe, referencia_id
    from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', '45/2026') where tipo = 'exigencia'$$,
  $$values ('exigencia'::text, '74400000-0000-4000-8000-0000000000a1'::uuid, 'Ofício 45/2026'::text,
            'Plano de recuperação de área degradada · Mineradora Quartzito'::text,
            '74400000-0000-4000-8000-0000000000e1'::uuid)$$,
  'a busca pelo número do ofício traz "Ofício N", o assunto e o empreendimento'
);

select results_eq(
  $$select id, titulo, detalhe
    from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'QUELONIOS') where tipo = 'exigencia'$$,
  $$values ('74400000-0000-4000-8000-0000000000a2'::uuid, 'Estudo de quelônios'::text, 'Mineradora Quartzito'::text)$$,
  'sem ofício, o título é o assunto; a busca ignora acento e caixa'
);

select results_eq(
  $$select id from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'proc-744') where tipo = 'exigencia'$$,
  $$values ('74400000-0000-4000-8000-0000000000a1'::uuid)$$,
  'a busca acha pelo número do processo'
);

select results_eq(
  $$select id from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', '46/2026') where tipo = 'exigencia'$$,
  $$values ('74400000-0000-4000-8000-0000000000a3'::uuid)$$,
  'a busca acha a exigência respondida'
);

select is(
  (select count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', '47/2026')
   where tipo = 'exigencia'),
  0::bigint,
  'a busca não acha a exigência excluída'
);

select ok(
  (select bool_and(l.tipo_id is null and l.situacao_ocorrencia is null and l.meta_interna is null
                   and l.empreendimento_id is not null and l.unidade_id is not null)
   from private.linhas_de_prazo_exigencia('c0000000-0000-4000-8000-00000000000a') as l),
  'a fonte segue o contrato da base: tipo, situação da ocorrência e meta nulos; empreendimento e unidade preenchidos'
);

-- ---------------------------------------------------------------------------
-- Outra consultoria
-- ---------------------------------------------------------------------------
select testes.autenticar_como('gustavo@verdesul.test');

select is(
  (select count(*) from public.listar_prazos('c0000000-0000-4000-8000-00000000000a') where tipo_linha = 'exigencia'),
  0::bigint,
  'Gestão de B: listar_prazos de A sem exigência'
);

select is(
  (select total from public.contar_prazos('c0000000-0000-4000-8000-00000000000a')),
  0::bigint,
  'Gestão de B: contar_prazos de A zero'
);

select is(
  (select count(*) from public.listar_calendario('c0000000-0000-4000-8000-00000000000a', testes.h(-10), testes.h(10))),
  0::bigint,
  'Gestão de B: Calendário de A vazio'
);

select is(
  (select count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', '45/2026')),
  0::bigint,
  'Gestão de B: busca em A vazia'
);

select * from finish();

rollback;
