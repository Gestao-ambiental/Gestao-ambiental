-- Catálogo de normas (L0, ADR-0050, LEG-01 e LEG-03): tabelas globais em private com RLS forçada e
-- sem grant; leitura só pelas RPCs para membro ativo de qualquer consultoria; versão imutável;
-- idempotência de coleta, versão e mudança; fontes vazias do L5 e do L6.
-- Não depende da carga inicial: as normas daqui usam chaves 'sc;teste;...' e os resultados das
-- buscas são filtrados por esse prefixo.
begin;

select plan(52);

select testes.criar_dados_sinteticos();

-- Usuário sem vínculo nenhum e Diego desligado (vínculo histórico, sem acesso).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '72000000-0000-4000-8000-0000000000f1', 'authenticated',
        'authenticated', 'sem.vinculo@normas.test', '', now(),
        '{"provider": "email", "providers": ["email"]}'::jsonb, '{"nome": "Sem Vínculo"}'::jsonb, now(), now());

update public.membro
set situacao = 'desligado', desligado_em = now()
where id = 'd0000000-0000-4000-8000-0000000000a5';

-- ---------------------------------------------------------------------------
-- Cenário (como dono das tabelas)
-- N1: IN 02/2021 (três versões, uma mudança detectada e uma publicada, dois critérios)
-- N2: Portaria 250/2024; N2b: Portaria 250/2023; N3: Lei 14.675/2009; N4: decreto municipal
-- P1..P5: "Zzpaginacao" para a paginação
-- ---------------------------------------------------------------------------
insert into private.norma (id, chave, esfera, municipio_ibge, orgao, tipo, numero, ano, titulo, temas) values
  ('72000000-0000-4000-8000-000000000001', 'sc;teste;in;02;2021', 'estadual', null, 'IMA-TESTE',
   'instrucao_normativa', '02', 2021, 'Instrução Normativa Teste — Efluentes Líquidos Ácidos', '{efluentes}'),
  ('72000000-0000-4000-8000-000000000002', 'sc;teste;portaria;250;2024', 'estadual', null, 'IMA-TESTE',
   'portaria', '250', 2024, 'Portaria Teste de Ruído', '{ruido}'),
  ('72000000-0000-4000-8000-000000000003', 'sc;teste;portaria;250;2023', 'estadual', null, 'IMA-TESTE',
   'portaria', '250', 2023, 'Portaria Teste de Ruído antiga', '{ruido}'),
  ('72000000-0000-4000-8000-000000000004', 'sc;teste;lei;14.675;2009', 'estadual', null, 'ALESC-TESTE',
   'lei', '14.675', 2009, 'Lei Teste do Código Ambiental', '{}'),
  ('72000000-0000-4000-8000-000000000005', 'sc;teste;joinville;decreto;100', 'municipal', '4209102',
   'JOINVILLE-TESTE', 'decreto', '100', 2020, 'Decreto Teste de Joinville', '{}');

