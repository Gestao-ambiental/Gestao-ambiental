-- Responsável e mês de cada serviço, e carga da equipe (12/11/2026): a equipe da base é feita de
-- membros com login; a hora de custo de cada um é custo do mês ÷ horas no mês; o custo do serviço
-- usa a hora do responsável; carga_da_equipe soma as horas por membro e mês em orçamentos
-- aprovados; responsável de outra consultoria é recusado; só a Gestão da consultoria lê a carga.
begin;

select plan(12);

select testes.criar_dados_sinteticos();

select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_empreendimento('e0000000-0000-4000-8000-0000000000e1',
  'c0000000-0000-4000-8000-00000000000a', 'Indústria Horizonte');

select lives_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      1, 25000, 1, 3000, 0, 0, 0, 0, 0, $json$[
      {"id": "40000000-0000-4000-8000-0000000000e1", "membro_id": "d0000000-0000-4000-8000-0000000000a1",
       "socio": true, "tipo_recebimento": "pro_labore", "custo_mensal_centavos": 1375177,
       "profissao": "Eng. ambiental", "horas_disponiveis_mes": 173},
      {"id": "40000000-0000-4000-8000-0000000000e2", "membro_id": "d0000000-0000-4000-8000-0000000000a2",
       "profissao": "Biólogo", "custo_mensal_centavos": 500000, "horas_disponiveis_mes": 87}
    ]$json$::jsonb, '[]'::jsonb, 0, 0, $json$[
      {"id": "h-civil", "profissao": "Eng. civil", "atividade": "Júnior", "valor_centavos": 25000}
    ]$json$::jsonb, 7949)$sql$,
  'Gestão salva a equipe com membros'
);

select results_eq(
  $$select custo_hora_membro from public.orcamento_base_custos
    where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'$$,
  $$values ('[{"membro_id": "d0000000-0000-4000-8000-0000000000a1", "hora_centavos": 7949},
             {"membro_id": "d0000000-0000-4000-8000-0000000000a2", "hora_centavos": 5747}]'::jsonb)$$,
  'hora de custo de cada membro: piso 79,49; 5.000 ÷ 87 h = 57,47'
);

select lives_ok(
  $$select public.criar_orcamento('f0000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
      'e0000000-0000-4000-8000-0000000000e1', 'Muro de contenção')$$,
  'cria o orçamento'
);

select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000e1', 1, $json${
    "objeto": "Muro de contenção", "forma_preco": "margem", "margem_pb": 2000,
    "itens": [
      {"id": "10000000-0000-4000-8000-0000000000e1", "descricao": "Inventário", "minutos": 60,
       "hora_venda_id": "h-civil", "responsavel_id": "d0000000-0000-4000-8000-0000000000a2",
       "mes_previsto": "2099-12-01"},
      {"id": "10000000-0000-4000-8000-0000000000e2", "descricao": "Projeto", "minutos": 60,
       "hora_venda_id": "h-civil"}
    ]
  }$json$::jsonb),
  2,
  'salva serviços com e sem responsável'
);

-- Rateio 250 ÷ 260 h = 0,96. Custos: 1h × (57,47 + 0,96) = 58,43 (responsável); sem responsável,
-- Eng. civil sem ninguém na equipe: média 18.751,77 ÷ 260 h = 72,12 → 1h × (72,12 + 0,96) = 73,08.
-- Cada serviço usa a hora de venda de 250,00 mais o rateio e 20%.
select results_eq(
  $$select array_agg(preco_centavos order by ordem) from public.orcamento_item
    where orcamento_id = 'f0000000-0000-4000-8000-0000000000e1'$$,
  $$values (array[30115, 30115]::bigint[])$$,
  'o custo do serviço usa a hora do responsável; sem responsável, a profissão ou a média'
);

select results_eq(
  $$select j -> 'itens' -> 0 ->> 'responsavel_id', j -> 'itens' -> 0 ->> 'mes_previsto',
           j -> 'itens' -> 1 ->> 'responsavel_id', jsonb_array_length(j -> 'base' -> 'custo_hora_membro')
    from public.obter_orcamento('f0000000-0000-4000-8000-0000000000e1') as j$$,
  $$values ('d0000000-0000-4000-8000-0000000000a2', '2099-12-01', null::text, 2)$$,
  'o detalhe traz responsável, mês e a hora de cada membro copiada da base'
);

select throws_ok(
  $sql$select public.salvar_orcamento('f0000000-0000-4000-8000-0000000000e1', 2, $json${
    "objeto": "Muro de contenção",
    "itens": [{"id": "10000000-0000-4000-8000-0000000000e1", "descricao": "Inventário", "minutos": 60,
               "responsavel_id": "d0000000-0000-4000-8000-0000000000b2"}]
  }$json$::jsonb)$sql$,
  '22023', 'responsavel_invalido',
  'membro de outra consultoria não pode ser responsável'
);

select throws_ok(
  $sql$select public.salvar_orcamento('f0000000-0000-4000-8000-0000000000e1', 2, $json${
    "objeto": "Muro de contenção",
    "itens": [{"id": "10000000-0000-4000-8000-0000000000e1", "descricao": "Inventário", "minutos": 60,
               "mes_previsto": "2099-12-15"}]
  }$json$::jsonb)$sql$,
  '22023', 'item_invalido',
  'o mês previsto é sempre o primeiro dia do mês'
);

-- ---------------------------------------------------------------------------
-- Carga da equipe
-- ---------------------------------------------------------------------------
select results_eq(
  $$select jsonb_array_length(j -> 'jornada'), j -> 'jornada' -> 1 ->> 'horas_mes', j -> 'comprometido'
    from public.carga_da_equipe('c0000000-0000-4000-8000-00000000000a') as j$$,
  $$values (2, '87', '[]'::jsonb)$$,
  'rascunho não compromete horas; a jornada vem da equipe'
);

reset role;
update public.orcamento set situacao = 'aprovada' where id = 'f0000000-0000-4000-8000-0000000000e1';
select testes.autenticar_como('eduardo@filtroville.test');

select results_eq(
  $$select j -> 'comprometido' from public.carga_da_equipe('c0000000-0000-4000-8000-00000000000a') as j$$,
  $$values ('[{"membro_id": "d0000000-0000-4000-8000-0000000000a2", "mes": "2099-12-01", "minutos": 60}]'::jsonb)$$,
  'orçamento aprovado compromete as horas do responsável no mês'
);

select testes.autenticar_como('ana@filtroville.test');
select throws_ok(
  $$select public.carga_da_equipe('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', 'sem_permissao',
  'Equipe (Ana) não lê a carga'
);

select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select public.carga_da_equipe('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', 'sem_permissao',
  'Gestão de outra consultoria não lê a carga'
);

select * from finish();

rollback;
