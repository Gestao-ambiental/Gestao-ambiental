-- Importar planilha (ADR-0043), parte 1: estrutura, quem pode, criar e enviar (idempotência, lote,
-- CPF, limpeza dos dados) e os códigos da conferência. Duplicidade é aviso, nunca erro. Outra
-- consultoria e a Equipe veem zero linhas e recebem sem_permissao; anon não executa nada.
begin;

set local timezone to 'America/Sao_Paulo';

select plan(46);

select testes.criar_dados_sinteticos();

select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

-- ---------------------------------------------------------------------------
-- Cenário (como dono das tabelas), consultoria A:
--   E1 "Metalúrgica Açores" (cliente Grupo Açoriano), uma unidade e a LAO 100/2020 do IMA ativa;
--   E2 "Padaria Central" com duas unidades; E3a e E3b "Posto Duplo" (Rede X), ambíguos;
--   E4 "Cerâmica Sul" (Grupo A). Consultoria B: uma licença em rascunho (para a FK composta).
-- ---------------------------------------------------------------------------
insert into public.cliente (id, consultoria_id, nome) values
  ('72000000-0000-4000-8000-0000000000c1', 'c0000000-0000-4000-8000-00000000000a', 'Grupo Açoriano'),
  ('72000000-0000-4000-8000-0000000000c2', 'c0000000-0000-4000-8000-00000000000a', 'Rede X'),
  ('72000000-0000-4000-8000-0000000000c3', 'c0000000-0000-4000-8000-00000000000a', 'Grupo A');

insert into public.empreendimento (id, consultoria_id, nome, cliente_id, criado_por) values
  ('72000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a', 'Metalúrgica Açores',
   '72000000-0000-4000-8000-0000000000c1', 'd0000000-0000-4000-8000-0000000000a1'),
  ('72000000-0000-4000-8000-0000000000e2', 'c0000000-0000-4000-8000-00000000000a', 'Padaria Central',
   null, 'd0000000-0000-4000-8000-0000000000a1'),
  ('72000000-0000-4000-8000-0000000000e3', 'c0000000-0000-4000-8000-00000000000a', 'Posto Duplo',
   '72000000-0000-4000-8000-0000000000c2', 'd0000000-0000-4000-8000-0000000000a1'),
  ('72000000-0000-4000-8000-0000000000e4', 'c0000000-0000-4000-8000-00000000000a', 'Posto Duplo',
   '72000000-0000-4000-8000-0000000000c2', 'd0000000-0000-4000-8000-0000000000a1'),
  ('72000000-0000-4000-8000-0000000000e5', 'c0000000-0000-4000-8000-00000000000a', 'Cerâmica Sul',
   '72000000-0000-4000-8000-0000000000c3', 'd0000000-0000-4000-8000-0000000000a1'),
  ('72000000-0000-4000-8000-0000000000eb', 'c0000000-0000-4000-8000-00000000000b', 'Fábrica Verde Sul',
   null, 'd0000000-0000-4000-8000-0000000000b1');

insert into public.unidade (id, consultoria_id, empreendimento_id, nome) values
  ('72000000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
   '72000000-0000-4000-8000-0000000000e1', 'Matriz'),
  ('72000000-0000-4000-8000-0000000000f2', 'c0000000-0000-4000-8000-00000000000a',
   '72000000-0000-4000-8000-0000000000e2', 'Loja 1'),
  ('72000000-0000-4000-8000-0000000000f3', 'c0000000-0000-4000-8000-00000000000a',
   '72000000-0000-4000-8000-0000000000e2', 'Loja 2'),
  ('72000000-0000-4000-8000-0000000000fb', 'c0000000-0000-4000-8000-00000000000b',
   '72000000-0000-4000-8000-0000000000eb', 'Fábrica');

insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, tipo_id, numero, orgao, situacao,
                                emitido_em, marco, validade, criado_por, ativado_em, ativado_por, chave_ativacao)
