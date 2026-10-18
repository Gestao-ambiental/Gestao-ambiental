-- Visão da equipe e calendário (EQ-01 a EQ-04): situação calculada a partir de hoje no fuso da
-- consultoria; filtros, contadores e "Minhas ações"; atribuir só pela Gestão; isolamento.
begin;

select plan(24);

select testes.criar_dados_sinteticos();

-- Hoje no fuso da Filtroville (nunca o do servidor do CI).
select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('e0000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
        'Metalúrgica Rio Cubatão', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome)
values ('f0000000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
        'e0000000-0000-4000-8000-0000000000e1', 'Matriz');

-- LAO ativa com quatro obrigações únicas: atrasada 10 dias, hoje, em 3 dias e em 20 dias.
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_instrumento('10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-0000000000f1');
select public.salvar_identificacao('10000000-0000-4000-8000-000000000001', 1, 'f0000000-0000-4000-8000-0000000000f1',
  (select id from public.tipo_instrumento where sigla = 'LAO' and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  '4821/2023', 'IMA', null, current_setting('testes.hoje')::date - 30, null, null, 'assinatura',
  current_setting('testes.hoje')::date + 400);
select public.salvar_condicionante(('30000000-0000-4000-8000-00000000000' || n::text)::uuid, '10000000-0000-4000-8000-000000000001',
  null, '1.' || n::text, 'Entrega ' || n::text, '', 'obrigacao')
from generate_series(1, 4) as n;
select public.confirmar_prazo(('30000000-0000-4000-8000-00000000000' || n::text)::uuid, 'unica', null, null, 'corridos',
  null, current_setting('testes.hoje')::date + d, 'Documento')
from (values (1, -10), (2, 0), (3, 3), (4, 20)) as x (n, d);
select public.atribuir_a_todos('10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a3');
select public.definir_responsavel('30000000-0000-4000-8000-000000000003', null);
select public.ativar_plano('10000000-0000-4000-8000-000000000001',
  (select row_version from public.instrumento where id = '10000000-0000-4000-8000-000000000001'),
  gen_random_uuid());

-- ---------------------------------------------------------------------------
-- Tabela (Equipe vê a consultoria inteira)
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select results_eq(
  $$select tipo_linha, dias, titulo, total from public.listar_prazos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values ('ocorrencia', -10, 'Entrega 1', 6::bigint), ('ocorrencia', 0, 'Entrega 2', 6::bigint),
           ('ocorrencia', 3, 'Entrega 3', 6::bigint), ('ocorrencia', 20, 'Entrega 4', 6::bigint),
           ('limite_protocolo', 280, 'Limite de protocolo', 6::bigint), ('validade', 400, 'Validade', 6::bigint)$$,
  'ocorrências abertas, limite de protocolo da LAO e validade, por prazo, com dias calculados'
);

select results_eq(
  $$select licenca, empreendimento_nome, responsavel_nome from public.listar_prazos('c0000000-0000-4000-8000-00000000000a')
    where tipo_linha = 'ocorrencia' order by prazo limit 1$$,
  $$values ('LAO 4821/2023', 'Metalúrgica Rio Cubatão', 'Bruno Tavares')$$,
  'a linha traz licença, empreendimento e responsável'
);

select results_eq(
  $$select atrasadas, hoje, proximos_7, sem_responsavel, total
    from public.contar_prazos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values (1::bigint, 1::bigint, 1::bigint, 1::bigint, 4::bigint)$$,
  'contadores: atrasadas, vencem hoje, próximos 7 dias e sem responsável (só ocorrências)'
);

select results_eq(
  $$select titulo from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_faixa => 'atrasadas')$$,
  $$values ('Entrega 1')$$,
  'o contador "Atrasadas" filtra a tabela'
);

select results_eq(
  $$select titulo from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_sem_responsavel => true)$$,
  $$values ('Entrega 3')$$,
  'filtro "sem responsável" traz só ocorrências sem dono (validade e limite não entram)'
);

select is(
  (select count(*) from public.listar_prazos('c0000000-0000-4000-8000-00000000000a',
     p_tipo_id => (select id from public.tipo_instrumento where sigla = 'AuA'
                     and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'))),
  0::bigint,
  'filtro por tipo de instrumento'
);

select results_eq(
  $$select titulo, total from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_limite => 2, p_deslocamento => 2)$$,
  $$values ('Entrega 3', 6::bigint), ('Entrega 4', 6::bigint)$$,
  'a tabela é paginada no servidor, com o total'
);

select results_eq(
  $$select titulo from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_ordem => '-prazo', p_limite => 1)$$,
  $$values ('Validade')$$,
  'a tabela ordena pelo cabeçalho (prazo decrescente)'
);

select is(
  (select count(*) from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_aba => 'minhas')),
  0::bigint,
  'Minhas ações de Ana: nada atribuído a ela'
);