insert into private.norma (id, chave, esfera, orgao, tipo, numero, ano, titulo)
select ('72000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid,
       'sc;teste;paginacao;90' || n::text, 'estadual', 'IMA-TESTE', 'portaria', '90' || n::text, 2026,
       'Zzpaginacao teste ' || n::text
from generate_series(1, 5) as n;

insert into private.norma_versao (id, norma_id, numero, publicada_em, publicada_em_texto, sha256, texto) values
  ('72000000-0000-4000-8000-000000000a01', '72000000-0000-4000-8000-000000000001', 1, '2021-03-01',
   '1º de março de 2021', repeat('a', 64), 'texto v1'),
  ('72000000-0000-4000-8000-000000000a02', '72000000-0000-4000-8000-000000000001', 2, '2022-03-01',
   '1º de março de 2022', repeat('b', 64), null),
  ('72000000-0000-4000-8000-000000000a03', '72000000-0000-4000-8000-000000000001', 3, '2023-03-01',
   '1º de março de 2023', repeat('c', 64), 'texto v3');

insert into private.norma_mudanca (id, norma_id, versao_anterior_id, versao_nova_id, tipo, situacao,
                                   revisada_por, publicada_em) values
  ('72000000-0000-4000-8000-000000000b01', '72000000-0000-4000-8000-000000000001',
   '72000000-0000-4000-8000-000000000a01', '72000000-0000-4000-8000-000000000a02', 'alterada', 'detectada',
   null, null),
  ('72000000-0000-4000-8000-000000000b02', '72000000-0000-4000-8000-000000000001',
   '72000000-0000-4000-8000-000000000a02', '72000000-0000-4000-8000-000000000a03', 'alterada', 'publicada',
   'a0000000-0000-4000-8000-000000000001', now());

insert into private.norma_criterio (norma_id, tipo, valor, origem) values
  ('72000000-0000-4000-8000-000000000001', 'tipo_licenca', 'LAO', 'curadoria'),
  ('72000000-0000-4000-8000-000000000001', 'atividade', '33.10.00', 'simulador_ima');

-- Para a busca global: um empreendimento com o mesmo termo das normas de paginação.
insert into public.empreendimento (consultoria_id, nome, criado_por) values
  ('c0000000-0000-4000-8000-00000000000a', 'Zzpaginacao Empreendimento', 'd0000000-0000-4000-8000-0000000000a1');

-- ---------------------------------------------------------------------------
-- Estrutura: RLS forçada, sem privilégio direto, RPCs só para authenticated
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from pg_catalog.pg_class as c
   join pg_catalog.pg_namespace as s on s.oid = c.relnamespace
   where s.nspname = 'private'
     and c.relname in ('fonte_legal', 'coleta', 'norma', 'norma_versao', 'norma_mudanca', 'norma_criterio')
     and c.relrowsecurity and c.relforcerowsecurity),
  6::bigint,
  'as seis tabelas do catálogo têm RLS habilitada e forçada'
);

select ok(
  (select bool_and(not has_table_privilege(r, 'private.' || t,
                   'select, insert, update, delete, truncate, references, trigger'))
   from unnest(array['fonte_legal', 'coleta', 'norma', 'norma_versao', 'norma_mudanca', 'norma_criterio']) as t
   cross join unnest(array['anon', 'authenticated']) as r),
  'anon e authenticated não têm privilégio nenhum nas tabelas do catálogo'
);

select ok(
  has_function_privilege('authenticated', 'public.buscar_normas(text, integer, integer)', 'execute')
  and has_function_privilege('authenticated', 'public.detalhe_da_norma(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.listar_fontes_legais()', 'execute')
  and not has_function_privilege('anon', 'public.buscar_normas(text, integer, integer)', 'execute')
  and not has_function_privilege('anon', 'public.detalhe_da_norma(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.listar_fontes_legais()', 'execute')
  and not has_function_privilege('anon', 'private.linhas_de_prazo_acao_legal(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.busca_normas(uuid, text)', 'execute'),
  'RPCs do catálogo e fontes vazias: authenticated executa, anon não'
);

select ok(
  pg_catalog.pg_get_functiondef('private.linhas_de_prazo(uuid)'::regprocedure)
    like '%private.linhas_de_prazo_acao_legal(cid)%'
  and pg_catalog.pg_get_functiondef('public.buscar_no_grama(uuid, text)'::regprocedure)
    like '%private.busca_normas(p_consultoria_id, p_termo)%',
  'a união de prazos e a busca global já incluem as fontes vazias do L6 e do L5'
);

-- ---------------------------------------------------------------------------
-- Integridade (como dono): versão imutável, chaves únicas e checks
-- ---------------------------------------------------------------------------
select throws_ok(
  $$update private.norma_versao set texto = 'alterado' where id = '72000000-0000-4000-8000-000000000a01'$$,
  'P0001', 'versao_de_norma_imutavel',
  'versão de norma não pode ser alterada'
);

