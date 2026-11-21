-- Regressão das leituras de prazo e da busca (base das oito funções, P0). Cenário fixo montado
-- aqui, com contagens e linhas fixas de listar_prazos, contar_prazos, listar_calendario e
-- buscar_no_grama, por tipo de linha e por filtro. Escrito contra o código de antes da
-- refatoração em funções por fonte: se este teste muda, a refatoração mudou comportamento.
-- Mudança de propósito (P4, ADR-0046): o alvará virou vencimento do tipo Alvará. As linhas dos
-- alvarás passam de 'validade' ("Validade do alvará", licença "Alvará n") a 'vencimento' (título
-- "Alvará n", licença vazia, porque o alvará não tem licença ligada). Contagens e ordem iguais.
--
-- Cenário da Filtroville (A), datas relativas a hoje (h) no fuso da consultoria:
--   E1 Metalúrgica Açores (cliente Grupo Açoriano), unidade U1
--   E2 Padaria Central (sem cliente), unidade U2
--   I1 LAO 1001/2024 ativa em U1, validade h+400, plano sem protocolo com limite de 150 dias
--   I2 LAO 1002/2024 ativa em U2, validade h+100, plano protocolado (sem linha de limite)
--   I3 AuA 77/2025 ativa em U1, validade h-3 (não-LAO: sem limite)
--   I4 LAO 1003/2024 em rascunho (não entra no prazo)
--   O1 aberta h-5, Ana, meta h-8 | O2 aberta h, sem responsável | O3 em conferência h+4, Bruno,
--   meta h+2 | O4 concluída h-2 (não entra) | O5 aberta h+10 em I2, sem responsável, meta h+7
--   AL1 (U2, h+60) renovado por AL2 (U2, h+425): só AL2 entra | AL3 (U1, h+6, sem número)
--   AL4 (U1, h+3) excluído (não entra)
--   7 empreendimentos "Posto Alfa n" (limite de 5 por grupo na busca); orçamento sobre E1.
-- Verde Sul (B): EB Metalúrgica Verde Sul, IB LAO 1001/2024 (validade h+200, plano padrão: limite
-- de 120 dias), OB aberta h+1 sem responsável, alvará AB h+15.
begin;

set local timezone to 'America/Sao_Paulo';

select plan(41);

select testes.criar_dados_sinteticos();

select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

-- ---------------------------------------------------------------------------
-- Cenário (como dono das tabelas; a escrita por RPC é testada nos arquivos de cada função)
-- ---------------------------------------------------------------------------
insert into public.cliente (id, consultoria_id, nome) values
  ('71000000-0000-4000-8000-0000000000c1', 'c0000000-0000-4000-8000-00000000000a', 'Grupo Açoriano'),
  ('71000000-0000-4000-8000-0000000000c2', 'c0000000-0000-4000-8000-00000000000b', 'Grupo Sulino');

insert into public.empreendimento (id, consultoria_id, nome, cliente_id, criado_por) values
  ('71000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a', 'Metalúrgica Açores',
   '71000000-0000-4000-8000-0000000000c1', 'd0000000-0000-4000-8000-0000000000a1'),
  ('71000000-0000-4000-8000-0000000000e2', 'c0000000-0000-4000-8000-00000000000a', 'Padaria Central',
   null, 'd0000000-0000-4000-8000-0000000000a1'),
  ('71000000-0000-4000-8000-0000000000eb', 'c0000000-0000-4000-8000-00000000000b', 'Metalúrgica Verde Sul',
   '71000000-0000-4000-8000-0000000000c2', 'd0000000-0000-4000-8000-0000000000b1');
insert into public.empreendimento (consultoria_id, nome, criado_por)
select 'c0000000-0000-4000-8000-00000000000a', 'Posto Alfa ' || n::text, 'd0000000-0000-4000-8000-0000000000a1'
from generate_series(1, 7) as n;

insert into public.unidade (id, consultoria_id, empreendimento_id, nome) values
  ('71000000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
   '71000000-0000-4000-8000-0000000000e1', 'Matriz'),
  ('71000000-0000-4000-8000-0000000000f2', 'c0000000-0000-4000-8000-00000000000a',
   '71000000-0000-4000-8000-0000000000e2', 'Loja'),
  ('71000000-0000-4000-8000-0000000000fb', 'c0000000-0000-4000-8000-00000000000b',
   '71000000-0000-4000-8000-0000000000eb', 'Fábrica');

