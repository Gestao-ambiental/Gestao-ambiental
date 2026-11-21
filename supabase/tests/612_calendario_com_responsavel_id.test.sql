-- Cores por categoria no calendário: listar_calendario devolve o responsável pelo id (para colorir
-- por pessoa ou área, nunca pelo nome), sem mudar quem vê o quê.
begin;

select plan(4);

select testes.criar_dados_sinteticos();

select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('e0000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
        'Metalúrgica Rio Cubatão', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome)
values ('f0000000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
        'e0000000-0000-4000-8000-0000000000e1', 'Matriz');

-- LAO com duas obrigações: uma da Bruno (a3), outra sem responsável.
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
from (values (1, 2), (2, 5)) as x (n, d);
select public.atribuir_a_todos('10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a3');
select public.definir_responsavel('30000000-0000-4000-8000-000000000002', null);
select public.ativar_plano('10000000-0000-4000-8000-000000000001',
  (select row_version from public.instrumento where id = '10000000-0000-4000-8000-000000000001'),
  gen_random_uuid());

select testes.autenticar_como('ana@filtroville.test');

select results_eq(
  $$select data - current_setting('testes.hoje')::date, responsavel_id, responsavel_nome, sem_responsavel
    from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
      current_setting('testes.hoje')::date, current_setting('testes.hoje')::date + 10)
    where tipo_evento = 'prazo'$$,
  $$values (2, 'd0000000-0000-4000-8000-0000000000a3'::uuid, 'Bruno Tavares', false),
           (5, null::uuid, null::text, true)$$,
  'o calendário traz o responsável pelo id, e nulo quando não há'
);

select is(
  (select count(*) from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
     current_setting('testes.hoje')::date, current_setting('testes.hoje')::date + 10,
     p_responsavel_id => 'd0000000-0000-4000-8000-0000000000a3')),
  1::bigint,
  'o filtro por pessoa continua funcionando'
);

select has_function(
  'public', 'listar_calendario', array['uuid', 'date', 'date', 'uuid', 'uuid', 'boolean'],
  'mesmos argumentos de antes: quem já chamava continua funcionando'
);

-- Isolamento: outra consultoria não vê nada, nem o id do responsável.
select testes.autenticar_como('helena@verdesul.test');

select is(
  (select count(*) from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
     current_setting('testes.hoje')::date, current_setting('testes.hoje')::date + 10)),
  0::bigint,
  'Helena (B) não vê o calendário de A'
);

select * from finish();

rollback;