select throws_ok(
  $$delete from private.norma_versao where id = '72000000-0000-4000-8000-000000000a01'$$,
  'P0001', 'versao_de_norma_imutavel',
  'versão de norma não pode ser apagada'
);

select throws_ok(
  $$insert into private.norma_versao (norma_id, numero, sha256)
    values ('72000000-0000-4000-8000-000000000001', 4, repeat('a', 64))$$,
  '23505', null,
  'o mesmo arquivo (SHA-256) na mesma norma não vira versão nova'
);

select lives_ok(
  $$insert into private.norma_versao (norma_id, numero, sha256)
    values ('72000000-0000-4000-8000-000000000002', 1, repeat('a', 64))$$,
  'o mesmo SHA-256 em outra norma é aceito'
);

select throws_ok(
  $$insert into private.norma_mudanca (norma_id, versao_anterior_id, versao_nova_id, tipo)
    values ('72000000-0000-4000-8000-000000000001', null, '72000000-0000-4000-8000-000000000a02', 'alterada')$$,
  '23505', null,
  'mudança repetida (mesma norma, tipo e versão nova, ato nulo) não duplica'
);

select throws_ok(
  $$insert into private.norma_mudanca (norma_id, versao_nova_id, tipo, situacao, publicada_em)
    values ('72000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000a01', 'nova',
            'publicada', now())$$,
  '23514', null,
  'mudança publicada sem revisada_por viola o check'
);

select throws_ok(
  $$insert into private.norma (chave, esfera, orgao, tipo, numero, titulo)
    values ('sc;teste;municipal;sem;ibge', 'municipal', 'TESTE', 'decreto', '1', 'Decreto sem município')$$,
  '23514', null,
  'norma municipal sem municipio_ibge viola o check'
);

select throws_ok(
  $$insert into private.norma (chave, esfera, municipio_ibge, orgao, tipo, numero, titulo)
    values ('sc;teste;estadual;com;ibge', 'estadual', '4209102', 'TESTE', 'lei', '1', 'Lei com município')$$,
  '23514', null,
  'norma estadual com municipio_ibge viola o check'
);

select throws_ok(
  $$insert into private.norma_criterio (norma_id, tipo, valor, origem)
    values ('72000000-0000-4000-8000-000000000001', 'atividade', '33.10', 'curadoria')$$,
  '23514', null,
  'critério de atividade fora do formato 00.00.00 viola o check'
);

select lives_ok(
  $$insert into private.coleta (fonte, janela) values ('ima_in', '2026-11-20')$$,
  'coleta registra a janela'
);

select throws_ok(
  $$insert into private.coleta (fonte, janela) values ('ima_in', '2026-11-20')$$,
  '23505', null,
  'a mesma fonte e janela não gera outra coleta'
);

-- ---------------------------------------------------------------------------
-- Membro ativo: sem acesso direto, buscas e detalhe pelas RPCs
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select count(*) from private.norma$$,
  '42501', null,
  'authenticated não lê private.norma diretamente'
);

select throws_ok(
  $$select count(*) from private.norma_mudanca$$,
  '42501', null,
  'authenticated não lê private.norma_mudanca diretamente'
);

select results_eq(
  $$select chave from public.buscar_normas('efluentes liquidos acidos') where chave like 'sc;teste;%'$$,
  $$values ('sc;teste;in;02;2021'::text)$$,
  'busca por título sem acento encontra a IN'
);

select results_eq(
  $$select chave from public.buscar_normas('EFLUENTES LÍQUIDOS') where chave like 'sc;teste;%'$$,
  $$values ('sc;teste;in;02;2021'::text)$$,
  'busca por título com acento e em maiúsculas encontra a IN'
);

select results_eq(
  $$select chave from public.buscar_normas('IN 02') where chave like 'sc;teste;%'$$,
  $$values ('sc;teste;in;02;2021'::text)$$,
  'busca "IN 02" encontra a norma de número 02'
);

