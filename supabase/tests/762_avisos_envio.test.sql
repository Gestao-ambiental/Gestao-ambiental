-- Avisos (P5, ADR-0047): resumo diário. Quem está pendente (7 h às 9 h 59 no fuso, dia útil
-- nacional, membro ativo, resumo ligado, consultoria em teste ou ativa); os itens de cada um
-- (meus; e, para a Gestão, sem responsável e os da consultoria; 7 dias à frente e atrasados;
-- outra consultoria nunca); a reserva (uma por membro e dia, retomada após 30 minutos, no máximo
-- 3 tentativas) e o registro do resultado. Só a service role executa; o cliente lê só os próprios
-- envios.
begin;

set local timezone to 'America/Sao_Paulo';

select plan(41);

select testes.criar_dados_sinteticos();

select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

-- ---------------------------------------------------------------------------
-- Cenário: E1 com AuA ativa (validade h+5, da consultoria). Ocorrências: Ana h−2 e h+7 (meus),
-- Ana h+8 (fora dos 7 dias), Ana h+1 concluída (fora), Bruno h+3, sem responsável h.
-- Verde Sul: AuA ativa (validade h+2) e ocorrência sem responsável h+1.
-- ---------------------------------------------------------------------------
insert into public.empreendimento (id, consultoria_id, nome, criado_por) values
  ('76200000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a', 'Metalúrgica Açores',
   'd0000000-0000-4000-8000-0000000000a1'),
  ('76200000-0000-4000-8000-0000000000eb', 'c0000000-0000-4000-8000-00000000000b', 'Metalúrgica Verde Sul',
   'd0000000-0000-4000-8000-0000000000b1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome) values
  ('76200000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
   '76200000-0000-4000-8000-0000000000e1', 'Matriz'),
  ('76200000-0000-4000-8000-0000000000fb', 'c0000000-0000-4000-8000-00000000000b',
   '76200000-0000-4000-8000-0000000000eb', 'Fábrica');

insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, tipo_id, numero, situacao,
                                assinado_em, marco, validade, criado_por, ativado_em, ativado_por,
                                chave_ativacao)
select x.id, x.cid, x.eid, x.uid,
       (select t.id from public.tipo_instrumento as t where t.consultoria_id = x.cid and t.sigla = 'AuA'),
       x.numero, 'ativo', current_setting('testes.hoje')::date - 30, 'assinatura',
       current_setting('testes.hoje')::date + x.validade, x.autor, now(), x.autor, gen_random_uuid()
from (values
  ('76200000-0000-4000-8000-000000000011'::uuid, 'c0000000-0000-4000-8000-00000000000a'::uuid,
   '76200000-0000-4000-8000-0000000000e1'::uuid, '76200000-0000-4000-8000-0000000000f1'::uuid,
   '10/2025', 5, 'd0000000-0000-4000-8000-0000000000a1'::uuid),
  ('76200000-0000-4000-8000-0000000000b1', 'c0000000-0000-4000-8000-00000000000b',
   '76200000-0000-4000-8000-0000000000eb', '76200000-0000-4000-8000-0000000000fb',
   '20/2025', 2, 'd0000000-0000-4000-8000-0000000000b1')
) as x (id, cid, eid, uid, numero, validade, autor);

insert into public.condicionante (id, consultoria_id, instrumento_id, codigo, posicao, revisao) values
  ('76200000-0000-4000-8000-000000000021', 'c0000000-0000-4000-8000-00000000000a',
   '76200000-0000-4000-8000-000000000011', 'C-01', 1, 'aceita'),
  ('76200000-0000-4000-8000-0000000000b2', 'c0000000-0000-4000-8000-00000000000b',
   '76200000-0000-4000-8000-0000000000b1', 'C-09', 1, 'aceita');
insert into public.condicionante_versao (id, consultoria_id, condicionante_id, titulo, natureza) values
  ('76200000-0000-4000-8000-000000000031', 'c0000000-0000-4000-8000-00000000000a',
   '76200000-0000-4000-8000-000000000021', 'Monitoramento de efluentes', 'obrigacao'),
  ('76200000-0000-4000-8000-0000000000b3', 'c0000000-0000-4000-8000-00000000000b',
   '76200000-0000-4000-8000-0000000000b2', 'Relatório de ruído', 'obrigacao');
update public.condicionante as c set versao_vigente_id = v.id
from public.condicionante_versao as v
where v.condicionante_id = c.id and c.id in ('76200000-0000-4000-8000-000000000021',
                                             '76200000-0000-4000-8000-0000000000b2');

