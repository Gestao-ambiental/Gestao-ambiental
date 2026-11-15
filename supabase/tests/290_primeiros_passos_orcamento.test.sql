-- Primeiros passos do orçamento (ADR-0020): rascunho por consultoria salvo a cada passo, convite
-- dispensado por pessoa e publicação numa transação pela mesma salvar_base_de_custos.
-- Pendências iguais a packages/domain/src/primeiros-passos-orcamento.test.ts.
begin;

select plan(62);

select testes.criar_dados_sinteticos();

-- Passos usados nos testes. Equipe: Eduardo com pró-labore (R$ 10.000 em 160 h), Ana com o custo
-- ainda desconhecido e Bruno por projeto: só o Eduardo entra na média (100,00 ÷ … = 62,50/h).
create temporary table passo (nome text primary key, dados jsonb) on commit drop;
grant select on passo to authenticated;
insert into passo values
  ('equipe', $j${"modo": "equipe", "hora_tecnica_centavos": null, "equipe": [
     {"id": "40000000-0000-4000-8000-0000000029a1", "membro_id": "d0000000-0000-4000-8000-0000000000a1",
      "socio": true, "profissao": "Engenheiro", "tipo_recebimento": "pro_labore",
      "custo_mensal_centavos": 1000000, "horas_disponiveis_mes": 160},
     {"id": "40000000-0000-4000-8000-0000000029a2", "membro_id": "d0000000-0000-4000-8000-0000000000a2",
      "socio": false, "profissao": "Bióloga", "tipo_recebimento": "clt",
      "custo_mensal_centavos": null, "horas_disponiveis_mes": 173},
     {"id": "40000000-0000-4000-8000-0000000029a3", "membro_id": "d0000000-0000-4000-8000-0000000000a3",
      "socio": false, "profissao": null, "tipo_recebimento": "projeto",
      "custo_projeto_centavos": 300000, "horas_projeto": 45, "horas_disponiveis_mes": null}]}$j$),
  ('contas_incompletas', '{"custos_fixos_mensais_centavos": null, "horas_faturaveis_mes": null, "contas": [
     {"descricao": "Aluguel", "valor_centavos": 0}, {"descricao": "Energia", "valor_centavos": null}]}'),
  ('contas', '{"custos_fixos_mensais_centavos": null, "horas_faturaveis_mes": null, "contas": [
     {"descricao": "Aluguel", "valor_centavos": 0}, {"descricao": "Energia", "valor_centavos": 50000}]}'),
  ('precos', $j${"valor_visita_centavos": null, "custo_km_centavos": null, "horas_venda": [
     {"id": "venda-1", "profissao": "Engenheiro", "atividade": "Licenciamento", "unidade": "hora",
      "valor_centavos": 20000, "fonte": "Tabela própria", "minutos_por_unidade": null,
      "minimo_centavos": 50000, "faixas": []},
     {"id": "venda-2", "profissao": "Bióloga", "atividade": "Campo", "unidade": "ha",
      "valor_centavos": 5000, "fonte": null, "minutos_por_unidade": 90, "minimo_centavos": null,
      "faixas": [{"ate": "100", "valor_centavos": 5000}, {"ate": null, "valor_centavos": 4000}]}]}$j$),
  ('tributos', '{"tributos_pb": 0, "taxas_pb": 0, "taxa_por_cobranca_centavos": 0,
     "taxa_por_assinatura_centavos": null, "margem_desejada_pb": 3000, "margem_minima_pb": 2500,
     "margens_confirmadas": true}'),
  ('tributos_completos', '{"tributos_pb": 0, "taxas_pb": 0, "taxa_por_cobranca_centavos": 0,
     "taxa_por_assinatura_centavos": 0, "margem_desejada_pb": 3000, "margem_minima_pb": 2500,
     "margens_confirmadas": true}');

-- ---------------------------------------------------------------------------
-- Quem pode
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');
select throws_ok(
  $$select public.obter_rascunho_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', 'sem_permissao', 'Equipe não lê o rascunho');
select throws_ok(
  $$select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 0, 5, '{}', 6, 0)$$,
  '42501', 'sem_permissao', 'Equipe não salva passo');
