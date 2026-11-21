-- Vencimento na Visão só a partir da antecedência (decisão do Eduardo, 20/11/2026; ADR-0046): na
-- Visão (listar_prazos e contar_prazos, coerentes entre si) o vencimento vigente só aparece quando
-- faltam até antecedencia_dias dias, e o vencido continua; no Calendário aparece sempre, na
-- validade. Outra consultoria lê zero.
begin;

set local timezone to 'America/Sao_Paulo';

select plan(6);

select testes.criar_dados_sinteticos();
select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

insert into public.empreendimento (id, consultoria_id, nome, criado_por) values
  ('75400000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a', 'Serraria Pirabeiraba',
   'd0000000-0000-4000-8000-0000000000a1');

-- V1 em 30 dias (antecedência 60): aparece. V2 em 100 dias (60): não aparece. V3 vencido há 5 dias:
-- aparece. V4 em 100 dias com antecedência própria de 120: aparece. V5 em 60 dias (60): aparece.
insert into public.vencimento
  (id, consultoria_id, empreendimento_id, tipo_vencimento_id, numero, valido_ate, antecedencia_dias, criado_por)
select x.id, 'c0000000-0000-4000-8000-00000000000a', '75400000-0000-4000-8000-0000000000e1',
       (select t.id from public.tipo_vencimento as t
        where t.consultoria_id = 'c0000000-0000-4000-8000-00000000000a' and t.nome = 'Certidão'),
       x.numero, current_setting('testes.hoje')::date + x.dias, x.antecedencia,
       'd0000000-0000-4000-8000-0000000000a1'
from (values
  ('75400000-0000-4000-8000-000000000001'::uuid, 'V1', 30, 60),
  ('75400000-0000-4000-8000-000000000002'::uuid, 'V2', 100, 60),
  ('75400000-0000-4000-8000-000000000003'::uuid, 'V3', -5, 60),
  ('75400000-0000-4000-8000-000000000004'::uuid, 'V4', 100, 120),
  ('75400000-0000-4000-8000-000000000005'::uuid, 'V5', 60, 60)
) as x (id, numero, dias, antecedencia);

select testes.autenticar_como('eduardo@filtroville.test');

select results_eq(
  $$select id from public.listar_prazos('c0000000-0000-4000-8000-00000000000a',
      p_empreendimento_id => '75400000-0000-4000-8000-0000000000e1', p_limite => 100) order by id$$,
  $$values ('75400000-0000-4000-8000-000000000001'::uuid), ('75400000-0000-4000-8000-000000000003'::uuid),
           ('75400000-0000-4000-8000-000000000004'::uuid), ('75400000-0000-4000-8000-000000000005'::uuid)$$,
  'Visão: dentro da antecedência (inclusive no limite), com antecedência própria e vencido; fora dela não'
);

select results_eq(
  $$select atrasadas, total from public.contar_prazos('c0000000-0000-4000-8000-00000000000a',
      p_empreendimento_id => '75400000-0000-4000-8000-0000000000e1')$$,
  $$values (1::bigint, 4::bigint)$$,
  'contar_prazos conta as mesmas linhas da Visão (o vencido em atrasadas)'
);

select is(
  (select total from public.contar_prazos('c0000000-0000-4000-8000-00000000000a')),
  (select count(*) from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_limite => 100)),
  'listar_prazos e contar_prazos coerentes na consultoria inteira'
);

select results_eq(
  $$select id from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
      current_setting('testes.hoje')::date + 90, current_setting('testes.hoje')::date + 110)
    where tipo_evento = 'vencimento' order by id$$,
  $$values ('75400000-0000-4000-8000-000000000002'::uuid), ('75400000-0000-4000-8000-000000000004'::uuid)$$,
  'Calendário: o vencimento aparece na validade mesmo fora da antecedência (V2)'
);

select testes.autenticar_como('gustavo@verdesul.test');

select is(
  (select count(*) from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_limite => 100)
   where tipo_linha = 'vencimento'),
  0::bigint,
  'outra consultoria não lê os vencimentos na Visão'
);

select is(
  (select count(*) from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
     current_setting('testes.hoje')::date + 90, current_setting('testes.hoje')::date + 110)
   where tipo_evento = 'vencimento'),
  0::bigint,
  'outra consultoria não lê os vencimentos no Calendário'
);

reset role;

select * from finish();

rollback;