insert into public.ocorrencia (id, consultoria_id, instrumento_id, condicionante_versao_id, ciclo,
                               prazo_oficial_original, prazo_oficial_atual, responsavel_id, situacao,
                               chave_idempotencia, concluida_em, concluida_por)
select x.id, x.cid, x.iid, x.vid, x.ciclo,
       current_setting('testes.hoje')::date + x.prazo, current_setting('testes.hoje')::date + x.prazo,
       x.resp, x.situacao::public.situacao_ocorrencia, 'a762-' || x.id::text,
       case when x.situacao = 'concluida' then now() end,
       case when x.situacao = 'concluida' then x.resp end
from (values
  ('76200000-0000-4000-8000-000000000051'::uuid, 'c0000000-0000-4000-8000-00000000000a'::uuid,
   '76200000-0000-4000-8000-000000000011'::uuid, '76200000-0000-4000-8000-000000000031'::uuid, 1,
   -2, 'd0000000-0000-4000-8000-0000000000a2'::uuid, 'aberta'),
  ('76200000-0000-4000-8000-000000000052', 'c0000000-0000-4000-8000-00000000000a',
   '76200000-0000-4000-8000-000000000011', '76200000-0000-4000-8000-000000000031', 2,
   7, 'd0000000-0000-4000-8000-0000000000a2', 'aberta'),
  ('76200000-0000-4000-8000-000000000053', 'c0000000-0000-4000-8000-00000000000a',
   '76200000-0000-4000-8000-000000000011', '76200000-0000-4000-8000-000000000031', 3,
   8, 'd0000000-0000-4000-8000-0000000000a2', 'aberta'),
  ('76200000-0000-4000-8000-000000000054', 'c0000000-0000-4000-8000-00000000000a',
   '76200000-0000-4000-8000-000000000011', '76200000-0000-4000-8000-000000000031', 4,
   1, 'd0000000-0000-4000-8000-0000000000a2', 'concluida'),
  ('76200000-0000-4000-8000-000000000055', 'c0000000-0000-4000-8000-00000000000a',
   '76200000-0000-4000-8000-000000000011', '76200000-0000-4000-8000-000000000031', 5,
   3, 'd0000000-0000-4000-8000-0000000000a3', 'aberta'),
  ('76200000-0000-4000-8000-000000000056', 'c0000000-0000-4000-8000-00000000000a',
   '76200000-0000-4000-8000-000000000011', '76200000-0000-4000-8000-000000000031', 6,
   0, null, 'aberta'),
  ('76200000-0000-4000-8000-0000000000b5', 'c0000000-0000-4000-8000-00000000000b',
   '76200000-0000-4000-8000-0000000000b1', '76200000-0000-4000-8000-0000000000b3', 1,
   1, null, 'aberta')
) as x (id, cid, iid, vid, ciclo, prazo, resp, situacao);

-- ---------------------------------------------------------------------------
-- Quem executa
-- ---------------------------------------------------------------------------
select ok(
  (select bool_and(has_function_privilege('service_role', f, 'execute')
                   and not has_function_privilege('authenticated', f, 'execute')
                   and not has_function_privilege('anon', f, 'execute'))
   from unnest(array[
     'public.avisos_do_dia_pendentes(timestamptz)',
     'public.itens_do_resumo_diario(uuid, uuid, date)',
     'public.reservar_aviso_do_dia(uuid, uuid, date)',
     'public.registrar_aviso_do_dia(uuid, text, text)',
     'public.desligar_resumo_por_link(uuid, uuid)',
     'public.feed_do_calendario(text)'
   ]) as f),
  'as RPCs das Edge Functions são só da service role'
);
select ok(
  not has_function_privilege('authenticated', 'private.disparar_avisos_do_dia()', 'execute')
  and not has_function_privilege('anon', 'private.disparar_avisos_do_dia()', 'execute'),
  'o disparo do pg_cron não é executável pelo cliente'
);
select lives_ok(
  $$select private.disparar_avisos_do_dia()$$,
  'sem Vault nem pg_net, o disparo não faz nada (e não falha)'
);