select '72000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-00000000000a',
       '72000000-0000-4000-8000-0000000000e1', '72000000-0000-4000-8000-0000000000f1', t.id, '100/2020', 'IMA',
       'ativo', current_setting('testes.hoje')::date - 300, 'emissao', current_setting('testes.hoje')::date + 300,
       'd0000000-0000-4000-8000-0000000000a1', now(), 'd0000000-0000-4000-8000-0000000000a1', gen_random_uuid()
from public.tipo_instrumento as t
where t.consultoria_id = 'c0000000-0000-4000-8000-00000000000a' and t.sigla = 'LAO';

insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, criado_por) values
  ('72000000-0000-4000-8000-0000000000b1', 'c0000000-0000-4000-8000-00000000000b',
   '72000000-0000-4000-8000-0000000000eb', '72000000-0000-4000-8000-0000000000fb',
   'd0000000-0000-4000-8000-0000000000b1');

-- Dados de uma linha de licença, já normalizados como o navegador manda.
create function pg_temp.dl(emp text, cli text, uni text, tipo text, num text, org text, emi date, val date,
                           extra jsonb default '{}'::jsonb)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'empreendimento', emp, 'cliente', cli, 'cnpj', null, 'unidade', uni, 'endereco', null,
    'tipo', tipo, 'numero', num, 'orgao', org,
    'emitido_em', emi::text, 'emitido_em_texto', to_char(emi, 'DD/MM/YYYY'),
    'validade', val::text, 'validade_texto', to_char(val, 'DD/MM/YYYY'),
    'descartados', '[]'::jsonb) || extra
$$;

-- ---------------------------------------------------------------------------
-- Estrutura e permissões
-- ---------------------------------------------------------------------------
select is(
  (select array_agg(p.polname::text order by p.polname::text) from pg_catalog.pg_policy as p
   where p.polrelid in ('public.importacao'::regclass, 'public.importacao_linha'::regclass,
                        'public.importacao_mapeamento'::regclass)),
  array['importacao_linha_select_gestao', 'importacao_mapeamento_select_gestao', 'importacao_select_gestao'],
  'as três tabelas novas têm só a política de leitura da Gestão'
);

select ok(
  has_function_privilege('authenticated', 'public.criar_importacao(uuid, uuid, text, text, integer, jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.enviar_linhas_da_importacao(uuid, jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.conferir_importacao(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.efetivar_importacao(uuid, integer, boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.desfazer_importacao(uuid, integer)', 'execute')
  and not has_function_privilege('anon', 'public.criar_importacao(uuid, uuid, text, text, integer, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.efetivar_importacao(uuid, integer, boolean)', 'execute'),
  'as cinco RPCs: authenticated executa, anon não'
);

