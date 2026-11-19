-- Extração por IA: plano e cota. Plano sem IA (Essencial) e consultoria em só leitura não iniciam
-- extração; a cota (porte do PR #24) é reservada só pela service role, uma vez por extração, e conta
-- mesmo quando os itens são descartados ou o provedor falha: descartar tudo e extrair de novo não
-- abre chamada paga nova além do limite. Uma reserva de mais de 24 horas não ocupa a cota.
begin;

select plan(15);

select testes.criar_dados_sinteticos();

-- Beta no passado e a Filtroville criada há 60 dias; o plano vem do contrato (Equipe tem IA).
update private.configuracao_comercial set fim_do_beta = current_date - 400;
update public.consultoria set criada_em = now() - interval '60 days' where id = 'c0000000-0000-4000-8000-00000000000a';
insert into public.consultoria_condicao_comercial (consultoria_id, plano_contrato)
values ('c0000000-0000-4000-8000-00000000000a', 'equipe')
on conflict (consultoria_id) do update set plano_contrato = excluded.plano_contrato, contrato_ate = null;

insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('e0000000-0000-4000-8000-000000000620', 'c0000000-0000-4000-8000-00000000000a',
        'Fundição Itaum', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome)
values ('f0000000-0000-4000-8000-000000000620', 'c0000000-0000-4000-8000-00000000000a',
        'e0000000-0000-4000-8000-000000000620', 'Matriz');

select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_instrumento('10000000-0000-4000-8000-000000000620', 'f0000000-0000-4000-8000-000000000620');
reset role;

insert into public.documento (id, consultoria_id, entidade)
values ('20000000-0000-4000-8000-000000000620', 'c0000000-0000-4000-8000-00000000000a', 'instrumento');
insert into public.documento_versao (id, consultoria_id, documento_id, numero, caminho, nome_original, mime,
                                     tamanho_bytes, sha256, autor_id)
values ('21000000-0000-4000-8000-000000000620', 'c0000000-0000-4000-8000-00000000000a',
        '20000000-0000-4000-8000-000000000620', 1,
        'c0000000-0000-4000-8000-00000000000a/instrumento/21000000-0000-4000-8000-000000000620.pdf',
        'LAO.pdf', 'application/pdf', 1258291, repeat('a', 64), 'd0000000-0000-4000-8000-0000000000a1');
update public.documento set versao_vigente_id = '21000000-0000-4000-8000-000000000620'
where id = '20000000-0000-4000-8000-000000000620';
update public.instrumento set documento_id = '20000000-0000-4000-8000-000000000620'
where id = '10000000-0000-4000-8000-000000000620';

-- ---------------------------------------------------------------------------
-- Plano
-- ---------------------------------------------------------------------------
update public.consultoria_condicao_comercial set plano_contrato = 'essencial'
where consultoria_id = 'c0000000-0000-4000-8000-00000000000a';
select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select * from public.iniciar_extracao_ia('30000000-0000-4000-8000-000000000621', '10000000-0000-4000-8000-000000000620')$$,
  '42501', 'ia_fora_do_plano',
  'plano sem IA (Essencial) não inicia extração'
);
select is(
  (select count(*) from public.extracao_ia),
  0::bigint,
  'a recusa do plano não deixa extração registrada'
);

reset role;
update public.consultoria_condicao_comercial set plano_contrato = null
where consultoria_id = 'c0000000-0000-4000-8000-00000000000a';
select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select * from public.iniciar_extracao_ia('30000000-0000-4000-8000-000000000621', '10000000-0000-4000-8000-000000000620')$$,
  '42501', 'consultoria_somente_leitura',
  'teste encerrado (só leitura) não inicia extração, com o motivo próprio'
);

reset role;
update public.consultoria_condicao_comercial set plano_contrato = 'equipe'
where consultoria_id = 'c0000000-0000-4000-8000-00000000000a';
select testes.autenticar_como('eduardo@filtroville.test');

select results_eq(
  $$select nova, situacao
    from public.iniciar_extracao_ia('30000000-0000-4000-8000-000000000621', '10000000-0000-4000-8000-000000000620')$$,
  $$values (true, 'em_andamento')$$,
  'plano com IA (Equipe) inicia a extração'
);