-- ---------------------------------------------------------------------------
-- Pendentes: janela das 7 h às 9 h 59, dia útil (segunda, 23/11/2026)
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.avisos_do_dia_pendentes('2026-11-23 06:59:00-03')
   where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  0::bigint, '06:59: ninguém pendente'
);
select results_eq(
  $$select membro_id, dia, papel::text from public.avisos_do_dia_pendentes('2026-11-23 07:00:00-03')
    where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'$$,
  $$values ('d0000000-0000-4000-8000-0000000000a1'::uuid, '2026-11-23'::date, 'gestao'::text),
           ('d0000000-0000-4000-8000-0000000000a2'::uuid, '2026-11-23'::date, 'equipe'::text),
           ('d0000000-0000-4000-8000-0000000000a3'::uuid, '2026-11-23'::date, 'equipe'::text),
           ('d0000000-0000-4000-8000-0000000000a4'::uuid, '2026-11-23'::date, 'equipe'::text),
           ('d0000000-0000-4000-8000-0000000000a5'::uuid, '2026-11-23'::date, 'equipe'::text),
           ('d0000000-0000-4000-8000-0000000000a6'::uuid, '2026-11-23'::date, 'equipe'::text)$$,
  '07:00: todo membro ativo está pendente (sem preferência = ligado), com o dia civil local'
);
select ok(
  (select email = 'ana@filtroville.test' and membro_nome = 'Ana Ribeiro'
          and consultoria_nome = 'Filtroville Consultoria Ambiental'
   from public.avisos_do_dia_pendentes('2026-11-23 07:00:00-03')
   where membro_id = 'd0000000-0000-4000-8000-0000000000a2'),
  'a linha traz e-mail, nome e consultoria para o e-mail'
);
select is(
  (select count(*) from public.avisos_do_dia_pendentes('2026-11-23 09:59:00-03')
   where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  6::bigint, '09:59: ainda pendentes (recuperação)'
);
select is(
  (select count(*) from public.avisos_do_dia_pendentes('2026-11-23 10:00:00-03')
   where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  0::bigint, '10:00: o resumo do dia não sai mais'
);
select is(
  (select count(*) from public.avisos_do_dia_pendentes('2026-11-21 08:00:00-03')
   where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  0::bigint, 'sábado: ninguém pendente'
);
select is(
  (select count(*) from public.avisos_do_dia_pendentes('2026-11-20 08:00:00-03')
   where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  0::bigint, 'feriado nacional (20/11) em dia de semana: ninguém pendente'
);
select is(
  (select count(*) from public.avisos_do_dia_pendentes('2026-11-23 10:30:00+00')
   where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  6::bigint, 'a janela é no fuso da consultoria (10:30 UTC = 07:30 em São Paulo)'
);

-- Preferência desligada e membro desligado saem.
select public.desligar_resumo_por_link('c0000000-0000-4000-8000-00000000000a',
                                       'd0000000-0000-4000-8000-0000000000a6');
update public.membro set situacao = 'desligado', desligado_em = now()
where id = 'd0000000-0000-4000-8000-0000000000a5';
select is(
  (select array_agg(membro_id order by membro_id) from public.avisos_do_dia_pendentes('2026-11-23 07:00:00-03')
   where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  array['d0000000-0000-4000-8000-0000000000a1', 'd0000000-0000-4000-8000-0000000000a2',
        'd0000000-0000-4000-8000-0000000000a3', 'd0000000-0000-4000-8000-0000000000a4']::uuid[],
  'resumo desligado e membro desligado não ficam pendentes'
);

-- ---------------------------------------------------------------------------
-- Itens do resumo (p_dia = hoje)
-- ---------------------------------------------------------------------------
select results_eq(
  $$select grupo, tipo_linha, id, dias, codigo, titulo, empreendimento_nome, unidade_nome
    from public.itens_do_resumo_diario('c0000000-0000-4000-8000-00000000000a',
                                       'd0000000-0000-4000-8000-0000000000a2',
                                       current_setting('testes.hoje')::date)$$,
  $$values ('meus'::text, 'ocorrencia'::text, '76200000-0000-4000-8000-000000000051'::uuid, -2, 'C-01'::text,
            'Monitoramento de efluentes'::text, 'Metalúrgica Açores'::text, 'Matriz'::text),
           ('meus', 'ocorrencia', '76200000-0000-4000-8000-000000000052'::uuid, 7, 'C-01',
            'Monitoramento de efluentes', 'Metalúrgica Açores', 'Matriz')$$,
  'Equipe: só os seus, atrasados e até 7 dias (sem concluída, sem h+8, sem os da Gestão)'
);
select results_eq(
  $$select grupo, tipo_linha, id, dias
    from public.itens_do_resumo_diario('c0000000-0000-4000-8000-00000000000a',
                                       'd0000000-0000-4000-8000-0000000000a1',
                                       current_setting('testes.hoje')::date)$$,
  $$values ('sem_responsavel'::text, 'ocorrencia'::text, '76200000-0000-4000-8000-000000000056'::uuid, 0),
           ('da_consultoria', 'validade', '76200000-0000-4000-8000-000000000011'::uuid, 5)$$,
  'Gestão: sem responsável e da consultoria (validade), sem os prazos dos outros'
);
select results_eq(
  $$select grupo, id, dias
    from public.itens_do_resumo_diario('c0000000-0000-4000-8000-00000000000a',
                                       'd0000000-0000-4000-8000-0000000000a3',
                                       current_setting('testes.hoje')::date)$$,
  $$values ('meus'::text, '76200000-0000-4000-8000-000000000055'::uuid, 3)$$,
  'Bruno: só o dele'
);
select is(
  (select count(*) from public.itens_do_resumo_diario('c0000000-0000-4000-8000-00000000000a',
                                                       'd0000000-0000-4000-8000-0000000000a4',
                                                       current_setting('testes.hoje')::date)),
  0::bigint,
  'Equipe sem prazo: zero itens (o resumo não sai vazio)'
);
select results_eq(
  $$select grupo, id, dias
    from public.itens_do_resumo_diario('c0000000-0000-4000-8000-00000000000a',
                                       'd0000000-0000-4000-8000-0000000000a2',
                                       current_setting('testes.hoje')::date + 1)$$,
  $$values ('meus'::text, '76200000-0000-4000-8000-000000000051'::uuid, -3),
           ('meus', '76200000-0000-4000-8000-000000000052'::uuid, 6),
           ('meus', '76200000-0000-4000-8000-000000000053'::uuid, 7)$$,
  'dias contam a partir do dia do resumo'
);
select is(
  (select count(*) from public.itens_do_resumo_diario('c0000000-0000-4000-8000-00000000000b',
                                                       'd0000000-0000-4000-8000-0000000000a1',
                                                       current_setting('testes.hoje')::date)),
  0::bigint,
  'membro de outra consultoria: zero itens'
);
select ok(
  (select count(*) = 2
          and bool_and(i.id in ('76200000-0000-4000-8000-0000000000b5', '76200000-0000-4000-8000-0000000000b1'))
   from public.itens_do_resumo_diario('c0000000-0000-4000-8000-00000000000b',
                                      'd0000000-0000-4000-8000-0000000000b1',
                                      current_setting('testes.hoje')::date) as i),
  'Gestão da Verde Sul recebe só os prazos da Verde Sul'
);
select is(
  (select count(*) from public.itens_do_resumo_diario('c0000000-0000-4000-8000-00000000000a',
                                                       'd0000000-0000-4000-8000-0000000000a5',
                                                       current_setting('testes.hoje')::date)),
  0::bigint,
  'membro desligado: zero itens'
);
select throws_ok(
  $$select * from public.itens_do_resumo_diario('c0000000-0000-4000-8000-00000000000a',
                                                'd0000000-0000-4000-8000-0000000000a2', null)$$,
  '22023', 'dia_obrigatorio',
  'dia é obrigatório'
);

-- ---------------------------------------------------------------------------
-- Reserva e registro
-- ---------------------------------------------------------------------------
select set_config('testes.reserva',
  public.reservar_aviso_do_dia('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a2',
                               '2026-11-23')::text, true);
select isnt(nullif(current_setting('testes.reserva'), ''), null, 'a primeira reserva devolve o id');
select is(
  public.reservar_aviso_do_dia('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a2',
                               '2026-11-23'),
  null, 'a segunda reserva do mesmo membro e dia não devolve nada'
);

-- Reserva recente tira da lista; com mais de 30 minutos, volta.
update public.aviso_envio set reservado_em = '2026-11-23 06:50:00-03' where id = current_setting('testes.reserva')::uuid;
select ok(
  not exists (select 1 from public.avisos_do_dia_pendentes('2026-11-23 07:00:00-03')
              where membro_id = 'd0000000-0000-4000-8000-0000000000a2')
  and exists (select 1 from public.avisos_do_dia_pendentes('2026-11-23 07:21:00-03')
              where membro_id = 'd0000000-0000-4000-8000-0000000000a2'),
  'reservado há menos de 30 minutos sai da lista; depois, volta'
);

update public.aviso_envio set reservado_em = now() - interval '31 minutes'
where id = current_setting('testes.reserva')::uuid;
select is(
  public.reservar_aviso_do_dia('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a2',
                               '2026-11-23'),
  current_setting('testes.reserva')::uuid,
  'reserva parada há mais de 30 minutos é retomada (mesmo registro)'
);

select is(public.registrar_aviso_do_dia(current_setting('testes.reserva')::uuid, 'falhou'), true,
  'registra a falha');
select is(
  public.reservar_aviso_do_dia('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a2',
                               '2026-11-23'),
  current_setting('testes.reserva')::uuid,
  'depois da falha, a próxima execução reserva de novo'
);
select is(
  (select tentativas from public.aviso_envio where id = current_setting('testes.reserva')::uuid),
  3, 'três tentativas contadas'
);
select is(public.registrar_aviso_do_dia(current_setting('testes.reserva')::uuid, 'falhou'), true,
  'registra a terceira falha');
select ok(
  public.reservar_aviso_do_dia('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a2',
                               '2026-11-23') is null
  and not exists (select 1 from public.avisos_do_dia_pendentes('2026-11-23 09:00:00-03')
                  where membro_id = 'd0000000-0000-4000-8000-0000000000a2'),
  'depois de 3 tentativas, nem reserva nem fica pendente'
);

-- Envio com sucesso (Bruno).
select set_config('testes.reserva2',
  public.reservar_aviso_do_dia('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a3',
                               '2026-11-23')::text, true);
select throws_ok(
  format('select public.registrar_aviso_do_dia(%L, %L)', current_setting('testes.reserva2'), 'cancelado'),
  '22023', 'situacao_invalida',
  'só enviado ou falhou'
);
select is(public.registrar_aviso_do_dia(current_setting('testes.reserva2')::uuid, 'enviado', 're_123'), true,
  'registra o envio com o id do provedor');
select ok(
  (select situacao = 'enviado' and provedor_id = 're_123' and enviado_em is not null
   from public.aviso_envio where id = current_setting('testes.reserva2')::uuid),
  'o envio fica gravado como enviado'
);
select ok(
  public.registrar_aviso_do_dia(current_setting('testes.reserva2')::uuid, 'falhou') = false
  and public.reservar_aviso_do_dia('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a3',
                                   '2026-11-23') is null
  and not exists (select 1 from public.avisos_do_dia_pendentes('2026-11-23 09:00:00-03')
                  where membro_id = 'd0000000-0000-4000-8000-0000000000a3'),
  'enviado não muda mais, não reserva de novo e não fica pendente'
);
select ok(
  public.reservar_aviso_do_dia('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a6',
                               '2026-11-23') is null
  and public.reservar_aviso_do_dia('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a5',
                                   '2026-11-23') is null
  and public.reservar_aviso_do_dia('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000b1',
                                   '2026-11-23') is null,
  'não reserva para resumo desligado, membro desligado nem membro de outra consultoria'
);

-- ---------------------------------------------------------------------------
-- RLS de aviso_envio
-- ---------------------------------------------------------------------------
select testes.autenticar_como('bruno@filtroville.test');
select results_eq(
  $$select membro_id, situacao from public.aviso_envio$$,
  $$values ('d0000000-0000-4000-8000-0000000000a3'::uuid, 'enviado'::text)$$,
  'cada um lê só os próprios envios'
);
select throws_ok(
  $$insert into public.aviso_envio (consultoria_id, membro_id, dia)
    values ('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a3', '2026-11-24')$$,
  '42501', null,
  'o cliente não grava envio'
);
select testes.autenticar_como('eduardo@filtroville.test');
select is((select count(*) from public.aviso_envio), 0::bigint, 'a Gestão não lê os envios dos outros');
select testes.autenticar_como('gustavo@verdesul.test');
select is((select count(*) from public.aviso_envio), 0::bigint, 'outra consultoria: zero linhas');
select testes.autenticar_como_anonimo();
select throws_ok($$select count(*) from public.aviso_envio$$, '42501', null, 'anon não lê aviso_envio');

-- ---------------------------------------------------------------------------
-- Consultoria arquivada não recebe
-- ---------------------------------------------------------------------------
reset role;
update public.consultoria set situacao = 'arquivada' where id = 'c0000000-0000-4000-8000-00000000000b';
select is(
  (select count(*) from public.avisos_do_dia_pendentes('2026-11-23 07:00:00-03')
   where consultoria_id = 'c0000000-0000-4000-8000-00000000000b'),
  0::bigint,
  'consultoria arquivada: ninguém pendente'
);

select * from finish();

rollback;
