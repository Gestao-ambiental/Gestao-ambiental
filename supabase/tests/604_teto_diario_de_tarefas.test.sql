-- Teto diário do tempo ativo por pessoa (ADR-0027, atualização de 19/11/2026): no máximo 24 horas
-- de tempo ativo e 1000 de quantidade por membro e por dia; passou, nada é gravado; o teto é de
-- cada pessoa e de cada dia.
begin;

select plan(9);

select testes.criar_dados_sinteticos();

-- Tempo: 3 tarefas de 8 horas fecham as 24 horas da Ana; mais 1 segundo passa do teto.
select testes.autenticar_como('ana@filtroville.test');
select public.registrar_tarefa('c0000000-0000-4000-8000-00000000000a', 'cadastro_condicionante_manual', 1, 28800);
select public.registrar_tarefa('c0000000-0000-4000-8000-00000000000a', 'cadastro_condicionante_manual', 1, 28800);
select lives_ok(
  $$select public.registrar_tarefa('c0000000-0000-4000-8000-00000000000a', 'cadastro_condicionante_manual', 1, 28800)$$,
  'até 24 horas de tempo ativo no dia');
select throws_ok(
  $$select public.registrar_tarefa('c0000000-0000-4000-8000-00000000000a', 'acompanhamento', 1, 1)$$,
  'P0001', 'limite_diario_de_tarefas',
  'mais um segundo passa das 24 horas: recusa');
select throws_ok(
  $$select public.registrar_tarefa('c0000000-0000-4000-8000-00000000000a', 'cadastro_condicionante_manual', 1, 999999)$$,
  'P0001', 'limite_diario_de_tarefas',
  'chamar de novo não contorna o teto');

-- Quantidade: 1000 condicionantes com IA no dia; a próxima passa do teto.
select testes.autenticar_como('bruno@filtroville.test');
select lives_ok(
  $$select public.registrar_tarefa('c0000000-0000-4000-8000-00000000000a', 'cadastro_licenca_ia', 5000, 600)$$,
  'quantidade acima de 1000 numa chamada é cortada em 1000, como antes');
select throws_ok(
  $$select public.registrar_tarefa('c0000000-0000-4000-8000-00000000000a', 'cadastro_licenca_ia', 1, 60)$$,
  'P0001', 'limite_diario_de_tarefas',
  'a condicionante 1001 do dia passa do teto: recusa');

-- O teto é de cada pessoa: o Eduardo registra normalmente.
select testes.autenticar_como('eduardo@filtroville.test');
select lives_ok(
  $$select public.registrar_tarefa('c0000000-0000-4000-8000-00000000000a', 'acompanhamento', 1, 1800)$$,
  'outra pessoa não é afetada pelo teto da Ana nem do Bruno');

-- O teto é de cada dia: o que foi registrado ontem não conta.
reset role;
insert into public.tarefa_cronometrada (consultoria_id, membro_id, tipo, quantidade, segundos_ativos, instante)
values ('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a4', 'cadastro_licenca_ia',
        1000, 28800, now() - interval '2 days');
select testes.autenticar_como('camila@filtroville.test');
select lives_ok(
  $$select public.registrar_tarefa('c0000000-0000-4000-8000-00000000000a', 'cadastro_licenca_ia', 1000, 600)$$,
  'o que foi registrado em outro dia não conta para hoje');

reset role;
select results_eq(
  $$select membro_id, sum(segundos_ativos)::integer, sum(quantidade)::integer
    from public.tarefa_cronometrada
    where instante >= now() - interval '1 day'
    group by membro_id order by membro_id$$,
  $$values ('d0000000-0000-4000-8000-0000000000a1'::uuid, 1800, 1),
           ('d0000000-0000-4000-8000-0000000000a2'::uuid, 86400, 3),
           ('d0000000-0000-4000-8000-0000000000a3'::uuid, 600, 1000),
           ('d0000000-0000-4000-8000-0000000000a4'::uuid, 600, 1000)$$,
  'só as tarefas dentro do teto foram gravadas');

select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select public.registrar_tarefa('c0000000-0000-4000-8000-00000000000a', 'acompanhamento', 1, 60)$$,
  '42501', 'sem_permissao',
  'Gestão de outra consultoria continua sem registrar na Filtroville');

select * from finish();

rollback;
