-- Situação manual, identidade da proposta, ART/RRT e apresentação (ADR-0018, fatia 6; ORC-04, P2, P8,
-- P9). Sair do rascunho exige horas e preço; reabrir é nova revisão; o histórico diz quem e quando.
-- Identidade e logo só pela Gestão; nada atravessa consultorias.
begin;

select plan(31);

select testes.criar_dados_sinteticos();

insert into storage.objects (bucket_id, name, metadata) values
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/consultoria/91000001-0000-4000-8000-000000000000.png',
   '{"mimetype": "image/png", "size": 40960}'),
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/consultoria/91000002-0000-4000-8000-000000000000.png',
   '{"mimetype": "application/pdf", "size": 4096}');

select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_empreendimento('e0000000-0000-4000-8000-0000000000f6',
  'c0000000-0000-4000-8000-00000000000a', 'Granja Sol Nascente');
select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
  3000, 160000, 160, 3000, 0, 0, 0, 0, 0, '[]'::jsonb, '[]'::jsonb, 0, 0,
  '[{"id": "h", "profissao": "Eng.", "atividade": "Hora", "valor_centavos": 16000}]'::jsonb, 0);
select public.criar_orcamento('f0000000-0000-4000-8000-0000000000e6', 'c0000000-0000-4000-8000-00000000000a',
  'e0000000-0000-4000-8000-0000000000f6', 'Outorga de uso da água');

-- ---------------------------------------------------------------- ART/RRT e apresentação
select throws_ok(
  $sql$select public.salvar_orcamento('f0000000-0000-4000-8000-0000000000e6', 1, $json${
    "objeto": "Outorga de uso da água", "forma_preco": "tabela",
    "itens": [{"id": "10000000-0000-4000-8000-0000000000c1", "descricao": "Estudo hidrológico",
               "minutos": 600, "hora_venda_id": "h", "responsabilidade_tecnica": "crea"}]
  }$json$::jsonb)$sql$,
  '22023', 'item_invalido',
  'responsabilidade técnica só ART ou RRT'
);

select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000e6', 1, $json${
    "objeto": "Outorga de uso da água", "forma_preco": "tabela",
    "apresentacao": "  Prezados, segue nossa proposta.  ",
    "itens": [
      {"id": "10000000-0000-4000-8000-0000000000c1", "descricao": "Estudo hidrológico", "minutos": 600,
       "hora_venda_id": "h", "responsabilidade_tecnica": "art"},
      {"id": "10000000-0000-4000-8000-0000000000c2", "descricao": "Protocolo", "minutos": 0, "hora_venda_id": "h"}
    ]
  }$json$::jsonb),
  2,
  'salva serviço com ART e o texto de apresentação'
);

select results_eq(
  $$select j ->> 'apresentacao', j -> 'itens' -> 0 ->> 'responsabilidade_tecnica',
           j -> 'itens' -> 1 ->> 'responsabilidade_tecnica'
    from public.obter_orcamento('f0000000-0000-4000-8000-0000000000e6') as j$$,
  $$values ('Prezados, segue nossa proposta.', 'art', null::text)$$,
  'a leitura traz a apresentação e a ART do serviço'
);

-- ---------------------------------------------------------------- situação
select throws_ok(
  $$select public.mudar_situacao_orcamento('f0000000-0000-4000-8000-0000000000e6', 2, 'enviada')$$,
  'P0001', 'horas_pendentes',
  'sem horas em todos os serviços, não sai do rascunho (P2)'
);

select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000e6', 2, $json${
    "objeto": "Outorga de uso da água", "forma_preco": "tabela",
    "itens": [
      {"id": "10000000-0000-4000-8000-0000000000c1", "descricao": "Estudo hidrológico", "minutos": 600,
       "hora_venda_id": "h", "responsabilidade_tecnica": "art"},
      {"id": "10000000-0000-4000-8000-0000000000c2", "descricao": "Protocolo", "minutos": 60}
    ]
  }$json$::jsonb),
  3,
  'horas informadas, mas um serviço sem preço'
);

