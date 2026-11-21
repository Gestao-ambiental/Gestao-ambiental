-- Triagem grava no empreendimento (ADR-0050, L3; LEG-05): município da unidade gravado por qualquer
-- membro ativo, só quando muda, sem revelar unidade de outra consultoria; atividades do
-- empreendimento só pela Gestão, com a mesma validação e o mesmo upsert da licença (nunca apaga,
-- repetir igual não muda nada); a leitura junta as atividades do empreendimento e das licenças
-- dele, e outra consultoria lê zero linhas.
begin;

select plan(69);

select testes.criar_dados_sinteticos();

select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

-- ---------------------------------------------------------------------------
-- Cenário (como dono): A com os empreendimentos E1 (LAO L1) e E2 (LAO L2); B com EB.
-- ---------------------------------------------------------------------------
insert into public.empreendimento (id, consultoria_id, nome, criado_por) values
  ('73200000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a', 'Metalúrgica Rio Cubatão',
   'd0000000-0000-4000-8000-0000000000a1'),
  ('73200000-0000-4000-8000-0000000000e2', 'c0000000-0000-4000-8000-00000000000a', 'Fundição Pirabeiraba',
   'd0000000-0000-4000-8000-0000000000a1'),
  ('73200000-0000-4000-8000-0000000000eb', 'c0000000-0000-4000-8000-00000000000b', 'Posto Rota Sul',
   'd0000000-0000-4000-8000-0000000000b1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome) values
  ('73200000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
   '73200000-0000-4000-8000-0000000000e1', 'Matriz'),
  ('73200000-0000-4000-8000-0000000000f2', 'c0000000-0000-4000-8000-00000000000a',
   '73200000-0000-4000-8000-0000000000e2', 'Matriz'),
  ('73200000-0000-4000-8000-0000000000fb', 'c0000000-0000-4000-8000-00000000000b',
   '73200000-0000-4000-8000-0000000000eb', 'Matriz');

insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, tipo_id, numero, orgao, situacao,
                                assinado_em, marco, validade, criado_por, ativado_em, ativado_por, chave_ativacao)
select x.id, 'c0000000-0000-4000-8000-00000000000a',  x.eid, x.uid,
       (select t.id from public.tipo_instrumento as t
        where t.sigla = 'LAO' and t.consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
       x.numero, 'IMA', 'ativo', current_setting('testes.hoje')::date - 300, 'assinatura',
       current_setting('testes.hoje')::date + 400, 'd0000000-0000-4000-8000-0000000000a1', now(),
       'd0000000-0000-4000-8000-0000000000a1', gen_random_uuid()
from (values
  ('73200000-0000-4000-8000-000000000011'::uuid, '73200000-0000-4000-8000-0000000000e1'::uuid,
   '73200000-0000-4000-8000-0000000000f1'::uuid, '4821/2023'),
  ('73200000-0000-4000-8000-000000000012'::uuid, '73200000-0000-4000-8000-0000000000e2'::uuid,
   '73200000-0000-4000-8000-0000000000f2'::uuid, '77/2024')
) as x (id, eid, uid, numero);

-- Payload base: duas atividades enquadradas.
select set_config('testes.atividades', $$[
  {"codigo": "34.11.00", "descricao": "Fabricação de estruturas metálicas", "porte": "pequeno", "potencial": "M",
   "medidas": {"AU(3)": 1.5}, "fonte": "Resolução CONSEMA 250/2024"},
  {"codigo": "33.10.00", "descricao": "Galvanoplastia", "porte": "medio", "potencial": "G",
   "medidas": {}, "fonte": "Resolução CONSEMA 250/2024"}
]$$, true);

-- ---------------------------------------------------------------------------
-- Estrutura
-- ---------------------------------------------------------------------------
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity from pg_catalog.pg_class as c
   where c.oid = 'public.atividade_do_empreendimento'::regclass),
  'atividade_do_empreendimento tem RLS habilitada e forçada'
);
select is(
  (select array_agg(t.tgname::text order by t.tgname) from pg_catalog.pg_trigger as t
   where t.tgrelid = 'public.atividade_do_empreendimento'::regclass and not t.tgisinternal),
  array['_comercial_somente_leitura', '_suporte_somente_leitura', 'atividade_do_empreendimento_auditar'],
  'auditoria, barreira de suporte e barreira comercial'
);
select is(
  (select encode(t.tgargs, 'escape') from pg_catalog.pg_trigger as t
   where t.tgrelid = 'public.atividade_do_empreendimento'::regclass and t.tgname = '_comercial_somente_leitura'),
  '',
  'a barreira comercial não depende do plano de orçamentos'
);
select is(
  (select coalesce(array_agg(g.grantee::text || ':' || g.privilege_type order by g.grantee, g.privilege_type), '{}')
   from information_schema.role_table_grants as g
   where g.table_schema = 'public' and g.table_name = 'atividade_do_empreendimento'
     and g.grantee in ('anon', 'authenticated')),
  array['authenticated:SELECT'],
  'authenticated só lê; anon nada'
);
select col_is_unique('public', 'atividade_do_empreendimento', array['consultoria_id', 'id'],
  'unique (consultoria_id, id) para FKs compostas');
