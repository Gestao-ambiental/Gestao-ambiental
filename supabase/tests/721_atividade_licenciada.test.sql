-- Atividades da licença (ADR-0044, P2): tabela com RLS forçada, auditoria e as barreiras de suporte
-- e comercial, sem grant de escrita; gravar_atividades_na_licenca só pela Gestão, inclui ou
-- atualiza pelo código, nunca apaga, e repetir igual não muda nada; payload inválido não grava
-- nada; outra consultoria lê zero linhas; o suporte não escreve.
begin;

select plan(44);

select testes.criar_dados_sinteticos();

select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

-- Operador da plataforma, para o acesso de suporte.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '72100000-0000-4000-8000-0000000000d1', 'authenticated',
        'authenticated', 'operador721@grama.test', '', now(), '{"provider": "email", "providers": ["email"]}',
        '{"nome": "Operador Grama"}', now(), now());
insert into private.operador_plataforma (usuario_id) values ('72100000-0000-4000-8000-0000000000d1');

-- ---------------------------------------------------------------------------
-- Cenário (como dono): A com LAO ativa L1 e LAO em rascunho L4; B com LAO ativa LB.
-- ---------------------------------------------------------------------------
insert into public.empreendimento (id, consultoria_id, nome, criado_por) values
  ('72100000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a', 'Metalúrgica Rio Cubatão',
   'd0000000-0000-4000-8000-0000000000a1'),
  ('72100000-0000-4000-8000-0000000000eb', 'c0000000-0000-4000-8000-00000000000b', 'Posto Rota Sul',
   'd0000000-0000-4000-8000-0000000000b1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome) values
  ('72100000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
   '72100000-0000-4000-8000-0000000000e1', 'Matriz'),
  ('72100000-0000-4000-8000-0000000000fb', 'c0000000-0000-4000-8000-00000000000b',
   '72100000-0000-4000-8000-0000000000eb', 'Matriz');

insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, tipo_id, numero, orgao, situacao,
                                assinado_em, marco, validade, criado_por, ativado_em, ativado_por, chave_ativacao)
select x.id, x.cid, x.eid, x.uid,
       (select t.id from public.tipo_instrumento as t where t.sigla = 'LAO' and t.consultoria_id = x.cid),
       x.numero, 'IMA', x.situacao::public.situacao_instrumento, current_setting('testes.hoje')::date - 300,
       'assinatura', current_setting('testes.hoje')::date + 400, x.autor,
       case when x.situacao = 'ativo' then now() end,
       case when x.situacao = 'ativo' then x.autor end,
       case when x.situacao = 'ativo' then gen_random_uuid() end
from (values
  ('72100000-0000-4000-8000-000000000011'::uuid, 'c0000000-0000-4000-8000-00000000000a'::uuid,
   '72100000-0000-4000-8000-0000000000e1'::uuid, '72100000-0000-4000-8000-0000000000f1'::uuid,
   '4821/2023', 'ativo', 'd0000000-0000-4000-8000-0000000000a1'::uuid),
  ('72100000-0000-4000-8000-000000000014'::uuid, 'c0000000-0000-4000-8000-00000000000a'::uuid,
   '72100000-0000-4000-8000-0000000000e1'::uuid, '72100000-0000-4000-8000-0000000000f1'::uuid,
   '9/2026', 'rascunho', 'd0000000-0000-4000-8000-0000000000a1'::uuid),
  ('72100000-0000-4000-8000-0000000000b1'::uuid, 'c0000000-0000-4000-8000-00000000000b'::uuid,
   '72100000-0000-4000-8000-0000000000eb'::uuid, '72100000-0000-4000-8000-0000000000fb'::uuid,
   '1/2024', 'ativo', 'd0000000-0000-4000-8000-0000000000b1'::uuid)
) as x (id, cid, eid, uid, numero, situacao, autor);

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
   where c.oid = 'public.atividade_licenciada'::regclass),
  'atividade_licenciada tem RLS habilitada e forçada'
);
select is(
  (select array_agg(t.tgname::text order by t.tgname) from pg_catalog.pg_trigger as t
   where t.tgrelid = 'public.atividade_licenciada'::regclass and not t.tgisinternal),
  array['_comercial_somente_leitura', '_suporte_somente_leitura', 'atividade_licenciada_auditar'],
  'auditoria, barreira de suporte e barreira comercial'
);
select is(
  (select encode(t.tgargs, 'escape') from pg_catalog.pg_trigger as t
   where t.tgrelid = 'public.atividade_licenciada'::regclass and t.tgname = '_comercial_somente_leitura'),
  '',
  'a barreira comercial não depende do plano de orçamentos'
);
select is(
  (select coalesce(array_agg(g.grantee::text || ':' || g.privilege_type order by g.grantee, g.privilege_type), '{}')
   from information_schema.role_table_grants as g
   where g.table_schema = 'public' and g.table_name = 'atividade_licenciada'
     and g.grantee in ('anon', 'authenticated')),
  array['authenticated:SELECT'],
  'authenticated só lê; anon nada'
);
select col_is_unique('public', 'atividade_licenciada', array['consultoria_id', 'id'],
  'unique (consultoria_id, id) para FKs compostas');

