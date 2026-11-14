-- Central administrativa (ADM-01; ADR-0022): só operador da plataforma lista, detalha, vê pessoas e
-- muda a situação (motivo obrigatório, versão, idempotência, histórico append-only). Gestão, Equipe
-- e anônimo são recusados em todas as RPCs. O operador que não é membro continua sem ler os dados
-- das consultorias por consulta direta. A situação não bloqueia o acesso de ninguém nesta versão.
-- Desde a fase 2 (ADR-0024) as RPCs de dados exigem sessão com dois fatores: aqui o operador entra
-- com aal2; a recusa com aal1 e os dados de uso estão no 390.
begin;

select plan(54);

-- A migration não cadastra operador e o cliente não enxerga a tabela.
select has_table('private', 'operador_plataforma', 'existe private.operador_plataforma');
select is((select count(*) from private.operador_plataforma), 0::bigint,
  'a migration não cadastra nenhum operador');
select ok(
  not has_table_privilege('authenticated', 'private.operador_plataforma', 'select')
  and not has_table_privilege('anon', 'private.operador_plataforma', 'select'),
  'nem authenticated nem anon leem operador_plataforma'
);

select testes.criar_dados_sinteticos();

-- Operador: conta própria do Grama, sem vínculo com nenhuma consultoria.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000001', 'authenticated',
        'authenticated', 'operador@grama.test', '', now(), '{"provider": "email", "providers": ["email"]}',
        '{"nome": "Operador Grama"}', now(), now());
insert into private.operador_plataforma (usuario_id) values ('e1000000-0000-4000-8000-000000000001');

-- Dados da Filtroville para contar: 1 empreendimento, 1 licença, 1 orçamento na lista e 1 na lixeira.
insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('e0000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
        'Metalúrgica Rio Cubatão', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome)
values ('f0000000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
        'e0000000-0000-4000-8000-0000000000e1', 'Matriz');
insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, criado_por)
values ('10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a',
        'e0000000-0000-4000-8000-0000000000e1', 'f0000000-0000-4000-8000-0000000000f1',
        'd0000000-0000-4000-8000-0000000000a1');
insert into public.orcamento (id, consultoria_id, ano, sequencia, empreendimento_id, objeto, criado_por)
values ('20000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a', 2026, 1,
        'e0000000-0000-4000-8000-0000000000e1', 'Renovação da LAO', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.orcamento (id, consultoria_id, ano, sequencia, empreendimento_id, objeto, criado_por,
                              excluido_em, excluido_por)
values ('20000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-00000000000a', 2026, 2,
        'e0000000-0000-4000-8000-0000000000e1', 'Monitoramento', 'd0000000-0000-4000-8000-0000000000a1',
        now(), 'd0000000-0000-4000-8000-0000000000a1');

-- ---------------------------------------------------------------------------
-- sou_operador
-- ---------------------------------------------------------------------------
select testes.autenticar_como('operador@grama.test');
select ok(public.sou_operador(), 'o operador é operador');

select testes.autenticar_como('eduardo@filtroville.test');
select ok(not public.sou_operador(), 'a Gestão (Eduardo) não é operadora');

-- ---------------------------------------------------------------------------
-- Lista e detalhe
-- ---------------------------------------------------------------------------
-- Fase 2 (ADR-0024): as RPCs de dados exigem sessão com dois fatores (aal2).
select testes.autenticar_com_dois_fatores('operador@grama.test');

select results_eq(
  $$select nome, situacao::text, pessoas_ativas, orcamentos, empreendimentos, licencas, total
    from public.central_listar_consultorias()$$,
  $$values ('Filtroville Consultoria Ambiental', 'ativa', 6::bigint, 1::bigint, 1::bigint, 1::bigint, 2::bigint),
           ('Verde Sul Ambiental', 'ativa', 2::bigint, 0::bigint, 0::bigint, 0::bigint, 2::bigint)$$,
  'o operador lista as consultorias com pessoas ativas, orçamentos fora da lixeira, empreendimentos e licenças'
);

select is(
  (select gestao from public.central_listar_consultorias() where nome = 'Filtroville Consultoria Ambiental'),
  '[{"nome": "Eduardo Karnopp", "email": "eduardo@filtroville.test"}]'::jsonb,
  'a lista traz nome e e-mail de quem é Gestão'
);

select results_eq(
  $$select nome from public.central_listar_consultorias('FILTRÓ')$$,
  $$values ('Filtroville Consultoria Ambiental')$$,
  'a busca por nome ignora acento e caixa'
);

select results_eq(
  $$select nome, total from public.central_listar_consultorias(null, null, 1, 1)$$,
  $$values ('Verde Sul Ambiental', 2::bigint)$$,
  'a lista é paginada (limite e deslocamento) com o total'
);

select is(
  (select count(*) from public.central_listar_consultorias(null, 'suspensa')),
  0::bigint,
  'filtro por situação: nenhuma suspensa ainda'
);

select results_eq(
  $$select situacao::text, situacao_motivo, row_version, pessoas_ativas, orcamentos, empreendimentos, licencas
    from public.central_detalhar_consultoria('c0000000-0000-4000-8000-00000000000a')$$,
  $$values ('ativa', null::text, 1, 6::bigint, 1::bigint, 1::bigint, 1::bigint)$$,
  'o detalhe traz situação, versão e os mesmos números'
);

select is(
  (select count(*) from public.central_detalhar_consultoria(gen_random_uuid())),
  0::bigint,
  'consultoria inexistente: detalhe vazio'
);

-- ---------------------------------------------------------------------------
-- Pessoas (só leitura)
-- ---------------------------------------------------------------------------
select results_eq(
  $$select nome, email, papel::text, situacao::text, total
    from public.central_listar_pessoas('c0000000-0000-4000-8000-00000000000a', 2, 0)$$,
  $$values ('Ana Ribeiro', 'ana@filtroville.test', 'equipe', 'ativo', 6::bigint),
           ('Bruno Tavares', 'bruno@filtroville.test', 'equipe', 'ativo', 6::bigint)$$,
  'o operador vê nome, e-mail, papel e situação do vínculo, paginado'
);

-- ---------------------------------------------------------------------------
-- Mudar situação
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.central_mudar_situacao('c0000000-0000-4000-8000-00000000000a', 'suspensa', '   ', 1,
    '40000000-0000-4000-8000-000000000001')$$,
  '22023', 'motivo_obrigatorio',
  'motivo em branco é recusado'
);