select ok(
  not has_function_privilege('authenticated', 'private.conferir_linhas_da_importacao(uuid)', 'execute')
  and not has_function_privilege('authenticated',
    'private.referencias_externas(regclass, uuid, uuid, regclass[])', 'execute')
  and not has_function_privilege('authenticated', 'private.limpar_dados_da_importacao(text, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'private.recusar_pai_excluido()', 'execute'),
  'os helpers privados da importação ficam fora do alcance de authenticated'
);

select ok(
  (select bool_and(t.tgname is not null)
   from unnest(array['public.importacao', 'public.importacao_linha', 'public.importacao_mapeamento']::regclass[]) as r (tabela)
   left join pg_catalog.pg_trigger as t on t.tgrelid = r.tabela and t.tgname = '_comercial_somente_leitura')
  and exists (select 1 from pg_catalog.pg_trigger as t
              where t.tgrelid = 'public.importacao'::regclass and t.tgname = 'importacao_auditar'),
  'barreira comercial nas três tabelas e auditoria na importação'
);

-- ---------------------------------------------------------------------------
-- criar_importacao
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');

select is(
  public.criar_importacao('72000000-0000-4000-8000-000000000a01', 'c0000000-0000-4000-8000-00000000000a',
    'licenca', 'carteira.xlsx', 15,
    '{"empreendimento": "Empreendimento", "validade": "Vencimento", "cpf": "CPF do dono",
      "numero": 12, "orgao": ""}'::jsonb),
  '72000000-0000-4000-8000-000000000a01'::uuid,
  'a Gestão cria a importação'
);

select is(
  public.criar_importacao('72000000-0000-4000-8000-000000000a01', 'c0000000-0000-4000-8000-00000000000a',
    'licenca', 'outro.xlsx', 3, '{"tipo": "Tipo"}'::jsonb),
  '72000000-0000-4000-8000-000000000a01'::uuid,
  'criar de novo com o mesmo id devolve o id'
);

select results_eq(
  $$select i.nome_arquivo, i.total_linhas, i.mapeamento, m.mapeamento, m.row_version
    from public.importacao as i
    join public.importacao_mapeamento as m on m.consultoria_id = i.consultoria_id and m.entidade = i.entidade
    where i.id = '72000000-0000-4000-8000-000000000a01'$$,
  $$values ('carteira.xlsx', 15, '{"empreendimento": "Empreendimento", "validade": "Vencimento"}'::jsonb,
            '{"empreendimento": "Empreendimento", "validade": "Vencimento"}'::jsonb, 1)$$,
  'repetir não muda nada; o mapeamento guarda só campos conhecidos com cabeçalho em texto'
);

select public.criar_importacao('72000000-0000-4000-8000-000000000a02', 'c0000000-0000-4000-8000-00000000000a',
  'licenca', 'segunda.csv', 2, '{"numero": "Nº", "orgao": "Órgão"}'::jsonb);

select results_eq(
  $$select m.mapeamento, m.row_version, (select count(*)::integer from public.importacao_mapeamento)
    from public.importacao_mapeamento as m
    where m.consultoria_id = 'c0000000-0000-4000-8000-00000000000a' and m.entidade = 'licenca'$$,
  $$values ('{"numero": "Nº", "orgao": "Órgão"}'::jsonb, 2, 1)$$,
  'o mapeamento é lembrado por consultoria e entidade (upsert, row_version soma 1)'
);

select throws_ok(
  $$select public.criar_importacao(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a', 'alvara', 'a.xlsx', 1, '{}')$$,
  '22023', 'entidade_invalida', 'entidade fora de empreendimento e licença: recusa');
select throws_ok(
  $$select public.criar_importacao(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a', 'licenca', 'a.xlsx', 0, '{}')$$,
  '22023', 'planilha_vazia', 'planilha sem linhas: recusa');
select throws_ok(
  $$select public.criar_importacao(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a', 'licenca', 'a.xlsx', 1001, '{}')$$,
  '22023', 'linhas_demais', 'mais de 1.000 linhas: recusa');
select throws_ok(
  $$select public.criar_importacao(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a', 'licenca', 'a.xlsx', 1, '[]')$$,
  '22023', 'mapeamento_invalido', 'mapeamento que não é objeto: recusa');
select throws_ok(
  $$select public.criar_importacao(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a', 'licenca', '  ', 1, '{}')$$,
  '22023', 'nome_obrigatorio', 'nome do arquivo vazio: recusa');
select throws_ok(
  $$select public.criar_importacao(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a', 'licenca',
    'licencas 529.982.247-25.xlsx', 1, '{}')$$,
  '22023', 'cpf_nao_aceito', 'nome do arquivo com CPF: recusa');
select throws_ok(
  $$select public.criar_importacao(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a', 'licenca', 'a.xlsx', 1,
    '{"empreendimento": "529.982.247-25"}')$$,
  '22023', 'cpf_nao_aceito', 'cabeçalho com CPF no mapeamento (planilha sem cabeçalho): recusa');
select is(
  (select count(*)::integer from public.importacao as i where i.nome_arquivo like '%529%'
     or i.mapeamento::text like '%529%'),
  0, 'a importação recusada por CPF não grava nada');

-- ---------------------------------------------------------------------------
-- enviar_linhas_da_importacao
-- ---------------------------------------------------------------------------
reset role;
select set_config('testes.lote_grande',
  (select jsonb_agg(jsonb_build_object('numero_linha', n, 'dados', '{}'::jsonb)) from generate_series(2, 202) as n)::text,
  true);
select set_config('testes.lote_cpf', jsonb_build_array(
  jsonb_build_object('numero_linha', 2, 'dados', pg_temp.dl('Nova Fábrica', null, 'Galpão', 'LAO', '1', 'IMA',
    current_setting('testes.hoje')::date - 10, current_setting('testes.hoje')::date + 300)),
  jsonb_build_object('numero_linha', 3, 'dados', pg_temp.dl('Nova Fábrica', null, 'Galpão', 'LAO', '2', 'IMA',
    current_setting('testes.hoje')::date - 10, current_setting('testes.hoje')::date + 300,
    '{"endereco": "Dono 123.456.789-09"}')))::text, true);
select set_config('testes.lote_cpf_cnpj', jsonb_build_array(
  jsonb_build_object('numero_linha', 2, 'dados', pg_temp.dl('Nova Fábrica', null, null, 'LAO', '1', 'IMA',
    current_setting('testes.hoje')::date - 10, current_setting('testes.hoje')::date + 300,
    '{"cnpj": "123.456.789/09"}')))::text, true);
select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.enviar_linhas_da_importacao('72000000-0000-4000-8000-000000000a01',
      current_setting('testes.lote_grande')::jsonb)$$,
  '22023', 'lote_grande_demais', 'lote de 201 linhas: recusa');

select throws_ok(
  $$select public.enviar_linhas_da_importacao('72000000-0000-4000-8000-000000000a01',
      current_setting('testes.lote_cpf')::jsonb)$$,
  '22023', 'cpf_nao_aceito', 'valor no formato de CPF em qualquer campo: recusa o lote');
select throws_ok(
  $$select public.enviar_linhas_da_importacao('72000000-0000-4000-8000-000000000a01',
      current_setting('testes.lote_cpf_cnpj')::jsonb)$$,
  '22023', 'cpf_nao_aceito', 'CNPJ com 11 dígitos é CPF: recusa o lote');
select is(
  (select count(*)::integer from public.importacao_linha
   where importacao_id = '72000000-0000-4000-8000-000000000a01'),
  0,
  'lote recusado por CPF não grava nenhuma linha (nem as boas)'
);

select throws_ok(
  $$select public.enviar_linhas_da_importacao('72000000-0000-4000-8000-000000000a01',
      '[{"numero_linha": 2, "dados": {}}, {"numero_linha": 2, "dados": {}}]')$$,
  '22023', 'linha_invalida', 'número de linha repetido no lote: recusa');
select throws_ok(
  $$select public.enviar_linhas_da_importacao('72000000-0000-4000-8000-000000000a01',
      '[{"numero_linha": 1, "dados": {}}]')$$,
  '22023', 'linha_invalida', 'linha 1 é o cabeçalho: recusa');

select is(
  public.enviar_linhas_da_importacao('72000000-0000-4000-8000-000000000a02',
    '[{"numero_linha": 2, "dados": {"empreendimento": "  Nova   Fábrica ", "cnpj": "12.345.678/0001-90",
       "senha": "x", "cpf_do_dono": "nada", "tipo": "", "numero": 7, "descartados": ["cliente", "outro", "cliente"]}}]'),
  1,
  'enviar devolve o total de linhas recebidas'
);
select is(
  (select dados from public.importacao_linha where importacao_id = '72000000-0000-4000-8000-000000000a02'),
  '{"empreendimento": "Nova   Fábrica", "cliente": null, "cnpj": "12345678000190", "unidade": null,
    "endereco": null, "tipo": null, "numero": "7", "orgao": null, "emitido_em": null, "emitido_em_texto": null,
    "validade": null, "validade_texto": null, "descartados": ["cliente"]}'::jsonb,
  'o banco limpa os dados: só chaves conhecidas, texto aparado, vazio nulo, CNPJ normalizado'
);

select throws_ok(
  $$select public.conferir_importacao('72000000-0000-4000-8000-000000000a02')$$,
  'P0001', 'linhas_incompletas', 'conferir com menos linhas que o total: recusa (1/2)');
select throws_ok(
  $$select public.enviar_linhas_da_importacao('72000000-0000-4000-8000-000000000a02',
      '[{"numero_linha": 3, "dados": {}}, {"numero_linha": 4, "dados": {}}]')$$,
  '22023', 'linhas_demais', 'mais linhas que o total anunciado: recusa');

-- ---------------------------------------------------------------------------
-- Conferência: códigos por linha
-- ---------------------------------------------------------------------------
reset role;
select set_config('testes.lote', (
  with h as (select current_setting('testes.hoje')::date as d)
  select jsonb_agg(jsonb_build_object('numero_linha', x.n, 'dados', x.dados) order by x.n)
  from h cross join lateral (values
    (2, pg_temp.dl('Metalúrgica Açores', 'Grupo Açoriano', null, 'LAO', '200/2024', 'IMA', h.d - 10, h.d + 700)),
    (3, pg_temp.dl('Metalurgica Acores', 'grupo açoriano', null, 'lao', '100/2020', 'ima', h.d - 10, h.d + 700)),
    (4, pg_temp.dl('Nova Fábrica', 'Cliente N', 'Galpão', 'LAO', '300/2024', 'IMA', h.d - 10, h.d + 700)),
    (5, pg_temp.dl('Nova Fábrica', 'Cliente N', 'Galpão', 'LAO', ' 300/2024 ', 'IMA', h.d - 10, h.d + 700)),
    (6, pg_temp.dl('Padaria Central', null, null, 'AuA', '1/2025', 'Prefeitura', h.d - 10, h.d + 700)),
    (7, pg_temp.dl('Posto Duplo', 'Rede X', null, 'LAO', '7/2024', 'IMA', h.d - 10, h.d + 700)),
    (8, pg_temp.dl('Cerâmica Sul', 'Grupo B', null, 'Licença Ambiental Prévia', '8/2024', 'IMA', h.d - 10, h.d + 700)),
    (9, pg_temp.dl('Nova Fábrica', 'Cliente N', null, 'XYZ', '9/2024', 'IMA', h.d - 10, h.d + 700)),
    (10, pg_temp.dl('Nova Fábrica', 'Cliente N', null, 'LAO', '10/2024', 'IMA', h.d + 5, h.d + 700)),
    (11, pg_temp.dl('Nova Fábrica', 'Cliente N', null, 'LAO', '11/2024', 'IMA', h.d - 10, h.d - 20)),
    (12, pg_temp.dl('Nova Fábrica', 'Cliente N', null, 'LAO', null, 'IMA', h.d - 10, h.d + 700)),
    (13, pg_temp.dl('Nova Fábrica', 'Cliente N', null, 'LAO', '13/2024', 'IMA', h.d - 10, h.d + 700,
                    '{"endereco": "Rua A, 10"}')),
    (14, pg_temp.dl('Nova Fábrica', null, null, 'LAO', '14/2024', 'IMA', h.d - 10, h.d + 700,
                    '{"descartados": ["cliente"]}')),
    (15, pg_temp.dl('Nova Fábrica', 'Cliente N', null, 'LAO', '15/2024', 'IMA', h.d - 800, h.d - 10)),
    (16, pg_temp.dl('Nova Fábrica', 'Cliente N', null, 'LAO', '16/2024', 'IMA', h.d - 10, h.d + 700,
                    '{"emitido_em": null, "emitido_em_texto": "31/02/2024"}'))
  ) as x (n, dados))::text, true);
select testes.autenticar_como('eduardo@filtroville.test');

select is(
  public.enviar_linhas_da_importacao('72000000-0000-4000-8000-000000000a01', current_setting('testes.lote')::jsonb),
  15,
  'as 15 linhas chegam num lote'
);
select is(
  public.enviar_linhas_da_importacao('72000000-0000-4000-8000-000000000a01', current_setting('testes.lote')::jsonb),
  15,
  'o mesmo lote de novo dá o mesmo estado'
);

select set_config('testes.resumo',
  public.conferir_importacao('72000000-0000-4000-8000-000000000a01')::text, true);

select results_eq(
  $$select numero_linha, grupo,
      (select coalesce(array_agg(e.v ->> 'codigo' order by e.o), '{}')
       from jsonb_array_elements(erros) with ordinality as e (v, o)),
      (select coalesce(array_agg(e.v ->> 'codigo' order by e.o), '{}')
       from jsonb_array_elements(avisos) with ordinality as e (v, o))
    from public.importacao_linha
    where importacao_id = '72000000-0000-4000-8000-000000000a01'
    order by numero_linha$$,
  $$values
    (2, 'aviso', '{}'::text[], '{empreendimento_ja_existe}'::text[]),
    (3, 'aviso', '{}', '{licenca_ja_existe,empreendimento_ja_existe}'),
    (4, 'pronta', '{}', '{}'),
    (5, 'aviso', '{}', '{licenca_repetida_na_planilha}'),
    (6, 'erro', '{unidade_ambigua}', '{empreendimento_ja_existe}'),
    (7, 'erro', '{empreendimento_ambiguo}', '{}'),
    (8, 'aviso', '{}', '{empreendimento_parecido}'),
    (9, 'erro', '{tipo_desconhecido}', '{}'),
    (10, 'erro', '{data_futura}', '{}'),
    (11, 'erro', '{validade_antes_da_emissao}', '{licenca_vencida}'),
    (12, 'erro', '{campo_obrigatorio}', '{}'),
    (13, 'erro', '{endereco_sem_unidade}', '{}'),
    (14, 'erro', '{valor_parece_cpf}', '{}'),
    (15, 'aviso', '{}', '{licenca_vencida}'),
    (16, 'erro', '{data_invalida}', '{}')$$,
  'conferir dá os códigos de cada linha; duplicidade (já existe, repetida) é sempre aviso'
);

select is(
  current_setting('testes.resumo')::jsonb - 'row_version' - 'limite',
  '{"total": 15, "prontas": 1, "com_aviso": 5, "com_erro": 9, "puladas": 2,
    "a_criar": {"empreendimentos": 2, "unidades": 3, "licencas": 4}}'::jsonb,
  'o resumo conta grupos, puladas e o que vai ser criado'
);
select is(
  current_setting('testes.resumo')::jsonb -> 'limite' -> 'quantidade',
  '3'::jsonb,
  'limite: 1 empreendimento ativo + 2 que ganham a primeira licença ativa'
);
select is(
  (current_setting('testes.resumo')::jsonb ->> 'row_version')::integer,
  (select row_version from public.importacao where id = '72000000-0000-4000-8000-000000000a01'),
  'o resumo devolve o row_version atual da importação'
);
select is(
  public.conferir_importacao('72000000-0000-4000-8000-000000000a01') - 'row_version',
  current_setting('testes.resumo')::jsonb - 'row_version',
  'conferir de novo dá o mesmo resumo'
);

-- Aba Empreendimentos: "Posto Duplo" (Rede X) já existe duas vezes. É duplicidade: aviso e pulada,
-- nunca erro (na aba Licenças, o ambíguo é erro porque não há onde pôr a licença).
select public.criar_importacao('72000000-0000-4000-8000-000000000a09', 'c0000000-0000-4000-8000-00000000000a',
  'empreendimento', 'empreendimentos.xlsx', 1, '{"empreendimento": "Empreendimento"}'::jsonb);
select public.enviar_linhas_da_importacao('72000000-0000-4000-8000-000000000a09',
  '[{"numero_linha": 2, "dados": {"empreendimento": "Posto Duplo", "cliente": "Rede X"}}]');
select set_config('testes.resumo_emp',
  public.conferir_importacao('72000000-0000-4000-8000-000000000a09')::text, true);
select is(
  (select array[grupo, erros::text, avisos ->> 0]
   from public.importacao_linha where importacao_id = '72000000-0000-4000-8000-000000000a09')
  || array[current_setting('testes.resumo_emp')::jsonb ->> 'puladas'],
  array['aviso', '[]', '{"campo": "empreendimento", "codigo": "empreendimento_ja_existe"}', '1'],
  'aba Empreendimentos: empreendimento que já existe mais de uma vez é aviso (pulada), nunca erro'
);

-- ---------------------------------------------------------------------------
-- Equipe, outra consultoria e anon
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');
select is(
  (select count(*)::integer from public.importacao) + (select count(*)::integer from public.importacao_linha)
  + (select count(*)::integer from public.importacao_mapeamento),
  0,
  'a Equipe vê zero linhas nas três tabelas'
);
select throws_ok(
  $$select public.criar_importacao(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a', 'licenca', 'a.xlsx', 1, '{}')$$,
  '42501', 'sem_permissao', 'a Equipe não cria importação');
select throws_ok(
  $$select public.enviar_linhas_da_importacao('72000000-0000-4000-8000-000000000a01', '[]')$$,
  '42501', 'sem_permissao', 'a Equipe não envia linhas');
select throws_ok(
  $$select public.conferir_importacao('72000000-0000-4000-8000-000000000a01')$$,
  '42501', 'sem_permissao', 'a Equipe não confere');
select throws_ok(
  $$select public.efetivar_importacao('72000000-0000-4000-8000-000000000a01', 1, true)$$,
  '42501', 'sem_permissao', 'a Equipe não efetiva');
select throws_ok(
  $$select public.desfazer_importacao('72000000-0000-4000-8000-000000000a01', 1)$$,
  '42501', 'sem_permissao', 'a Equipe não desfaz');

select testes.autenticar_como('gustavo@verdesul.test');
select is(
  (select count(*)::integer from public.importacao) + (select count(*)::integer from public.importacao_linha)
  + (select count(*)::integer from public.importacao_mapeamento),
  0,
  'a Gestão de outra consultoria vê zero linhas nas três tabelas'
);
select throws_ok(
  $$select public.conferir_importacao('72000000-0000-4000-8000-000000000a01')$$,
  '42501', 'sem_permissao', 'a Gestão de outra consultoria não confere a importação alheia');
select throws_ok(
  $$select public.criar_importacao('72000000-0000-4000-8000-000000000a01', 'c0000000-0000-4000-8000-00000000000b',
      'licenca', 'a.xlsx', 1, '{}')$$,
  'P0001', 'importacao_existente', 'id já usado em outra consultoria: recusa');

select testes.autenticar_como_anonimo();
select throws_ok(
  $$select public.criar_importacao(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a', 'licenca', 'a.xlsx', 1, '{}')$$,
  '42501', null, 'anon não executa as RPCs da importação');

-- ---------------------------------------------------------------------------
-- Escrita direta e FK composta
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');
select throws_ok(
  $$insert into public.importacao_mapeamento (consultoria_id, entidade, mapeamento, atualizado_por)
    values ('c0000000-0000-4000-8000-00000000000a', 'empreendimento', '{}', 'd0000000-0000-4000-8000-0000000000a1')$$,
  '42501', null, 'nem a Gestão escreve direto nas tabelas da importação (só por RPC)');

reset role;
select throws_ok(
  $$insert into public.importacao_linha (consultoria_id, importacao_id, numero_linha, dados, instrumento_id)
    values ('c0000000-0000-4000-8000-00000000000a', '72000000-0000-4000-8000-000000000a01', 999, '{}',
            '72000000-0000-4000-8000-0000000000b1')$$,
  '23503', null, 'FK composta: linha não aponta licença de outra consultoria, mesmo com o UUID');

select * from finish();

rollback;
