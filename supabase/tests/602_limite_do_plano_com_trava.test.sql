-- Limite do plano sem corrida (ADR-0026, atualização de 19/11/2026): as duas triggers de limite
-- travam a linha da consultoria antes de contar e continuam exigindo a confirmação do adicional.
-- A corrida em si (duas sessões) não cabe num teste pgTAP de uma sessão; aqui ficam a trava na
-- definição das funções e a regra de sempre.
begin;

select plan(7);

select testes.criar_dados_sinteticos();

select ok(
  pg_get_functiondef('private.conferir_limite_do_convite()'::regprocedure)
    ~* 'from public\.consultoria as c where c\.id = new\.consultoria_id for update',
  'o limite do convite trava a consultoria antes de contar');
select ok(
  pg_get_functiondef('private.conferir_limite_do_empreendimento()'::regprocedure)
    ~* 'from public\.consultoria as c where c\.id = new\.consultoria_id for update',
  'o limite do empreendimento trava a consultoria antes de contar');

-- Teste acabado; a Gestão assina o Essencial (3 pessoas; a Filtroville tem 6). Empreendimentos
-- ativos: limite reduzido a 1 só neste teste.
update private.configuracao_comercial set fim_do_beta = current_date - 400;
update public.consultoria set criada_em = now() - interval '60 days' where id = 'c0000000-0000-4000-8000-00000000000a';
update private.plano_catalogo set empreendimentos = 1 where codigo = 'essencial';
select testes.autenticar_como('eduardo@filtroville.test');
select * from public.assinar_plano_simulado('c0000000-0000-4000-8000-00000000000a', 'essencial', 'mensal', 'pix');

select throws_ok(
  $$select public.criar_convite('c0000000-0000-4000-8000-00000000000a', 'nova602@filtroville.test', 'equipe')$$,
  'P0001', 'adicional_nao_confirmado',
  'convidar além do limite sem confirmar: recusa');
select * from public.confirmar_adicional('c0000000-0000-4000-8000-00000000000a', 'pessoas');
select lives_ok(
  $$select public.criar_convite('c0000000-0000-4000-8000-00000000000a', 'nova602@filtroville.test', 'equipe')$$,
  'com a confirmação, convida');
select throws_ok(
  $$select public.criar_convite('c0000000-0000-4000-8000-00000000000a', 'outra602@filtroville.test', 'equipe')$$,
  'P0001', 'adicional_nao_confirmado',
  'o convite seguinte conta o anterior e pede nova confirmação');

select public.criar_empreendimento('e0000000-0000-4000-8000-000000006021',
  'c0000000-0000-4000-8000-00000000000a', 'Primeiro');
select public.criar_empreendimento('e0000000-0000-4000-8000-000000006022',
  'c0000000-0000-4000-8000-00000000000a', 'Segundo');

reset role;
select set_config('request.jwt.claims', '', true); -- sem usuário, como a service role
insert into public.unidade (id, consultoria_id, empreendimento_id, nome) values
  ('9a000000-0000-4000-8000-000000006021', 'c0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-000000006021', 'Matriz'),
  ('9a000000-0000-4000-8000-000000006022', 'c0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-000000006022', 'Matriz');
insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, tipo_id, marco, emitido_em, validade, criado_por)
select x.id, 'c0000000-0000-4000-8000-00000000000a', x.emp, x.uni, t.id, 'emissao', current_date - 30, current_date + 365,
       'd0000000-0000-4000-8000-0000000000a1'
from (values
  ('1a000000-0000-4000-8000-000000006021'::uuid, 'e0000000-0000-4000-8000-000000006021'::uuid, '9a000000-0000-4000-8000-000000006021'::uuid),
  ('1a000000-0000-4000-8000-000000006022'::uuid, 'e0000000-0000-4000-8000-000000006022'::uuid, '9a000000-0000-4000-8000-000000006022'::uuid)
) as x (id, emp, uni)
join public.tipo_instrumento as t
  on t.consultoria_id = 'c0000000-0000-4000-8000-00000000000a' and t.sigla = 'LAO';

create function pg_temp.ativar(p_id uuid) returns void language sql as $$
  update public.instrumento set situacao = 'ativo', ativado_em = now(), ativado_por = 'd0000000-0000-4000-8000-0000000000a1',
         chave_ativacao = gen_random_uuid()
  where id = p_id
$$;

select lives_ok($$select pg_temp.ativar('1a000000-0000-4000-8000-000000006021')$$,
  'primeiro empreendimento ativo: cabe no limite');
select throws_ok($$select pg_temp.ativar('1a000000-0000-4000-8000-000000006022')$$,
  'P0001', 'adicional_nao_confirmado',
  'segundo empreendimento ativo além do limite: exige confirmação');

select * from finish();

rollback;
