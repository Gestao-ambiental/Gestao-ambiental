-- Minha semana: a pessoa vê os próprios prazos de todas as consultorias em que é membro ativo,
-- nada de uma consultoria em que não é membro, e nada depois de desligada.
begin;

select plan(12);

select testes.criar_dados_sinteticos();

-- Terceira consultoria (C): o Gustavo é Gestão nela; o Bruno não é membro.
insert into public.consultoria (id, nome, fuso)
values ('c0000000-0000-4000-8000-00000000000c', 'Mata Nativa Consultoria', 'America/Sao_Paulo');
insert into public.membro (id, consultoria_id, usuario_id, papel) values
  ('d0000000-0000-4000-8000-0000000000c1', 'c0000000-0000-4000-8000-00000000000c',
   'b0000000-0000-4000-8000-000000000001', 'gestao'),
  -- O Bruno (a3 na Filtroville) também é Equipe na Verde Sul.
  ('d0000000-0000-4000-8000-0000000000b3', 'c0000000-0000-4000-8000-00000000000b',
   'a0000000-0000-4000-8000-000000000003', 'equipe');

select set_config('testes.hoje',
  private.hoje_da_consultoria('c0000000-0000-4000-8000-00000000000a')::text, true);

insert into public.empreendimento (id, consultoria_id, nome, criado_por) values
  ('e0000000-0000-4000-8000-0000000007a1', 'c0000000-0000-4000-8000-00000000000a',
   'Metalúrgica Rio Cubatão', 'd0000000-0000-4000-8000-0000000000a1'),
  ('e0000000-0000-4000-8000-0000000007b1', 'c0000000-0000-4000-8000-00000000000b',
   'Cerâmica Vale do Itajaí', 'd0000000-0000-4000-8000-0000000000b1'),
  ('e0000000-0000-4000-8000-0000000007c1', 'c0000000-0000-4000-8000-00000000000c',
   'Frigorífico Serra Alta', 'd0000000-0000-4000-8000-0000000000c1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome) values
  ('f0000000-0000-4000-8000-0000000007a1', 'c0000000-0000-4000-8000-00000000000a',
   'e0000000-0000-4000-8000-0000000007a1', 'Matriz'),
  ('f0000000-0000-4000-8000-0000000007b1', 'c0000000-0000-4000-8000-00000000000b',
   'e0000000-0000-4000-8000-0000000007b1', 'Fábrica'),
  ('f0000000-0000-4000-8000-0000000007c1', 'c0000000-0000-4000-8000-00000000000c',
   'e0000000-0000-4000-8000-0000000007c1', 'Abatedouro');

-- Uma licença com uma condicionante de prazo único, atribuída a um membro. Roda como a Gestão.
create function pg_temp.licenca_com_prazo(
  cid uuid, inst uuid, cond uuid, uni uuid, numero text, dias integer, responsavel uuid
)
returns void
language plpgsql
as $$
begin
  perform public.criar_instrumento(inst, uni);
  perform public.salvar_identificacao(inst, 1, uni,
    (select t.id from public.tipo_instrumento as t where t.sigla = 'LAO' and t.consultoria_id = cid),
    numero, 'IMA', null, current_setting('testes.hoje')::date - 30, null, null, 'assinatura',
    current_setting('testes.hoje')::date + 400);
  perform public.salvar_condicionante(cond, inst, null, '1.1', 'Relatório ' || numero, '', 'obrigacao');
  perform public.confirmar_prazo(cond, 'unica', null, null, 'corridos', null,
    current_setting('testes.hoje')::date + dias, 'Documento');
  perform public.atribuir_a_todos(inst, responsavel);
  perform public.ativar_plano(inst,
    (select i.row_version from public.instrumento as i where i.id = inst), gen_random_uuid());
end;
$$;

-- Filtroville: um prazo do Bruno (a3) daqui a 2 dias e um da Ana (a2), que não aparece para ele.
select testes.autenticar_como('eduardo@filtroville.test');
select pg_temp.licenca_com_prazo('c0000000-0000-4000-8000-00000000000a',
  '10000000-0000-4000-8000-0000000007a1', '30000000-0000-4000-8000-0000000007a1',
  'f0000000-0000-4000-8000-0000000007a1', '100/2025', 2, 'd0000000-0000-4000-8000-0000000000a3');
select pg_temp.licenca_com_prazo('c0000000-0000-4000-8000-00000000000a',
  '10000000-0000-4000-8000-0000000007a2', '30000000-0000-4000-8000-0000000007a2',
  'f0000000-0000-4000-8000-0000000007a1', '101/2025', 3, 'd0000000-0000-4000-8000-0000000000a2');

-- Verde Sul: um prazo do Bruno (b3) daqui a 4 dias.
select testes.autenticar_como('gustavo@verdesul.test');
select pg_temp.licenca_com_prazo('c0000000-0000-4000-8000-00000000000b',
  '10000000-0000-4000-8000-0000000007b1', '30000000-0000-4000-8000-0000000007b1',
  'f0000000-0000-4000-8000-0000000007b1', '200/2025', 4, 'd0000000-0000-4000-8000-0000000000b3');

-- Mata Nativa: um prazo do Gustavo daqui a 1 dia. O Bruno não é membro.
select pg_temp.licenca_com_prazo('c0000000-0000-4000-8000-00000000000c',
  '10000000-0000-4000-8000-0000000007c1', '30000000-0000-4000-8000-0000000007c1',
  'f0000000-0000-4000-8000-0000000007c1', '300/2025', 1, 'd0000000-0000-4000-8000-0000000000c1');

-- ---------------------------------------------------------------------------
-- A pessoa em duas consultorias vê as duas, numa lista só, em ordem de data
-- ---------------------------------------------------------------------------
select testes.autenticar_como('bruno@filtroville.test');

select results_eq(
  $$select consultoria_nome, tipo_evento, data - current_setting('testes.hoje')::date, dias, titulo,
           empreendimento_nome, total
    from public.minha_semana(current_setting('testes.hoje')::date, current_setting('testes.hoje')::date + 6)$$,
  $$values ('Filtroville Consultoria Ambiental', 'prazo', 2, 2, 'Relatório 100/2025', 'Metalúrgica Rio Cubatão', 2::bigint),
           ('Verde Sul Ambiental', 'prazo', 4, 4, 'Relatório 200/2025', 'Cerâmica Vale do Itajaí', 2::bigint)$$,
  'Bruno vê os próprios prazos da Filtroville e da Verde Sul, em ordem de data'
);

select is(
  (select count(*) from public.minha_semana(current_setting('testes.hoje')::date,
     current_setting('testes.hoje')::date + 6) where consultoria_id = 'c0000000-0000-4000-8000-00000000000c'),
  0::bigint,
  'nada da Mata Nativa, onde o Bruno não é membro'
);

select is(
  (select count(*) from public.minha_semana(current_setting('testes.hoje')::date,
     current_setting('testes.hoje')::date + 6) where titulo = 'Relatório 101/2025'),
  0::bigint,
  'o prazo da Ana na mesma consultoria não entra'
);

select results_eq(
  $$select titulo, total from public.minha_semana(current_setting('testes.hoje')::date,
      current_setting('testes.hoje')::date + 6, 1, 1)$$,
  $$values ('Relatório 200/2025', 2::bigint)$$,
  'paginada: limite 1, deslocamento 1 traz o segundo item e o total'
);

select is(
  (select count(*) from public.minha_semana(current_setting('testes.hoje')::date + 3,
     current_setting('testes.hoje')::date + 6)),
  1::bigint,
  'o período filtra pela data'
);

select is(
  (select count(*) from public.minha_semana(null, current_setting('testes.hoje')::date + 6)),
  2::bigint,
  'sem início, traz tudo o que não foi concluído até o fim do período'
);

select throws_ok(
  $$select * from public.minha_semana(current_setting('testes.hoje')::date,
      current_setting('testes.hoje')::date + 90)$$,
  '22023', 'intervalo_invalido',
  'intervalo de mais de 62 dias é recusado'
);

select has_function('public', 'minha_semana', array['date', 'date', 'integer', 'integer'],
  'a função não recebe consultoria_id do cliente');

-- O Gustavo vê o próprio prazo da Mata Nativa, e nada do Bruno.
select testes.autenticar_como('gustavo@verdesul.test');
select results_eq(
  $$select consultoria_nome, titulo from public.minha_semana(current_setting('testes.hoje')::date,
      current_setting('testes.hoje')::date + 6)$$,
  $$values ('Mata Nativa Consultoria', 'Relatório 300/2025')$$,
  'Gustavo vê só o que é dele'
);

-- ---------------------------------------------------------------------------
-- Consultoria em só leitura comercial aparece, marcada
-- ---------------------------------------------------------------------------
reset role;
update private.configuracao_comercial set fim_do_beta = current_date - 400;
update public.consultoria set criada_em = now() - interval '60 days'
where id = 'c0000000-0000-4000-8000-00000000000b';
delete from public.consultoria_condicao_comercial where consultoria_id = 'c0000000-0000-4000-8000-00000000000b';

select testes.autenticar_como('bruno@filtroville.test');
select results_eq(
  $$select consultoria_nome, somente_leitura from public.minha_semana(current_setting('testes.hoje')::date,
      current_setting('testes.hoje')::date + 6)$$,
  $$values ('Filtroville Consultoria Ambiental', false), ('Verde Sul Ambiental', true)$$,
  'a Verde Sul em só leitura continua aparecendo, marcada'
);

-- ---------------------------------------------------------------------------
-- Desligado: some a consultoria; desligado de todas, não vê mais nada
-- ---------------------------------------------------------------------------
reset role;
update public.membro set situacao = 'desligado', desligado_em = now()
where id = 'd0000000-0000-4000-8000-0000000000b3';

select testes.autenticar_como('bruno@filtroville.test');
select results_eq(
  $$select consultoria_nome from public.minha_semana(current_setting('testes.hoje')::date,
      current_setting('testes.hoje')::date + 6)$$,
  $$values ('Filtroville Consultoria Ambiental')$$,
  'desligado da Verde Sul, o Bruno não vê mais o prazo de lá'
);

reset role;
update public.membro set situacao = 'desligado', desligado_em = now()
where id = 'd0000000-0000-4000-8000-0000000000a3';

select testes.autenticar_como('bruno@filtroville.test');
select is(
  (select count(*) from public.minha_semana(null, current_setting('testes.hoje')::date + 6)),
  0::bigint,
  'desligado de todas, o Bruno não vê mais nada'
);

select * from finish();

rollback;
