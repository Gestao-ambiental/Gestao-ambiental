-- Avisos de mudança de norma (L5, ADR-0050, LEG-05 e LEG-06): a publicação pelo operador gera os
-- aviso_norma pelos critérios da norma (atividade, prefixo, município, competência, tipo de licença,
-- norma municipal), sem duplicar ao repetir; mudança não publicada não gera aviso; a consultoria lê,
-- conta e marca como vista; selo por licença; outra consultoria lê zero e não marca; grupo de normas
-- do Ctrl+K real.
begin;

select plan(63);

select testes.criar_dados_sinteticos();

select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '73600000-0000-4000-8000-0000000000ee', 'authenticated',
        'authenticated', 'operador736@grama.test', '', now(),
        '{"provider": "email", "providers": ["email"]}'::jsonb, '{"nome": "Operador 736"}'::jsonb, now(), now());
insert into private.operador_plataforma (usuario_id) values ('73600000-0000-4000-8000-0000000000ee');

-- ---------------------------------------------------------------------------
-- Cenário (como dono)
-- A: E1 Posto Litoral (cliente C1, unidade em Joinville): L1 LAO IMA ativa com 47.30.00 e L1r
--      rascunho com 47.30.00.
--    E2 Padaria Sol (sem cliente, unidade em Blumenau): 47.30.00 só no empreendimento.
--    E3 Metalúrgica Norte (cliente C1, unidade em Joinville): L3 AuA da SAMA ativa com 34.11.00.
--    E4 Fábrica Sem Local (cliente C2, unidade sem município): L4 LAO FATMA ativa, sem atividade.
-- B: EB Posto Rota Sul (unidade em Joinville): LB LAO IMA ativa com 47.30.00.
-- ---------------------------------------------------------------------------
insert into public.cliente (id, consultoria_id, nome) values
  ('73600000-0000-4000-8000-0000000000c1', 'c0000000-0000-4000-8000-00000000000a', 'Grupo Litoral'),
  ('73600000-0000-4000-8000-0000000000c2', 'c0000000-0000-4000-8000-00000000000a', 'Indústrias Serra');

insert into public.empreendimento (id, consultoria_id, nome, cliente_id, criado_por) values
  ('73600000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a', 'Posto Litoral',
   '73600000-0000-4000-8000-0000000000c1', 'd0000000-0000-4000-8000-0000000000a1'),
  ('73600000-0000-4000-8000-0000000000e2', 'c0000000-0000-4000-8000-00000000000a', 'Padaria Sol',
   null, 'd0000000-0000-4000-8000-0000000000a1'),
  ('73600000-0000-4000-8000-0000000000e3', 'c0000000-0000-4000-8000-00000000000a', 'Metalúrgica Norte',
   '73600000-0000-4000-8000-0000000000c1', 'd0000000-0000-4000-8000-0000000000a1'),
  ('73600000-0000-4000-8000-0000000000e4', 'c0000000-0000-4000-8000-00000000000a', 'Fábrica Sem Local',
   '73600000-0000-4000-8000-0000000000c2', 'd0000000-0000-4000-8000-0000000000a1'),
  ('73600000-0000-4000-8000-0000000000eb', 'c0000000-0000-4000-8000-00000000000b', 'Posto Rota Sul',
   null, 'd0000000-0000-4000-8000-0000000000b1');

insert into public.unidade (id, consultoria_id, empreendimento_id, nome, municipio_ibge, municipio_nome,
                            municipio_gravado_em) values
  ('73600000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
   '73600000-0000-4000-8000-0000000000e1', 'Matriz', '4209102', 'Joinville', now()),
  ('73600000-0000-4000-8000-0000000000f2', 'c0000000-0000-4000-8000-00000000000a',
   '73600000-0000-4000-8000-0000000000e2', 'Matriz', '4202404', 'Blumenau', now()),
  ('73600000-0000-4000-8000-0000000000f3', 'c0000000-0000-4000-8000-00000000000a',
   '73600000-0000-4000-8000-0000000000e3', 'Matriz', '4209102', 'Joinville', now()),
  ('73600000-0000-4000-8000-0000000000f4', 'c0000000-0000-4000-8000-00000000000a',
   '73600000-0000-4000-8000-0000000000e4', 'Matriz', null, null, null),
  ('73600000-0000-4000-8000-0000000000fb', 'c0000000-0000-4000-8000-00000000000b',
   '73600000-0000-4000-8000-0000000000eb', 'Matriz', '4209102', 'Joinville', now());

insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, tipo_id, numero, orgao, situacao,
                                assinado_em, marco, validade, criado_por, ativado_em, ativado_por, chave_ativacao)
