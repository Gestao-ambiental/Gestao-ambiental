-- Tipos e órgãos em uso, distintos no banco (sem limite de linhas lido pela tela): só os que têm
-- instrumento, sem repetir, sem órgão vazio; outra consultoria lê zero; anon não executa.
begin;

select plan(6);

select testes.criar_dados_sinteticos();
select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('e6610000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
        'Metalúrgica Rio Cubatão', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome, endereco)
values ('e6610000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
        'e6610000-0000-4000-8000-0000000000e1', 'Matriz', 'Rua Dona Francisca, 8300, Joinville/SC');

-- Três licenças identificadas (LAO/IMA, LAP/IMA, LAO/FATMA) e um rascunho sem tipo nem órgão.
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_instrumento(('e6611000-0000-4000-8000-00000000000' || n::text)::uuid,
  'e6610000-0000-4000-8000-0000000000f1')
from generate_series(1, 4) as n;
select public.salvar_identificacao(('e6611000-0000-4000-8000-00000000000' || x.n::text)::uuid, 1,
  'e6610000-0000-4000-8000-0000000000f1',
  (select id from public.tipo_instrumento
   where sigla = x.sigla and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  '66' || x.n::text || '/2023', x.orgao, null, current_setting('testes.hoje')::date - 30, null, null,
  'assinatura', current_setting('testes.hoje')::date + 400)
from (values (1, 'LAO', 'IMA'), (2, 'LAP', 'IMA'), (3, 'LAO', 'FATMA')) as x (n, sigla, orgao);

select results_eq(
  $$select sigla from public.listar_tipos_em_uso('c0000000-0000-4000-8000-00000000000a')$$,
  $$values ('LAO'::text), ('LAP'::text)$$,
  'tipos em uso: só os que têm instrumento, sem repetir, por sigla'
);

select results_eq(
  $$select orgao from public.listar_orgaos_em_uso('c0000000-0000-4000-8000-00000000000a')$$,
  $$values ('FATMA'::text), ('IMA'::text)$$,
  'órgãos em uso: sem repetir, sem o rascunho sem órgão, em ordem'
);

-- Outra consultoria (Verde Sul) lê zero, mesmo pedindo a Filtroville
select testes.autenticar_como('gustavo@verdesul.test');

select is(
  (select count(*) from public.listar_tipos_em_uso('c0000000-0000-4000-8000-00000000000a'))
  + (select count(*) from public.listar_orgaos_em_uso('c0000000-0000-4000-8000-00000000000a')),
  0::bigint,
  'outra consultoria lê zero tipos e órgãos'
);

select is(
  (select count(*) from public.listar_tipos_em_uso('c0000000-0000-4000-8000-00000000000b'))
  + (select count(*) from public.listar_orgaos_em_uso('c0000000-0000-4000-8000-00000000000b')),
  0::bigint,
  'consultoria sem instrumentos não tem tipos nem órgãos em uso'
);

reset role;

select ok(
  not has_function_privilege('anon', 'public.listar_tipos_em_uso(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.listar_orgaos_em_uso(uuid)', 'execute'),
  'anon não executa'
);

select ok(
  has_function_privilege('authenticated', 'public.listar_tipos_em_uso(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.listar_orgaos_em_uso(uuid)', 'execute'),
  'authenticated executa'
);

select * from finish();

rollback;
