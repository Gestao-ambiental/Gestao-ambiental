-- Acompanhamentos e renovação de LAO (EQ-05, REN-01, REN-02): plano criado para toda LAO ativa
-- (snapshot de 120 dias e da antecedência), antecedência que não move o limite, protocolo com
-- número, data e comprovante que não altera a licença, e o painel "aguardando conferência".
begin;

select plan(30);

select testes.criar_dados_sinteticos();
select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('e0000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
        'Metalúrgica Rio Cubatão', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome)
values ('f0000000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
        'e0000000-0000-4000-8000-0000000000e1', 'Matriz');

-- LAO 1 ativada pelo caminho normal: vence em 400 dias, uma obrigação única em 5 dias (Bruno).
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_instrumento('10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-0000000000f1');
select public.salvar_identificacao('10000000-0000-4000-8000-000000000001', 1, 'f0000000-0000-4000-8000-0000000000f1',
  (select id from public.tipo_instrumento where sigla = 'LAO' and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  '4821/2023', 'IMA', null, current_setting('testes.hoje')::date - 30, null, null, 'assinatura',
  current_setting('testes.hoje')::date + 400);
select public.salvar_condicionante('30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', null, '4.2', 'Relatório de efluentes', '', 'obrigacao');
select public.confirmar_prazo('30000000-0000-4000-8000-000000000001', 'unica', null, null,
  'corridos', null, current_setting('testes.hoje')::date + 5, 'Documento');
select public.atribuir_a_todos('10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a3');
select public.ativar_plano('10000000-0000-4000-8000-000000000001',
  (select row_version from public.instrumento where id = '10000000-0000-4000-8000-000000000001'), gen_random_uuid());

reset role;

-- LAO 2 (antecedência 60 no cadastro, vence em 130 dias), AuA ativa e LAO em rascunho.
insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, tipo_id, numero, situacao,
                                assinado_em, marco, validade, antecedencia_renovacao_dias, criado_por,
                                ativado_em, ativado_por, chave_ativacao)
select x.id, 'c0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-0000000000e1',
       'f0000000-0000-4000-8000-0000000000f1',
       (select t.id from public.tipo_instrumento as t
        where t.sigla = x.sigla and t.consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
       x.numero, x.situacao::public.situacao_instrumento, current_setting('testes.hoje')::date - 300, 'assinatura',
       current_setting('testes.hoje')::date + x.dias, x.antecedencia, 'd0000000-0000-4000-8000-0000000000a1',
       case when x.situacao = 'ativo' then now() end,
       case when x.situacao = 'ativo' then 'd0000000-0000-4000-8000-0000000000a1'::uuid end,
       case when x.situacao = 'ativo' then gen_random_uuid() end
from (values
  ('10000000-0000-4000-8000-000000000002'::uuid, 'LAO', '2207/2023', 'ativo', 130, 60),
  ('10000000-0000-4000-8000-000000000003'::uuid, 'AuA', '77/2024', 'ativo', 200, 30),
  ('10000000-0000-4000-8000-000000000004'::uuid, 'LAO', '9/2026', 'rascunho', 500, 30)
) as x (id, sigla, numero, situacao, dias, antecedencia);

select set_config('testes.p1',
  (select id::text from public.plano_renovacao where instrumento_id = '10000000-0000-4000-8000-000000000001'), true);
select set_config('testes.p2',
  (select id::text from public.plano_renovacao where instrumento_id = '10000000-0000-4000-8000-000000000002'), true);

insert into storage.objects (bucket_id, name, metadata) values
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/protocolo/80000001-0000-4000-8000-000000000000.pdf',
   '{"mimetype": "application/pdf", "size": 4096}'),
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/protocolo/80000002-0000-4000-8000-000000000000.pdf',
   '{"mimetype": "application/pdf", "size": 4096}'),
  ('arquivos', 'c0000000-0000-4000-8000-00000000000b/protocolo/80000003-0000-4000-8000-000000000000.pdf',
   '{"mimetype": "application/pdf", "size": 4096}');

