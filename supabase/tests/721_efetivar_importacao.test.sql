-- Importar planilha (ADR-0043), parte 2: efetivar. Cria empreendimento, unidade e licença ativa
-- "somente validade"; a LAO ganha plano de renovação e entra na Visão pela validade e pelo limite de
-- protocolo. Efetivar duas vezes cria uma vez; o resumo da conferência é o que a efetivação faz; o
-- limite do plano pede confirmação (gravada em adicional_confirmado); importar de novo só pula.
begin;

set local timezone to 'America/Sao_Paulo';

select plan(30);

select testes.criar_dados_sinteticos();

select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

-- Teste acabado; a Gestão assina o Essencial com limite de 1 empreendimento ativo (como no 602).
update private.configuracao_comercial set fim_do_beta = current_date - 400;
update public.consultoria set criada_em = now() - interval '60 days' where id = 'c0000000-0000-4000-8000-00000000000a';
update private.plano_catalogo set empreendimentos = 1 where codigo = 'essencial';
select testes.autenticar_como('eduardo@filtroville.test');
select * from public.assinar_plano_simulado('c0000000-0000-4000-8000-00000000000a', 'essencial', 'mensal', 'pix');
reset role;

-- Cenário: E1 "Metalúrgica Açores" com uma unidade e nenhuma licença ativa.
insert into public.empreendimento (id, consultoria_id, nome, criado_por) values
  ('72100000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a', 'Metalúrgica Açores',
   'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome) values
  ('72100000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
   '72100000-0000-4000-8000-0000000000e1', 'Matriz');

create function pg_temp.dl(emp text, cli text, uni text, tipo text, num text, org text, emi date, val date,
                           extra jsonb default '{}'::jsonb)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'empreendimento', emp, 'cliente', cli, 'cnpj', null, 'unidade', uni, 'endereco', null,
    'tipo', tipo, 'numero', num, 'orgao', org,
    'emitido_em', emi::text, 'emitido_em_texto', to_char(emi, 'DD/MM/YYYY'),
    'validade', val::text, 'validade_texto', to_char(val, 'DD/MM/YYYY'),
    'descartados', '[]'::jsonb) || extra
$$;

select set_config('testes.lote', (
  with h as (select current_setting('testes.hoje')::date as d)
  select jsonb_agg(jsonb_build_object('numero_linha', x.n, 'dados', x.dados) order by x.n)
  from h cross join lateral (values
    (2, pg_temp.dl('Metalúrgica Açores', null, null, 'LAO', 'L-1', 'IMA', h.d - 100, h.d + 400)),
    (3, pg_temp.dl('Nova Fábrica', 'Cliente N', 'Galpão', 'AuA', 'A-1', 'Prefeitura', h.d - 100, h.d + 400,
                   '{"endereco": "Rua 1, 100"}')),
    (4, pg_temp.dl('Nova Fábrica', 'Cliente N', null, 'LAO', 'L-2', 'IMA', h.d - 100, h.d + 400)),
    (5, pg_temp.dl('Nova Fábrica', 'Cliente N', null, 'XYZ', 'X-1', 'IMA', h.d - 100, h.d + 400))
  ) as x (n, dados))::text, true);

-- ---------------------------------------------------------------------------
-- Conferir e efetivar
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_importacao('72100000-0000-4000-8000-000000000a11', 'c0000000-0000-4000-8000-00000000000a',
  'licenca', 'carteira.xlsx', 4, '{}');

select throws_ok(
  $$select public.efetivar_importacao('72100000-0000-4000-8000-000000000a11',
      (select row_version from public.importacao where id = '72100000-0000-4000-8000-000000000a11'))$$,
  'P0001', 'importacao_nao_conferida', 'efetivar sem conferir: recusa');

select public.enviar_linhas_da_importacao('72100000-0000-4000-8000-000000000a11',
  current_setting('testes.lote')::jsonb);
select set_config('testes.resumo',
  public.conferir_importacao('72100000-0000-4000-8000-000000000a11')::text, true);

