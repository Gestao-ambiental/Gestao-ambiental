-- Prévia da importação (piloto): cliente novo ou existente e unidade a criar ou existente por
-- linha, e o total de clientes a criar, que bate com o que a efetivação cria. A Equipe e a Gestão
-- de outra consultoria recebem sem_permissao; anon não executa.
begin;

set local timezone to 'America/Sao_Paulo';

select plan(11);

select testes.criar_dados_sinteticos();

select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

-- Consultoria A: cliente "Grupo Açoriano" com o empreendimento "Metalúrgica Açores" e a unidade "Sede".
insert into public.cliente (id, consultoria_id, nome) values
  ('72300000-0000-4000-8000-0000000000c1', 'c0000000-0000-4000-8000-00000000000a', 'Grupo Açoriano');
insert into public.empreendimento (id, consultoria_id, nome, cliente_id, criado_por) values
  ('72300000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a', 'Metalúrgica Açores',
   '72300000-0000-4000-8000-0000000000c1', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome) values
  ('72300000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
   '72300000-0000-4000-8000-0000000000e1', 'Sede');

create function pg_temp.dl(emp text, cli text, uni text, num text, emi date, val date)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'empreendimento', emp, 'cliente', cli, 'cnpj', null, 'unidade', uni, 'endereco', null,
    'tipo', 'LAO', 'numero', num, 'orgao', 'IMA',
    'emitido_em', emi::text, 'emitido_em_texto', to_char(emi, 'DD/MM/YYYY'),
    'validade', val::text, 'validade_texto', to_char(val, 'DD/MM/YYYY'),
    'descartados', '[]'::jsonb)
$$;

select set_config('testes.lote', (
  with h as (select current_setting('testes.hoje')::date as d)
  select jsonb_agg(jsonb_build_object('numero_linha', x.n, 'dados', x.dados) order by x.n)
  from h cross join lateral (values
    -- Empreendimento e cliente existentes: unidade existente (a única).
    (2, pg_temp.dl('Metalúrgica Açores', 'Grupo Açoriano', null, '1/2025', h.d - 10, h.d + 700)),
    -- Empreendimento novo de um cliente novo, duas licenças: o cliente conta uma vez; Matriz a criar.
    (3, pg_temp.dl('Nova Fábrica', 'Cliente N', null, '2/2025', h.d - 10, h.d + 700)),
    (4, pg_temp.dl('Nova Fábrica', 'cliente n', null, '3/2025', h.d - 10, h.d + 700)),
    -- Empreendimento novo de um cliente que já existe, com a unidade da planilha.
    (5, pg_temp.dl('Filial Açores', 'Grupo Açoriano', 'Galpão', '4/2025', h.d - 10, h.d + 700)),
    -- Outro cliente novo, sem unidade.
    (6, pg_temp.dl('Padaria Sul', 'Cliente M', null, '5/2025', h.d - 10, h.d + 700)),
    -- Com erro (validade antes da emissão): não entra na prévia nem no total.
    (7, pg_temp.dl('Terceira', 'Cliente Z', null, '6/2025', h.d - 10, h.d - 20)),
    -- Sem cliente.
    (8, pg_temp.dl('Quarta', null, null, '7/2025', h.d - 10, h.d + 700))
  ) as x (n, dados))::text, true);

select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_importacao('72300000-0000-4000-8000-000000000a01', 'c0000000-0000-4000-8000-00000000000a',
  'licenca', 'carteira.xlsx', 7, '{}');
select public.enviar_linhas_da_importacao('72300000-0000-4000-8000-000000000a01',
  current_setting('testes.lote')::jsonb);

select is(
  public.previa_da_importacao('72300000-0000-4000-8000-000000000a01'),
  '{"clientes_a_criar": 0, "linhas": {}}'::jsonb,
  'antes de conferir, a prévia vem vazia'
);

select set_config('testes.resumo',
  public.conferir_importacao('72300000-0000-4000-8000-000000000a01')::text, true);
select set_config('testes.previa',
  public.previa_da_importacao('72300000-0000-4000-8000-000000000a01')::text, true);

select is(
  current_setting('testes.previa')::jsonb -> 'linhas',
  '{"2": {"cliente": "existente", "unidade": "existente", "unidade_nome": "Sede"},
    "3": {"cliente": "novo", "unidade": "criar", "unidade_nome": "Matriz"},
    "4": {"cliente": "novo", "unidade": "criar", "unidade_nome": "Matriz"},
    "5": {"cliente": "existente", "unidade": "criar", "unidade_nome": "Galpão"},
    "6": {"cliente": "novo", "unidade": "criar", "unidade_nome": "Matriz"},
    "8": {"cliente": null, "unidade": "criar", "unidade_nome": "Matriz"}}'::jsonb,
  'cada linha que entra diz se o cliente é novo e se a unidade será criada; a com erro fica fora'
);
select is(
  (current_setting('testes.previa')::jsonb ->> 'clientes_a_criar')::integer,
  2,
  'clientes a criar: Cliente N (uma vez, nas duas linhas) e Cliente M'
);
select is(
  current_setting('testes.resumo')::jsonb -> 'a_criar',
  '{"empreendimentos": 4, "unidades": 4, "licencas": 6}'::jsonb,
  'o resumo de conferir continua o mesmo (sem campo novo)'
);
select is(
  public.previa_da_importacao('72300000-0000-4000-8000-000000000a01'),
  current_setting('testes.previa')::jsonb,
  'a prévia não muda nada: pedir de novo dá o mesmo'
);

-- Efetivar cria exatamente os clientes que a prévia contou.
select set_config('testes.clientes_antes',
  (select count(*)::text from public.cliente where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'), true);
select public.efetivar_importacao('72300000-0000-4000-8000-000000000a01',
  (current_setting('testes.resumo')::jsonb ->> 'row_version')::integer, true);
select is(
  (select count(*)::integer from public.cliente where consultoria_id = 'c0000000-0000-4000-8000-00000000000a')
    - current_setting('testes.clientes_antes')::integer,
  (current_setting('testes.previa')::jsonb ->> 'clientes_a_criar')::integer,
  'a efetivação cria os clientes que a prévia contou'
);
select is(
  public.previa_da_importacao('72300000-0000-4000-8000-000000000a01'),
  '{"clientes_a_criar": 0, "linhas": {}}'::jsonb,
  'depois de importar, não há prévia'
);

-- ---------------------------------------------------------------------------
-- Quem pode
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');
select throws_ok(
  $$select public.previa_da_importacao('72300000-0000-4000-8000-000000000a01')$$,
  '42501', 'sem_permissao', 'a Equipe não vê a prévia');

select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select public.previa_da_importacao('72300000-0000-4000-8000-000000000a01')$$,
  '42501', 'sem_permissao', 'a Gestão de outra consultoria não vê a prévia alheia');
select throws_ok(
  $$select public.previa_da_importacao(gen_random_uuid())$$,
  '42501', 'sem_permissao', 'importação inexistente: sem_permissao, sem revelar nada');

select testes.autenticar_como_anonimo();
select throws_ok(
  $$select public.previa_da_importacao('72300000-0000-4000-8000-000000000a01')$$,
  '42501', null, 'anon não executa a prévia');

select * from finish();

rollback;
