-- Orçamento para prospecto (ORC-02, FIN-06): nasce sem empreendimento, com nome obrigatório e
-- CNPJ, contato, e-mail e telefone opcionais; aparece na lista com o nome do prospecto; só a
-- Gestão da consultoria vê e cadastra; "Cadastrar como empreendimento" cria ou reaproveita pelo
-- CNPJ, sem duplicar, e é idempotente.
begin;

select plan(22);

select testes.criar_dados_sinteticos();

-- Empreendimento já cadastrado com CNPJ, para o caso de reaproveitar.
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_empreendimento('e0000000-0000-4000-8000-0000000000e1',
  'c0000000-0000-4000-8000-00000000000a', 'Metalúrgica Norte', null, '45997418000153');

-- ---------------------------------------------------------------------------
-- Criar para prospecto: validações
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.criar_orcamento(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a', null, 'Licença')$$,
  '22023', 'empreendimento_ou_prospecto',
  'sem empreendimento e sem prospecto é recusado'
);

select throws_ok(
  $$select public.criar_orcamento(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a', null, 'Licença',
      '{"nome": "   "}'::jsonb)$$,
  '22023', 'prospecto_sem_nome',
  'prospecto sem nome é recusado'
);

select throws_ok(
  $$select public.criar_orcamento(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a', null, 'Licença',
      '{"nome": "Padaria", "cnpj": "123"}'::jsonb)$$,
  '22023', 'cnpj_invalido',
  'CNPJ incompleto é recusado'
);

select throws_ok(
  $$select public.criar_orcamento(gen_random_uuid(), 'c0000000-0000-4000-8000-00000000000a', null, 'Licença',
      '{"nome": "Padaria", "email": "sem-arroba"}'::jsonb)$$,
  '22023', 'email_invalido',
  'e-mail sem formato é recusado'
);

select is(
  public.criar_orcamento('f0000000-0000-4000-8000-0000000000c1', 'c0000000-0000-4000-8000-00000000000a', null,
    'AUA da padaria', $json${"nome": " Padaria Pão Quente ", "cnpj": "11.222.333/0001-81",
      "contato": "Marina Couto", "email": "compras@padaria.test", "telefone": "(47) 3000-0000"}$json$::jsonb),
  'f0000000-0000-4000-8000-0000000000c1'::uuid,
  'Gestão cria orçamento para prospecto'
);

select results_eq(
  $$select empreendimento_id is null, prospecto_nome, prospecto_cnpj, prospecto_contato, prospecto_email
    from public.orcamento where id = 'f0000000-0000-4000-8000-0000000000c1'$$,
  $$values (true, 'Padaria Pão Quente', '11222333000181', 'Marina Couto', 'compras@padaria.test')$$,
  'grava o prospecto sem empreendimento, com nome aparado e CNPJ só com os 14 caracteres'
);

-- ---------------------------------------------------------------------------
-- Leitura e edição
-- ---------------------------------------------------------------------------
select results_eq(
  $$select empreendimento_id is null, empreendimento_nome
    from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a', 'padaria')$$,
  $$values (true, 'Padaria Pão Quente')$$,
  'a lista mostra o nome do prospecto e a busca encontra por ele'
);

select results_eq(
  $$select j ->> 'empreendimento_nome', j -> 'prospecto' ->> 'contato', j ->> 'empreendimento_id'
    from public.obter_orcamento('f0000000-0000-4000-8000-0000000000c1') as j$$,
  $$values ('Padaria Pão Quente', 'Marina Couto', null::text)$$,
  'o detalhe traz os dados do prospecto'
);

select is(
  public.salvar_orcamento('f0000000-0000-4000-8000-0000000000c1', 1, $json${
    "objeto": "AUA da padaria",
    "prospecto": {"nome": "Padaria Pão Quente Ltda", "cnpj": "11222333000181", "telefone": "(47) 3000-0001"}
  }$json$::jsonb),
  2,
  'salvar o rascunho atualiza o prospecto'
);

select results_eq(
  $$select prospecto_nome, prospecto_telefone, prospecto_contato
    from public.orcamento where id = 'f0000000-0000-4000-8000-0000000000c1'$$,
  $$values ('Padaria Pão Quente Ltda', '(47) 3000-0001', null::text)$$,
  'o prospecto salvo é o que veio (campo ausente fica vazio)'
);

