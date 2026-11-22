-- Correções da auditoria do PR #44 (ADR-0059). Cada bloco falhava antes da migration
-- 20261122010500: apontamento removido sem vínculo; Equipe respondendo exigência sem responsável;
-- teste reservado sem trava por pessoa e e-mail; alvará de outra consultoria no reenvio; data
-- infinita derrubando os prazos; etapa além da 200ª gravada e escondida.
begin;

set local timezone to 'America/Sao_Paulo';

select plan(27);

select testes.criar_dados_sinteticos();
select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

-- ---------------------------------------------------------------------------
-- Cenário: licença com duas ocorrências abertas (Bruno responsável), como no pgTAP 120.
-- ---------------------------------------------------------------------------
insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('e8000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
        'Fundição Boa Vista', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome)
values ('f8000000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
        'e8000000-0000-4000-8000-0000000000e1', 'Matriz');

select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_instrumento('18000000-0000-4000-8000-000000000001', 'f8000000-0000-4000-8000-0000000000f1');
select public.salvar_identificacao('18000000-0000-4000-8000-000000000001', 1, 'f8000000-0000-4000-8000-0000000000f1',
  (select id from public.tipo_instrumento where sigla = 'LAO' and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  '800/2026', 'IMA', null, current_setting('testes.hoje')::date - 30, null, null, 'assinatura',
  current_setting('testes.hoje')::date + 400);
select public.salvar_condicionante(('38000000-0000-4000-8000-00000000000' || n::text)::uuid,
  '18000000-0000-4000-8000-000000000001', null, '8.' || n::text, 'Relatório ' || n::text, '', 'obrigacao')
from generate_series(1, 2) as n;
select public.confirmar_prazo(('38000000-0000-4000-8000-00000000000' || n::text)::uuid, 'unica', null, null,
  'corridos', null, current_setting('testes.hoje')::date + 5 * n, 'Documento')
from generate_series(1, 2) as n;
select public.atribuir_a_todos('18000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a3');
select public.ativar_plano('18000000-0000-4000-8000-000000000001',
  (select row_version from public.instrumento where id = '18000000-0000-4000-8000-000000000001'), gen_random_uuid());

reset role;
select set_config('testes.o1', (select o.id::text from public.ocorrencia as o
  join public.condicionante_versao as v on v.id = o.condicionante_versao_id
  where v.condicionante_id = '38000000-0000-4000-8000-000000000001'), true);
select set_config('testes.o2', (select o.id::text from public.ocorrencia as o
  join public.condicionante_versao as v on v.id = o.condicionante_versao_id
  where v.condicionante_id = '38000000-0000-4000-8000-000000000002'), true);

-- ---------------------------------------------------------------------------
-- 1. remover_apontamento
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '80000000-0000-4000-8000-0000000000f9', 'authenticated',
        'authenticated', 'sem.vinculo80@exemplo.test', '', now(),
        '{"provider": "email", "providers": ["email"]}'::jsonb, '{"nome": "Sem Vínculo"}'::jsonb, now(), now());

select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_orcamento('f8000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a',
  'e8000000-0000-4000-8000-0000000000e1', 'Renovação');
select public.salvar_orcamento('f8000000-0000-4000-8000-000000000001', 1, $json${
  "objeto": "Renovação", "forma_preco": "margem",
  "itens": [{"id": "18000000-0000-4000-8000-0000000000a1", "descricao": "Relatório", "minutos": 600,
             "preco_fechado_centavos": 100000}],
  "despesas": [],
  "parcelas": [{"id": "38000000-0000-4000-8000-0000000000b1", "descricao": "Aceite", "dias": 0,
                "percentual_pb": 10000}]
}$json$::jsonb);
select public.mudar_situacao_orcamento('f8000000-0000-4000-8000-000000000001', 2, 'enviada');
select public.aprovar_orcamento('f8000000-0000-4000-8000-000000000001', 3, 'Sr. Vista', current_date - 1, 'e-mail',
  'email', true, '[{"item_id": "18000000-0000-4000-8000-0000000000a1", "titulo": "Relatório",
                    "responsavel_id": "d0000000-0000-4000-8000-0000000000a2"}]'::jsonb);