select throws_ok(
  $$select public.dispensar_convite_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', 'sem_permissao', 'Equipe não dispensa convite de configuração');

select testes.autenticar_como_anonimo();
select throws_ok(
  $$select public.obter_rascunho_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', null, 'sem login não executa a RPC');

select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select public.obter_rascunho_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', 'sem_permissao', 'Gestão de outra consultoria não lê o rascunho');
select throws_ok(
  $$select public.publicar_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 1)$$,
  '42501', 'sem_permissao', 'Gestão de outra consultoria não publica');

-- ---------------------------------------------------------------------------
-- Leitura inicial e validação de cada passo
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');
select is(
  public.obter_rascunho_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a'),
  '{"rascunho": null, "dispensado": false, "base_configurada": false, "base_row_version": 0}'::jsonb,
  'sem rascunho, sem base e convite visível; ler não cria nada');
select is((select count(*) from public.orcamento_configuracao_rascunho), 0::bigint,
  'a leitura não grava rascunho');

select throws_ok(
  $$select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 0, 1,
      (select dados from passo where nome = 'equipe'), 2, 3)$$,
  'P0001', 'base_alterada', 'criação parte da versão da base que a tela leu');
select throws_ok(
  $$select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 0, 1,
      (select dados || '{"salario_secreto": 1}' from passo where nome = 'equipe'), 2, 0)$$,
  '22023', 'dados_invalidos', 'chave desconhecida no passo é recusada');
select throws_ok(
  $$select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 0, 1,
      jsonb_set((select dados from passo where nome = 'equipe'), '{equipe,0,membro_id}',
                '"d0000000-0000-4000-8000-0000000000b1"'), 2, 0)$$,
  '22023', 'dados_invalidos', 'membro de outra consultoria não entra na equipe do rascunho');
select throws_ok(
  $$select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 0, 1,
      jsonb_set((select dados from passo where nome = 'equipe'), '{equipe,1,membro_id}',
                '"d0000000-0000-4000-8000-0000000000a1"'), 2, 0)$$,
  '22023', 'dados_invalidos', 'a mesma pessoa não entra duas vezes');
select throws_ok(
  $$select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 0, 1,
      jsonb_set((select dados from passo where nome = 'equipe'), '{equipe,0,custo_mensal_centavos}',
                '"10.000"'), 2, 0)$$,
  '22023', 'dados_invalidos', 'valor em reais precisa ser número de centavos');
select throws_ok(
  $$select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 0, 1,
      jsonb_set((select dados from passo where nome = 'equipe'), '{equipe,0,horas_disponiveis_mes}',
                '800'), 2, 0)$$,
  '22023', 'dados_invalidos', 'mais de 744 horas no mês é recusado');
select throws_ok(
  $$select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 0, 3,
      jsonb_set((select dados from passo where nome = 'precos'), '{horas_venda,0,valor_centavos}',
                'null'), 4, 0)$$,
  '22023', 'dados_invalidos', 'linha de preço sem preço digitado não é salva como zero');
select throws_ok(
  $$select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 0, 5,
      '{"razao_social": "X"}', 6, 0)$$,
  '22023', 'dados_invalidos', 'o passo 5 não guarda dados da proposta no rascunho');
select throws_ok(
  $$select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 0, 6,
      '{}', 6, 0)$$,
  '22023', 'dados_invalidos', 'o resumo não é um passo salvo');

-- ---------------------------------------------------------------------------
-- Salvar a cada passo: nulo e zero, versões, repetição
-- ---------------------------------------------------------------------------
select is(
  (public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 0, 1,
     (select dados from passo where nome = 'equipe'), 2, 0, 'f0000000-0000-4000-8000-000000000001')
   ->> 'row_version')::integer,
  1, 'cria o rascunho no primeiro passo');
select is(
  public.obter_rascunho_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a')
    #> '{rascunho,dados,passo_1,equipe,1,custo_mensal_centavos}',
  'null'::jsonb, 'custo desconhecido continua nulo');
select is(
  (public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 0, 1,
     (select dados from passo where nome = 'equipe'), 2, 0, 'f0000000-0000-4000-8000-000000000001')
   ->> 'row_version')::integer,
  1, 'repetir a criação (mesma operação) não grava de novo');
select throws_ok(
  $$select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 0, 1,
      (select dados from passo where nome = 'equipe'), 2, 0, 'f0000000-0000-4000-8000-000000000002')$$,
  'P0001', 'conflito_de_versao', 'outra criação com o rascunho já existente é conflito');

