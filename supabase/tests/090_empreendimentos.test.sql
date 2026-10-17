-- Empreendimentos e unidades (EMP-01, EMP-02): qualquer membro ativo cadastra; criação
-- idempotente; duplicidade é aviso; isolamento entre consultorias; FK composta.
begin;

select plan(32);

select testes.criar_dados_sinteticos();

-- ---------------------------------------------------------------------------
-- Criar (Equipe pode) e idempotência
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select is(
  public.criar_empreendimento('e0000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
    '  Metalúrgica  Rio Cubatão ', 'Rio Cubatão Participações Ltda.', '12.345.678/0001-90', 'Matriz'),
  'e0000000-0000-4000-8000-0000000000e1'::uuid,
  'Equipe (Ana) cria empreendimento com cliente, CNPJ e primeira unidade'
);

select results_eq(
  $$select e.nome, e.cnpj, c.nome, m.nome
    from public.empreendimento as e
    join public.cliente as c on c.id = e.cliente_id
    join public.membro as m on m.id = e.criado_por
    where e.id = 'e0000000-0000-4000-8000-0000000000e1'$$,
  $$values ('Metalúrgica  Rio Cubatão', '12345678000190', 'Rio Cubatão Participações Ltda.', 'Ana Ribeiro')$$,
  'grava nome aparado, CNPJ só com os 14 dígitos, cliente e autor'
);

select is(
  (select count(*) from public.unidade where empreendimento_id = 'e0000000-0000-4000-8000-0000000000e1'),
  1::bigint,
  'a primeira unidade nasce junto'
);

select is(
  public.criar_empreendimento('e0000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
    'Metalúrgica Rio Cubatão', 'Rio Cubatão Participações Ltda.', '12.345.678/0001-90', 'Matriz'),
  'e0000000-0000-4000-8000-0000000000e1'::uuid,
  'repetir a criação devolve o mesmo empreendimento'
);

select results_eq(
  $$select (select count(*) from public.empreendimento), (select count(*) from public.unidade),
           (select count(*) from public.cliente)$$,
  $$values (1::bigint, 1::bigint, 1::bigint)$$,
  'repetir não duplica empreendimento, unidade nem cliente'
);

select lives_ok(
  $$select public.criar_empreendimento('e0000000-0000-4000-8000-0000000000e2', 'c0000000-0000-4000-8000-00000000000a',
      'Transportes Itapocu')$$,
  'só o nome é obrigatório'
);

select is(
  (select count(*) from public.unidade where empreendimento_id = 'e0000000-0000-4000-8000-0000000000e2'),
  0::bigint,
  'sem primeira unidade, nenhuma unidade é inventada'
);

select lives_ok(
  $$select public.criar_empreendimento('e0000000-0000-4000-8000-0000000000e3', 'c0000000-0000-4000-8000-00000000000a',
      'Metalurgica rio cubatao', ' rio cubatao participacoes ltda. ', 'AB.CD1.234/5EF6-78')$$,
  'duplicidade de nome não é proibida; CNPJ alfanumérico é aceito'
);

select results_eq(
  $$select cnpj, cliente_id = (select cliente_id from public.empreendimento
                               where id = 'e0000000-0000-4000-8000-0000000000e1')
    from public.empreendimento where id = 'e0000000-0000-4000-8000-0000000000e3'$$,
  $$values ('ABCD12345EF678', true)$$,
  'o cliente com o mesmo nome (sem acento e caixa) é reaproveitado'
);

select throws_ok(
  $$select public.criar_empreendimento(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a', '   ')$$,
  '22023', 'nome_obrigatorio',
  'nome vazio é recusado'
);

select throws_ok(
  $$select public.criar_empreendimento(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a',
      'Posto', null, '12.345.678/0001')$$,
  '22023', 'cnpj_invalido',
  'CNPJ incompleto é recusado'
);

-- ---------------------------------------------------------------------------
-- Aviso de duplicidade e lista
-- ---------------------------------------------------------------------------
select results_eq(
  $$select id, mesmo_nome, mesmo_cnpj from public.empreendimentos_parecidos(
      'c0000000-0000-4000-8000-00000000000a', 'METALÚRGICA RIO CUBATÃO', '12345678000190')
    order by id$$,
  $$values ('e0000000-0000-4000-8000-0000000000e1'::uuid, true, true),
           ('e0000000-0000-4000-8000-0000000000e3'::uuid, true, false)$$,
  'parecidos acha por nome normalizado e por CNPJ'
);

select is(
  (select count(*) from public.empreendimentos_parecidos(
     'c0000000-0000-4000-8000-00000000000a', 'Metalúrgica Rio Cubatão', null,
     'e0000000-0000-4000-8000-0000000000e1')),
  1::bigint,
  'ao editar, o próprio empreendimento é ignorado'
);

select results_eq(
  $$select nome, unidades, total from public.listar_empreendimentos('c0000000-0000-4000-8000-00000000000a')$$,
  $$values ('Metalúrgica  Rio Cubatão', 1::bigint, 3::bigint),
           ('Metalurgica rio cubatao', 0::bigint, 3::bigint),
           ('Transportes Itapocu', 0::bigint, 3::bigint)$$,
  'a lista traz nome, unidades e total, em ordem de nome'
);

select is(
  (select count(*) from public.listar_empreendimentos('c0000000-0000-4000-8000-00000000000a', 'participacoes')),
  2::bigint,
  'a busca encontra pelo cliente, sem acento'
);

select is(
  (select count(*) from public.listar_empreendimentos('c0000000-0000-4000-8000-00000000000a', '%')),
  0::bigint,
  'curinga digitado na busca é texto, não padrão'
);

select is(
  (select count(*) from public.listar_empreendimentos('c0000000-0000-4000-8000-00000000000a', null, 2, 2)),
  1::bigint,
  'a lista é paginada'
);

-- ---------------------------------------------------------------------------
-- Editar e unidades
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select public.editar_empreendimento('e0000000-0000-4000-8000-0000000000e2', 'Transportes Itapocu Ltda.', '', '')$$,
  'membro edita o empreendimento'
);

