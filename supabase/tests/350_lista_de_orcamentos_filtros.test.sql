-- Lista de orçamentos com filtros (Protótipo 19, ORC-04): filtro por situação, contagem de cada aba,
-- busca pelo número (ORC-AAAA-NNN, AAAA-NNN, NNN) e indicadores do topo, que somam só orçamentos com
-- preço e ignoram a lixeira. Equipe e outra consultoria não veem nada.
begin;

select plan(20);

select testes.criar_dados_sinteticos();

select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_empreendimento('e0000000-0000-4000-8000-0000000000f1',
  'c0000000-0000-4000-8000-00000000000a', 'Indústria Horizonte');
select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
  3000, 160000, 160, 3000, 0, 0, 0, 0, 0, '[]'::jsonb, '[]'::jsonb, 0, 0,
  '[{"id": "h", "profissao": "Eng.", "atividade": "Hora", "valor_centavos": 16000}]'::jsonb, 0);

-- f1 rascunho · f2 enviada (R$ 1.600) · f3 em negociação sem preço · f4 aprovada (R$ 800)
-- f5 recusada · f6 enviada (R$ 1.600) na lixeira.
select public.criar_orcamento('f0000000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
  'e0000000-0000-4000-8000-0000000000f1', 'Licença de operação');
select public.criar_orcamento('f0000000-0000-4000-8000-0000000000f2', 'c0000000-0000-4000-8000-00000000000a',
  'e0000000-0000-4000-8000-0000000000f1', 'Laudo de ruído');
select public.criar_orcamento('f0000000-0000-4000-8000-0000000000f3', 'c0000000-0000-4000-8000-00000000000a',
  'e0000000-0000-4000-8000-0000000000f1', 'Outorga de uso da água');
select public.criar_orcamento('f0000000-0000-4000-8000-0000000000f4', 'c0000000-0000-4000-8000-00000000000a',
  'e0000000-0000-4000-8000-0000000000f1', 'Inventário florestal');
select public.criar_orcamento('f0000000-0000-4000-8000-0000000000f5', 'c0000000-0000-4000-8000-00000000000a',
  'e0000000-0000-4000-8000-0000000000f1', 'Plano de resíduos');
select public.criar_orcamento('f0000000-0000-4000-8000-0000000000f6', 'c0000000-0000-4000-8000-00000000000a',
  'e0000000-0000-4000-8000-0000000000f1', 'Monitoramento de efluentes');

select public.salvar_orcamento('f0000000-0000-4000-8000-0000000000f2', 1, $json${
  "objeto": "Laudo de ruído", "forma_preco": "tabela",
  "itens": [{"id": "10000000-0000-4000-8000-0000000000a2", "descricao": "Medição", "minutos": 600,
             "hora_venda_id": "h"}]}$json$::jsonb);
select public.salvar_orcamento('f0000000-0000-4000-8000-0000000000f4', 1, $json${
  "objeto": "Inventário florestal", "forma_preco": "tabela",
  "itens": [{"id": "10000000-0000-4000-8000-0000000000a4", "descricao": "Campo", "minutos": 300,
             "hora_venda_id": "h"}]}$json$::jsonb);
select public.salvar_orcamento('f0000000-0000-4000-8000-0000000000f6', 1, $json${
  "objeto": "Monitoramento de efluentes", "forma_preco": "tabela",
  "itens": [{"id": "10000000-0000-4000-8000-0000000000a6", "descricao": "Coleta", "minutos": 600,
             "hora_venda_id": "h"}]}$json$::jsonb);

-- Situação e número fixos, direto na tabela (o caminho da situação tem teste próprio, 280).
reset role;
update public.orcamento as o
set situacao = v.situacao::public.situacao_orcamento, ano = v.ano, sequencia = v.sequencia
from (values
  ('f0000000-0000-4000-8000-0000000000f1'::uuid, 'rascunho', 2026, 14),
  ('f0000000-0000-4000-8000-0000000000f2'::uuid, 'enviada', 2026, 13),
  ('f0000000-0000-4000-8000-0000000000f3'::uuid, 'negociacao', 2026, 12),
  ('f0000000-0000-4000-8000-0000000000f4'::uuid, 'aprovada', 2025, 7),
  ('f0000000-0000-4000-8000-0000000000f5'::uuid, 'recusada', 2026, 1014),
  ('f0000000-0000-4000-8000-0000000000f6'::uuid, 'enviada', 2026, 8)
) as v (id, situacao, ano, sequencia)
where o.id = v.id;
select testes.autenticar_como('eduardo@filtroville.test');
select public.excluir_orcamento(o.id, o.row_version)
from public.orcamento as o where o.id = 'f0000000-0000-4000-8000-0000000000f6';

-- ---------------------------------------------------------------------------
-- Filtro por situação
-- ---------------------------------------------------------------------------
select results_eq(
  $$select id, total from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a',
      null, 50, 0, false, 'enviada')$$,
  $$values ('f0000000-0000-4000-8000-0000000000f2'::uuid, 1::bigint)$$,
  'filtra pela situação; a enviada da lixeira não entra'
);

