-- Aviso agrupado da lista de espera (ADR-0034, item 6): o disparo não depende de um cadastro
-- posterior. O mesmo disparo do gatilho serve ao job periódico; sem cadastro pendente a janela de
-- 10 minutos não é gasta, e com pendente ela vale de novo depois dos 10 minutos.
begin;

select plan(6);

select ok(
  not has_function_privilege('anon', 'private.disparar_aviso_da_lista_de_espera()', 'execute')
  and not has_function_privilege('authenticated', 'private.disparar_aviso_da_lista_de_espera()', 'execute'),
  'o cliente não dispara o aviso'
);

update private.lista_de_espera set avisado_em = coalesce(avisado_em, now());
update private.lista_de_espera_aviso set disparado_em = '-infinity';
select is(private.reservar_aviso_da_lista_de_espera(), false,
  'sem cadastro pendente o disparo não sai nem gasta a janela');
select is((select disparado_em from private.lista_de_espera_aviso), '-infinity'::timestamptz,
  'a janela continua livre');

-- Cadastro B dentro da janela de outro aviso: fica pendente.
insert into private.lista_de_espera (nome, contato, tipo_contato)
values ('Cadastro B', 'b645@exemplo.test', 'email');
update private.lista_de_espera_aviso set disparado_em = now() - interval '4 minutes';
select is(private.reservar_aviso_da_lista_de_espera(), false, 'dentro dos 10 minutos B espera');

-- Ninguém mais se cadastra: o job periódico, depois dos 10 minutos, leva B.
update private.lista_de_espera_aviso set disparado_em = now() - interval '11 minutes';
select is(private.reservar_aviso_da_lista_de_espera(), true,
  'depois dos 10 minutos o disparo sai para B sem novo cadastro');

-- Sem pg_net nem Vault (PGlite) o disparo não faz nada e não falha.
select lives_ok($$select private.disparar_aviso_da_lista_de_espera()$$,
  'o disparo roda sem pg_net, Vault ou segredos');

select * from finish();
rollback;
