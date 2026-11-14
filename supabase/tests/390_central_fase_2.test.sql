-- Central administrativa, fase 2 (ADM-01; ADR-0024).
-- A. As RPCs de dados da central exigem operador E sessão com dois fatores (aal2). Operador com
--    aal1 recebe dois_fatores_necessarios; quem não é operador recebe sem_permissao com qualquer
--    nível; anônimo nem executa. sou_operador responde com aal1.
-- B. registrar_uso: só membro ativo da própria consultoria; dia no fuso da consultoria; idempotente
--    (uma linha por pessoa, dia e área; no máximo uma escrita útil a cada 5 minutos). Ninguém lê
--    uso_diario por consulta direta: zero linhas, inclusive a Gestão e o operador.
-- C. A central lê o uso: resumo (agora, 7 e 30 dias), alerta de 14 dias sem uso, último uso na
--    lista, por pessoa e por área.
begin;

select plan(66);

select testes.criar_dados_sinteticos();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000001', 'authenticated',
        'authenticated', 'operador@grama.test', '', now(), '{"provider": "email", "providers": ["email"]}',
        '{"nome": "Operador Grama"}', now(), now());
insert into private.operador_plataforma (usuario_id) values ('e1000000-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- Estrutura de uso_diario: RLS forçada, política que nunca libera, sem grant de escrita
-- ---------------------------------------------------------------------------
select has_table('public', 'uso_diario', 'existe public.uso_diario');
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity from pg_class as c
   where c.oid = 'public.uso_diario'::regclass),
  'uso_diario tem RLS habilitada e forçada'
);
select is(
  (select string_agg(p.cmd::text || ':' || p.qual::text, ',')
   from pg_policies as p where p.schemaname = 'public' and p.tablename = 'uso_diario') collate "C",
  'SELECT:false' collate "C",
  'uso_diario só tem a política de select que nunca libera: o cliente não lê nem escreve'
);
select ok(
  not has_table_privilege('authenticated', 'public.uso_diario', 'insert')
  and not has_table_privilege('authenticated', 'public.uso_diario', 'update')
  and not has_table_privilege('authenticated', 'public.uso_diario', 'delete')
  and not has_table_privilege('anon', 'public.uso_diario', 'select'),
  'nem authenticated escreve nem anon lê uso_diario'
);

-- ---------------------------------------------------------------------------
-- A. Dois fatores
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
   $$select public.central_mudar_situacao('c0000000-0000-4000-8000-00000000000a', 'suspensa', 'motivo', 1,
     gen_random_uuid())$$),
  ('central_uso_por_modulo',
   $$select * from public.central_uso_por_modulo('c0000000-0000-4000-8000-00000000000a')$$),
  ('central_resumo_de_uso', $$select * from public.central_resumo_de_uso()$$),
  ('central_alertas_sem_uso', $$select * from public.central_alertas_sem_uso()$$);
grant select on chamadas_central to anon, authenticated;

select testes.autenticar_como('operador@grama.test');
select ok(public.sou_operador(), 'operador com aal1: sou_operador responde (sem dados)');
select throws_ok(c.sql, '42501', 'dois_fatores_necessarios',
  'operador com aal1: ' || c.rpc || ' pede dois fatores')
from chamadas_central as c order by c.rpc;

reset role;
select is(
  (select situacao::text from public.consultoria where id = 'c0000000-0000-4000-8000-00000000000a'),
  'ativa',
  'operador com aal1 não conseguiu mudar a situação'
);

select testes.autenticar_com_dois_fatores('eduardo@filtroville.test');
select throws_ok(c.sql, '42501', 'sem_permissao', 'Gestão com aal2: ' || c.rpc || ' recusa')
from chamadas_central as c order by c.rpc;

select testes.autenticar_como('ana@filtroville.test');
select throws_ok(c.sql, '42501', 'sem_permissao', 'Equipe com aal1: ' || c.rpc || ' recusa')
from chamadas_central as c order by c.rpc;

select testes.autenticar_como_anonimo();
select throws_ok(c.sql, '42501', null, 'anônimo: ' || c.rpc || ' recusa')
from chamadas_central as c order by c.rpc;
select throws_ok(
  $$select public.registrar_uso('c0000000-0000-4000-8000-00000000000a', 'orcamentos')$$,
  '42501', null,
  'anônimo: registrar_uso recusa'
);

-- ---------------------------------------------------------------------------
-- B. registrar_uso
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');
select lives_ok(
  $$select public.registrar_uso('c0000000-0000-4000-8000-00000000000a', 'orcamentos')$$,
  'membro registra o uso da própria consultoria'
);
select lives_ok(
  $$select public.registrar_uso('c0000000-0000-4000-8000-00000000000a', 'orcamentos')$$,
  'repetir o registro não dá erro'
);
select throws_ok(
  $$select public.registrar_uso('c0000000-0000-4000-8000-00000000000a', 'ia')$$,
  '22023', 'modulo_invalido',
  'área fora da lista é recusada'
);
select throws_ok(
  $$select public.registrar_uso('c0000000-0000-4000-8000-00000000000a', null)$$,
  '22023', 'modulo_invalido',
  'área vazia é recusada'
);
select is(
  (select count(*) from public.uso_diario),
  0::bigint,
  'o próprio membro lê zero linhas de uso_diario por consulta direta'
);
select throws_ok(
  $$insert into public.uso_diario (consultoria_id, membro_id, dia, modulo)
    values ('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a2', current_date,
            'orcamentos')$$,
  '42501', null,
  'membro não grava uso_diario direto'
);

