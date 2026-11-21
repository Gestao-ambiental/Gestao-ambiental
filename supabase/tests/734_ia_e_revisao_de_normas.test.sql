-- Resumo de mudança de norma por IA e revisão do operador (L4, ADR-0050, LEG-04).
-- Cota de plataforma (dia, mês e simultâneas) fora de private.uso_de_ia; reservar, concluir e falhar
-- só pela service role; gatilho sem pg_net não quebra o insert; fila, detalhe, publicar (critérios
-- confirmados viram norma_criterio ia_confirmada), descartar com motivo e uso só para o operador
-- com dois fatores. Membro comum, Gestão, operador sem dois fatores e anônimo são barrados.
begin;

select plan(87);

select testes.criar_dados_sinteticos();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '73400000-0000-4000-8000-0000000000e1', 'authenticated',
        'authenticated', 'operador734@grama.test', '', now(),
        '{"provider": "email", "providers": ["email"]}'::jsonb, '{"nome": "Operador 734"}'::jsonb, now(), now());
insert into private.operador_plataforma (usuario_id) values ('73400000-0000-4000-8000-0000000000e1');

-- ---------------------------------------------------------------------------
-- Cenário (como dono): uma norma com nove versões e oito mudanças.
-- M1..M6 detectadas (da mais antiga para a mais nova), MP publicada e MD descartada.
-- ---------------------------------------------------------------------------
insert into private.norma (id, chave, esfera, orgao, tipo, numero, ano, titulo, url_oficial) values
  ('73400000-0000-4000-8000-000000000001', 'sc;teste734;instrucao_normativa;7', 'estadual', 'IMA-TESTE',
   'instrucao_normativa', '7', 2024, 'IN Teste 734 · Efluentes', 'https://exemplo.test/in7');

insert into private.norma_versao (id, norma_id, numero, publicada_em, sha256, texto)
select ('73400000-0000-4000-8000-000000000a0' || n::text)::uuid, '73400000-0000-4000-8000-000000000001',
       n + 1, date '2024-01-01' + n, lpad(n::text, 64, '0'),
       case n when 0 then 'texto anterior' when 1 then repeat('x', 70000) else 'texto ' || n::text end
from generate_series(0, 8) as n;

insert into private.norma_criterio (norma_id, tipo, valor, origem) values
  ('73400000-0000-4000-8000-000000000001', 'tipo_licenca', 'LAO', 'curadoria');

insert into private.norma_mudanca (id, norma_id, versao_anterior_id, versao_nova_id, tipo, detectada_em, diferenca)
select ('73400000-0000-4000-8000-000000000b0' || n::text)::uuid, '73400000-0000-4000-8000-000000000001',
       ('73400000-0000-4000-8000-000000000a0' || (n - 1)::text)::uuid,
       ('73400000-0000-4000-8000-000000000a0' || n::text)::uuid,
       'alterada', now() - make_interval(days => 20 - n), jsonb_build_object('mudou', true)
from generate_series(1, 6) as n;

insert into private.norma_mudanca (id, norma_id, versao_anterior_id, versao_nova_id, tipo, detectada_em,
                                   situacao, revisada_por, publicada_em, motivo_descarte) values
  ('73400000-0000-4000-8000-000000000b07', '73400000-0000-4000-8000-000000000001',
   '73400000-0000-4000-8000-000000000a06', '73400000-0000-4000-8000-000000000a07', 'alterada',
   now() - interval '30 days', 'publicada', '73400000-0000-4000-8000-0000000000e1', now(), null),
  ('73400000-0000-4000-8000-000000000b08', '73400000-0000-4000-8000-000000000001',
   '73400000-0000-4000-8000-000000000a07', '73400000-0000-4000-8000-000000000a08', 'alterada',
   now() - interval '29 days', 'descartada', '73400000-0000-4000-8000-0000000000e1', null, 'Republicação sem mudança');

