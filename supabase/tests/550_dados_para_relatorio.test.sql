-- Dados para o relatório (ADR-0036, fatia 2): uma leitura com consultoria, autor, empreendimento,
-- unidade, licença e condicionante. Sem a ocorrência, licença e unidade só entram quando são únicas.
-- Outra consultoria recebe sem_permissao, inclusive com o id conhecido.
begin;

select plan(8);

select testes.criar_dados_sinteticos();
select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

insert into public.empreendimento (id, consultoria_id, nome, cnpj, criado_por)
values ('e0000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
        'Metalúrgica Rio Cubatão', '11222333000181', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome, endereco)
values ('f0000000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
        'e0000000-0000-4000-8000-0000000000e1', 'Matriz', 'Rua das Indústrias, 100');

select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_instrumento('10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-0000000000f1');
select public.salvar_identificacao('10000000-0000-4000-8000-000000000001', 1, 'f0000000-0000-4000-8000-0000000000f1',
  (select id from public.tipo_instrumento where sigla = 'LAO' and consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  '4821/2023', 'IMA', null, current_setting('testes.hoje')::date - 30, null, null, 'assinatura',
  current_setting('testes.hoje')::date + 400);
select public.salvar_condicionante('30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', null, '4.1', 'Monitoramento de efluentes',
  'Apresentar relatório semestral de efluentes.', 'obrigacao');
select public.confirmar_prazo('30000000-0000-4000-8000-000000000001', 'unica', null, null,
  'corridos', null, current_setting('testes.hoje')::date + 5, 'Documento');
select public.atribuir_a_todos('10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a3');
select public.ativar_plano('10000000-0000-4000-8000-000000000001',
  (select row_version from public.instrumento where id = '10000000-0000-4000-8000-000000000001'), gen_random_uuid());

reset role;
select set_config('testes.o1', (select o.id::text from public.ocorrencia as o
  join public.condicionante_versao as v on v.id = o.condicionante_versao_id
  where v.condicionante_id = '30000000-0000-4000-8000-000000000001'), true);

-- ---------------------------------------------------------------- com a ocorrência
select testes.autenticar_como('ana@filtroville.test');

select is(
  public.dados_para_relatorio('e0000000-0000-4000-8000-0000000000e1', current_setting('testes.o1')::uuid)
    - 'hoje',
  jsonb_build_object(
    'consultoria', (select nome from public.consultoria where id = 'c0000000-0000-4000-8000-00000000000a'),
    'autor', 'Ana Ribeiro',
    'empreendimento', jsonb_build_object('nome', 'Metalúrgica Rio Cubatão', 'cliente', null,
      'cnpj', '11222333000181', 'unidade', 'Matriz', 'endereco', 'Rua das Indústrias, 100'),
    'licenca', jsonb_build_object('tipo', 'LAO', 'numero', '4821/2023', 'orgao', 'IMA',
      'emissao', null, 'validade', current_setting('testes.hoje')::date + 400),
    'condicionante', jsonb_build_object('codigo', '4.1', 'titulo', 'Monitoramento de efluentes',
      'texto', 'Apresentar relatório semestral de efluentes.',
      'prazo', current_setting('testes.hoje')::date + 5, 'responsavel', 'Bruno Tavares')),
  'a Equipe lê os dados com licença e condicionante da ocorrência'
);

select is(
  public.dados_para_relatorio('e0000000-0000-4000-8000-0000000000e1', null) ->> 'hoje',
  current_setting('testes.hoje'),
  'hoje vem no fuso da consultoria'
);

-- ---------------------------------------------------------------- só o empreendimento
select is(
  public.dados_para_relatorio('e0000000-0000-4000-8000-0000000000e1') #>> '{licenca,numero}',
  '4821/2023',
  'sem a ocorrência, a única licença ativa entra'
);

select is(
  public.dados_para_relatorio('e0000000-0000-4000-8000-0000000000e1') -> 'condicionante',
  'null'::jsonb,
  'sem a ocorrência, a condicionante fica em branco'
);

reset role;
insert into public.unidade (id, consultoria_id, empreendimento_id, nome)
values ('f0000000-0000-4000-8000-0000000000f2', 'c0000000-0000-4000-8000-00000000000a',
        'e0000000-0000-4000-8000-0000000000e1', 'Filial');
insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('e0000000-0000-4000-8000-0000000000e2', 'c0000000-0000-4000-8000-00000000000a',
        'Fazenda Boa Vista', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (consultoria_id, empreendimento_id, nome)
values ('c0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-0000000000e2', 'Sede'),
       ('c0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-0000000000e2', 'Galpão');
select testes.autenticar_como('ana@filtroville.test');

select is(
  public.dados_para_relatorio('e0000000-0000-4000-8000-0000000000e2') -> 'empreendimento' ->> 'unidade',
  null,
  'com duas unidades e nenhuma licença, a unidade fica em branco'
);

select throws_ok(
  $$select public.dados_para_relatorio('e0000000-0000-4000-8000-0000000000e2', current_setting('testes.o1')::uuid)$$,
  '42501', 'sem_permissao',
  'ocorrência de outro empreendimento é recusada'
);

-- ---------------------------------------------------------------- outra consultoria
select testes.autenticar_como('gustavo@verdesul.test');

select throws_ok(
  $$select public.dados_para_relatorio('e0000000-0000-4000-8000-0000000000e1')$$,
  '42501', 'sem_permissao',
  'outra consultoria não lê os dados do empreendimento'
);

select throws_ok(
  $$select public.dados_para_relatorio('e0000000-0000-4000-8000-0000000000e1', current_setting('testes.o1')::uuid)$$,
  '42501', 'sem_permissao',
  'outra consultoria não lê os dados da ocorrência pelo id conhecido'
);

select * from finish();
rollback;
