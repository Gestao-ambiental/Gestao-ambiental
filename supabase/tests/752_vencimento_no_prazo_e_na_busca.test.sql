-- Vencimento no prazo e na busca (P4, ADR-0046): só o vigente da série entra em listar_prazos,
-- contar_prazos e listar_calendario, como 'vencimento', sem responsável e sem tipo de licença;
-- a busca acha por tipo, número e órgão (inclusive renovados, nunca excluídos) e leva ao
-- empreendimento; outra consultoria recebe zero.
--
-- Cenário da Filtroville (A), datas relativas a hoje (h):
--   E1 Metalúrgica Açores (cliente C1), unidade U1 | E2 Padaria Central, unidade U2, licença I2 (LAO L-752)
--   VA Alvará 300/2026 em U1, h+20, renovado por VB Alvará 301/2027 em U1, h+40: só VB entra
--   (VB dentro da antecedência de 60 dias, para entrar na Visão; a regra da antecedência está no 754)
--   VC ART em E2, sem unidade e sem número, órgão CREA-SC, ligada a I2, h+5
--   VD Outorga 7/2024 em E1, h+3, excluída (não entra)
--   VE CTF IBAMA 55 em U1, órgão IBAMA, h-2 (vencido)
-- Verde Sul (B): VBB Alvará 9/2026 em EB, h+10.
begin;

set local timezone to 'America/Sao_Paulo';

select plan(23);

select testes.criar_dados_sinteticos();

select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

insert into public.cliente (id, consultoria_id, nome) values
  ('75200000-0000-4000-8000-0000000000c1', 'c0000000-0000-4000-8000-00000000000a', 'Grupo Açoriano');

insert into public.empreendimento (id, consultoria_id, nome, cliente_id, criado_por) values
  ('75200000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a', 'Metalúrgica Açores',
   '75200000-0000-4000-8000-0000000000c1', 'd0000000-0000-4000-8000-0000000000a1'),
  ('75200000-0000-4000-8000-0000000000e2', 'c0000000-0000-4000-8000-00000000000a', 'Padaria Central',
   null, 'd0000000-0000-4000-8000-0000000000a1'),
  ('75200000-0000-4000-8000-0000000000eb', 'c0000000-0000-4000-8000-00000000000b', 'Cerâmica Sulina',
   null, 'd0000000-0000-4000-8000-0000000000b1');

insert into public.unidade (id, consultoria_id, empreendimento_id, nome) values
  ('75200000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
   '75200000-0000-4000-8000-0000000000e1', 'Matriz'),
  ('75200000-0000-4000-8000-0000000000f2', 'c0000000-0000-4000-8000-00000000000a',
   '75200000-0000-4000-8000-0000000000e2', 'Loja');

insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, tipo_id, numero, criado_por)
values ('75200000-0000-4000-8000-000000000012', 'c0000000-0000-4000-8000-00000000000a',
        '75200000-0000-4000-8000-0000000000e2', '75200000-0000-4000-8000-0000000000f2',
        (select t.id from public.tipo_instrumento as t
         where t.consultoria_id = 'c0000000-0000-4000-8000-00000000000a' and t.sigla = 'LAO'),
        'L-752', 'd0000000-0000-4000-8000-0000000000a1');

insert into public.vencimento (id, consultoria_id, empreendimento_id, unidade_id, instrumento_id, tipo_vencimento_id,
                               numero, orgao, valido_ate, antecedencia_dias, anterior_id, criado_por, excluido_em,
                               excluido_por)
select x.id, x.cid, x.eid, x.uid, x.iid,
       (select t.id from public.tipo_vencimento as t where t.consultoria_id = x.cid and t.nome = x.tipo),
       x.numero, x.orgao, current_setting('testes.hoje')::date + x.dias, 60, x.anterior, x.autor,
       case when x.excluido then now() end, case when x.excluido then x.autor end