select is(
  (select array_agg(a.attname::text || ':' || format_type(a.atttypid, a.atttypmod) order by a.attname)
   from pg_catalog.pg_attribute as a
   where a.attrelid = 'public.unidade'::regclass and a.attname like 'municipio%' and not a.attisdropped),
  array['municipio_gravado_em:timestamp with time zone', 'municipio_ibge:text', 'municipio_nome:text'],
  'unidade ganha código IBGE, nome e instante do município'
);
select ok(
  not has_function_privilege('authenticated', 'private.validar_atividades_da_triagem(jsonb)', 'execute'),
  'o validador da triagem só roda dentro da RPC'
);
select isnt_definer('public', 'listar_atividades_do_empreendimento', array['uuid', 'uuid'],
  'listar_atividades_do_empreendimento é security invoker (a RLS decide)');
select isnt_definer('private', 'atividades_do_empreendimento', array['uuid', 'uuid'],
  'private.atividades_do_empreendimento é security invoker (a RLS decide)');

-- ---------------------------------------------------------------------------
-- Município da unidade
-- ---------------------------------------------------------------------------
select testes.autenticar_como('bruno@filtroville.test');
select is(
  public.gravar_municipio_da_unidade('c0000000-0000-4000-8000-00000000000a',
    '73200000-0000-4000-8000-0000000000f1', '4209102', '  Joinville  '),
  true,
  'Equipe (Bruno) grava o município da unidade'
);
select results_eq(
  $$select municipio_ibge, municipio_nome, municipio_gravado_em is not null from public.unidade
    where id = '73200000-0000-4000-8000-0000000000f1'$$,
  $$values ('4209102', 'Joinville', true)$$,
  'a unidade fica com código, nome sem espaços nas pontas e instante'
);
select is(
  public.gravar_municipio_da_unidade('c0000000-0000-4000-8000-00000000000a',
    '73200000-0000-4000-8000-0000000000f1', '4209102', 'Joinville'),
  false,
  'repetir o mesmo município devolve false'
);

select testes.autenticar_como('eduardo@filtroville.test');
select is(
  public.gravar_municipio_da_unidade('c0000000-0000-4000-8000-00000000000a',
    '73200000-0000-4000-8000-0000000000f1', '4202404', 'Blumenau'),
  true,
  'trocar o município devolve true'
);
select results_eq(
  $$select municipio_ibge, municipio_nome from public.unidade where id = '73200000-0000-4000-8000-0000000000f1'$$,
  $$values ('4202404', 'Blumenau')$$,
  'a troca fica gravada'
);

select throws_ok(
  format($$select public.gravar_municipio_da_unidade('c0000000-0000-4000-8000-00000000000a',
      '73200000-0000-4000-8000-0000000000f1', %L, %L)$$, p.codigo, p.nome),
  '22023', 'municipio_invalido',
  'município inválido: ' || p.caso
)
from (values
  ('município de outro estado', '4106902', 'Curitiba'),
  ('código curto', '42091', 'Joinville'),
  ('código com letra', '42O9102', 'Joinville'),
  ('código nulo', null, 'Joinville'),
  ('nome em branco', '4209102', '   '),
  ('nome nulo', '4209102', null),
  ('nome com mais de 120', '4209102', repeat('a', 121))
) as p (caso, codigo, nome);