-- ---------------------------------------------------------------------------
-- Quem pode
-- ---------------------------------------------------------------------------
select testes.autenticar_como('bruno@filtroville.test');
select throws_ok(
  $$select public.gravar_atividades_na_licenca('c0000000-0000-4000-8000-00000000000a',
      '72100000-0000-4000-8000-000000000011', current_setting('testes.atividades')::jsonb)$$,
  '42501', 'sem_permissao',
  'Equipe (Bruno) não grava atividades'
);
select throws_ok(
  $$select public.gravar_atividades_na_licenca('c0000000-0000-4000-8000-00000000000a',
      '72100000-0000-4000-8000-0000000000ff', '[]'::jsonb)$$,
  '42501', 'sem_permissao',
  'Equipe recebe sem_permissao antes de qualquer outra conferência'
);

select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select public.gravar_atividades_na_licenca('c0000000-0000-4000-8000-00000000000a',
      '72100000-0000-4000-8000-000000000011', current_setting('testes.atividades')::jsonb)$$,
  '42501', 'sem_permissao',
  'Gestão da Verde Sul não grava na Filtroville'
);
select throws_ok(
  $$select public.gravar_atividades_na_licenca('c0000000-0000-4000-8000-00000000000b',
      '72100000-0000-4000-8000-000000000011', current_setting('testes.atividades')::jsonb)$$,
  '22023', 'licenca_invalida',
  'licença de outra consultoria é licença inválida'
);

select testes.autenticar_como_anonimo();
select throws_ok(
  $$select public.gravar_atividades_na_licenca('c0000000-0000-4000-8000-00000000000a',
      '72100000-0000-4000-8000-000000000011', '[]'::jsonb)$$,
  '42501', null,
  'anônimo não executa gravar_atividades_na_licenca'
);

-- ---------------------------------------------------------------------------
-- Gestão grava; repetir não muda; mudar incrementa e audita; nunca apaga
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');
select is(
  public.gravar_atividades_na_licenca('c0000000-0000-4000-8000-00000000000a',
    '72100000-0000-4000-8000-000000000011', current_setting('testes.atividades')::jsonb),
  2,
  'Gestão (Eduardo) grava duas atividades na licença'
);
select results_eq(
  $$select codigo, descricao, porte, potencial, medidas, fonte, registrado_por, row_version
    from public.atividade_licenciada where instrumento_id = '72100000-0000-4000-8000-000000000011' order by codigo$$,
  $$values ('33.10.00', 'Galvanoplastia', 'medio', 'G', '{}'::jsonb, 'Resolução CONSEMA 250/2024',
            'd0000000-0000-4000-8000-0000000000a1'::uuid, 1),
           ('34.11.00', 'Fabricação de estruturas metálicas', 'pequeno', 'M', '{"AU(3)": 1.5}'::jsonb,
            'Resolução CONSEMA 250/2024', 'd0000000-0000-4000-8000-0000000000a1'::uuid, 1)$$,
  'as atividades ficam com código, porte, potencial, medidas, fonte e autor'
);

reset role;
select is(
  (select count(*)::integer from public.auditoria
   where entidade = 'atividade_licenciada' and acao = 'insert'
     and ator_membro_id = 'd0000000-0000-4000-8000-0000000000a1'),
  2,
  'cada inclusão fica na auditoria com o autor'
);

select testes.autenticar_como('eduardo@filtroville.test');
select is(
  public.gravar_atividades_na_licenca('c0000000-0000-4000-8000-00000000000a',
    '72100000-0000-4000-8000-000000000011', current_setting('testes.atividades')::jsonb),
  2,
  'repetir o mesmo payload devolve o mesmo total'
);
reset role;
select results_eq(
  $$select (select sum(row_version)::integer from public.atividade_licenciada
            where instrumento_id = '72100000-0000-4000-8000-000000000011'),
           (select count(*)::integer from public.auditoria where entidade = 'atividade_licenciada')$$,
  $$values (2, 2)$$,
  'repetir igual não muda a versão nem gera auditoria'
);