-- ---------------------------------------------------------------------------
-- Estrutura e permissões
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from pg_catalog.pg_class as c
   join pg_catalog.pg_namespace as s on s.oid = c.relnamespace
   where s.nspname = 'private' and c.relname in ('limite_ia_plataforma', 'ia_plataforma')
     and c.relrowsecurity and c.relforcerowsecurity),
  2::bigint,
  'limite_ia_plataforma e ia_plataforma têm RLS habilitada e forçada'
);

select ok(
  (select bool_and(not has_table_privilege(r, 'private.' || t,
                   'select, insert, update, delete, truncate, references, trigger'))
   from unnest(array['limite_ia_plataforma', 'ia_plataforma']) as t
   cross join unnest(array['anon', 'authenticated']) as r),
  'anon e authenticated não têm privilégio nas tabelas da cota de plataforma'
);

select results_eq(
  $$select resumos_por_dia, custo_mensal_micros, simultaneos from private.limite_ia_plataforma$$,
  $$values (40, 20000000::bigint, 3)$$,
  'uma linha de limite: 40 resumos por dia, US$ 20 por mês e 3 simultâneos'
);

select ok(
  pg_catalog.pg_get_functiondef('private.uso_de_ia(timestamptz, timestamptz, uuid, uuid)'::regprocedure)
    not like '%ia_plataforma%',
  'a cota da plataforma fica fora de private.uso_de_ia (por consultoria)'
);

select ok(
  (select bool_and(has_function_privilege('service_role', f, 'execute')
                   and not has_function_privilege('authenticated', f, 'execute')
                   and not has_function_privilege('anon', f, 'execute'))
   from unnest(array[
     'public.reservar_resumo_de_mudanca(uuid)',
     'public.concluir_resumo_de_mudanca(uuid, jsonb, jsonb, text, text, integer, integer, bigint, integer)',
     'public.falhar_resumo_de_mudanca(uuid, text)'
   ]) as f),
  'reservar, concluir e falhar: só a service role executa'
);

select ok(
  (select bool_and(has_function_privilege('authenticated', f, 'execute')
                   and not has_function_privilege('anon', f, 'execute'))
   from unnest(array[
     'public.central_listar_mudancas_de_norma(text, integer, integer)',
     'public.central_detalhe_da_mudanca_de_norma(uuid)',
     'public.central_publicar_mudanca_de_norma(uuid, jsonb, jsonb)',
     'public.central_descartar_mudanca_de_norma(uuid, text)',
     'public.central_uso_de_ia_da_plataforma()'
   ]) as f),
  'RPCs da central: authenticated executa (o banco confere o operador), anon não'
);

select ok(
  not has_function_privilege('authenticated', 'private.disparar_resumo_de_mudanca(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.disparar_resumo_de_mudanca(uuid)', 'execute'),
  'o cliente não dispara o resumo'
);

select has_trigger('private', 'norma_mudanca', 'norma_mudanca_resumir',
  'mudança nova chama o resumo pelo gatilho');

-- ---------------------------------------------------------------------------
-- Gatilho sem pg_net nem Vault (PGlite, CI): não faz nada e não derruba o insert
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into private.norma_mudanca (id, norma_id, versao_anterior_id, tipo, ato_id)
    values ('73400000-0000-4000-8000-000000000b09', '73400000-0000-4000-8000-000000000001',
            '73400000-0000-4000-8000-000000000a08', 'revogada', '73400000-0000-4000-8000-000000000001')$$,
  'inserir mudança funciona sem pg_net, Vault ou segredos'
);
select lives_ok($$select private.disparar_resumo_de_mudanca('73400000-0000-4000-8000-000000000b09')$$,
  'o disparo roda sem pg_net, Vault ou segredos');
delete from private.norma_mudanca where id = '73400000-0000-4000-8000-000000000b09';