-- ---------------------------------------------------------------------------
-- Plano criado para LAO ativa
-- ---------------------------------------------------------------------------
select results_eq(
  $$select instrumento_id, dias_limite_protocolo, antecedencia_dias, protocolado_em is null
    from public.plano_renovacao where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'
    order by instrumento_id$$,
  $$values ('10000000-0000-4000-8000-000000000001'::uuid, 120, 30, true),
           ('10000000-0000-4000-8000-000000000002'::uuid, 120, 60, true)$$,
  'toda LAO ativa ganha plano com 120 dias e a antecedência do cadastro; AuA e rascunho não'
);

-- ---------------------------------------------------------------------------
-- Radar (todos os membros veem)
-- ---------------------------------------------------------------------------
select testes.autenticar_como('bruno@filtroville.test');

select results_eq(
  $$select licenca, orgao, validade - dias_limite_protocolo - hoje, antecedencia_dias, total
    from public.listar_renovacoes('c0000000-0000-4000-8000-00000000000a')$$,
  $$values ('LAO 2207/2023', null::text, 10, 60, 2::bigint), ('LAO 4821/2023', 'IMA', 280, 30, 2::bigint)$$,
  'Equipe vê as renovações pelo limite de protocolo mais próximo'
);

select is(
  (select count(*) from public.listar_renovacoes('c0000000-0000-4000-8000-00000000000a', 1, 1)),
  1::bigint,
  'o radar é paginado'
);

select results_eq(
  $$select licenca, empreendimento_nome, unidade_nome, validade - hoje, row_version
    from public.obter_plano_renovacao(current_setting('testes.p1')::uuid)$$,
  $$values ('LAO 4821/2023', 'Metalúrgica Rio Cubatão', 'Matriz', 400, 1)$$,
  'o plano traz a licença, o empreendimento e o vencimento'
);

-- ---------------------------------------------------------------------------
-- Antecedência (só Gestão; não muda o limite)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.definir_antecedencia_renovacao(current_setting('testes.p1')::uuid, 60, 1)$$,
  '42501', 'sem_permissao',
  'Equipe não muda a antecedência'
);

select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.definir_antecedencia_renovacao(current_setting('testes.p1')::uuid, -1, 1)$$,
  '22023', 'antecedencia_invalida',
  'antecedência negativa é recusada'
);

select throws_ok(
  $$select public.definir_antecedencia_renovacao(current_setting('testes.p1')::uuid, 60, 7)$$,
  'P0001', 'conflito_de_versao',
  'versão desatualizada é recusada'
);

select is(
  public.definir_antecedencia_renovacao(current_setting('testes.p1')::uuid, 60, 1),
  2,
  'Gestão troca 30 por 60'
);

select is(
  public.definir_antecedencia_renovacao(current_setting('testes.p1')::uuid, 60, 2),
  2,
  'repetir o mesmo valor não muda a versão'
);

select results_eq(
  $$select p.antecedencia_dias, p.dias_limite_protocolo, i.validade - private.hoje_da_consultoria(i.consultoria_id)
    from public.plano_renovacao as p join public.instrumento as i on i.id = p.instrumento_id
    where p.id = current_setting('testes.p1')::uuid$$,
  $$values (60, 120, 400)$$,
  'a antecedência muda; os 120 dias e a validade não (o limite continua o mesmo)'
);

-- ---------------------------------------------------------------------------
-- Protocolo
-- ---------------------------------------------------------------------------
select testes.autenticar_como('bruno@filtroville.test');

select throws_ok(
  $$select public.registrar_protocolo(current_setting('testes.p2')::uuid, 'IMA 2026/1', current_setting('testes.hoje')::date,
      '80000001-0000-4000-8000-000000000000',
      'c0000000-0000-4000-8000-00000000000a/protocolo/80000001-0000-4000-8000-000000000000.pdf',
      'comprovante.pdf', repeat('a', 64), 1)$$,
  '42501', 'sem_permissao',
  'Equipe não registra protocolo'
);

select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.registrar_protocolo(current_setting('testes.p2')::uuid, '  ', current_setting('testes.hoje')::date,
      '80000001-0000-4000-8000-000000000000',
      'c0000000-0000-4000-8000-00000000000a/protocolo/80000001-0000-4000-8000-000000000000.pdf',
      'comprovante.pdf', repeat('a', 64), 1)$$,
  '22023', 'numero_obrigatorio',
  'protocolo exige número'
);

