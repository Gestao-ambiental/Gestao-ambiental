-- Formação em curso (ADR-0021 §8): o estagiário marca "Ainda estou cursando"; o vínculo guarda,
-- a própria pessoa ou a Gestão trocam, e o cadastro da conta já leva o campo.
begin;

select plan(10);

select testes.criar_dados_sinteticos();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000041', 'authenticated',
   'authenticated', 'estagiaria@exemplo.test', '', now(), '{"provider": "email"}',
   '{"nome": "Bia Estagiária", "profissao": "eng_ambiental", "profissao_em_curso": true, "genero": "feminino"}',
   now(), now());

select testes.convidar_para_o_beta('estagiaria@exemplo.test');
select testes.autenticar_como('estagiaria@exemplo.test');
select public.abrir_consultoria('c0000000-0000-4000-8000-0000000000f5', 'Consultoria da Bia', '12345678000195');
reset role;
select results_eq(
  $$select profissao::text, profissao_em_curso, genero::text from public.membro
    where usuario_id = 'e0000000-0000-4000-8000-000000000041'$$,
  $$values ('eng_ambiental', true, 'feminino')$$,
  'o cadastro da conta leva a formação em curso para o vínculo'
);

select testes.autenticar_como('ana@filtroville.test');
select lives_ok(
  $$select public.completar_cadastro('biologo', 'feminino', true)$$,
  'completar o cadastro marcando "ainda estou cursando"'
);
reset role;
select is(
  (select profissao_em_curso from public.membro where id = 'd0000000-0000-4000-8000-0000000000a2'),
  true,
  'em curso gravado'
);

select testes.autenticar_como('eduardo@filtroville.test');
select lives_ok(
  $$select public.definir_profissao_e_cargo('d0000000-0000-4000-8000-0000000000a2',
      'biologo', 'estagiario', null, false)$$,
  'a Gestão marca que a pessoa se formou'
);
select lives_ok(
  $$select public.definir_profissao_e_cargo('d0000000-0000-4000-8000-0000000000a2',
      'biologo', 'estagiario')$$,
  'sem o campo, "em curso" fica como está'
);
reset role;
select is(
  (select profissao_em_curso from public.membro where id = 'd0000000-0000-4000-8000-0000000000a2'),
  false,
  'formada'
);

-- Custo por profissão: quem cursa fica num grupo à parte dos formados.
select testes.autenticar_como('eduardo@filtroville.test');
select public.definir_profissao_e_cargo('d0000000-0000-4000-8000-0000000000a1', 'eng_ambiental', 'diretor');
select public.definir_profissao_e_cargo('d0000000-0000-4000-8000-0000000000a2',
  'eng_ambiental', 'estagiario', null, true);
select lives_ok(
  $$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      null, 0, null, 3000, 2500, 0, 0, 0, 0, $json$[
      {"id": "40000000-0000-4000-8000-0000000033a1", "membro_id": "d0000000-0000-4000-8000-0000000000a1",
       "socio": false, "profissao": "", "tipo_recebimento": "clt",
       "custo_mensal_centavos": 1000000, "horas_disponiveis_mes": 160},
      {"id": "40000000-0000-4000-8000-0000000033a2", "membro_id": "d0000000-0000-4000-8000-0000000000a2",
       "socio": false, "profissao": "", "tipo_recebimento": "estagio",
       "custo_mensal_centavos": 150000, "horas_disponiveis_mes": 120}
    ]$json$::jsonb)$$,
  'salva a base com um formado e uma estagiária da mesma área'
);
reset role;
select is(
  (select custo_hora_profissao from public.orcamento_base_custos
   where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  '[{"profissao": "Engenheiro ambiental", "hora_tecnica_centavos": 6250},
    {"profissao": "Estudante de engenharia ambiental", "hora_tecnica_centavos": 1250}]'::jsonb,
  'a estagiária não baixa a hora do engenheiro: grupo próprio "Estudante de …"'
);
select is(
  private.rotulo_do_curso('biologo'), 'Estudante de ciências biológicas',
  'nome do curso igual ao do domínio'
);

-- Teste negativo: Gestão de outra consultoria não muda.
select testes.autenticar_como('helena@verdesul.test');
select throws_ok(
  $$select public.definir_profissao_e_cargo('d0000000-0000-4000-8000-0000000000a2',
      'biologo', null, null, true)$$,
  '42501', 'sem_permissao',
  'outra consultoria não marca formação em curso'
);

select * from finish();
rollback;