-- ---------------------------------------------------------------------------
-- Isolamento: Equipe e outra consultoria
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select results_eq(
  $$select (select count(*) from public.orcamento where prospecto_nome is not null),
           (select count(*) from public.listar_orcamentos('c0000000-0000-4000-8000-00000000000a'))$$,
  $$values (0::bigint, 0::bigint)$$,
  'Equipe (Ana) não vê orçamento de prospecto'
);

select throws_ok(
  $$select public.cadastrar_empreendimento_do_prospecto('f0000000-0000-4000-8000-0000000000c1', gen_random_uuid())$$,
  '42501', 'sem_permissao',
  'Equipe não cadastra o prospecto como empreendimento'
);

select testes.autenticar_como('gustavo@verdesul.test');

select results_eq(
  $$select count(*) from public.orcamento where id = 'f0000000-0000-4000-8000-0000000000c1'$$,
  $$values (0::bigint)$$,
  'Gestão de outra consultoria (Gustavo) recebe zero linhas'
);

select throws_ok(
  $$select public.cadastrar_empreendimento_do_prospecto('f0000000-0000-4000-8000-0000000000c1', gen_random_uuid())$$,
  '42501', 'sem_permissao',
  'Gestão de outra consultoria não cadastra o prospecto alheio'
);

-- ---------------------------------------------------------------------------
-- Cadastrar como empreendimento
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');

select is(
  public.cadastrar_empreendimento_do_prospecto('f0000000-0000-4000-8000-0000000000c1',
    'e0000000-0000-4000-8000-0000000000e2'),
  'e0000000-0000-4000-8000-0000000000e2'::uuid,
  'CNPJ novo: cria o empreendimento com o id enviado'
);

select results_eq(
  $$select e.nome, e.cnpj, o.empreendimento_id, o.prospecto_nome, o.row_version
    from public.orcamento as o join public.empreendimento as e on e.id = o.empreendimento_id
    where o.id = 'f0000000-0000-4000-8000-0000000000c1'$$,
  $$values ('Padaria Pão Quente Ltda', '11222333000181', 'e0000000-0000-4000-8000-0000000000e2'::uuid,
            'Padaria Pão Quente Ltda', 3)$$,
  'o orçamento passa a apontar para o empreendimento e o prospecto fica como histórico'
);

select is(
  public.cadastrar_empreendimento_do_prospecto('f0000000-0000-4000-8000-0000000000c1', gen_random_uuid()),
  'e0000000-0000-4000-8000-0000000000e2'::uuid,
  'repetir devolve o mesmo empreendimento'
);

select results_eq(
  $$select count(*) from public.empreendimento where cnpj = '11222333000181'$$,
  $$values (1::bigint)$$,
  'repetir não duplica o empreendimento'
);

select lives_ok(
  $$select public.criar_orcamento('f0000000-0000-4000-8000-0000000000c2', 'c0000000-0000-4000-8000-00000000000a', null,
      'Renovação', '{"nome": "Metalúrgica do Norte", "cnpj": "45.997.418/0001-53"}'::jsonb)$$,
  'segundo prospecto, com o CNPJ de um empreendimento já cadastrado'
);

select is(
  public.cadastrar_empreendimento_do_prospecto('f0000000-0000-4000-8000-0000000000c2', gen_random_uuid()),
  'e0000000-0000-4000-8000-0000000000e1'::uuid,
  'CNPJ já cadastrado: liga ao empreendimento existente'
);

select results_eq(
  $$select count(*) from public.empreendimento where cnpj = '45997418000153'$$,
  $$values (1::bigint)$$,
  'e não cria outro com o mesmo CNPJ'
);

-- O banco exige empreendimento ou nome do prospecto, mesmo para quem escreve direto.
reset role;

select throws_ok(
  $$update public.orcamento set empreendimento_id = null, prospecto_nome = null
    where id = 'f0000000-0000-4000-8000-0000000000c2'$$,
  '23514', null,
  'orçamento sem empreendimento e sem prospecto não existe'
);

select * from finish();

rollback;
