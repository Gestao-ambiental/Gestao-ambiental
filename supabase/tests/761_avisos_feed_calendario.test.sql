-- Avisos (P5, ADR-0047): link do calendário. O token (64 hex) sai uma vez e só o hash é gravado;
-- gerar de novo revoga o anterior; revogar é idempotente; o cliente nunca lê token_hash; cada um
-- vê só o próprio link (outra consultoria, zero linhas). feed_do_calendario (service role) traz só
-- os prazos do membro, de hoje − 60 a hoje + 400; token revogado, inválido, de membro desligado ou
-- de consultoria arquivada: sempre token_invalido. Auditoria sem o hash e sem o último acesso.
begin;

set local timezone to 'America/Sao_Paulo';

select plan(26);

select testes.criar_dados_sinteticos();

select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

-- ---------------------------------------------------------------------------
-- Cenário: E1 com AuA ativa (validade h+5) e ocorrências da Ana (h−61, h−2, h+7, h+400, h+401),
-- do Bruno (h+3), sem responsável (h) e uma concluída da Ana (h+1). Verde Sul: uma ocorrência
-- do Gustavo (h+1).
-- ---------------------------------------------------------------------------
insert into public.empreendimento (id, consultoria_id, nome, criado_por) values
  ('76100000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a', 'Metalúrgica Açores',
   'd0000000-0000-4000-8000-0000000000a1'),
  ('76100000-0000-4000-8000-0000000000eb', 'c0000000-0000-4000-8000-00000000000b', 'Metalúrgica Verde Sul',
   'd0000000-0000-4000-8000-0000000000b1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome) values
  ('76100000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
   '76100000-0000-4000-8000-0000000000e1', 'Matriz'),
  ('76100000-0000-4000-8000-0000000000fb', 'c0000000-0000-4000-8000-00000000000b',
   '76100000-0000-4000-8000-0000000000eb', 'Fábrica');

insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, tipo_id, numero, situacao,
                                assinado_em, marco, validade, criado_por, ativado_em, ativado_por,
                                chave_ativacao)
select x.id, x.cid, x.eid, x.uid,
       (select t.id from public.tipo_instrumento as t where t.consultoria_id = x.cid and t.sigla = 'AuA'),
       x.numero, 'ativo', current_setting('testes.hoje')::date - 30, 'assinatura',
       current_setting('testes.hoje')::date + 5, x.autor, now(), x.autor, gen_random_uuid()
from (values
  ('76100000-0000-4000-8000-000000000011'::uuid, 'c0000000-0000-4000-8000-00000000000a'::uuid,
   '76100000-0000-4000-8000-0000000000e1'::uuid, '76100000-0000-4000-8000-0000000000f1'::uuid,
   '10/2025', 'd0000000-0000-4000-8000-0000000000a1'::uuid),
  ('76100000-0000-4000-8000-0000000000b1', 'c0000000-0000-4000-8000-00000000000b',
   '76100000-0000-4000-8000-0000000000eb', '76100000-0000-4000-8000-0000000000fb',
   '20/2025', 'd0000000-0000-4000-8000-0000000000b1')
) as x (id, cid, eid, uid, numero, autor);

insert into public.condicionante (id, consultoria_id, instrumento_id, codigo, posicao, revisao) values
  ('76100000-0000-4000-8000-000000000021', 'c0000000-0000-4000-8000-00000000000a',
   '76100000-0000-4000-8000-000000000011', 'C-01', 1, 'aceita'),
  ('76100000-0000-4000-8000-0000000000b2', 'c0000000-0000-4000-8000-00000000000b',
   '76100000-0000-4000-8000-0000000000b1', 'C-09', 1, 'aceita');
insert into public.condicionante_versao (id, consultoria_id, condicionante_id, titulo, natureza) values
  ('76100000-0000-4000-8000-000000000031', 'c0000000-0000-4000-8000-00000000000a',
   '76100000-0000-4000-8000-000000000021', 'Monitoramento de efluentes', 'obrigacao'),
  ('76100000-0000-4000-8000-0000000000b3', 'c0000000-0000-4000-8000-00000000000b',
   '76100000-0000-4000-8000-0000000000b2', 'Relatório de ruído', 'obrigacao');