select testes.autenticar_como('eduardo@filtroville.test');
select is(
  public.gravar_atividades_na_licenca('c0000000-0000-4000-8000-00000000000a',
    '72100000-0000-4000-8000-000000000011',
    '[{"codigo": "34.11.00", "descricao": "Fabricação de estruturas metálicas", "porte": "medio",
       "potencial": "M", "medidas": {"AU(3)": 3}, "fonte": "Resolução CONSEMA 250/2024"}]'::jsonb),
  2,
  'gravar uma atividade só devolve o total da licença (não apaga a outra)'
);
select results_eq(
  $$select codigo, porte, medidas, row_version from public.atividade_licenciada
    where instrumento_id = '72100000-0000-4000-8000-000000000011' order by codigo$$,
  $$values ('33.10.00', 'medio', '{}'::jsonb, 1), ('34.11.00', 'medio', '{"AU(3)": 3}'::jsonb, 2)$$,
  'mudar o porte incrementa a versão só da atividade que mudou'
);
reset role;
select results_eq(
  $$select acao::text, antes ->> 'porte', depois ->> 'porte' from public.auditoria
    where entidade = 'atividade_licenciada' and acao = 'update'$$,
  $$values ('update', 'pequeno', 'medio')$$,
  'a mudança fica na auditoria com antes e depois'
);

select testes.autenticar_como('eduardo@filtroville.test');
select is(
  public.gravar_atividades_na_licenca('c0000000-0000-4000-8000-00000000000a',
    '72100000-0000-4000-8000-000000000011',
    '[{"codigo": "01.02.03", "descricao": "  Outra atividade  ", "porte": "unico", "potencial": "P",
       "fonte": "Resolução CONSEMA 250/2024"}]'::jsonb),
  3,
  'atividade nova soma às gravadas'
);
select results_eq(
  $$select descricao, medidas from public.atividade_licenciada where codigo = '01.02.03'$$,
  $$values ('Outra atividade', '{}'::jsonb)$$,
  'sem medidas vira objeto vazio; descrição sem espaços nas pontas'
);
select is(
  public.gravar_atividades_na_licenca('c0000000-0000-4000-8000-00000000000a',
    '72100000-0000-4000-8000-000000000014', current_setting('testes.atividades')::jsonb),
  2,
  'licença em rascunho também recebe atividades'
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
  format($$select public.gravar_atividades_na_licenca('c0000000-0000-4000-8000-00000000000a',
      '72100000-0000-4000-8000-000000000011', %L::jsonb)$$, p.payload),
  '22023', 'atividades_invalidas',
  'payload inválido: ' || p.caso
)
from (values
  ('código fora do formato', jsonb_build_array(pg_temp.atividade('3411', 'pequeno', 'M', '{}'))),
  ('porte inexistente', jsonb_build_array(pg_temp.atividade('34.11.00', 'enorme', 'M', '{}'))),
  ('potencial inexistente', jsonb_build_array(pg_temp.atividade('34.11.00', 'pequeno', 'X', '{}'))),
  ('medida negativa', jsonb_build_array(pg_temp.atividade('34.11.00', 'pequeno', 'M', '{"AU(3)": -1}'))),
  ('medida que não é número', jsonb_build_array(pg_temp.atividade('34.11.00', 'pequeno', 'M', '{"AU(3)": "2"}'))),
  ('medida nula', jsonb_build_array(pg_temp.atividade('34.11.00', 'pequeno', 'M', '{"AU(3)": null}'))),
  ('código repetido', jsonb_build_array(pg_temp.atividade('34.11.00', 'pequeno', 'M', '{}'),
                                        pg_temp.atividade('34.11.00', 'medio', 'M', '{}'))),
  ('array vazio', '[]'::jsonb),
  ('mais de 50', (select jsonb_agg(pg_temp.atividade(lpad(n::text, 2, '0') || '.00.00', 'pequeno', 'M', '{}'))
                  from generate_series(1, 51) as n)),
  ('objeto em vez de array', pg_temp.atividade('34.11.00', 'pequeno', 'M', '{}')),
  ('descrição em branco', '[{"codigo": "34.11.00", "descricao": "  ", "porte": "pequeno", "potencial": "M",
                            "medidas": {}, "fonte": "Resolução CONSEMA 250/2024"}]'::jsonb),
  ('sem fonte', '[{"codigo": "34.11.00", "descricao": "Atividade", "porte": "pequeno", "potencial": "M",
                  "medidas": {}}]'::jsonb)
) as p (caso, payload);

select throws_ok(
  $$select public.gravar_atividades_na_licenca('c0000000-0000-4000-8000-00000000000a',
      '72100000-0000-4000-8000-000000000011',
      jsonb_build_array(pg_temp.atividade('22.22.22', 'pequeno', 'M', '{}'),
                        pg_temp.atividade('34.11.00', 'enorme', 'M', '{}')))$$,
  '22023', 'atividades_invalidas',
  'um item inválido recusa o payload inteiro'
);
select is(
  (select count(*)::integer from public.atividade_licenciada where codigo = '22.22.22'),
  0,
  'o item válido do payload recusado não foi gravado'
);

