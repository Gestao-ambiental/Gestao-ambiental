-- Tabela de preços em dois blocos e visita técnica por visita ou por km (decisões do Eduardo,
-- 13/11/2026). Hora de profissional exige profissão; serviço não ("Quem faz" opcional, custo pela
-- média da equipe). O banco deriva o valor do km: preço do litro ÷ consumo + acréscimo.
-- Mesmos números de packages/domain/src/deslocamento.test.ts.
begin;

select plan(36);

select testes.criar_dados_sinteticos();

-- Equipe: Eduardo (Engenheiro) 10.000,00 em 160 h = 62,50/h; Ana (Bióloga) 3.200,00 em 160 h =
-- 20,00/h. Média: 13.200,00 ÷ 320 h = 41,25/h. Sem contas do mês (contas por hora = 0).
create temporary table entrada (nome text primary key, valor jsonb) on commit drop;
grant select on entrada to authenticated;
insert into entrada values
  ('equipe', $j$[
     {"id": "40000000-0000-4000-8000-0000000033a1", "membro_id": "d0000000-0000-4000-8000-0000000000a1",
      "socio": true, "profissao": "Engenheiro", "tipo_recebimento": "pro_labore",
      "custo_mensal_centavos": 1000000, "horas_disponiveis_mes": 160},
     {"id": "40000000-0000-4000-8000-0000000033a2", "membro_id": "d0000000-0000-4000-8000-0000000000a2",
      "socio": false, "profissao": "Bióloga", "tipo_recebimento": "clt",
      "custo_mensal_centavos": 320000, "horas_disponiveis_mes": 160}]$j$),
  ('tabela', $j$[
     {"id": "hora-eng", "profissao": "Engenheiro", "atividade": "Júnior", "unidade": "hora",
      "valor_centavos": 20000},
     {"id": "fauna", "profissao": "", "atividade": "Inventário de fauna", "unidade": "ha",
      "valor_centavos": 10000, "minutos_por_unidade": 18},
     {"id": "flora", "profissao": "Bióloga", "atividade": "Inventário de flora", "unidade": "ha",
      "valor_centavos": 10000},
     {"id": "pgrss", "atividade": "PGRSS", "unidade": "pacote", "valor_centavos": 150000}]$j$),
  ('hora_sem_profissao', $j$[
     {"id": "hora", "profissao": " ", "atividade": "Júnior", "unidade": "hora", "valor_centavos": 20000}]$j$),
  ('servico_repetido', $j$[
     {"id": "a", "atividade": "Vistoria", "unidade": "diaria", "valor_centavos": 100000},
     {"id": "b", "profissao": "", "atividade": " vistoria ", "unidade": "campanha", "valor_centavos": 100000}]$j$);

-- ---------------------------------------------------------------------------
-- Quem pode: Equipe e outra consultoria não salvam nem leem
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');
select throws_ok(
  $$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      0, 0, 160, 3000, 2500, 0, 0, 0, 0, '[]'::jsonb, '[]'::jsonb, 0, 0,
      (select valor from entrada where nome = 'tabela'), 0, 'km', 12, 600, null)$$,
  '42501', 'sem_permissao', 'Equipe não salva a base com o deslocamento');

select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      0, 0, 160, 3000, 2500, 0, 0, 0, 0, '[]'::jsonb, '[]'::jsonb, 0, 0,
      (select valor from entrada where nome = 'tabela'), 0, 'km', 12, 600, null)$$,
  '42501', 'sem_permissao', 'Gestão de outra consultoria não salva a base');

-- ---------------------------------------------------------------------------
-- Tabela em dois blocos
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');
select throws_ok(
  $$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      4000, 0, 160, 3000, 2500, 0, 0, 0, 0, '[]'::jsonb, '[]'::jsonb, 0, 0,
      (select valor from entrada where nome = 'hora_sem_profissao'), 0)$$,
  '22023', 'horas_de_venda_invalidas', 'hora de profissional sem profissão é recusada');
select throws_ok(
  $$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      4000, 0, 160, 3000, 2500, 0, 0, 0, 0, '[]'::jsonb, '[]'::jsonb, 0, 0,
      (select valor from entrada where nome = 'servico_repetido'), 0)$$,
  '22023', 'horas_de_venda_invalidas', 'dois serviços sem "Quem faz" com o mesmo nome são recusados');

-- Km: preço 6,00 ÷ 12 km/l = 0,50 (o 9,99 enviado é ignorado).
select lives_ok(
  $$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      0, 0, 0, 3000, 2500, 0, 0, 0, 0, (select valor from entrada where nome = 'equipe'), '[]'::jsonb,
      15000, 999, (select valor from entrada where nome = 'tabela'), 0, 'km', 12, 600, null)$$,
  'Gestão salva serviços sem profissão e o deslocamento por km');
