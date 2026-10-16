-- Desligar um membro revoga o acesso na hora (ACC-02) e preserva o vínculo histórico.
begin;

select plan(7);

select testes.criar_dados_sinteticos();

-- Antes: Diego (Equipe A) enxerga a Filtroville
select testes.autenticar_como('diego@filtroville.test');

select is(
  (select count(*) from public.consultoria),
  1::bigint,
  'Diego ativo vê a Filtroville'
);

reset role;

update public.membro
set situacao = 'desligado', desligado_em = now()
where id = 'd0000000-0000-4000-8000-0000000000a5';

-- Depois: zero linhas em tudo, sem erro
select testes.autenticar_como('diego@filtroville.test');

select is(
  (select count(*) from public.consultoria),
  0::bigint,
  'Diego desligado não vê mais a consultoria'
);

select is(
  (select count(*) from public.membro),
  0::bigint,
  'Diego desligado não vê mais os membros'
);

select is(
  (select private.membro_atual('c0000000-0000-4000-8000-00000000000a')),
  null::uuid,
  'Diego desligado não tem membro atual (não vira ator de auditoria)'
);

-- Os demais continuam vendo, inclusive o vínculo desligado (autoria preservada)
select testes.autenticar_como('ana@filtroville.test');

select is(
  (select count(*) from public.membro where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  6::bigint,
  'Ana segue vendo os 6 vínculos, inclusive o desligado'
);

select is(
  (select situacao from public.membro where id = 'd0000000-0000-4000-8000-0000000000a5'),
  'desligado'::public.situacao_membro,
  'o vínculo de Diego aparece como desligado'
);

reset role;

select throws_ok(
  $$update public.membro set situacao = 'desligado'
    where id = 'd0000000-0000-4000-8000-0000000000a4'$$,
  '23514', null,
  'desligar exige desligado_em (check de coerência)'
);

select * from finish();

rollback;