select results_eq(
  $$select chave from public.buscar_normas('IN 2') where chave like 'sc;teste;%'$$,
  $$values ('sc;teste;in;02;2021'::text)$$,
  'busca "IN 2" ignora o zero à esquerda'
);

select results_eq(
  $$select chave from public.buscar_normas('250/2024') where chave like 'sc;teste;%'$$,
  $$values ('sc;teste;portaria;250;2024'::text)$$,
  'busca "250/2024" traz só a do ano pedido'
);

select results_eq(
  $$select chave from public.buscar_normas('Portaria 250') where chave like 'sc;teste;%'$$,
  $$values ('sc;teste;portaria;250;2023'::text), ('sc;teste;portaria;250;2024')$$,
  'busca "Portaria 250" sem ano traz os dois anos, o mais antigo primeiro'
);

select results_eq(
  $$select chave from public.buscar_normas('14.675') where chave like 'sc;teste;%'$$,
  $$values ('sc;teste;lei;14.675;2009'::text)$$,
  'busca "14.675" encontra a lei pelo número com ponto'
);

select results_eq(
  $$select chave from public.buscar_normas('14675/2009') where chave like 'sc;teste;%'$$,
  $$values ('sc;teste;lei;14.675;2009'::text)$$,
  'busca "14675/2009" encontra a lei sem o ponto'
);

select results_eq(
  $$select ultima_versao_em, situacao_na_fonte from public.buscar_normas('IN 02')
    where chave = 'sc;teste;in;02;2021'$$,
  $$values ('2023-03-01'::date, 'vigente'::text)$$,
  'busca traz a data da última versão e a situação na fonte'
);

select results_eq(
  $$select chave, total from public.buscar_normas('zzpaginacao', 2)$$,
  $$values ('sc;teste;paginacao;901'::text, 5::bigint), ('sc;teste;paginacao;902', 5::bigint)$$,
  'paginação: p_limite 2 traz as duas primeiras e o total 5'
);

select results_eq(
  $$select chave, total from public.buscar_normas('zzpaginacao', 2, 4)$$,
  $$values ('sc;teste;paginacao;905'::text, 5::bigint)$$,
  'paginação: deslocamento 4 traz a última'
);

select is(
  (select count(*) from public.buscar_normas('zzpaginacao', 500)),
  5::bigint,
  'p_limite acima de 50 é limitado e não quebra'
);

select ok(
  (select max(total) >= 10 and count(*) = least(max(total), 50)
   from public.buscar_normas('', 1000)),
  'termo vazio lista o catálogo em páginas de no máximo 50'
);

select is(
  (select count(*) from public.buscar_normas('xyzsemresultado')),
  0::bigint,
  'termo sem correspondência devolve zero linhas'
);

select results_eq(
  $$select jsonb_path_query_array(public.detalhe_da_norma('72000000-0000-4000-8000-000000000001'),
                                  '$.versoes[*].numero')$$,
  $$values ('[3, 2, 1]'::jsonb)$$,
  'detalhe: versões em ordem decrescente'
);

