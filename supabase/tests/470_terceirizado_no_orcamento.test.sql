-- Profissional terceirizado no orçamento (ADR-0028). O responsável do serviço pode ser um terceiro
-- sem login: o custo é o valor dele (por hora ou fechado), sem rateio das contas. Pela margem, a venda
-- é o custo dele e recebe o acréscimo; pela tabela, o preço vem da tabela. Sem valor, pendente.
-- Outra consultoria não vê nada.
begin;

select plan(13);

select testes.criar_dados_sinteticos();
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_empreendimento('e0000000-0000-4000-8000-0000000000f7',
  'c0000000-0000-4000-8000-00000000000a', 'Loteamento Sul');

-- Hora técnica R$ 30, contas R$ 1.600 ÷ 160 h = R$ 10 por hora, margem 30%, sem tributos e taxas.
select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
  3000, 160000, 160, 3000, 0, 0, 0, 0, 0, '[]'::jsonb, '[]'::jsonb, 0, 0, $json$[
    {"id": "h", "profissao": "Eng.", "atividade": "Hora", "valor_centavos": 16000}
  ]$json$::jsonb, 0);

select public.criar_orcamento('f0000000-0000-4000-8000-0000000000f7', 'c0000000-0000-4000-8000-00000000000a',
  'e0000000-0000-4000-8000-0000000000f7', 'Loteamento');

-- Pela margem, 20%: terceiro 2h × R$ 80 = 160 (sem tabela, sem rateio) e equipe 1h × R$ 160 + 10
-- de contas. Base do acréscimo 330, acréscimo 66, preço 396: 192 e 204 (pesos 160 e 170).
select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000f7', 1, $json${
    "objeto": "Loteamento", "forma_preco": "margem", "margem_pb": 2000,
    "itens": [
      {"id": "10000000-0000-4000-8000-0000000000f1", "descricao": "Topografia", "minutos": 120,
       "terceiro_nome": "  João Topógrafo ", "terceiro_profissao": "eng_cartografo_agrimensor",
       "terceiro_cobranca": "hora", "terceiro_valor_centavos": 8000},
      {"id": "10000000-0000-4000-8000-0000000000f2", "descricao": "Relatório", "minutos": 60,
       "hora_venda_id": "h"}
    ],
    "despesas": [], "parcelas": []
  }$json$::jsonb),
  2,
  'Gestão salva um serviço com terceirizado'
);

select results_eq(
  $$select terceiro_nome, terceiro_profissao::text, terceiro_cobranca, terceiro_valor_centavos,
           responsavel_id, preco_centavos
    from public.orcamento_item where orcamento_id = 'f0000000-0000-4000-8000-0000000000f7' order by ordem$$,
  $$values ('João Topógrafo', 'eng_cartografo_agrimensor', 'hora', 8000::bigint, null::uuid, 19200::bigint),
           (null, null, null, null::bigint, null::uuid, 20400::bigint)$$,
  'terceiro gravado sem responsável; pela margem a venda dele recebe o acréscimo'
);

select is(
  (public.obter_orcamento('f0000000-0000-4000-8000-0000000000f7') -> 'itens' -> 0 ->> 'terceiro_nome'),
  'João Topógrafo',
  'obter_orcamento devolve o terceirizado'
);

-- Pela tabela: o terceiro fechado em R$ 500 não muda o preço (2h × 160 = 320); só o custo.
select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000f7', 2, $json${
    "objeto": "Loteamento", "forma_preco": "tabela",
    "itens": [
      {"id": "10000000-0000-4000-8000-0000000000f1", "descricao": "Topografia", "minutos": 120,
       "hora_venda_id": "h", "terceiro_nome": "João Topógrafo", "terceiro_cobranca": "fechado",
       "terceiro_valor_centavos": 50000},
      {"id": "10000000-0000-4000-8000-0000000000f2", "descricao": "Relatório", "minutos": 60,
       "hora_venda_id": "h"}
    ],
    "despesas": [], "parcelas": []
  }$json$::jsonb),
  3,
  'pela tabela com terceiro de valor fechado'
);