select testes.autenticar_com_dois_fatores('eduardo@filtroville.test');
select is(
  (select count(*) from public.uso_diario),
  0::bigint,
  'a Gestão não vê o uso individual da equipe (zero linhas)'
);

select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select public.registrar_uso('c0000000-0000-4000-8000-00000000000a', 'orcamentos')$$,
  '42501', 'sem_permissao',
  'pessoa de outra consultoria não registra uso na consultoria alheia'
);
select is(
  (select count(*) from public.uso_diario),
  0::bigint,
  'pessoa de outra consultoria lê zero linhas de uso_diario'
);

select testes.autenticar_com_dois_fatores('operador@grama.test');
select is(
  (select count(*) from public.uso_diario),
  0::bigint,
  'nem o operador lê uso_diario direto: só pelas RPCs da central'
);

reset role;
select results_eq(
  $$select membro_id, dia, modulo, primeiro_em = ultimo_em from public.uso_diario$$,
  $$values ('d0000000-0000-4000-8000-0000000000a2'::uuid, (now() at time zone 'America/Sao_Paulo')::date,
            'orcamentos', true)$$,
  'uma linha só para a pessoa, o dia de hoje no fuso da consultoria e a área'
);

-- Desligado não registra mais.
update public.membro set situacao = 'desligado', desligado_em = now()
where id = 'd0000000-0000-4000-8000-0000000000a6';
select testes.autenticar_como('fernanda@filtroville.test');
select throws_ok(
  $$select public.registrar_uso('c0000000-0000-4000-8000-00000000000a', 'orcamentos')$$,
  '42501', 'sem_permissao',
  'pessoa desligada não registra uso'
);

-- Dia no fuso da consultoria e intervalo de 5 minutos, com instantes fixos.
reset role;
delete from public.uso_diario;
select private.registrar_uso_em('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a2',
  'propostas', '2026-11-15 01:30:00+00');
select is(
  (select dia from public.uso_diario),
  '2026-11-14'::date,
  '01:30 UTC de 15/11 é dia 14/11 em São Paulo: o dia segue o fuso da consultoria'
);

select private.registrar_uso_em('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a2',
  'propostas', '2026-11-15 01:33:00+00');
select is(
  (select ultimo_em from public.uso_diario),
  '2026-11-15 01:30:00+00'::timestamptz,
  'menos de 5 minutos depois: não escreve de novo'
);

select private.registrar_uso_em('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a2',
  'propostas', '2026-11-15 01:36:00+00');
select results_eq(
  $$select count(*), min(primeiro_em), max(ultimo_em) from public.uso_diario$$,
  $$values (1::bigint, '2026-11-15 01:30:00+00'::timestamptz, '2026-11-15 01:36:00+00'::timestamptz)$$,
  'depois de 5 minutos: renova o último uso, mantém o primeiro e não cria outra linha'
);

select private.registrar_uso_em('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a2',
  'propostas', '2026-11-15 03:10:00+00');
select is(
  (select array_agg(dia order by dia) from public.uso_diario),
  array['2026-11-14', '2026-11-15']::date[],
  'depois da meia-noite em São Paulo: outro dia, outra linha'
);

-- ---------------------------------------------------------------------------
-- C. A central lê o uso (dados relativos a agora)
-- ---------------------------------------------------------------------------
delete from public.uso_diario;
update public.consultoria set criada_em = now() - interval '90 days'
where id in ('c0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000b');

-- Três consultorias a mais, cada uma com uma pessoa ativa e nenhum uso:
-- antiga (criada há 30 dias), recente (criada hoje) e arquivada (criada há 60 dias).
insert into public.consultoria (id, nome, fuso, situacao, criada_em) values
  ('c0000000-0000-4000-8000-00000000000c', 'Consultoria Antiga', 'America/Sao_Paulo', 'ativa',
   now() - interval '30 days'),
  ('c0000000-0000-4000-8000-00000000000d', 'Consultoria Recente', 'America/Sao_Paulo', 'ativa', now()),
  ('c0000000-0000-4000-8000-00000000000e', 'Consultoria Arquivada', 'America/Sao_Paulo', 'arquivada',
   now() - interval '60 days');