select throws_ok(
  $$select public.registrar_protocolo(current_setting('testes.p2')::uuid, 'IMA 2026/1', null,
      '80000001-0000-4000-8000-000000000000',
      'c0000000-0000-4000-8000-00000000000a/protocolo/80000001-0000-4000-8000-000000000000.pdf',
      'comprovante.pdf', repeat('a', 64), 1)$$,
  '22023', 'data_protocolo_obrigatoria',
  'protocolo exige data'
);

select throws_ok(
  $$select public.registrar_protocolo(current_setting('testes.p2')::uuid, 'IMA 2026/1',
      current_setting('testes.hoje')::date + 1, '80000001-0000-4000-8000-000000000000',
      'c0000000-0000-4000-8000-00000000000a/protocolo/80000001-0000-4000-8000-000000000000.pdf',
      'comprovante.pdf', repeat('a', 64), 1)$$,
  '22023', 'data_protocolo_futura',
  'data de protocolo no futuro é recusada'
);

select throws_ok(
  $$select public.registrar_protocolo(current_setting('testes.p2')::uuid, 'IMA 2026/1',
      current_setting('testes.hoje')::date, null, null, null, null, 1)$$,
  '22023', 'comprovante_obrigatorio',
  'protocolo exige comprovante'
);

select throws_ok(
  $$select public.registrar_protocolo(current_setting('testes.p2')::uuid, 'IMA 2026/1',
      current_setting('testes.hoje')::date, '80000003-0000-4000-8000-000000000000',
      'c0000000-0000-4000-8000-00000000000b/protocolo/80000003-0000-4000-8000-000000000000.pdf',
      'comprovante.pdf', repeat('a', 64), 1)$$,
  '22023', 'caminho_invalido',
  'comprovante no caminho de outra consultoria é recusado'
);

select throws_ok(
  $$select public.registrar_protocolo(current_setting('testes.p2')::uuid, 'IMA 2026/1',
      current_setting('testes.hoje')::date, '80000009-0000-4000-8000-000000000000',
      'c0000000-0000-4000-8000-00000000000a/protocolo/80000009-0000-4000-8000-000000000000.pdf',
      'comprovante.pdf', repeat('a', 64), 1)$$,
  'P0001', 'arquivo_nao_encontrado',
  'comprovante que não chegou ao Storage é recusado'
);

select is(
  public.registrar_protocolo(current_setting('testes.p2')::uuid, ' IMA 2026/558812 ',
    current_setting('testes.hoje')::date - 1, '80000001-0000-4000-8000-000000000000',
    'c0000000-0000-4000-8000-00000000000a/protocolo/80000001-0000-4000-8000-000000000000.pdf',
    'Comprovante protocolo IMA.pdf', repeat('a', 64), 1),
  2,
  'Gestão registra o protocolo com número, data e comprovante'
);

select is(
  public.registrar_protocolo(current_setting('testes.p2')::uuid, ' IMA 2026/558812 ',
    current_setting('testes.hoje')::date - 1, '80000001-0000-4000-8000-000000000000',
    'c0000000-0000-4000-8000-00000000000a/protocolo/80000001-0000-4000-8000-000000000000.pdf',
    'Comprovante protocolo IMA.pdf', repeat('a', 64), 1),
  2,
  'repetir o mesmo registro (retry) devolve o mesmo resultado'
);

select results_eq(
  $$select protocolo_numero, protocolado_em = hoje - 1, comprovante_nome, comprovante_tamanho, registrado_por_nome,
           validade - hoje
    from public.obter_plano_renovacao(current_setting('testes.p2')::uuid)$$,
  $$values ('IMA 2026/558812', true, 'Comprovante protocolo IMA.pdf', 4096::bigint, 'Eduardo Karnopp', 130)$$,
  'o plano guarda número, data e comprovante; a validade original continua a mesma'
);

select results_eq(
  $$select situacao::text, row_version from public.instrumento where id = '10000000-0000-4000-8000-000000000002'$$,
  $$values ('ativo', 1)$$,
  'protocolar não altera a licença'
);

select throws_ok(
  $$select public.registrar_protocolo(current_setting('testes.p2')::uuid, 'IMA 2026/9',
      current_setting('testes.hoje')::date, '80000002-0000-4000-8000-000000000000',
      'c0000000-0000-4000-8000-00000000000a/protocolo/80000002-0000-4000-8000-000000000000.pdf',
      'outro.pdf', repeat('b', 64), 2)$$,
  'P0001', 'plano_protocolado',
  'não registra um segundo protocolo'
);

