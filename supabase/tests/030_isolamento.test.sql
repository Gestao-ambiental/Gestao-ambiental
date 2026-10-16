-- Isolamento entre consultorias (ADR-0003, F5): quem é da Verde Sul (B) não enxerga nada
-- da Filtroville (A), sem erro que revele existência; o cliente não escreve direto.
begin;

select plan(19);

select testes.criar_dados_sinteticos();

-- Linha de auditoria em A para garantir que há o que esconder
update public.membro set papel = 'gestao' where id = 'd0000000-0000-4000-8000-0000000000a3';

-- Positivo: membro de A vê a própria consultoria e os membros dela
select testes.autenticar_como('ana@filtroville.test');

select results_eq(
  'select id from public.consultoria',
  $$values ('c0000000-0000-4000-8000-00000000000a'::uuid)$$,
  'Ana (A) vê só a Filtroville'
);

select is(
  (select count(*) from public.membro where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  6::bigint,
  'Ana (A) vê os 6 membros da Filtroville'
);

select is(
  (select count(*) from public.membro where consultoria_id <> 'c0000000-0000-4000-8000-00000000000a'),
  0::bigint,
  'Ana (A) não vê membros de outra consultoria'
);

-- Negativo: Equipe de B recebe zero linhas de A, sem erro
select testes.autenticar_como('helena@verdesul.test');

select lives_ok(
  $$select * from public.consultoria where id = 'c0000000-0000-4000-8000-00000000000a'$$,
  'Helena (B) consulta a Filtroville sem erro'
);

select is(
  (select count(*) from public.consultoria where id = 'c0000000-0000-4000-8000-00000000000a'),
  0::bigint,
  'Helena (B) recebe zero linhas da consultoria A'
);

select is(
  (select count(*) from public.membro where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  0::bigint,
  'Helena (B) recebe zero membros de A'
);

select is(
  (select count(*) from public.auditoria where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  0::bigint,
  'Helena (B) recebe zero linhas de auditoria de A'
);

select results_eq(
  'select id from public.consultoria',
  $$values ('c0000000-0000-4000-8000-00000000000b'::uuid)$$,
  'Helena (B) vê só a Verde Sul'
);

-- Negativo: nem a Gestão de B enxerga A
select testes.autenticar_como('gustavo@verdesul.test');

select is(
  (select count(*) from public.membro where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  0::bigint,
  'Gustavo (Gestão B) recebe zero membros de A'
);

select is(
  (select count(*) from public.auditoria where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  0::bigint,
  'Gustavo (Gestão B) recebe zero linhas de auditoria de A'
);

select is(
  (select private.is_membro('c0000000-0000-4000-8000-00000000000a')),
  false,
  'Gustavo não é membro de A para os helpers'
);

-- O cliente não escreve direto nas tabelas da base (escrita será por RPC)
select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$insert into public.consultoria (nome) values ('Outra')$$,
  '42501', null,
  'Gestão não cria consultoria direto pela API'
);

select throws_ok(
  $$update public.membro set papel = 'gestao' where id = 'd0000000-0000-4000-8000-0000000000a2'$$,
  '42501', null,
  'Gestão não altera membro direto pela API'
);

select throws_ok(
  $$delete from public.membro where id = 'd0000000-0000-4000-8000-0000000000a2'$$,
  '42501', null,
  'Gestão não apaga membro direto pela API'
);

select throws_ok(
  $$insert into public.membro (consultoria_id, usuario_id, papel)
    values ('c0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000002', 'gestao')$$,
  '42501', null,
  'ninguém se vincula a uma consultoria direto pela API'
);

-- Sem login: nenhum acesso
select testes.autenticar_como_anonimo();

select throws_ok(
  'select * from public.consultoria',
  '42501', null,
  'anônimo não lê consultoria'
);

select throws_ok(
  'select * from public.membro',
  '42501', null,
  'anônimo não lê membro'
);

reset role;

-- FK composta: o banco não liga registro de A a membro de B, mesmo com o UUID conhecido
select throws_ok(
  $$insert into public.auditoria (consultoria_id, entidade, entidade_id, acao, ator_membro_id)
    values ('c0000000-0000-4000-8000-00000000000a', 'teste', gen_random_uuid(), 'insert',
            'd0000000-0000-4000-8000-0000000000b2')$$,
  '23503', null,
  'FK composta impede ator de B em registro de A'
);

select lives_ok(
  $$insert into public.auditoria (consultoria_id, entidade, entidade_id, acao, ator_membro_id)
    values ('c0000000-0000-4000-8000-00000000000a', 'teste', gen_random_uuid(), 'insert',
            'd0000000-0000-4000-8000-0000000000a1')$$,
  'FK composta aceita ator da mesma consultoria'
);

select * from finish();

rollback;