-- Licenças. Ativas com tipo, marco, validade e ativação; I4 em rascunho.
insert into public.instrumento (id, consultoria_id, empreendimento_id, unidade_id, tipo_id, numero, situacao,
                                assinado_em, marco, validade, criado_por, ativado_em, ativado_por,
                                chave_ativacao)
select x.id, x.cid, x.eid, x.uid,
       (select t.id from public.tipo_instrumento as t where t.consultoria_id = x.cid and t.sigla = x.sigla),
       x.numero, x.situacao::public.situacao_instrumento,
       case when x.situacao = 'ativo' then current_setting('testes.hoje')::date - 30 end,
       case when x.situacao = 'ativo' then 'assinatura'::public.marco_instrumento end,
       current_setting('testes.hoje')::date + x.validade,
       x.autor,
       case when x.situacao = 'ativo' then now() end,
       case when x.situacao = 'ativo' then x.autor end,
       case when x.situacao = 'ativo' then gen_random_uuid() end
from (values
  ('71000000-0000-4000-8000-000000000011'::uuid, 'c0000000-0000-4000-8000-00000000000a'::uuid,
   '71000000-0000-4000-8000-0000000000e1'::uuid, '71000000-0000-4000-8000-0000000000f1'::uuid,
   'LAO', '1001/2024', 'ativo', 400, 'd0000000-0000-4000-8000-0000000000a1'::uuid),
  ('71000000-0000-4000-8000-000000000012', 'c0000000-0000-4000-8000-00000000000a',
   '71000000-0000-4000-8000-0000000000e2', '71000000-0000-4000-8000-0000000000f2',
   'LAO', '1002/2024', 'ativo', 100, 'd0000000-0000-4000-8000-0000000000a1'),
  ('71000000-0000-4000-8000-000000000013', 'c0000000-0000-4000-8000-00000000000a',
   '71000000-0000-4000-8000-0000000000e1', '71000000-0000-4000-8000-0000000000f1',
   'AuA', '77/2025', 'ativo', -3, 'd0000000-0000-4000-8000-0000000000a1'),
  ('71000000-0000-4000-8000-000000000014', 'c0000000-0000-4000-8000-00000000000a',
   '71000000-0000-4000-8000-0000000000e1', '71000000-0000-4000-8000-0000000000f1',
   'LAO', '1003/2024', 'rascunho', 500, 'd0000000-0000-4000-8000-0000000000a1'),
  ('71000000-0000-4000-8000-0000000000b1', 'c0000000-0000-4000-8000-00000000000b',
   '71000000-0000-4000-8000-0000000000eb', '71000000-0000-4000-8000-0000000000fb',
   'LAO', '1001/2024', 'ativo', 200, 'd0000000-0000-4000-8000-0000000000b1')
) as x (id, cid, eid, uid, sigla, numero, situacao, validade, autor);

-- Documentos: protocolo de I2 e PDFs dos alvarás.
insert into public.documento (id, consultoria_id, entidade)
select ('71000000-0000-4000-8000-0000000003' || lpad(n::text, 2, '0'))::uuid,
       case when n = 9 then 'c0000000-0000-4000-8000-00000000000b'::uuid
            else 'c0000000-0000-4000-8000-00000000000a'::uuid end,
       case when n = 1 then 'protocolo' else 'alvara' end
from generate_series(1, 9) as n;
insert into public.documento_versao (id, consultoria_id, documento_id, numero, caminho, nome_original, mime,
                                     tamanho_bytes, sha256, autor_id)
select ('71000000-0000-4000-8000-0000000004' || lpad(n::text, 2, '0'))::uuid, d.consultoria_id, d.id, 1,
       d.consultoria_id::text || '/' || d.entidade || '/' || d.id::text || '.pdf', 'arquivo.pdf',
       'application/pdf', 1024, repeat('a', 64),
       case when n = 9 then 'd0000000-0000-4000-8000-0000000000b1'::uuid
            else 'd0000000-0000-4000-8000-0000000000a1'::uuid end
from generate_series(1, 9) as n
join public.documento as d on d.id = ('71000000-0000-4000-8000-0000000003' || lpad(n::text, 2, '0'))::uuid;

