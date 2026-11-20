-- Conferência do relatório por IA (ADR-0036, fatia 3). A evidência aceita .docx; quem enviou, o
-- conferente ou a Gestão pedem a conferência; uma viva por versão; plano sem IA e imagem não chamam
-- a IA; a cota soma com a extração; só a service role conclui. Outra consultoria não vê nem pede.
begin;

select plan(21);

select testes.criar_dados_sinteticos();
select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

-- Plano com IA (Equipe) pelo contrato, fora do beta.
update private.configuracao_comercial set fim_do_beta = current_date - 400;
update public.consultoria set criada_em = now() - interval '60 days' where id = 'c0000000-0000-4000-8000-00000000000a';
insert into public.consultoria_condicao_comercial (consultoria_id, plano_contrato)
values ('c0000000-0000-4000-8000-00000000000a', 'equipe')
on conflict (consultoria_id) do update set plano_contrato = excluded.plano_contrato, contrato_ate = null;

insert into public.empreendimento (id, consultoria_id, nome, cnpj, criado_por)
values ('e0000000-0000-4000-8000-000000000690', 'c0000000-0000-4000-8000-00000000000a',
        'Metalúrgica Rio Cubatão', '11222333000181', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome)
values ('f0000000-0000-4000-8000-000000000690', 'c0000000-0000-4000-8000-00000000000a',
        'e0000000-0000-4000-8000-000000000690', 'Matriz');

select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_instrumento('10000000-0000-4000-8000-000000000690', 'f0000000-0000-4000-8000-000000000690');
select public.salvar_identificacao('10000000-0000-4000-8000-000000000690', 1, 'f0000000-0000-4000-8000-000000000690',
  (select id from public.tipo_instrumento where sigla = 'LAO' and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  '4821/2023', 'IMA', null, current_setting('testes.hoje')::date - 30, null, null, 'assinatura',
  current_setting('testes.hoje')::date + 400);
select public.salvar_condicionante('30000000-0000-4000-8000-000000000690',
  '10000000-0000-4000-8000-000000000690', null, '4.1', 'Monitoramento de efluentes',
  'Apresentar relatório semestral de efluentes.', 'obrigacao');
select public.confirmar_prazo('30000000-0000-4000-8000-000000000690', 'unica', null, null,
  'corridos', null, current_setting('testes.hoje')::date + 5, 'Documento');
select public.atribuir_a_todos('10000000-0000-4000-8000-000000000690', 'd0000000-0000-4000-8000-0000000000a3');
select public.ativar_plano('10000000-0000-4000-8000-000000000690',
  (select row_version from public.instrumento where id = '10000000-0000-4000-8000-000000000690'), gen_random_uuid());

reset role;
select set_config('testes.oc', (select o.id::text from public.ocorrencia as o
  join public.condicionante_versao as v on v.id = o.condicionante_versao_id
  where v.condicionante_id = '30000000-0000-4000-8000-000000000690'), true);

insert into storage.objects (bucket_id, name, metadata) values
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/evidencia/50000000-0000-4000-8000-000000000691.docx',
   '{"mimetype": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "size": 4096}'),
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/evidencia/50000000-0000-4000-8000-000000000692.docx',
   '{"mimetype": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "size": 4096}'),
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/evidencia/50000000-0000-4000-8000-000000000693.png',
   '{"mimetype": "image/png", "size": 4096}');

-- ---------------------------------------------------------------- evidência em .docx
select testes.autenticar_como('bruno@filtroville.test');

select is(
  public.enviar_evidencia(current_setting('testes.oc')::uuid, '60000000-0000-4000-8000-000000000691',
    '50000000-0000-4000-8000-000000000691',
    'c0000000-0000-4000-8000-00000000000a/evidencia/50000000-0000-4000-8000-000000000691.docx',
    'Relatório.docx', repeat('a', 64), current_setting('testes.hoje')::date - 1),
  1,
  'a evidência aceita .docx'
);

