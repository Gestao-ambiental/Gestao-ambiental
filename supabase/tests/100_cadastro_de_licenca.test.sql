-- Cadastro de licença (LIC-01 a LIC-05): só a Gestão cadastra e ativa; prazo verificável;
-- ativação gera as ocorrências uma vez, em transação, com as mesmas datas do packages/domain.
begin;

select plan(47);

select testes.criar_dados_sinteticos();

-- Carteira mínima de A (como dono da tabela; a escrita do cliente é por RPC, testada no 090).
insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('e0000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
        'Metalúrgica Rio Cubatão', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome)
values ('f0000000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
        'e0000000-0000-4000-8000-0000000000e1', 'Matriz'),
       ('f0000000-0000-4000-8000-0000000000f2', 'c0000000-0000-4000-8000-00000000000a',
        'e0000000-0000-4000-8000-0000000000e1', 'Filial');

-- ---------------------------------------------------------------------------
-- Datas do prazo: os mesmos casos de packages/domain/src/recorrencia.test.ts
-- ---------------------------------------------------------------------------
select results_eq(
  $$select prazo from private.datas_do_prazo('mensal', null, null, '2024-01-31', '2024-05-31')$$,
  $$values ('2024-01-31'::date), ('2024-02-29'), ('2024-03-31'), ('2024-04-30'), ('2024-05-31')$$,
  'mensal a partir de 31/01 respeita o fim de fevereiro e volta a 31 (fim de mês não deriva)'
);

select results_eq(
  $$select prazo from private.datas_do_prazo('anual', null, null, '2024-02-29', '2028-03-01')$$,
  $$values ('2024-02-29'::date), ('2025-02-28'), ('2026-02-28'), ('2027-02-28'), ('2028-02-29')$$,
  '29/02 anual só repete 29/02 em ano bissexto'
);

select results_eq(
  $$select ciclo, prazo from private.datas_do_prazo('personalizada', 'dia', 45, '2023-03-31', '2023-06-29')$$,
  $$values (1, '2023-03-31'::date), (2, '2023-05-15'::date), (3, '2023-06-29'::date)$$,
  'a cada 45 dias corridos, inclui a validade quando a última entrega cai nela'
);

select is(
  (select count(*) from private.datas_do_prazo('continua', null, null, null, '2030-01-01')),
  0::bigint,
  'contínua não gera entrega periódica'
);

select results_eq(
  $$select ciclo, prazo from private.datas_do_prazo('na_renovacao', null, null, '2026-10-18', '2027-02-15')$$,
  $$values (1, '2026-10-18'::date)$$,
  'na renovação gera uma única entrega na data confirmada'
);

select throws_ok(
  $$select * from private.datas_do_prazo('mensal', null, null, '1900-01-01', '2100-01-01')$$,
  '22023', 'ocorrencias_demais',
  'mais de 1.200 entregas é erro de cadastro'
);

select throws_ok(
  $$select * from private.datas_do_prazo('anual', null, null, '2028-01-01', '2027-01-01')$$,
  '22023', 'primeira_data_apos_validade',
  'primeira data depois da validade é recusada'
);

-- ---------------------------------------------------------------------------
-- Tipos semeados por consultoria
-- ---------------------------------------------------------------------------
select results_eq(
  $$select sigla from public.tipo_instrumento
    where consultoria_id = 'c0000000-0000-4000-8000-00000000000a' order by sigla$$,
  $$values ('AuA'), ('LAI'), ('LAO'), ('LAP')$$,
  'toda consultoria nasce com LAO, LAP, LAI e AuA'
);

-- ---------------------------------------------------------------------------
-- Rascunho: só a Gestão da própria consultoria
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select throws_ok(
  $$select public.criar_instrumento('10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-0000000000f1')$$,
  '42501', 'sem_permissao',
  'Equipe (Ana) não cadastra licença'
);

select testes.autenticar_como('gustavo@verdesul.test');

select throws_ok(
  $$select public.criar_instrumento('10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-0000000000f1')$$,
  '42501', 'sem_permissao',
  'Gestão de B (Gustavo) não cadastra licença em unidade de A'
);

select testes.autenticar_como('eduardo@filtroville.test');

select is(
  public.criar_instrumento('10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-0000000000f1'),
  '10000000-0000-4000-8000-000000000001'::uuid,
  'Gestão (Eduardo) cria o rascunho'
);

select is(
  public.criar_instrumento('10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-0000000000f1'),
  '10000000-0000-4000-8000-000000000001'::uuid,
  'repetir a criação devolve o mesmo rascunho'
);

select results_eq(
  $$select situacao, empreendimento_id, row_version from public.instrumento
    where id = '10000000-0000-4000-8000-000000000001'$$,
  $$values ('rascunho'::public.situacao_instrumento, 'e0000000-0000-4000-8000-0000000000e1'::uuid, 1)$$,
  'o rascunho nasce incompleto, no empreendimento da unidade'
);