-- ---------------------------------------------------------------------------
-- Quem não é service role não reserva, conclui nem falha
-- ---------------------------------------------------------------------------
create temporary table chamadas_servico (rpc text, sql text);
insert into chamadas_servico values
  ('reservar', $$select public.reservar_resumo_de_mudanca('73400000-0000-4000-8000-000000000b01')$$),
  ('concluir', $$select public.concluir_resumo_de_mudanca(gen_random_uuid(), '{"resumo": "x"}', '[]',
                 'm', 'v', 1, 1, 1, 1)$$),
  ('falhar', $$select public.falhar_resumo_de_mudanca(gen_random_uuid(), 'x')$$);
grant select on chamadas_servico to anon, authenticated;

select testes.autenticar_com_dois_fatores('operador734@grama.test');
select throws_ok(c.sql, '42501', null, 'operador (authenticated): ' || c.rpc || ' recusa')
from chamadas_servico as c order by c.rpc;

select testes.autenticar_como_anonimo();
select throws_ok(c.sql, '42501', null, 'anônimo: ' || c.rpc || ' recusa')
from chamadas_servico as c order by c.rpc;

-- ---------------------------------------------------------------------------
-- Service role: reservar, concluir e falhar
-- ---------------------------------------------------------------------------
reset role;
create temporary table reservas (mudanca text primary key, dados jsonb);
grant select, insert on reservas to service_role;
set local role service_role;

insert into reservas values
  ('M1', public.reservar_resumo_de_mudanca('73400000-0000-4000-8000-000000000b01'));

select results_eq(
  $$select dados -> 'norma' ->> 'titulo', dados -> 'norma' ->> 'orgao', dados ->> 'tipo_mudanca',
           dados ->> 'texto_anterior', length(dados ->> 'texto_novo'), dados -> 'diferenca' ->> 'mudou',
           (dados ->> 'reserva_id') is not null
    from reservas where mudanca = 'M1'$$,
  $$values ('IN Teste 734 · Efluentes', 'IMA-TESTE', 'alterada', 'texto anterior', 60000, 'true', true)$$,
  'a reserva devolve norma, tipo, diferença e os textos públicos (cortados em 60.000 caracteres)'
);
select is(
  (select array_agg(k order by k) from reservas, jsonb_object_keys(dados) as k where mudanca = 'M1'),
  array['diferenca', 'norma', 'reserva_id', 'texto_anterior', 'texto_novo', 'tipo_mudanca'],
  'a reserva não leva nada além do texto público da norma'
);

select throws_ok(
  $$select public.reservar_resumo_de_mudanca('73400000-0000-4000-8000-0000000000ff')$$,
  'P0001', 'mudanca_inexistente', 'mudança inexistente não reserva');
select throws_ok(
  $$select public.reservar_resumo_de_mudanca('73400000-0000-4000-8000-000000000b07')$$,
  'P0001', 'mudanca_ja_publicada', 'mudança publicada não reserva');
select throws_ok(
  $$select public.reservar_resumo_de_mudanca('73400000-0000-4000-8000-000000000b08')$$,
  'P0001', 'mudanca_ja_publicada', 'mudança descartada não reserva');
select throws_ok(
  $$select public.reservar_resumo_de_mudanca('73400000-0000-4000-8000-000000000b01')$$,
  'P0001', 'resumo_em_andamento', 'a mesma mudança não reserva duas vezes ao mesmo tempo');

select throws_ok(
  format($$select public.concluir_resumo_de_mudanca(%L, '{"resumo": ""}', '[]', 'm', 'norma-v1', 1, 1, 1, 1)$$,
         (select dados ->> 'reserva_id' from reservas where mudanca = 'M1')),
  '22023', 'resposta_invalida', 'resumo vazio é recusado');
select throws_ok(
  format($$select public.concluir_resumo_de_mudanca(%L, '{"resumo": "ok"}', '[{"tipo": "cor", "valor": "azul"}]',
           'm', 'norma-v1', 1, 1, 1, 1)$$,
         (select dados ->> 'reserva_id' from reservas where mudanca = 'M1')),
  '22023', 'resposta_invalida', 'critério sugerido com tipo fora da lista é recusado');
