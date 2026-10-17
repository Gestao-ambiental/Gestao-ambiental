-- Criar consultoria e convidar (ACC-02, ACC-03): RPCs em transação, token só em hash,
-- convite de uso único com validade, matriz de papéis positiva e negativa.
begin;

select plan(42);

select testes.criar_dados_sinteticos();

-- Contas sem vínculo: uma confirmada (convidada) e uma com e-mail ainda não confirmado.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000001', 'authenticated',
   'authenticated', 'gabriela@exemplo.test', '', now(), '{"provider": "email"}', '{"nome": "Gabriela Matos"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000002', 'authenticated',
   'authenticated', 'rafael@exemplo.test', '', null, '{"provider": "email"}', '{"nome": "Rafael Costa"}', now(), now());

-- ---------------------------------------------------------------------------
-- Nome e e-mail no vínculo vêm da conta
-- ---------------------------------------------------------------------------
select results_eq(
  $$select nome, email from public.membro where id = 'd0000000-0000-4000-8000-0000000000a2'$$,
  $$values ('Ana Ribeiro', 'ana@filtroville.test')$$,
  'o vínculo recebe nome e e-mail da conta'
);

update auth.users set raw_user_meta_data = '{"nome": "Ana R. Ribeiro"}'
where id = 'a0000000-0000-4000-8000-000000000002';

select is(
  (select nome from public.membro where id = 'd0000000-0000-4000-8000-0000000000a2'),
  'Ana R. Ribeiro',
  'mudar o nome da conta atualiza o vínculo'
);

-- ---------------------------------------------------------------------------
-- criar_consultoria
-- ---------------------------------------------------------------------------
select testes.autenticar_como_anonimo();

select throws_ok(
  $$select public.criar_consultoria('c0000000-0000-4000-8000-0000000000f1', 'Sem Login')$$,
  '42501', null,
  'sem login não cria consultoria'
);

select testes.autenticar_como('gabriela@exemplo.test');

select is(
  public.criar_consultoria('c0000000-0000-4000-8000-0000000000f1', '  Ecossis Consultoria  '),
  'c0000000-0000-4000-8000-0000000000f1'::uuid,
  'conta sem vínculo cria a consultoria'
);

select results_eq(
  $$select c.nome, m.papel, m.situacao
    from public.consultoria as c join public.membro as m on m.consultoria_id = c.id
    where c.id = 'c0000000-0000-4000-8000-0000000000f1'$$,
  $$values ('Ecossis Consultoria', 'gestao'::public.papel_membro, 'ativo'::public.situacao_membro)$$,
  'quem cria vira a Gestão ativa e o nome é aparado'
);

select is(
  public.criar_consultoria('c0000000-0000-4000-8000-0000000000f1', 'Ecossis Consultoria'),
  'c0000000-0000-4000-8000-0000000000f1'::uuid,
  'repetir a criação devolve a mesma consultoria'
);

select is(
  (select count(*) from public.membro where consultoria_id = 'c0000000-0000-4000-8000-0000000000f1'),
  1::bigint,
  'repetir não cria segundo vínculo'
);

select throws_ok(
  $$select public.criar_consultoria(gen_random_uuid(), '   ')$$,
  '22023', 'nome_obrigatorio',
  'nome vazio é recusado'
);

select testes.autenticar_como('helena@verdesul.test');

select throws_ok(
  $$select public.criar_consultoria('c0000000-0000-4000-8000-0000000000f1', 'Tomada')$$,
  'P0001', 'consultoria_existente',
  'id de consultoria de outra pessoa não é reaproveitado'
);

select throws_ok(
  $$select public.criar_consultoria('c0000000-0000-4000-8000-00000000000a', 'Tomada')$$,
  'P0001', 'consultoria_existente',
  'Helena (B) não vira Gestão da Filtroville passando o id dela'
);

-- ---------------------------------------------------------------------------
-- criar_convite: só a Gestão da própria consultoria
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select throws_ok(
  $$select * from public.criar_convite('c0000000-0000-4000-8000-00000000000a', 'gabriela@exemplo.test', 'equipe')$$,
  '42501', 'sem_permissao',
  'Equipe (Ana) não convida'
);

select testes.autenticar_como('gustavo@verdesul.test');

select throws_ok(
  $$select * from public.criar_convite('c0000000-0000-4000-8000-00000000000a', 'gabriela@exemplo.test', 'equipe')$$,
  '42501', 'sem_permissao',
  'Gestão de B (Gustavo) não convida para a Filtroville'
);