from (values
  ('75200000-0000-4000-8000-0000000000a1'::uuid, 'c0000000-0000-4000-8000-00000000000a'::uuid,
   '75200000-0000-4000-8000-0000000000e1'::uuid, '75200000-0000-4000-8000-0000000000f1'::uuid, null::uuid,
   'Alvará', '300/2026', null, 20, null::uuid, 'd0000000-0000-4000-8000-0000000000a1'::uuid, false),
  ('75200000-0000-4000-8000-0000000000a2', 'c0000000-0000-4000-8000-00000000000a',
   '75200000-0000-4000-8000-0000000000e1', '75200000-0000-4000-8000-0000000000f1', null,
   'Alvará', '301/2027', null, 40, '75200000-0000-4000-8000-0000000000a1', 'd0000000-0000-4000-8000-0000000000a1',
   false),
  ('75200000-0000-4000-8000-0000000000a3', 'c0000000-0000-4000-8000-00000000000a',
   '75200000-0000-4000-8000-0000000000e2', null, '75200000-0000-4000-8000-000000000012',
   'ART', null, 'CREA-SC', 5, null, 'd0000000-0000-4000-8000-0000000000a1', false),
  ('75200000-0000-4000-8000-0000000000a4', 'c0000000-0000-4000-8000-00000000000a',
   '75200000-0000-4000-8000-0000000000e1', null, null,
   'Outorga', '7/2024', null, 3, null, 'd0000000-0000-4000-8000-0000000000a1', true),
  ('75200000-0000-4000-8000-0000000000a5', 'c0000000-0000-4000-8000-00000000000a',
   '75200000-0000-4000-8000-0000000000e1', '75200000-0000-4000-8000-0000000000f1', null,
   'CTF IBAMA', '55', 'IBAMA', -2, null, 'd0000000-0000-4000-8000-0000000000a1', false),
  ('75200000-0000-4000-8000-0000000000b1', 'c0000000-0000-4000-8000-00000000000b',
   '75200000-0000-4000-8000-0000000000eb', null, null,
   'Alvará', '9/2026', null, 10, null, 'd0000000-0000-4000-8000-0000000000b1', false)
) as x (id, cid, eid, uid, iid, tipo, numero, orgao, dias, anterior, autor, excluido);

select ok(
  not (select p.prosecdef from pg_catalog.pg_proc as p
       where p.oid = 'private.linhas_de_prazo_vencimento(uuid)'::regprocedure)
  and not (select p.prosecdef from pg_catalog.pg_proc as p
           where p.oid = 'private.busca_vencimentos(uuid, text)'::regprocedure)
  and not has_function_privilege('anon', 'private.linhas_de_prazo_vencimento(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.busca_vencimentos(uuid, text)', 'execute'),
  'fonte e grupo do vencimento: security invoker (a RLS decide), anon não executa'
);

-- ---------------------------------------------------------------------------
-- listar_prazos e contar_prazos (Equipe vê a consultoria inteira)
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select results_eq(
  $$select tipo_linha, id, instrumento_id, dias, codigo, titulo, empreendimento_nome, unidade_nome, licenca,
           responsavel_id, responsavel_nome, situacao_ocorrencia::text, total
    from public.listar_prazos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values
    ('vencimento'::text, '75200000-0000-4000-8000-0000000000a5'::uuid, null::uuid, -2, null::text, 'CTF IBAMA 55'::text,
     'Metalúrgica Açores'::text, 'Matriz'::text, null::text, null::uuid, null::text, null::text, 3::bigint),
    ('vencimento', '75200000-0000-4000-8000-0000000000a3', '75200000-0000-4000-8000-000000000012', 5, null, 'ART',
     'Padaria Central', '', 'LAO L-752', null, null, null, 3),
    ('vencimento', '75200000-0000-4000-8000-0000000000a2', null, 40, null, 'Alvará 301/2027',
     'Metalúrgica Açores', 'Matriz', null, null, null, null, 3)$$,
  'listar_prazos: só os vigentes (renovado e excluído não entram), título = tipo + número, licença ligada'
);

select results_eq(
  $$select atrasadas, hoje, proximos_7, sem_responsavel, total
    from public.contar_prazos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values (1::bigint, 0::bigint, 1::bigint, 0::bigint, 3::bigint)$$,
  'contar_prazos: vencimento conta no prazo, nunca em sem responsável'
);

select is(
  (select count(*) from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_sem_responsavel => true)),
  0::bigint,
  'filtro sem responsável não traz vencimento'
);

select is(
  (select count(*) from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_aba => 'minhas')),
  0::bigint,
  'Minhas ações não traz vencimento'
);

select is(
  (select count(*) from public.listar_prazos('c0000000-0000-4000-8000-00000000000a',
     p_tipo_id => (select id from public.tipo_instrumento where sigla = 'LAO'
                     and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'))),
  0::bigint,
  'filtro por tipo de licença não traz vencimento (nem o ligado a uma LAO)'
);

select results_eq(
  $$select id from public.listar_prazos('c0000000-0000-4000-8000-00000000000a',
      p_empreendimento_id => '75200000-0000-4000-8000-0000000000e2')$$,
  $$values ('75200000-0000-4000-8000-0000000000a3'::uuid)$$,
  'filtro por empreendimento'
);

select results_eq(
  $$select id from public.listar_prazos('c0000000-0000-4000-8000-00000000000a',
      p_cliente_id => '75200000-0000-4000-8000-0000000000c1')$$,
  $$values ('75200000-0000-4000-8000-0000000000a5'::uuid), ('75200000-0000-4000-8000-0000000000a2'::uuid)$$,
  'filtro por cliente'
);

select results_eq(
  $$select id from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_faixa => 'atrasadas')$$,
  $$values ('75200000-0000-4000-8000-0000000000a5'::uuid)$$,
  'faixa atrasadas: o vencido'
);

select results_eq(
  $$select id from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_faixa => 'proximos_7')$$,
  $$values ('75200000-0000-4000-8000-0000000000a3'::uuid)$$,
  'faixa próximos 7'
);

-- ---------------------------------------------------------------------------
-- listar_calendario
-- ---------------------------------------------------------------------------
select results_eq(
  $$select tipo_evento, data - current_setting('testes.hoje')::date, id, titulo, unidade_nome, licenca,
           responsavel_nome, sem_responsavel, dias
    from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
      current_setting('testes.hoje')::date - 5, current_setting('testes.hoje')::date + 30)$$,
  $$values
    ('vencimento'::text, -2, '75200000-0000-4000-8000-0000000000a5'::uuid, 'CTF IBAMA 55'::text, 'Matriz'::text,
     null::text, null::text, false, -2),
    ('vencimento', 5, '75200000-0000-4000-8000-0000000000a3', 'ART', '', 'LAO L-752', null, false, 5)$$,
  'calendário: vencimentos vigentes com o tipo próprio, nunca "sem responsável" (o renovado não aparece)'
);