select results_eq(
  $$select count(*) from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values (5::bigint)$$,
  'sem situação, lista todas as que estão fora da lixeira'
);

select results_eq(
  $$select id from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a',
      null, 50, 0, true, 'enviada')$$,
  $$values ('f0000000-0000-4000-8000-0000000000f6'::uuid)$$,
  'o filtro por situação vale também na lixeira'
);

select results_eq(
  $$select count(*) from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a',
      'ruído', 50, 0, false, 'aprovada')$$,
  $$values (0::bigint)$$,
  'situação e busca se combinam'
);

-- ---------------------------------------------------------------------------
-- Contagem de cada aba
-- ---------------------------------------------------------------------------
select results_eq(
  $$select situacao::text, quantidade
    from public.contar_orcamentos_por_situacao('c0000000-0000-4000-8000-00000000000a')$$,
  $$values ('rascunho', 1::bigint), ('enviada', 1::bigint), ('negociacao', 1::bigint),
           ('aprovada', 1::bigint), ('recusada', 1::bigint)$$,
  'conta cada situação, fora da lixeira'
);

select results_eq(
  $$select situacao::text, quantidade
    from public.contar_orcamentos_por_situacao('c0000000-0000-4000-8000-00000000000a', 'RUIDO')$$,
  $$values ('enviada', 1::bigint)$$,
  'a contagem segue a busca'
);

select results_eq(
  $$select situacao::text, quantidade
    from public.contar_orcamentos_por_situacao('c0000000-0000-4000-8000-00000000000a', null, true)$$,
  $$values ('enviada', 1::bigint)$$,
  'na lixeira, conta a lixeira'
);

-- ---------------------------------------------------------------------------
-- Busca pelo número
-- ---------------------------------------------------------------------------
select results_eq(
  $$select id from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a', 'ORC-2026-014')$$,
  $$values ('f0000000-0000-4000-8000-0000000000f1'::uuid)$$,
  'acha pelo número completo'
);

select results_eq(
  $$select id from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a', ' orc-2025-007 ')$$,
  $$values ('f0000000-0000-4000-8000-0000000000f4'::uuid)$$,
  'sem diferença de maiúsculas e espaços'
);

select results_eq(
  $$select id from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a', '2026-013')$$,
  $$values ('f0000000-0000-4000-8000-0000000000f2'::uuid)$$,
  'acha por AAAA-NNN'
);

select results_eq(
  $$select id from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a', '012')$$,
  $$values ('f0000000-0000-4000-8000-0000000000f3'::uuid)$$,
  'acha só pelo NNN'
);

select results_eq(
  $$select id from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a', 'ORC-2026-1014')$$,
  $$values ('f0000000-0000-4000-8000-0000000000f5'::uuid)$$,
  'sequência acima de 999 aparece inteira'
);

select results_eq(
  $$select count(*) from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a', 'horizonte')$$,
  $$values (5::bigint)$$,
  'continua achando pelo empreendimento'
);

select results_eq(
  $$select count(*) from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a', '2026_0%')$$,
  $$values (0::bigint)$$,
  'curinga do LIKE na busca é texto, não padrão'
);

-- ---------------------------------------------------------------------------
-- Indicadores do topo
-- ---------------------------------------------------------------------------
select results_eq(
  $$select * from public.resumo_dos_orcamentos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values (1::bigint, 2::bigint, 160000::bigint, 1::bigint, 1::bigint, 80000::bigint, 0::bigint)$$,
  'rascunhos; enviada + em negociação, só a com preço na soma; aprovados; lixeira fora'
);

select results_eq(
  $$select total_centavos from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a',
      null, 50, 0, false, 'aprovada')$$,
  $$values (80000::bigint)$$,
  'a lista mostra o mesmo valor que o resumo soma'
);

-- ---------------------------------------------------------------------------
-- Isolamento
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');
select throws_ok(
  $$select * from public.resumo_dos_orcamentos('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', 'sem_permissao',
  'Equipe (Ana) não lê os indicadores'
);

select results_eq(
  $$select (select count(*) from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a',
              null, 50, 0, false, 'enviada'))
         + (select count(*) from public.contar_orcamentos_por_situacao('c0000000-0000-4000-8000-00000000000a'))$$,
  $$values (0::bigint)$$,
  'Equipe (Ana) não vê lista nem contagem'
);

select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select * from public.resumo_dos_orcamentos('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', 'sem_permissao',
  'Gestão de outra consultoria não lê os indicadores'
);

select results_eq(
  $$select (select count(*) from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a',
              'ORC-2026-014'))
         + (select count(*) from public.contar_orcamentos_por_situacao('c0000000-0000-4000-8000-00000000000a'))$$,
  $$values (0::bigint)$$,
  'Gestão de outra consultoria não vê lista nem contagem'
);

select * from finish();

rollback;
