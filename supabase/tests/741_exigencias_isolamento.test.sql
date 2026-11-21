-- Exigências do órgão (P3, ADR-0045): isolamento entre consultorias (teste negativo). A Gestão de
-- outra consultoria (Verde Sul) recebe zero linhas e não escreve nada nos dados da Filtroville,
-- mesmo conhecendo os UUIDs; licença de outra unidade ou consultoria e membro de outra consultoria
-- são recusados.
begin;

set local timezone to 'America/Sao_Paulo';

select plan(25);

select testes.criar_dados_sinteticos();

select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

-- ---------------------------------------------------------------------------
-- Cenário. A: empreendimento com duas unidades e uma licença na Matriz. B: empreendimento próprio.
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_empreendimento('74100000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
  'Curtume Ipiranga');
select public.criar_unidade('74100000-0000-4000-8000-0000000000f1', '74100000-0000-4000-8000-0000000000e1',
  'Matriz');
select public.criar_unidade('74100000-0000-4000-8000-0000000000f2', '74100000-0000-4000-8000-0000000000e1',
  'Filial');

select testes.autenticar_como('gustavo@verdesul.test');
select public.criar_empreendimento('74100000-0000-4000-8000-0000000000eb', 'c0000000-0000-4000-8000-00000000000b',
  'Frigorífico Verde');
select public.criar_unidade('74100000-0000-4000-8000-0000000000fb', '74100000-0000-4000-8000-0000000000eb',
  'Abatedouro');

reset role;
insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, tipo_id, numero, criado_por)
select '74100000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-00000000000a',
       '74100000-0000-4000-8000-0000000000e1', '74100000-0000-4000-8000-0000000000f1', t.id, '741/2026',
       'd0000000-0000-4000-8000-0000000000a1'
from public.tipo_instrumento as t
where t.consultoria_id = 'c0000000-0000-4000-8000-00000000000a' and t.sigla = 'LAO';

-- Exigência de A, com responsável e uma resposta.
select testes.autenticar_como('eduardo@filtroville.test');
select public.registrar_exigencia(
  p_id => '74100000-0000-4000-8000-0000000000a1',
  p_unidade_id => '74100000-0000-4000-8000-0000000000f1',
  p_assunto => 'Plano de gerenciamento de resíduos',
  p_recebido_em => current_setting('testes.hoje')::date - 10,
  p_prazo_oficial => current_setting('testes.hoje')::date + 20,
  p_meta_interna => current_setting('testes.hoje')::date + 15,
  p_prazo_dias => 30,
  p_prazo_contagem => 'corridos',
  p_instrumento_id => '74100000-0000-4000-8000-000000000011',
  p_numero_oficio => '741/2026',
  p_responsavel_id => 'd0000000-0000-4000-8000-0000000000a2');
select public.registrar_exigencia(
  p_id => '74100000-0000-4000-8000-0000000000a2',
  p_unidade_id => '74100000-0000-4000-8000-0000000000f1',
  p_assunto => 'Laudo de ruído',
  p_recebido_em => current_setting('testes.hoje')::date - 10,
  p_prazo_oficial => current_setting('testes.hoje')::date + 20,
  p_meta_interna => current_setting('testes.hoje')::date + 15,
  p_prazo_dias => 30,
  p_prazo_contagem => 'corridos');
select public.responder_exigencia(
  p_resposta_id => '74100000-0000-4000-8000-0000000000b1',
  p_exigencia_id => '74100000-0000-4000-8000-0000000000a2',
  p_protocolado_em => current_setting('testes.hoje')::date - 1,
  p_protocolo_numero => 'PROT-1');

select is((select count(*) from public.exigencia), 2::bigint, 'a Gestão de A vê as duas exigências de A');

-- ---------------------------------------------------------------------------
-- Gestão de B: zero linhas
-- ---------------------------------------------------------------------------
select testes.autenticar_como('gustavo@verdesul.test');