-- PDF já enviado ao Storage (simulado como dono) vira versão imutável
reset role;
insert into storage.objects (bucket_id, name, metadata) values
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/instrumento/20000000-0000-4000-8000-000000000001.pdf',
   '{"mimetype": "application/pdf", "size": 1048576}'),
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/instrumento/20000000-0000-4000-8000-000000000002.pdf',
   '{"mimetype": "image/png", "size": 2048}');
select testes.autenticar_como('eduardo@filtroville.test');

select is(
  public.registrar_pdf_instrumento('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-00000000000a/instrumento/20000000-0000-4000-8000-000000000001.pdf',
    'LAO 4821-2023.pdf', repeat('a', 64)),
  '20000000-0000-4000-8000-000000000001'::uuid,
  'o PDF enviado é registrado como versão'
);

select results_eq(
  $$select v.numero, v.tamanho_bytes, v.mime, d.versao_vigente_id = v.id
    from public.instrumento as i
    join public.documento as d on d.id = i.documento_id
    join public.documento_versao as v on v.documento_id = d.id
    where i.id = '10000000-0000-4000-8000-000000000001'$$,
  $$values (1, 1048576::bigint, 'application/pdf', true)$$,
  'tamanho e MIME vêm do Storage, e a versão vira a vigente'
);

select is(
  public.registrar_pdf_instrumento('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-00000000000a/instrumento/20000000-0000-4000-8000-000000000001.pdf',
    'LAO 4821-2023.pdf', repeat('a', 64)),
  '20000000-0000-4000-8000-000000000001'::uuid,
  'registrar de novo devolve a mesma versão'
);

select throws_ok(
  $$select public.registrar_pdf_instrumento('10000000-0000-4000-8000-000000000001', gen_random_uuid(),
      'c0000000-0000-4000-8000-00000000000a/instrumento/20000000-0000-4000-8000-000000000002.pdf',
      'foto.png', repeat('b', 64))$$,
  '22023', 'arquivo_nao_pdf',
  'só PDF vira documento da licença'
);

select throws_ok(
  $$select public.registrar_pdf_instrumento('10000000-0000-4000-8000-000000000001', gen_random_uuid(),
      'c0000000-0000-4000-8000-00000000000b/instrumento/20000000-0000-4000-8000-000000000001.pdf',
      'outro.pdf', repeat('c', 64))$$,
  '22023', 'caminho_invalido',
  'caminho de outra consultoria é recusado'
);

-- ---------------------------------------------------------------------------
-- Identificação (controle otimista e marco com data)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.salvar_identificacao('10000000-0000-4000-8000-000000000001', 1,
      'f0000000-0000-4000-8000-0000000000f1',
      (select id from public.tipo_instrumento where sigla = 'LAO'
         and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
      '4821/2023', 'IMA', null, null, null, null, 'assinatura', '2024-05-31')$$,
  'P0001', 'conflito_de_versao',
  'versão desatualizada é recusada (outro aparelho salvou antes)'
);

select throws_ok(
  $$select public.salvar_identificacao('10000000-0000-4000-8000-000000000001', 2,
      'f0000000-0000-4000-8000-0000000000f1', null, null, null, null, null, null, null, 'assinatura', null)$$,
  '22023', 'marco_sem_data',
  'marco escolhido sem a data correspondente é recusado'
);

select is(
  public.salvar_identificacao('10000000-0000-4000-8000-000000000001', 2,
    'f0000000-0000-4000-8000-0000000000f1',
    (select id from public.tipo_instrumento where sigla = 'LAO'
       and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
    ' 4821/2023 ', 'IMA', null, '2023-01-31', null, null, 'assinatura', '2024-05-31'),
  3,
  'identificação salva devolve a nova versão'
);

-- ---------------------------------------------------------------------------
-- Condicionantes
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select public.salvar_condicionante('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
      null, '1', 'Disposições gerais', '', 'agrupador');
    select public.salvar_condicionante('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001', '1.1', 'Manter cópia desta licença no local', 'Manter cópia…', 'informacao_geral');
    select public.salvar_condicionante('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
      null, '2.1', 'Relatório mensal', 'Apresentar mensalmente…', 'obrigacao');
    select public.salvar_condicionante('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001',
      null, '2.2', 'Manter filtros em operação', 'Manter…', 'condicao_continua');
    select public.salvar_condicionante('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001',
      null, '2.3', 'Laudo único', 'Apresentar laudo…', 'obrigacao');
    select public.salvar_condicionante('30000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001',
      null, '2.4', 'Análise do corpo receptor', 'A cada 45 dias…', 'obrigacao');$$,
  'Gestão registra agrupador, subitem, obrigações e condição contínua'
);