insert into public.membro (id, consultoria_id, usuario_id, papel) values
  ('d0000000-0000-4000-8000-0000000000c1', 'c0000000-0000-4000-8000-00000000000c',
   'a0000000-0000-4000-8000-000000000001', 'gestao'),
  ('d0000000-0000-4000-8000-0000000000d1', 'c0000000-0000-4000-8000-00000000000d',
   'a0000000-0000-4000-8000-000000000001', 'gestao'),
  ('d0000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000e',
   'a0000000-0000-4000-8000-000000000001', 'gestao');

-- Filtroville: Ana usou licenças há 5 minutos e orçamentos há 10 dias; Bruno, orçamentos há 3 dias.
-- Verde Sul: Helena usou propostas há 20 dias.
insert into public.uso_diario (consultoria_id, membro_id, dia, modulo, primeiro_em, ultimo_em)
select u.consultoria_id, u.membro_id, ((now() - u.ha) at time zone 'America/Sao_Paulo')::date, u.modulo,
       now() - u.ha, now() - u.ha
from (values
  ('c0000000-0000-4000-8000-00000000000a'::uuid, 'd0000000-0000-4000-8000-0000000000a2'::uuid,
   'licencas_e_prazos', interval '5 minutes'),
  ('c0000000-0000-4000-8000-00000000000a'::uuid, 'd0000000-0000-4000-8000-0000000000a2'::uuid,
   'orcamentos', interval '10 days'),
  ('c0000000-0000-4000-8000-00000000000a'::uuid, 'd0000000-0000-4000-8000-0000000000a3'::uuid,
   'orcamentos', interval '3 days'),
  ('c0000000-0000-4000-8000-00000000000b'::uuid, 'd0000000-0000-4000-8000-0000000000b2'::uuid,
   'propostas', interval '20 days')
) as u (consultoria_id, membro_id, modulo, ha);

select testes.autenticar_com_dois_fatores('operador@grama.test');

select results_eq(
  $$select agora, ultimos_7_dias, ultimos_30_dias from public.central_resumo_de_uso()$$,
  $$values (1::bigint, 1::bigint, 2::bigint)$$,
  'resumo: 1 consultoria usando agora (15 min), 1 nos últimos 7 dias e 2 nos últimos 30'
);
select results_eq(
  $$select agora from public.central_resumo_de_uso(4)$$,
  $$values (0::bigint)$$,
  'o limiar de "agora" vem do parâmetro'
);

select results_eq(
  $$select nome, pessoas_ativas, ultimo_uso_em is null, total from public.central_alertas_sem_uso()$$,
  $$values ('Consultoria Antiga', 1::bigint, true, 2::bigint),
           ('Verde Sul Ambiental', 2::bigint, false, 2::bigint)$$,
  'alerta de 14 dias: a que nunca usou (criada há 30 dias) e a sem uso há 20 dias; sem a recente, a arquivada e a em uso'
);
select results_eq(
  $$select nome from public.central_alertas_sem_uso(25)$$,
  $$values ('Consultoria Antiga')$$,
  'o limiar do alerta vem do parâmetro'
);
select results_eq(
  $$select nome, total from public.central_alertas_sem_uso(14, 1, 1)$$,
  $$values ('Verde Sul Ambiental', 2::bigint)$$,
  'alertas paginados com o total'
);

select is(
  (select ultimo_uso_em from public.central_listar_consultorias()
   where nome = 'Filtroville Consultoria Ambiental'),
  now() - interval '5 minutes',
  'a lista traz o último uso da consultoria'
);
select ok(
  (select ultimo_uso_em is null from public.central_listar_consultorias() where nome = 'Consultoria Recente'),
  'consultoria sem uso: último uso vazio'
);

select results_eq(
  $$select nome, ultimo_uso_em, dias_com_uso_30
    from public.central_listar_pessoas('c0000000-0000-4000-8000-00000000000a')
    where nome in ('Ana Ribeiro', 'Bruno Tavares', 'Camila Souza')$$,
  $$values ('Ana Ribeiro', now() - interval '5 minutes', 2::bigint),
           ('Bruno Tavares', now() - interval '3 days', 1::bigint),
           ('Camila Souza', null::timestamptz, 0::bigint)$$,
  'por pessoa: último uso e dias com uso em 30 dias'
);

select results_eq(
  $$select modulo, dias from public.central_uso_por_modulo('c0000000-0000-4000-8000-00000000000a')$$,
  $$values ('licencas_e_prazos', 1::bigint), ('orcamentos', 2::bigint), ('propostas', 0::bigint),
           ('equipe_e_conta', 0::bigint)$$,
  'por área: dias com uso nos últimos 30 dias, as quatro áreas na ordem do menu'
);
select is(
  (select count(*) from public.central_uso_por_modulo(gen_random_uuid())),
  0::bigint,
  'consultoria inexistente: nenhuma área'
);

-- Uso registrado por outra consultoria não aparece na Filtroville.
select is(
  (select dias from public.central_uso_por_modulo('c0000000-0000-4000-8000-00000000000b')
   where modulo = 'propostas'),
  1::bigint,
  'a Verde Sul tem só o próprio uso'
);

select * from finish();

rollback;