select results_eq(
  $$select id from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
      current_setting('testes.hoje')::date - 5, current_setting('testes.hoje')::date + 30,
      p_unidade_id => '75200000-0000-4000-8000-0000000000f1')$$,
  $$values ('75200000-0000-4000-8000-0000000000a5'::uuid)$$,
  'calendário por unidade: o vencimento sem unidade não entra'
);

select is(
  (select count(*) from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
     current_setting('testes.hoje')::date - 5, current_setting('testes.hoje')::date + 30,
     p_sem_responsavel => true)),
  0::bigint,
  'calendário sem responsável não traz vencimento'
);

-- ---------------------------------------------------------------------------
-- buscar_no_grama
-- ---------------------------------------------------------------------------
select results_eq(
  $$select tipo, id, titulo, detalhe, referencia_id
    from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'alvara')$$,
  $$values
    ('vencimento'::text, '75200000-0000-4000-8000-0000000000a2'::uuid, 'Alvará 301/2027'::text,
     'Metalúrgica Açores · Validade ' || to_char(current_setting('testes.hoje')::date + 40, 'DD/MM/YYYY'),
     '75200000-0000-4000-8000-0000000000e1'::uuid),
    ('vencimento', '75200000-0000-4000-8000-0000000000a1', 'Alvará 300/2026',
     'Metalúrgica Açores · Validade ' || to_char(current_setting('testes.hoje')::date + 20, 'DD/MM/YYYY'),
     '75200000-0000-4000-8000-0000000000e1')$$,
  'busca pelo tipo, sem acento: o vigente e o renovado, levando ao empreendimento'
);

select results_eq(
  $$select tipo, id, titulo, referencia_id
    from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'crea')$$,
  $$values ('vencimento'::text, '75200000-0000-4000-8000-0000000000a3'::uuid, 'ART'::text,
            '75200000-0000-4000-8000-0000000000e2'::uuid)$$,
  'busca pelo órgão'
);

select results_eq(
  $$select tipo, id from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', '301/2027')$$,
  $$values ('vencimento'::text, '75200000-0000-4000-8000-0000000000a2'::uuid)$$,
  'busca pelo número'
);

select is(
  (select count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'outorga')),
  0::bigint,
  'vencimento excluído não aparece na busca'
);

select is(
  (select count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'padaria')
   where tipo = 'vencimento'),
  0::bigint,
  'a busca de vencimento não usa o nome do empreendimento'
);

-- ---------------------------------------------------------------------------
-- Outra consultoria
-- ---------------------------------------------------------------------------
select testes.autenticar_como('gustavo@verdesul.test');

select is(
  (select count(*) from public.listar_prazos('c0000000-0000-4000-8000-00000000000a')),
  0::bigint,
  'Gestão de B lista prazos de A e recebe zero linhas'
);

select is(
  (select count(*) from private.linhas_de_prazo_vencimento('c0000000-0000-4000-8000-00000000000a')),
  0::bigint,
  'a fonte de vencimento chamada direto também volta vazia para B'
);

select is(
  (select count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'alvara')),
  0::bigint,
  'Gestão de B busca vencimento em A e recebe zero linhas'
);

select results_eq(
  $$select tipo_linha, id, dias, unidade_nome from public.listar_prazos('c0000000-0000-4000-8000-00000000000b')$$,
  $$values ('vencimento'::text, '75200000-0000-4000-8000-0000000000b1'::uuid, 10, ''::text)$$,
  'B vê só o próprio vencimento'
);

select results_eq(
  $$select tipo, id from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000b', 'alvara')$$,
  $$values ('vencimento'::text, '75200000-0000-4000-8000-0000000000b1'::uuid)$$,
  'B acha só o próprio vencimento'
);

select * from finish();

rollback;
