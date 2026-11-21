-- P8 · Painel do dono (ADR-0054): clientes em risco, carga das próximas 2 semanas e dinheiro por
-- cliente. Só a Gestão lê (a Equipe recebe sem_permissao); outra consultoria não vê nada de A.
begin;

set local timezone to 'America/Sao_Paulo';

select plan(10);

select testes.criar_dados_sinteticos();

select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('e7400000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a',
        'Metalúrgica Rio Cubatão', 'd0000000-0000-4000-8000-0000000000a1'),
       ('e7400000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-00000000000a',
        'Padaria Tranquila', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome)
values ('f7400000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a',
        'e7400000-0000-4000-8000-000000000001', 'Matriz');

-- LAO emitida há 30 dias, vence em 100 dias: o limite de protocolo (120 dias antes) já passou.
-- Uma entrega da Ana atrasada há 3 dias e outra do Bruno daqui a 5 dias.
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_instrumento('17400000-0000-4000-8000-000000000001', 'f7400000-0000-4000-8000-000000000001');
select public.salvar_identificacao('17400000-0000-4000-8000-000000000001', 1, 'f7400000-0000-4000-8000-000000000001',
  (select id from public.tipo_instrumento where sigla = 'LAO' and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  '4821/2023', 'IMA', null, current_setting('testes.hoje')::date - 30, null, null, 'assinatura',
  current_setting('testes.hoje')::date + 100);
select public.salvar_condicionante(('37400000-0000-4000-8000-00000000000' || n::text)::uuid, '17400000-0000-4000-8000-000000000001',
  null, '1.' || n::text, 'Entrega ' || n::text, '', 'obrigacao')
from generate_series(1, 2) as n;
select public.confirmar_prazo(('37400000-0000-4000-8000-00000000000' || n::text)::uuid, 'unica', null, null, 'corridos',
  null, current_setting('testes.hoje')::date + d, 'Documento')
from (values (1, 5), (2, 5)) as x (n, d);
select public.atribuir_a_todos('17400000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a3');
select public.ativar_plano('17400000-0000-4000-8000-000000000001',
  (select row_version from public.instrumento where id = '17400000-0000-4000-8000-000000000001'),
  gen_random_uuid());

-- A entrega 1 passa para a Ana e fica atrasada (prazo há 3 dias).
reset role;
update public.ocorrencia as o
set responsavel_id = 'd0000000-0000-4000-8000-0000000000a2',
    prazo_oficial_atual = current_setting('testes.hoje')::date - 3
where o.condicionante_versao_id in (
  select v.id from public.condicionante_versao as v
  where v.condicionante_id = '37400000-0000-4000-8000-000000000001');

select testes.autenticar_como('eduardo@filtroville.test');

select results_eq(
  $$select nome, prazos_atrasados, lao_alem_do_limite, lao_perto_do_limite
    from public.painel_clientes_em_risco('c0000000-0000-4000-8000-00000000000a')$$,
  $$values ('Metalúrgica Rio Cubatão'::text, 1, 1, 0)$$,
  'em risco: só o empreendimento com atraso e LAO além do limite; o tranquilo fica de fora'
);

select results_eq(
  $$select nome, prazos, atrasados from public.painel_carga('c0000000-0000-4000-8000-00000000000a')
    where nome in ('Ana Ribeiro', 'Bruno Tavares') order by nome$$,
  $$values ('Ana Ribeiro'::text, 0, 1), ('Bruno Tavares'::text, 1, 0)$$,
  'carga: Ana com um atrasado, Bruno com um nas próximas 2 semanas'
);

select ok(
  (select count(*) from public.painel_carga('c0000000-0000-4000-8000-00000000000a')) >= 6,
  'carga lista as pessoas ativas mesmo sem prazo'
);

select is(
  (select count(*) from public.painel_dinheiro_por_cliente('c0000000-0000-4000-8000-00000000000a')),
  0::bigint,
  'sem orçamento aprovado, nenhum dinheiro por cliente'
);

-- Gestão sem a permissão financeira: risco e carga sim, dinheiro não.
reset role;
update public.membro set papel = 'gestao', financeiro = false
where id = 'd0000000-0000-4000-8000-0000000000a6';

select testes.autenticar_como('fernanda@filtroville.test');
select lives_ok(
  $$select * from public.painel_clientes_em_risco('c0000000-0000-4000-8000-00000000000a')$$,
  'Gestão sem permissão financeira vê o risco'
);
select throws_ok(
  $$select * from public.painel_dinheiro_por_cliente('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', 'sem_permissao',
  'Gestão sem permissão financeira não vê dinheiro por cliente'
);

-- A Equipe não lê o painel.
select testes.autenticar_como('ana@filtroville.test');
select throws_ok(
  $$select * from public.painel_clientes_em_risco('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', 'sem_permissao',
  'Equipe recebe sem_permissao no risco'
);
select throws_ok(
  $$select * from public.painel_carga('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', 'sem_permissao',
  'Equipe recebe sem_permissao na carga'
);

-- Outra consultoria: a Gestão de B não lê o painel de A.
select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select * from public.painel_clientes_em_risco('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', 'sem_permissao',
  'Gestão de B recebe sem_permissao no painel de A'
);
select is(
  (select count(*) from public.painel_clientes_em_risco('c0000000-0000-4000-8000-00000000000b')),
  0::bigint,
  'o painel de B não traz nada de A'
);

select * from finish();

rollback;