-- Planos (criados pela trigger ao ativar a LAO): I1 sem protocolo, limite de 150 dias; I2 protocolado.
update public.plano_renovacao set dias_limite_protocolo = 150
where instrumento_id = '71000000-0000-4000-8000-000000000011';
update public.plano_renovacao
set protocolo_numero = 'PROT-1', protocolado_em = current_setting('testes.hoje')::date - 1,
    protocolo_versao_id = '71000000-0000-4000-8000-000000000401',
    protocolo_registrado_por = 'd0000000-0000-4000-8000-0000000000a1', protocolo_registrado_em = now()
where instrumento_id = '71000000-0000-4000-8000-000000000012';

-- Condicionantes: K1 em I1, K2 em I2, KB em IB.
insert into public.condicionante (id, consultoria_id, instrumento_id, codigo, posicao, revisao) values
  ('71000000-0000-4000-8000-000000000021', 'c0000000-0000-4000-8000-00000000000a',
   '71000000-0000-4000-8000-000000000011', '1.1', 1, 'aceita'),
  ('71000000-0000-4000-8000-000000000022', 'c0000000-0000-4000-8000-00000000000a',
   '71000000-0000-4000-8000-000000000012', '2.1', 1, 'aceita'),
  ('71000000-0000-4000-8000-0000000000b2', 'c0000000-0000-4000-8000-00000000000b',
   '71000000-0000-4000-8000-0000000000b1', '1.1', 1, 'aceita');
insert into public.condicionante_versao (id, consultoria_id, condicionante_id, titulo, natureza) values
  ('71000000-0000-4000-8000-000000000031', 'c0000000-0000-4000-8000-00000000000a',
   '71000000-0000-4000-8000-000000000021', 'Monitoramento de efluentes', 'obrigacao'),
  ('71000000-0000-4000-8000-000000000032', 'c0000000-0000-4000-8000-00000000000a',
   '71000000-0000-4000-8000-000000000022', 'Relatório de ruído', 'obrigacao'),
  ('71000000-0000-4000-8000-0000000000b3', 'c0000000-0000-4000-8000-00000000000b',
   '71000000-0000-4000-8000-0000000000b2', 'Monitoramento de efluentes', 'obrigacao');
update public.condicionante as c
set versao_vigente_id = v.id
from public.condicionante_versao as v
where v.condicionante_id = c.id and c.id in ('71000000-0000-4000-8000-000000000021',
  '71000000-0000-4000-8000-000000000022', '71000000-0000-4000-8000-0000000000b2');

-- Ocorrências.
insert into public.ocorrencia (id, consultoria_id, instrumento_id, condicionante_versao_id, ciclo,
                               prazo_oficial_original, prazo_oficial_atual, meta_interna, responsavel_id,
                               situacao, chave_idempotencia, concluida_em, concluida_por)
select x.id, x.cid, x.iid, x.vid, x.ciclo,
       current_setting('testes.hoje')::date + x.prazo, current_setting('testes.hoje')::date + x.prazo,
       current_setting('testes.hoje')::date + x.meta, x.resp, x.situacao::public.situacao_ocorrencia,
       'r710-' || x.id::text,
       case when x.situacao = 'concluida' then now() end,
       case when x.situacao = 'concluida' then 'd0000000-0000-4000-8000-0000000000a2'::uuid end
from (values
  ('71000000-0000-4000-8000-000000000051'::uuid, 'c0000000-0000-4000-8000-00000000000a'::uuid,
   '71000000-0000-4000-8000-000000000011'::uuid, '71000000-0000-4000-8000-000000000031'::uuid, 1,
   -5, -8, 'd0000000-0000-4000-8000-0000000000a2'::uuid, 'aberta'),
  ('71000000-0000-4000-8000-000000000052', 'c0000000-0000-4000-8000-00000000000a',
   '71000000-0000-4000-8000-000000000011', '71000000-0000-4000-8000-000000000031', 2,
   0, null, null, 'aberta'),
  ('71000000-0000-4000-8000-000000000053', 'c0000000-0000-4000-8000-00000000000a',
   '71000000-0000-4000-8000-000000000011', '71000000-0000-4000-8000-000000000031', 3,
   4, 2, 'd0000000-0000-4000-8000-0000000000a3', 'em_conferencia'),
  ('71000000-0000-4000-8000-000000000054', 'c0000000-0000-4000-8000-00000000000a',
   '71000000-0000-4000-8000-000000000011', '71000000-0000-4000-8000-000000000031', 4,
   -2, null, 'd0000000-0000-4000-8000-0000000000a2', 'concluida'),
  ('71000000-0000-4000-8000-000000000055', 'c0000000-0000-4000-8000-00000000000a',
   '71000000-0000-4000-8000-000000000012', '71000000-0000-4000-8000-000000000032', 1,
   10, 7, null, 'aberta'),
  ('71000000-0000-4000-8000-0000000000b5', 'c0000000-0000-4000-8000-00000000000b',
   '71000000-0000-4000-8000-0000000000b1', '71000000-0000-4000-8000-0000000000b3', 1,
   1, null, null, 'aberta')
) as x (id, cid, iid, vid, ciclo, prazo, meta, resp, situacao);