select is((select count(*) from public.exigencia), 0::bigint, 'B não lê exigencia de A');
select is((select count(*) from public.exigencia_resposta), 0::bigint, 'B não lê exigencia_resposta de A');
select is(
  (select count(*) from public.listar_exigencias('c0000000-0000-4000-8000-00000000000a')),
  0::bigint,
  'listar_exigencias de A volta vazio para B'
);
select is(
  (select count(*) from public.listar_exigencias(p_consultoria_id => 'c0000000-0000-4000-8000-00000000000a',
     p_exigencia_id => '74100000-0000-4000-8000-0000000000a1')),
  0::bigint,
  'o detalhe de uma exigência de A volta vazio para B, mesmo com o UUID'
);
select is(
  (select count(*) from public.listar_respostas_da_exigencia('74100000-0000-4000-8000-0000000000a2')),
  0::bigint,
  'listar_respostas_da_exigencia de A volta vazio para B'
);
select is(
  (select count(*) from public.listar_prazos('c0000000-0000-4000-8000-00000000000a')
   where tipo_linha = 'exigencia'),
  0::bigint,
  'listar_prazos de A não traz exigência para B'
);
select is(
  (select count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', '741/2026')),
  0::bigint,
  'a busca de A não traz exigência para B'
);

-- ---------------------------------------------------------------------------
-- Gestão de B: nenhuma escrita nos dados de A
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.registrar_exigencia(p_id => gen_random_uuid(),
      p_unidade_id => '74100000-0000-4000-8000-0000000000f1', p_assunto => 'Invasão',
      p_recebido_em => current_setting('testes.hoje')::date, p_prazo_oficial => current_setting('testes.hoje')::date + 5,
      p_meta_interna => current_setting('testes.hoje')::date + 4, p_prazo_dias => 5, p_prazo_contagem => 'corridos')$$,
  '42501', 'sem_permissao',
  'B não registra exigência numa unidade de A'
);

select throws_ok(
  $$select public.registrar_exigencia(p_id => gen_random_uuid(),
      p_unidade_id => '74100000-0000-4000-8000-0000000000fb', p_assunto => 'Licença alheia',
      p_recebido_em => current_setting('testes.hoje')::date, p_prazo_oficial => current_setting('testes.hoje')::date + 5,
      p_meta_interna => current_setting('testes.hoje')::date + 4, p_prazo_dias => 5, p_prazo_contagem => 'corridos',
      p_instrumento_id => '74100000-0000-4000-8000-000000000011')$$,
  '22023', 'licenca_invalida',
  'B não liga a licença de A a uma exigência própria'
);

select throws_ok(
  $$select public.registrar_exigencia(p_id => '74100000-0000-4000-8000-0000000000a1',
      p_unidade_id => '74100000-0000-4000-8000-0000000000fb', p_assunto => 'Mesmo UUID',
      p_recebido_em => current_setting('testes.hoje')::date, p_prazo_oficial => current_setting('testes.hoje')::date + 5,
      p_meta_interna => current_setting('testes.hoje')::date + 4, p_prazo_dias => 5, p_prazo_contagem => 'corridos')$$,
  '42501', 'sem_permissao',
  'B não reaproveita o UUID de uma exigência de A'
);

select throws_ok(
  $$select public.responder_exigencia(p_resposta_id => gen_random_uuid(),
      p_exigencia_id => '74100000-0000-4000-8000-0000000000a1',
      p_protocolado_em => current_setting('testes.hoje')::date, p_protocolo_numero => 'X')$$,
  '42501', 'sem_permissao',
  'B não responde uma exigência de A'
);

select throws_ok(
  $$select public.prorrogar_exigencia(p_resposta_id => gen_random_uuid(),
      p_exigencia_id => '74100000-0000-4000-8000-0000000000a1', p_row_version => 1,
      p_prazo_novo => current_setting('testes.hoje')::date + 60, p_meta_interna => current_setting('testes.hoje')::date + 50,
      p_motivo => 'Prorrogação indevida')$$,
  '42501', 'sem_permissao',
  'B não prorroga uma exigência de A'
);

select throws_ok(
  $$select public.atribuir_exigencia('74100000-0000-4000-8000-0000000000a1', 'd0000000-0000-4000-8000-0000000000b2', 1)$$,
  '42501', 'sem_permissao',
  'B não atribui uma exigência de A'
);

select throws_ok(
  $$select public.editar_exigencia(p_exigencia_id => '74100000-0000-4000-8000-0000000000a1', p_row_version => 1,
      p_assunto => 'Trocado', p_meta_interna => current_setting('testes.hoje')::date + 10)$$,
  '42501', 'sem_permissao',
  'B não edita uma exigência de A'
);

