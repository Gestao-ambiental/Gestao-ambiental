-- Registro profissional do membro: só para profissão concluída da própria pessoa; a pessoa informa
-- e a Gestão confirma; mudar o registro desfaz a confirmação; tirar a profissão tira o registro;
-- remover é lógico; Cadastro Técnico Federal no vínculo; nada atravessa consultorias e ninguém
-- escreve direto na tabela.
begin;

select plan(28);

select testes.criar_dados_sinteticos();

-- Registro em vigor de um membro numa profissão, lido sem RLS (o teste troca de usuário no meio).
create function testes.registro(membro uuid, codigo text)
returns public.registro_profissional
language sql
stable
security definer
set search_path = ''
as $$
  select r.* from public.registro_profissional as r
  where r.membro_id = membro and r.profissao = codigo and r.removido_em is null
$$;

-- ---------------------------------------------------------------------------
-- A pessoa informa o registro da própria profissão
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select lives_ok(
  $$select public.definir_profissao_e_cargo('d0000000-0000-4000-8000-0000000000a2', 'biologo', null,
      array['eng_ambiental'], false)$$,
  'Ana é bióloga e engenheira ambiental'
);

select lives_ok(
  $$select public.declarar_registro_profissional('d0000000-0000-4000-8000-0000000000a2', 'biologo',
      'crbio', ' 12345 ', 'sc', '2027-03-31')$$,
  'Equipe (Ana) informa o próprio registro no CRBio'
);

select results_eq(
  $$select (r).conselho::text, (r).numero, (r).uf, (r).valido_ate, (r).confirmado_em is null, (r).row_version
    from (select testes.registro('d0000000-0000-4000-8000-0000000000a2', 'biologo') as r) as x$$,
  $$values ('crbio'::text, '12345'::text, 'SC'::text, '2027-03-31'::date, true, 1)$$,
  'número sem espaços, UF em maiúsculas, aguardando a Gestão'
);

select is(
  public.declarar_registro_profissional('d0000000-0000-4000-8000-0000000000a2', 'biologo', 'crbio',
    '12345', 'SC', '2027-03-31'),
  (testes.registro('d0000000-0000-4000-8000-0000000000a2', 'biologo')).id,
  'repetir devolve a mesma linha'
);

select is(
  (select count(*) from public.registro_profissional where membro_id = 'd0000000-0000-4000-8000-0000000000a2'),
  1::bigint,
  'repetir não duplica'
);

select throws_ok(
  $$select public.declarar_registro_profissional('d0000000-0000-4000-8000-0000000000a2', 'quimico',
      'crq', '1', 'SC', null)$$,
  '22023', 'profissao_fora_do_perfil',
  'registro de profissão que a pessoa não tem é recusado'
);

select throws_ok(
  $$select public.declarar_registro_profissional('d0000000-0000-4000-8000-0000000000a3', 'biologo',
      'crbio', '1', 'SC', null)$$,
  '42501', 'sem_permissao',
  'Equipe (Ana) não informa registro de outra pessoa (Bruno)'
);

select throws_ok(
  $$select public.declarar_registro_profissional('d0000000-0000-4000-8000-0000000000a2', 'eng_ambiental',
      'crea', '1', 'XX', null)$$,
  '22023', 'uf_invalida',
  'UF que não existe é recusada'
);

select throws_ok(
  $$select public.declarar_registro_profissional('d0000000-0000-4000-8000-0000000000a2', 'eng_ambiental',
      'crx', '1', 'SC', null)$$,
  '22023', 'conselho_invalido',
  'conselho fora da lista é recusado'
);

select throws_ok(
  $$select public.declarar_registro_profissional('d0000000-0000-4000-8000-0000000000a2', 'eng_ambiental',
      'crea', '   ', 'SC', null)$$,
  '22023', 'numero_do_registro_obrigatorio',
  'registro sem número é recusado'
);

select throws_ok(
  $$select public.confirmar_registro_profissional(
      (testes.registro('d0000000-0000-4000-8000-0000000000a2', 'biologo')).id, 1)$$,
  '42501', 'sem_permissao',
  'Equipe não confirma registro, nem o próprio'
);

select throws_ok(
  $$insert into public.registro_profissional (consultoria_id, membro_id, profissao, conselho, numero, declarado_por)
    values ('c0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000000a2', 'eng_ambiental',
            'crea', '1', 'd0000000-0000-4000-8000-0000000000a2')$$,
  '42501', null,
  'ninguém grava registro direto pela API'
);

-- ---------------------------------------------------------------------------
-- A Gestão confirma; mudar o registro desfaz a confirmação
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.confirmar_registro_profissional(
      (testes.registro('d0000000-0000-4000-8000-0000000000a2', 'biologo')).id, 9)$$,
  'P0001', 'conflito_de_versao',
  'confirmar com versão antiga é recusado'
);

select is(
  public.confirmar_registro_profissional((testes.registro('d0000000-0000-4000-8000-0000000000a2', 'biologo')).id, 1),
  2,
  'Gestão (Eduardo) confirma o registro de Ana'
);