select throws_ok(
  $$select public.concluir_resumo_de_mudanca(gen_random_uuid(), '{"resumo": "ok"}', '[]', 'm', 'v', 1, 1, 1, 1)$$,
  'P0001', 'reserva_inexistente', 'reserva inexistente não conclui');

select lives_ok(
  format($$select public.concluir_resumo_de_mudanca(%L,
    '{"resumo": "  Prazo de renovação passa a 120 dias.  ", "o_que_muda": ["Art. 5º"]}',
    '[{"tipo": "atividade", "valor": "33.10.00"}, {"tipo": "tipo_licenca", "valor": "LAO"}]',
    'openai/gpt-4.1-mini', 'norma-v1', 3000, 400, 2500, 5000)$$,
    (select dados ->> 'reserva_id' from reservas where mudanca = 'M1')),
  'a service role conclui com resumo e critérios sugeridos');

-- Repetir a conclusão não muda nada.
select lives_ok(
  format($$select public.concluir_resumo_de_mudanca(%L, '{"resumo": "outro"}', '[]', 'x', 'y', 9, 9, 999999, 9)$$,
    (select dados ->> 'reserva_id' from reservas where mudanca = 'M1')),
  'concluir de novo não falha');

reset role;
select results_eq(
  $$select situacao, resumo ->> 'resumo', jsonb_array_length(resumo -> 'o_que_muda'),
           jsonb_array_length(criterios_sugeridos), revisada_por is null
    from private.norma_mudanca where id = '73400000-0000-4000-8000-000000000b01'$$,
  $$values ('resumida', 'Prazo de renovação passa a 120 dias.', 1, 2, true)$$,
  'a mudança fica resumida, com o resumo e os critérios sugeridos, sem revisão'
);
select results_eq(
  $$select situacao, modelo, versao_prompt, tokens_entrada, tokens_saida, custo_micros, moeda, duracao_ms,
           concluido_em is not null
    from private.ia_plataforma
    where id = (select (dados ->> 'reserva_id')::uuid from reservas where mudanca = 'M1')$$,
  $$values ('concluida', 'openai/gpt-4.1-mini', 'norma-v1', 3000, 400, 2500::bigint, 'USD', 5000, true)$$,
  'a chamada fica concluída com o custo da primeira conclusão'
);
select is(
  (select count(*)::integer from private.norma_criterio
   where norma_id = '73400000-0000-4000-8000-000000000001' and origem = 'ia_confirmada'),
  0,
  'critério sugerido pela IA não vale antes da revisão'
);

-- Falhar
set local role service_role;
insert into reservas values
  ('M2', public.reservar_resumo_de_mudanca('73400000-0000-4000-8000-000000000b02'));
select lives_ok(
  format($$select public.falhar_resumo_de_mudanca(%L, 'provedor_indisponivel')$$,
    (select dados ->> 'reserva_id' from reservas where mudanca = 'M2')),
  'a service role registra a falha');
select lives_ok(
  format($$select public.falhar_resumo_de_mudanca(%L, 'outro motivo')$$,
    (select dados ->> 'reserva_id' from reservas where mudanca = 'M2')),
  'falhar de novo não falha');
select throws_ok(
  $$select public.falhar_resumo_de_mudanca(gen_random_uuid(), 'x')$$,
  'P0001', 'reserva_inexistente', 'reserva inexistente não falha');

reset role;
select results_eq(
  $$select c.situacao, c.motivo, c.concluido_em is not null, m.situacao, m.resumo is null
    from private.ia_plataforma as c join private.norma_mudanca as m on m.id = c.mudanca_id
    where c.id = (select (dados ->> 'reserva_id')::uuid from reservas where mudanca = 'M2')$$,
  $$values ('falhou', 'provedor_indisponivel', true, 'detectada', true)$$,
  'a falha fecha a reserva com o primeiro motivo e a mudança continua sem resumo'
);