-- Alvarás: AL1 renovado por AL2; AL3 vigente sem número; AL4 excluído; AB na Verde Sul.
insert into public.alvara (id, consultoria_id, empreendimento_id, unidade_id, numero, validade, documento_id,
                           anterior_id, criado_por, excluido_em, excluido_por)
values
  ('71000000-0000-4000-8000-000000000061', 'c0000000-0000-4000-8000-00000000000a',
   '71000000-0000-4000-8000-0000000000e2', '71000000-0000-4000-8000-0000000000f2', '100/2025',
   current_setting('testes.hoje')::date + 60, '71000000-0000-4000-8000-000000000302', null,
   'd0000000-0000-4000-8000-0000000000a1', null, null),
  ('71000000-0000-4000-8000-000000000062', 'c0000000-0000-4000-8000-00000000000a',
   '71000000-0000-4000-8000-0000000000e2', '71000000-0000-4000-8000-0000000000f2', '200/2026',
   current_setting('testes.hoje')::date + 425, '71000000-0000-4000-8000-000000000303',
   '71000000-0000-4000-8000-000000000061', 'd0000000-0000-4000-8000-0000000000a1', null, null),
  ('71000000-0000-4000-8000-000000000063', 'c0000000-0000-4000-8000-00000000000a',
   '71000000-0000-4000-8000-0000000000e1', '71000000-0000-4000-8000-0000000000f1', null,
   current_setting('testes.hoje')::date + 6, '71000000-0000-4000-8000-000000000304', null,
   'd0000000-0000-4000-8000-0000000000a1', null, null),
  ('71000000-0000-4000-8000-000000000064', 'c0000000-0000-4000-8000-00000000000a',
   '71000000-0000-4000-8000-0000000000e1', '71000000-0000-4000-8000-0000000000f1', '400/2025',
   current_setting('testes.hoje')::date + 3, '71000000-0000-4000-8000-000000000305', null,
   'd0000000-0000-4000-8000-0000000000a1', now(), 'd0000000-0000-4000-8000-0000000000a1'),
  ('71000000-0000-4000-8000-0000000000b6', 'c0000000-0000-4000-8000-00000000000b',
   '71000000-0000-4000-8000-0000000000eb', '71000000-0000-4000-8000-0000000000fb', '9/2026',
   current_setting('testes.hoje')::date + 15, '71000000-0000-4000-8000-000000000309', null,
   'd0000000-0000-4000-8000-0000000000b1', null, null);

-- Orçamento ORC-2026-071 sobre E1 (só a Gestão lê).
insert into public.orcamento (id, consultoria_id, ano, sequencia, empreendimento_id, objeto, criado_por)
values ('71000000-0000-4000-8000-000000000071', 'c0000000-0000-4000-8000-00000000000a', 2026, 71,
        '71000000-0000-4000-8000-0000000000e1', 'Renovação de licença', 'd0000000-0000-4000-8000-0000000000a1');