select throws_ok(
  $$select public.mudar_situacao_orcamento('f0000000-0000-4000-8000-0000000000e6', 3, 'enviada')$$,
  'P0001', 'preco_pendente',
  'com preço pendente, não sai do rascunho'
);

select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000e6', 3, $json${
    "objeto": "Outorga de uso da água", "forma_preco": "tabela",
    "itens": [
      {"id": "10000000-0000-4000-8000-0000000000c1", "descricao": "Estudo hidrológico", "minutos": 600,
       "hora_venda_id": "h", "responsabilidade_tecnica": "art"},
      {"id": "10000000-0000-4000-8000-0000000000c2", "descricao": "Protocolo", "minutos": 60, "hora_venda_id": "h"}
    ]
  }$json$::jsonb),
  4,
  'orçamento completo'
);

select throws_ok(
  $$select public.mudar_situacao_orcamento('f0000000-0000-4000-8000-0000000000e6', 4, 'recusada')$$,
  'P0001', 'transicao_invalida',
  'rascunho não vai direto para recusada'
);

select is(
  public.mudar_situacao_orcamento('f0000000-0000-4000-8000-0000000000e6', 4, 'enviada', 'Enviada por e-mail'),
  5,
  'Gestão marca como enviada'
);

select throws_ok(
  $$select public.salvar_orcamento('f0000000-0000-4000-8000-0000000000e6', 5, '{"objeto": "Mudança"}'::jsonb)$$,
  'P0001', 'orcamento_nao_editavel',
  'enviada não é editada no lugar'
);

select throws_ok(
  $$select public.mudar_situacao_orcamento('f0000000-0000-4000-8000-0000000000e6', 4, 'aprovada')$$,
  'P0001', 'conflito_de_versao',
  'mudar a situação confere a versão'
);

select is(
  public.mudar_situacao_orcamento('f0000000-0000-4000-8000-0000000000e6', 5, 'aprovada'),
  6,
  'Gestão marca como aprovada'
);

select throws_ok(
  $$select public.excluir_orcamento('f0000000-0000-4000-8000-0000000000e6', 6)$$,
  'P0001', 'orcamento_aprovado_nao_exclui',
  'aprovado não vai para a lixeira'
);

select is(
  public.mudar_situacao_orcamento('f0000000-0000-4000-8000-0000000000e6', 6, 'rascunho', 'Cliente pediu ajuste'),
  7,
  'reabrir o aprovado volta a rascunho'
);

select results_eq(
  $$select situacao::text, revisao from public.orcamento where id = 'f0000000-0000-4000-8000-0000000000e6'$$,
  $$values ('rascunho', 2)$$,
  'reabrir cria a revisão seguinte'
);

select results_eq(
  $$select array_agg(de::text || '>' || para::text order by em, id), array_agg(revisao order by em, id),
           bool_and(membro_id = 'd0000000-0000-4000-8000-0000000000a1'), count(*) filter (where observacao is not null)
    from public.orcamento_situacao where orcamento_id = 'f0000000-0000-4000-8000-0000000000e6'$$,
  $$values (array['rascunho>enviada', 'enviada>aprovada', 'aprovada>rascunho'], array[1, 1, 2], true, 2::bigint)$$,
  'o histórico guarda de onde, para onde, revisão, quem e observação'
);

select is(
  jsonb_array_length(public.obter_orcamento('f0000000-0000-4000-8000-0000000000e6') -> 'historico_situacao'),
  3,
  'a leitura traz o histórico'
);

-- ---------------------------------------------------------------- identidade
select throws_ok(
  $$select public.salvar_identidade_da_consultoria('c0000000-0000-4000-8000-00000000000a', 0,
      '{"cnpj": "123"}'::jsonb)$$,
  '22023', 'cnpj_invalido',
  'CNPJ inválido é recusado'
);

select throws_ok(
  $$select public.registrar_logo_da_consultoria('c0000000-0000-4000-8000-00000000000a',
      '91000001-0000-4000-8000-000000000000',
      'c0000000-0000-4000-8000-00000000000a/consultoria/91000001-0000-4000-8000-000000000000.png',
      'logo.png', repeat('a', 64))$$,
  'P0001', 'identidade_nao_salva',
  'a logo vem depois dos dados'
);