select testes.autenticar_como('ana@filtroville.test');
select public.lancar_horas('a8000000-0000-4000-8000-000000000001', 'f8000000-0000-4000-8000-000000000001',
  null, (select id from public.tarefa_servico where orcamento_id = 'f8000000-0000-4000-8000-000000000001'),
  current_date, 60, 'Campo');

select testes.autenticar_como('sem.vinculo80@exemplo.test');
select throws_ok(
  $$select public.remover_apontamento('a8000000-0000-4000-8000-000000000001')$$,
  '42501', 'sem_permissao', 'sem vínculo não remove apontamento');
select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select public.remover_apontamento('a8000000-0000-4000-8000-000000000001')$$,
  '42501', 'sem_permissao', 'Gestão de outra consultoria não remove apontamento');
select testes.autenticar_como('bruno@filtroville.test');
select throws_ok(
  $$select public.remover_apontamento('a8000000-0000-4000-8000-000000000001')$$,
  '42501', 'sem_permissao', 'Equipe que não é a autora não remove');

select testes.autenticar_como('eduardo@filtroville.test');
select public.desligar_membro('d0000000-0000-4000-8000-0000000000a2', 'Saiu da consultoria');
select testes.autenticar_como('ana@filtroville.test');
select throws_ok(
  $$select public.remover_apontamento('a8000000-0000-4000-8000-000000000001')$$,
  '42501', 'sem_permissao', 'a autora desligada não remove mais');
reset role;
select is(
  (select excluido_em from public.apontamento_horas where id = 'a8000000-0000-4000-8000-000000000001'),
  null::timestamptz,
  'o apontamento continua intacto');
select testes.autenticar_como('eduardo@filtroville.test');
select lives_ok(
  $$select public.remover_apontamento('a8000000-0000-4000-8000-000000000001')$$,
  'quem tem a permissão financeira remove');
reset role;
select isnt(
  (select excluido_em from public.apontamento_horas where id = 'a8000000-0000-4000-8000-000000000001'),
  null::timestamptz,
  'e o apontamento sai (exclusão lógica)');

-- ---------------------------------------------------------------------------
-- 2. Exigência sem responsável
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');
select public.registrar_exigencia(p_id => '78000000-0000-4000-8000-0000000000a1',
  p_unidade_id => 'f8000000-0000-4000-8000-0000000000f1', p_assunto => 'Plano de emergência',
  p_recebido_em => current_setting('testes.hoje')::date - 2,
  p_prazo_oficial => current_setting('testes.hoje')::date + 3,
  p_meta_interna => current_setting('testes.hoje')::date + 2,
  p_prazo_dias => 5, p_prazo_contagem => 'corridos');

select testes.autenticar_como('bruno@filtroville.test');
select throws_ok(
  $$select public.responder_exigencia(p_resposta_id => gen_random_uuid(),
      p_exigencia_id => '78000000-0000-4000-8000-0000000000a1',
      p_protocolado_em => current_setting('testes.hoje')::date - 1, p_protocolo_numero => 'EQ-1')$$,
  '42501', 'sem_permissao', 'Equipe não responde exigência sem responsável');
select throws_ok(
  $$select public.anexar_a_exigencia(gen_random_uuid(), '78000000-0000-4000-8000-0000000000a1', 'Anexo',
      gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a/exigencia/x.pdf', 'x.pdf', repeat('a', 64))$$,
  '42501', 'sem_permissao', 'Equipe não anexa em exigência sem responsável');
select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select public.responder_exigencia(p_resposta_id => gen_random_uuid(),
      p_exigencia_id => '78000000-0000-4000-8000-0000000000a1',
      p_protocolado_em => current_setting('testes.hoje')::date - 1, p_protocolo_numero => 'B-1')$$,
  '42501', 'sem_permissao', 'outra consultoria não responde');
select testes.autenticar_como('eduardo@filtroville.test');
select lives_ok(
  $$select public.responder_exigencia(p_resposta_id => gen_random_uuid(),
      p_exigencia_id => '78000000-0000-4000-8000-0000000000a1',
      p_protocolado_em => current_setting('testes.hoje')::date - 1, p_protocolo_numero => 'G-1')$$,
  'a Gestão responde a exigência sem responsável');