-- ---------------------------------------------------------------------------
-- listar_prazos (Equipe vê a consultoria inteira)
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select results_eq(
  $$select tipo_linha, id, instrumento_id, dias, codigo, titulo, empreendimento_nome, unidade_nome, licenca,
           responsavel_nome, situacao_ocorrencia::text, total
    from public.listar_prazos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values
    ('ocorrencia', '71000000-0000-4000-8000-000000000051'::uuid, '71000000-0000-4000-8000-000000000011'::uuid, -5,
     '1.1', 'Monitoramento de efluentes', 'Metalúrgica Açores', 'Matriz', 'LAO 1001/2024', 'Ana Ribeiro', 'aberta', 10::bigint),
    ('validade', '71000000-0000-4000-8000-000000000013', '71000000-0000-4000-8000-000000000013', -3,
     null, 'Validade', 'Metalúrgica Açores', 'Matriz', 'AuA 77/2025', null, null, 10),
    ('ocorrencia', '71000000-0000-4000-8000-000000000052', '71000000-0000-4000-8000-000000000011', 0,
     '1.1', 'Monitoramento de efluentes', 'Metalúrgica Açores', 'Matriz', 'LAO 1001/2024', null, 'aberta', 10),
    ('ocorrencia', '71000000-0000-4000-8000-000000000053', '71000000-0000-4000-8000-000000000011', 4,
     '1.1', 'Monitoramento de efluentes', 'Metalúrgica Açores', 'Matriz', 'LAO 1001/2024', 'Bruno Tavares',
     'em_conferencia', 10),
    ('vencimento', '71000000-0000-4000-8000-000000000063', null, 6,
     null, 'Alvará', 'Metalúrgica Açores', 'Matriz', null, null, null, 10),
    ('ocorrencia', '71000000-0000-4000-8000-000000000055', '71000000-0000-4000-8000-000000000012', 10,
     '2.1', 'Relatório de ruído', 'Padaria Central', 'Loja', 'LAO 1002/2024', null, 'aberta', 10),
    ('validade', '71000000-0000-4000-8000-000000000012', '71000000-0000-4000-8000-000000000012', 100,
     null, 'Validade', 'Padaria Central', 'Loja', 'LAO 1002/2024', null, null, 10),
    ('limite_protocolo', '71000000-0000-4000-8000-000000000011', '71000000-0000-4000-8000-000000000011', 250,
     null, 'Limite de protocolo', 'Metalúrgica Açores', 'Matriz', 'LAO 1001/2024', null, null, 10),
    ('validade', '71000000-0000-4000-8000-000000000011', '71000000-0000-4000-8000-000000000011', 400,
     null, 'Validade', 'Metalúrgica Açores', 'Matriz', 'LAO 1001/2024', null, null, 10),
    ('vencimento', '71000000-0000-4000-8000-000000000062', null, 425,
     null, 'Alvará 200/2026', 'Padaria Central', 'Loja', null, null, null, 10)$$,
  'listar_prazos: 4 ocorrências abertas, 3 validades de licença, 1 limite (só LAO sem protocolo) e 2 alvarás vigentes'
);

select results_eq(
  $$select tipo_linha, count(*) from public.listar_prazos('c0000000-0000-4000-8000-00000000000a')
    group by tipo_linha order by tipo_linha$$,
  $$values ('limite_protocolo', 1::bigint), ('ocorrencia', 4::bigint), ('validade', 3::bigint),
           ('vencimento', 2::bigint)$$,
  'listar_prazos: contagem por tipo de linha'
);

select results_eq(
  $$select id from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_sem_responsavel => true)$$,
  $$values ('71000000-0000-4000-8000-000000000052'::uuid), ('71000000-0000-4000-8000-000000000055'::uuid)$$,
  'filtro sem responsável: só ocorrências sem dono (validade, limite e alvará não entram)'
);

select results_eq(
  $$select id from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_aba => 'minhas')$$,
  $$values ('71000000-0000-4000-8000-000000000051'::uuid)$$,
  'Minhas ações de Ana'
);

select results_eq(
  $$select id from public.listar_prazos('c0000000-0000-4000-8000-00000000000a',
      p_responsavel_id => 'd0000000-0000-4000-8000-0000000000a3')$$,
  $$values ('71000000-0000-4000-8000-000000000053'::uuid)$$,
  'filtro por responsável'
);