update public.condicionante as c set versao_vigente_id = v.id
from public.condicionante_versao as v
where v.condicionante_id = c.id and c.id in ('76100000-0000-4000-8000-000000000021',
                                             '76100000-0000-4000-8000-0000000000b2');

insert into public.ocorrencia (id, consultoria_id, instrumento_id, condicionante_versao_id, ciclo,
                               prazo_oficial_original, prazo_oficial_atual, responsavel_id, situacao,
                               chave_idempotencia, concluida_em, concluida_por)
select x.id, x.cid, x.iid, x.vid, x.ciclo,
       current_setting('testes.hoje')::date + x.prazo, current_setting('testes.hoje')::date + x.prazo,
       x.resp, x.situacao::public.situacao_ocorrencia, 'a761-' || x.id::text,
       case when x.situacao = 'concluida' then now() end,
       case when x.situacao = 'concluida' then x.resp end
from (values
  ('76100000-0000-4000-8000-000000000051'::uuid, 'c0000000-0000-4000-8000-00000000000a'::uuid,
   '76100000-0000-4000-8000-000000000011'::uuid, '76100000-0000-4000-8000-000000000031'::uuid, 1,
   -61, 'd0000000-0000-4000-8000-0000000000a2'::uuid, 'aberta'),
  ('76100000-0000-4000-8000-000000000052', 'c0000000-0000-4000-8000-00000000000a',
   '76100000-0000-4000-8000-000000000011', '76100000-0000-4000-8000-000000000031', 2,
   -2, 'd0000000-0000-4000-8000-0000000000a2', 'aberta'),
  ('76100000-0000-4000-8000-000000000053', 'c0000000-0000-4000-8000-00000000000a',
   '76100000-0000-4000-8000-000000000011', '76100000-0000-4000-8000-000000000031', 3,
   7, 'd0000000-0000-4000-8000-0000000000a2', 'aberta'),
  ('76100000-0000-4000-8000-000000000054', 'c0000000-0000-4000-8000-00000000000a',
   '76100000-0000-4000-8000-000000000011', '76100000-0000-4000-8000-000000000031', 4,
   400, 'd0000000-0000-4000-8000-0000000000a2', 'aberta'),
  ('76100000-0000-4000-8000-000000000055', 'c0000000-0000-4000-8000-00000000000a',
   '76100000-0000-4000-8000-000000000011', '76100000-0000-4000-8000-000000000031', 5,
   401, 'd0000000-0000-4000-8000-0000000000a2', 'aberta'),
  ('76100000-0000-4000-8000-000000000056', 'c0000000-0000-4000-8000-00000000000a',
   '76100000-0000-4000-8000-000000000011', '76100000-0000-4000-8000-000000000031', 6,
   3, 'd0000000-0000-4000-8000-0000000000a3', 'aberta'),
  ('76100000-0000-4000-8000-000000000057', 'c0000000-0000-4000-8000-00000000000a',
   '76100000-0000-4000-8000-000000000011', '76100000-0000-4000-8000-000000000031', 7,
   0, null, 'aberta'),
  ('76100000-0000-4000-8000-000000000058', 'c0000000-0000-4000-8000-00000000000a',
   '76100000-0000-4000-8000-000000000011', '76100000-0000-4000-8000-000000000031', 8,
   1, 'd0000000-0000-4000-8000-0000000000a2', 'concluida'),
  ('76100000-0000-4000-8000-0000000000b5', 'c0000000-0000-4000-8000-00000000000b',
   '76100000-0000-4000-8000-0000000000b1', '76100000-0000-4000-8000-0000000000b3', 1,
   1, 'd0000000-0000-4000-8000-0000000000b1', 'aberta')
) as x (id, cid, iid, vid, ciclo, prazo, resp, situacao);

