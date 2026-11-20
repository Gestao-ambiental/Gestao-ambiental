-- Importar planilha (ADR-0043), parte 3: desfazer em até 24 h, por exclusão lógica. A leitura (RLS)
-- esconde o desfeito, a Visão e a contagem de empreendimentos ativos deixam de vê-lo; fica o que foi
-- editado, tem renovação em andamento ou tem outro dado ligado (orçamento). Nada volta a usar o
-- desfeito: licença não volta a ser editada, unidade e licença novas no pai desfeito são recusadas.
begin;

set local timezone to 'America/Sao_Paulo';

select plan(20);

select testes.criar_dados_sinteticos();

select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

create function pg_temp.dl(emp text, cli text, uni text, tipo text, num text, org text, emi date, val date)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'empreendimento', emp, 'cliente', cli, 'cnpj', null, 'unidade', uni, 'endereco', null,
    'tipo', tipo, 'numero', num, 'orgao', org,
    'emitido_em', emi::text, 'emitido_em_texto', to_char(emi, 'DD/MM/YYYY'),
    'validade', val::text, 'validade_texto', to_char(val, 'DD/MM/YYYY'),
    'descartados', '[]'::jsonb)
$$;

-- Quatro linhas, cada uma num empreendimento novo:
--   2 Alfa (unidade U1, AuA D-1): ninguém mexe, tudo é desfeito;
--   3 Beta (AuA D-2): a licença é editada depois;
--   4 Gama (AuA D-3): o empreendimento ganha um orçamento;
--   5 Delta (LAO D-4): o plano de renovação é alterado.
select set_config('testes.lote', (
  with h as (select current_setting('testes.hoje')::date as d)
  select jsonb_agg(jsonb_build_object('numero_linha', x.n, 'dados', x.dados) order by x.n)
  from h cross join lateral (values
    (2, pg_temp.dl('Alfa', 'Cli A', 'U1', 'AuA', 'D-1', 'Prefeitura', h.d - 100, h.d + 400)),
    (3, pg_temp.dl('Beta', null, null, 'AuA', 'D-2', 'Prefeitura', h.d - 100, h.d + 400)),
    (4, pg_temp.dl('Gama', null, null, 'AuA', 'D-3', 'Prefeitura', h.d - 100, h.d + 400)),
    (5, pg_temp.dl('Delta', null, null, 'LAO', 'D-4', 'IMA', h.d - 100, h.d + 400))
  ) as x (n, dados))::text, true);

select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_importacao('72200000-0000-4000-8000-000000000a21', 'c0000000-0000-4000-8000-00000000000a',
  'licenca', 'carteira.xlsx', 4, '{}');
select public.enviar_linhas_da_importacao('72200000-0000-4000-8000-000000000a21',
  current_setting('testes.lote')::jsonb);

select throws_ok(
  $$select public.desfazer_importacao('72200000-0000-4000-8000-000000000a21',
      (select row_version from public.importacao where id = '72200000-0000-4000-8000-000000000a21'))$$,
  'P0001', 'importacao_nao_efetivada', 'desfazer o que ainda está em conferência: recusa');

select public.efetivar_importacao('72200000-0000-4000-8000-000000000a21',
  (public.conferir_importacao('72200000-0000-4000-8000-000000000a21') ->> 'row_version')::integer);

-- Depois de efetivar: alguém edita a licença D-2, cria orçamento para Gama e mexe no plano da D-4.
reset role;
update public.instrumento set antecedencia_renovacao_dias = 45, row_version = row_version + 1
where consultoria_id = 'c0000000-0000-4000-8000-00000000000a' and numero = 'D-2';
insert into public.orcamento (consultoria_id, ano, sequencia, empreendimento_id, objeto, criado_por)
select 'c0000000-0000-4000-8000-00000000000a', 2026, 722, e.id, 'Gama', 'd0000000-0000-4000-8000-0000000000a1'
from public.empreendimento as e where e.nome = 'Gama';
update public.plano_renovacao as p set antecedencia_dias = 40, row_version = p.row_version + 1
from public.instrumento as i
where i.id = p.instrumento_id and i.numero = 'D-4';