select results_eq(
  $$select preco_centavos from public.orcamento_item
    where orcamento_id = 'f0000000-0000-4000-8000-0000000000f7' order by ordem$$,
  $$values (32000::bigint), (16000::bigint)$$,
  'pela tabela o preço vem da tabela'
);

reset role;
select is(
  (select t.custo from public.orcamento as o, private.itens_do_preco(o) as t
   where o.id = 'f0000000-0000-4000-8000-0000000000f7' and t.posicao = 1),
  50000::numeric,
  'custo do serviço terceirizado é o valor fechado, sem rateio das contas'
);
select testes.autenticar_como('eduardo@filtroville.test');

-- Duplicar sem os preços: o terceiro vai junto, sem o valor, e o preço fica pendente.
select public.duplicar_orcamento('f0000000-0000-4000-8000-0000000000f7',
  'f0000000-0000-4000-8000-0000000000f8', false);
select results_eq(
  $$select terceiro_nome, terceiro_cobranca, terceiro_valor_centavos, preco_centavos
    from public.orcamento_item where orcamento_id = 'f0000000-0000-4000-8000-0000000000f8' order by ordem$$,
  $$values ('João Topógrafo', 'fechado', null::bigint, 0::bigint), (null, null, null::bigint, 0::bigint)$$,
  'cópia sem os preços leva o terceiro sem o valor e fica pendente'
);

select public.duplicar_orcamento('f0000000-0000-4000-8000-0000000000f7',
  'f0000000-0000-4000-8000-0000000000f9', true);
select is(
  (select terceiro_valor_centavos from public.orcamento_item
   where orcamento_id = 'f0000000-0000-4000-8000-0000000000f9' and terceiro_nome is not null),
  50000::bigint,
  'cópia com os preços leva o valor do terceiro'
);

-- Inválidos.
select throws_ok(
  $$select public.salvar_orcamento('f0000000-0000-4000-8000-0000000000f7', 3, $json${
    "objeto": "Loteamento", "itens": [{"id": "10000000-0000-4000-8000-0000000000f1",
      "descricao": "Topografia", "minutos": 120, "terceiro_nome": "João",
      "responsavel_id": "d0000000-0000-4000-8000-0000000000a1", "terceiro_valor_centavos": 100}],
    "despesas": [], "parcelas": []}$json$::jsonb)$$,
  '22023', 'item_invalido',
  'terceirizado não tem responsável da equipe'
);

select throws_ok(
  $$select public.salvar_orcamento('f0000000-0000-4000-8000-0000000000f7', 3, $json${
    "objeto": "Loteamento", "itens": [{"id": "10000000-0000-4000-8000-0000000000f1",
      "descricao": "Topografia", "minutos": 120, "terceiro_nome": "João",
      "terceiro_cobranca": "diaria", "terceiro_valor_centavos": 100}],
    "despesas": [], "parcelas": []}$json$::jsonb)$$,
  '22023', 'item_invalido',
  'cobrança do terceiro só por hora ou fechado'
);

reset role;
select throws_ok(
  $$insert into public.orcamento_item (id, consultoria_id, orcamento_id, ordem, descricao, minutos,
      preco_automatico, preco_centavos, custo_direto_extra_centavos, terceiro_nome)
    values (gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a',
      'f0000000-0000-4000-8000-0000000000f7', 9, 'X', 0, true, 0, 0, 'Sem cobrança')$$,
  '23514', null,
  'a tabela exige a cobrança junto com o nome'
);

-- Outra consultoria: não vê o item nem o orçamento.
select testes.autenticar_como('gustavo@verdesul.test');
select is_empty(
  $$select terceiro_nome from public.orcamento_item
    where orcamento_id = 'f0000000-0000-4000-8000-0000000000f7'$$,
  'outra consultoria não vê o terceirizado'
);
select is(
  public.obter_orcamento('f0000000-0000-4000-8000-0000000000f7'),
  null,
  'outra consultoria não abre o orçamento'
);

select * from finish();

rollback;