select results_eq(
  $$select id from public.listar_prazos('c0000000-0000-4000-8000-00000000000a',
      p_tipo_id => (select id from public.tipo_instrumento where sigla = 'AuA'
                      and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'))$$,
  $$values ('71000000-0000-4000-8000-000000000013'::uuid)$$,
  'filtro por tipo AuA: só a validade da AuA'
);

select is(
  (select count(*) from public.listar_prazos('c0000000-0000-4000-8000-00000000000a',
     p_tipo_id => (select id from public.tipo_instrumento where sigla = 'LAO'
                     and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'))),
  7::bigint,
  'filtro por tipo LAO: 4 ocorrências, 2 validades e o limite (alvará não tem tipo)'
);

select results_eq(
  $$select tipo_linha, id from public.listar_prazos('c0000000-0000-4000-8000-00000000000a',
      p_empreendimento_id => '71000000-0000-4000-8000-0000000000e2')$$,
  $$values ('ocorrencia', '71000000-0000-4000-8000-000000000055'::uuid),
           ('validade', '71000000-0000-4000-8000-000000000012'::uuid),
           ('vencimento', '71000000-0000-4000-8000-000000000062'::uuid)$$,
  'filtro por empreendimento (Padaria Central, sem cliente)'
);

select results_eq(
  $$select id from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_faixa => 'atrasadas')$$,
  $$values ('71000000-0000-4000-8000-000000000051'::uuid), ('71000000-0000-4000-8000-000000000013'::uuid)$$,
  'faixa atrasadas: ocorrência e validade vencida'
);

select results_eq(
  $$select id from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_faixa => 'hoje')$$,
  $$values ('71000000-0000-4000-8000-000000000052'::uuid)$$,
  'faixa hoje'
);

select results_eq(
  $$select id from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_faixa => 'proximos_7')$$,
  $$values ('71000000-0000-4000-8000-000000000053'::uuid), ('71000000-0000-4000-8000-000000000063'::uuid)$$,
  'faixa próximos 7: ocorrência e alvará'
);

select results_eq(
  $$select id from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_faixa => 'sem_responsavel')$$,
  $$values ('71000000-0000-4000-8000-000000000052'::uuid), ('71000000-0000-4000-8000-000000000055'::uuid)$$,
  'faixa sem responsável: só ocorrências'
);

select results_eq(
  $$select id, total from public.listar_prazos('c0000000-0000-4000-8000-00000000000a',
      p_limite => 3, p_deslocamento => 3)$$,
  $$values ('71000000-0000-4000-8000-000000000053'::uuid, 10::bigint),
           ('71000000-0000-4000-8000-000000000063'::uuid, 10::bigint),
           ('71000000-0000-4000-8000-000000000055'::uuid, 10::bigint)$$,
  'paginação com o total'
);

select results_eq(
  $$select id from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_ordem => '-prazo', p_limite => 2)$$,
  $$values ('71000000-0000-4000-8000-000000000062'::uuid), ('71000000-0000-4000-8000-000000000011'::uuid)$$,
  'ordem por prazo decrescente'
);

-- ---------------------------------------------------------------------------
-- contar_prazos
-- ---------------------------------------------------------------------------
select results_eq(
  $$select atrasadas, hoje, proximos_7, sem_responsavel, total
    from public.contar_prazos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values (2::bigint, 1::bigint, 2::bigint, 2::bigint, 10::bigint)$$,
  'contar_prazos sem filtro'
);

select results_eq(
  $$select atrasadas, hoje, proximos_7, sem_responsavel, total
    from public.contar_prazos('c0000000-0000-4000-8000-00000000000a', p_sem_responsavel => true)$$,
  $$values (0::bigint, 1::bigint, 0::bigint, 2::bigint, 2::bigint)$$,
  'contar_prazos sem responsável: só ocorrências'
);

select results_eq(
  $$select atrasadas, hoje, proximos_7, sem_responsavel, total
    from public.contar_prazos('c0000000-0000-4000-8000-00000000000a',
      p_empreendimento_id => '71000000-0000-4000-8000-0000000000e2')$$,
  $$values (0::bigint, 0::bigint, 0::bigint, 1::bigint, 3::bigint)$$,
  'contar_prazos por empreendimento'
);

