-- Planos, limites, teste grátis e só leitura (ADR-0026; decisões do Eduardo de 14/11/2026).
-- A. Dias úteis e paridade com situacaoComercial do domínio (packages/domain/src/planos.ts).
-- B. Teste acabado sem plano: só leitura (lê, não escreve, nem envia arquivo).
-- C. Plano em dia: escreve; Essencial barra orçamento (dados antigos legíveis); teste, beta e
--    conta interna liberam.
-- D. Atraso: escreve no atraso; só leitura depois de 2 dias úteis; pagar libera. Interna nunca
--    bloqueia.
-- E. Limites: convidar e ativar empreendimento além do limite exigem confirmação da Gestão.
-- F. Situação para a faixa: Gestão vê o link; Equipe não; outra consultoria e anônimo nada.
-- G. Central: Financeiro, dias de teste e conta interna (operador com dois fatores, motivo e
--    histórico); quem não é operador nada.
begin;

select plan(86);

select testes.criar_dados_sinteticos();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000041', 'authenticated',
        'authenticated', 'operador41@grama.test', '', now(), '{"provider": "email", "providers": ["email"]}',
        '{"nome": "Operador Financeiro"}', now(), now());
insert into private.operador_plataforma (usuario_id) values ('e1000000-0000-4000-8000-000000000041');

-- Dados da Filtroville (A) criados enquanto ela está no beta (tudo liberado).
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_empreendimento('e0000000-0000-4000-8000-000000004101',
  'c0000000-0000-4000-8000-00000000000a', 'Indústria Horizonte');
select public.criar_orcamento('f0000000-0000-4000-8000-000000004101', 'c0000000-0000-4000-8000-00000000000a',
  'e0000000-0000-4000-8000-000000004101', 'Licença de operação');


-- ---------------------------------------------------------------------------
-- A. Dias úteis e paridade com o domínio
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '', true); -- sem usuário, como a service role
select is(private.pascoa(2027), date '2027-03-28', 'Páscoa de 2027');
select is(private.pascoa(2026), date '2026-04-05', 'Páscoa de 2026');
select ok(private.eh_feriado_nacional(date '2027-03-26'), 'Sexta-feira Santa é feriado');
select ok(private.eh_feriado_nacional(date '2026-11-20'), '20/11 é feriado');
select ok(private.eh_dia_util_nacional(date '2027-02-09'), 'Carnaval conta como dia útil');
select is(private.somar_dias_uteis(date '2027-04-20', 2), date '2027-04-23', 'pula Tiradentes');
select is(private.fim_do_teste(date '2027-02-01', 10), date '2027-02-12', 'teste de 10 dias úteis');
select is(private.equivalente_mensal('escala', 'anual'), 249167, 'MRR do anual = ano / 12, arredondado');
select is(private.valor_do_ciclo('equipe', 'anual'), 1290000, 'anual = 10 mensalidades');

create function pg_temp.sit(hoje date, criada date, interna boolean, plano text, valida date,
                            vencimentos date[], agendado text default null, mudanca date default null)
returns text language sql as $$
  select s.situacao from private.situacao_comercial_calculada(hoje, criada, date '2027-01-31', 10, interna,
    plano, case when plano is null then null else 'mensal' end, agendado, null, mudanca, valida, vencimentos) as s
$$;

