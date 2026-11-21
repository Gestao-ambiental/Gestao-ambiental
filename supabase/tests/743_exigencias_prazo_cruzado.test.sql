-- Exigências do órgão (P3, ADR-0045): teste cruzado do prazo do ofício. A mesma tabela de casos
-- está em packages/domain/src/exigencia.test.ts (prazoDaExigencia). Se o domínio e o banco
-- divergirem, um dos dois quebra. O prazo conta do dia seguinte ao recebimento; em dias corridos
-- não é empurrado para dia útil; em dias úteis pula fim de semana e feriado nacional.
begin;

set local timezone to 'America/Sao_Paulo';

select plan(14);

select results_eq(
  $$select private.prazo_da_exigencia(c.recebido, c.dias, c.contagem::public.contagem_prazo)
    from (values
      (1, date '2026-11-18', 5, 'corridos'),
      (2, date '2026-11-18', 3, 'corridos'),
      (3, date '2026-11-18', 2, 'uteis'),
      (4, date '2026-11-13', 1, 'uteis'),
      (5, date '2026-12-23', 3, 'uteis'),
      (6, date '2026-12-30', 5, 'uteis'),
      (7, date '2027-03-24', 2, 'uteis'),
      (8, date '2027-03-16', 10, 'corridos'),
      (9, date '2026-01-01', 365, 'corridos')
    ) as c (ordem, recebido, dias, contagem)
    order by c.ordem$$,
  $$values (date '2026-11-23'), (date '2026-11-21'), (date '2026-11-23'), (date '2026-11-16'), (date '2026-12-29'),
           (date '2027-01-07'), (date '2027-03-29'), (date '2027-03-26'), (date '2027-01-01')$$,
  'a tabela de casos cruzados bate com o domínio'
);

select is(private.prazo_da_exigencia('2026-11-18', 5, 'corridos'), date '2026-11-23',
  '18/11 + 5 corridos = 23/11');
select is(private.prazo_da_exigencia('2026-11-18', 3, 'corridos'), date '2026-11-21',
  '18/11 + 3 corridos = 21/11 (sábado; corridos não empurra)');
select is(private.prazo_da_exigencia('2026-11-18', 2, 'uteis'), date '2026-11-23',
  '18/11 + 2 úteis = 23/11 (20/11 é feriado)');
select is(private.prazo_da_exigencia('2026-11-13', 1, 'uteis'), date '2026-11-16',
  '13/11 (sexta) + 1 útil = 16/11 (segunda)');
select is(private.prazo_da_exigencia('2026-12-23', 3, 'uteis'), date '2026-12-29',
  '23/12 + 3 úteis = 29/12 (25/12 é feriado)');
select is(private.prazo_da_exigencia('2026-12-30', 5, 'uteis'), date '2027-01-07',
  '30/12 + 5 úteis = 07/01 (1º/01 é feriado)');
select is(private.prazo_da_exigencia('2027-03-24', 2, 'uteis'), date '2027-03-29',
  '24/03/2027 + 2 úteis = 29/03 (Sexta-feira Santa 26/03)');
select is(private.prazo_da_exigencia('2027-03-16', 10, 'corridos'), date '2027-03-26',
  '16/03/2027 + 10 corridos = 26/03 (cai no feriado e não é empurrado)');
select is(private.prazo_da_exigencia('2026-01-01', 365, 'corridos'), date '2027-01-01',
  '01/01/2026 + 365 corridos = 01/01/2027');

-- ---------------------------------------------------------------------------
-- O registro aceita o prazo certo e recusa o errado ou fora do limite
-- ---------------------------------------------------------------------------
select testes.criar_dados_sinteticos();

select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_empreendimento('74300000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
  'Olaria São Bento');
select public.criar_unidade('74300000-0000-4000-8000-0000000000f1', '74300000-0000-4000-8000-0000000000e1',
  'Pátio');

select lives_ok(
  $$select public.registrar_exigencia(p_id => '74300000-0000-4000-8000-0000000000a1',
      p_unidade_id => '74300000-0000-4000-8000-0000000000f1', p_assunto => 'Prazo em dias úteis',
      p_recebido_em => '2026-11-18', p_prazo_oficial => '2026-11-23', p_meta_interna => '2026-11-23',
      p_prazo_dias => 2, p_prazo_contagem => 'uteis')$$,
  'o registro aceita o prazo calculado pelo domínio (2 úteis depois de 18/11 = 23/11)'
);

select throws_ok(
  $$select public.registrar_exigencia(p_id => gen_random_uuid(),
      p_unidade_id => '74300000-0000-4000-8000-0000000000f1', p_assunto => 'Prazo contando o feriado',
      p_recebido_em => '2026-11-18', p_prazo_oficial => '2026-11-20', p_meta_interna => '2026-11-19',
      p_prazo_dias => 2, p_prazo_contagem => 'uteis')$$,
  '22023', 'prazo_divergente',
  'o registro recusa um prazo que conta o feriado como útil'
);

select throws_ok(
  $$select public.registrar_exigencia(p_id => gen_random_uuid(),
      p_unidade_id => '74300000-0000-4000-8000-0000000000f1', p_assunto => 'Corridos empurrado',
      p_recebido_em => '2026-11-18', p_prazo_oficial => '2026-11-23', p_meta_interna => '2026-11-19',
      p_prazo_dias => 3, p_prazo_contagem => 'corridos')$$,
  '22023', 'prazo_divergente',
  'o registro recusa prazo em corridos empurrado para o dia útil seguinte'
);

select throws_ok(
  $$select public.registrar_exigencia(p_id => gen_random_uuid(),
      p_unidade_id => '74300000-0000-4000-8000-0000000000f1', p_assunto => 'Mais de um ano',
      p_recebido_em => '2026-01-01', p_prazo_oficial => '2027-01-02', p_meta_interna => '2026-12-31',
      p_prazo_dias => 366, p_prazo_contagem => 'corridos')$$,
  '22023', 'prazo_invalido',
  '366 dias é recusado (o domínio também lança erro)'
);

select * from finish();

rollback;