select ok(
  not (public.detalhe_da_norma('72000000-0000-4000-8000-000000000001') -> 'versoes' -> 0) ? 'texto'
  and (public.detalhe_da_norma('72000000-0000-4000-8000-000000000001') #>> '{versoes,1,tem_texto}')::boolean
      = false
  and (public.detalhe_da_norma('72000000-0000-4000-8000-000000000001') #>> '{versoes,0,tem_texto}')::boolean,
  'detalhe: versões sem o texto, só tem_texto'
);

select results_eq(
  $$select jsonb_path_query_array(public.detalhe_da_norma('72000000-0000-4000-8000-000000000001'),
                                  '$.mudancas[*].id')$$,
  $$values ('["72000000-0000-4000-8000-000000000b02"]'::jsonb)$$,
  'detalhe: só a mudança publicada aparece'
);

select is(
  public.detalhe_da_norma('72000000-0000-4000-8000-000000000001') -> 'criterios',
  '[{"tipo": "atividade", "valor": "33.10.00", "origem": "simulador_ima"},
    {"tipo": "tipo_licenca", "valor": "LAO", "origem": "curadoria"}]'::jsonb,
  'detalhe: critérios ordenados por tipo e valor'
);

select is(
  public.detalhe_da_norma('72000000-0000-4000-8000-000000000005') ->> 'municipio_ibge',
  '4209102',
  'detalhe: norma municipal traz o município'
);

select is(
  public.detalhe_da_norma('72000000-0000-4000-8000-0000000000ff'),
  null::jsonb,
  'detalhe: id inexistente devolve nulo'
);

select results_eq(
  $$select count(*), bool_or(ativa) from public.listar_fontes_legais()$$,
  $$values (10::bigint, false)$$,
  'listar_fontes_legais: as 10 fontes, todas desligadas'
);

-- ---------------------------------------------------------------------------
-- Fontes vazias (L5 e L6)
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from private.linhas_de_prazo_acao_legal('c0000000-0000-4000-8000-00000000000a')),
  0::bigint,
  'fonte de ação legal nasce vazia'
);

select ok(
  private.tipo_linha_tem_responsavel('acao_legal')
  and private.tipo_linha_tem_responsavel('ocorrencia')
  and private.tipo_linha_tem_responsavel('exigencia')
  and not private.tipo_linha_tem_responsavel('validade'),
  'acao_legal tem responsável, como ocorrência e exigência'
);

select is(
  (select count(*) from private.busca_normas('c0000000-0000-4000-8000-00000000000a', 'zzpaginacao')),
  0::bigint,
  'grupo de normas da busca nasce vazio'
);

select results_eq(
  $$select tipo, count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'zzpaginacao')
    group by tipo order by tipo$$,
  $$values ('empreendimento'::text, 1::bigint)$$,
  'busca global continua funcionando e não traz norma enquanto o grupo estiver vazio'
);

select is(
  (select count(*) from public.listar_prazos('c0000000-0000-4000-8000-00000000000a')),
  0::bigint,
  'listar_prazos funciona com a fonte nova na união'
);

-- ---------------------------------------------------------------------------
-- Sem vínculo ativo: zero linhas e nulo
-- ---------------------------------------------------------------------------
select testes.autenticar_como('sem.vinculo@normas.test');

select is(
  (select count(*) from public.buscar_normas('')),
  0::bigint,
  'usuário sem vínculo recebe zero normas'
);

select is(
  public.detalhe_da_norma('72000000-0000-4000-8000-000000000001'),
  null::jsonb,
  'usuário sem vínculo recebe nulo no detalhe'
);

select is(
  (select count(*) from public.listar_fontes_legais()),
  0::bigint,
  'usuário sem vínculo não lista as fontes'
);

select testes.autenticar_como('diego@filtroville.test');

select is(
  (select count(*) from public.buscar_normas('IN 02')),
  0::bigint,
  'membro desligado recebe zero normas'
);

select is(
  public.detalhe_da_norma('72000000-0000-4000-8000-000000000001'),
  null::jsonb,
  'membro desligado recebe nulo no detalhe'
);

select testes.autenticar_como('gustavo@verdesul.test');

select is(
  (select count(*) from public.buscar_normas('IN 02') where chave = 'sc;teste;in;02;2021'),
  1::bigint,
  'membro ativo de outra consultoria também lê o catálogo global'
);

-- ---------------------------------------------------------------------------
-- Anônimo: execute revogado
-- ---------------------------------------------------------------------------
select testes.autenticar_como_anonimo();

select throws_ok(
  $$select count(*) from public.buscar_normas('IN 02')$$,
  '42501', null,
  'anônimo não executa buscar_normas'
);

select throws_ok(
  $$select public.detalhe_da_norma('72000000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'anônimo não executa detalhe_da_norma'
);

select throws_ok(
  $$select count(*) from public.listar_fontes_legais()$$,
  '42501', null,
  'anônimo não executa listar_fontes_legais'
);

reset role;

select * from finish();

rollback;