select is(pg_temp.sit('2027-01-31', '2026-11-14', false, null, null, '{}'), 'beta', 'paridade: beta até 31/01/2027');
select is(pg_temp.sit('2027-02-12', '2026-11-14', false, null, null, '{}'), 'teste', 'paridade: teste do beta começa em 01/02');
select is(pg_temp.sit('2027-02-13', '2026-11-14', false, null, null, '{}'), 'teste_encerrado', 'paridade: teste do beta acabou');
select is(pg_temp.sit('2027-04-07', '2027-03-24', false, null, null, '{}'), 'teste', 'paridade: criada depois do beta');
select is(pg_temp.sit('2027-04-08', '2027-03-24', false, null, null, '{}'), 'teste_encerrado', 'paridade: teste acabado sem plano');
select is(pg_temp.sit('2028-01-01', '2027-03-24', true, 'equipe', null, '{2027-01-01}'), 'interna', 'paridade: interna nunca bloqueia');
select is(pg_temp.sit('2027-05-07', '2027-03-24', false, 'equipe', null, '{2027-05-07}'), 'ativa', 'paridade: vence hoje, ainda ativa');
select is(pg_temp.sit('2027-05-08', '2027-03-24', false, 'equipe', null, '{2027-05-07}'), 'em_atraso', 'paridade: atraso no dia seguinte');
select is(pg_temp.sit('2027-05-11', '2027-03-24', false, 'equipe', null, '{2027-05-07}'), 'em_atraso', 'paridade: 2 dias úteis de tolerância');
select is(pg_temp.sit('2027-05-12', '2027-03-24', false, 'equipe', null, '{2027-05-07}'), 'bloqueada', 'paridade: só leitura depois');
select is(pg_temp.sit('2027-04-24', '2027-03-24', false, 'equipe', null, '{2027-04-20}'), 'bloqueada', 'paridade: feriado na tolerância');
select is(pg_temp.sit('2027-06-30', '2027-03-24', false, 'equipe', '2027-06-30', '{}'), 'ativa', 'paridade: cancelada vale até o fim do pago');
select is(pg_temp.sit('2027-07-01', '2027-03-24', false, 'equipe', '2027-06-30', '{}'), 'cancelada', 'paridade: depois, cancelada');
select is(
  (select s.orcamentos_liberados from private.situacao_comercial_calculada('2027-06-01', '2027-03-24', '2027-01-31', 10,
     false, 'equipe', 'mensal', 'essencial', null, '2027-06-01', null, '{}') as s),
  false, 'paridade: troca para o Essencial vale no próximo ciclo');

-- ---------------------------------------------------------------------------
-- B. Teste acabado sem plano (beta no passado; Filtroville criada há 60 dias)
-- ---------------------------------------------------------------------------
update private.configuracao_comercial set fim_do_beta = current_date - 400;
update public.consultoria set criada_em = now() - interval '60 days'
where id = 'c0000000-0000-4000-8000-00000000000a';

