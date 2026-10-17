-- Mudar papel e desligar (ACC-02, ACC-03): só a Gestão da consultoria; nunca sem Gestão;
-- desligar preserva o vínculo e o histórico; reconvidar reativa o mesmo vínculo.
-- meus_vinculos (ACC-04): a pessoa vê os próprios vínculos, inclusive os encerrados.
begin;

select plan(24);

select testes.criar_dados_sinteticos();

-- ---------------------------------------------------------------------------
-- alterar_papel
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select throws_ok(
  $$select public.alterar_papel('d0000000-0000-4000-8000-0000000000a3', 'gestao')$$,
  '42501', 'sem_permissao',
  'Equipe (Ana) não muda papel'
);

select testes.autenticar_como('gustavo@verdesul.test');

select throws_ok(
  $$select public.alterar_papel('d0000000-0000-4000-8000-0000000000a3', 'gestao')$$,
  '42501', 'sem_permissao',
  'Gestão de B (Gustavo) não muda papel na Filtroville'
);

select throws_ok(
  $$select public.alterar_papel(gen_random_uuid(), 'gestao')$$,
  '42501', 'sem_permissao',
  'membro inexistente responde como sem permissão (não revela existência)'
);

select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.alterar_papel('d0000000-0000-4000-8000-0000000000a1', 'equipe')$$,
  'P0001', 'ultima_gestao',
  'a única Gestão não passa para Equipe'
);

select lives_ok(
  $$select public.alterar_papel('d0000000-0000-4000-8000-0000000000a2', 'gestao')$$,
  'Gestão (Eduardo) promove Ana'
);

select is(
  (select papel from public.membro where id = 'd0000000-0000-4000-8000-0000000000a2'),
  'gestao'::public.papel_membro,
  'Ana agora é Gestão'
);

select lives_ok(
  $$select public.alterar_papel('d0000000-0000-4000-8000-0000000000a1', 'equipe')$$,
  'com outra Gestão, Eduardo pode passar para Equipe'
);

select ok(
  not private.is_gestao('c0000000-0000-4000-8000-00000000000a'),
  'o papel novo vale na próxima requisição (Eduardo já não é Gestão)'
);

select testes.autenticar_como('ana@filtroville.test');

select lives_ok(
  $$select public.alterar_papel('d0000000-0000-4000-8000-0000000000a1', 'gestao')$$,
  'Ana (Gestão) devolve a Gestão ao Eduardo'
);

-- ---------------------------------------------------------------------------
-- desligar_membro
-- ---------------------------------------------------------------------------
select testes.autenticar_como('bruno@filtroville.test');

select throws_ok(
  $$select public.desligar_membro('d0000000-0000-4000-8000-0000000000a5')$$,
  '42501', 'sem_permissao',
  'Equipe (Bruno) não desliga ninguém'
);

select testes.autenticar_como('gustavo@verdesul.test');

select throws_ok(
  $$select public.desligar_membro('d0000000-0000-4000-8000-0000000000a5')$$,
  '42501', 'sem_permissao',
  'Gestão de B (Gustavo) não desliga membro da Filtroville'
);

select throws_ok(
  $$select public.desligar_membro('d0000000-0000-4000-8000-0000000000b1')$$,
  'P0001', 'ultima_gestao',
  'Gustavo, única Gestão de B, não se desliga'
);

select testes.autenticar_como('eduardo@filtroville.test');

select lives_ok(
  $$select public.desligar_membro('d0000000-0000-4000-8000-0000000000a5', 'saiu da empresa')$$,
  'Gestão (Eduardo) desliga Diego'
);

select results_eq(
  $$select situacao, desligado_em is not null from public.membro where id = 'd0000000-0000-4000-8000-0000000000a5'$$,
  $$values ('desligado'::public.situacao_membro, true)$$,
  'Diego fica desligado, com o vínculo preservado'
);

select results_eq(
  $$select ator_membro_id, antes ->> 'situacao', depois ->> 'situacao', motivo
    from public.auditoria
    where entidade = 'membro' and entidade_id = 'd0000000-0000-4000-8000-0000000000a5' and acao = 'update'$$,
  $$values ('d0000000-0000-4000-8000-0000000000a1'::uuid, 'ativo', 'desligado', 'saiu da empresa')$$,
  'o desligamento é auditado com ator, antes, depois e motivo'
);

select lives_ok(
  $$select public.desligar_membro('d0000000-0000-4000-8000-0000000000a5')$$,
  'desligar de novo é inofensivo'
);

select throws_ok(
  $$select public.alterar_papel('d0000000-0000-4000-8000-0000000000a5', 'gestao')$$,
  'P0001', 'membro_desligado',
  'não muda papel de quem foi desligado'
);

select testes.autenticar_como('diego@filtroville.test');

select is(
  (select count(*) from public.membro),
  0::bigint,
  'Diego desligado perde o acesso na hora'
);

select results_eq(
  $$select consultoria_nome, papel, situacao, desligado_em is not null from public.meus_vinculos()$$,
  $$values ('Filtroville Consultoria Ambiental', 'equipe'::public.papel_membro,
            'desligado'::public.situacao_membro, true)$$,
  'meus_vinculos mostra a Diego o vínculo encerrado, com a data'
);

-- ---------------------------------------------------------------------------
-- Reconvidar quem foi desligado reativa o mesmo vínculo
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');

select set_config('testes.token',
  (select token from public.criar_convite('c0000000-0000-4000-8000-00000000000a', 'diego@filtroville.test', 'gestao')),
  true);

select testes.autenticar_como('diego@filtroville.test');

select is(
  public.aceitar_convite(current_setting('testes.token')),
  'c0000000-0000-4000-8000-00000000000a'::uuid,
  'Diego aceita o convite novo'
);

select results_eq(
  $$select id, papel, situacao, desligado_em from public.membro
    where usuario_id = 'a0000000-0000-4000-8000-000000000005'$$,
  $$values ('d0000000-0000-4000-8000-0000000000a5'::uuid, 'gestao'::public.papel_membro,
            'ativo'::public.situacao_membro, null::timestamptz)$$,
  'o mesmo vínculo volta ativo, com o papel do convite'
);

-- ---------------------------------------------------------------------------
-- meus_vinculos: cada um vê só os próprios
-- ---------------------------------------------------------------------------
select testes.autenticar_como('helena@verdesul.test');

select results_eq(
  $$select consultoria_id, papel, situacao from public.meus_vinculos()$$,
  $$values ('c0000000-0000-4000-8000-00000000000b'::uuid, 'equipe'::public.papel_membro,
            'ativo'::public.situacao_membro)$$,
  'Helena vê só o vínculo dela com a Verde Sul'
);

select testes.autenticar_como_anonimo();

select throws_ok(
  $$select * from public.meus_vinculos()$$,
  '42501', null,
  'sem login não consulta vínculos'
);

select throws_ok(
  $$select public.desligar_membro('d0000000-0000-4000-8000-0000000000a3')$$,
  '42501', null,
  'sem login não desliga'
);

select * from finish();

rollback;
