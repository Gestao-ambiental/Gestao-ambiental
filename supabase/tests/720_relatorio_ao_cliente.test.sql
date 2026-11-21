-- P6 · Relatório mensal ao cliente (ADR-0052): só a Gestão gera; traz licenças e validades,
-- entregas do mês sem nome de quem fez, e os próximos 90 dias. Outra consultoria e a Equipe não leem.
begin;

select plan(9);

select testes.criar_dados_sinteticos();

select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);
select set_config('testes.mes', date_trunc('month', current_setting('testes.hoje')::date)::date::text, true);

insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('e0000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
        'Metalúrgica Rio Cubatão', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome)
values ('f0000000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
        'e0000000-0000-4000-8000-0000000000e1', 'Matriz');

-- LAO ativa com duas entregas: a 1 vence em 5 dias, a 2 em 20 dias.
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_instrumento('10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-0000000000f1');
select public.salvar_identificacao('10000000-0000-4000-8000-000000000001', 1, 'f0000000-0000-4000-8000-0000000000f1',
  (select id from public.tipo_instrumento where sigla = 'LAO' and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  '4821/2023', 'IMA', null, current_setting('testes.hoje')::date - 30, null, null, 'assinatura',
  current_setting('testes.hoje')::date + 400);
select public.salvar_condicionante(('30000000-0000-4000-8000-00000000000' || n::text)::uuid, '10000000-0000-4000-8000-000000000001',
  null, '1.' || n::text, 'Entrega ' || n::text, '', 'obrigacao')
from generate_series(1, 2) as n;
select public.confirmar_prazo(('30000000-0000-4000-8000-00000000000' || n::text)::uuid, 'unica', null, null, 'corridos',
  null, current_setting('testes.hoje')::date + d, 'Documento')
from (values (1, 5), (2, 20)) as x (n, d);
select public.atribuir_a_todos('10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a3');
select public.ativar_plano('10000000-0000-4000-8000-000000000001',
  (select row_version from public.instrumento where id = '10000000-0000-4000-8000-000000000001'),
  gen_random_uuid());

-- A entrega 1 foi concluída hoje (pelo Bruno).
reset role;
update public.ocorrencia as o
set situacao = 'concluida', concluida_em = now(), concluida_por = 'd0000000-0000-4000-8000-0000000000a3'
where o.condicionante_versao_id in (
  select v.id from public.condicionante_versao as v
  where v.condicionante_id = '30000000-0000-4000-8000-000000000001');

select testes.autenticar_como('eduardo@filtroville.test');

select is(
  (select jsonb_array_length(public.dados_para_relatorio_mensal('e0000000-0000-4000-8000-0000000000e1',
     current_setting('testes.mes')::date) -> 'licencas')),
  1,
  'Gestão: a LAO ativa entra em licenças e validades'
);

select is(
  (public.dados_para_relatorio_mensal('e0000000-0000-4000-8000-0000000000e1',
     current_setting('testes.mes')::date) -> 'licencas' -> 0 ->> 'titulo'),
  'LAO 4821/2023',
  'licença com sigla e número'
);

select is(
  (select array_agg(e ->> 'codigo')
   from jsonb_array_elements(public.dados_para_relatorio_mensal('e0000000-0000-4000-8000-0000000000e1',
     current_setting('testes.mes')::date) -> 'entregas') as e),
  array['1.1'],
  'entregas do mês: só a concluída'
);

select ok(
  (public.dados_para_relatorio_mensal('e0000000-0000-4000-8000-0000000000e1',
     current_setting('testes.mes')::date)::text) !~ 'Bruno',
  'nenhum nome da equipe vai para o cliente'
);

select is(
  (select jsonb_array_length(public.dados_para_relatorio_mensal('e0000000-0000-4000-8000-0000000000e1',
     (current_setting('testes.mes')::date - interval '1 month')::date) -> 'entregas')),
  0,
  'mês anterior: nenhuma entrega'
);

select ok(
  (select bool_or(p ->> 'codigo' = '1.2')
   from jsonb_array_elements(public.dados_para_relatorio_mensal('e0000000-0000-4000-8000-0000000000e1',
     current_setting('testes.mes')::date) -> 'proximos') as p),
  'próximos 90 dias traz a entrega aberta'
);

-- A Equipe não gera o relatório ao cliente.
select testes.autenticar_como('ana@filtroville.test');
select throws_ok(
  $$select public.dados_para_relatorio_mensal('e0000000-0000-4000-8000-0000000000e1', current_date)$$,
  '42501', 'sem_permissao',
  'Equipe recebe sem_permissao'
);

-- Outra consultoria: nem a Gestão de B lê o empreendimento de A.
select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select public.dados_para_relatorio_mensal('e0000000-0000-4000-8000-0000000000e1', current_date)$$,
  '42501', 'sem_permissao',
  'Gestão de outra consultoria recebe sem_permissao'
);

select has_function(
  'private', 'relatorio_exigencias_do_mes', array['uuid', 'uuid', 'date', 'date'],
  'fonte das respostas a exigências existe para o P3 redefinir'
);

select * from finish();

rollback;