select results_eq(
  $$select atrasadas, hoje, proximos_7, sem_responsavel, total
    from public.contar_prazos('c0000000-0000-4000-8000-00000000000a',
      p_tipo_id => (select id from public.tipo_instrumento where sigla = 'LAO'
                      and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'))$$,
  $$values (1::bigint, 1::bigint, 1::bigint, 2::bigint, 7::bigint)$$,
  'contar_prazos por tipo LAO'
);

select testes.autenticar_como('bruno@filtroville.test');

select results_eq(
  $$select atrasadas, hoje, proximos_7, sem_responsavel, total
    from public.contar_prazos('c0000000-0000-4000-8000-00000000000a', p_aba => 'minhas')$$,
  $$values (0::bigint, 0::bigint, 1::bigint, 0::bigint, 1::bigint)$$,
  'contar_prazos Minhas ações de Bruno'
);

-- ---------------------------------------------------------------------------
-- listar_calendario
-- ---------------------------------------------------------------------------
select results_eq(
  $$select tipo_evento, data - current_setting('testes.hoje')::date, id, codigo, titulo, licenca,
           responsavel_nome, sem_responsavel, dias
    from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
      current_setting('testes.hoje')::date - 10, current_setting('testes.hoje')::date + 50)$$,
  $$values
    ('meta', -8, '71000000-0000-4000-8000-000000000051'::uuid, '1.1', 'Monitoramento de efluentes',
     'LAO 1001/2024', 'Ana Ribeiro', false, -5),
    ('prazo', -5, '71000000-0000-4000-8000-000000000051', '1.1', 'Monitoramento de efluentes',
     'LAO 1001/2024', 'Ana Ribeiro', false, -5),
    ('validade', -3, '71000000-0000-4000-8000-000000000013', null, 'Validade', 'AuA 77/2025', null, false, -3),
    ('prazo', 0, '71000000-0000-4000-8000-000000000052', '1.1', 'Monitoramento de efluentes',
     'LAO 1001/2024', null, true, 0),
    ('meta', 2, '71000000-0000-4000-8000-000000000053', '1.1', 'Monitoramento de efluentes',
     'LAO 1001/2024', 'Bruno Tavares', false, 4),
    ('prazo', 4, '71000000-0000-4000-8000-000000000053', '1.1', 'Monitoramento de efluentes',
     'LAO 1001/2024', 'Bruno Tavares', false, 4),
    ('vencimento', 6, '71000000-0000-4000-8000-000000000063', null, 'Alvará', null, null, false, 6),
    ('meta', 7, '71000000-0000-4000-8000-000000000055', '2.1', 'Relatório de ruído', 'LAO 1002/2024', null, true, 10),
    ('prazo', 10, '71000000-0000-4000-8000-000000000055', '2.1', 'Relatório de ruído', 'LAO 1002/2024', null, true, 10)$$,
  'calendário: prazos, metas, validade da licença e do alvará na janela'
);

select results_eq(
  $$select tipo_evento, id from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
      current_setting('testes.hoje')::date + 240, current_setting('testes.hoje')::date + 300)$$,
  $$values ('limite_protocolo', '71000000-0000-4000-8000-000000000011'::uuid)$$,
  'calendário: limite de protocolo da LAO sem protocolo'
);

select results_eq(
  $$select tipo_evento, id from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
      current_setting('testes.hoje')::date + 390, current_setting('testes.hoje')::date + 430)$$,
  $$values ('validade', '71000000-0000-4000-8000-000000000011'::uuid),
           ('vencimento', '71000000-0000-4000-8000-000000000062'::uuid)$$,
  'calendário: validade da LAO e do alvará renovado (o anterior não aparece)'
);

select results_eq(
  $$select tipo_evento, id from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
      current_setting('testes.hoje')::date - 10, current_setting('testes.hoje')::date + 50,
      p_sem_responsavel => true)$$,
  $$values ('prazo', '71000000-0000-4000-8000-000000000052'::uuid),
           ('meta', '71000000-0000-4000-8000-000000000055'::uuid),
           ('prazo', '71000000-0000-4000-8000-000000000055'::uuid)$$,
  'calendário sem responsável: só ocorrências'
);

select results_eq(
  $$select tipo_evento, id from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
      current_setting('testes.hoje')::date - 10, current_setting('testes.hoje')::date + 50,
      p_unidade_id => '71000000-0000-4000-8000-0000000000f2')$$,
  $$values ('meta', '71000000-0000-4000-8000-000000000055'::uuid),
           ('prazo', '71000000-0000-4000-8000-000000000055'::uuid)$$,
  'calendário por unidade'
);

select results_eq(
  $$select tipo_evento, id from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
      current_setting('testes.hoje')::date - 10, current_setting('testes.hoje')::date + 50,
      p_responsavel_id => 'd0000000-0000-4000-8000-0000000000a2')$$,
  $$values ('meta', '71000000-0000-4000-8000-000000000051'::uuid),
           ('prazo', '71000000-0000-4000-8000-000000000051'::uuid)$$,
  'calendário por responsável'
);

select throws_ok(
  $$select * from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
      current_setting('testes.hoje')::date, current_setting('testes.hoje')::date + 63)$$,
  '22023', 'intervalo_invalido',
  'calendário recusa intervalo de mais de 62 dias'
);

-- ---------------------------------------------------------------------------
-- buscar_no_grama
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');