select testes.autenticar_como('bruno@filtroville.test');

select results_eq(
  $$select titulo from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_aba => 'minhas')$$,
  $$values ('Entrega 1'), ('Entrega 2'), ('Entrega 4')$$,
  'Minhas ações de Bruno: só as ocorrências dele'
);

select results_eq(
  $$select atrasadas, hoje, proximos_7, total from public.contar_prazos('c0000000-0000-4000-8000-00000000000a', p_aba => 'minhas')$$,
  $$values (1::bigint, 1::bigint, 0::bigint, 3::bigint)$$,
  'os contadores acompanham a aba'
);

-- ---------------------------------------------------------------------------
-- Calendário
-- ---------------------------------------------------------------------------
select results_eq(
  $$select tipo_evento, data - current_setting('testes.hoje')::date, sem_responsavel
    from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
      current_setting('testes.hoje')::date - 15, current_setting('testes.hoje')::date + 25)$$,
  $$values ('prazo', -10, false), ('prazo', 0, false), ('prazo', 3, true), ('prazo', 20, false)$$,
  'o calendário traz os prazos do intervalo, marcando os sem responsável'
);

select is(
  (select count(*) from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
     current_setting('testes.hoje')::date + 270, current_setting('testes.hoje')::date + 300)),
  1::bigint,
  'o limite de protocolo aparece no calendário'
);

select is(
  (select count(*) from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
     current_setting('testes.hoje')::date - 15, current_setting('testes.hoje')::date + 25, p_sem_responsavel => true)),
  1::bigint,
  'filtro "só sem responsável" no calendário'
);

select throws_ok(
  $$select * from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
      current_setting('testes.hoje')::date, current_setting('testes.hoje')::date + 100)$$,
  '22023', 'intervalo_invalido',
  'intervalo maior que dois meses é recusado'
);

-- ---------------------------------------------------------------------------
-- Atribuir (só Gestão, otimista)
-- ---------------------------------------------------------------------------
select set_config('testes.sem_dono',
  (select id::text from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_sem_responsavel => true)), true);

select throws_ok(
  $$select public.atribuir_ocorrencia(current_setting('testes.sem_dono')::uuid,
      'd0000000-0000-4000-8000-0000000000a3', 1)$$,
  '42501', 'sem_permissao',
  'Equipe (Bruno) não atribui'
);

select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.atribuir_ocorrencia(current_setting('testes.sem_dono')::uuid,
      'd0000000-0000-4000-8000-0000000000b2', 1)$$,
  'P0001', 'responsavel_invalido',
  'responsável de outra consultoria é recusado'
);

select throws_ok(
  $$select public.atribuir_ocorrencia(current_setting('testes.sem_dono')::uuid,
      'd0000000-0000-4000-8000-0000000000a4', 99)$$,
  'P0001', 'conflito_de_versao',
  'versão desatualizada é recusada'
);

select is(
  public.atribuir_ocorrencia(current_setting('testes.sem_dono')::uuid, 'd0000000-0000-4000-8000-0000000000a4', 1),
  2,
  'Gestão atribui e recebe a nova versão'
);

select results_eq(
  $$select responsavel_nome from public.listar_prazos('c0000000-0000-4000-8000-00000000000a')
    where id = current_setting('testes.sem_dono')::uuid$$,
  $$values ('Camila Souza')$$,
  'a ocorrência passa a ter responsável'
);

select ok(
  exists (
    select 1 from public.auditoria
    where entidade = 'ocorrencia' and entidade_id = current_setting('testes.sem_dono')::uuid
      and acao = 'update' and depois ->> 'responsavel_id' = 'd0000000-0000-4000-8000-0000000000a4'
  ),
  'a atribuição fica na auditoria'
);

-- ---------------------------------------------------------------------------
-- Isolamento
-- ---------------------------------------------------------------------------
select testes.autenticar_como('helena@verdesul.test');

select is(
  (select count(*) from public.listar_prazos('c0000000-0000-4000-8000-00000000000a')),
  0::bigint,
  'Helena (B) lista prazos de A e recebe zero linhas'
);

select results_eq(
  $$select total from public.contar_prazos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values (0::bigint)$$,
  'Helena (B) conta prazos de A e recebe zero'
);

select is(
  (select count(*) from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
     current_setting('testes.hoje')::date - 15, current_setting('testes.hoje')::date + 25)),
  0::bigint,
  'Helena (B) não vê o calendário de A'
);

select * from finish();

rollback;