-- ---------------------------------------------------------------------------
-- Cotas: simultâneas, dia e mês
-- ---------------------------------------------------------------------------
update private.limite_ia_plataforma set simultaneos = 1;
set local role service_role;
insert into reservas values
  ('M3', public.reservar_resumo_de_mudanca('73400000-0000-4000-8000-000000000b03'));
select throws_ok(
  $$select public.reservar_resumo_de_mudanca('73400000-0000-4000-8000-000000000b04')$$,
  'P0001', 'muitas_simultaneas', 'com uma chamada em andamento e limite 1, a segunda espera');

-- Reserva esquecida há mais de 3 minutos não segura a vaga.
reset role;
update private.ia_plataforma set criado_em = now() - interval '4 minutes'
where id = (select (dados ->> 'reserva_id')::uuid from reservas where mudanca = 'M3');
set local role service_role;
select lives_ok(
  $$insert into reservas values
    ('M4', public.reservar_resumo_de_mudanca('73400000-0000-4000-8000-000000000b04'))$$,
  'reserva esquecida há mais de 3 minutos não conta como simultânea');

-- Dia: todas as reservas de hoje contam, inclusive a que falhou. As de ontem não.
reset role;
update private.limite_ia_plataforma set simultaneos = 10,
  resumos_por_dia = (select count(*) from private.ia_plataforma
                     where criado_em >= private.inicio_no_fuso_da_plataforma('day', now()));
insert into private.ia_plataforma (mudanca_id, situacao, custo_micros, criado_em, concluido_em)
values ('73400000-0000-4000-8000-000000000b05', 'concluida', 0, now() - interval '1 day', now() - interval '1 day');
select is(
  (select resumos_por_dia from private.limite_ia_plataforma),
  4,
  'quatro reservas hoje (concluída, falhou e duas em andamento)'
);
set local role service_role;
select throws_ok(
  $$select public.reservar_resumo_de_mudanca('73400000-0000-4000-8000-000000000b05')$$,
  'P0001', 'cota_diaria_esgotada', 'no limite do dia, a reserva é recusada');
reset role;
update private.limite_ia_plataforma set resumos_por_dia = resumos_por_dia + 1;
set local role service_role;
select lives_ok(
  $$insert into reservas values
    ('M5', public.reservar_resumo_de_mudanca('73400000-0000-4000-8000-000000000b05'))$$,
  'com vaga no dia, a reserva passa (ontem não conta)');

-- Mês: soma o custo das chamadas do mês; as de meses anteriores não contam.
reset role;
insert into private.ia_plataforma (mudanca_id, situacao, custo_micros, criado_em, concluido_em)
values ('73400000-0000-4000-8000-000000000b06', 'concluida', 900000000, now() - interval '40 days',
        now() - interval '40 days');
update private.limite_ia_plataforma set resumos_por_dia = 1000,
  custo_mensal_micros = (select coalesce(sum(custo_micros), 0) from private.ia_plataforma
                         where criado_em >= private.inicio_no_fuso_da_plataforma('month', now()));
select ok(
  (select custo_mensal_micros >= 2500 and custo_mensal_micros < 900000000 from private.limite_ia_plataforma),
  'o custo do mês tem a chamada concluída hoje e não a de 40 dias atrás'
);
set local role service_role;
select throws_ok(
  $$select public.reservar_resumo_de_mudanca('73400000-0000-4000-8000-000000000b06')$$,
  'P0001', 'cota_mensal_esgotada', 'com o custo do mês no limite, a reserva é recusada');
reset role;
update private.limite_ia_plataforma set custo_mensal_micros = custo_mensal_micros + 1;
set local role service_role;
select lives_ok(
  $$insert into reservas values
    ('M6', public.reservar_resumo_de_mudanca('73400000-0000-4000-8000-000000000b06'))$$,
  'abaixo do limite do mês, a reserva passa');
reset role;
update private.limite_ia_plataforma set resumos_por_dia = 40, custo_mensal_micros = 20000000, simultaneos = 3;

