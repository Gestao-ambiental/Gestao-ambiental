-- Recursos por plano e plano por contrato (ADR-0030): o catálogo traz os recursos de cada plano;
-- só o operador com dois fatores muda, com motivo e histórico. O plano por contrato tira a
-- consultoria do só leitura, aplica limites e recursos do plano, recusa assinar pelo app e some
-- depois da data; a barreira de escrita por recurso recusa tabela de recurso fora do plano; a
-- Gestão e outra consultoria não definem contrato.
begin;

select plan(25);

select testes.criar_dados_sinteticos();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000049', 'authenticated',
        'authenticated', 'operador49@grama.test', '', now(), '{"provider": "email", "providers": ["email"]}',
        '{"nome": "Operador Contratos"}', now(), now());
insert into private.operador_plataforma (usuario_id) values ('e1000000-0000-4000-8000-000000000049');

-- Beta no passado e a Filtroville criada há 60 dias, sem plano: teste encerrado (só leitura).
update private.configuracao_comercial set fim_do_beta = current_date - 400;
update public.consultoria set criada_em = now() - interval '60 days' where id = 'c0000000-0000-4000-8000-00000000000a';

-- Tabela de um recurso futuro, só para o teste: a barreira recebe o nome do recurso.
create table public.teste_analise_lote (consultoria_id uuid not null, nome text);
grant insert, select on public.teste_analise_lote to authenticated;
create trigger _comercial_somente_leitura before insert or update or delete on public.teste_analise_lote
  for each row execute function private.bloquear_escrita_comercial('consultoria_id', 'analise_lotes');

-- ---------------------------------------------------------------- catálogo
select testes.autenticar_como('ana@filtroville.test');
select results_eq(
  $$select codigo, recursos from public.catalogo_comercial() order by ordem$$,
  $$values ('essencial', '{}'::text[]), ('equipe', array['capacidade']),
           ('escala', array['capacidade', 'integracao_ima', 'financeiro', 'analise_lotes'])$$,
  'o catálogo traz os recursos de cada plano'
);

select testes.autenticar_com_dois_fatores('eduardo@filtroville.test');
select throws_ok(
  $$select public.central_definir_recursos_do_plano('essencial', array['financeiro'], 'Teste')$$,
  '42501', 'sem_permissao', 'Gestão não liga recurso de plano');

select testes.autenticar_com_dois_fatores('operador49@grama.test');
select throws_ok(
  $$select public.central_definir_recursos_do_plano('essencial', array['teletransporte'], 'Teste')$$,
  '22023', 'recurso_invalido', 'recurso desconhecido é recusado');
select throws_ok(
  $$select public.central_definir_recursos_do_plano('essencial', array['financeiro'], '  ')$$,
  '22023', 'motivo_obrigatorio', 'sem motivo é recusado');
select lives_ok(
  $$select public.central_definir_recursos_do_plano('essencial', array['financeiro', 'financeiro'], 'Promoção')$$,
  'operador liga o financeiro no Essencial');
select lives_ok(
  $$select public.central_definir_recursos_do_plano('essencial', array['financeiro'], 'Repetido')$$,
  'repetir a mesma lista não muda nada');
reset role;
select results_eq(
  $$select recursos from private.plano_catalogo where codigo = 'essencial'$$,
  $$values (array['financeiro'])$$,
  'lista gravada sem repetição'
);
select is(
  (select count(*)::integer from private.parametro_comercial_historico
   where alvo = 'plano:essencial' and depois ? 'recursos'),
  1,
  'uma linha de histórico (a repetição não grava)'
);

-- ---------------------------------------------------------------- plano por contrato
select is(
  (select s.situacao from private.situacao_comercial_em('c0000000-0000-4000-8000-00000000000a', current_date) as s),
  'teste_encerrado',
  'antes do contrato: teste encerrado'
);

select testes.autenticar_com_dois_fatores('eduardo@filtroville.test');
select throws_ok(
  $$select public.central_definir_plano_contrato('c0000000-0000-4000-8000-00000000000a', 'escala',
      current_date + 30, 'Contrato anual', 0)$$,
  '42501', 'sem_permissao', 'Gestão não define plano por contrato');
select testes.autenticar_com_dois_fatores('gustavo@verdesul.test');
select throws_ok(
  $$select public.central_definir_plano_contrato('c0000000-0000-4000-8000-00000000000a', 'escala',
      null, 'Invasão', 0)$$,
  '42501', 'sem_permissao', 'outra consultoria não define plano por contrato');