select throws_ok(
  $$select public.central_mudar_situacao('c0000000-0000-4000-8000-00000000000a', 'suspensa', 'teste', 7,
    '40000000-0000-4000-8000-000000000001')$$,
  'P0001', 'conflito_de_versao',
  'versão errada é recusada'
);

select throws_ok(
  $$select public.central_mudar_situacao('c0000000-0000-4000-8000-00000000000a', 'ativa', 'nada muda', 1,
    '40000000-0000-4000-8000-000000000001')$$,
  'P0001', 'mesma_situacao',
  'mudar para a situação atual é recusado'
);

select throws_ok(
  $$select public.central_mudar_situacao('c0000000-0000-4000-8000-00000000000a', 'suspensa', 'motivo', 1, null)$$,
  '22023', 'chave_obrigatoria',
  'sem chave de operação é recusado'
);

select throws_ok(
  $$select public.central_mudar_situacao(gen_random_uuid(), 'suspensa', 'motivo', 1,
    '40000000-0000-4000-8000-000000000001')$$,
  'P0001', 'consultoria_inexistente',
  'consultoria inexistente é recusada'
);

select is(
  public.central_mudar_situacao('c0000000-0000-4000-8000-00000000000a', 'suspensa', '  Beta encerrado  ', 1,
    '40000000-0000-4000-8000-000000000001'),
  2,
  'o operador suspende a Filtroville e recebe a versão nova'
);

select is(
  public.central_mudar_situacao('c0000000-0000-4000-8000-00000000000a', 'suspensa', '  Beta encerrado  ', 1,
    '40000000-0000-4000-8000-000000000001'),
  2,
  'repetir com a mesma chave devolve a mesma versão (idempotente)'
);

select throws_ok(
  $$select public.central_mudar_situacao('c0000000-0000-4000-8000-00000000000a', 'arquivada', 'outro', 2,
    '40000000-0000-4000-8000-000000000001')$$,
  'P0001', 'chave_reutilizada',
  'a mesma chave com outra mudança é recusada'
);

select results_eq(
  $$select situacao::text, situacao_motivo, situacao_alterada_por_nome, row_version
    from public.central_detalhar_consultoria('c0000000-0000-4000-8000-00000000000a')$$,
  $$values ('suspensa', 'Beta encerrado', 'Operador Grama', 2)$$,
  'o detalhe mostra a situação nova, o motivo limpo, quem mudou e a versão'
);

select is(
  public.central_mudar_situacao('c0000000-0000-4000-8000-00000000000a', 'teste', 'Volta ao período de teste', 2,
    '40000000-0000-4000-8000-000000000002'),
  3,
  'a situação "teste" também vale'
);