-- ---------------------------------------------------------------------------
-- Quem executa
-- ---------------------------------------------------------------------------
select ok(
  has_function_privilege('authenticated', 'public.gerar_link_do_calendario(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.revogar_link_do_calendario(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.gerar_link_do_calendario(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.revogar_link_do_calendario(uuid)', 'execute'),
  'gerar e revogar: authenticated executa, anon não'
);
select ok(
  has_function_privilege('service_role', 'public.feed_do_calendario(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.feed_do_calendario(text)', 'execute')
  and not has_function_privilege('anon', 'public.feed_do_calendario(text)', 'execute'),
  'feed_do_calendario só pela service role (Edge Function)'
);
select ok(
  not has_column_privilege('authenticated', 'public.feed_calendario', 'token_hash', 'select')
  and has_column_privilege('authenticated', 'public.feed_calendario', 'criado_em', 'select')
  and not has_table_privilege('authenticated', 'public.feed_calendario', 'insert')
  and not has_table_privilege('anon', 'public.feed_calendario', 'select'),
  'o cliente lê o link sem o hash e não grava; anon nem lê'
);

-- ---------------------------------------------------------------------------
-- Gerar
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');
select set_config('testes.token1', public.gerar_link_do_calendario('c0000000-0000-4000-8000-00000000000a'), true);

select matches(current_setting('testes.token1'), '^[0-9a-f]{64}$', 'o token tem 64 caracteres hexadecimais');

select results_eq(
  $$select link_ativo, link_ultimo_acesso_em from public.meus_avisos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values (true, null::timestamptz)$$,
  'meus_avisos mostra o link ativo, ainda sem uso'
);
select is(
  (select count(*) from public.feed_calendario where revogado_em is null),
  1::bigint,
  'a pessoa vê o próprio link'
);
select throws_ok(
  $$select token_hash from public.feed_calendario$$,
  '42501', null,
  'o cliente não lê token_hash'
);

reset role;
select ok(
  (select f.token_hash = private.hash_do_token(current_setting('testes.token1'))
          and f.token_hash <> current_setting('testes.token1')
   from public.feed_calendario as f
   where f.membro_id = 'd0000000-0000-4000-8000-0000000000a2'),
  'o banco guarda só o SHA-256 do token, nunca o token'
);