select is(
  current_setting('testes.resumo')::jsonb - 'row_version' - 'limite',
  '{"total": 4, "prontas": 2, "com_aviso": 1, "com_erro": 1, "puladas": 0,
    "a_criar": {"empreendimentos": 1, "unidades": 2, "licencas": 3}}'::jsonb,
  'a conferência conta 1 empreendimento, 2 unidades e 3 licenças a criar'
);
select results_eq(
  $$select (r -> 'limite' ->> 'quantidade')::integer, (r -> 'limite' ->> 'limite')::integer,
           (r -> 'limite' ->> 'precisa_confirmar')::boolean, (r -> 'limite' ->> 'adicionais_centavos')::integer > 0
    from (select current_setting('testes.resumo')::jsonb as r) as x$$,
  $$values (2, 1, true, true)$$,
  'limite: 2 empreendimentos passam a ter licença ativa (o existente sem licença e o novo), acima de 1'
);

select throws_ok(
  $$select public.efetivar_importacao('72100000-0000-4000-8000-000000000a11',
      (current_setting('testes.resumo')::jsonb ->> 'row_version')::integer - 1, true)$$,
  'P0001', 'conflito_de_versao', 'efetivar com versão antiga: conflito');
select throws_ok(
  $$select public.efetivar_importacao('72100000-0000-4000-8000-000000000a11',
      (current_setting('testes.resumo')::jsonb ->> 'row_version')::integer)$$,
  'P0001', 'adicional_nao_confirmado', 'acima do limite sem confirmar o adicional: recusa');

select set_config('testes.resultado', public.efetivar_importacao('72100000-0000-4000-8000-000000000a11',
  (current_setting('testes.resumo')::jsonb ->> 'row_version')::integer, true)::text, true);

select is(
  current_setting('testes.resultado')::jsonb - 'row_version' - 'desfazer_ate',
  '{"linhas_criadas": 3, "linhas_puladas": 0, "linhas_com_erro": 1,
    "empreendimentos_criados": 1, "unidades_criadas": 2, "licencas_criadas": 3}'::jsonb,
  'efetivar cria o que a conferência contou; a linha com erro não entra'
);
select is(
  jsonb_build_object(
    'empreendimentos', current_setting('testes.resultado')::jsonb -> 'empreendimentos_criados',
    'unidades', current_setting('testes.resultado')::jsonb -> 'unidades_criadas',
    'licencas', current_setting('testes.resultado')::jsonb -> 'licencas_criadas'),
  current_setting('testes.resumo')::jsonb -> 'a_criar',
  'o resumo de conferir é igual ao que efetivar faz'
);
select is(
  (current_setting('testes.resultado')::jsonb ->> 'desfazer_ate')::timestamptz,
  now() + interval '24 hours',
  'desfazer vale até 24 h depois de efetivar'
);

reset role;
select results_eq(
  $$select recurso, quantidade, limite, confirmado_por from public.adicional_confirmado
    where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'$$,
  $$values ('empreendimentos', 2, 1, 'd0000000-0000-4000-8000-0000000000a1'::uuid)$$,
  'a confirmação do adicional é gravada com a quantidade final'
);

select results_eq(
  $$select i.numero, i.situacao::text, i.somente_validade, i.marco::text, i.emitido_em_texto is not null,
           i.ativado_por, i.chave_ativacao is not null
    from public.instrumento as i
    where i.consultoria_id = 'c0000000-0000-4000-8000-00000000000a'
    order by i.numero$$,
  $$values ('A-1', 'ativo', true, 'emissao', true, 'd0000000-0000-4000-8000-0000000000a1'::uuid, true),
           ('L-1', 'ativo', true, 'emissao', true, 'd0000000-0000-4000-8000-0000000000a1'::uuid, true),
           ('L-2', 'ativo', true, 'emissao', true, 'd0000000-0000-4000-8000-0000000000a1'::uuid, true)$$,
  'as licenças entram ativas, somente validade, com marco na emissão e o texto original da data'
);

select results_eq(
  $$select l.numero_linha, l.resultado, l.empreendimento_criado, l.unidade_criada, l.instrumento_id is not null,
           l.instrumento_row_version = i.row_version
    from public.importacao_linha as l
    left join public.instrumento as i on i.id = l.instrumento_id
    where l.importacao_id = '72100000-0000-4000-8000-000000000a11'
    order by l.numero_linha$$,
  $$values (2, 'criada', false, false, true, true),
           (3, 'criada', true, true, true, true),
           (4, 'criada', false, true, true, true),
           (5, 'com_erro', false, false, false, null::boolean)$$,
  'cada linha diz o que criou; a segunda licença do empreendimento novo só o reaproveita'
);