select results_eq(
  $$select situacao_anterior::text, situacao_nova::text, motivo, alterada_por_nome, total
    from public.central_historico_situacao('c0000000-0000-4000-8000-00000000000a')$$,
  $$values ('suspensa', 'teste', 'Volta ao período de teste', 'Operador Grama', 2::bigint),
           ('ativa', 'suspensa', 'Beta encerrado', 'Operador Grama', 2::bigint)$$,
  'o histórico traz as duas mudanças, a mais recente primeiro, sem duplicar a repetida'
);

select results_eq(
  $$select nome from public.central_listar_consultorias(null, 'teste')$$,
  $$values ('Filtroville Consultoria Ambiental')$$,
  'filtro por situação encontra a consultoria em teste'
);

-- Situação só registra: a Gestão continua membro e lendo os dados da própria consultoria.
select testes.autenticar_como('eduardo@filtroville.test');
select ok(
  private.is_membro('c0000000-0000-4000-8000-00000000000a')
  and (select count(*) from public.orcamento) = 2,
  'consultoria fora de "ativa" não bloqueia ninguém nesta versão'
);

-- ---------------------------------------------------------------------------
-- Histórico append-only (nem o dono altera ou apaga)
-- ---------------------------------------------------------------------------
reset role;

select is(
  (select count(*) from public.consultoria_situacao_historico
   where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  2::bigint,
  'o histórico tem uma linha por mudança'
);

select throws_ok(
  'update public.consultoria_situacao_historico set motivo = $$adulterado$$',
  '42501', null,
  'o histórico não aceita update'
);

select throws_ok(
  'delete from public.consultoria_situacao_historico',
  '42501', null,
  'o histórico não aceita delete'
);

-- ---------------------------------------------------------------------------
-- Não operador: Gestão de A, Gestão de B e Equipe recebem sem_permissao em todas as RPCs
-- ---------------------------------------------------------------------------
create temporary table chamadas_central (rpc text, sql text);
insert into chamadas_central values
  ('central_listar_consultorias', $$select * from public.central_listar_consultorias()$$),
  ('central_detalhar_consultoria',
   $$select * from public.central_detalhar_consultoria('c0000000-0000-4000-8000-00000000000a')$$),
  ('central_listar_pessoas',
   $$select * from public.central_listar_pessoas('c0000000-0000-4000-8000-00000000000a')$$),
  ('central_historico_situacao',
   $$select * from public.central_historico_situacao('c0000000-0000-4000-8000-00000000000a')$$),
  ('central_mudar_situacao',
   $$select public.central_mudar_situacao('c0000000-0000-4000-8000-00000000000a', 'ativa', 'motivo', 3,
     gen_random_uuid())$$);
grant select on chamadas_central to anon, authenticated;

select testes.autenticar_como('eduardo@filtroville.test');
select throws_ok(c.sql, '42501', 'sem_permissao', 'Gestão de A (Eduardo): ' || c.rpc || ' recusa')
from chamadas_central as c order by c.rpc;

select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(c.sql, '42501', 'sem_permissao', 'Gestão de B (Gustavo): ' || c.rpc || ' recusa')
from chamadas_central as c order by c.rpc;

select testes.autenticar_como('ana@filtroville.test');
select throws_ok(c.sql, '42501', 'sem_permissao', 'Equipe (Ana): ' || c.rpc || ' recusa')
from chamadas_central as c order by c.rpc;

select throws_ok(
  'select * from public.consultoria_situacao_historico',
  '42501', null,
  'membro não lê o histórico direto'
);

-- Anônimo: barrado antes de rodar (sem grant de execute), inclusive sou_operador.
select testes.autenticar_como_anonimo();
select throws_ok(c.sql, '42501', null, 'anônimo: ' || c.rpc || ' recusa')
from chamadas_central as c order by c.rpc;
select throws_ok('select public.sou_operador()', '42501', null, 'anônimo: sou_operador recusa');

-- ---------------------------------------------------------------------------
-- Operador que não é membro: zero linhas por consulta direta (RLS de sempre)
-- ---------------------------------------------------------------------------
select testes.autenticar_com_dois_fatores('operador@grama.test');

select results_eq(
  $$select (select count(*) from public.consultoria), (select count(*) from public.membro),
           (select count(*) from public.orcamento), (select count(*) from public.instrumento),
           (select count(*) from public.empreendimento)$$,
  $$values (0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint)$$,
  'o operador lê zero linhas de consultoria, membro, orçamento, licença e empreendimento'
);

select throws_ok(
  'select * from public.consultoria_situacao_historico',
  '42501', null,
  'nem o operador lê o histórico direto: só pela RPC'
);

select ok(
  not private.is_membro('c0000000-0000-4000-8000-00000000000a')
  and not private.is_gestao('c0000000-0000-4000-8000-00000000000a'),
  'ser operador não faz ninguém membro nem Gestão'
);

select * from finish();

rollback;