-- ---------------------------------------------------------------- iniciar
select results_eq(
  $$select conferencia_id, nova, situacao, ia_liberada, mime, contexto #>> '{empreendimento,cnpj}',
           contexto #>> '{licenca,numero}', contexto #>> '{condicionante,codigo}'
    from public.iniciar_conferencia_ia('70000000-0000-4000-8000-000000000691', '60000000-0000-4000-8000-000000000691')$$,
  $$values ('70000000-0000-4000-8000-000000000691'::uuid, true, 'em_andamento', true,
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '11222333000181', '4821/2023', '4.1')$$,
  'quem enviou inicia a conferência e recebe o arquivo e o contexto do cadastro'
);

select results_eq(
  $$select conferencia_id, nova, situacao
    from public.iniciar_conferencia_ia('70000000-0000-4000-8000-000000000699', '60000000-0000-4000-8000-000000000691')$$,
  $$values ('70000000-0000-4000-8000-000000000691'::uuid, false, 'em_andamento')$$,
  'pedir de novo com outro id devolve a conferência viva, sem criar outra'
);

select testes.autenticar_como('ana@filtroville.test');
select throws_ok(
  $$select * from public.iniciar_conferencia_ia('70000000-0000-4000-8000-000000000698', '60000000-0000-4000-8000-000000000691')$$,
  '42501', 'sem_permissao',
  'membro da Equipe que não enviou nem confere não pede a conferência'
);
select is(
  (select count(*)::integer from public.conferencia_ia),
  1,
  'todo membro ativo lê a conferência'
);
select throws_ok(
  $$select public.concluir_conferencia_ia('70000000-0000-4000-8000-000000000691', 'ok', '[]', 'm', 'v', 1, 1, 1, 1)$$,
  '42501', null,
  'usuário logado não conclui a conferência'
);

select testes.autenticar_como('gustavo@verdesul.test');
select is(
  (select count(*)::integer from public.conferencia_ia),
  0,
  'outra consultoria não vê a conferência'
);
select throws_ok(
  $$select * from public.iniciar_conferencia_ia('70000000-0000-4000-8000-000000000697', '60000000-0000-4000-8000-000000000691')$$,
  '42501', 'sem_permissao',
  'outra consultoria não pede a conferência pelo id conhecido'
);

-- ---------------------------------------------------------------- service role
reset role;
set local role service_role;

select is(public.reservar_conferencia_ia('70000000-0000-4000-8000-000000000691'), true,
  'a primeira reserva da conferência passa');
select is(public.reservar_conferencia_ia('70000000-0000-4000-8000-000000000691'), false,
  'a mesma conferência não reserva duas vezes');

select throws_ok(
  $$select public.concluir_conferencia_ia('70000000-0000-4000-8000-000000000691', 'ok',
    '[{"origem": "ia", "categoria": "outra", "gravidade": "corrigir", "problema": "x"}]', 'm', 'v', 1, 1, 1, 1)$$,
  '22023', 'resposta_invalida',
  'apontamento fora do formato é recusado'
);

select is(
  public.concluir_conferencia_ia('70000000-0000-4000-8000-000000000691', 'Dois pontos a revisar.',
    '[{"origem": "regra", "categoria": "empreendimento", "gravidade": "corrigir", "trecho": "CNPJ 00.000.000/0001-00",
       "problema": "CNPJ diferente do cadastro.", "sugestao": "Use 11.222.333/0001-81."},
      {"origem": "ia", "categoria": "datas", "gravidade": "verificar", "trecho": "",
       "problema": "Período de coleta depois da data de execução.", "sugestao": ""}]',
    'openai/gpt-4.1-mini', 'conferencia-v1', 1000, 200, 900, 4000),
  2,
  'a service role conclui com os apontamentos'
);

reset role;
select results_eq(
  $$select situacao, resumo, jsonb_array_length(apontamentos), concluida_em is not null
    from public.conferencia_ia where id = '70000000-0000-4000-8000-000000000691'$$,
  $$values ('concluida', 'Dois pontos a revisar.', 2, true)$$,
  'a conferência fica concluída com o resumo'
);