select testes.autenticar_como('eduardo@filtroville.test');

select set_config('testes.token',
  (select token from public.criar_convite('c0000000-0000-4000-8000-00000000000a', ' Gabriela@Exemplo.test ', 'equipe')),
  true);

select ok(
  length(current_setting('testes.token')) = 64,
  'Gestão (Eduardo) convida e recebe o token uma vez'
);

select results_eq(
  $$select email, papel, situacao, token_hash <> current_setting('testes.token'),
           expira_em - enviado_em
    from public.convite where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'$$,
  $$values ('gabriela@exemplo.test', 'equipe'::public.papel_membro, 'pendente'::public.situacao_convite,
            true, interval '7 days')$$,
  'o convite guarda e-mail normalizado, papel, hash (não o token) e validade de 7 dias'
);

select throws_ok(
  $$select * from public.criar_convite('c0000000-0000-4000-8000-00000000000a', 'gabriela@exemplo.test', 'gestao')$$,
  'P0001', 'convite_pendente_existe',
  'não cria segundo convite pendente para o mesmo e-mail'
);

select throws_ok(
  $$select * from public.criar_convite('c0000000-0000-4000-8000-00000000000a', 'bruno@filtroville.test', 'equipe')$$,
  'P0001', 'ja_e_membro',
  'não convida quem já é membro ativo'
);

select throws_ok(
  $$select * from public.criar_convite('c0000000-0000-4000-8000-00000000000a', 'sem-arroba', 'equipe')$$,
  '22023', 'email_invalido',
  'e-mail inválido é recusado'
);

select throws_ok(
  $$insert into public.convite (consultoria_id, email, papel, token_hash, convidado_por, expira_em)
    values ('c0000000-0000-4000-8000-00000000000a', 'x@exemplo.test', 'gestao', 'h',
            'd0000000-0000-4000-8000-0000000000a1', now() + interval '1 day')$$,
  '42501', null,
  'nem a Gestão escreve direto na tabela convite'
);

-- ---------------------------------------------------------------------------
-- Leitura de convites: só a Gestão da consultoria
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.convite),
  1::bigint,
  'Gestão (Eduardo) lê os convites da Filtroville'
);

select testes.autenticar_como('ana@filtroville.test');

select is((select count(*) from public.convite), 0::bigint, 'Equipe (Ana) não lê convites');

select testes.autenticar_como('gustavo@verdesul.test');

select is((select count(*) from public.convite), 0::bigint, 'Gestão de B (Gustavo) não lê convites de A');

-- ---------------------------------------------------------------------------
-- consultar_convite: funciona sem login, só com o token certo
-- ---------------------------------------------------------------------------
select testes.autenticar_como_anonimo();

select results_eq(
  $$select consultoria_nome, convidado_por_nome, email, papel, situacao, conta_com_senha
    from public.consultar_convite(current_setting('testes.token'))$$,
  $$values ('Filtroville Consultoria Ambiental', 'Eduardo Karnopp', 'gabriela@exemplo.test',
            'equipe'::public.papel_membro, 'pendente', false)$$,
  'sem login, o token mostra consultoria, quem convidou, e-mail, papel e situação'
);

select is(
  (select count(*) from public.consultar_convite(repeat('0', 64))),
  0::bigint,
  'token desconhecido não devolve nada'
);

select throws_ok(
  $$select public.aceitar_convite(current_setting('testes.token'))$$,
  '42501', null,
  'sem login não aceita convite'
);

-- ---------------------------------------------------------------------------
-- aceitar_convite
-- ---------------------------------------------------------------------------
select testes.autenticar_como('helena@verdesul.test');

select throws_ok(
  $$select public.aceitar_convite(current_setting('testes.token'))$$,
  'P0001', 'convite_de_outra_conta',
  'outra conta não aceita o convite'
);

select testes.autenticar_como('gabriela@exemplo.test');

select is(
  public.aceitar_convite(current_setting('testes.token')),
  'c0000000-0000-4000-8000-00000000000a'::uuid,
  'a conta do e-mail convidado aceita e entra na Filtroville'
);

select results_eq(
  $$select papel, situacao, nome from public.membro
    where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'
      and usuario_id = 'e0000000-0000-4000-8000-000000000001'$$,
  $$values ('equipe'::public.papel_membro, 'ativo'::public.situacao_membro, 'Gabriela Matos')$$,
  'o vínculo nasce com o papel do convite'
);