select is(
  public.salvar_identidade_da_consultoria('c0000000-0000-4000-8000-00000000000a', 0, $json${
    "razao_social": " Filtroville Consultoria Ambiental Ltda. ", "cnpj": "11.222.333/0001-81",
    "telefone": "(47) 3000-0000", "email": "contato@filtroville.test",
    "texto_apresentacao": "Agradecemos a oportunidade."
  }$json$::jsonb),
  1,
  'Gestão salva a identidade'
);

select throws_ok(
  $$select public.salvar_identidade_da_consultoria('c0000000-0000-4000-8000-00000000000a', 0, '{}'::jsonb)$$,
  'P0001', 'conflito_de_versao',
  'a identidade confere a versão'
);

select is(
  public.registrar_logo_da_consultoria('c0000000-0000-4000-8000-00000000000a',
    '91000001-0000-4000-8000-000000000000',
    'c0000000-0000-4000-8000-00000000000a/consultoria/91000001-0000-4000-8000-000000000000.png',
    'logo.png', repeat('a', 64)),
  '91000001-0000-4000-8000-000000000000'::uuid,
  'Gestão registra a logo'
);

select throws_ok(
  $$select public.registrar_logo_da_consultoria('c0000000-0000-4000-8000-00000000000a',
      '91000002-0000-4000-8000-000000000000',
      'c0000000-0000-4000-8000-00000000000a/consultoria/91000002-0000-4000-8000-000000000000.png',
      'logo.png', repeat('b', 64))$$,
  '22023', 'arquivo_tipo_invalido',
  'logo só PNG ou JPEG'
);

select results_eq(
  $$select j ->> 'razao_social', j ->> 'cnpj', j ->> 'logo_caminho', (j ->> 'row_version')::integer
    from public.obter_identidade_da_consultoria('c0000000-0000-4000-8000-00000000000a') as j$$,
  $$values ('Filtroville Consultoria Ambiental Ltda.', '11222333000181',
            'c0000000-0000-4000-8000-00000000000a/consultoria/91000001-0000-4000-8000-000000000000.png', 2)$$,
  'a leitura traz os dados limpos e o caminho da logo'
);

select lives_ok(
  $$select public.remover_logo_da_consultoria('c0000000-0000-4000-8000-00000000000a')$$,
  'Gestão tira a logo'
);

select is(
  public.obter_identidade_da_consultoria('c0000000-0000-4000-8000-00000000000a') ->> 'logo_caminho',
  null,
  'sem logo depois de tirar'
);

-- ---------------------------------------------------------------- negativos
select testes.autenticar_como('ana@filtroville.test');

select throws_ok(
  $$select public.mudar_situacao_orcamento('f0000000-0000-4000-8000-0000000000e6', 7, 'enviada')$$,
  '42501', 'sem_permissao',
  'Equipe (Ana) não muda a situação'
);

select throws_ok(
  $$select public.salvar_identidade_da_consultoria('c0000000-0000-4000-8000-00000000000a', 3, '{}'::jsonb)$$,
  '42501', 'sem_permissao',
  'Equipe (Ana) não edita a identidade'
);

select results_eq(
  $$select (select count(*) from public.consultoria_identidade), (select count(*) from public.orcamento_situacao)$$,
  $$values (0::bigint, 0::bigint)$$,
  'Equipe (Ana) não lê identidade nem histórico'
);

select testes.autenticar_como('gustavo@verdesul.test');

select results_eq(
  $$select (select count(*) from public.consultoria_identidade), (select count(*) from public.orcamento_situacao),
           public.obter_identidade_da_consultoria('c0000000-0000-4000-8000-00000000000a')$$,
  $$values (0::bigint, 0::bigint, null::jsonb)$$,
  'Gestão de outra consultoria (Gustavo) recebe zero linhas'
);

select throws_ok(
  $$select public.mudar_situacao_orcamento('f0000000-0000-4000-8000-0000000000e6', 7, 'enviada')$$,
  '42501', 'sem_permissao',
  'outra consultoria não muda a situação de orçamento alheio'
);

select * from finish();

rollback;