select is(
  (testes.registro('d0000000-0000-4000-8000-0000000000a2', 'biologo')).confirmado_por,
  'd0000000-0000-4000-8000-0000000000a1'::uuid,
  'a confirmação guarda quem confirmou'
);

select testes.autenticar_como('ana@filtroville.test');

select lives_ok(
  $$select public.declarar_registro_profissional('d0000000-0000-4000-8000-0000000000a2', 'biologo',
      'crbio', '12345', 'SC', '2029-03-31')$$,
  'Ana renova a validade do registro'
);

select results_eq(
  $$select (r).confirmado_em is null, (r).row_version
    from (select testes.registro('d0000000-0000-4000-8000-0000000000a2', 'biologo') as r) as x$$,
  $$values (true, 3)$$,
  'mudar o registro desfaz a confirmação'
);

select testes.autenticar_como('eduardo@filtroville.test');

select public.definir_profissao_e_cargo('d0000000-0000-4000-8000-0000000000a3', 'eng_ambiental', null,
  array[]::text[], false);

select lives_ok(
  $$select public.declarar_registro_profissional('d0000000-0000-4000-8000-0000000000a3', 'eng_ambiental',
      'crea', '98765', 'SC', null)$$,
  'Gestão informa o registro de Bruno'
);

select is(
  (testes.registro('d0000000-0000-4000-8000-0000000000a3', 'eng_ambiental')).confirmado_por,
  'd0000000-0000-4000-8000-0000000000a1'::uuid,
  'o que a Gestão informa já entra confirmado'
);

select public.definir_profissao_e_cargo('d0000000-0000-4000-8000-0000000000a4', 'biologo', 'estagiario',
  array[]::text[], true);

select throws_ok(
  $$select public.declarar_registro_profissional('d0000000-0000-4000-8000-0000000000a4', 'biologo',
      'crbio', '1', 'SC', null)$$,
  '22023', 'profissao_fora_do_perfil',
  'profissão em curso não tem registro'
);

-- ---------------------------------------------------------------------------
-- Isolamento entre consultorias
-- ---------------------------------------------------------------------------
select testes.autenticar_como('gustavo@verdesul.test');

select is(
  (select count(*) from public.registro_profissional where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  0::bigint,
  'usuário de outra consultoria vê zero registros de A'
);

select throws_ok(
  $$select public.confirmar_registro_profissional(
      (testes.registro('d0000000-0000-4000-8000-0000000000a2', 'biologo')).id, 3)$$,
  '42501', 'sem_permissao',
  'Gestão de outra consultoria (Gustavo) não confirma registro de A, mesmo sabendo o id'
);

-- ---------------------------------------------------------------------------
-- Tirar a profissão tira o registro; remover é lógico e permite informar de novo
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select public.declarar_registro_profissional('d0000000-0000-4000-8000-0000000000a2', 'eng_ambiental',
  'crea', '55555', 'SC', null);
select public.definir_profissao_e_cargo('d0000000-0000-4000-8000-0000000000a2', 'biologo', null,
  array[]::text[], false);

select is(
  (select count(*) from public.registro_profissional
   where membro_id = 'd0000000-0000-4000-8000-0000000000a2' and profissao = 'eng_ambiental'
     and removido_em is not null and removido_por = 'd0000000-0000-4000-8000-0000000000a2'),
  1::bigint,
  'tirar a engenharia ambiental do perfil tira o registro do Crea, que fica no histórico'
);

select lives_ok(
  $$select public.remover_registro_profissional(
      (testes.registro('d0000000-0000-4000-8000-0000000000a2', 'biologo')).id, 3)$$,
  'Ana remove o próprio registro'
);

select lives_ok(
  $$select public.declarar_registro_profissional('d0000000-0000-4000-8000-0000000000a2', 'biologo',
      'crbio', '12345', 'SC', null)$$,
  'depois de remover, o registro pode ser informado de novo'
);

-- ---------------------------------------------------------------------------
-- Cadastro Técnico Federal
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select public.definir_cadastro_federal('d0000000-0000-4000-8000-0000000000a2', ' 1234567 ', '2027-06-30')$$,
  'Ana informa o próprio Cadastro Técnico Federal'
);

select throws_ok(
  $$select public.definir_cadastro_federal('d0000000-0000-4000-8000-0000000000a2', 'CTF-12', null)$$,
  '22023', 'ctf_invalido',
  'Cadastro Técnico Federal só com dígitos'
);

reset role;

select results_eq(
  $$select ctf_numero, ctf_valido_ate,
           (select count(*) from public.auditoria where entidade = 'registro_profissional')
    from public.membro where id = 'd0000000-0000-4000-8000-0000000000a2'$$,
  $$values ('1234567'::text, '2027-06-30'::date, 8::bigint)$$,
  'cadastro gravado sem espaços; cada mudança de registro fica na auditoria'
);

select * from finish();
rollback;