-- ---------------------------------------------------------------------------
-- 3. Reserva do teste: travas por pessoa, e-mail e CNPJ, e reserva antes de criar
-- ---------------------------------------------------------------------------
reset role;
update private.configuracao_comercial set fim_do_beta = current_date - 30 where id;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '80000000-0000-4000-8000-0000000000f1', 'authenticated',
        'authenticated', 'reserva80@exemplo.test', '', now(),
        '{"provider": "email", "providers": ["email"]}'::jsonb, '{"nome": "Reserva"}'::jsonb, now(), now()),
       ('00000000-0000-0000-0000-000000000000', '80000000-0000-4000-8000-0000000000f2', 'authenticated',
        'authenticated', 'ganhou.antes80@exemplo.test', '', now(),
        '{"provider": "email", "providers": ["email"]}'::jsonb, '{"nome": "Ganhou Antes"}'::jsonb, now(), now());

select set_config('testes.travas_antes', (select count(*) from pg_catalog.pg_locks
  where locktype = 'advisory' and pid = pg_backend_pid())::text, true);
select testes.autenticar_como('reserva80@exemplo.test');
select results_eq(
  $$select acesso from public.abrir_consultoria('c8000000-0000-4000-8000-000000000001', 'Reserva', '11222333000181')$$,
  $$values ('teste'::text)$$,
  'depois do beta, a primeira abertura ganha o teste');
reset role;
select is(
  (select count(*) from pg_catalog.pg_locks where locktype = 'advisory' and pid = pg_backend_pid())
    - current_setting('testes.travas_antes')::bigint,
  3::bigint,
  'abrir trava pessoa, e-mail e CNPJ antes de decidir');
select is(
  (select count(*) from private.teste_usado where consultoria_id = 'c8000000-0000-4000-8000-000000000001'),
  2::bigint,
  'e-mail e CNPJ ficam reservados para a consultoria');
select testes.autenticar_como('reserva80@exemplo.test');
select results_eq(
  $$select acesso from public.abrir_consultoria('c8000000-0000-4000-8000-000000000001', 'Reserva', '11222333000181')$$,
  $$values ('teste'::text)$$,
  'reenviar a mesma abertura devolve a mesma condição');

-- Outra abertura que chegou primeiro e já reservou este e-mail: esta não ganha teste.
reset role;
insert into private.teste_usado (chave, tipo)
values (private.hmac_do_acesso('email', 'ganhou.antes80@exemplo.test'), 'email');
select testes.autenticar_como('ganhou.antes80@exemplo.test');
select results_eq(
  $$select acesso from public.abrir_consultoria('c8000000-0000-4000-8000-000000000002', 'Segunda', '44555666000181')$$,
  $$values ('sem_teste'::text)$$,
  'e-mail já reservado nasce sem teste');

-- ---------------------------------------------------------------------------
-- 4. Alvará: reenvio não acha versão de outra consultoria
-- ---------------------------------------------------------------------------
reset role;
insert into storage.objects (bucket_id, name, metadata) values
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/alvara/a8000000-0000-4000-8000-0000000000d1.pdf',
   '{"mimetype": "application/pdf", "size": 2048}'),
  ('arquivos', 'c0000000-0000-4000-8000-00000000000b/alvara/a8000000-0000-4000-8000-0000000000d1.pdf',
   '{"mimetype": "application/pdf", "size": 2048}');
insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('e8000000-0000-4000-8000-0000000000e2', 'c0000000-0000-4000-8000-00000000000b',
        'Verde Sul Matriz', 'd0000000-0000-4000-8000-0000000000b1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome)
values ('f8000000-0000-4000-8000-0000000000f2', 'c0000000-0000-4000-8000-00000000000b',
        'e8000000-0000-4000-8000-0000000000e2', 'Sede');

select testes.autenticar_como('eduardo@filtroville.test');
select public.registrar_alvara('f8000000-0000-4000-8000-0000000000f1', current_date + 200,
  'a8000000-0000-4000-8000-0000000000d1',
  'c0000000-0000-4000-8000-00000000000a/alvara/a8000000-0000-4000-8000-0000000000d1.pdf',
  'alvara.pdf', repeat('a', 64));
select is(
  public.registrar_alvara('f8000000-0000-4000-8000-0000000000f1', current_date + 200,
    'a8000000-0000-4000-8000-0000000000d1',
    'c0000000-0000-4000-8000-00000000000a/alvara/a8000000-0000-4000-8000-0000000000d1.pdf',
    'alvara.pdf', repeat('a', 64)),
  (select a.id from public.alvara as a join public.documento_versao as v on v.documento_id = a.documento_id
   where v.id = 'a8000000-0000-4000-8000-0000000000d1'),
  'reenvio na mesma unidade devolve o mesmo alvará');
select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select public.registrar_alvara('f8000000-0000-4000-8000-0000000000f2', current_date + 200,
      'a8000000-0000-4000-8000-0000000000d1',
      'c0000000-0000-4000-8000-00000000000b/alvara/a8000000-0000-4000-8000-0000000000d1.pdf',
      'alvara.pdf', repeat('a', 64))$$,
  'P0001', 'versao_existente',
  'outra consultoria não recebe o alvará de A no reenvio');