select throws_ok(
  $$select public.excluir_exigencia('74100000-0000-4000-8000-0000000000a1', 1)$$,
  '42501', 'sem_permissao',
  'B não exclui uma exigência de A'
);

select throws_ok(
  $$select public.anexar_a_exigencia(gen_random_uuid(), '74100000-0000-4000-8000-0000000000a1', 'Anexo',
      gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000b/exigencia_resposta/x.pdf', 'x.pdf', repeat('a', 64))$$,
  '42501', 'sem_permissao',
  'B não anexa documento a uma exigência de A'
);

select throws_ok(
  $$select public.definir_processo_da_licenca('74100000-0000-4000-8000-000000000011', 1, 'PROC-B')$$,
  '42501', 'sem_permissao',
  'B não grava processo na licença de A'
);

select throws_ok(
  $$insert into public.exigencia_resposta (consultoria_id, exigencia_id, tipo, protocolado_em, protocolo_numero,
      registrado_por)
    values ('c0000000-0000-4000-8000-00000000000a', '74100000-0000-4000-8000-0000000000a1', 'resposta',
            current_date, 'X', 'd0000000-0000-4000-8000-0000000000b1')$$,
  '42501', null,
  'B não insere direto na exigencia_resposta'
);

-- ---------------------------------------------------------------------------
-- Gestão de A: licença de outra unidade e membro de outra consultoria são recusados
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.registrar_exigencia(p_id => gen_random_uuid(),
      p_unidade_id => '74100000-0000-4000-8000-0000000000f2', p_assunto => 'Licença da Matriz na Filial',
      p_recebido_em => current_setting('testes.hoje')::date, p_prazo_oficial => current_setting('testes.hoje')::date + 5,
      p_meta_interna => current_setting('testes.hoje')::date + 4, p_prazo_dias => 5, p_prazo_contagem => 'corridos',
      p_instrumento_id => '74100000-0000-4000-8000-000000000011')$$,
  '22023', 'licenca_invalida',
  'A não liga a licença de outra unidade'
);

select throws_ok(
  $$select public.registrar_exigencia(p_id => gen_random_uuid(),
      p_unidade_id => '74100000-0000-4000-8000-0000000000f1', p_assunto => 'Responsável de B',
      p_recebido_em => current_setting('testes.hoje')::date, p_prazo_oficial => current_setting('testes.hoje')::date + 5,
      p_meta_interna => current_setting('testes.hoje')::date + 4, p_prazo_dias => 5, p_prazo_contagem => 'corridos',
      p_responsavel_id => 'd0000000-0000-4000-8000-0000000000b2')$$,
  'P0001', 'responsavel_invalido',
  'A não registra com responsável de B'
);

select throws_ok(
  $$select public.atribuir_exigencia('74100000-0000-4000-8000-0000000000a1', 'd0000000-0000-4000-8000-0000000000b2', 1)$$,
  'P0001', 'responsavel_invalido',
  'A não atribui membro de B'
);

reset role;

select throws_ok(
  $$insert into public.exigencia (consultoria_id, empreendimento_id, unidade_id, assunto, recebido_em,
      prazo_oficial_original, prazo_oficial, prazo_oficial_texto, meta_interna, criado_por)
    values ('c0000000-0000-4000-8000-00000000000b', '74100000-0000-4000-8000-0000000000e1',
            '74100000-0000-4000-8000-0000000000f1', 'Cruzada', current_date, current_date + 5, current_date + 5,
            '5 dias', current_date, 'd0000000-0000-4000-8000-0000000000b1')$$,
  '23503', null,
  'a FK composta impede exigência de B na unidade de A, mesmo como dono'
);

select throws_ok(
  $$insert into public.exigencia_resposta (consultoria_id, exigencia_id, tipo, protocolado_em, protocolo_numero,
      registrado_por)
    values ('c0000000-0000-4000-8000-00000000000b', '74100000-0000-4000-8000-0000000000a1', 'resposta',
            current_date, 'X', 'd0000000-0000-4000-8000-0000000000b1')$$,
  '23503', null,
  'a FK composta impede resposta de B numa exigência de A, mesmo como dono'
);

select is(
  (select count(*) from public.exigencia_resposta where exigencia_id = '74100000-0000-4000-8000-0000000000a1'),
  0::bigint,
  'nada foi escrito na exigência de A'
);

select * from finish();

rollback;