-- "Continuar depois": salva o passo 2 incompleto e retoma no próprio passo 2.
select is(
  public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 1, 2,
    (select dados from passo where nome = 'contas_incompletas'), 2, 0,
    'f0000000-0000-4000-8000-000000000003') - 'dados' - 'pendencias',
  '{"etapa": 2, "row_version": 2, "base_row_version": 0}'::jsonb,
  'salvar e continuar depois mantém a pessoa no mesmo passo');
select is(
  public.obter_rascunho_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a')
    #> '{rascunho,dados,passo_2,contas}',
  '[{"descricao": "Aluguel", "valor_centavos": 0}, {"descricao": "Energia", "valor_centavos": null}]'::jsonb,
  'zero digitado fica zero; conta sem valor fica nula');
select is(
  public.obter_rascunho_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a')
    #> '{rascunho,pendencias}',
  '["contas", "precos", "tributos", "taxas", "margens"]'::jsonb,
  'pendências: conta sem valor e passos 3 e 4 ainda não salvos');
select throws_ok(
  $$select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 1, 2,
      (select dados from passo where nome = 'contas'), 3, 0)$$,
  'P0001', 'conflito_de_versao', 'gravação com versão velha é recusada');
select throws_ok(
  $$select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 2, 2,
      (select dados from passo where nome = 'contas'), 3, 0, 'f0000000-0000-4000-8000-000000000003')$$,
  '22023', 'operacao_invalida', 'a mesma operação não aceita outro conteúdo');
select throws_ok(
  $$select public.publicar_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 2)$$,
  '22023', 'configuracao_incompleta', 'não publica com pendências');
select is((select count(*) from public.orcamento_base_custos
           where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'), 0::bigint,
  'nada vale enquanto o rascunho está incompleto');

-- ---------------------------------------------------------------------------
-- RLS e preferência por pessoa
-- ---------------------------------------------------------------------------
select is((select count(*) from public.orcamento_configuracao_rascunho), 1::bigint,
  'a Gestão da consultoria lê o rascunho pela tabela');
select testes.autenticar_como('gustavo@verdesul.test');
select is((select count(*) from public.orcamento_configuracao_rascunho), 0::bigint,
  'Gestão de outra consultoria lê zero linhas');
select testes.autenticar_como('ana@filtroville.test');
select is((select count(*) from public.orcamento_configuracao_rascunho), 0::bigint,
  'Equipe lê zero linhas do rascunho');

select testes.autenticar_como('eduardo@filtroville.test');
select lives_ok(
  $$select public.dispensar_convite_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a')$$,
  'Gestão dispensa o convite');
select is(
  (public.obter_rascunho_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a') ->> 'dispensado')::boolean,
  true, 'a escolha fica guardada para quem dispensou');

-- Bruno passa a ser da Gestão: continua o mesmo rascunho, mas o convite dele não foi dispensado.
reset role;
update public.membro set papel = 'gestao' where id = 'd0000000-0000-4000-8000-0000000000a3';
select testes.autenticar_como('bruno@filtroville.test');
select is(
  (public.obter_rascunho_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a') ->> 'dispensado')::boolean,
  false, 'outra pessoa da Gestão ainda vê o convite');
select is((select count(*) from public.orcamento_configuracao_preferencia), 0::bigint,
  'ninguém lê a escolha de outra pessoa');
select is(
  (public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 2, 2,
     (select dados from passo where nome = 'contas'), 3, 0) ->> 'row_version')::integer,
  3, 'outra pessoa da Gestão retoma o rascunho com a versão atual');
select is(
  public.obter_rascunho_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a') #>> '{rascunho,atualizado_por_nome}',
  'Bruno Tavares', 'a leitura diz quem salvou por último');
select is(
  (public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 3, 3,
     (select dados from passo where nome = 'precos'), 4, 0) ->> 'row_version')::integer,
  4, 'salva a tabela de preços com faixas e mínimo');
select is(
  public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 4, 4,
    (select dados from passo where nome = 'tributos'), 5, 0) -> 'pendencias',
  '["taxas"]'::jsonb, 'taxa por documento não informada continua pendente, não vira zero');

