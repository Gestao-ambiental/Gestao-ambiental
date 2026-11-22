-- P6 · Relatório mensal ao cliente (ADR-0052) com as exigências do órgão (P3, ADR-0045). As
-- respostas protocoladas no mês entram em "protocolos", com ofício, assunto e número do protocolo;
-- exigência sem resposta, exigência de outro empreendimento e o mês anterior não entram. Nada de
-- descrição interna da resposta, notas nem nomes da equipe. Outra consultoria recebe zero.
begin;

set local timezone to 'America/Sao_Paulo';

select plan(9);

select testes.criar_dados_sinteticos();

select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);
select set_config('testes.mes', date_trunc('month', current_setting('testes.hoje')::date)::date::text, true);

-- ---------------------------------------------------------------------------
-- Cenário: empreendimento e1 com três exigências (a1 respondida hoje, a2 aberta, a3 respondida
-- hoje sem número de ofício) e e2 com uma exigência respondida hoje.
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_empreendimento('79700000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
  'Curtume Ipiranga');
select public.criar_unidade('79700000-0000-4000-8000-0000000000f1', '79700000-0000-4000-8000-0000000000e1',
  'Matriz');
select public.criar_empreendimento('79700000-0000-4000-8000-0000000000e2', 'c0000000-0000-4000-8000-00000000000a',
  'Frigorífico Norte');
select public.criar_unidade('79700000-0000-4000-8000-0000000000f2', '79700000-0000-4000-8000-0000000000e2',
  'Abatedouro');

select public.registrar_exigencia(p_id => '79700000-0000-4000-8000-0000000000a1',
  p_unidade_id => '79700000-0000-4000-8000-0000000000f1', p_assunto => 'Laudo de ruído',
  p_recebido_em => current_setting('testes.hoje')::date - 5,
  p_prazo_oficial => current_setting('testes.hoje')::date + 5,
  p_meta_interna => current_setting('testes.hoje')::date + 4,
  p_prazo_dias => 10, p_prazo_contagem => 'corridos', p_numero_oficio => '45/2026', p_orgao => 'IMA',
  p_notas => 'Nota interna: cliente atrasou o laudo',
  p_responsavel_id => 'd0000000-0000-4000-8000-0000000000a2');
select public.responder_exigencia(p_resposta_id => '79700000-0000-4000-8000-0000000000b1',
  p_exigencia_id => '79700000-0000-4000-8000-0000000000a1',
  p_protocolado_em => current_setting('testes.hoje')::date,
  p_protocolo_numero => 'PROT-797', p_descricao => 'Descrição interna da resposta');

select public.registrar_exigencia(p_id => '79700000-0000-4000-8000-0000000000a2',
  p_unidade_id => '79700000-0000-4000-8000-0000000000f1', p_assunto => 'Estudo de fauna',
  p_recebido_em => current_setting('testes.hoje')::date - 2,
  p_prazo_oficial => current_setting('testes.hoje')::date + 8,
  p_meta_interna => current_setting('testes.hoje')::date + 7,
  p_prazo_dias => 10, p_prazo_contagem => 'corridos', p_numero_oficio => '46/2026');

select public.registrar_exigencia(p_id => '79700000-0000-4000-8000-0000000000a3',
  p_unidade_id => '79700000-0000-4000-8000-0000000000f1', p_assunto => 'Plano de emergência',
  p_recebido_em => current_setting('testes.hoje')::date - 3,
  p_prazo_oficial => current_setting('testes.hoje')::date + 7,
  p_meta_interna => current_setting('testes.hoje')::date + 6,
  p_prazo_dias => 10, p_prazo_contagem => 'corridos');
select public.responder_exigencia(p_resposta_id => '79700000-0000-4000-8000-0000000000b3',
  p_exigencia_id => '79700000-0000-4000-8000-0000000000a3',
  p_protocolado_em => current_setting('testes.hoje')::date,
  p_protocolo_numero => 'PROT-798');