select is(
  public.aceitar_convite(current_setting('testes.token')),
  'c0000000-0000-4000-8000-00000000000a'::uuid,
  'aceitar de novo é inofensivo'
);

select is(
  (select count(*) from public.membro
   where consultoria_id = 'c0000000-0000-4000-8000-00000000000a'
     and usuario_id = 'e0000000-0000-4000-8000-000000000001'),
  1::bigint,
  'aceitar de novo não duplica o vínculo'
);

select testes.autenticar_como_anonimo();

select is(
  (select situacao from public.consultar_convite(current_setting('testes.token'))),
  'aceito',
  'depois do aceite o link mostra "aceito"'
);

-- ---------------------------------------------------------------------------
-- Reenviar, cancelar, expirar e e-mail não confirmado
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');

select set_config('testes.token_rafael',
  (select token from public.criar_convite('c0000000-0000-4000-8000-00000000000a', 'rafael@exemplo.test', 'gestao')),
  true);
select set_config('testes.convite_rafael',
  (select id::text from public.convite where email = 'rafael@exemplo.test'), true);

select set_config('testes.token_rafael_novo',
  public.reenviar_convite(current_setting('testes.convite_rafael')::uuid), true);

select testes.autenticar_como_anonimo();

select is(
  (select count(*) from public.consultar_convite(current_setting('testes.token_rafael'))),
  0::bigint,
  'reenviar invalida o link anterior'
);

select is(
  (select situacao from public.consultar_convite(current_setting('testes.token_rafael_novo'))),
  'pendente',
  'o link novo vale'
);

select testes.autenticar_como('rafael@exemplo.test');

select throws_ok(
  $$select public.aceitar_convite(current_setting('testes.token_rafael_novo'))$$,
  'P0001', 'email_nao_confirmado',
  'conta com e-mail não confirmado não aceita'
);

select testes.autenticar_como('ana@filtroville.test');

select throws_ok(
  $$select public.reenviar_convite(current_setting('testes.convite_rafael')::uuid)$$,
  '42501', 'sem_permissao',
  'Equipe (Ana) não reenvia convite'
);

select throws_ok(
  $$select public.cancelar_convite(current_setting('testes.convite_rafael')::uuid)$$,
  '42501', 'sem_permissao',
  'Equipe (Ana) não cancela convite'
);

-- Expira (como dono, voltando o relógio do convite) e confere
reset role;
update public.convite
set enviado_em = now() - interval '8 days', expira_em = now() - interval '1 day'
where id = current_setting('testes.convite_rafael')::uuid;
update auth.users set email_confirmed_at = now() where id = 'e0000000-0000-4000-8000-000000000002';

select testes.autenticar_como('rafael@exemplo.test');

select is(
  (select situacao from public.consultar_convite(current_setting('testes.token_rafael_novo'))),
  'expirado',
  'passada a validade, o convite aparece como expirado (calculado)'
);

select throws_ok(
  $$select public.aceitar_convite(current_setting('testes.token_rafael_novo'))$$,
  'P0001', 'convite_expirado',
  'convite expirado não é aceito'
);

select testes.autenticar_como('eduardo@filtroville.test');

select lives_ok(
  $$select public.cancelar_convite(current_setting('testes.convite_rafael')::uuid)$$,
  'Gestão (Eduardo) cancela o convite'
);

select lives_ok(
  $$select public.cancelar_convite(current_setting('testes.convite_rafael')::uuid)$$,
  'cancelar de novo é inofensivo'
);

select throws_ok(
  $$select public.reenviar_convite(current_setting('testes.convite_rafael')::uuid)$$,
  'P0001', 'convite_indisponivel',
  'convite cancelado não é reenviado'
);

select testes.autenticar_como('rafael@exemplo.test');

select throws_ok(
  $$select public.aceitar_convite(current_setting('testes.token_rafael_novo'))$$,
  'P0001', 'convite_indisponivel',
  'convite cancelado não é aceito'
);

-- ---------------------------------------------------------------------------
-- Auditoria do convite sem o hash do token
-- ---------------------------------------------------------------------------
reset role;

select ok(
  (select count(*) >= 4 from public.auditoria where entidade = 'convite')
  and not exists (
    select 1 from public.auditoria
    where entidade = 'convite' and (antes ? 'token_hash' or depois ? 'token_hash')
  ),
  'convite é auditado (criar, reenviar, aceitar, cancelar) sem o hash do token'
);

select * from finish();

rollback;