-- Auditoria sem conteúdo financeiro.
reset role;
select is(
  (select count(*) from public.auditoria
   where entidade = 'orcamento_configuracao_rascunho'
     and (coalesce(antes, '{}') ?| array['dados', 'ultimo_payload']
          or coalesce(depois, '{}') ?| array['dados', 'ultimo_payload']
          or coalesce(antes::text, '') || coalesce(depois::text, '') like '%1000000%')),
  0::bigint, 'a auditoria do rascunho não guarda remuneração nem conteúdo');
select ok(
  (select count(*) from public.auditoria where entidade = 'orcamento_configuracao_rascunho') >= 4,
  'cada gravação do rascunho fica auditada');

-- ---------------------------------------------------------------------------
-- Publicação pela equipe
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');
select is(
  (public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 5, 4,
     (select dados from passo where nome = 'tributos_completos'), 5, 0) -> 'pendencias'),
  '[]'::jsonb, 'com tudo informado, nada falta');
select is(
  (public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 6, 5,
     '{}', 6, 0) ->> 'etapa')::integer,
  6, 'o passo 5 (proposta) só avança para o resumo');
select throws_ok(
  $$select public.publicar_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 6)$$,
  'P0001', 'conflito_de_versao', 'publicar com versão velha do rascunho é recusado');
select is(public.publicar_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 7), 1,
  'publica e devolve a versão da base');
select results_eq(
  $$select hora_tecnica_centavos, horas_faturaveis_mes, custos_fixos_mensais_centavos,
           valor_visita_centavos, custo_km_centavos, tributos_pb, taxa_por_assinatura_centavos
    from public.orcamento_base_custos where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'$$,
  $$values (6250::bigint, 160.00::numeric, 50000::bigint, 0::bigint, 0::bigint, 0, 0::bigint)$$,
  'hora e horas pela equipe (10.000 ÷ 160 h), contas somadas, zeros digitados, visita não cadastrada');
select is(
  (select array_agg(custo_mensal_centavos order by ordem) from public.orcamento_base_equipe
   where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  array[1000000, null, null]::bigint[], 'custo desconhecido da equipe continua nulo na base');
select is(
  (select horas_venda #> '{1,faixas}' from public.orcamento_base_custos
   where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  '[{"ate": 100.0000, "valor_centavos": 5000}, {"ate": null, "valor_centavos": 4000}]'::jsonb,
  'faixas da tabela de preços chegam à base');
select is(
  public.obter_rascunho_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a')
    - 'dispensado',
  '{"rascunho": null, "base_configurada": true, "base_row_version": 1}'::jsonb,
  'depois de publicar, o rascunho some e a base está configurada');

-- ---------------------------------------------------------------------------
-- Reabrir com base existente: preserva o que o fluxo não edita; conflito com Custos e taxas
-- ---------------------------------------------------------------------------
reset role;
update public.orcamento_base_custos set piso_hora_centavos = 7000
where consultoria_id = 'c0000000-0000-4000-8000-00000000000a';
select testes.autenticar_como('eduardo@filtroville.test');
select throws_ok(
  $$select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 0, 1,
      (select dados from passo where nome = 'equipe'), 2, 0)$$,
  'P0001', 'base_alterada', 'com base publicada, o rascunho parte da versão dela');
select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 0, 1,
  '{"modo": "manual", "equipe": [], "hora_tecnica_centavos": 9500}', 2, 1);
select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 1, 2,
  '{"custos_fixos_mensais_centavos": 960000, "horas_faturaveis_mes": 120.5, "contas": []}', 3, 1);
select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 2, 3,
  (select jsonb_set(dados, '{valor_visita_centavos}', '15000') from passo where nome = 'precos'), 4, 1);
select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 3, 4,
  (select dados from passo where nome = 'tributos_completos'), 6, 1);

-- Custos e taxas salva enquanto o rascunho existe: a publicação não sobrescreve.
select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a', 9000, 1000, 100,
  3000, 2500, 600, 0, 0, 0, '[]'::jsonb, '[]'::jsonb, 0, 0, '[]'::jsonb, 7000);
select throws_ok(
  $$select public.publicar_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 4)$$,
  'P0001', 'base_alterada', 'base salva em Custos e taxas depois do rascunho é conflito');
select results_eq(
  $$select hora_tecnica_centavos, tributos_pb, row_version from public.orcamento_base_custos
    where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'$$,
  $$values (9000::bigint, 600, 2)$$,
  'o conflito preserva o que foi salvo em Custos e taxas');