-- ---------------------------------------------------------------------------
-- 5. Datas civis
-- ---------------------------------------------------------------------------
reset role;
set local session_replication_role = replica;
select throws_ok(
  format($$update public.ocorrencia set prazo_oficial_atual = 'infinity' where id = %L$$,
         current_setting('testes.o1')),
  '23514', null, 'data infinita é recusada na escrita');
select throws_ok(
  format($$update public.ocorrencia set prazo_oficial_atual = '1899-12-31' where id = %L$$,
         current_setting('testes.o1')),
  '23514', null, 'data antes de 1900 é recusada na escrita');
select lives_ok(
  format($$update public.ocorrencia set prazo_oficial_atual = '2199-12-31' where id = %L$$,
         current_setting('testes.o1')),
  'a ponta da faixa vale');
set local session_replication_role = origin;
select is(
  (select count(*) from pg_catalog.pg_constraint as k
   join pg_catalog.pg_class as t on t.oid = k.conrelid
   join pg_catalog.pg_namespace as n on n.oid = t.relnamespace
   where n.nspname = 'public' and k.conname like 'data\_civil\_%'),
  (select count(*) from information_schema.columns as c
   join information_schema.tables as t on t.table_schema = c.table_schema and t.table_name = c.table_name
   where c.table_schema = 'public' and c.data_type = 'date' and t.table_type = 'BASE TABLE'),
  'toda coluna date tem a faixa');

-- Dado antigo fora da faixa (gravado antes da constraint): a leitura ignora só ele.
do $$
begin
  execute format('alter table public.ocorrencia drop constraint if exists %I',
    'data_civil_' || left(md5('ocorrencia.prazo_oficial_atual'), 16));
end;
$$;
set local session_replication_role = replica;
update public.ocorrencia set prazo_oficial_atual = 'infinity' where id = current_setting('testes.o2')::uuid;
set local session_replication_role = origin;
select testes.autenticar_como('eduardo@filtroville.test');
select lives_ok(
  $$select count(*) from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
      current_date - 5, current_date + 30)$$,
  'o calendário abre com o item inválido no banco');
reset role;
select results_eq(
  $$select l.id::text from private.linhas_de_prazo('c0000000-0000-4000-8000-00000000000a') as l
    where l.id in (current_setting('testes.o1')::uuid, current_setting('testes.o2')::uuid)$$,
  $$values (current_setting('testes.o1'))$$,
  'só o item inválido sai dos prazos');

-- ---------------------------------------------------------------------------
-- 6. Etapas: no máximo 200
-- ---------------------------------------------------------------------------
insert into public.etapa (id, consultoria_id, ocorrencia_id, titulo, modo, posicao, criada_por)
select gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a', current_setting('testes.o1')::uuid,
       'Etapa ' || n::text, 'trabalho', n, 'd0000000-0000-4000-8000-0000000000a1'
from generate_series(1, 199) as n;
select testes.autenticar_como('bruno@filtroville.test');
select lives_ok(
  $$select public.criar_etapa(gen_random_uuid(), current_setting('testes.o1')::uuid, 'Etapa 200', 'trabalho',
      null, null, null, null)$$,
  'a 200ª etapa entra');
select throws_ok(
  $$select public.criar_etapa(gen_random_uuid(), current_setting('testes.o1')::uuid, 'Etapa 201', 'trabalho',
      null, null, null, null)$$,
  'P0001', 'limite_de_etapas', 'a 201ª é recusada');
select testes.autenticar_como('gustavo@verdesul.test');
select is(
  (select count(*) from public.etapa where ocorrencia_id = current_setting('testes.o1')::uuid),
  0::bigint,
  'outra consultoria não lê as etapas');

select * from finish();

rollback;