select results_eq(
  $$select tipo, id, titulo, detalhe, referencia_id
    from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'metal')$$,
  $$values ('empreendimento'::text, '71000000-0000-4000-8000-0000000000e1'::uuid, 'Metalúrgica Açores',
            'Grupo Açoriano', '71000000-0000-4000-8000-0000000000e1'::uuid),
           ('orcamento', '71000000-0000-4000-8000-000000000071', 'Renovação de licença',
            'ORC-2026-071 · Metalúrgica Açores', '71000000-0000-4000-8000-000000000071')$$,
  'busca da Gestão: empreendimento e orçamento (pelo nome do empreendimento)'
);

select results_eq(
  $$select tipo, id, titulo, detalhe, referencia_id
    from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'lao')$$,
  $$values ('licenca'::text, '71000000-0000-4000-8000-000000000011'::uuid, 'LAO 1001/2024', 'Metalúrgica Açores',
            '71000000-0000-4000-8000-0000000000e1'::uuid),
           ('licenca', '71000000-0000-4000-8000-000000000012', 'LAO 1002/2024', 'Padaria Central',
            '71000000-0000-4000-8000-0000000000e2'),
           ('licenca', '71000000-0000-4000-8000-000000000014', 'LAO 1003/2024', 'Metalúrgica Açores',
            '71000000-0000-4000-8000-0000000000e1')$$,
  'busca por sigla: licenças da consultoria, inclusive rascunho'
);

select results_eq(
  $$select tipo, id, titulo, detalhe, referencia_id
    from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'efluentes')$$,
  $$values ('condicionante'::text, '71000000-0000-4000-8000-000000000021'::uuid, 'Monitoramento de efluentes',
            'Condicionante 1.1 · LAO 1001/2024 · Metalúrgica Açores', '71000000-0000-4000-8000-0000000000e1'::uuid)$$,
  'busca de condicionante pelo título'
);

select results_eq(
  $$select tipo, count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'posto alfa')
    group by tipo$$,
  $$values ('empreendimento'::text, 5::bigint)$$,
  'no máximo 5 por grupo'
);

select is(
  (select count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'a')),
  0::bigint,
  'termo de 1 caractere não busca'
);

select testes.autenticar_como('ana@filtroville.test');

select results_eq(
  $$select tipo, id from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'metal')$$,
  $$values ('empreendimento'::text, '71000000-0000-4000-8000-0000000000e1'::uuid)$$,
  'Equipe não vê orçamento na busca'
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

select results_eq(
  $$select atrasadas, hoje, proximos_7, sem_responsavel, total
    from public.contar_prazos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values (0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint)$$,
  'Gestão de B conta prazos de A e recebe zero'
);

select is(
  (select count(*) from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
     current_setting('testes.hoje')::date - 10, current_setting('testes.hoje')::date + 50)),
  0::bigint,
  'Gestão de B não vê o calendário de A'
);

select is(
  (select count(*) from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'metal')),
  0::bigint,
  'Gestão de B busca em A e recebe zero linhas'
);

select results_eq(
  $$select tipo_linha, id, dias from public.listar_prazos('c0000000-0000-4000-8000-00000000000b')$$,
  $$values ('ocorrencia', '71000000-0000-4000-8000-0000000000b5'::uuid, 1),
           ('vencimento', '71000000-0000-4000-8000-0000000000b6'::uuid, 15),
           ('limite_protocolo', '71000000-0000-4000-8000-0000000000b1'::uuid, 80),
           ('validade', '71000000-0000-4000-8000-0000000000b1'::uuid, 200)$$,
  'B vê só os próprios prazos (plano padrão da LAO: 120 dias)'
);

select results_eq(
  $$select atrasadas, hoje, proximos_7, sem_responsavel, total
    from public.contar_prazos('c0000000-0000-4000-8000-00000000000b')$$,
  $$values (0::bigint, 0::bigint, 1::bigint, 1::bigint, 4::bigint)$$,
  'B conta só os próprios prazos'
);

select results_eq(
  $$select tipo, id from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000b', 'metal')$$,
  $$values ('empreendimento'::text, '71000000-0000-4000-8000-0000000000eb'::uuid)$$,
  'B acha só o próprio empreendimento'
);

select testes.autenticar_como_anonimo();

select throws_ok(
  $$select * from public.listar_prazos('c0000000-0000-4000-8000-00000000000a')$$,
  '42501', null,
  'anon não executa listar_prazos'
);

select throws_ok(
  $$select * from public.buscar_no_grama('c0000000-0000-4000-8000-00000000000a', 'metal')$$,
  '42501', null,
  'anon não executa buscar_no_grama'
);

select * from finish();

rollback;