select throws_ok(
  $$select public.descartar_rascunho_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 3)$$,
  'P0001', 'conflito_de_versao', 'descartar exige a versão atual do rascunho');
select lives_ok(
  $$select public.descartar_rascunho_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 4)$$,
  'descarta para recomeçar dos valores atuais');
select lives_ok(
  $$select public.descartar_rascunho_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 4)$$,
  'descartar de novo não dá erro');

-- Recomeça da versão 2, sem equipe (custo da hora digitado), e publica.
select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 0, 1,
  '{"modo": "manual", "equipe": [], "hora_tecnica_centavos": 9500}', 2, 2);
select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 1, 2,
  '{"custos_fixos_mensais_centavos": 960000, "horas_faturaveis_mes": 120.5, "contas": []}', 3, 2);
select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 2, 3,
  (select jsonb_set(dados, '{valor_visita_centavos}', '15000') from passo where nome = 'precos'), 4, 2);
select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 3, 4,
  '{"tributos_pb": 9000, "taxas_pb": 1000, "taxa_por_cobranca_centavos": 199,
    "taxa_por_assinatura_centavos": 400, "margem_desejada_pb": 3000, "margem_minima_pb": 2500,
    "margens_confirmadas": true}', 6, 2);
select throws_ok(
  $$select public.publicar_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 4)$$,
  '22023', 'percentuais_invalidos', 'a publicação usa as mesmas validações de Custos e taxas');
select is((select row_version from public.orcamento_configuracao_rascunho), 4,
  'falha na publicação desfaz tudo e mantém o rascunho');
select public.salvar_passo_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 4, 4,
  '{"tributos_pb": 600, "taxas_pb": 0, "taxa_por_cobranca_centavos": 199,
    "taxa_por_assinatura_centavos": 400, "margem_desejada_pb": 3000, "margem_minima_pb": 2500,
    "margens_confirmadas": true}', 6, 2);
select is(public.publicar_configuracao_orcamento('c0000000-0000-4000-8000-00000000000a', 5), 3,
  'publica com o custo da hora digitado');
select results_eq(
  $$select hora_tecnica_centavos, horas_faturaveis_mes, valor_visita_centavos, piso_hora_centavos,
           tributos_pb, (select count(*) from public.orcamento_base_equipe as e
                         where e.consultoria_id = b.consultoria_id)
    from public.orcamento_base_custos as b where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'$$,
  $$values (9500::bigint, 120.50::numeric, 15000::bigint, 7000::bigint, 600, 0::bigint)$$,
  'sem equipe valem a hora e as horas digitadas; visita informada e piso da base preservados');

-- ---------------------------------------------------------------------------
-- Mesmas pendências do domínio (primeiros-passos-orcamento.test.ts)
-- ---------------------------------------------------------------------------
reset role;
select is(
  private.pendencias_da_configuracao('{}'),
  array['equipe', 'horas', 'contas', 'precos', 'tributos', 'taxas', 'margens'],
  'sem nada salvo, falta tudo');
select is(
  private.pendencias_da_configuracao($j${"passo_1": {"modo": "equipe", "hora_tecnica_centavos": null,
    "equipe": [{"id": "x", "membro_id": "y", "socio": false, "tipo_recebimento": "diaria",
                "custo_diaria_centavos": 40000, "horas_por_diaria": 8, "dias_no_mes": null}]},
    "passo_2": {"custos_fixos_mensais_centavos": 0, "contas": [], "horas_faturaveis_mes": null}}$j$),
  array['equipe', 'precos', 'tributos', 'taxas', 'margens'],
  'diária sem dias no mês não forma a média; total das contas 0 digitado vale');
select is(
  private.pendencias_da_configuracao($j${"passo_1": {"modo": "manual", "equipe": [], "hora_tecnica_centavos": 0},
    "passo_2": {"custos_fixos_mensais_centavos": null, "contas": [], "horas_faturaveis_mes": 0},
    "passo_4": {"tributos_pb": 0, "taxas_pb": 0, "taxa_por_cobranca_centavos": 0,
                "taxa_por_assinatura_centavos": 0, "margem_desejada_pb": 3000,
                "margem_minima_pb": 2500, "margens_confirmadas": false}}$j$),
  array['equipe', 'horas', 'contas', 'precos', 'margens'],
  'custo da hora e horas zerados faltam; margens sem confirmação faltam');

select * from finish();
rollback;