-- ---------------------------------------------------------------- nova versão, cota somada e plano
reset role;
select testes.autenticar_como('eduardo@filtroville.test');
select public.conferir_evidencia('60000000-0000-4000-8000-000000000691', 'devolvida', 'Corrigir o CNPJ');
select testes.autenticar_como('bruno@filtroville.test');
select public.enviar_evidencia(current_setting('testes.oc')::uuid, '60000000-0000-4000-8000-000000000692',
  '50000000-0000-4000-8000-000000000692',
  'c0000000-0000-4000-8000-00000000000a/evidencia/50000000-0000-4000-8000-000000000692.docx',
  'Relatório v2.docx', repeat('b', 64), current_setting('testes.hoje')::date - 1);

select results_eq(
  $$select nova, situacao
    from public.iniciar_conferencia_ia('70000000-0000-4000-8000-000000000692', '60000000-0000-4000-8000-000000000692')$$,
  $$values (true, 'em_andamento')$$,
  'a versão nova ganha a própria conferência'
);

reset role;
update private.limite_extracao_ia set por_conta = 1;
set local role service_role;
select is(public.reservar_conferencia_ia('70000000-0000-4000-8000-000000000692'), false,
  'sem cota da pessoa (1 por conta), a reserva é recusada');
reset role;
update private.limite_extracao_ia set por_conta = 10;
set local role service_role;
select is(public.reservar_conferencia_ia('70000000-0000-4000-8000-000000000692'), true,
  'com cota, a reserva passa');

select lives_ok(
  $$select public.falhar_conferencia_ia('70000000-0000-4000-8000-000000000692', 'provedor_indisponivel',
    'http 503', '[{"origem": "regra", "categoria": "escrita", "gravidade": "corrigir", "problema": "Campo sem preencher."}]',
    'openai/gpt-4.1-mini', 'conferencia-v1', null, null, null, 3000)$$,
  'a falha grava o motivo e os apontamentos das regras fixas'
);

reset role;
update public.consultoria_condicao_comercial set plano_contrato = 'essencial'
where consultoria_id = 'c0000000-0000-4000-8000-00000000000a';
select testes.autenticar_como('eduardo@filtroville.test');

select results_eq(
  $$select nova, situacao, ia_liberada
    from public.iniciar_conferencia_ia('70000000-0000-4000-8000-000000000694', '60000000-0000-4000-8000-000000000692')$$,
  $$values (true, 'em_andamento', false)$$,
  'a Gestão refaz a conferência que falhou; no plano sem IA, só as regras fixas rodam'
);

reset role;
set local role service_role;
select is(public.reservar_conferencia_ia('70000000-0000-4000-8000-000000000694'), false,
  'sem IA no plano, não há reserva de chamada paga');

-- ---------------------------------------------------------------- imagem
reset role;
update public.consultoria_condicao_comercial set plano_contrato = 'equipe'
where consultoria_id = 'c0000000-0000-4000-8000-00000000000a';
select testes.autenticar_como('eduardo@filtroville.test');
select public.conferir_evidencia('60000000-0000-4000-8000-000000000692', 'devolvida', 'Mandar a foto');
select testes.autenticar_como('bruno@filtroville.test');
select public.enviar_evidencia(current_setting('testes.oc')::uuid, '60000000-0000-4000-8000-000000000693',
  '50000000-0000-4000-8000-000000000693',
  'c0000000-0000-4000-8000-00000000000a/evidencia/50000000-0000-4000-8000-000000000693.png',
  'Foto.png', repeat('c', 64), current_setting('testes.hoje')::date - 1);

select results_eq(
  $$select nova, situacao, motivo
    from public.iniciar_conferencia_ia('70000000-0000-4000-8000-000000000693', '60000000-0000-4000-8000-000000000693')$$,
  $$values (false, 'falhou', 'tipo_sem_texto')$$,
  'imagem não tem texto para conferir e não chama a IA'
);

reset role;
select is(
  (select count(*)::integer from private.reserva_conferencia_ia),
  2,
  'só as chamadas pagas reservaram cota'
);

select * from finish();
rollback;