select throws_ok(
  $$select public.salvar_condicionante(gen_random_uuid(), '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000003', '2.1.1', 'Sub de obrigação', '', 'obrigacao')$$,
  'P0001', 'agrupador_invalido',
  'subitem só fica dentro de agrupador'
);

select throws_ok(
  $$select public.salvar_condicionante('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
      null, '1', 'Disposições gerais', '', 'obrigacao')$$,
  'P0001', 'agrupador_com_subitens',
  'agrupador com subitens não muda de natureza'
);

select throws_ok(
  $$select public.confirmar_prazo('30000000-0000-4000-8000-000000000002', 'anual', null, null, 'corridos',
      '2023-01-31', '2024-01-31', null)$$,
  'P0001', 'natureza_sem_prazo',
  'informação geral não vira prazo'
);

select throws_ok(
  $$select public.confirmar_prazo('30000000-0000-4000-8000-000000000003', 'mensal', null, null, 'uteis',
      '2023-01-31', '2024-01-31', null)$$,
  'P0001', 'contagem_indisponivel',
  'dias úteis ficam indisponíveis até existir calendário de feriados'
);

select throws_ok(
  $$select public.ativar_plano('10000000-0000-4000-8000-000000000001',
      (select row_version from public.instrumento where id = '10000000-0000-4000-8000-000000000001'),
      gen_random_uuid())$$,
  'P0001', 'prazo_pendente',
  'obrigação sem prazo confirmado bloqueia a ativação'
);

select lives_ok(
  $$select public.confirmar_prazo('30000000-0000-4000-8000-000000000003', 'mensal', null, null, 'corridos',
      '2023-01-31', '2024-01-31', 'Página 4, item 2.1');
    select public.confirmar_prazo('30000000-0000-4000-8000-000000000005', 'unica', null, null, 'corridos',
      '2023-01-31', '2023-06-30', null);
    select public.confirmar_prazo('30000000-0000-4000-8000-000000000006', 'personalizada', 'dia', 45, 'corridos',
      '2023-01-31', '2024-03-31', null);$$,
  'Gestão confirma os prazos das obrigações'
);

select results_eq(
  $$select v.fonte_regra, m.nome, v.prazo_confirmado_em is not null
    from public.condicionante_versao as v join public.membro as m on m.id = v.prazo_confirmado_por
    where v.condicionante_id = '30000000-0000-4000-8000-000000000003'$$,
  $$values ('Página 4, item 2.1', 'Eduardo Karnopp', true)$$,
  'o prazo guarda a fonte, quem confirmou e quando (prazo verificável)'
);

-- ---------------------------------------------------------------------------
-- Responsáveis
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.atribuir_a_todos('10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000b2')$$,
  'P0001', 'responsavel_invalido',
  'responsável de outra consultoria é recusado'
);

select lives_ok(
  $$select public.atribuir_a_todos('10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a3');
    select public.definir_responsavel('30000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-0000000000a4');$$,
  'atribuir a todos e criar uma exceção'
);

-- ---------------------------------------------------------------------------
-- Ativação
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select throws_ok(
  $$select public.ativar_plano('10000000-0000-4000-8000-000000000001', 1, gen_random_uuid())$$,
  '42501', 'sem_permissao',
  'Equipe (Ana) não ativa o plano'
);

select testes.autenticar_como('eduardo@filtroville.test');

select set_config('testes.versao',
  (select row_version::text from public.instrumento where id = '10000000-0000-4000-8000-000000000001'), true);

select is(
  public.ativar_plano('10000000-0000-4000-8000-000000000001', current_setting('testes.versao')::integer,
                      '40000000-0000-4000-8000-000000000001'),
  8,
  'ativar gera 5 mensais + 1 única + 2 a cada 45 dias; contínua e informação geral não geram'
);

select results_eq(
  $$select o.prazo_oficial_original, o.prazo_oficial_atual = o.prazo_oficial_original, m.nome
    from public.ocorrencia as o
    join public.condicionante_versao as v on v.id = o.condicionante_versao_id
    join public.membro as m on m.id = o.responsavel_id
    where v.condicionante_id = '30000000-0000-4000-8000-000000000003' order by o.ciclo$$,
  $$values ('2024-01-31'::date, true, 'Bruno Tavares'), ('2024-02-29', true, 'Bruno Tavares'),
           ('2024-03-31', true, 'Bruno Tavares'), ('2024-04-30', true, 'Bruno Tavares'),
           ('2024-05-31', true, 'Bruno Tavares')$$,
  'as ocorrências mensais têm as datas do domínio e o responsável geral'
);

