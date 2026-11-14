-- Planos e parâmetros comerciais pela central (ADR-0026): qualquer autenticado lê o catálogo; só o
-- operador com dois fatores muda, com motivo, e o histórico registra (append-only). A troca de
-- preço vale para as próximas cobranças: a cobrança já criada não muda.
begin;

select plan(17);

select testes.criar_dados_sinteticos();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000044', 'authenticated',
        'authenticated', 'operador44@grama.test', '', now(), '{"provider": "email", "providers": ["email"]}',
        '{"nome": "Operador Parâmetros"}', now(), now());
insert into private.operador_plataforma (usuario_id) values ('e1000000-0000-4000-8000-000000000044');

-- Beta no passado e a Filtroville criada há 60 dias: a Gestão assina o Equipe (R$ 1.290).
update private.configuracao_comercial set fim_do_beta = current_date - 400;
update public.consultoria set criada_em = now() - interval '60 days' where id = 'c0000000-0000-4000-8000-00000000000a';

-- Leitura do catálogo
select testes.autenticar_como_anonimo();
select throws_ok($$select * from public.catalogo_comercial()$$, '42501', null, 'anônimo não lê o catálogo');
select testes.autenticar_como('ana@filtroville.test');
select is((select count(*)::integer from public.catalogo_comercial()), 3, 'qualquer autenticado lê os 3 planos');
select is((select c.adicional_mensal_centavos from public.catalogo_comercial() as c where c.codigo = 'equipe'),
  2000, 'o catálogo traz a configuração (adicional)');

select testes.autenticar_como('eduardo@filtroville.test');
select public.assinar_plano_simulado('c0000000-0000-4000-8000-00000000000a', 'equipe', 'mensal', 'pix');

-- Quem não pode, não muda
select testes.autenticar_como('operador44@grama.test');
select throws_ok(
  $$select public.central_atualizar_plano('equipe', 'Equipe', 139000, 10, 30, true, true, 'Reajuste')$$,
  '42501', 'dois_fatores_necessarios', 'operador sem dois fatores não muda o plano');
select testes.autenticar_com_dois_fatores('eduardo@filtroville.test');
select throws_ok(
  $$select public.central_atualizar_plano('equipe', 'Equipe', 139000, 10, 30, true, true, 'Reajuste')$$,
  '42501', 'sem_permissao', 'Gestão não muda o plano');
select throws_ok(
  $$select public.central_atualizar_configuracao_comercial(current_date, 10, 2000, 10, 2, 'Reajuste')$$,
  '42501', 'sem_permissao', 'Gestão não muda a configuração');
select throws_ok($$select * from public.central_historico_parametros()$$, '42501', 'sem_permissao',
  'Gestão não lê o histórico de parâmetros');
select testes.autenticar_como_anonimo();
select throws_ok(
  $$select public.central_atualizar_plano('equipe', 'Equipe', 139000, 10, 30, true, true, 'Reajuste')$$,
  '42501', null, 'anônimo nem executa');

-- Operador com dois fatores
select testes.autenticar_com_dois_fatores('operador44@grama.test');
select throws_ok(
  $$select public.central_atualizar_plano('equipe', 'Equipe', 139000, 10, 30, true, true, '   ')$$,
  '22023', 'motivo_obrigatorio', 'sem motivo: recusa');
select throws_ok(
  $$select public.central_atualizar_plano('equipe', 'Equipe', 0, 10, 30, true, true, 'Reajuste')$$,
  '22023', 'valores_invalidos', 'mensalidade zero: recusa pelo check');
select lives_ok(
  $$select public.central_atualizar_plano('equipe', 'Equipe', 139000, 10, 30, true, true, 'Reajuste de 2027')$$,
  'operador com dois fatores muda o preço do Equipe');
select lives_ok(
  $$select public.central_atualizar_plano('equipe', 'Equipe', 139000, 10, 30, true, true, 'De novo')$$,
  'repetir os mesmos valores não grava nada');
select results_eq(
  $$select h.alvo, h.antes ->> 'mensal_centavos', h.depois ->> 'mensal_centavos', h.motivo, h.alterada_por_nome
    from public.central_historico_parametros() as h$$,
  $$values ('plano:equipe', '129000', '139000', 'Reajuste de 2027', 'Operador Parâmetros')$$,
  'o histórico registra antes, depois, motivo e quem (uma linha só)');
select throws_ok(
  $$select public.central_atualizar_configuracao_comercial(current_date, 10, 2000, 13, 2, 'Anual maior')$$,
  '22023', 'valores_invalidos', 'anual de 13 mensalidades: recusa pelo check');

-- Vale para as próximas cobranças
select testes.autenticar_como('eduardo@filtroville.test');
select is((select c.mensal_centavos from public.catalogo_comercial() as c where c.codigo = 'equipe'), 139000,
  'o catálogo mostra o preço novo');
select is((select cb.valor_centavos from public.cobranca as cb
           where cb.consultoria_id = 'c0000000-0000-4000-8000-00000000000a' and cb.tipo = 'plano'), 129000,
  'a cobrança já criada não muda de valor');

-- Append-only até para o dono
reset role;
select throws_ok($$delete from private.parametro_comercial_historico$$, '42501', null,
  'o histórico de parâmetros não aceita delete');

select * from finish();

rollback;
