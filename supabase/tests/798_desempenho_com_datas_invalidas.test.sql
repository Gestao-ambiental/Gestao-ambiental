-- Desempenho das fontes de prazo (20261122180000) com as guardas de data da 20261122010500:
-- nos caminhos filtrados (período e responsável empurrados para as fontes), um dado antigo com
-- data não finita continua fora e a leitura não quebra. '-infinity' cai em qualquer período sem
-- início (faixa "atrasadas", Minha semana sem p_de) e daria erro ao calcular os dias.
begin;

set local timezone to 'America/Sao_Paulo';

select plan(12);

select testes.criar_dados_sinteticos();
select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

-- Licença com duas ocorrências abertas do Bruno (prazo em +5 e +10).
insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('e7980000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
        'Fundição Serra Dona Francisca', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome)
values ('f7980000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
        'e7980000-0000-4000-8000-0000000000e1', 'Matriz');

select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_instrumento('17980000-0000-4000-8000-000000000001', 'f7980000-0000-4000-8000-0000000000f1');
select public.salvar_identificacao('17980000-0000-4000-8000-000000000001', 1, 'f7980000-0000-4000-8000-0000000000f1',
  (select id from public.tipo_instrumento where sigla = 'LAO' and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  '798/2026', 'IMA', null, current_setting('testes.hoje')::date - 30, null, null, 'assinatura',
  current_setting('testes.hoje')::date + 400);
select public.salvar_condicionante(('37980000-0000-4000-8000-00000000000' || n::text)::uuid,
  '17980000-0000-4000-8000-000000000001', null, '9.' || n::text, 'Relatório ' || n::text, '', 'obrigacao')
from generate_series(1, 2) as n;
select public.confirmar_prazo(('37980000-0000-4000-8000-00000000000' || n::text)::uuid, 'unica', null, null,
  'corridos', null, current_setting('testes.hoje')::date + 5 * n, 'Documento')
from generate_series(1, 2) as n;
select public.atribuir_a_todos('17980000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a3');
select public.ativar_plano('17980000-0000-4000-8000-000000000001',
  (select row_version from public.instrumento where id = '17980000-0000-4000-8000-000000000001'), gen_random_uuid());

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('testes.o1', (select o.id::text from public.ocorrencia as o
  join public.condicionante_versao as v on v.id = o.condicionante_versao_id
  where v.condicionante_id = '37980000-0000-4000-8000-000000000001'), true);
select set_config('testes.o2', (select o.id::text from public.ocorrencia as o
  join public.condicionante_versao as v on v.id = o.condicionante_versao_id
  where v.condicionante_id = '37980000-0000-4000-8000-000000000002'), true);

-- Dado antigo fora da faixa (gravado antes da constraint): prazo '-infinity' com meta amanhã, e
-- validade da licença 'infinity'.
do $$
begin
  execute format('alter table public.ocorrencia drop constraint if exists %I',
    'data_civil_' || left(md5('ocorrencia.prazo_oficial_atual'), 16));
  execute format('alter table public.instrumento drop constraint if exists %I',
    'data_civil_' || left(md5('instrumento.validade'), 16));
end;
$$;
set local session_replication_role = replica;
update public.ocorrencia set prazo_oficial_atual = '-infinity',
  meta_interna = current_setting('testes.hoje')::date + 1
where id = current_setting('testes.o2')::uuid;
update public.instrumento set validade = 'infinity' where id = '17980000-0000-4000-8000-000000000001';
set local session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- União filtrada
-- ---------------------------------------------------------------------------
select results_eq(
  $$select l.id::text from private.linhas_de_prazo_filtradas('c0000000-0000-4000-8000-00000000000a',
      null, null, null) as l
    where l.id in (current_setting('testes.o1')::uuid, current_setting('testes.o2')::uuid)$$,
  $$values (current_setting('testes.o1'))$$,
  'sem filtro, só o item inválido sai');

select results_eq(
  $$select l.id::text from private.linhas_de_prazo_filtradas('c0000000-0000-4000-8000-00000000000a',
      null, current_setting('testes.hoje')::date + 30, 'd0000000-0000-4000-8000-0000000000a3') as l
    where l.id in (current_setting('testes.o1')::uuid, current_setting('testes.o2')::uuid)$$,
  $$values (current_setting('testes.o1'))$$,
  'período sem início e responsável: o prazo -infinity não entra');

select is(
  (select count(*) from private.linhas_de_prazo_filtradas('c0000000-0000-4000-8000-00000000000a',
     null, null, null) as l
   where l.id = '17980000-0000-4000-8000-000000000001' and l.tipo_linha in ('validade', 'limite_protocolo')),
  0::bigint,
  'validade infinita não gera validade nem limite de protocolo');

-- ---------------------------------------------------------------------------
-- Chamadores públicos
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');

select lives_ok(
  $$select count(*) from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_faixa => 'atrasadas')$$,
  'a faixa de atrasadas abre com o item inválido no banco');

select is(
  (select count(*) from public.listar_prazos('c0000000-0000-4000-8000-00000000000a', p_faixa => 'atrasadas',
     p_limite => 100) as l
   where l.id = current_setting('testes.o2')::uuid),
  0::bigint,
  'o item inválido não aparece nas atrasadas');

select results_eq(
  $$select l.id::text from public.listar_prazos('c0000000-0000-4000-8000-00000000000a',
      p_responsavel_id => 'd0000000-0000-4000-8000-0000000000a3', p_limite => 100) as l
    where l.id in (current_setting('testes.o1')::uuid, current_setting('testes.o2')::uuid)$$,
  $$values (current_setting('testes.o1'))$$,
  'a Visão por pessoa mostra só o item válido');

select lives_ok(
  $$select * from public.contar_prazos('c0000000-0000-4000-8000-00000000000a')$$,
  'os contadores abrem com o item inválido no banco');

select results_eq(
  $$select l.id::text from public.listar_calendario('c0000000-0000-4000-8000-00000000000a',
      current_setting('testes.hoje')::date - 5, current_setting('testes.hoje')::date + 30) as l
    where l.id in (current_setting('testes.o1')::uuid, current_setting('testes.o2')::uuid)$$,
  $$values (current_setting('testes.o1'))$$,
  'o calendário não mostra a meta do item inválido');

select testes.autenticar_como('bruno@filtroville.test');

select lives_ok(
  $$select count(*) from public.minha_semana(null, current_setting('testes.hoje')::date + 30, 100, 0)$$,
  'a Minha semana sem início abre com o item inválido no banco');

select results_eq(
  $$select distinct s.id::text from public.minha_semana(null, current_setting('testes.hoje')::date + 30, 100, 0) as s
    where s.id in (current_setting('testes.o1')::uuid, current_setting('testes.o2')::uuid)$$,
  $$values (current_setting('testes.o1'))$$,
  'a Minha semana mostra só o item válido');

-- ---------------------------------------------------------------------------
-- Outra consultoria não vê nada disso pela fonte filtrada
-- ---------------------------------------------------------------------------
select testes.autenticar_como('gustavo@verdesul.test');

select is(
  (select count(*) from private.linhas_de_prazo_filtradas('c0000000-0000-4000-8000-00000000000a',
     null, null, null)),
  0::bigint,
  'outra consultoria recebe zero linhas da fonte filtrada');

select is(
  (select count(*) from private.linhas_de_prazo_ocorrencia('c0000000-0000-4000-8000-00000000000a',
     null, null, 'd0000000-0000-4000-8000-0000000000a3')),
  0::bigint,
  'outra consultoria recebe zero ocorrências filtradas por responsável');

select * from finish();

rollback;
