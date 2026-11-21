-- Coleta do CIGA (L9, ADR-0050, LEG-02): municipios_vigiados devolve os municípios das unidades
-- (só para a service role); o agendamento aceita ciga e continua desligado.
begin;

select plan(6);

select testes.criar_dados_sinteticos();

insert into public.empreendimento (id, consultoria_id, nome, criado_por) values
  ('73900000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a', 'Malharia Teste',
   'd0000000-0000-4000-8000-0000000000a1'),
  ('73900000-0000-4000-8000-0000000000eb', 'c0000000-0000-4000-8000-00000000000b', 'Têxtil Teste',
   'd0000000-0000-4000-8000-0000000000b1');
insert into public.unidade (consultoria_id, empreendimento_id, nome, municipio_ibge, municipio_nome,
                            municipio_gravado_em) values
  ('c0000000-0000-4000-8000-00000000000a', '73900000-0000-4000-8000-0000000000e1', 'Matriz', '4202404',
   'Blumenau', now()),
  ('c0000000-0000-4000-8000-00000000000a', '73900000-0000-4000-8000-0000000000e1', 'Filial', null, null, null),
  ('c0000000-0000-4000-8000-00000000000b', '73900000-0000-4000-8000-0000000000eb', 'Matriz', '4202404',
   'Blumenau', now());

set local role service_role;

select is(
  (select array_agg(row(m.ibge, m.nome)::text) from public.municipios_vigiados() as m where m.ibge = '4202404'),
  array[row('4202404', 'Blumenau')::text],
  'município das unidades, sem repetir entre consultorias'
);

reset role;

select ok(
  not has_function_privilege('authenticated', 'public.municipios_vigiados()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.municipios_vigiados()', 'EXECUTE'),
  'só a service role pergunta pelos municípios vigiados'
);

select lives_ok(
  $$select private.ligar_coleta_de_normas(array['ciga'])$$,
  'ligar aceita ciga (sem pg_cron só avisa)'
);

select throws_ok(
  $$select private.ligar_coleta_de_normas(array['senado'])$$,
  'P0001', 'fonte_sem_coletor',
  'senado continua sem coletor'
);

select is(
  (select count(*)::integer from private.fonte_legal as f where f.ativa),
  0,
  'nenhuma fonte foi ligada'
);

select ok(
  position('''ciga'', ''50 3,15,19 * * *''' in pg_get_functiondef('private.ligar_coleta_de_normas(text[])'::regprocedure)) > 0,
  'ciga três vezes por dia, depois de cada janela do CIGA'
);

select * from finish();
rollback;
