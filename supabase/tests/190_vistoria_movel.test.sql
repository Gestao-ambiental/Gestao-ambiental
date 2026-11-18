begin;
select plan(9);

select testes.criar_dados_sinteticos();
select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('e0000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
        'Unidade de teste de vistoria', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome)
values ('f0000000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
        'e0000000-0000-4000-8000-0000000000e1', 'Matriz');

select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_instrumento('10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-0000000000f1');
select public.salvar_identificacao('10000000-0000-4000-8000-000000000001', 1, 'f0000000-0000-4000-8000-0000000000f1',
  (select id from public.tipo_instrumento where sigla = 'LAO' and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  '4821/2023', 'IMA', null, current_setting('testes.hoje')::date - 30, null, null, 'assinatura',
  current_setting('testes.hoje')::date + 400);
select public.salvar_condicionante('30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', null, '4.1', 'Vistoriar abrigo', '', 'obrigacao');
select public.confirmar_prazo('30000000-0000-4000-8000-000000000001', 'unica', null, null,
  'corridos', null, current_setting('testes.hoje')::date + 5, 'Documento');
select public.atribuir_a_todos('10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a3');
select public.ativar_plano('10000000-0000-4000-8000-000000000001',
  (select row_version from public.instrumento where id = '10000000-0000-4000-8000-000000000001'), gen_random_uuid());

reset role;
select set_config('testes.ocorrencia', (select o.id::text from public.ocorrencia as o
  join public.condicionante_versao as v on v.id = o.condicionante_versao_id
  where v.condicionante_id = '30000000-0000-4000-8000-000000000001'), true);

insert into storage.objects (bucket_id, name, metadata, owner_id) values
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/evidencia/50000001-0000-4000-8000-000000000000.jpg',
    '{"mimetype": "image/jpeg", "size": 2048}', 'a0000000-0000-4000-8000-000000000003'),
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/evidencia/50000002-0000-4000-8000-000000000000.jpg',
    '{"mimetype": "image/jpeg", "size": 2048}', 'a0000000-0000-4000-8000-000000000002');

select set_config('testes.registro',
  '{"resultado":"nao_conforme","area":"Abrigo","acompanhante":"","observacao":"Recipiente sem identificação.",
    "registradoEm":"2026-11-16T18:02:00.000Z","fotoEm":"2026-11-16T18:00:00.000Z","origemFoto":"camera",
    "localizacao":{"latitude":-26.3,"longitude":-48.8,"precisao":17,"obtidaEm":"2026-11-16T18:00:00.000Z"}}', true);

create function pg_temp.enviar_vistoria(
  registro jsonb default current_setting('testes.registro')::jsonb,
  id uuid default '70000000-0000-4000-8000-000000000001',
  versao uuid default '50000001-0000-4000-8000-000000000000'
)
returns integer language sql as $$
  select public.enviar_vistoria(current_setting('testes.ocorrencia')::uuid, id, versao,
    'c0000000-0000-4000-8000-00000000000a/evidencia/' || versao || '.jpg',
    'abrigo.jpg', repeat('a', 64), current_setting('testes.hoje')::date - 1, registro)
$$;

select testes.autenticar_como('ana@filtroville.test');
select throws_ok($$select pg_temp.enviar_vistoria()$$,
  '42501', 'vistoria_nao_atribuida', 'só o responsável em campo envia a vistoria');

select testes.autenticar_como('bruno@filtroville.test');
select throws_ok($$select pg_temp.enviar_vistoria('{}')$$,
  '22023', 'vistoria_invalida', 'um checklist incompleto é recusado');
select throws_ok($$select pg_temp.enviar_vistoria(
    jsonb_set(current_setting('testes.registro')::jsonb, '{localizacao,latitude}', '91'))$$,
  '22023', 'localizacao_invalida', 'uma coordenada inválida é recusada');
select throws_ok($$select pg_temp.enviar_vistoria(versao => '50000002-0000-4000-8000-000000000000')$$,
  '22023', 'foto_da_vistoria_indisponivel', 'a foto deve pertencer à conta que está enviando');

select is(pg_temp.enviar_vistoria(), 1, 'a vistoria vira evidência v1');
select is(pg_temp.enviar_vistoria(), 1, 'a repetição recupera o mesmo recibo');
select is(
  (select vistoria || jsonb_build_object('situacao', situacao) from public.evidencia
    where ocorrencia_id = current_setting('testes.ocorrencia')::uuid),
  current_setting('testes.registro')::jsonb || '{"situacao":"em_conferencia"}'::jsonb,
  'grava uma única evidência com o checklist em conferência'
);

select testes.autenticar_como('gustavo@verdesul.test');
select is((select count(*) from public.evidencia
  where ocorrencia_id = current_setting('testes.ocorrencia')::uuid),
  0::bigint, 'outra consultoria não lê o registro');

reset role;
update public.ocorrencia set situacao = 'concluida', concluida_em = now(),
  concluida_por = 'd0000000-0000-4000-8000-0000000000a1'
where id = current_setting('testes.ocorrencia')::uuid;
select testes.autenticar_como('bruno@filtroville.test');
select throws_ok($$select pg_temp.enviar_vistoria(id => '70000000-0000-4000-8000-000000000002')$$,
  'P0001', 'ocorrencia_concluida', 'não aceita vistoria nova em ocorrência concluída');

select * from finish();
rollback;
