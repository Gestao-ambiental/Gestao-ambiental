-- Modelos de documento (ADR-0036, fatia 1). A Gestão cria, edita e arquiva; a Equipe só lê; outra
-- consultoria não vê nada. Escrita só por RPC, com controle otimista e nome único entre os ativos.
begin;

select plan(16);

select testes.criar_dados_sinteticos();

select testes.autenticar_como('eduardo@filtroville.test');

select is(
  public.salvar_modelo_documento('70000000-0000-4000-8000-0000000000d1',
    'c0000000-0000-4000-8000-00000000000a', '  Relatório semestral ',
    '{"type": "doc", "content": [{"type": "paragraph", "content": [
       {"type": "campo", "attrs": {"chave": "empreendimento.nome"}}]}]}'::jsonb, null),
  1,
  'Gestão cria o modelo'
);

select is(
  public.salvar_modelo_documento('70000000-0000-4000-8000-0000000000d1',
    'c0000000-0000-4000-8000-00000000000a', 'Relatório semestral', '{"type": "doc"}'::jsonb, null),
  1,
  'repetir a criação devolve o modelo já criado'
);

select results_eq(
  $$select nome, conteudo #>> '{content,0,content,0,attrs,chave}', row_version
    from public.modelo_documento where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'$$,
  $$values ('Relatório semestral', 'empreendimento.nome', 1)$$,
  'nome limpo e conteúdo gravados, sem duplicar'
);

select is(
  public.salvar_modelo_documento('70000000-0000-4000-8000-0000000000d1',
    'c0000000-0000-4000-8000-00000000000a', 'Relatório semestral de efluentes', '{"type": "doc"}'::jsonb, 1),
  2,
  'editar com a versão certa sobe a versão'
);

select throws_ok(
  $$select public.salvar_modelo_documento('70000000-0000-4000-8000-0000000000d1',
    'c0000000-0000-4000-8000-00000000000a', 'Outro nome', '{"type": "doc"}'::jsonb, 1)$$,
  'P0001', 'conflito_de_versao',
  'editar com versão antiga é recusado'
);

select throws_ok(
  $$select public.salvar_modelo_documento('70000000-0000-4000-8000-0000000000d2',
    'c0000000-0000-4000-8000-00000000000a', 'relatório SEMESTRAL de efluentes', '{"type": "doc"}'::jsonb, null)$$,
  'P0001', 'modelo_com_mesmo_nome',
  'nome repetido entre os ativos é recusado'
);

select throws_ok(
  $$select public.salvar_modelo_documento('70000000-0000-4000-8000-0000000000d2',
    'c0000000-0000-4000-8000-00000000000a', 'Ofício', '{"type": "paragraph"}'::jsonb, null)$$,
  '22023', 'conteudo_invalido',
  'conteúdo sem raiz doc é recusado'
);

select throws_ok(
  $$insert into public.modelo_documento (id, consultoria_id, nome, conteudo, criado_por, atualizado_por)
    values ('70000000-0000-4000-8000-0000000000d3', 'c0000000-0000-4000-8000-00000000000a', 'Direto',
            '{"type": "doc"}', 'd0000000-0000-4000-8000-0000000000a1', 'd0000000-0000-4000-8000-0000000000a1')$$,
  '42501', null,
  'escrita direta na tabela é negada'
);

-- ---------------------------------------------------------------- Equipe
select testes.autenticar_como('ana@filtroville.test');

select is(
  (select count(*)::integer from public.modelo_documento),
  1,
  'a Equipe lê os modelos da consultoria'
);

select throws_ok(
  $$select public.salvar_modelo_documento('70000000-0000-4000-8000-0000000000d4',
    'c0000000-0000-4000-8000-00000000000a', 'Da Equipe', '{"type": "doc"}'::jsonb, null)$$,
  '42501', 'sem_permissao',
  'a Equipe não cria modelo'
);

select throws_ok(
  $$select public.arquivar_modelo_documento('70000000-0000-4000-8000-0000000000d1', 2)$$,
  '42501', 'sem_permissao',
  'a Equipe não arquiva modelo'
);

-- ---------------------------------------------------------------- outra consultoria
select testes.autenticar_como('gustavo@verdesul.test');

select is(
  (select count(*)::integer from public.modelo_documento),
  0,
  'Gestão de outra consultoria não vê o modelo'
);

select throws_ok(
  $$select public.salvar_modelo_documento('70000000-0000-4000-8000-0000000000d1',
    'c0000000-0000-4000-8000-00000000000b', 'Tomado', '{"type": "doc"}'::jsonb, 2)$$,
  '42501', 'sem_permissao',
  'outra consultoria não edita o modelo pelo id conhecido'
);

-- ---------------------------------------------------------------- arquivar
select testes.autenticar_como('eduardo@filtroville.test');

select lives_ok(
  $$select public.arquivar_modelo_documento('70000000-0000-4000-8000-0000000000d1', 2)$$,
  'Gestão arquiva o modelo'
);

select throws_ok(
  $$select public.salvar_modelo_documento('70000000-0000-4000-8000-0000000000d1',
    'c0000000-0000-4000-8000-00000000000a', 'Relatório semestral', '{"type": "doc"}'::jsonb, 3)$$,
  'P0001', 'modelo_arquivado',
  'modelo arquivado não é editado'
);

select is(
  public.salvar_modelo_documento('70000000-0000-4000-8000-0000000000d5',
    'c0000000-0000-4000-8000-00000000000a', 'Relatório semestral de efluentes', '{"type": "doc"}'::jsonb, null),
  1,
  'o nome do arquivado fica livre para um modelo novo'
);

select * from finish();
rollback;