select x.id, x.cid, x.eid, x.uid,
       (select t.id from public.tipo_instrumento as t where t.sigla = x.sigla and t.consultoria_id = x.cid),
       x.numero, x.orgao, 'ativo', current_setting('testes.hoje')::date - 300, 'assinatura',
       current_setting('testes.hoje')::date + 400, x.gestao, now(), x.gestao, gen_random_uuid()
from (values
  ('73600000-0000-4000-8000-000000000011'::uuid, 'c0000000-0000-4000-8000-00000000000a'::uuid,
   '73600000-0000-4000-8000-0000000000e1'::uuid, '73600000-0000-4000-8000-0000000000f1'::uuid, 'LAO',
   '100/2024', 'IMA', 'd0000000-0000-4000-8000-0000000000a1'::uuid),
  ('73600000-0000-4000-8000-000000000013', 'c0000000-0000-4000-8000-00000000000a',
   '73600000-0000-4000-8000-0000000000e3', '73600000-0000-4000-8000-0000000000f3', 'AuA',
   '300/2024', 'SAMA Joinville', 'd0000000-0000-4000-8000-0000000000a1'),
  ('73600000-0000-4000-8000-000000000014', 'c0000000-0000-4000-8000-00000000000a',
   '73600000-0000-4000-8000-0000000000e4', '73600000-0000-4000-8000-0000000000f4', 'LAO',
   '400/2024', 'FATMA', 'd0000000-0000-4000-8000-0000000000a1'),
  ('73600000-0000-4000-8000-00000000001b', 'c0000000-0000-4000-8000-00000000000b',
   '73600000-0000-4000-8000-0000000000eb', '73600000-0000-4000-8000-0000000000fb', 'LAO',
   '900/2024', 'IMA', 'd0000000-0000-4000-8000-0000000000b1')
) as x (id, cid, eid, uid, sigla, numero, orgao, gestao);

insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, numero, orgao, criado_por)
values ('73600000-0000-4000-8000-000000000012', 'c0000000-0000-4000-8000-00000000000a',
        '73600000-0000-4000-8000-0000000000e1', '73600000-0000-4000-8000-0000000000f1', '101/2024', 'IMA',
        'd0000000-0000-4000-8000-0000000000a1');

insert into public.atividade_licenciada (consultoria_id, instrumento_id, codigo, descricao, porte, potencial, fonte,
                                         registrado_por)
values
  ('c0000000-0000-4000-8000-00000000000a', '73600000-0000-4000-8000-000000000011', '47.30.00',
   'Comércio de combustíveis', 'pequeno', 'M', 'Resolução CONSEMA 250/2024', 'd0000000-0000-4000-8000-0000000000a1'),
  ('c0000000-0000-4000-8000-00000000000a', '73600000-0000-4000-8000-000000000012', '47.30.00',
   'Comércio de combustíveis', 'pequeno', 'M', 'Resolução CONSEMA 250/2024', 'd0000000-0000-4000-8000-0000000000a1'),
  ('c0000000-0000-4000-8000-00000000000a', '73600000-0000-4000-8000-000000000013', '34.11.00',
   'Estruturas metálicas', 'pequeno', 'M', 'Resolução CONSEMA 250/2024', 'd0000000-0000-4000-8000-0000000000a1'),
  ('c0000000-0000-4000-8000-00000000000b', '73600000-0000-4000-8000-00000000001b', '47.30.00',
   'Comércio de combustíveis', 'pequeno', 'M', 'Resolução CONSEMA 250/2024', 'd0000000-0000-4000-8000-0000000000b1');

insert into public.atividade_do_empreendimento (consultoria_id, empreendimento_id, codigo, descricao, porte,
                                                potencial, fonte, registrado_por)
values ('c0000000-0000-4000-8000-00000000000a', '73600000-0000-4000-8000-0000000000e2', '47.30.00',
        'Comércio de combustíveis', 'pequeno', 'M', 'Resolução CONSEMA 250/2024',
        'd0000000-0000-4000-8000-0000000000a1');