select public.registrar_exigencia(p_id => '79700000-0000-4000-8000-0000000000a4',
  p_unidade_id => '79700000-0000-4000-8000-0000000000f2', p_assunto => 'Outro empreendimento',
  p_recebido_em => current_setting('testes.hoje')::date - 3,
  p_prazo_oficial => current_setting('testes.hoje')::date + 7,
  p_meta_interna => current_setting('testes.hoje')::date + 6,
  p_prazo_dias => 10, p_prazo_contagem => 'corridos', p_numero_oficio => '99/2026');
select public.responder_exigencia(p_resposta_id => '79700000-0000-4000-8000-0000000000b4',
  p_exigencia_id => '79700000-0000-4000-8000-0000000000a4',
  p_protocolado_em => current_setting('testes.hoje')::date,
  p_protocolo_numero => 'PROT-799');

select set_config('testes.relatorio', public.dados_para_relatorio_mensal(
  '79700000-0000-4000-8000-0000000000e1', current_setting('testes.mes')::date)::text, true);

-- ---------------------------------------------------------------------------
-- Gestão
-- ---------------------------------------------------------------------------
select results_eq(
  $$select p ->> 'titulo', p ->> 'detalhe', (p ->> 'data')::date
    from jsonb_array_elements(current_setting('testes.relatorio')::jsonb -> 'protocolos') as p
    order by p ->> 'detalhe'$$,
  $$values
    ('Resposta à exigência: Ofício 45/2026 · Laudo de ruído'::text, 'PROT-797'::text,
     current_setting('testes.hoje')::date),
    ('Resposta à exigência: Plano de emergência'::text, 'PROT-798'::text,
     current_setting('testes.hoje')::date)$$,
  'as respostas protocoladas no mês entram com ofício, assunto e protocolo'
);

select ok(
  (current_setting('testes.relatorio')::jsonb -> 'protocolos')::text !~ 'Estudo de fauna',
  'exigência ainda aberta não entra como resposta (só nos próximos 90 dias)'
);
select ok(
  current_setting('testes.relatorio') !~ 'PROT-799',
  'resposta de outro empreendimento não entra'
);
select ok(
  current_setting('testes.relatorio') !~ '(Nota interna|Descrição interna)',
  'notas da exigência e descrição da resposta não vão ao cliente'
);
select ok(
  current_setting('testes.relatorio') !~ 'Ana Ribeiro',
  'o nome da responsável pela exigência não vai ao cliente'
);

select is(
  (select count(*)::integer
   from jsonb_array_elements(public.dados_para_relatorio_mensal('79700000-0000-4000-8000-0000000000e1',
     (current_setting('testes.mes')::date - interval '1 month')::date) -> 'protocolos')),
  0,
  'mês anterior: nenhuma resposta'
);

-- ---------------------------------------------------------------------------
-- Equipe e outra consultoria
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');
select throws_ok(
  $$select public.dados_para_relatorio_mensal('79700000-0000-4000-8000-0000000000e1', current_date)$$,
  '42501', 'sem_permissao',
  'Equipe, mesmo responsável pela exigência, não gera o relatório'
);

select testes.autenticar_como('gustavo@verdesul.test');
select is(
  (select count(*)::integer from private.relatorio_exigencias_do_mes('c0000000-0000-4000-8000-00000000000a',
     '79700000-0000-4000-8000-0000000000e1', current_setting('testes.mes')::date,
     current_setting('testes.hoje')::date + 40)),
  0,
  'outra consultoria recebe zero respostas pela fonte, mesmo com os UUIDs'
);
select throws_ok(
  $$select public.dados_para_relatorio_mensal('79700000-0000-4000-8000-0000000000e1', current_date)$$,
  '42501', 'sem_permissao',
  'Gestão de outra consultoria não gera o relatório da Filtroville'
);

select * from finish();

rollback;