select results_eq(
  $$select o.prazo_oficial_original, m.nome
    from public.ocorrencia as o
    join public.condicionante_versao as v on v.id = o.condicionante_versao_id
    join public.membro as m on m.id = o.responsavel_id
    where v.condicionante_id = '30000000-0000-4000-8000-000000000006' order by o.ciclo$$,
  $$values ('2024-03-31'::date, 'Camila Souza'), ('2024-05-15', 'Camila Souza')$$,
  'a exceção vale para as ocorrências do item'
);

select is(
  public.ativar_plano('10000000-0000-4000-8000-000000000001', current_setting('testes.versao')::integer,
                      '40000000-0000-4000-8000-000000000001'),
  8,
  'retry com a mesma chave devolve o mesmo total'
);

select is(
  (select count(*) from public.ocorrencia where instrumento_id = '10000000-0000-4000-8000-000000000001'),
  8::bigint,
  'retry não duplica ocorrências'
);

select throws_ok(
  $$select public.ativar_plano('10000000-0000-4000-8000-000000000001', 99, gen_random_uuid())$$,
  'P0001', 'instrumento_ativo',
  'ativar de novo com outra chave é recusado'
);

select results_eq(
  $$select situacao, ativado_por, ativado_em is not null from public.instrumento
    where id = '10000000-0000-4000-8000-000000000001'$$,
  $$values ('ativo'::public.situacao_instrumento, 'd0000000-0000-4000-8000-0000000000a1'::uuid, true)$$,
  'o instrumento fica ativo, com quem ativou e quando'
);

select throws_ok(
  $$select public.salvar_condicionante('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
      null, '2.1', 'Mudou', '', 'obrigacao')$$,
  'P0001', 'instrumento_ativo',
  'depois de ativo, o cadastro não muda pelo assistente'
);

reset role;

select throws_ok(
  $$update public.condicionante_versao set titulo = 'Adulterado'
    where condicionante_id = '30000000-0000-4000-8000-000000000003'$$,
  'P0001', 'versao_congelada',
  'versão de instrumento ativo fica congelada, nem o dono altera'
);

select throws_ok(
  $$update public.ocorrencia set prazo_oficial_original = '2030-01-01'
    where instrumento_id = '10000000-0000-4000-8000-000000000001'$$,
  'P0001', null,
  'prazo oficial original nunca é sobrescrito'
);

select ok(
  (select count(*) = 8 from public.auditoria where entidade = 'ocorrencia')
  and exists (
    select 1 from public.auditoria
    where entidade = 'instrumento' and entidade_id = '10000000-0000-4000-8000-000000000001'
      and depois ->> 'situacao' = 'ativo' and ator_membro_id = 'd0000000-0000-4000-8000-0000000000a1'
  ),
  'ativação e ocorrências ficam na auditoria, com o ator'
);

-- Condicionante pendente de revisão (vinda da IA no futuro) bloqueia a ativação
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_instrumento('10000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-0000000000f2');
select public.salvar_identificacao('10000000-0000-4000-8000-000000000002', 1, 'f0000000-0000-4000-8000-0000000000f2',
  (select id from public.tipo_instrumento where sigla = 'AuA' and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  '77/2024', 'SAMA', '2024-01-10', null, null, null, 'emissao', '2026-06-30');
select public.salvar_condicionante('30000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000002',
  null, '1', 'Informar', '', 'informacao_geral');
reset role;
update public.condicionante set revisao = 'pendente' where id = '30000000-0000-4000-8000-000000000010';
select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.ativar_plano('10000000-0000-4000-8000-000000000002',
      (select row_version from public.instrumento where id = '10000000-0000-4000-8000-000000000002'),
      gen_random_uuid())$$,
  'P0001', 'condicionante_pendente',
  'condicionante com revisão pendente bloqueia a ativação'
);

select results_eq(
  $$select jsonb_array_length(licencas), licencas -> 0 ->> 'situacao', licencas -> 0 ->> 'sigla'
    from public.listar_empreendimentos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values (2, 'ativo', 'LAO')$$,
  'a carteira traz as licenças do empreendimento para calcular a situação'
);

-- ---------------------------------------------------------------------------
-- Isolamento
-- ---------------------------------------------------------------------------
select testes.autenticar_como('helena@verdesul.test');

select results_eq(
  $$select (select count(*) from public.instrumento), (select count(*) from public.condicionante),
           (select count(*) from public.condicionante_versao), (select count(*) from public.ocorrencia),
           (select count(*) from public.documento_versao)$$,
  $$values (0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint)$$,
  'Helena (B) recebe zero instrumentos, condicionantes, versões, ocorrências e PDFs de A'
);

select is(
  (select count(*) from public.tipo_instrumento where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  0::bigint,
  'Helena (B) não vê os tipos de A'
);

select * from finish();

rollback;