select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select public.gravar_municipio_da_unidade('c0000000-0000-4000-8000-00000000000a',
      '73200000-0000-4000-8000-0000000000f1', '4209102', 'Joinville')$$,
  '42501', 'sem_permissao',
  'Verde Sul não grava município na Filtroville'
);
select throws_ok(
  $$select public.gravar_municipio_da_unidade('c0000000-0000-4000-8000-00000000000b',
      '73200000-0000-4000-8000-0000000000f1', '4209102', 'Joinville')$$,
  '22023', 'unidade_invalida',
  'unidade de outra consultoria é unidade inválida'
);
select throws_ok(
  $$select public.gravar_municipio_da_unidade('c0000000-0000-4000-8000-00000000000b',
      '73200000-0000-4000-8000-0000000000ff', '4209102', 'Joinville')$$,
  '22023', 'unidade_invalida',
  'unidade inexistente dá o mesmo erro (não revela se existe em outra consultoria)'
);
select is(
  public.gravar_municipio_da_unidade('c0000000-0000-4000-8000-00000000000b',
    '73200000-0000-4000-8000-0000000000fb', '4216602', 'São Francisco do Sul'),
  true,
  'Verde Sul grava o município da própria unidade'
);

select testes.autenticar_como_anonimo();
select throws_ok(
  $$select public.gravar_municipio_da_unidade('c0000000-0000-4000-8000-00000000000a',
      '73200000-0000-4000-8000-0000000000f1', '4209102', 'Joinville')$$,
  '42501', null,
  'anônimo não executa gravar_municipio_da_unidade'
);

reset role;
select results_eq(
  $$select municipio_ibge, municipio_nome from public.unidade where id = '73200000-0000-4000-8000-0000000000f1'$$,
  $$values ('4202404', 'Blumenau')$$,
  'as tentativas recusadas não mudaram a unidade'
);
select throws_ok(
  $$update public.unidade set municipio_ibge = '4209102', municipio_nome = null, municipio_gravado_em = null
    where id = '73200000-0000-4000-8000-0000000000f2'$$,
  '23514', null,
  'código sem nome e instante: o banco recusa (os três juntos ou nenhum)'
);

select testes.autenticar_como('eduardo@filtroville.test');
select throws_ok(
  $$update public.unidade set municipio_ibge = '4209102', municipio_nome = 'Joinville', municipio_gravado_em = now()
    where id = '73200000-0000-4000-8000-0000000000f2'$$,
  '42501', null,
  'nem a Gestão altera a unidade direto (só pela RPC)'
);

-- ---------------------------------------------------------------------------
-- Atividades do empreendimento: quem pode
-- ---------------------------------------------------------------------------
select testes.autenticar_como('bruno@filtroville.test');
select throws_ok(
  $$select public.gravar_atividades_no_empreendimento('c0000000-0000-4000-8000-00000000000a',
      '73200000-0000-4000-8000-0000000000e1', current_setting('testes.atividades')::jsonb)$$,
  '42501', 'sem_permissao',
  'Equipe (Bruno) não grava atividades no empreendimento'
);
select throws_ok(
  $$select public.gravar_atividades_no_empreendimento('c0000000-0000-4000-8000-00000000000a',
      '73200000-0000-4000-8000-0000000000ff', '[]'::jsonb)$$,
  '42501', 'sem_permissao',
  'Equipe recebe sem_permissao antes de qualquer outra conferência'
);

select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select public.gravar_atividades_no_empreendimento('c0000000-0000-4000-8000-00000000000a',
      '73200000-0000-4000-8000-0000000000e1', current_setting('testes.atividades')::jsonb)$$,
  '42501', 'sem_permissao',
  'Gestão da Verde Sul não grava na Filtroville'
);
select throws_ok(
  $$select public.gravar_atividades_no_empreendimento('c0000000-0000-4000-8000-00000000000b',
      '73200000-0000-4000-8000-0000000000e1', current_setting('testes.atividades')::jsonb)$$,
  '22023', 'empreendimento_invalido',
  'empreendimento de outra consultoria é empreendimento inválido'
);

select testes.autenticar_como_anonimo();
select throws_ok(
  $$select public.gravar_atividades_no_empreendimento('c0000000-0000-4000-8000-00000000000a',
      '73200000-0000-4000-8000-0000000000e1', '[]'::jsonb)$$,
  '42501', null,
  'anônimo não executa gravar_atividades_no_empreendimento'
);