select is(
  (select s.situacao from private.situacao_comercial_em('c0000000-0000-4000-8000-00000000000a',
     private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')) as s),
  'teste_encerrado', 'Filtroville: teste acabado e sem plano');

select testes.autenticar_como('eduardo@filtroville.test');
select throws_ok(
  $$select public.criar_empreendimento('e0000000-0000-4000-8000-000000004102',
      'c0000000-0000-4000-8000-00000000000a', 'Outro')$$,
  '42501', 'consultoria_somente_leitura',
  'teste acabado sem plano: Gestão não cria empreendimento');
select is((select count(*)::integer from public.empreendimento where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  1, 'teste acabado sem plano: lê os empreendimentos');
select is((select count(*)::integer from public.orcamento where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  1, 'teste acabado sem plano: lê os orçamentos');
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('arquivos', 'c0000000-0000-4000-8000-00000000000a/instrumento/e0000000-0000-4000-8000-000000004199.pdf')$$,
  '42501', null,
  'teste acabado sem plano: não envia arquivo');
select testes.autenticar_como('ana@filtroville.test');
reset role; -- com o usuário da Ana, sem os limites de grant: só a trigger decide
select throws_ok(
  $$update public.membro set papel = 'gestao' where id = 'd0000000-0000-4000-8000-0000000000a2'$$,
  '42501', 'consultoria_somente_leitura',
  'teste acabado sem plano: a escrita da Equipe também é barrada');
select testes.autenticar_como('gustavo@verdesul.test');
select lives_ok(
  $$select public.criar_empreendimento('e0000000-0000-4000-8000-000000004103',
      'c0000000-0000-4000-8000-00000000000b', 'Porto Verde')$$,
  'Verde Sul (criada agora, em teste) escreve normalmente');

-- ---------------------------------------------------------------------------
-- C. Plano em dia, orçamentos e liberações
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '', true); -- sem usuário, como a service role
insert into public.assinatura (id, consultoria_id, plano, ciclo, forma, asaas_cliente_id, asaas_assinatura_id,
                               proximo_vencimento)
values ('a5000000-0000-4000-8000-000000004101', 'c0000000-0000-4000-8000-00000000000a', 'equipe', 'mensal', 'pix',
        'cus_teste_a', 'sub_teste_a', current_date + 20);

select testes.autenticar_como('eduardo@filtroville.test');
select lives_ok(
  $$select public.criar_empreendimento('e0000000-0000-4000-8000-000000004104',
      'c0000000-0000-4000-8000-00000000000a', 'Fábrica Leste')$$,
  'plano Equipe em dia: Gestão escreve de novo');
select lives_ok(
  $$select public.criar_orcamento('f0000000-0000-4000-8000-000000004102', 'c0000000-0000-4000-8000-00000000000a',
      'e0000000-0000-4000-8000-000000004101', 'Monitoramento')$$,
  'plano Equipe: cria orçamento');

reset role;
select set_config('request.jwt.claims', '', true); -- sem usuário, como a service role
update public.assinatura set plano = 'essencial' where consultoria_id = 'c0000000-0000-4000-8000-00000000000a';

select testes.autenticar_como('eduardo@filtroville.test');
select throws_ok(
  $$select public.criar_orcamento('f0000000-0000-4000-8000-000000004103', 'c0000000-0000-4000-8000-00000000000a',
      'e0000000-0000-4000-8000-000000004101', 'Outro')$$,
  '42501', 'orcamentos_fora_do_plano',
  'plano Essencial: criar orçamento falha com erro claro');
reset role; -- com o usuário do Eduardo, sem os limites de grant: só a trigger decide
select throws_ok(
  $$update public.orcamento set objeto = objeto || ' (editado)' where id = 'f0000000-0000-4000-8000-000000004101'$$,
  '42501', 'orcamentos_fora_do_plano',
  'plano Essencial: editar orçamento falha');
select testes.autenticar_como('eduardo@filtroville.test');
select is((select count(*)::integer from public.orcamento where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  2, 'plano Essencial: orçamentos antigos continuam legíveis');
select lives_ok(
  $$select public.criar_empreendimento('e0000000-0000-4000-8000-000000004105',
      'c0000000-0000-4000-8000-00000000000a', 'Mineradora Sul')$$,
  'plano Essencial: o resto continua liberado');

-- Beta e teste liberam orçamentos mesmo no Essencial.
reset role;
select set_config('request.jwt.claims', '', true); -- sem usuário, como a service role
update private.configuracao_comercial set fim_do_beta = current_date + 10;
select testes.autenticar_como('eduardo@filtroville.test');
select lives_ok(
  $$select public.criar_orcamento('f0000000-0000-4000-8000-000000004104', 'c0000000-0000-4000-8000-00000000000a',
      'e0000000-0000-4000-8000-000000004101', 'No beta')$$,
  'beta: orçamento liberado mesmo com o Essencial');
reset role;
select set_config('request.jwt.claims', '', true); -- sem usuário, como a service role
update private.configuracao_comercial set fim_do_beta = current_date - 400;
update public.consultoria set criada_em = now() - interval '1 day' where id = 'c0000000-0000-4000-8000-00000000000a';
select testes.autenticar_como('eduardo@filtroville.test');
select lives_ok(
  $$select public.criar_orcamento('f0000000-0000-4000-8000-000000004105', 'c0000000-0000-4000-8000-00000000000a',
      'e0000000-0000-4000-8000-000000004101', 'No teste')$$,
  'teste: orçamento liberado mesmo com o Essencial');
reset role;
select set_config('request.jwt.claims', '', true); -- sem usuário, como a service role
update public.consultoria set criada_em = now() - interval '60 days' where id = 'c0000000-0000-4000-8000-00000000000a';
insert into public.consultoria_condicao_comercial (consultoria_id, interna) values ('c0000000-0000-4000-8000-00000000000a', true);
select testes.autenticar_como('eduardo@filtroville.test');
select lives_ok(
  $$select public.criar_orcamento('f0000000-0000-4000-8000-000000004106', 'c0000000-0000-4000-8000-00000000000a',
      'e0000000-0000-4000-8000-000000004101', 'Interna')$$,
  'conta interna: orçamento liberado');

-- ---------------------------------------------------------------------------
-- D. Atraso e só leitura
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '', true); -- sem usuário, como a service role
insert into public.cobranca (id, consultoria_id, assinatura_id, tipo, asaas_cobranca_id, valor_centavos, vencimento,
                             situacao, invoice_url)
values ('cb000000-0000-4000-8000-000000004101', 'c0000000-0000-4000-8000-00000000000a',
        'a5000000-0000-4000-8000-000000004101', 'plano', 'pay_teste_1', 99000,
        private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a') - 10, 'vencida',
        'https://sandbox.asaas.com/i/teste1');
select testes.autenticar_como('eduardo@filtroville.test');
select lives_ok(
  $$select public.criar_empreendimento('e0000000-0000-4000-8000-000000004106',
      'c0000000-0000-4000-8000-00000000000a', 'Interna com atraso')$$,
  'conta interna nunca bloqueia, nem com cobrança vencida há 10 dias');

reset role;
select set_config('request.jwt.claims', '', true); -- sem usuário, como a service role
update public.consultoria_condicao_comercial set interna = false where consultoria_id = 'c0000000-0000-4000-8000-00000000000a';
update public.cobranca set vencimento = private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a') - 1
where id = 'cb000000-0000-4000-8000-000000004101';
select testes.autenticar_como('eduardo@filtroville.test');
select is((select s.situacao from public.situacao_comercial('c0000000-0000-4000-8000-00000000000a') as s),
  'em_atraso', 'vencida ontem: em atraso');
select lives_ok(
  $$select public.criar_empreendimento('e0000000-0000-4000-8000-000000004107',
      'c0000000-0000-4000-8000-00000000000a', 'Durante o atraso')$$,
  'em atraso (dentro dos 2 dias úteis): ainda escreve');
select isnt((select s.cobranca_aberta_id from public.situacao_comercial('c0000000-0000-4000-8000-00000000000a') as s),
  null::uuid, 'em atraso: a Gestão vê a cobrança a pagar');
select testes.autenticar_como('ana@filtroville.test');
select is((select s.situacao from public.situacao_comercial('c0000000-0000-4000-8000-00000000000a') as s),
  'em_atraso', 'Equipe vê a situação para a faixa');
select is((select s.cobranca_aberta_id from public.situacao_comercial('c0000000-0000-4000-8000-00000000000a') as s),
  null::uuid, 'Equipe não vê a cobrança a pagar');
select is((select count(*)::integer from public.cobranca), 0, 'Equipe lê zero cobranças direto');

reset role;
select set_config('request.jwt.claims', '', true); -- sem usuário, como a service role
update public.cobranca set vencimento = private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a') - 10
where id = 'cb000000-0000-4000-8000-000000004101';
select testes.autenticar_como('eduardo@filtroville.test');
select is((select s.situacao from public.situacao_comercial('c0000000-0000-4000-8000-00000000000a') as s),
  'bloqueada', 'vencida há 10 dias: só leitura');
select throws_ok(
  $$select public.criar_empreendimento('e0000000-0000-4000-8000-000000004108',
      'c0000000-0000-4000-8000-00000000000a', 'Bloqueada')$$,
  '42501', 'consultoria_somente_leitura',
  'só leitura: Gestão não cria');
select throws_ok(
  $$select public.criar_orcamento('f0000000-0000-4000-8000-000000004107', 'c0000000-0000-4000-8000-00000000000a',
      'e0000000-0000-4000-8000-000000004101', 'Bloqueada')$$,
  '42501', 'consultoria_somente_leitura',
  'só leitura: orçamento recusa como só leitura');
select is((select count(*)::integer from public.empreendimento where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  5, 'só leitura: leitura nunca é barrada');
select lives_ok(
  $$select public.autorizar_acesso_de_suporte('a5000000-0000-4000-8000-000000004199',
      'c0000000-0000-4000-8000-00000000000a', 2, 'Ajuda com o pagamento')$$,
  'só leitura: a Gestão ainda autoriza o suporte (trilha da plataforma)');

reset role;
select set_config('request.jwt.claims', '', true); -- sem usuário, como a service role
update public.cobranca set situacao = 'paga', pago_em = current_date where id = 'cb000000-0000-4000-8000-000000004101';
select testes.autenticar_como('eduardo@filtroville.test');
select lives_ok(
  $$select public.criar_empreendimento('e0000000-0000-4000-8000-000000004108',
      'c0000000-0000-4000-8000-00000000000a', 'Depois de pagar')$$,
  'pagou: volta a escrever');

-- ---------------------------------------------------------------------------
-- E. Limites (Essencial: 3 pessoas; a Filtroville tem 6)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.criar_convite('c0000000-0000-4000-8000-00000000000a', 'nova@filtroville.test', 'equipe')$$,
  'P0001', 'adicional_nao_confirmado',
  'convidar além do limite sem confirmar: recusa');
select testes.autenticar_como('ana@filtroville.test');
select throws_ok(
  $$select * from public.confirmar_adicional('c0000000-0000-4000-8000-00000000000a', 'pessoas')$$,
  '42501', 'sem_permissao',
  'Equipe não confirma adicional');
select testes.autenticar_como('eduardo@filtroville.test');
select results_eq(
  $$select recurso, quantidade, limite, adicionais_centavos from public.confirmar_adicional('c0000000-0000-4000-8000-00000000000a', 'pessoas')$$,
  $$values ('pessoas'::text, 7, 3, 8000)$$,
  'confirmar: 7 pessoas no limite de 3 = 4 adicionais de R$ 20');
select lives_ok(
  $$select public.criar_convite('c0000000-0000-4000-8000-00000000000a', 'nova@filtroville.test', 'equipe')$$,
  'com a confirmação, convida');
select throws_ok(
  $$select public.criar_convite('c0000000-0000-4000-8000-00000000000a', 'outra@filtroville.test', 'equipe')$$,
  'P0001', 'adicional_nao_confirmado',
  'o próximo convite precisa de nova confirmação');
select lives_ok(
  $$select * from public.confirmar_adicional('c0000000-0000-4000-8000-00000000000a', 'pessoas')$$,
  'confirmar de novo é aceito');
select is((select count(*)::integer from public.adicional_confirmado), 2, 'cada confirmação fica registrada');
select lives_ok(
  $$select * from public.confirmar_adicional('c0000000-0000-4000-8000-00000000000a', 'pessoas')$$,
  'repetir a confirmação não duplica');
select is((select count(*)::integer from public.adicional_confirmado), 2, 'idempotente');

reset role;
select set_config('request.jwt.claims', '', true); -- sem usuário, como a service role
update public.assinatura set plano = 'equipe' where consultoria_id = 'c0000000-0000-4000-8000-00000000000a';
select testes.autenticar_como('eduardo@filtroville.test');
select lives_ok(
  $$select public.criar_convite('c0000000-0000-4000-8000-00000000000a', 'outra@filtroville.test', 'equipe')$$,
  'plano Equipe (10 pessoas): convida sem confirmação, quem chama hoje não quebra');

-- Empreendimentos: limite reduzido a 1 só neste teste; ativo = com licença ativa.
reset role;
select set_config('request.jwt.claims', '', true); -- sem usuário, como a service role
update private.plano_catalogo set empreendimentos = 1 where codigo = 'equipe';
insert into public.unidade (id, consultoria_id, empreendimento_id, nome) values
  ('9a000000-0000-4000-8000-000000004101', 'c0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-000000004101', 'Matriz'),
  ('9a000000-0000-4000-8000-000000004104', 'c0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-000000004104', 'Matriz');
insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, tipo_id, marco, emitido_em, validade, criado_por)
select x.id, 'c0000000-0000-4000-8000-00000000000a', x.emp, x.uni, t.id, 'emissao', current_date - 30, current_date + 365,
       'd0000000-0000-4000-8000-0000000000a1'
from (values
  ('1a000000-0000-4000-8000-000000004101'::uuid, 'e0000000-0000-4000-8000-000000004101'::uuid, '9a000000-0000-4000-8000-000000004101'::uuid, 'LAO'),
  ('1a000000-0000-4000-8000-000000004102'::uuid, 'e0000000-0000-4000-8000-000000004101'::uuid, '9a000000-0000-4000-8000-000000004101'::uuid, 'LAP'),
  ('1a000000-0000-4000-8000-000000004104'::uuid, 'e0000000-0000-4000-8000-000000004104'::uuid, '9a000000-0000-4000-8000-000000004104'::uuid, 'LAO')
) as x (id, emp, uni, sigla)
join public.tipo_instrumento as t
  on t.consultoria_id = 'c0000000-0000-4000-8000-00000000000a' and t.sigla = x.sigla;

create function pg_temp.ativar(p_id uuid) returns void language sql as $$
  update public.instrumento set situacao = 'ativo', ativado_em = now(), ativado_por = 'd0000000-0000-4000-8000-0000000000a1',
         chave_ativacao = gen_random_uuid()
  where id = p_id
$$;

select lives_ok($$select pg_temp.ativar('1a000000-0000-4000-8000-000000004101')$$,
  'primeira licença do primeiro empreendimento: cabe no limite');
select lives_ok($$select pg_temp.ativar('1a000000-0000-4000-8000-000000004102')$$,
  'segunda licença do mesmo empreendimento não muda a contagem');
select throws_ok($$select pg_temp.ativar('1a000000-0000-4000-8000-000000004104')$$,
  'P0001', 'adicional_nao_confirmado',
  'ativar outro empreendimento além do limite: exige confirmação');
select testes.autenticar_como('eduardo@filtroville.test');
select results_eq(
  $$select quantidade, limite, adicionais_centavos from public.confirmar_adicional('c0000000-0000-4000-8000-00000000000a', 'empreendimentos')$$,
  $$values (2, 1, 2000)$$,
  'confirmar o 2º empreendimento ativo: R$ 20 por mês');
reset role;
select set_config('request.jwt.claims', '', true); -- sem usuário, como a service role
select lives_ok($$select pg_temp.ativar('1a000000-0000-4000-8000-000000004104')$$,
  'com a confirmação, ativa');
select is(private.empreendimentos_ativos('c0000000-0000-4000-8000-00000000000a'), 2,
  'empreendimentos ativos = com ao menos uma licença ativa');

-- ---------------------------------------------------------------------------
-- F. Negativos de leitura
-- ---------------------------------------------------------------------------
select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select * from public.situacao_comercial('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', 'sem_permissao', 'outra consultoria não lê a situação');
select is((select count(*)::integer from public.assinatura), 0, 'outra consultoria: zero assinaturas');
select is((select count(*)::integer from public.cobranca), 0, 'outra consultoria: zero cobranças');
select is((select count(*)::integer from public.adicional_confirmado), 0, 'outra consultoria: zero confirmações');
select throws_ok(
  $$select * from public.confirmar_adicional('c0000000-0000-4000-8000-00000000000a', 'pessoas')$$,
  '42501', 'sem_permissao', 'outra consultoria não confirma adicional');
select testes.autenticar_como_anonimo();
select throws_ok(
  $$select * from public.situacao_comercial('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', null, 'anônimo nem executa');

-- ---------------------------------------------------------------------------
-- G. Central
-- ---------------------------------------------------------------------------
select testes.autenticar_com_dois_fatores('eduardo@filtroville.test');
select throws_ok($$select * from public.central_resumo_financeiro()$$, '42501', 'sem_permissao',
  'Gestão não vê o Financeiro');
select testes.autenticar_como('operador41@grama.test');
select throws_ok($$select * from public.central_resumo_financeiro()$$, '42501', 'dois_fatores_necessarios',
  'operador sem dois fatores não vê o Financeiro');
select testes.autenticar_com_dois_fatores('operador41@grama.test');
select is((select r.pagantes from public.central_resumo_financeiro() as r), 1, 'Financeiro: um pagante');
select is((select r.mrr_centavos from public.central_resumo_financeiro() as r), 131000::bigint,
  'Financeiro: MRR = Equipe mensal + 1 empreendimento adicional (limite reduzido a 1 neste teste)');
select is((select count(*)::integer from public.central_financeiro_lista('pagantes')), 1, 'lista de pagantes');
select throws_ok(
  $$select public.central_marcar_conta_interna('c0000000-0000-4000-8000-00000000000a', true, '  ', 1)$$,
  '22023', 'motivo_obrigatorio', 'marcar conta interna exige motivo');
select throws_ok(
  $$select public.central_marcar_conta_interna('c0000000-0000-4000-8000-00000000000a', true, 'Conta da Envora', 0)$$,
  'P0001', 'conflito_de_versao', 'confere row_version');
select is(public.central_marcar_conta_interna('c0000000-0000-4000-8000-00000000000a', true, 'Conta de teste do Grama', 1),
  2, 'operador marca conta interna');
select is((select r.internas from public.central_resumo_financeiro() as r), 1, 'Financeiro: uma conta interna');
select is(public.central_ajustar_dias_de_teste('c0000000-0000-4000-8000-00000000000b', 15, 'Pediu mais tempo', 0),
  1, 'operador ajusta os dias de teste');
select is((select p.teste_ate - p.criada_em from public.central_plano_da_consultoria('c0000000-0000-4000-8000-00000000000b') as p) > 15,
  true, 'o teste passa a ter 15 dias úteis');
select is((select count(*)::integer from public.central_historico_comercial('c0000000-0000-4000-8000-00000000000a')),
  1, 'histórico da central: a marcação com motivo');

select * from finish();

rollback;