-- ---------------------------------------------------------------------------
-- Central: só operador com dois fatores
-- ---------------------------------------------------------------------------
create temporary table chamadas_central (rpc text, sql text);
insert into chamadas_central values
  ('central_listar_mudancas_de_norma', $$select * from public.central_listar_mudancas_de_norma()$$),
  ('central_detalhe_da_mudanca_de_norma',
   $$select public.central_detalhe_da_mudanca_de_norma('73400000-0000-4000-8000-000000000b01')$$),
  ('central_publicar_mudanca_de_norma',
   $$select public.central_publicar_mudanca_de_norma('73400000-0000-4000-8000-000000000b01',
     '{"resumo": "Resumo"}', '[]')$$),
  ('central_descartar_mudanca_de_norma',
   $$select public.central_descartar_mudanca_de_norma('73400000-0000-4000-8000-000000000b02', 'motivo')$$),
  ('central_uso_de_ia_da_plataforma', $$select public.central_uso_de_ia_da_plataforma()$$);
grant select on chamadas_central to anon, authenticated;

select testes.autenticar_com_dois_fatores('eduardo@filtroville.test');
select throws_ok(c.sql, '42501', 'sem_permissao', 'Gestão com dois fatores: ' || c.rpc || ' recusa')
from chamadas_central as c order by c.rpc;

select testes.autenticar_como('ana@filtroville.test');
select throws_ok(c.sql, '42501', 'sem_permissao', 'Equipe: ' || c.rpc || ' recusa')
from chamadas_central as c order by c.rpc;

select testes.autenticar_como('operador734@grama.test');
select throws_ok(c.sql, '42501', 'dois_fatores_necessarios', 'operador sem dois fatores: ' || c.rpc || ' recusa')
from chamadas_central as c order by c.rpc;

select testes.autenticar_como_anonimo();
select throws_ok(c.sql, '42501', null, 'anônimo: ' || c.rpc || ' recusa')
from chamadas_central as c order by c.rpc;

reset role;
select results_eq(
  $$select id::text, situacao from private.norma_mudanca
    where id in ('73400000-0000-4000-8000-000000000b01', '73400000-0000-4000-8000-000000000b02') order by id$$,
  $$values ('73400000-0000-4000-8000-000000000b01', 'resumida'), ('73400000-0000-4000-8000-000000000b02', 'detectada')$$,
  'nenhuma recusa publicou nem descartou'
);

-- ---------------------------------------------------------------------------
-- Operador com dois fatores: uso, fila e detalhe
-- ---------------------------------------------------------------------------
select testes.autenticar_com_dois_fatores('operador734@grama.test');

select results_eq(
  $$select (u ->> 'resumos_hoje')::integer, (u ->> 'limite_dia')::integer, (u ->> 'limite_mes_micros')::bigint,
           (u ->> 'custo_mes_micros')::bigint < 900000000
    from public.central_uso_de_ia_da_plataforma() as u$$,
  $$values (6, 40, 20000000::bigint, true)$$,
  'uso da plataforma: seis resumos hoje, limites e o custo só deste mês'
);

select results_eq(
  $$select id::text, tem_resumo from public.central_listar_mudancas_de_norma(null, 100, 0)
    where norma_id = '73400000-0000-4000-8000-000000000001'$$,
  $$values ('73400000-0000-4000-8000-000000000b01', true), ('73400000-0000-4000-8000-000000000b02', false),
           ('73400000-0000-4000-8000-000000000b03', false), ('73400000-0000-4000-8000-000000000b04', false),
           ('73400000-0000-4000-8000-000000000b05', false), ('73400000-0000-4000-8000-000000000b06', false)$$,
  'sem filtro a fila mostra detectadas e resumidas, das mais antigas para as mais novas'
);
select results_eq(
  $$select id::text, norma_titulo, situacao from public.central_listar_mudancas_de_norma('publicada')
    where norma_id = '73400000-0000-4000-8000-000000000001'$$,
  $$values ('73400000-0000-4000-8000-000000000b07', 'IN Teste 734 · Efluentes', 'publicada')$$,
  'com filtro, só a situação pedida'
);
select results_eq(
  $$select count(*)::integer, min(total)::integer from public.central_listar_mudancas_de_norma(null, 2, 0)$$,
  $$values (2, 6)$$,
  'a fila é paginada e traz o total'
);
select throws_ok(
  $$select * from public.central_listar_mudancas_de_norma('qualquer')$$,
  '22023', 'situacao_invalida', 'situação fora da lista é recusada');