-- ---------------------------------------------------------------------------
-- Gestão grava; repetir não muda; mudar incrementa e audita; nunca apaga
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');
select is(
  public.gravar_atividades_no_empreendimento('c0000000-0000-4000-8000-00000000000a',
    '73200000-0000-4000-8000-0000000000e1', current_setting('testes.atividades')::jsonb),
  2,
  'Gestão (Eduardo) grava duas atividades no empreendimento'
);
select results_eq(
  $$select codigo, descricao, porte, potencial, medidas, fonte, registrado_por, row_version
    from public.atividade_do_empreendimento where empreendimento_id = '73200000-0000-4000-8000-0000000000e1'
    order by codigo$$,
  $$values ('33.10.00', 'Galvanoplastia', 'medio', 'G', '{}'::jsonb, 'Resolução CONSEMA 250/2024',
            'd0000000-0000-4000-8000-0000000000a1'::uuid, 1),
           ('34.11.00', 'Fabricação de estruturas metálicas', 'pequeno', 'M', '{"AU(3)": 1.5}'::jsonb,
            'Resolução CONSEMA 250/2024', 'd0000000-0000-4000-8000-0000000000a1'::uuid, 1)$$,
  'as atividades ficam com código, porte, potencial, medidas, fonte e autor'
);

reset role;
select is(
  (select count(*)::integer from public.auditoria
   where entidade = 'atividade_do_empreendimento' and acao = 'insert'
     and ator_membro_id = 'd0000000-0000-4000-8000-0000000000a1'),
  2,
  'cada inclusão fica na auditoria com o autor'
);

select testes.autenticar_como('eduardo@filtroville.test');
select is(
  public.gravar_atividades_no_empreendimento('c0000000-0000-4000-8000-00000000000a',
    '73200000-0000-4000-8000-0000000000e1', current_setting('testes.atividades')::jsonb),
  2,
  'repetir o mesmo payload devolve o mesmo total (não duplica)'
);
reset role;
select results_eq(
  $$select (select sum(row_version)::integer from public.atividade_do_empreendimento
            where empreendimento_id = '73200000-0000-4000-8000-0000000000e1'),
           (select count(*)::integer from public.auditoria where entidade = 'atividade_do_empreendimento')$$,
  $$values (2, 2)$$,
  'repetir igual não muda a versão nem gera auditoria'
);

select testes.autenticar_como('eduardo@filtroville.test');
select is(
  public.gravar_atividades_no_empreendimento('c0000000-0000-4000-8000-00000000000a',
    '73200000-0000-4000-8000-0000000000e1',
    '[{"codigo": "34.11.00", "descricao": "Fabricação de estruturas metálicas", "porte": "medio",
       "potencial": "M", "medidas": {"AU(3)": 3}, "fonte": "Resolução CONSEMA 250/2024"}]'::jsonb),
  2,
  'gravar uma atividade só devolve o total do empreendimento (não apaga a outra)'
);
select results_eq(
  $$select codigo, porte, medidas, row_version from public.atividade_do_empreendimento
    where empreendimento_id = '73200000-0000-4000-8000-0000000000e1' order by codigo$$,
  $$values ('33.10.00', 'medio', '{}'::jsonb, 1), ('34.11.00', 'medio', '{"AU(3)": 3}'::jsonb, 2)$$,
  'mudar o porte incrementa a versão só da atividade que mudou'
);
reset role;
select results_eq(
  $$select acao::text, antes ->> 'porte', depois ->> 'porte' from public.auditoria
    where entidade = 'atividade_do_empreendimento' and acao = 'update'$$,
  $$values ('update', 'pequeno', 'medio')$$,
  'a mudança fica na auditoria com antes e depois'
);

select testes.autenticar_como('eduardo@filtroville.test');
select is(
  public.gravar_atividades_no_empreendimento('c0000000-0000-4000-8000-00000000000a',
    '73200000-0000-4000-8000-0000000000e1',
    '[{"codigo": "01.02.03", "descricao": "  Outra atividade  ", "porte": "unico", "potencial": "P",
       "fonte": "Resolução CONSEMA 250/2024"}]'::jsonb),
  3,
  'atividade nova soma às gravadas'
);
select results_eq(
  $$select descricao, medidas from public.atividade_do_empreendimento where codigo = '01.02.03'$$,
  $$values ('Outra atividade', '{}'::jsonb)$$,
  'sem medidas vira objeto vazio; descrição sem espaços nas pontas'
);