select is(
  (select unidade_id from public.importacao_linha
   where importacao_id = '72100000-0000-4000-8000-000000000a11' and numero_linha = 2),
  '72100000-0000-4000-8000-0000000000f1'::uuid,
  'unidade em branco num empreendimento com uma unidade: usa essa'
);

select results_eq(
  $$select u.nome, u.endereco from public.unidade as u
    join public.empreendimento as e on e.id = u.empreendimento_id
    where e.nome = 'Nova Fábrica' order by u.nome$$,
  $$values ('Galpão', 'Rua 1, 100'), ('Matriz', null::text)$$,
  'empreendimento novo: a unidade da planilha (com endereço) e a "Matriz" para a coluna em branco'
);

select results_eq(
  $$select e.nome, c.nome, e.criado_por from public.empreendimento as e
    left join public.cliente as c on c.id = e.cliente_id
    where e.nome = 'Nova Fábrica'$$,
  $$values ('Nova Fábrica', 'Cliente N', 'd0000000-0000-4000-8000-0000000000a1'::uuid)$$,
  'o empreendimento novo ganha o cliente pelo nome'
);

select is(
  (select array_agg(i.numero order by i.numero) from public.plano_renovacao as p
   join public.instrumento as i on i.id = p.instrumento_id
   where p.consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  array['L-1', 'L-2'],
  'cada LAO importada ganha o plano de renovação; a AuA não'
);

select is(
  (select count(*)::integer from public.auditoria
   where entidade = 'instrumento' and acao = 'insert'
     and motivo = 'importacao:72100000-0000-4000-8000-000000000a11'),
  3,
  'a auditoria das licenças leva o motivo importacao:<id>'
);

select testes.autenticar_como('eduardo@filtroville.test');
select results_eq(
  $$select p.tipo_linha, p.licenca, p.prazo
    from public.listar_prazos('c0000000-0000-4000-8000-00000000000a',
      p_empreendimento_id => (select id from public.empreendimento where nome = 'Nova Fábrica')) as p
    order by p.tipo_linha, p.licenca$$,
  $$values ('limite_protocolo', 'LAO L-2', current_setting('testes.hoje')::date + 400 - 120),
           ('validade', 'AuA A-1', current_setting('testes.hoje')::date + 400),
           ('validade', 'LAO L-2', current_setting('testes.hoje')::date + 400)$$,
  'a Visão traz a validade das licenças importadas e o limite de protocolo da LAO'
);

select is(
  public.efetivar_importacao('72100000-0000-4000-8000-000000000a11', 1, false),
  current_setting('testes.resultado')::jsonb,
  'efetivar de novo devolve o mesmo resultado (ignora a versão)'
);
select is(
  (select count(*)::integer from public.instrumento),
  3,
  'efetivar duas vezes cria uma vez'
);
select results_eq(
  $$select situacao, efetivada_por, row_version, resultado
    from public.importacao where id = '72100000-0000-4000-8000-000000000a11'$$,
  $$values ('efetivada', 'd0000000-0000-4000-8000-0000000000a1'::uuid,
            (current_setting('testes.resultado')::jsonb ->> 'row_version')::integer,
            current_setting('testes.resultado')::jsonb)$$,
  'a importação fica efetivada, com quem e o resultado'
);
select throws_ok(
  $$select public.enviar_linhas_da_importacao('72100000-0000-4000-8000-000000000a11', '[]')$$,
  'P0001', 'importacao_encerrada', 'importação efetivada não recebe linhas');
select is(
  public.conferir_importacao('72100000-0000-4000-8000-000000000a11'),
  (select resumo from public.importacao where id = '72100000-0000-4000-8000-000000000a11'),
  'conferir depois de efetivar devolve o resumo guardado'
);

-- ---------------------------------------------------------------------------
-- Importar o mesmo arquivo de novo: tudo pulado, nada a importar
-- ---------------------------------------------------------------------------
select public.criar_importacao('72100000-0000-4000-8000-000000000a12', 'c0000000-0000-4000-8000-00000000000a',
  'licenca', 'carteira.xlsx', 4, '{}');
select public.enviar_linhas_da_importacao('72100000-0000-4000-8000-000000000a12',
  current_setting('testes.lote')::jsonb);
select set_config('testes.resumo2',
  public.conferir_importacao('72100000-0000-4000-8000-000000000a12')::text, true);

select is(
  current_setting('testes.resumo2')::jsonb - 'row_version' - 'limite',
  '{"total": 4, "prontas": 0, "com_aviso": 3, "com_erro": 1, "puladas": 3,
    "a_criar": {"empreendimentos": 0, "unidades": 0, "licencas": 0}}'::jsonb,
  'a mesma planilha de novo: as três licenças já existem e são puladas'
);
select throws_ok(
  $$select public.efetivar_importacao('72100000-0000-4000-8000-000000000a12',
      (current_setting('testes.resumo2')::jsonb ->> 'row_version')::integer, true)$$,
  'P0001', 'nada_para_importar', 'nenhuma linha cria nada: recusa');

