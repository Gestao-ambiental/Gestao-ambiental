-- L7 · Mudança de norma no resumo diário (ADR-0050, ADR-0055): quem recebe (a Gestão e os
-- responsáveis das condicionantes da licença afetada), só publicadas, sem repetir o que saiu no
-- último resumo, vista fica de fora; e-mail na hora só para revogação com licença ativa, uma vez
-- por pessoa, respeitando o descadastro; só a service role chama; outra consultoria não vê nada.
begin;

select plan(16);

select testes.criar_dados_sinteticos();

select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('e7640000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a',
        'Metalúrgica Rio Cubatão', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome)
values ('f7640000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a',
        'e7640000-0000-4000-8000-000000000001', 'Matriz');

-- LAO ativa de A com uma condicionante do Bruno.
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_instrumento('17640000-0000-4000-8000-000000000001', 'f7640000-0000-4000-8000-000000000001');
select public.salvar_identificacao('17640000-0000-4000-8000-000000000001', 1, 'f7640000-0000-4000-8000-000000000001',
  (select id from public.tipo_instrumento where sigla = 'LAO' and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  '4821/2023', 'IMA', null, current_setting('testes.hoje')::date - 30, null, null, 'assinatura',
  current_setting('testes.hoje')::date + 400);
select public.salvar_condicionante('37640000-0000-4000-8000-000000000001', '17640000-0000-4000-8000-000000000001',
  null, '1.1', 'Entrega', '', 'obrigacao');
select public.confirmar_prazo('37640000-0000-4000-8000-000000000001', 'unica', null, null, 'corridos',
  null, current_setting('testes.hoje')::date + 20, 'Documento');
select public.atribuir_a_todos('17640000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a3');
select public.ativar_plano('17640000-0000-4000-8000-000000000001',
  (select row_version from public.instrumento where id = '17640000-0000-4000-8000-000000000001'),
  gen_random_uuid());

reset role;

-- B: empreendimento com LAO ativa.
insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('e7640000-0000-4000-8000-0000000000b1', 'c0000000-0000-4000-8000-00000000000b',
        'Posto Rota Sul', 'd0000000-0000-4000-8000-0000000000b1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome)
values ('f7640000-0000-4000-8000-0000000000b1', 'c0000000-0000-4000-8000-00000000000b',
        'e7640000-0000-4000-8000-0000000000b1', 'Matriz');
insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, tipo_id, numero, orgao, situacao,
                                assinado_em, marco, validade, criado_por, ativado_em, ativado_por, chave_ativacao)
values ('17640000-0000-4000-8000-0000000000b1', 'c0000000-0000-4000-8000-00000000000b',
        'e7640000-0000-4000-8000-0000000000b1', 'f7640000-0000-4000-8000-0000000000b1',
        (select t.id from public.tipo_instrumento as t where t.sigla = 'LAO'
           and t.consultoria_id = 'c0000000-0000-4000-8000-00000000000b'),
        '900/2024', 'IMA', 'ativo', current_setting('testes.hoje')::date - 300, 'assinatura',
        current_setting('testes.hoje')::date + 400, 'd0000000-0000-4000-8000-0000000000b1', now(),
        'd0000000-0000-4000-8000-0000000000b1', gen_random_uuid());

-- Normas: R revogada (publicada), A alterada (publicada), N nova (ainda não publicada).
insert into private.norma (id, chave, esfera, orgao, tipo, numero, ano, titulo, situacao_na_fonte) values
  ('a7640000-0000-4000-8000-000000000001', 'sc;teste764;r', 'estadual', 'IMA-TESTE', 'instrucao_normativa',
   '02', 2020, 'IN 02 · Efluentes', 'revogada'),
  ('a7640000-0000-4000-8000-000000000002', 'sc;teste764;a', 'estadual', 'IMA-TESTE', 'portaria',
   '10', 2024, 'Portaria 10 · Ruído', 'vigente'),
  ('a7640000-0000-4000-8000-000000000003', 'sc;teste764;n', 'estadual', 'IMA-TESTE', 'portaria',
   '11', 2026, 'Portaria 11 · Resíduos', 'vigente');
insert into private.norma_versao (id, norma_id, numero, sha256) values
  ('b7640000-0000-4000-8000-000000000002', 'a7640000-0000-4000-8000-000000000002', 1, lpad('7642', 64, '0')),
  ('b7640000-0000-4000-8000-000000000003', 'a7640000-0000-4000-8000-000000000003', 1, lpad('7643', 64, '0'));
insert into private.norma_mudanca (id, norma_id, versao_nova_id, tipo, situacao, revisada_por, publicada_em) values
  ('c7640000-0000-4000-8000-000000000001', 'a7640000-0000-4000-8000-000000000001', null, 'revogada',
   'publicada', testes.id_do_usuario('eduardo@filtroville.test'), now()),
  ('c7640000-0000-4000-8000-000000000002', 'a7640000-0000-4000-8000-000000000002',
   'b7640000-0000-4000-8000-000000000002', 'alterada',
   'publicada', testes.id_do_usuario('eduardo@filtroville.test'), now()),
  ('c7640000-0000-4000-8000-000000000003', 'a7640000-0000-4000-8000-000000000003',
   'b7640000-0000-4000-8000-000000000003', 'nova', 'detectada', null, null);

-- Avisos: R na LAO de A e na de B; A só no empreendimento de A (sem licença); N na LAO de A.
insert into public.aviso_norma (consultoria_id, mudanca_id, empreendimento_id, instrumento_id, motivo) values
  ('c0000000-0000-4000-8000-00000000000a', 'c7640000-0000-4000-8000-000000000001',
   'e7640000-0000-4000-8000-000000000001', '17640000-0000-4000-8000-000000000001',
   '{"criterio": "atividade", "valor": "24.10.00"}'),
  ('c0000000-0000-4000-8000-00000000000b', 'c7640000-0000-4000-8000-000000000001',
   'e7640000-0000-4000-8000-0000000000b1', '17640000-0000-4000-8000-0000000000b1',
   '{"criterio": "atividade", "valor": "24.10.00"}'),
  ('c0000000-0000-4000-8000-00000000000a', 'c7640000-0000-4000-8000-000000000002',
   'e7640000-0000-4000-8000-000000000001', null, '{"criterio": "municipio", "valor": "4209102"}'),
  ('c0000000-0000-4000-8000-00000000000a', 'c7640000-0000-4000-8000-000000000003',
   'e7640000-0000-4000-8000-000000000001', '17640000-0000-4000-8000-000000000001',
   '{"criterio": "atividade", "valor": "24.10.00"}');

-- ---------------------------------------------------------------- resumo diário
select results_eq(
  $$select tipo, norma_titulo, licenca
    from public.normas_do_resumo_diario('c0000000-0000-4000-8000-00000000000a',
      'd0000000-0000-4000-8000-0000000000a1', current_setting('testes.hoje')::date)
    order by tipo$$,
  $$values ('alterada'::text, 'Portaria 10 · Ruído'::text, null::text),
           ('revogada', 'IN 02 · Efluentes', 'LAO 4821/2023')$$,
  'Gestão recebe as publicadas da consultoria; a não publicada fica de fora'
);
select results_eq(
  $$select tipo from public.normas_do_resumo_diario('c0000000-0000-4000-8000-00000000000a',
      'd0000000-0000-4000-8000-0000000000a3', current_setting('testes.hoje')::date)$$,
  $$values ('revogada'::text)$$,
  'o responsável da condicionante recebe só a da licença dele'
);
select is(
  (select count(*) from public.normas_do_resumo_diario('c0000000-0000-4000-8000-00000000000a',
     'd0000000-0000-4000-8000-0000000000a2', current_setting('testes.hoje')::date)),
  0::bigint,
  'a Equipe sem condicionante na licença não recebe'
);

-- O resumo de hoje já saiu: o de amanhã não repete.
insert into public.aviso_envio (consultoria_id, membro_id, dia, situacao, enviado_em)
values ('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a1',
        current_setting('testes.hoje')::date, 'enviado', now());
select is(
  (select count(*) from public.normas_do_resumo_diario('c0000000-0000-4000-8000-00000000000a',
     'd0000000-0000-4000-8000-0000000000a1', current_setting('testes.hoje')::date + 1)),
  0::bigint,
  'não repete o que saiu no último resumo'
);

-- Vista no Grama sai do resumo.
update public.aviso_norma set visto_em = now(), visto_por = 'd0000000-0000-4000-8000-0000000000a1'
where mudanca_id = 'c7640000-0000-4000-8000-000000000002';
select is(
  (select count(*) from public.normas_do_resumo_diario('c0000000-0000-4000-8000-00000000000a',
     'd0000000-0000-4000-8000-0000000000a3', current_setting('testes.hoje')::date)),
  1::bigint,
  'a vista sai; a não vista fica'
);

select is(
  (select count(*) from public.normas_do_resumo_diario('c0000000-0000-4000-8000-00000000000a',
     'd0000000-0000-4000-8000-0000000000b1', current_setting('testes.hoje')::date)),
  0::bigint,
  'membro de outra consultoria não recebe nada de A'
);

-- ---------------------------------------------------------------- e-mail de revogação
select results_eq(
  $$select consultoria_id, membro_id, afetados from public.revogacoes_para_avisar()
    where mudanca_id = 'c7640000-0000-4000-8000-000000000001' order by consultoria_id, membro_id$$,
  $$values ('c0000000-0000-4000-8000-00000000000a'::uuid, 'd0000000-0000-4000-8000-0000000000a1'::uuid,
            array['Metalúrgica Rio Cubatão · LAO 4821/2023']),
           ('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a3',
            array['Metalúrgica Rio Cubatão · LAO 4821/2023']),
           ('c0000000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-0000000000b1',
            array['Posto Rota Sul · LAO 900/2024'])$$,
  'revogação com licença ativa: Gestão e responsável de A, Gestão de B, cada um com o seu'
);
select is(
  (select count(*) from public.revogacoes_para_avisar() where mudanca_id <> 'c7640000-0000-4000-8000-000000000001'),
  0::bigint,
  'alteração e norma nova não geram e-mail'
);

-- Descadastro do P5 vale para o e-mail de revogação.
insert into public.preferencia_aviso (consultoria_id, membro_id, resumo_diario, origem)
values ('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a3', false, 'link');
select is(
  (select count(*) from public.revogacoes_para_avisar() where membro_id = 'd0000000-0000-4000-8000-0000000000a3'),
  0::bigint,
  'quem se descadastrou não recebe'
);

select set_config('testes.reserva',
  public.reservar_aviso_de_revogacao('c0000000-0000-4000-8000-00000000000a',
    'd0000000-0000-4000-8000-0000000000a1', 'c7640000-0000-4000-8000-000000000001')::text, true);
select ok(current_setting('testes.reserva') <> '', 'a primeira execução reserva');
select is(
  public.reservar_aviso_de_revogacao('c0000000-0000-4000-8000-00000000000a',
    'd0000000-0000-4000-8000-0000000000a1', 'c7640000-0000-4000-8000-000000000001'),
  null,
  'a segunda não reserva (nunca dois e-mails)'
);
select ok(
  public.registrar_aviso_de_revogacao(current_setting('testes.reserva')::uuid, 'enviado', 're_1'),
  'registra o envio'
);
select is(
  (select count(*) from public.revogacoes_para_avisar() where membro_id = 'd0000000-0000-4000-8000-0000000000a1'),
  0::bigint,
  'depois de enviado, sai da fila'
);

-- ---------------------------------------------------------------- acesso
select testes.autenticar_como('eduardo@filtroville.test');
select throws_ok(
  $$select * from public.normas_do_resumo_diario('c0000000-0000-4000-8000-00000000000a',
      'd0000000-0000-4000-8000-0000000000a1', current_date)$$,
  '42501', null,
  'só a service role chama o resumo de normas'
);
select is((select count(*) from public.aviso_revogacao_envio), 1::bigint, 'Eduardo lê o próprio envio');

select testes.autenticar_como('gustavo@verdesul.test');
select is((select count(*) from public.aviso_revogacao_envio), 0::bigint, 'Gestão de B não lê envios de A');

select * from finish();

rollback;