select results_eq(
  $$select d ->> 'url_oficial', d -> 'norma' ->> 'titulo', d -> 'resumo' ->> 'resumo',
           jsonb_array_length(d -> 'criterios_sugeridos'), length(d -> 'versao_nova' ->> 'trecho'),
           d -> 'versao_anterior' ->> 'trecho', d -> 'versao_nova' ->> 'publicada_em',
           jsonb_array_length(d -> 'chamadas_ia'), (d -> 'chamadas_ia' -> 0 ->> 'custo_micros')::bigint
    from public.central_detalhe_da_mudanca_de_norma('73400000-0000-4000-8000-000000000b01') as d$$,
  $$values ('https://exemplo.test/in7', 'IN Teste 734 · Efluentes', 'Prazo de renovação passa a 120 dias.', 2,
            4000, 'texto anterior', '2024-01-02', 1, 2500::bigint)$$,
  'o detalhe traz norma, link oficial, resumo, critérios, trechos de até 4.000 caracteres e o custo da IA'
);
select throws_ok(
  $$select public.central_detalhe_da_mudanca_de_norma('73400000-0000-4000-8000-0000000000ff')$$,
  'P0001', 'mudanca_inexistente', 'detalhe de mudança inexistente');

-- ---------------------------------------------------------------------------
-- Publicar
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.central_publicar_mudanca_de_norma('73400000-0000-4000-8000-000000000b01', '{"resumo": "  "}', '[]')$$,
  '22023', 'resumo_obrigatorio', 'publicar exige o resumo');
select throws_ok(
  format($$select public.central_publicar_mudanca_de_norma('73400000-0000-4000-8000-000000000b01', %L, '[]')$$,
         jsonb_build_object('resumo', repeat('a', 1201))),
  '22023', 'resumo_invalido', 'resumo com mais de 1.200 caracteres é recusado');
select throws_ok(
  $$select public.central_publicar_mudanca_de_norma('73400000-0000-4000-8000-000000000b01', '{"resumo": "ok"}',
    '[{"tipo": "cor", "valor": "azul"}]')$$,
  '22023', 'criterio_invalido', 'critério com tipo fora da lista é recusado');
select throws_ok(
  $$select public.central_publicar_mudanca_de_norma('73400000-0000-4000-8000-000000000b01', '{"resumo": "ok"}',
    '[{"tipo": "municipio", "valor": "4209102"}, {"tipo": "atividade", "valor": "abc"}]')$$,
  '22023', 'criterio_invalido', 'critério com valor fora do formato é recusado e nada é gravado');
select throws_ok(
  $$select public.central_publicar_mudanca_de_norma('73400000-0000-4000-8000-0000000000ff', '{"resumo": "ok"}', '[]')$$,
  'P0001', 'mudanca_inexistente', 'publicar mudança inexistente');

select lives_ok(
  $$select public.central_publicar_mudanca_de_norma('73400000-0000-4000-8000-000000000b01',
    '{"resumo": " Renovação passa a pedir 120 dias de antecedência. ", "o_que_muda": ["Art. 5º"]}',
    '[{"tipo": "atividade", "valor": "33.10.00"}, {"tipo": "tipo_licenca", "valor": "LAO"},
      {"tipo": "municipio", "valor": "4209102"}]')$$,
  'o operador publica com o resumo revisado e os critérios confirmados');