-- Mudar uma linha depois de conferir pede nova conferência.
select public.enviar_linhas_da_importacao('72100000-0000-4000-8000-000000000a12',
  jsonb_build_array((current_setting('testes.lote')::jsonb) -> 0));
select throws_ok(
  $$select public.efetivar_importacao('72100000-0000-4000-8000-000000000a12',
      (select row_version from public.importacao where id = '72100000-0000-4000-8000-000000000a12'), true)$$,
  'P0001', 'importacao_nao_conferida', 'enviar depois de conferir exige conferir de novo');

-- ---------------------------------------------------------------------------
-- Entidade empreendimento: existente e repetido são pulados
-- ---------------------------------------------------------------------------
select public.criar_importacao('72100000-0000-4000-8000-000000000a13', 'c0000000-0000-4000-8000-00000000000a',
  'empreendimento', 'clientes.csv', 4, '{}');
select public.enviar_linhas_da_importacao('72100000-0000-4000-8000-000000000a13',
  '[{"numero_linha": 2, "dados": {"empreendimento": "Nova Fábrica", "cliente": "Cliente N", "unidade": "Outra"}},
    {"numero_linha": 3, "dados": {"empreendimento": "Outra Empresa", "unidade": "Sede", "endereco": "Rua 2"}},
    {"numero_linha": 4, "dados": {"empreendimento": "outra empresa"}},
    {"numero_linha": 5, "dados": {"empreendimento": "Terceira", "cnpj": "12.345.678/0001-90"}}]');
select set_config('testes.resumo3',
  public.conferir_importacao('72100000-0000-4000-8000-000000000a13')::text, true);

select is(
  current_setting('testes.resumo3')::jsonb - 'row_version' - 'limite',
  '{"total": 4, "prontas": 2, "com_aviso": 2, "com_erro": 0, "puladas": 2,
    "a_criar": {"empreendimentos": 2, "unidades": 1, "licencas": 0}}'::jsonb,
  'empreendimentos: o existente e o repetido na planilha são avisos pulados'
);
select is(
  (current_setting('testes.resumo3')::jsonb -> 'limite' ->> 'precisa_confirmar')::boolean,
  false,
  'empreendimento sem licença não passa do limite'
);
select is(
  public.efetivar_importacao('72100000-0000-4000-8000-000000000a13',
    (current_setting('testes.resumo3')::jsonb ->> 'row_version')::integer) - 'row_version' - 'desfazer_ate',
  '{"linhas_criadas": 2, "linhas_puladas": 2, "linhas_com_erro": 0,
    "empreendimentos_criados": 2, "unidades_criadas": 1, "licencas_criadas": 0}'::jsonb,
  'cria os dois empreendimentos novos e a unidade da linha'
);
select results_eq(
  $$select l.numero_linha, l.resultado, e.nome, e.cnpj, l.unidade_id is not null
    from public.importacao_linha as l
    left join public.empreendimento as e on e.id = l.empreendimento_id
    where l.importacao_id = '72100000-0000-4000-8000-000000000a13'
    order by l.numero_linha$$,
  $$values (2, 'pulada', 'Nova Fábrica', null::text, false),
           (3, 'criada', 'Outra Empresa', null, true),
           (4, 'pulada', 'Outra Empresa', null, false),
           (5, 'criada', 'Terceira', '12345678000190', false)$$,
  'a linha pulada aponta o empreendimento que já existe (ou o da primeira linha)'
);
select is(
  (select count(*)::integer from public.unidade as u
   join public.empreendimento as e on e.id = u.empreendimento_id where e.nome = 'Nova Fábrica'),
  2,
  'empreendimento existente não ganha unidade nova pela aba Empreendimentos'
);

select * from finish();

rollback;