select is(private.empreendimentos_ativos('c0000000-0000-4000-8000-00000000000a'), 4,
  'antes de desfazer: quatro empreendimentos com licença ativa');

select testes.autenticar_como('eduardo@filtroville.test');
select throws_ok(
  $$select public.desfazer_importacao('72200000-0000-4000-8000-000000000a21', 1)$$,
  'P0001', 'conflito_de_versao', 'desfazer com versão antiga: conflito');

select set_config('testes.desfeito', public.desfazer_importacao('72200000-0000-4000-8000-000000000a21',
  (select row_version from public.importacao where id = '72200000-0000-4000-8000-000000000a21'))::text, true);

select is(
  current_setting('testes.desfeito')::jsonb - 'row_version',
  '{"linhas_desfeitas": 1, "linhas_mantidas": 3, "empreendimentos_desfeitos": 1, "unidades_desfeitas": 2,
    "licencas_desfeitas": 2,
    "mantidas": [{"numero_linha": 3, "motivo": "alterada_depois"},
                 {"numero_linha": 4, "motivo": "tem_dependentes"},
                 {"numero_linha": 5, "motivo": "renovacao_em_andamento"}]}'::jsonb,
  'desfaz o que ninguém mexeu e diz por que o resto ficou'
);

select results_eq(
  $$select numero_linha, resultado, motivo_mantida from public.importacao_linha
    where importacao_id = '72200000-0000-4000-8000-000000000a21' order by numero_linha$$,
  $$values (2, 'desfeita', null::text), (3, 'criada', 'alterada_depois'), (4, 'criada', 'tem_dependentes'),
           (5, 'criada', 'renovacao_em_andamento')$$,
  'cada linha fica desfeita ou mantida com o motivo'
);

select is(
  (select array_agg(nome order by nome) from public.empreendimento),
  array['Beta', 'Delta', 'Gama'],
  'a leitura esconde o empreendimento desfeito; o que tem orçamento fica'
);
select is(
  (select array_agg(numero order by numero) from public.instrumento),
  array['D-2', 'D-4'],
  'a leitura esconde as licenças desfeitas'
);
select is(
  (select array_agg(e.nome order by e.nome) from public.unidade as u
   join public.empreendimento as e on e.id = u.empreendimento_id),
  array['Beta', 'Delta'],
  'a leitura esconde as unidades desfeitas (a de Alfa e a de Gama, que ficou sem licença)'
);
select is(
  (select array_agg(distinct p.licenca order by p.licenca)
   from public.listar_prazos('c0000000-0000-4000-8000-00000000000a') as p),
  array['AuA D-2', 'LAO D-4'],
  'a Visão não traz as licenças desfeitas'
);

reset role;
select is(private.empreendimentos_ativos('c0000000-0000-4000-8000-00000000000a'), 2,
  'depois de desfazer: só os dois empreendimentos com licença mantida contam no plano');

select results_eq(
  $$select numero, situacao::text, excluido_em is not null, excluido_por from public.instrumento
    where consultoria_id = 'c0000000-0000-4000-8000-00000000000a' order by numero$$,
  $$values ('D-1', 'rascunho', true, 'd0000000-0000-4000-8000-0000000000a1'::uuid),
           ('D-2', 'ativo', false, null::uuid),
           ('D-3', 'rascunho', true, 'd0000000-0000-4000-8000-0000000000a1'::uuid),
           ('D-4', 'ativo', false, null::uuid)$$,
  'a licença desfeita volta a rascunho e guarda quem desfez; nada é apagado'
);

