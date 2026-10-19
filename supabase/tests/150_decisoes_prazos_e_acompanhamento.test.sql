-- Decisões de 19/10/2026: validade e limite de protocolo contam nos contadores da Visão; depois
-- do protocolo o limite sai da Visão e do calendário; o limite usa os dias do plano; intervalo de
-- acompanhamento do órgão a partir de 1 dia, só pela Gestão e só depois do protocolo.
begin;

select plan(17);

select testes.criar_dados_sinteticos();
select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('e0000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
        'Metalúrgica Rio Cubatão', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome)
values ('f0000000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
        'e0000000-0000-4000-8000-0000000000e1', 'Matriz');

-- LAO vencendo em 5 dias (limite há 115 dias) e AuA vencendo hoje.
insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, tipo_id, numero, situacao,
                                assinado_em, marco, validade, criado_por, ativado_em, ativado_por, chave_ativacao)
select x.id, 'c0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-0000000000e1',
       'f0000000-0000-4000-8000-0000000000f1',
       (select t.id from public.tipo_instrumento as t
        where t.sigla = x.sigla and t.consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
       x.numero, 'ativo', current_setting('testes.hoje')::date - 1000, 'assinatura',
       current_setting('testes.hoje')::date + x.dias, 'd0000000-0000-4000-8000-0000000000a1',
       now(), 'd0000000-0000-4000-8000-0000000000a1', gen_random_uuid()
from (values
  ('10000000-0000-4000-8000-000000000001'::uuid, 'LAO', '4821/2023', 5),
  ('10000000-0000-4000-8000-000000000002'::uuid, 'AuA', '77/2024', 0)
) as x (id, sigla, numero, dias);

select set_config('testes.p1',
  (select id::text from public.plano_renovacao where instrumento_id = '10000000-0000-4000-8000-000000000001'), true);
insert into storage.objects (bucket_id, name, metadata) values
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/protocolo/80000001-0000-4000-8000-000000000000.pdf',
   '{"mimetype": "application/pdf", "size": 4096}');

-- ---------------------------------------------------------------------------
-- Contadores com validade e limite
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select results_eq(
  $$select atrasadas, hoje, proximos_7, sem_responsavel, total
    from public.contar_prazos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values (1::bigint, 1::bigint, 1::bigint, 0::bigint, 3::bigint)$$,
  'limite vencido conta em Atrasadas, validade de hoje em Hoje, validade em 5 dias em Próximos 7; sem responsável não'
);

select results_eq(
  $$select tipo_linha, dias from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_faixa => 'atrasadas')$$,
  $$values ('limite_protocolo', -115)$$,
  'o contador Atrasadas filtra a tabela e traz o limite de protocolo'
);

select results_eq(
  $$select tipo_linha from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_faixa => 'hoje')$$,
  $$values ('validade')$$,
  'o contador Hoje traz a validade que vence hoje'
);

select is(
  (select count(*) from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_faixa => 'sem_responsavel')),
  0::bigint,
  'validade e limite não entram em "Sem responsável"'
);

-- O limite usa os dias gravados no plano (snapshot), não um 120 fixo.
reset role;
update public.plano_renovacao set dias_limite_protocolo = 150 where id = current_setting('testes.p1')::uuid;
select testes.autenticar_como('ana@filtroville.test');

select results_eq(
  $$select dias from public.listar_prazos('c0000000-0000-4000-8000-00000000000a') where tipo_linha = 'limite_protocolo'$$,
  $$values (-145)$$,
  'o limite segue os dias do plano'
);

reset role;
update public.plano_renovacao set dias_limite_protocolo = 120 where id = current_setting('testes.p1')::uuid;

-- ---------------------------------------------------------------------------
-- Acompanhamento só depois do protocolo
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.definir_acompanhamento(current_setting('testes.p1')::uuid, 7, 1)$$,
  'P0001', 'plano_nao_protocolado',
  'antes do protocolo não há acompanhamento'
);

select is(
  public.registrar_protocolo(current_setting('testes.p1')::uuid, 'IMA 2026/1',
    current_setting('testes.hoje')::date - 1, '80000001-0000-4000-8000-000000000000',
    'c0000000-0000-4000-8000-00000000000a/protocolo/80000001-0000-4000-8000-000000000000.pdf',
    'comprovante.pdf', repeat('a', 64), 1),
  2,
  'Gestão registra o protocolo'
);

select testes.autenticar_como('ana@filtroville.test');

select results_eq(
  $$select atrasadas, total from public.contar_prazos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values (0::bigint, 2::bigint)$$,
  'depois do protocolo o limite deixa de contar como atrasado'
);

select is(
  (select count(*) from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
     current_setting('testes.hoje')::date - 130, current_setting('testes.hoje')::date - 100)
   where tipo_evento = 'limite_protocolo'),
  0::bigint,
  'e sai do calendário'
);

select ok(
  (select exists (
     select 1 from jsonb_array_elements(e.licencas) as l
     where l ->> 'sigla' = 'LAO' and l ->> 'protocolado_em' is not null and (l ->> 'dias_limite')::integer = 120
   ) from public.listar_empreendimentos('c0000000-0000-4000-8000-00000000000a') as e),
  'a carteira de empreendimentos sabe do protocolo e dos dias do plano'
);

select throws_ok(
  $$select public.definir_acompanhamento(current_setting('testes.p1')::uuid, 7, 2)$$,
  '42501', 'sem_permissao',
  'Equipe não define o intervalo'
);

select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.definir_acompanhamento(current_setting('testes.p1')::uuid, 0, 2)$$,
  '22023', 'intervalo_invalido',
  'intervalo de 0 dia é recusado'
);

select is(
  public.definir_acompanhamento(current_setting('testes.p1')::uuid, 1, 2),
  3,
  'diário (1 dia) é aceito'
);

select is(
  public.definir_acompanhamento(current_setting('testes.p1')::uuid, 15, 3),
  4,
  'Gestão troca para quinzenal'
);

select results_eq(
  $$select acompanhamento_dias, protocolo_numero from public.obter_plano_renovacao('10000000-0000-4000-8000-000000000001')$$,
  $$values (15, 'IMA 2026/1')$$,
  'o plano traz o intervalo'
);

select results_eq(
  $$select acompanhamento_dias from public.listar_renovacoes('c0000000-0000-4000-8000-00000000000a')$$,
  $$values (15)$$,
  'o radar traz o intervalo'
);

select testes.autenticar_como('gustavo@verdesul.test');

select throws_ok(
  $$select public.definir_acompanhamento(current_setting('testes.p1')::uuid, 7, 4)$$,
  '42501', 'sem_permissao',
  'Gestão de B não define intervalo em plano de A'
);

select * from finish();
rollback;