-- Licenças: L1 (do E1) e L2 (do E2) recebem atividades pela RPC do P2.
select is(
  public.gravar_atividades_na_licenca('c0000000-0000-4000-8000-00000000000a',
    '73200000-0000-4000-8000-000000000011',
    '[{"codigo": "34.11.00", "descricao": "Fabricação de estruturas metálicas", "porte": "pequeno",
       "potencial": "M", "fonte": "Resolução CONSEMA 250/2024"},
      {"codigo": "50.10.00", "descricao": "Depósito de produtos químicos", "porte": "grande",
       "potencial": "G", "fonte": "Resolução CONSEMA 250/2024"}]'::jsonb),
  2,
  'a licença L1 do empreendimento recebe duas atividades'
);
select is(
  public.gravar_atividades_na_licenca('c0000000-0000-4000-8000-00000000000a',
    '73200000-0000-4000-8000-000000000012',
    '[{"codigo": "60.00.00", "descricao": "Fundição", "porte": "medio", "potencial": "G",
       "fonte": "Resolução CONSEMA 250/2024"}]'::jsonb),
  1,
  'a licença L2 de outro empreendimento recebe uma atividade'
);

-- ---------------------------------------------------------------------------
-- Payload inválido: nada gravado
-- ---------------------------------------------------------------------------
create function pg_temp.atividade(codigo text, porte text, potencial text, medidas jsonb)
returns jsonb language sql as $$
  select jsonb_build_object('codigo', codigo, 'descricao', 'Atividade', 'porte', porte, 'potencial', potencial,
                            'medidas', medidas, 'fonte', 'Resolução CONSEMA 250/2024')
$$;

select throws_ok(
  format($$select public.gravar_atividades_no_empreendimento('c0000000-0000-4000-8000-00000000000a',
      '73200000-0000-4000-8000-0000000000e1', %L::jsonb)$$, p.payload),
  '22023', 'atividades_invalidas',
  'payload inválido: ' || p.caso
)
from (values
  ('código fora do formato', jsonb_build_array(pg_temp.atividade('3411', 'pequeno', 'M', '{}'))),
  ('porte inexistente', jsonb_build_array(pg_temp.atividade('34.11.00', 'enorme', 'M', '{}'))),
  ('potencial inexistente', jsonb_build_array(pg_temp.atividade('34.11.00', 'pequeno', 'X', '{}'))),
  ('medida negativa', jsonb_build_array(pg_temp.atividade('34.11.00', 'pequeno', 'M', '{"AU(3)": -1}'))),
  ('medida que não é número', jsonb_build_array(pg_temp.atividade('34.11.00', 'pequeno', 'M', '{"AU(3)": "2"}'))),
  ('código repetido', jsonb_build_array(pg_temp.atividade('34.11.00', 'pequeno', 'M', '{}'),
                                        pg_temp.atividade('34.11.00', 'medio', 'M', '{}'))),
  ('array vazio', '[]'::jsonb),
  ('mais de 50', (select jsonb_agg(pg_temp.atividade(lpad(n::text, 2, '0') || '.00.00', 'pequeno', 'M', '{}'))
                  from generate_series(1, 51) as n)),
  ('objeto em vez de array', pg_temp.atividade('34.11.00', 'pequeno', 'M', '{}')),
  ('sem fonte', '[{"codigo": "34.11.00", "descricao": "Atividade", "porte": "pequeno", "potencial": "M",
                  "medidas": {}}]'::jsonb)
) as p (caso, payload);

select throws_ok(
  $$select public.gravar_atividades_no_empreendimento('c0000000-0000-4000-8000-00000000000a',
      '73200000-0000-4000-8000-0000000000e1',
      jsonb_build_array(pg_temp.atividade('22.22.22', 'pequeno', 'M', '{}'),
                        pg_temp.atividade('34.11.00', 'enorme', 'M', '{}')))$$,
  '22023', 'atividades_invalidas',
  'um item inválido recusa o payload inteiro'
);
select is(
  (select count(*)::integer from public.atividade_do_empreendimento where codigo = '22.22.22'),
  0,
  'o item válido do payload recusado não foi gravado'
);

-- ---------------------------------------------------------------------------
-- Escrita direta
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.atividade_do_empreendimento (consultoria_id, empreendimento_id, codigo, descricao, porte,
                                                    potencial, fonte, registrado_por)
    values ('c0000000-0000-4000-8000-00000000000a', '73200000-0000-4000-8000-0000000000e1', '99.99.99', 'Direto',
            'pequeno', 'M', 'Manual', 'd0000000-0000-4000-8000-0000000000a1')$$,
  '42501', null,
  'nem a Gestão insere direto (escrita só pela RPC)'
);