select results_eq(
  $$select horas_venda -> 1 ->> 'profissao', horas_venda -> 3 ->> 'profissao', jsonb_array_length(horas_venda)
    from public.orcamento_base_custos where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'$$,
  $$values ('', '', 4)$$,
  'serviço sem "Quem faz" fica com a profissão vazia');
select results_eq(
  $$select deslocamento_modo, consumo_km_por_litro, preco_combustivel_centavos, acrescimo_km_centavos,
           custo_km_centavos, valor_visita_centavos
    from public.orcamento_base_custos where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'$$,
  $$values ('km', 12.00::numeric(5,2), 600::bigint, null::bigint, 50::bigint, 15000::bigint)$$,
  'o banco deriva o km pelo combustível, sem confiar no valor enviado');
select is(
  public.obter_base_de_custos('c0000000-0000-4000-8000-00000000000a')
    - array['hora_tecnica_centavos', 'custos_fixos_mensais_centavos', 'custos_fixos_equipe_centavos',
            'custos_fixos_detalhe', 'horas_faturaveis_mes', 'margem_desejada_pb', 'margem_minima_pb',
            'tributos_pb', 'taxas_pb', 'taxa_por_cobranca_centavos', 'taxa_por_assinatura_centavos',
            'horas_venda', 'custo_hora_profissao', 'piso_hora_centavos', 'custo_hora_membro',
            'atualizado_em', 'row_version', 'equipe'],
  '{"deslocamento_modo": "km", "consumo_km_por_litro": 12.00, "preco_combustivel_centavos": 600,
    "acrescimo_km_centavos": null, "custo_km_centavos": 50, "valor_visita_centavos": 15000}'::jsonb,
  'a leitura da base devolve o deslocamento');

select throws_ok(
  $$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      0, 0, 0, 3000, 2500, 0, 0, 0, 0, (select valor from entrada where nome = 'equipe'), '[]'::jsonb,
      0, 0, (select valor from entrada where nome = 'tabela'), 0, 'km', 12, null, null)$$,
  '22023', 'deslocamento_invalido', 'consumo sem o preço do litro é recusado');
select throws_ok(
  $$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      0, 0, 0, 3000, 2500, 0, 0, 0, 0, (select valor from entrada where nome = 'equipe'), '[]'::jsonb,
      0, 0, (select valor from entrada where nome = 'tabela'), 0, 'km', 0, 600, null)$$,
  '22023', 'deslocamento_invalido', 'consumo zero é recusado');
select throws_ok(
  $$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      0, 0, 0, 3000, 2500, 0, 0, 0, 0, (select valor from entrada where nome = 'equipe'), '[]'::jsonb,
      0, 0, (select valor from entrada where nome = 'tabela'), 0, 'onibus', null, null, null)$$,
  '22023', 'deslocamento_invalido', 'modo fora da lista é recusado');

-- ---------------------------------------------------------------------------
-- Orçamento: custo do serviço sem profissão e visitas por km
-- ---------------------------------------------------------------------------
select public.criar_empreendimento('e0000000-0000-4000-8000-0000000000f5',
  'c0000000-0000-4000-8000-00000000000a', 'Fazenda Boa Vista');
select lives_ok(
  $$select public.criar_orcamento('f0000000-0000-4000-8000-0000000000f5', 'c0000000-0000-4000-8000-00000000000a',
      'e0000000-0000-4000-8000-0000000000f5', 'Inventário da fazenda')$$,
  'cria o orçamento');
-- 10 ha × 100,00 em 3 h cada serviço; 2 visitas de 80 km com 20,00 de outros gastos.
select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000f5', 1, $json${
    "objeto": "Inventário da fazenda", "forma_preco": "tabela",
    "visitas": {"quantidade": 2, "km_por_visita": 80, "outros_por_visita_centavos": 2000},
    "itens": [
      {"id": "10000000-0000-4000-8000-0000000000f1", "descricao": "Fauna", "minutos": 180,
       "hora_venda_id": "fauna", "quantidade": "10"},
      {"id": "10000000-0000-4000-8000-0000000000f2", "descricao": "Flora", "minutos": 180,
       "hora_venda_id": "flora", "quantidade": "10"}]
  }$json$::jsonb),
  2, 'salva o orçamento com serviços e visitas');