-- ---------------------------------------------------------------------------
-- Leitura e escrita direta
-- ---------------------------------------------------------------------------
select testes.autenticar_como('bruno@filtroville.test');
select is(
  (select count(*)::integer from public.atividade_licenciada),
  5,
  'Equipe da Filtroville lê as atividades das licenças'
);

select testes.autenticar_como('gustavo@verdesul.test');
select is(
  (select count(*)::integer from public.atividade_licenciada),
  0,
  'Verde Sul lê zero atividades da Filtroville'
);

select testes.autenticar_como('eduardo@filtroville.test');
select throws_ok(
  $$insert into public.atividade_licenciada (consultoria_id, instrumento_id, codigo, descricao, porte, potencial,
                                             fonte, registrado_por)
    values ('c0000000-0000-4000-8000-00000000000a', '72100000-0000-4000-8000-000000000011', '99.99.99', 'Direto',
            'pequeno', 'M', 'Manual', 'd0000000-0000-4000-8000-0000000000a1')$$,
  '42501', null,
  'nem a Gestão insere direto (escrita só pela RPC)'
);
select throws_ok(
  $$update public.atividade_licenciada set porte = 'grande' where codigo = '34.11.00'$$,
  '42501', null,
  'nem a Gestão altera direto'
);

reset role;
select throws_ok(
  $$insert into public.atividade_licenciada (consultoria_id, instrumento_id, codigo, descricao, porte, potencial,
                                             fonte, registrado_por)
    values ('c0000000-0000-4000-8000-00000000000a', '72100000-0000-4000-8000-0000000000b1', '99.99.99', 'Cruzado',
            'pequeno', 'M', 'Manual', 'd0000000-0000-4000-8000-0000000000a1')$$,
  '23503', null,
  'FK composta: atividade da Filtroville não liga em licença da Verde Sul'
);

-- ---------------------------------------------------------------------------
-- Suporte não escreve
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');
select public.autorizar_acesso_de_suporte('72100000-0000-4000-8000-0000000000a5',
  'c0000000-0000-4000-8000-00000000000a', 2, null);
select testes.autenticar_com_dois_fatores('operador721@grama.test');
select public.entrar_como_suporte('c0000000-0000-4000-8000-00000000000a');

select is(
  (select count(*)::integer from public.atividade_licenciada),
  5,
  'o suporte lê as atividades'
);
select throws_ok(
  $$select public.gravar_atividades_na_licenca('c0000000-0000-4000-8000-00000000000a',
      '72100000-0000-4000-8000-000000000011', current_setting('testes.atividades')::jsonb)$$,
  '42501', 'sem_permissao',
  'o suporte não grava pela RPC'
);
reset role;
select throws_ok(
  $$insert into public.atividade_licenciada (consultoria_id, instrumento_id, codigo, descricao, porte, potencial,
                                             fonte, registrado_por)
    values ('c0000000-0000-4000-8000-00000000000a', '72100000-0000-4000-8000-000000000011', '99.99.99', 'Intruso',
            'pequeno', 'M', 'Manual', 'd0000000-0000-4000-8000-0000000000a1')$$,
  '42501', 'acesso_de_suporte_somente_leitura',
  'como dono, com o JWT do suporte: a trigger recusa'
);

-- ---------------------------------------------------------------------------
-- Plano sem orçamentos ainda grava (a triagem não depende do plano)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true); -- sem usuário, como a service role
update private.configuracao_comercial set fim_do_beta = current_date - 400;
update public.consultoria set criada_em = now() - interval '60 days'
where id = 'c0000000-0000-4000-8000-00000000000a';
insert into public.assinatura (id, consultoria_id, plano, ciclo, forma, asaas_cliente_id, asaas_assinatura_id,
                               proximo_vencimento)
values ('72100000-0000-4000-8000-0000000000c1', 'c0000000-0000-4000-8000-00000000000a', 'essencial', 'mensal', 'pix',
        'cus_teste_721', 'sub_teste_721', current_date + 20);

select testes.autenticar_como('eduardo@filtroville.test');
select is(
  public.gravar_atividades_na_licenca('c0000000-0000-4000-8000-00000000000a',
    '72100000-0000-4000-8000-000000000011',
    '[{"codigo": "45.00.00", "descricao": "Mais uma", "porte": "grande", "potencial": "G",
       "medidas": {"N": 10}, "fonte": "Resolução CONSEMA 250/2024"}]'::jsonb),
  4,
  'plano Essencial: a Gestão grava atividades na licença'
);

select * from finish();

rollback;