-- Normas N01..N13 (uma versão e uma mudança cada). Critérios:
-- N01 atividade 47.30.00 · N02 prefixo 34 · N03 município Joinville · N04 competência estadual
-- N05 competência municipal + AuA · N06 atividade 47.30.00 + AuA · N07 norma de Joinville + competência
-- municipal · N08 norma de Blumenau + atividade 47.30.00 · N09 só tema · N10 atividade 47.30.00 +
-- município Joinville · N11 sem critério (o operador confirma prefixo 34.11 ao publicar)
-- N12 atividade 47.30.00, mudança só detectada · N13 atividade 47.30.00, mudança descartada
insert into private.norma (id, chave, esfera, municipio_ibge, orgao, tipo, numero, ano, titulo, situacao_na_fonte)
select ('73600000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid,
       'sc;teste736;n' || n::text,
       case when n in (7, 8) then 'municipal' else 'estadual' end,
       case n when 7 then '4209102' when 8 then '4202404' end,
       'IMA-TESTE', 'portaria', '736' || n::text, 2026, 'Portaria Teste 736 número ' || n::text, 'vigente'
from generate_series(1, 13) as n;

-- Para a busca: uma IN 02 revogada e uma IN 20.
insert into private.norma (id, chave, esfera, orgao, tipo, numero, ano, titulo, situacao_na_fonte) values
  ('73600000-0000-4000-8000-000000000150', 'sc;teste736;in;02', 'estadual', 'IMA-TESTE', 'instrucao_normativa',
   '02', 2020, 'IN 02 · Teste 736 de efluentes', 'revogada'),
  ('73600000-0000-4000-8000-000000000151', 'sc;teste736;in;20', 'estadual', 'IMA-TESTE', 'instrucao_normativa',
   '20', 2020, 'IN 20 · Teste 736 de ruído', 'vigente');

insert into private.norma_versao (id, norma_id, numero, sha256)
select ('73600000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid,
       ('73600000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid, 1, lpad('736' || n::text, 64, '0')
from generate_series(1, 13) as n;

insert into private.norma_criterio (norma_id, tipo, valor, origem)
select ('73600000-0000-4000-8000-0000000001' || c.n)::uuid, c.tipo, c.valor, 'curadoria'
from (values
  ('01', 'atividade', '47.30.00'),
  ('02', 'prefixo_atividade', '34'),
  ('03', 'municipio', '4209102'),
  ('04', 'competencia', 'estadual'),
  ('05', 'competencia', 'municipal'), ('05', 'tipo_licenca', 'AuA'),
  ('06', 'atividade', '47.30.00'), ('06', 'tipo_licenca', 'AuA'),
  ('07', 'competencia', 'municipal'),
  ('08', 'atividade', '47.30.00'),
  ('09', 'tema', 'efluentes'),
  ('10', 'atividade', '47.30.00'), ('10', 'municipio', '4209102'),
  ('12', 'atividade', '47.30.00'),
  ('13', 'atividade', '47.30.00')
) as c (n, tipo, valor);

insert into private.norma_mudanca (id, norma_id, versao_nova_id, tipo)
select ('73600000-0000-4000-8000-0000000003' || lpad(n::text, 2, '0'))::uuid,
       ('73600000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid,
       ('73600000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid, 'nova'
from generate_series(1, 13) as n;

create temporary table mudancas_736 (rotulo text primary key, id uuid, criterios jsonb);
insert into mudancas_736
select 'N' || lpad(n::text, 2, '0'), ('73600000-0000-4000-8000-0000000003' || lpad(n::text, 2, '0'))::uuid,
       case n when 11 then '[{"tipo": "prefixo_atividade", "valor": "34.11"}]'::jsonb else '[]'::jsonb end
from generate_series(1, 11) as n;
grant select on mudancas_736 to authenticated;

-- ---------------------------------------------------------------------------
-- Estrutura e permissões
-- ---------------------------------------------------------------------------
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity from pg_catalog.pg_class as c
   where c.oid = 'public.aviso_norma'::regclass),
  'aviso_norma tem RLS habilitada e forçada'
);
select is(
  (select array_agg(t.tgname::text order by t.tgname) from pg_catalog.pg_trigger as t
   where t.tgrelid = 'public.aviso_norma'::regclass and not t.tgisinternal),
  array['_suporte_somente_leitura'],
  'só a barreira de suporte: aviso de lei não para por inadimplência'
);
select is(
  (select coalesce(array_agg(g.grantee::text || ':' || g.privilege_type order by g.grantee, g.privilege_type), '{}')
   from information_schema.role_table_grants as g
   where g.table_schema = 'public' and g.table_name = 'aviso_norma' and g.grantee in ('anon', 'authenticated')),
  array['authenticated:SELECT'],
  'authenticated só lê; anon nada'
);
select col_is_unique('public', 'aviso_norma', array['consultoria_id', 'id'],
  'unique (consultoria_id, id) para FKs compostas');
select is(
  (select array_agg(c.conname::text order by c.conname) from pg_catalog.pg_constraint as c
   where c.conrelid = 'public.aviso_norma'::regclass and c.contype = 'f' and array_length(c.conkey, 1) = 2),
  array['aviso_norma_empreendimento_fk', 'aviso_norma_instrumento_fk', 'aviso_norma_visto_por_fk'],
  'empreendimento, licença e membro por FK composta'
);
select ok(
  (select bool_and(has_function_privilege('authenticated', f, 'execute')
                   and not has_function_privilege('anon', f, 'execute'))
   from unnest(array[
     'public.listar_mudancas_de_norma_da_consultoria(uuid, boolean, integer, integer)',
     'public.contar_mudancas_de_norma_nao_vistas(uuid)',
     'public.afetados_pela_mudanca(uuid, uuid)',
     'public.marcar_mudanca_de_norma_vista(uuid, uuid)',
     'public.licencas_com_mudanca_de_norma(uuid, uuid)'
   ]) as f),
  'RPCs de leitura e marcar: authenticated executa, anon não'
);
select ok(
  not has_function_privilege('authenticated', 'private.empreendimentos_afetados(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.gerar_avisos_da_mudanca(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.gerar_avisos_da_mudanca(uuid)', 'execute'),
  'o cliente não calcula nem gera avisos'
);
select ok(
  pg_catalog.pg_get_functiondef('public.central_publicar_mudanca_de_norma(uuid, jsonb, jsonb)'::regprocedure)
    like '%private.gerar_avisos_da_mudanca(alvo.id)%',
  'publicar gera os avisos na mesma transação'
);

-- ---------------------------------------------------------------------------
-- Operador publica N01..N11
-- ---------------------------------------------------------------------------
select testes.autenticar_com_dois_fatores('operador736@grama.test');

select lives_ok(
  $$select public.central_publicar_mudanca_de_norma(m.id, jsonb_build_object('resumo', 'Resumo da ' || m.rotulo),
                                                     m.criterios)
    from mudancas_736 as m order by m.rotulo$$,
  'operador com dois fatores publica as mudanças'
);

reset role;

-- Ordem da aba: N01 a mais recente.
update private.norma_mudanca as m
set publicada_em = now() - make_interval(hours => right(x.rotulo, 2)::integer)
from mudancas_736 as x
where x.id = m.id;

-- ---------------------------------------------------------------------------
-- Quem recebe aviso
-- ---------------------------------------------------------------------------
select results_eq(
  $$select empreendimento_id, instrumento_id, motivo from public.aviso_norma
    where mudanca_id = '73600000-0000-4000-8000-000000000301' order by empreendimento_id, instrumento_id nulls first$$,
  $$values ('73600000-0000-4000-8000-0000000000e1'::uuid, '73600000-0000-4000-8000-000000000011'::uuid,
            '{"criterio": "atividade", "valor": "47.30.00"}'::jsonb),
           ('73600000-0000-4000-8000-0000000000e2', null, '{"criterio": "atividade", "valor": "47.30.00"}'),
           ('73600000-0000-4000-8000-0000000000eb', '73600000-0000-4000-8000-00000000001b',
            '{"criterio": "atividade", "valor": "47.30.00"}')$$,
  'atividade: licença ativa (nas duas consultorias) e atividade só no empreendimento; rascunho fica de fora'
);

select results_eq(
  $$select empreendimento_id, instrumento_id, motivo from public.aviso_norma
    where mudanca_id = '73600000-0000-4000-8000-000000000302' order by empreendimento_id, instrumento_id nulls first$$,
  $$values ('73600000-0000-4000-8000-0000000000e3'::uuid, '73600000-0000-4000-8000-000000000013'::uuid,
            '{"criterio": "prefixo_atividade", "valor": "34"}'::jsonb)$$,
  'prefixo 34 casa 34.11.00'
);

select results_eq(
  $$select empreendimento_id, instrumento_id, motivo from public.aviso_norma
    where mudanca_id = '73600000-0000-4000-8000-000000000303' order by empreendimento_id, instrumento_id nulls first$$,
  $$values ('73600000-0000-4000-8000-0000000000e1'::uuid, null::uuid,
            '{"criterio": "municipio", "valor": "4209102"}'::jsonb),
           ('73600000-0000-4000-8000-0000000000e3', null, '{"criterio": "municipio", "valor": "4209102"}'),
           ('73600000-0000-4000-8000-0000000000eb', null, '{"criterio": "municipio", "valor": "4209102"}')$$,
  'município: empreendimentos com unidade em Joinville, sem licença'
);

select results_eq(
  $$select empreendimento_id, instrumento_id, motivo from public.aviso_norma
    where mudanca_id = '73600000-0000-4000-8000-000000000304' order by empreendimento_id, instrumento_id nulls first$$,
  $$values ('73600000-0000-4000-8000-0000000000e1'::uuid, '73600000-0000-4000-8000-000000000011'::uuid,
            '{"criterio": "competencia", "valor": "estadual"}'::jsonb),
           ('73600000-0000-4000-8000-0000000000e4', '73600000-0000-4000-8000-000000000014',
            '{"criterio": "competencia", "valor": "estadual"}'),
           ('73600000-0000-4000-8000-0000000000eb', '73600000-0000-4000-8000-00000000001b',
            '{"criterio": "competencia", "valor": "estadual"}')$$,
  'competência estadual: licenças ativas do IMA e da FATMA'
);

select results_eq(
  $$select empreendimento_id, instrumento_id, motivo from public.aviso_norma
    where mudanca_id = '73600000-0000-4000-8000-000000000305' order by empreendimento_id, instrumento_id nulls first$$,
  $$values ('73600000-0000-4000-8000-0000000000e3'::uuid, '73600000-0000-4000-8000-000000000013'::uuid,
            '{"criterio": "competencia", "valor": "municipal"}'::jsonb)$$,
  'competência municipal com tipo AuA: só a AuA do órgão municipal'
);

select results_eq(
  $$select empreendimento_id, instrumento_id, motivo from public.aviso_norma
    where mudanca_id = '73600000-0000-4000-8000-000000000306' order by empreendimento_id, instrumento_id nulls first$$,
  $$values ('73600000-0000-4000-8000-0000000000e2'::uuid, null::uuid,
            '{"criterio": "atividade", "valor": "47.30.00"}'::jsonb)$$,
  'tipo de licença restringe as licenças (LAO fica de fora); a atividade do empreendimento continua'
);

select results_eq(
  $$select empreendimento_id, instrumento_id, motivo from public.aviso_norma
    where mudanca_id = '73600000-0000-4000-8000-000000000307' order by empreendimento_id, instrumento_id nulls first$$,
  $$values ('73600000-0000-4000-8000-0000000000e3'::uuid, '73600000-0000-4000-8000-000000000013'::uuid,
            '{"criterio": "competencia", "valor": "municipal"}'::jsonb)$$,
  'norma de Joinville: só empreendimentos com unidade em Joinville'
);

select results_eq(
  $$select empreendimento_id, instrumento_id, motivo from public.aviso_norma
    where mudanca_id = '73600000-0000-4000-8000-000000000308' order by empreendimento_id, instrumento_id nulls first$$,
  $$values ('73600000-0000-4000-8000-0000000000e2'::uuid, null::uuid,
            '{"criterio": "atividade", "valor": "47.30.00"}'::jsonb)$$,
  'norma de Blumenau com atividade: só o empreendimento de Blumenau'
);

select is(
  (select count(*) from public.aviso_norma where mudanca_id = '73600000-0000-4000-8000-000000000309'),
  0::bigint,
  'norma só com tema não alcança ninguém'
);

select results_eq(
  $$select empreendimento_id, instrumento_id, motivo from public.aviso_norma
    where mudanca_id = '73600000-0000-4000-8000-000000000310' order by empreendimento_id, instrumento_id nulls first$$,
  $$values ('73600000-0000-4000-8000-0000000000e1'::uuid, '73600000-0000-4000-8000-000000000011'::uuid,
            '{"criterio": "atividade", "valor": "47.30.00"}'::jsonb),
           ('73600000-0000-4000-8000-0000000000e2', null, '{"criterio": "atividade", "valor": "47.30.00"}'),
           ('73600000-0000-4000-8000-0000000000eb', '73600000-0000-4000-8000-00000000001b',
            '{"criterio": "atividade", "valor": "47.30.00"}')$$,
  'com atividade, o critério de município não amplia (E3 em Joinville fica de fora)'
);

select results_eq(
  $$select empreendimento_id, instrumento_id, motivo from public.aviso_norma
    where mudanca_id = '73600000-0000-4000-8000-000000000311' order by empreendimento_id, instrumento_id nulls first$$,
  $$values ('73600000-0000-4000-8000-0000000000e3'::uuid, '73600000-0000-4000-8000-000000000013'::uuid,
            '{"criterio": "prefixo_atividade", "valor": "34.11"}'::jsonb)$$,
  'critério confirmado na publicação já gera aviso'
);

select results_eq(
  $$select consultoria_id, count(*) from public.aviso_norma group by consultoria_id order by consultoria_id$$,
  $$values ('c0000000-0000-4000-8000-00000000000a'::uuid, 14::bigint),
           ('c0000000-0000-4000-8000-00000000000b'::uuid, 4::bigint)$$,
  '14 avisos em A e 4 em B'
);

-- ---------------------------------------------------------------------------
-- Não publicada, repetição e unicidade
-- ---------------------------------------------------------------------------
update private.norma_mudanca
set situacao = 'descartada', revisada_por = '73600000-0000-4000-8000-0000000000ee', motivo_descarte = 'Teste'
where id = '73600000-0000-4000-8000-000000000313';

select ok(
  (select count(*) from private.empreendimentos_afetados('73600000-0000-4000-8000-000000000312')) = 3,
  'a regra alcança três para a mudança só detectada'
);
select is(
  private.gerar_avisos_da_mudanca('73600000-0000-4000-8000-000000000312'),
  0,
  'mudança detectada não gera aviso'
);
select is(
  private.gerar_avisos_da_mudanca('73600000-0000-4000-8000-000000000313'),
  0,
  'mudança descartada não gera aviso'
);
select is(
  (select count(*) from public.aviso_norma
   where mudanca_id in ('73600000-0000-4000-8000-000000000312', '73600000-0000-4000-8000-000000000313')),
  0::bigint,
  'nenhum aviso de mudança não publicada'
);

select testes.autenticar_com_dois_fatores('operador736@grama.test');
select throws_ok(
  $$select public.central_publicar_mudanca_de_norma('73600000-0000-4000-8000-000000000301', '{"resumo": "De novo"}', '[]')$$,
  'P0001', 'mudanca_ja_revisada',
  'publicar de novo é recusado'
);
reset role;

select throws_ok(
  $$insert into public.aviso_norma (consultoria_id, mudanca_id, empreendimento_id, instrumento_id, motivo)
    values ('c0000000-0000-4000-8000-00000000000a', '73600000-0000-4000-8000-000000000301',
            '73600000-0000-4000-8000-0000000000e2', null, '{"criterio": "atividade", "valor": "47.30.00"}')$$,
  '23505', null,
  'o mesmo aviso sem licença não duplica (licença nula conta como valor)'
);
select throws_ok(
  $$insert into public.aviso_norma (consultoria_id, mudanca_id, empreendimento_id, motivo)
    values ('c0000000-0000-4000-8000-00000000000a', '73600000-0000-4000-8000-000000000301',
            '73600000-0000-4000-8000-0000000000eb', '{"criterio": "atividade", "valor": "47.30.00"}')$$,
  '23503', null,
  'FK composta: empreendimento de B não entra em aviso de A'
);

-- ---------------------------------------------------------------------------
-- Leitura da consultoria
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');

select results_eq(
  $$select x.rotulo, l.empreendimentos, l.licencas, l.clientes, l.nao_vista, l.total
    from public.listar_mudancas_de_norma_da_consultoria('c0000000-0000-4000-8000-00000000000a', false, 100) as l
    join mudancas_736 as x on x.id = l.mudanca_id$$,
  $$values ('N01'::text, 2, 1, 1, true, 10::bigint), ('N02', 1, 1, 1, true, 10), ('N03', 2, 0, 1, true, 10),
           ('N04', 2, 2, 2, true, 10), ('N05', 1, 1, 1, true, 10), ('N06', 1, 0, 0, true, 10),
           ('N07', 1, 1, 1, true, 10), ('N08', 1, 0, 0, true, 10), ('N10', 2, 1, 1, true, 10),
           ('N11', 1, 1, 1, true, 10)$$,
  'aba Normas: mais recentes primeiro, com empreendimentos, licenças e clientes'
);

select results_eq(
  $$select norma_titulo, tipo_mudanca, resumo, total
    from public.listar_mudancas_de_norma_da_consultoria('c0000000-0000-4000-8000-00000000000a', false, 2)$$,
  $$values ('Portaria Teste 736 número 1'::text, 'nova'::text, 'Resumo da N01'::text, 10::bigint),
           ('Portaria Teste 736 número 2', 'nova', 'Resumo da N02', 10)$$,
  'paginação: título, tipo e resumo revisado; total de todas'
);

select results_eq(
  $$select x.rotulo from public.listar_mudancas_de_norma_da_consultoria('c0000000-0000-4000-8000-00000000000a',
                                                                        false, 2, 9) as l
    join mudancas_736 as x on x.id = l.mudanca_id$$,
  $$values ('N11'::text)$$,
  'paginação: deslocamento 9 traz a última'
);

select is(
  public.contar_mudancas_de_norma_nao_vistas('c0000000-0000-4000-8000-00000000000a'),
  10,
  'dez mudanças não vistas em A'
);

select results_eq(
  $$select empreendimento_id, empreendimento_nome, cliente_nome, instrumento_id, licenca, motivo ->> 'criterio', visto_em
    from public.afetados_pela_mudanca('c0000000-0000-4000-8000-00000000000a', '73600000-0000-4000-8000-000000000301')$$,
  $$values ('73600000-0000-4000-8000-0000000000e2'::uuid, 'Padaria Sol'::text, null::text, null::uuid, null::text,
            'atividade'::text, null::timestamptz),
           ('73600000-0000-4000-8000-0000000000e1', 'Posto Litoral', 'Grupo Litoral',
            '73600000-0000-4000-8000-000000000011', 'LAO 100/2024', 'atividade', null)$$,
  'afetados: só os de A, por nome, com cliente, licença e motivo'
);

select results_eq(
  $$select instrumento_id, mudancas
    from public.licencas_com_mudanca_de_norma('c0000000-0000-4000-8000-00000000000a', '73600000-0000-4000-8000-0000000000e3')$$,
  $$values ('73600000-0000-4000-8000-000000000013'::uuid, 4)$$,
  'selo da licença: a AuA de E3 tem quatro mudanças não vistas'
);

select results_eq(
  $$select instrumento_id, mudancas
    from public.licencas_com_mudanca_de_norma('c0000000-0000-4000-8000-00000000000a', '73600000-0000-4000-8000-0000000000e1')$$,
  $$values ('73600000-0000-4000-8000-000000000011'::uuid, 3)$$,
  'selo da licença: a LAO de E1 tem três (o aviso de município não tem licença)'
);

select throws_ok(
  $$insert into public.aviso_norma (consultoria_id, mudanca_id, empreendimento_id, motivo)
    values ('c0000000-0000-4000-8000-00000000000a', '73600000-0000-4000-8000-000000000309',
            '73600000-0000-4000-8000-0000000000e1', '{"criterio": "tema", "valor": "efluentes"}')$$,
  '42501', null,
  'membro não insere aviso direto'
);

select throws_ok(
  $$update public.aviso_norma set visto_em = now() where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'$$,
  '42501', null,
  'membro não altera aviso direto'
);

-- Equipe marca como vista.
select testes.autenticar_como('ana@filtroville.test');

select is(
  public.marcar_mudanca_de_norma_vista('c0000000-0000-4000-8000-00000000000a', '73600000-0000-4000-8000-000000000301'),
  2,
  'Equipe marca a mudança como vista (dois avisos de A)'
);
select is(
  public.marcar_mudanca_de_norma_vista('c0000000-0000-4000-8000-00000000000a', '73600000-0000-4000-8000-000000000301'),
  0,
  'marcar de novo não muda nada'
);
select is(
  public.contar_mudancas_de_norma_nao_vistas('c0000000-0000-4000-8000-00000000000a'),
  9,
  'nove não vistas depois de marcar'
);
select results_eq(
  $$select l.nao_vista from public.listar_mudancas_de_norma_da_consultoria('c0000000-0000-4000-8000-00000000000a') as l
    where l.mudanca_id = '73600000-0000-4000-8000-000000000301'$$,
  $$values (false)$$,
  'a lista mostra a mudança como vista'
);
select ok(
  (select count(*) = 9 and bool_and(l.nao_vista) and bool_and(l.total = 9)
          and not bool_or(l.mudanca_id = '73600000-0000-4000-8000-000000000301')
   from public.listar_mudancas_de_norma_da_consultoria('c0000000-0000-4000-8000-00000000000a', true) as l),
  'só não vistas: nove, sem a marcada'
);
select results_eq(
  $$select instrumento_id, mudancas
    from public.licencas_com_mudanca_de_norma('c0000000-0000-4000-8000-00000000000a', '73600000-0000-4000-8000-0000000000e1')$$,
  $$values ('73600000-0000-4000-8000-000000000011'::uuid, 2)$$,
  'o selo da LAO de E1 cai para duas'
);

reset role;

select results_eq(
  $$select consultoria_id, count(*) filter (where visto_em is not null), bool_and(visto_por is not distinct from
           case when visto_em is null then null else 'd0000000-0000-4000-8000-0000000000a2'::uuid end)
    from public.aviso_norma where mudanca_id = '73600000-0000-4000-8000-000000000301'
    group by consultoria_id order by consultoria_id$$,
  $$values ('c0000000-0000-4000-8000-00000000000a'::uuid, 2::bigint, true),
           ('c0000000-0000-4000-8000-00000000000b'::uuid, 0::bigint, true)$$,
  'visto por Ana só em A; o aviso de B continua não visto'
);

select is(
  private.gerar_avisos_da_mudanca('73600000-0000-4000-8000-000000000301'),
  0,
  'gerar de novo a mudança publicada não cria nada'
);
select is(
  (select count(*) from public.aviso_norma
   where mudanca_id = '73600000-0000-4000-8000-000000000301' and visto_em is not null),
  2::bigint,
  'gerar de novo não desfaz o visto'
);

-- ---------------------------------------------------------------------------
-- Outra consultoria
-- ---------------------------------------------------------------------------
select testes.autenticar_como('gustavo@verdesul.test');

select is(
  (select count(*) from public.aviso_norma where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  0::bigint,
  'Gestão de B lê zero avisos de A'
);
select is(
  (select count(*) from public.aviso_norma),
  4::bigint,
  'Gestão de B lê só os quatro avisos de B'
);
select is(
  (select count(*) from public.listar_mudancas_de_norma_da_consultoria('c0000000-0000-4000-8000-00000000000a')),
  0::bigint,
  'Gestão de B lista as mudanças de A e recebe zero linhas'
);
select is(
  public.contar_mudancas_de_norma_nao_vistas('c0000000-0000-4000-8000-00000000000a'),
  0,
  'Gestão de B conta as de A e recebe zero'
);
select is(
  (select count(*) from public.afetados_pela_mudanca('c0000000-0000-4000-8000-00000000000a',
                                                     '73600000-0000-4000-8000-000000000301')),
  0::bigint,
  'Gestão de B recebe zero afetados de A'
);
select is(
  (select count(*) from public.licencas_com_mudanca_de_norma('c0000000-0000-4000-8000-00000000000a',
                                                              '73600000-0000-4000-8000-0000000000e1')),
  0::bigint,
  'Gestão de B recebe zero selos de A'
);
select throws_ok(
  $$select public.marcar_mudanca_de_norma_vista('c0000000-0000-4000-8000-00000000000a',
                                                '73600000-0000-4000-8000-000000000301')$$,
  '42501', 'sem_permissao',
  'Gestão de B não marca mudança de A'
);
select results_eq(
  $$select x.rotulo, l.empreendimentos, l.licencas, l.nao_vista
    from public.listar_mudancas_de_norma_da_consultoria('c0000000-0000-4000-8000-00000000000b') as l
    join mudancas_736 as x on x.id = l.mudanca_id$$,
  $$values ('N01'::text, 1, 1, true), ('N03', 1, 0, true), ('N04', 1, 1, true), ('N10', 1, 1, true)$$,
  'B vê as próprias quatro, N01 ainda não vista'
);
select is(
  public.contar_mudancas_de_norma_nao_vistas('c0000000-0000-4000-8000-00000000000b'),
  4,
  'B conta quatro não vistas'
);

-- ---------------------------------------------------------------------------
-- Grupo de normas da busca global
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');

select ok(
  exists (
    select 1 from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'IN 02') as b
    where b.tipo = 'norma' and b.id = '73600000-0000-4000-8000-000000000150'
      and b.referencia_id = b.id and b.titulo = 'IN 02 · Teste 736 de efluentes'
      and b.detalhe = 'IMA-TESTE · Instrução normativa · revogada'),
  'membro acha "IN 02" pelo número, com órgão, tipo e revogada no detalhe'
);
select is(
  (select count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'IN 2') as b
   where b.tipo = 'norma'),
  5::bigint,
  'no máximo 5 normas na busca global'
);
select ok(
  exists (
    select 1 from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'IN teste 736 de ruido') as b
    where b.tipo = 'norma' and b.id = '73600000-0000-4000-8000-000000000151'),
  'acha pelo título depois do tipo'
);
select is(
  (select count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'efluentes') as b
   where b.tipo = 'norma'),
  0::bigint,
  'termo comum que não parece norma não traz o grupo de normas'
);

reset role;

select ok(
  (select max(b.posicao) filter (where ltrim(n.numero, '0') = '2')
          < min(b.posicao) filter (where ltrim(n.numero, '0') <> '2')
   from private.busca_normas('c0000000-0000-4000-8000-00000000000a', 'IN 2') as b
   join private.norma as n on n.id = b.id),
  'número exato antes do título ("IN 2" antes de "IN 20")'
);

select testes.autenticar_como('gustavo@verdesul.test');

select is(
  (select count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'IN 02') as b
   where b.tipo = 'norma'),
  0::bigint,
  'com a consultoria de que não é membro, zero normas'
);
select ok(
  exists (
    select 1 from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000b', 'IN 02') as b
    where b.tipo = 'norma' and b.id = '73600000-0000-4000-8000-000000000150'),
  'membro de outra consultoria acha a norma global na própria consultoria'
);

select testes.autenticar_como_anonimo();

select throws_ok(
  $$select * from public.listar_mudancas_de_norma_da_consultoria('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', null,
  'anônimo não lista mudanças'
);

reset role;

select * from finish();

rollback;