reset role;
select results_eq(
  $$select situacao, revisada_por::text, publicada_em is not null, resumo ->> 'resumo',
           jsonb_array_length(resumo -> 'o_que_muda'), motivo_descarte is null
    from private.norma_mudanca where id = '73400000-0000-4000-8000-000000000b01'$$,
  $$values ('publicada', '73400000-0000-4000-8000-0000000000e1', true,
            'Renovação passa a pedir 120 dias de antecedência.', 1, true)$$,
  'a mudança fica publicada, com quem revisou, quando e o resumo revisado'
);
select results_eq(
  $$select tipo, valor, origem from private.norma_criterio
    where norma_id = '73400000-0000-4000-8000-000000000001' order by tipo, valor$$,
  $$values ('atividade', '33.10.00', 'ia_confirmada'), ('municipio', '4209102', 'ia_confirmada'),
           ('tipo_licenca', 'LAO', 'curadoria')$$,
  'critérios confirmados viram ia_confirmada; o que já existia fica com a origem dele'
);

select testes.autenticar_com_dois_fatores('operador734@grama.test');
select throws_ok(
  $$select public.central_publicar_mudanca_de_norma('73400000-0000-4000-8000-000000000b01', '{"resumo": "ok"}', '[]')$$,
  'P0001', 'mudanca_ja_revisada', 'publicar de novo é recusado');

-- ---------------------------------------------------------------------------
-- Descartar
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.central_descartar_mudanca_de_norma('73400000-0000-4000-8000-000000000b02', '   ')$$,
  '22023', 'motivo_obrigatorio', 'descartar exige motivo');
select lives_ok(
  $$select public.central_descartar_mudanca_de_norma('73400000-0000-4000-8000-000000000b02',
    ' Ato individual de outra empresa ')$$,
  'o operador descarta com motivo');
select throws_ok(
  $$select public.central_descartar_mudanca_de_norma('73400000-0000-4000-8000-000000000b02', 'de novo')$$,
  'P0001', 'mudanca_ja_revisada', 'descartar de novo é recusado');
select throws_ok(
  $$select public.central_publicar_mudanca_de_norma('73400000-0000-4000-8000-000000000b02', '{"resumo": "ok"}', '[]')$$,
  'P0001', 'mudanca_ja_revisada', 'mudança descartada não é publicada');

reset role;
select results_eq(
  $$select situacao, revisada_por::text, motivo_descarte, publicada_em is null
    from private.norma_mudanca where id = '73400000-0000-4000-8000-000000000b02'$$,
  $$values ('descartada', '73400000-0000-4000-8000-0000000000e1', 'Ato individual de outra empresa', true)$$,
  'a mudança fica descartada, com quem revisou e o motivo'
);

-- Publicada: a IA não resume mais; a conclusão atrasada não desfaz a revisão.
set local role service_role;
select throws_ok(
  $$select public.reservar_resumo_de_mudanca('73400000-0000-4000-8000-000000000b01')$$,
  'P0001', 'mudanca_ja_publicada', 'mudança publicada pelo operador não reserva');
reset role;
update private.norma_mudanca set situacao = 'publicada', revisada_por = '73400000-0000-4000-8000-0000000000e1',
  publicada_em = now(), resumo = '{"resumo": "revisado"}'
where id = '73400000-0000-4000-8000-000000000b03';
set local role service_role;
select lives_ok(
  format($$select public.concluir_resumo_de_mudanca(%L, '{"resumo": "atrasado"}', '[]', 'm', 'norma-v1', 1, 1, 7, 1)$$,
    (select dados ->> 'reserva_id' from reservas where mudanca = 'M3')),
  'a IA conclui depois da publicação');
reset role;
select results_eq(
  $$select m.situacao, m.resumo ->> 'resumo', c.situacao, c.custo_micros
    from private.norma_mudanca as m
    join private.ia_plataforma as c on c.id = (select (dados ->> 'reserva_id')::uuid from reservas where mudanca = 'M3')
    where m.id = '73400000-0000-4000-8000-000000000b03'$$,
  $$values ('publicada', 'revisado', 'concluida', 7::bigint)$$,
  'o resumo revisado fica; o custo da chamada fica registrado'
);

select * from finish();
rollback;
