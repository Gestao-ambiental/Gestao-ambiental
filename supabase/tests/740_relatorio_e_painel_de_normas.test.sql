-- Relatório e painel das normas (L10, ADR-0050, LEG-10): requisitos de toda a consultoria, mudanças
-- que alcançaram o empreendimento e normas pela chave; outra consultoria lê zero.
begin;

select plan(8);

select testes.criar_dados_sinteticos();

insert into public.empreendimento (id, consultoria_id, nome, criado_por) values
  ('74000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a', 'Curtume Teste',
   'd0000000-0000-4000-8000-0000000000a1'),
  ('74000000-0000-4000-8000-0000000000e2', 'c0000000-0000-4000-8000-00000000000a', 'Olaria Teste',
   'd0000000-0000-4000-8000-0000000000a1');

insert into private.norma (id, chave, esfera, orgao, tipo, numero, ano, titulo, situacao_na_fonte) values
  ('74000000-0000-4000-8000-000000000101', 'sc;teste740;n1', 'estadual', 'IMA-TESTE', 'portaria', '7401', 2026,
   'Portaria Teste 740', 'vigente');
insert into private.norma_versao (id, norma_id, numero, sha256) values
  ('74000000-0000-4000-8000-000000000201', '74000000-0000-4000-8000-000000000101', 1, repeat('c', 64));
insert into private.norma_mudanca (id, norma_id, versao_nova_id, tipo, situacao, revisada_por, publicada_em, resumo)
values ('74000000-0000-4000-8000-000000000301', '74000000-0000-4000-8000-000000000101',
        '74000000-0000-4000-8000-000000000201', 'nova', 'publicada', 'a0000000-0000-4000-8000-000000000001',
        now(), '{"resumo": "Novo prazo de renovação.", "o_que_muda": ["Prazo de 180 dias"]}'::jsonb);

insert into public.requisito_legal (consultoria_id, empreendimento_id, norma_id, origem, criado_por) values
  ('c0000000-0000-4000-8000-00000000000a', '74000000-0000-4000-8000-0000000000e1',
   '74000000-0000-4000-8000-000000000101', 'sugerido', 'd0000000-0000-4000-8000-0000000000a1'),
  ('c0000000-0000-4000-8000-00000000000a', '74000000-0000-4000-8000-0000000000e2',
   '74000000-0000-4000-8000-000000000101', 'sugerido', 'd0000000-0000-4000-8000-0000000000a1');

insert into public.aviso_norma (consultoria_id, mudanca_id, empreendimento_id, motivo) values
  ('c0000000-0000-4000-8000-00000000000a', '74000000-0000-4000-8000-000000000301',
   '74000000-0000-4000-8000-0000000000e1', '{"criterio": "atividade", "valor": "99.10.00"}'::jsonb);

select testes.autenticar_como('ana@filtroville.test');

select is(
  (select count(*)::integer from public.listar_requisitos_da_consultoria('c0000000-0000-4000-8000-00000000000a') as r
   where r.norma_titulo = 'Portaria Teste 740'),
  2,
  'requisitos de todos os empreendimentos da consultoria'
);

select ok(
  (select bool_and(r.ultima_mudanca_publicada_em is not null and r.empreendimento_nome is not null)
   from public.listar_requisitos_da_consultoria('c0000000-0000-4000-8000-00000000000a') as r
   where r.norma_titulo = 'Portaria Teste 740'),
  'cada linha traz o empreendimento e a última mudança publicada da norma'
);

select is(
  (select row(m.norma_titulo, m.tipo_mudanca, m.resumo ->> 'resumo')::text
   from public.listar_mudancas_do_empreendimento('c0000000-0000-4000-8000-00000000000a',
     '74000000-0000-4000-8000-0000000000e1', current_date - 30) as m),
  row('Portaria Teste 740', 'nova', 'Novo prazo de renovação.')::text,
  'mudança que alcançou o empreendimento, com o resumo revisado'
);

select is(
  (select count(*)::integer from public.listar_mudancas_do_empreendimento('c0000000-0000-4000-8000-00000000000a',
     '74000000-0000-4000-8000-0000000000e2', current_date - 30)),
  0,
  'empreendimento sem aviso não lista a mudança'
);

select is(
  (select array_agg(n.chave order by n.chave)
   from public.normas_por_chave(array['sc;teste740;n1', 'sc;teste740;nao-existe', 'sc;ima;instrucao_normativa;2']) as n),
  array['sc;ima;instrucao_normativa;2', 'sc;teste740;n1'],
  'normas pela chave: só as que existem no catálogo'
);

select testes.autenticar_como('gustavo@verdesul.test');

select is(
  (select count(*)::integer from public.listar_requisitos_da_consultoria('c0000000-0000-4000-8000-00000000000a')),
  0,
  'outra consultoria lê zero requisitos'
);

select is(
  (select count(*)::integer from public.listar_mudancas_do_empreendimento('c0000000-0000-4000-8000-00000000000a',
     '74000000-0000-4000-8000-0000000000e1', null)),
  0,
  'outra consultoria lê zero mudanças'
);

select testes.autenticar_como_anonimo();

select throws_ok(
  $$select * from public.normas_por_chave(array['sc;teste740;n1'])$$,
  '42501', null,
  'anônimo não consulta normas pela chave'
);

reset role;

select * from finish();
rollback;