select throws_ok(
  $$select public.definir_antecedencia_renovacao(current_setting('testes.p2')::uuid, 10, 2)$$,
  'P0001', 'plano_protocolado',
  'depois do protocolo a antecedência não muda'
);

select results_eq(
  $$select licenca, protocolado_em is not null from public.listar_renovacoes('c0000000-0000-4000-8000-00000000000a')$$,
  $$values ('LAO 4821/2023', false), ('LAO 2207/2023', true)$$,
  'no radar as protocoladas vão para o fim'
);

reset role;

select ok(
  exists (
    select 1 from public.auditoria
    where entidade = 'plano_renovacao' and entidade_id = current_setting('testes.p2')::uuid
      and depois ->> 'protocolo_numero' = 'IMA 2026/558812'
  ),
  'o registro do protocolo fica na auditoria'
);

-- ---------------------------------------------------------------------------
-- Aguardando conferência
-- ---------------------------------------------------------------------------
select set_config('testes.o1', (select o.id::text from public.ocorrencia as o
  where o.instrumento_id = '10000000-0000-4000-8000-000000000001'), true);
insert into storage.objects (bucket_id, name, metadata) values
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/evidencia/50000001-0000-4000-8000-000000000000.pdf',
   '{"mimetype": "application/pdf", "size": 2048}');

select testes.autenticar_como('bruno@filtroville.test');
select public.enviar_evidencia(current_setting('testes.o1')::uuid, '70000000-0000-4000-8000-000000000001',
  '50000001-0000-4000-8000-000000000000',
  'c0000000-0000-4000-8000-00000000000a/evidencia/50000001-0000-4000-8000-000000000000.pdf',
  'Relatório.pdf', repeat('a', 64), current_setting('testes.hoje')::date);

select results_eq(
  $$select codigo, titulo, empreendimento_nome, responsavel_nome, conferente_nome, evidencia_numero, total
    from public.listar_aguardando_conferencia('c0000000-0000-4000-8000-00000000000a')$$,
  $$values ('4.2', 'Relatório de efluentes', 'Metalúrgica Rio Cubatão', 'Bruno Tavares', null::text, 1, 1::bigint)$$,
  'a evidência enviada aparece aguardando conferência'
);

select testes.autenticar_como('eduardo@filtroville.test');
select public.conferir_evidencia('70000000-0000-4000-8000-000000000001', 'aprovada', null);

select is(
  (select count(*) from public.listar_aguardando_conferencia('c0000000-0000-4000-8000-00000000000a')),
  0::bigint,
  'aprovada sai da lista (falta só concluir)'
);

-- ---------------------------------------------------------------------------
-- Isolamento
-- ---------------------------------------------------------------------------
select testes.autenticar_como('helena@verdesul.test');

select results_eq(
  $$select (select count(*) from public.plano_renovacao),
           (select count(*) from public.listar_renovacoes('c0000000-0000-4000-8000-00000000000a')),
           (select count(*) from public.obter_plano_renovacao(current_setting('testes.p1')::uuid)),
           (select count(*) from public.listar_aguardando_conferencia('c0000000-0000-4000-8000-00000000000a'))$$,
  $$values (0::bigint, 0::bigint, 0::bigint, 0::bigint)$$,
  'Helena (B) recebe zero planos, radar, plano e conferências de A'
);

select testes.autenticar_como('gustavo@verdesul.test');

select throws_ok(
  $$select public.definir_antecedencia_renovacao(current_setting('testes.p1')::uuid, 10, 2)$$,
  '42501', 'sem_permissao',
  'Gestão de B não muda a antecedência de um plano de A'
);

select throws_ok(
  $$select public.registrar_protocolo(current_setting('testes.p1')::uuid, 'X', current_setting('testes.hoje')::date,
      '80000003-0000-4000-8000-000000000000',
      'c0000000-0000-4000-8000-00000000000b/protocolo/80000003-0000-4000-8000-000000000000.pdf',
      'x.pdf', repeat('c', 64), 2)$$,
  '42501', 'sem_permissao',
  'Gestão de B não registra protocolo em plano de A'
);

select * from finish();
rollback;