select testes.autenticar_com_dois_fatores('operador49@grama.test');
select throws_ok(
  $$select public.central_definir_plano_contrato('c0000000-0000-4000-8000-00000000000a', 'ouro',
      null, 'Contrato', 0)$$,
  'P0001', 'plano_inexistente', 'plano inexistente é recusado');
select throws_ok(
  $$select public.central_definir_plano_contrato('c0000000-0000-4000-8000-00000000000a', 'escala',
      current_date - 5, 'Contrato', 0)$$,
  '22023', 'data_no_passado', 'contrato que já acabou é recusado');
select is(
  public.central_definir_plano_contrato('c0000000-0000-4000-8000-00000000000a', 'escala',
    current_date + 30, 'Contrato anual fechado por fora', 0),
  1,
  'operador põe a consultoria no Escala por contrato'
);
select results_eq(
  $$select situacao, plano_contrato from public.central_plano_da_consultoria('c0000000-0000-4000-8000-00000000000a')$$,
  $$values ('contrato', 'escala')$$,
  'a central vê a situação e o plano do contrato'
);
select is(
  (select r.por_contrato from public.central_resumo_financeiro() as r),
  1,
  'o Financeiro conta a consultoria por contrato'
);

reset role;
select results_eq(
  $$select s.somente_leitura, s.plano_vigente, s.limite_pessoas, s.orcamentos_liberados
    from private.situacao_comercial_em('c0000000-0000-4000-8000-00000000000a', current_date) as s$$,
  $$values (false, 'escala', 25, true)$$,
  'com contrato: sem só leitura, com limites e orçamentos do plano'
);

select testes.autenticar_como('eduardo@filtroville.test');
select lives_ok(
  $$insert into public.teste_analise_lote values ('c0000000-0000-4000-8000-00000000000a', 'Lote 1')$$,
  'Escala libera a análise de lotes'
);
select throws_ok(
  $$select public.assinar_plano_simulado('c0000000-0000-4000-8000-00000000000a', 'equipe', 'mensal', 'pix')$$,
  'P0001', 'plano_por_contrato', 'com contrato, a Gestão não assina pelo app'
);

-- Equipe por contrato: análise de lotes fica de fora do plano.
select testes.autenticar_com_dois_fatores('operador49@grama.test');
select is(
  public.central_definir_plano_contrato('c0000000-0000-4000-8000-00000000000a', 'equipe', null,
    'Renegociado para o Equipe', 1),
  2,
  'contrato muda para o Equipe, sem prazo'
);
select testes.autenticar_como('eduardo@filtroville.test');
select throws_ok(
  $$insert into public.teste_analise_lote values ('c0000000-0000-4000-8000-00000000000a', 'Lote 2')$$,
  '42501', 'recurso_fora_do_plano', 'recurso fora do plano é recusado na escrita'
);

-- Contrato vencido: voltam as regras de sempre.
reset role;
update public.consultoria_condicao_comercial
set contrato_ate = current_date - 1
where consultoria_id = 'c0000000-0000-4000-8000-00000000000a';
select is(
  (select s.situacao from private.situacao_comercial_em('c0000000-0000-4000-8000-00000000000a', current_date) as s),
  'teste_encerrado',
  'depois da data do contrato, volta a ser teste encerrado'
);

-- Encerrar pela central grava o histórico.
select testes.autenticar_com_dois_fatores('operador49@grama.test');
select lives_ok(
  $$select public.central_definir_plano_contrato('c0000000-0000-4000-8000-00000000000a', null, null,
      'Contrato encerrado', 2)$$,
  'operador encerra o contrato'
);
reset role;
select results_eq(
  $$select valor_novo from public.condicao_comercial_historico
    where consultoria_id = 'c0000000-0000-4000-8000-00000000000a' and tipo = 'plano_contrato'
    order by alterada_em, valor_novo$$,
  $$values ('equipe sem prazo'), ('escala até ' || (current_date + 30)::text), ('sem contrato')$$,
  'o histórico guarda cada mudança do contrato'
);
select is(
  (select plano_contrato from public.consultoria_condicao_comercial
   where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  null,
  'sem contrato gravado'
);

select * from finish();
rollback;