select is(
  public.criar_unidade('f0000000-0000-4000-8000-0000000000f1', 'e0000000-0000-4000-8000-0000000000e2',
    'Filial Distrito Industrial', ' Rua A, 100 '),
  'f0000000-0000-4000-8000-0000000000f1'::uuid,
  'membro cria unidade'
);

select is(
  public.criar_unidade('f0000000-0000-4000-8000-0000000000f1', 'e0000000-0000-4000-8000-0000000000e2',
    'Filial Distrito Industrial', 'Rua A, 100'),
  'f0000000-0000-4000-8000-0000000000f1'::uuid,
  'repetir a criação da unidade devolve a mesma'
);

select lives_ok(
  $$select public.editar_unidade('f0000000-0000-4000-8000-0000000000f1', 'Filial DI', '')$$,
  'membro edita a unidade'
);

select results_eq(
  $$select nome, endereco from public.unidade where id = 'f0000000-0000-4000-8000-0000000000f1'$$,
  $$values ('Filial DI', null::text)$$,
  'endereço vazio vira nulo, nunca texto inventado'
);

select throws_ok(
  $$insert into public.empreendimento (consultoria_id, nome, criado_por)
    values ('c0000000-0000-4000-8000-00000000000a', 'Direto', 'd0000000-0000-4000-8000-0000000000a2')$$,
  '42501', null,
  'ninguém escreve direto na tabela empreendimento'
);

-- ---------------------------------------------------------------------------
-- Isolamento: Verde Sul (B) não vê nem mexe na carteira de A
-- ---------------------------------------------------------------------------
select testes.autenticar_como('helena@verdesul.test');

select results_eq(
  $$select (select count(*) from public.empreendimento), (select count(*) from public.unidade),
           (select count(*) from public.cliente)$$,
  $$values (0::bigint, 0::bigint, 0::bigint)$$,
  'Helena (B) recebe zero empreendimentos, unidades e clientes de A'
);

select is(
  (select count(*) from public.listar_empreendimentos('c0000000-0000-4000-8000-00000000000a')),
  0::bigint,
  'Helena (B) lista a carteira de A e recebe zero linhas'
);

select is(
  (select count(*) from public.empreendimentos_parecidos('c0000000-0000-4000-8000-00000000000a', 'Transportes Itapocu Ltda.')),
  0::bigint,
  'o aviso de duplicidade não revela nomes de outra consultoria'
);

select throws_ok(
  $$select public.criar_empreendimento(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a', 'Intruso')$$,
  '42501', 'sem_permissao',
  'Helena (B) não cria empreendimento em A'
);

select throws_ok(
  $$select public.editar_empreendimento('e0000000-0000-4000-8000-0000000000e2', 'Tomado', null, null)$$,
  '42501', 'sem_permissao',
  'Helena (B) não edita empreendimento de A'
);

select throws_ok(
  $$select public.criar_unidade(gen_random_uuid(), 'e0000000-0000-4000-8000-0000000000e2', 'Intrusa')$$,
  '42501', 'sem_permissao',
  'Helena (B) não cria unidade em empreendimento de A'
);

select throws_ok(
  $$select public.criar_empreendimento('e0000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000b', 'Mesmo id')$$,
  'P0001', 'empreendimento_existente',
  'id de empreendimento de A não é reaproveitado em B'
);

-- Desligado perde o acesso
reset role;
update public.membro set situacao = 'desligado', desligado_em = now()
where id = 'd0000000-0000-4000-8000-0000000000a5';

select testes.autenticar_como('diego@filtroville.test');

select throws_ok(
  $$select public.criar_empreendimento(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a', 'Depois de sair')$$,
  '42501', 'sem_permissao',
  'membro desligado não cria empreendimento'
);

-- FK composta: unidade de B não aponta para empreendimento de A, nem como dono da tabela
reset role;

select throws_ok(
  $$insert into public.unidade (consultoria_id, empreendimento_id, nome)
    values ('c0000000-0000-4000-8000-00000000000b', 'e0000000-0000-4000-8000-0000000000e1', 'Cruzada')$$,
  '23503', null,
  'FK composta impede unidade de B em empreendimento de A'
);

select * from finish();

rollback;
