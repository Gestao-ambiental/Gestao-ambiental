-- Como cada pessoa recebe (ADR-0018, fatia 3): CLT, pró-labore e estágio por mês; diária com
-- custo, horas por diária e dias; projeto com custo e horas do projeto. Média e rateio usam só quem
-- tem custo e horas do mês; a hora de cada membro vale sempre; o "pelo piso" é ignorado.
-- Mesmos centavos de packages/domain/src/remuneracao.test.ts.
begin;

select plan(9);

select testes.criar_dados_sinteticos();
select testes.autenticar_como('eduardo@filtroville.test');

select lives_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      1, 0, 1, 3000, 0, 0, 0, 0, 0, $json$[
      {"id": "40000000-0000-4000-8000-0000000000a1", "membro_id": "d0000000-0000-4000-8000-0000000000a1",
       "socio": true, "tipo_recebimento": "pro_labore", "custo_mensal_centavos": 1000000, "horas_disponiveis_mes": 160},
      {"id": "40000000-0000-4000-8000-0000000000a2", "membro_id": "d0000000-0000-4000-8000-0000000000a2",
       "tipo_recebimento": "diaria", "custo_diaria_centavos": 40000, "horas_por_diaria": 8, "dias_no_mes": 10},
      {"id": "40000000-0000-4000-8000-0000000000a3", "membro_id": "d0000000-0000-4000-8000-0000000000a3",
       "tipo_recebimento": "projeto", "custo_projeto_centavos": 300000, "horas_projeto": 45}
    ]$json$::jsonb)$sql$,
  'Gestão salva pró-labore, diária e projeto'
);

select results_eq(
  $$select hora_tecnica_centavos, horas_faturaveis_mes, custo_hora_membro
    from public.orcamento_base_custos where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'$$,
  $$values (5833::bigint, 240.00::numeric,
            '[{"membro_id": "d0000000-0000-4000-8000-0000000000a1", "hora_centavos": 6250},
              {"membro_id": "d0000000-0000-4000-8000-0000000000a2", "hora_centavos": 5000},
              {"membro_id": "d0000000-0000-4000-8000-0000000000a3", "hora_centavos": 6667}]'::jsonb)$$,
  'média (10.000 + 4.000) ÷ 240 h = 58,33; diária 400 ÷ 8 h = 50,00; projeto 3.000 ÷ 45 h = 66,67'
);

select results_eq(
  $$select array_agg(tipo_recebimento order by ordem), array_agg(custo_mensal_centavos order by ordem),
           array_agg(horas_disponiveis_mes order by ordem)
    from public.orcamento_base_equipe where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'$$,
  $$values (array['pro_labore', 'diaria', 'projeto'], array[1000000, 400000, null]::bigint[],
            array[160, 80, null]::integer[])$$,
  'diária com dias vira custo e horas do mês; projeto sem horas no mês fica desconhecido'
);

select results_eq(
  $$select array_agg((j ->> 'horas_mes') order by j ->> 'membro_id')
    from jsonb_array_elements((public.carga_da_equipe('c0000000-0000-4000-8000-00000000000a')) -> 'jornada') as j$$,
  $$values (array['160', '80', null])$$,
  'a carga mostra capacidade desconhecida como nula, nunca zero'
);

select results_eq(
  $$select jsonb_path_query_array(public.obter_base_de_custos('c0000000-0000-4000-8000-00000000000a'),
                                  '$.equipe[*].tipo_recebimento')$$,
  $$values ('["pro_labore", "diaria", "projeto"]'::jsonb)$$,
  'a leitura traz a forma de recebimento'
);

select throws_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      1, 0, 1, 3000, 0, 0, 0, 0, 0, '[{"id": "40000000-0000-4000-8000-0000000000a1",
      "membro_id": "d0000000-0000-4000-8000-0000000000a1", "tipo_recebimento": "piso",
      "custo_mensal_centavos": 100, "horas_disponiveis_mes": 10}]'::jsonb)$sql$,
  '22023', 'equipe_invalida',
  'forma de recebimento desconhecida é recusada'
);

select throws_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      1, 0, 1, 3000, 0, 0, 0, 0, 0, '[{"id": "40000000-0000-4000-8000-0000000000a1",
      "membro_id": "d0000000-0000-4000-8000-0000000000a1", "tipo_recebimento": "diaria",
      "custo_diaria_centavos": 100, "horas_por_diaria": 25, "dias_no_mes": 1}]'::jsonb)$sql$,
  '22023', 'equipe_invalida',
  'diária com mais de 24 horas é recusada'
);

select throws_ok(
  $sql$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      1, 0, 1, 3000, 0, 0, 0, 0, 0, '[{"id": "40000000-0000-4000-8000-0000000000a1",
      "membro_id": "d0000000-0000-4000-8000-0000000000a1", "pelo_piso": true, "horas_disponiveis_mes": 173}]'::jsonb,
      '[]'::jsonb, 0, 0, '[]'::jsonb, 7949)$sql$,
  '22023', 'equipe_sem_horas_faturaveis',
  'o antigo "pelo piso" é ignorado: sem custo do mês, não há hora técnica'
);

select testes.autenticar_como('ana@filtroville.test');
select results_eq(
  $$select count(*) from public.orcamento_base_equipe$$,
  $$values (0::bigint)$$,
  'Equipe (Ana) não lê como cada pessoa recebe'
);

select * from finish();

rollback;