select testes.autenticar_como('eduardo@filtroville.test');
select is((select count(*) from public.feed_calendario), 0::bigint, 'a Gestão não vê o link de outro membro');
select testes.autenticar_como('gustavo@verdesul.test');
select is((select count(*) from public.feed_calendario), 0::bigint, 'outra consultoria não vê nenhum link');
select throws_ok(
  $$select public.gerar_link_do_calendario('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', 'sem_permissao',
  'outra consultoria não gera link na Filtroville'
);
select throws_ok(
  $$select public.revogar_link_do_calendario('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', 'sem_permissao',
  'outra consultoria não revoga link na Filtroville'
);

-- ---------------------------------------------------------------------------
-- Feed
-- ---------------------------------------------------------------------------
reset role;
select results_eq(
  $$select id, prazo - current_setting('testes.hoje')::date, codigo, empreendimento_nome
    from public.feed_do_calendario(private.hash_do_token(current_setting('testes.token1')))$$,
  $$values ('76100000-0000-4000-8000-000000000052'::uuid, -2, 'C-01'::text, 'Metalúrgica Açores'::text),
           ('76100000-0000-4000-8000-000000000053'::uuid, 7, 'C-01'::text, 'Metalúrgica Açores'::text),
           ('76100000-0000-4000-8000-000000000054'::uuid, 400, 'C-01'::text, 'Metalúrgica Açores'::text)$$,
  'o feed traz só os prazos da Ana, de hoje − 60 a hoje + 400, sem os sem responsável e sem a validade'
);
select ok(
  (select ultimo_acesso_em is not null from public.feed_calendario
   where membro_id = 'd0000000-0000-4000-8000-0000000000a2'),
  'o acesso ao feed registra o último uso'
);
select is(
  (select count(*) from public.auditoria where entidade = 'feed_calendario' and acao = 'update'),
  0::bigint,
  'o último uso não gera linha de auditoria'
);

select throws_ok(
  $$select * from public.feed_do_calendario('abc')$$,
  'P0001', 'token_invalido',
  'hash fora do formato: token_invalido'
);
select throws_ok(
  $$select * from public.feed_do_calendario(repeat('0', 64))$$,
  'P0001', 'token_invalido',
  'hash desconhecido: token_invalido'
);

-- ---------------------------------------------------------------------------
-- Gerar de novo e revogar
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');
select set_config('testes.token2', public.gerar_link_do_calendario('c0000000-0000-4000-8000-00000000000a'), true);
reset role;

select ok(
  current_setting('testes.token2') <> current_setting('testes.token1')
  and (select count(*) from public.feed_calendario
       where membro_id = 'd0000000-0000-4000-8000-0000000000a2' and revogado_em is null) = 1
  and (select count(*) from public.feed_calendario
       where membro_id = 'd0000000-0000-4000-8000-0000000000a2') = 2,
  'gerar de novo cria um token novo e deixa um só ativo'
);
select throws_ok(
  format('select * from public.feed_do_calendario(%L)', private.hash_do_token(current_setting('testes.token1'))),
  'P0001', 'token_invalido',
  'o link anterior deixa de valer'
);
select is(
  (select count(*) from public.feed_do_calendario(private.hash_do_token(current_setting('testes.token2')))),
  3::bigint,
  'o link novo vale'
);

select testes.autenticar_como('ana@filtroville.test');
select is(public.revogar_link_do_calendario('c0000000-0000-4000-8000-00000000000a'), true, 'revogar devolve verdadeiro');
select is(public.revogar_link_do_calendario('c0000000-0000-4000-8000-00000000000a'), false,
  'revogar de novo devolve falso (nada a revogar)');
reset role;
select throws_ok(
  format('select * from public.feed_do_calendario(%L)', private.hash_do_token(current_setting('testes.token2'))),
  'P0001', 'token_invalido',
  'link revogado: token_invalido'
);

-- ---------------------------------------------------------------------------
-- Membro desligado e consultoria arquivada
-- ---------------------------------------------------------------------------
select testes.autenticar_como('bruno@filtroville.test');
select set_config('testes.token3', public.gerar_link_do_calendario('c0000000-0000-4000-8000-00000000000a'), true);
select testes.autenticar_como('eduardo@filtroville.test');
select set_config('testes.token4', public.gerar_link_do_calendario('c0000000-0000-4000-8000-00000000000a'), true);
reset role;

update public.membro set situacao = 'desligado', desligado_em = now()
where id = 'd0000000-0000-4000-8000-0000000000a3';
select throws_ok(
  format('select * from public.feed_do_calendario(%L)', private.hash_do_token(current_setting('testes.token3'))),
  'P0001', 'token_invalido',
  'membro desligado: token_invalido'
);

update public.consultoria set situacao = 'arquivada' where id = 'c0000000-0000-4000-8000-00000000000a';
select throws_ok(
  format('select * from public.feed_do_calendario(%L)', private.hash_do_token(current_setting('testes.token4'))),
  'P0001', 'token_invalido',
  'consultoria arquivada: token_invalido'
);

-- ---------------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------------
select ok(
  (select count(*) from public.auditoria where entidade = 'feed_calendario') > 0
  and not exists (
    select 1 from public.auditoria
    where entidade = 'feed_calendario'
      and (coalesce(antes, '{}') ? 'token_hash' or coalesce(depois, '{}') ? 'token_hash'
           or coalesce(antes, '{}') ? 'ultimo_acesso_em' or coalesce(depois, '{}') ? 'ultimo_acesso_em')),
  'a auditoria do link não guarda o hash nem o último uso'
);

select * from finish();

rollback;