reset role;
select throws_ok(
  $$insert into public.atividade_do_empreendimento (consultoria_id, empreendimento_id, codigo, descricao, porte,
                                                    potencial, fonte, registrado_por)
    values ('c0000000-0000-4000-8000-00000000000a', '73200000-0000-4000-8000-0000000000eb', '99.99.99', 'Cruzado',
            'pequeno', 'M', 'Manual', 'd0000000-0000-4000-8000-0000000000a1')$$,
  '23503', null,
  'FK composta: atividade da Filtroville não liga em empreendimento da Verde Sul'
);

-- ---------------------------------------------------------------------------
-- Leitura: as duas origens juntas; outra consultoria lê zero
-- ---------------------------------------------------------------------------
select testes.autenticar_como('bruno@filtroville.test');
select is(
  (select count(*)::integer from public.atividade_do_empreendimento),
  3,
  'Equipe da Filtroville lê as atividades do empreendimento'
);
select results_eq(
  $$select codigo, porte, potencial, origem, instrumento_id
    from public.listar_atividades_do_empreendimento('c0000000-0000-4000-8000-00000000000a',
                                                    '73200000-0000-4000-8000-0000000000e1')$$,
  $$values ('01.02.03', 'unico', 'P', 'empreendimento', null::uuid),
           ('33.10.00', 'medio', 'G', 'empreendimento', null::uuid),
           ('34.11.00', 'medio', 'M', 'empreendimento', null::uuid),
           ('34.11.00', 'pequeno', 'M', 'licenca', '73200000-0000-4000-8000-000000000011'::uuid),
           ('50.10.00', 'grande', 'G', 'licenca', '73200000-0000-4000-8000-000000000011'::uuid)$$,
  'listar junta as do empreendimento e as das licenças dele, por código (sem as de outro empreendimento)'
);
select is(
  (select count(*)::integer
   from public.listar_atividades_do_empreendimento('c0000000-0000-4000-8000-00000000000a',
                                                   '73200000-0000-4000-8000-0000000000e1')
   where descricao is null or registrado_em is null),
  0,
  'toda linha traz descrição e instante do registro'
);
select results_eq(
  $$select codigo, porte, origem, instrumento_id
    from private.atividades_do_empreendimento('c0000000-0000-4000-8000-00000000000a',
                                              '73200000-0000-4000-8000-0000000000e1')
    order by codigo, origem$$,
  $$values ('01.02.03', 'unico', 'empreendimento', null::uuid),
           ('33.10.00', 'medio', 'empreendimento', null::uuid),
           ('34.11.00', 'medio', 'empreendimento', null::uuid),
           ('34.11.00', 'pequeno', 'licenca', '73200000-0000-4000-8000-000000000011'::uuid),
           ('50.10.00', 'grande', 'licenca', '73200000-0000-4000-8000-000000000011'::uuid)$$,
  'private.atividades_do_empreendimento junta as duas origens'
);
select results_eq(
  $$select codigo, origem from public.listar_atividades_do_empreendimento('c0000000-0000-4000-8000-00000000000a',
                                                                         '73200000-0000-4000-8000-0000000000e2')$$,
  $$values ('60.00.00', 'licenca')$$,
  'empreendimento sem atividades próprias mostra só as da licença dele'
);

select testes.autenticar_como('gustavo@verdesul.test');
select is(
  (select count(*)::integer from public.atividade_do_empreendimento),
  0,
  'Verde Sul lê zero atividades de empreendimento da Filtroville'
);
select is(
  (select count(*)::integer
   from public.listar_atividades_do_empreendimento('c0000000-0000-4000-8000-00000000000a',
                                                   '73200000-0000-4000-8000-0000000000e1')),
  0,
  'listar_atividades_do_empreendimento devolve zero para a Verde Sul'
);
select is(
  (select count(*)::integer
   from private.atividades_do_empreendimento('c0000000-0000-4000-8000-00000000000a',
                                             '73200000-0000-4000-8000-0000000000e1')),
  0,
  'private.atividades_do_empreendimento devolve zero para a Verde Sul'
);

select testes.autenticar_como_anonimo();
select throws_ok(
  $$select * from public.listar_atividades_do_empreendimento('c0000000-0000-4000-8000-00000000000a',
                                                             '73200000-0000-4000-8000-0000000000e1')$$,
  '42501', null,
  'anônimo não executa listar_atividades_do_empreendimento'
);

select * from finish();

rollback;