-- Por km: 2 × (80 × 0,50 + 20,00) = 120,00; o valor fixo da visita (150,00) não entra.
select results_eq(
  $$select base_deslocamento_modo, base_valor_visita_centavos, base_custo_km_centavos, preco_visitas_centavos
    from public.orcamento where id = 'f0000000-0000-4000-8000-0000000000f5'$$,
  $$values ('km', 0::bigint, 50::bigint, 12000::bigint)$$,
  'por km: a cópia leva só o km e as visitas custam km × valor do km + outros');
select is(
  public.obter_orcamento('f0000000-0000-4000-8000-0000000000f5') #>> '{base,deslocamento_modo}',
  'km', 'o detalhe do orçamento diz o modo');
select results_eq(
  $$select array_agg(preco_centavos order by ordem) from public.orcamento_item
    where orcamento_id = 'f0000000-0000-4000-8000-0000000000f5'$$,
  $$values (array[100000, 100000]::bigint[])$$,
  'serviço sem "Quem faz" tem preço pela tabela, como os outros');

-- Custo: sem "Quem faz", 3 h × 41,25 (média) = 123,75; com a Bióloga, 3 h × 20,00 = 60,00.
reset role;
select results_eq(
  $$select array_agg(t.custo::bigint order by t.posicao)
    from public.orcamento as o cross join lateral private.itens_do_preco(o) as t
    where o.id = 'f0000000-0000-4000-8000-0000000000f5'$$,
  $$values (array[12375, 6000]::bigint[])$$,
  'custo do serviço sem profissão usa a média da equipe');

-- Por visita: 2 × (150,00 + 20,00) = 340,00; o km não entra.
select testes.autenticar_como('eduardo@filtroville.test');
select lives_ok(
  $$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      0, 0, 0, 3000, 2500, 0, 0, 0, 0, (select valor from entrada where nome = 'equipe'), '[]'::jsonb,
      15000, 0, (select valor from entrada where nome = 'tabela'), 0, 'visita', null, null, null)$$,
  'Gestão troca para cobrar por visita');
select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000f5', 2,
    '{"objeto": "Inventário da fazenda", "forma_preco": "tabela",
      "visitas": {"quantidade": 2, "km_por_visita": 80, "outros_por_visita_centavos": 2000},
      "itens": [
        {"id": "10000000-0000-4000-8000-0000000000f1", "descricao": "Fauna", "minutos": 180,
         "hora_venda_id": "fauna", "quantidade": "10"},
        {"id": "10000000-0000-4000-8000-0000000000f2", "descricao": "Flora", "minutos": 180,
         "hora_venda_id": "flora", "quantidade": "10"}]}'::jsonb),
  3, 'o rascunho pega a base nova ao salvar');
select results_eq(
  $$select base_deslocamento_modo, base_valor_visita_centavos, base_custo_km_centavos, preco_visitas_centavos
    from public.orcamento where id = 'f0000000-0000-4000-8000-0000000000f5'$$,
  $$values ('visita', 15000::bigint, 0::bigint, 34000::bigint)$$,
  'por visita: o km fica de fora do preço');

-- Base antiga (sem modo e sem combustível): só o km com valor → km; os dois com valor → visita.
reset role;
update public.orcamento_base_custos
set deslocamento_modo = null, consumo_km_por_litro = null, preco_combustivel_centavos = null,
    valor_visita_centavos = 0, custo_km_centavos = 120
where consultoria_id = 'c0000000-0000-4000-8000-00000000000a';
select testes.autenticar_como('eduardo@filtroville.test');
select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000f5', 3,
    '{"objeto": "Inventário da fazenda", "forma_preco": "tabela",
      "visitas": {"quantidade": 2, "km_por_visita": 80, "outros_por_visita_centavos": 2000},
      "itens": [
        {"id": "10000000-0000-4000-8000-0000000000f1", "descricao": "Fauna", "minutos": 180,
         "hora_venda_id": "fauna", "quantidade": "10"}]}'::jsonb),
  4, 'salva com a base antiga');
select results_eq(
  $$select base_deslocamento_modo, preco_visitas_centavos
    from public.orcamento where id = 'f0000000-0000-4000-8000-0000000000f5'$$,
  $$values ('km', 23200::bigint)$$,
  'base antiga só com km vale por km: 2 × (80 × 1,20 + 20,00)');

-- ---------------------------------------------------------------------------
-- Primeiros passos: passo 3 com os campos novos e publicação
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 0, 3,
      jsonb_build_object('horas_venda', (select valor from entrada where nome = 'hora_sem_profissao')),
      4, (public.obter_rascunho_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a') ->> 'base_row_version')::integer)$$,
  '22023', 'dados_invalidos', 'rascunho: hora sem profissão é recusada');