-- ---------------------------------------------------------------------------
-- Cota
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.reservar_extracao_ia('30000000-0000-4000-8000-000000000621')$$,
  '42501', 'permission denied for function reservar_extracao_ia',
  'o JWT do usuário não reserva cota de IA diretamente'
);

reset role;
update private.limite_extracao_ia set por_conta = 1;
set local role service_role;

select is(
  public.reservar_extracao_ia('30000000-0000-4000-8000-000000000621'), true,
  'a função reserva a chamada paga da primeira extração'
);
select is(
  public.reservar_extracao_ia('30000000-0000-4000-8000-000000000621'), false,
  'repetir a reserva da mesma extração nunca autoriza nova chamada'
);
select is(
  public.concluir_extracao_ia('30000000-0000-4000-8000-000000000621',
    '{"identificacao": {}, "condicionantes": [
       {"codigo": "1", "titulo": "Relatório semestral", "texto_literal": "Apresentar relatório.", "natureza": "obrigacao"},
       {"codigo": "2", "titulo": "Manter licença", "texto_literal": "Manter cópia.", "natureza": "condicao_continua"}]}',
    'openai/gpt-4.1-mini', 'licenca-v1', 100, 50, 10, 3, 1000),
  2,
  'a primeira extração propõe 2 condicionantes'
);

-- Descartar tudo e extrair de novo: o banco aceita iniciar, mas a cota já foi usada.
reset role;
select testes.autenticar_como('eduardo@filtroville.test');
select public.revisar_condicionante(c.id, 'descartada')
from public.condicionante as c where c.instrumento_id = '10000000-0000-4000-8000-000000000620';

select lives_ok(
  $$select * from public.iniciar_extracao_ia('30000000-0000-4000-8000-000000000622', '10000000-0000-4000-8000-000000000620')$$,
  'com todos os itens descartados, dá para iniciar outra extração'
);

reset role;
set local role service_role;
select is(
  public.reservar_extracao_ia('30000000-0000-4000-8000-000000000622'), false,
  'descartar e extrair de novo conta na cota: sem nova chamada paga'
);
select lives_ok(
  $$select public.falhar_extracao_ia('30000000-0000-4000-8000-000000000622', 'limite_atingido', 'openai/gpt-4.1-mini',
      'licenca-v1', null, null, null, 3, 10, null)$$,
  'a falha por limite é registrada'
);
reset role;
select results_eq(
  $$select situacao, motivo from public.extracao_ia where id = '30000000-0000-4000-8000-000000000622'$$,
  $$values ('falhou', 'limite_atingido')$$,
  'a extração fica como falha por limite atingido'
);

-- Falha do provedor depois da reserva também conta: tentar de novo na hora não abre chamada nova.
update private.limite_extracao_ia set por_conta = 2;
select testes.autenticar_como('eduardo@filtroville.test');
select * from public.iniciar_extracao_ia('30000000-0000-4000-8000-000000000623', '10000000-0000-4000-8000-000000000620');
reset role;
set local role service_role;
select is(
  public.reservar_extracao_ia('30000000-0000-4000-8000-000000000623'), true,
  'com saldo, a nova extração reserva a chamada'
);
select public.falhar_extracao_ia('30000000-0000-4000-8000-000000000623', 'provedor_indisponivel',
  'openai/gpt-4.1-mini', 'licenca-v1', null, null, null, 3, 10, 'HTTP 503');
reset role;

select testes.autenticar_como('eduardo@filtroville.test');
select * from public.iniciar_extracao_ia('30000000-0000-4000-8000-000000000624', '10000000-0000-4000-8000-000000000620');
reset role;
set local role service_role;
select is(
  public.reservar_extracao_ia('30000000-0000-4000-8000-000000000624'), false,
  'a falha do provedor ocupou a cota: repetir na hora não chama a IA'
);
reset role;

update private.reserva_extracao_ia set reservada_em = now() - interval '25 hours';
set local role service_role;
select is(
  public.reservar_extracao_ia('30000000-0000-4000-8000-000000000624'), true,
  'reservas de mais de 24 horas não ocupam a cota da janela atual'
);
reset role;

select * from finish();
rollback;