select is(
  (select count(*)::integer from public.auditoria
   where entidade = 'instrumento' and acao = 'update'
     and motivo = 'desfazer_importacao:72200000-0000-4000-8000-000000000a21'),
  2,
  'a auditoria das licenças desfeitas leva o motivo desfazer_importacao:<id>'
);

select is(
  (select count(*)::integer from public.cliente where nome = 'Cli A'),
  1,
  'o cliente criado pela importação fica'
);

select results_eq(
  $$select situacao, desfeita_por, resultado_desfazer = current_setting('testes.desfeito')::jsonb
    from public.importacao where id = '72200000-0000-4000-8000-000000000a21'$$,
  $$values ('desfeita', 'd0000000-0000-4000-8000-0000000000a1'::uuid, true)$$,
  'a importação fica desfeita (mesmo parcial), com quem e o resultado'
);

select testes.autenticar_como('eduardo@filtroville.test');
select is(
  public.desfazer_importacao('72200000-0000-4000-8000-000000000a21', 1),
  current_setting('testes.desfeito')::jsonb,
  'desfazer de novo devolve o mesmo resultado'
);

-- ---------------------------------------------------------------------------
-- Nada volta a usar o desfeito
-- ---------------------------------------------------------------------------
reset role;
select set_config('testes.alfa', (select empreendimento_id::text from public.importacao_linha
  where importacao_id = '72200000-0000-4000-8000-000000000a21' and numero_linha = 2), true);
select set_config('testes.u1', (select unidade_id::text from public.importacao_linha
  where importacao_id = '72200000-0000-4000-8000-000000000a21' and numero_linha = 2), true);
select set_config('testes.d1', (select instrumento_id::text from public.importacao_linha
  where importacao_id = '72200000-0000-4000-8000-000000000a21' and numero_linha = 2), true);

select testes.autenticar_como('eduardo@filtroville.test');
select throws_ok(
  $$select public.criar_unidade(gen_random_uuid(), current_setting('testes.alfa')::uuid, 'Nova', null)$$,
  '42501', 'sem_permissao', 'criar_unidade recusa empreendimento desfeito, mesmo com o UUID'
);
select throws_ok(
  $$select public.criar_instrumento(gen_random_uuid(), current_setting('testes.u1')::uuid)$$,
  '42501', 'sem_permissao', 'criar_instrumento recusa unidade desfeita'
);

reset role;
select throws_ok(
  $$select private.instrumento_para_editar(current_setting('testes.d1')::uuid)$$,
  '42501', 'sem_permissao', 'instrumento_para_editar recusa licença desfeita (a Gestão chamando)'
);

-- ---------------------------------------------------------------------------
-- Prazo de 24 h
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_importacao('72200000-0000-4000-8000-000000000a22', 'c0000000-0000-4000-8000-00000000000a',
  'empreendimento', 'velha.csv', 1, '{}');
select public.enviar_linhas_da_importacao('72200000-0000-4000-8000-000000000a22',
  '[{"numero_linha": 2, "dados": {"empreendimento": "Épsilon"}}]');
select public.efetivar_importacao('72200000-0000-4000-8000-000000000a22',
  (public.conferir_importacao('72200000-0000-4000-8000-000000000a22') ->> 'row_version')::integer);

reset role;
update public.importacao set efetivada_em = now() - interval '24 hours 1 minute'
where id = '72200000-0000-4000-8000-000000000a22';

select testes.autenticar_como('eduardo@filtroville.test');
select throws_ok(
  $$select public.desfazer_importacao('72200000-0000-4000-8000-000000000a22',
      (select row_version from public.importacao where id = '72200000-0000-4000-8000-000000000a22'))$$,
  'P0001', 'prazo_para_desfazer_encerrado', 'depois de 24 h não desfaz'
);
select is(
  (select count(*)::integer from public.empreendimento where nome = 'Épsilon'),
  1,
  'o empreendimento importado há mais de 24 h continua'
);

select * from finish();

rollback;