select throws_ok(
  $$select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 0, 3,
      jsonb_build_object('horas_venda', (select valor from entrada where nome = 'tabela'),
        'deslocamento_modo', 'km', 'consumo_km_por_litro', 10, 'preco_combustivel_centavos', null),
      4, (public.obter_rascunho_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a') ->> 'base_row_version')::integer)$$,
  '22023', 'dados_invalidos', 'rascunho: consumo sem o preço do litro é recusado');
select throws_ok(
  $$select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 0, 3,
      jsonb_build_object('horas_venda', (select valor from entrada where nome = 'tabela'),
        'deslocamento_modo', 'carro'),
      4, (public.obter_rascunho_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a') ->> 'base_row_version')::integer)$$,
  '22023', 'dados_invalidos', 'rascunho: modo fora da lista é recusado');
select throws_ok(
  $$select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 0, 3,
      jsonb_build_object('horas_venda', (select valor from entrada where nome = 'tabela'),
        'consumo_km_por_litro', 12.345, 'preco_combustivel_centavos', 600),
      4, (public.obter_rascunho_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a') ->> 'base_row_version')::integer)$$,
  '22023', 'dados_invalidos', 'rascunho: consumo com mais de duas casas é recusado');

select is(
  (public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 0, 1,
     jsonb_build_object('modo', 'equipe', 'hora_tecnica_centavos', null,
                        'equipe', (select valor from entrada where nome = 'equipe')), 2,
     (public.obter_rascunho_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a') ->> 'base_row_version')::integer)
   ->> 'row_version')::integer,
  1, 'rascunho começa da base atual');
select is(
  (public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 1, 2,
     '{"custos_fixos_mensais_centavos": 0, "horas_faturaveis_mes": null, "contas": []}', 3, 0)
   ->> 'row_version')::integer,
  2, 'salva as contas');
-- Km: 6,50 ÷ 10 km/l = 0,65 + 0,25 de acréscimo = 0,90.
select is(
  (public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 2, 3,
     jsonb_build_object('horas_venda', (select valor from entrada where nome = 'tabela'),
       'deslocamento_modo', 'km', 'valor_visita_centavos', null, 'custo_km_centavos', 1,
       'consumo_km_por_litro', 10, 'preco_combustivel_centavos', 650, 'acrescimo_km_centavos', 25), 4, 0)
   ->> 'row_version')::integer,
  3, 'rascunho guarda serviço sem profissão e o deslocamento por km');
select is(
  (public.obter_rascunho_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a')
    #> '{rascunho,dados,passo_3}') - 'horas_venda',
  '{"deslocamento_modo": "km", "valor_visita_centavos": null, "custo_km_centavos": 1,
    "consumo_km_por_litro": 10, "preco_combustivel_centavos": 650, "acrescimo_km_centavos": 25}'::jsonb,
  'a leitura do rascunho devolve o deslocamento como foi digitado');
select is(
  (public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 3, 4,
     '{"tributos_pb": 0, "taxas_pb": 0, "taxa_por_cobranca_centavos": 0, "taxa_por_assinatura_centavos": 0,
       "margem_desejada_pb": 3000, "margem_minima_pb": 2500, "margens_confirmadas": true}', 5, 0)
   -> 'pendencias'),
  '[]'::jsonb, 'nada falta para publicar');

select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select public.publicar_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 4)$$,
  '42501', 'sem_permissao', 'Gestão de outra consultoria não publica o rascunho');

select testes.autenticar_como('eduardo@filtroville.test');
select lives_ok(
  $$select public.publicar_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 4)$$,
  'publica o rascunho');
select results_eq(
  $$select deslocamento_modo, consumo_km_por_litro, preco_combustivel_centavos, acrescimo_km_centavos,
           custo_km_centavos, valor_visita_centavos, horas_venda -> 1 ->> 'profissao'
    from public.orcamento_base_custos where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'$$,
  $$values ('km', 10.00::numeric(5,2), 650::bigint, 25::bigint, 90::bigint, 0::bigint, '')$$,
  'a publicação leva o deslocamento e o banco recalcula o km (o 0,01 do rascunho é ignorado)');

-- Equipe e outra consultoria não leem a base.
select testes.autenticar_como('ana@filtroville.test');
select is(public.obter_base_de_custos('c0000000-0000-4000-8000-00000000000a'), null::jsonb,
  'Equipe não lê a base com o deslocamento');
select testes.autenticar_como('gustavo@verdesul.test');
select is(public.obter_base_de_custos('c0000000-0000-4000-8000-00000000000a'), null::jsonb,
  'Gestão de outra consultoria não lê a base');

select * from finish();
rollback;
