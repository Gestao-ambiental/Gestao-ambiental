-- Profissão e cargo do membro (ADR-0021): na equipe do orçamento, a profissão vem do membro quando
-- definida; sem ela, fica o texto da linha (bases antigas). O cargo antigo fica guardado.
begin;

select plan(7);

select testes.criar_dados_sinteticos();

reset role;
update public.membro set cargo_antigo = 'Analista ambiental'
where id = 'd0000000-0000-4000-8000-0000000000a2';

select is(
  (select cargo_antigo from public.membro where id = 'd0000000-0000-4000-8000-0000000000a2'),
  'Analista ambiental',
  'o cargo digitado antes continua guardado em cargo_antigo'
);

select is(private.rotulo_da_profissao('eng_ambiental_sanitarista'), 'Engenheiro ambiental e sanitarista',
  'rótulo da profissão igual ao do domínio');

select testes.autenticar_como('eduardo@filtroville.test');
select public.definir_profissao_e_cargo('d0000000-0000-4000-8000-0000000000a1', 'eng_ambiental', 'diretor');

-- Eduardo tem profissão no membro; Ana não (fica o texto da linha, como antes).
select lives_ok(
  $$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      null, 0, null, 3000, 2500, 0, 0, 0, 0, $json$[
      {"id": "40000000-0000-4000-8000-0000000030a1", "membro_id": "d0000000-0000-4000-8000-0000000000a1",
       "socio": false, "profissao": "Eng Ambiental", "tipo_recebimento": "clt",
       "custo_mensal_centavos": 1000000, "horas_disponiveis_mes": 160},
      {"id": "40000000-0000-4000-8000-0000000030a2", "membro_id": "d0000000-0000-4000-8000-0000000000a2",
       "socio": false, "profissao": "Bióloga", "tipo_recebimento": "clt",
       "custo_mensal_centavos": 500000, "horas_disponiveis_mes": 100}
    ]$json$::jsonb)$$,
  'salva a base pela função de sempre'
);

select is(
  (select array_agg(profissao order by ordem) from public.orcamento_base_equipe
   where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  array['Engenheiro ambiental', 'Bióloga'],
  'com profissão no membro, vale a da lista; sem ela, fica o texto da linha'
);

select is(
  (select custo_hora_profissao from public.orcamento_base_custos
   where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'),
  '[{"profissao": "Bióloga", "hora_tecnica_centavos": 5000},
    {"profissao": "Engenheiro ambiental", "hora_tecnica_centavos": 6250}]'::jsonb,
  'o custo por profissão usa a profissão do membro'
);

select throws_ok(
  $$select private.salvar_base_de_custos_completa('c0000000-0000-4000-8000-00000000000a',
      1, 0, 1, 3000, 2500, 0, 0, 0, 0)$$,
  '42501', null,
  'a função completa não é chamada direto por quem está logado'
);

select testes.autenticar_como('ana@filtroville.test');
select throws_ok(
  $$select public.salvar_base_de_custos('c0000000-0000-4000-8000-00000000000a',
      1, 0, 1, 3000, 2500, 0, 0, 0, 0)$$,
  '42501', 'sem_permissao',
  'Equipe continua sem salvar a base'
);

select * from finish();
rollback;
