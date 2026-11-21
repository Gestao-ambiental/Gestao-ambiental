-- Acesso pago (ADR-0058): no beta, só abre consultoria quem tem convite do beta (uso único, do
-- e-mail convidado); beta grátis só para quem foi convidado; um teste por pessoa e por CNPJ; CNPJ
-- só em HMAC; as consultorias que já existiam continuam em beta; outra consultoria não vê nada.
begin;

select plan(32);

select testes.criar_dados_sinteticos();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', p.id, 'authenticated', 'authenticated', p.email, '',
       p.confirmado, '{"provider": "email", "providers": ["email"]}'::jsonb,
       jsonb_build_object('nome', p.nome), now(), now()
from (values
  ('79000000-0000-4000-8000-000000000001'::uuid, 'convidada@exemplo.test', 'Convidada', now()),
  ('79000000-0000-4000-8000-000000000002'::uuid, 'sem.convite@exemplo.test', 'Sem Convite', now()),
  ('79000000-0000-4000-8000-000000000003'::uuid, 'mesmo.cnpj@exemplo.test', 'Mesmo CNPJ', now()),
  ('79000000-0000-4000-8000-000000000004'::uuid, 'depois.do.beta@exemplo.test', 'Depois do Beta', now()),
  ('79000000-0000-4000-8000-000000000005'::uuid, 'operador79@grama.test', 'Operador', now()),
  ('79000000-0000-4000-8000-000000000006'::uuid, 'nao.confirmou@exemplo.test', 'Não Confirmou', null)
) as p (id, email, nome, confirmado);
insert into private.operador_plataforma (usuario_id) values ('79000000-0000-4000-8000-000000000005');

-- Beta em curso, qualquer que seja a data do CI.
update private.configuracao_comercial set fim_do_beta = current_date + 30 where id;

-- ---------------------------------------------------------------- CNPJ
select testes.convidar_para_o_beta('convidada@exemplo.test');
select testes.autenticar_como('convidada@exemplo.test');
select throws_ok(
  $$select * from public.abrir_consultoria(gen_random_uuid(), 'Sem CNPJ', '  ')$$,
  '22023', 'cnpj_obrigatorio', 'sem CNPJ não abre');
select throws_ok(
  $$select * from public.abrir_consultoria(gen_random_uuid(), 'CNPJ errado', '11.222.333/0001-82')$$,
  '22023', 'cnpj_invalido', 'CNPJ com verificador errado não abre');
select throws_ok(
  $$select public.criar_consultoria(gen_random_uuid(), 'Pelo caminho antigo')$$,
  '22023', 'cnpj_obrigatorio', 'o caminho antigo, sem CNPJ, não abre consultoria nova');

-- ---------------------------------------------------------------- convite do beta
select results_eq(
  $$select acesso from public.abrir_consultoria('c7900000-0000-4000-8000-000000000001', 'Convidada Ambiental',
      '11.222.333/0001-81')$$,
  $$values ('beta'::text)$$,
  'com convite, no beta, nasce em beta');
select results_eq(
  $$select situacao, somente_leitura from public.situacao_comercial('c7900000-0000-4000-8000-000000000001')$$,
  $$values ('beta'::text, false)$$,
  'e a situação é beta, sem bloqueio');
select results_eq(
  $$select acesso from public.abrir_consultoria('c7900000-0000-4000-8000-000000000001', 'Convidada Ambiental',
      '11.222.333/0001-81')$$,
  $$values ('beta'::text)$$,
  'repetir devolve a mesma consultoria e condição');
select throws_ok(
  $$select * from public.abrir_consultoria(gen_random_uuid(), 'Segunda', '44555666000181')$$,
  'P0001', 'convite_do_beta_obrigatorio', 'o convite é de uso único');
select throws_ok(
  $$select count(*) from private.convite_do_beta$$,
  '42501', null, 'ninguém logado lê os convites');

reset role;
select ok(
  (select usado_em is not null and usado_na_consultoria = 'c7900000-0000-4000-8000-000000000001'
   from private.convite_do_beta where email = 'convidada@exemplo.test'),
  'o convite fica marcado como usado');
select ok(
  (select cnpj_hash ~ '^[0-9a-f]{64}$' and cnpj_hash not like '%11222333000181%'
   from private.consultoria_acesso where consultoria_id = 'c7900000-0000-4000-8000-000000000001'),
  'o CNPJ fica só em HMAC, nunca em claro');

select testes.autenticar_como('sem.convite@exemplo.test');
select throws_ok(
  $$select * from public.abrir_consultoria(gen_random_uuid(), 'Sem Convite', '77888999000181')$$,
  'P0001', 'convite_do_beta_obrigatorio', 'sem convite, no beta, não abre');

-- Convite de outro e-mail não serve.
select testes.convidar_para_o_beta('outra.pessoa@exemplo.test');
select throws_ok(
  $$select * from public.abrir_consultoria(gen_random_uuid(), 'Sem Convite', '77888999000181')$$,
  'P0001', 'convite_do_beta_obrigatorio', 'convite de outro e-mail não serve');

-- E-mail não confirmado não usa convite.
select testes.convidar_para_o_beta('nao.confirmou@exemplo.test');
select testes.autenticar_como('nao.confirmou@exemplo.test');
select throws_ok(
  $$select * from public.abrir_consultoria(gen_random_uuid(), 'Sem Confirmar', '77888999000181')$$,
  'P0001', 'convite_do_beta_obrigatorio', 'e-mail não confirmado não usa o convite');

-- ---------------------------------------------------------------- um teste por pessoa e por CNPJ
select testes.convidar_para_o_beta('convidada@exemplo.test');
select testes.autenticar_como('convidada@exemplo.test');
select results_eq(
  $$select acesso from public.abrir_consultoria('c7900000-0000-4000-8000-000000000002', 'Segunda da Convidada',
      '44555666000181')$$,
  $$values ('sem_teste'::text)$$,
  'quem já foi Gestão abre a segunda consultoria sem teste');
select results_eq(
  $$select situacao, somente_leitura from public.situacao_comercial('c7900000-0000-4000-8000-000000000002')$$,
  $$values ('teste_encerrado'::text, true)$$,
  'e ela nasce precisando de plano');

select testes.convidar_para_o_beta('mesmo.cnpj@exemplo.test');
select testes.autenticar_como('mesmo.cnpj@exemplo.test');
select results_eq(
  $$select acesso from public.abrir_consultoria('c7900000-0000-4000-8000-000000000003', 'Mesmo CNPJ',
      '11222333000181')$$,
  $$values ('sem_teste'::text)$$,
  'o mesmo CNPJ não ganha segundo teste, mesmo com outra pessoa');

-- Quem perdeu a conta e voltou com o mesmo e-mail também não ganha outro teste.
reset role;
set local session_replication_role = replica;
delete from public.membro where usuario_id = '79000000-0000-4000-8000-000000000003';
set local session_replication_role = origin;
select testes.convidar_para_o_beta('mesmo.cnpj@exemplo.test');
select testes.autenticar_como('mesmo.cnpj@exemplo.test');
select results_eq(
  $$select acesso from public.abrir_consultoria('c7900000-0000-4000-8000-000000000007', 'De Novo', '24680246000110')$$,
  $$values ('sem_teste'::text)$$,
  'o e-mail que já ganhou teste não ganha outro');

-- A Central ainda pode dar dias de teste pela condição comercial.
reset role;
insert into public.consultoria_condicao_comercial (consultoria_id, dias_de_teste)
values ('c7900000-0000-4000-8000-000000000007', 10);
select testes.autenticar_como('mesmo.cnpj@exemplo.test');
select results_eq(
  $$select situacao from public.situacao_comercial('c7900000-0000-4000-8000-000000000007')$$,
  $$values ('teste'::text)$$,
  'dias de teste dados pela Central valem');

-- ---------------------------------------------------------------- isolamento
select testes.autenticar_como('gustavo@verdesul.test');
select throws_ok(
  $$select * from public.situacao_comercial('c7900000-0000-4000-8000-000000000001')$$,
  '42501', 'sem_permissao', 'outra consultoria não vê a situação');
select throws_ok(
  $$select * from public.abrir_consultoria('c7900000-0000-4000-8000-000000000001', 'Tomada', '19283746000188')$$,
  'P0001', 'consultoria_existente', 'outra pessoa não toma a consultoria pelo id');
select is(
  (select count(*) from public.consultoria where id::text like 'c7900000%'),
  0::bigint,
  'outra consultoria não lê as consultorias novas');

-- ---------------------------------------------------------------- as que já existiam continuam em beta
reset role;
insert into private.consultoria_acesso (consultoria_id, origem)
values ('c0000000-0000-4000-8000-00000000000b', 'anterior');
select testes.autenticar_como('eduardo@filtroville.test');
select results_eq(
  $$select situacao, somente_leitura from public.situacao_comercial('c0000000-0000-4000-8000-00000000000a')$$,
  $$values ('beta'::text, false)$$,
  'Filtroville (sem linha de acesso) continua em beta');
select testes.autenticar_como('gustavo@verdesul.test');
select results_eq(
  $$select situacao, somente_leitura from public.situacao_comercial('c0000000-0000-4000-8000-00000000000b')$$,
  $$values ('beta'::text, false)$$,
  'consultoria marcada como anterior continua em beta');

-- ---------------------------------------------------------------- convites: lista de espera e operador
reset role;
insert into private.lista_de_espera (id, nome, contato, tipo_contato)
values ('a7900000-0000-4000-8000-000000000001', 'Da Lista', 'da.lista@exemplo.test', 'email');
select testes.autenticar_com_dois_fatores('operador79@grama.test');
select public.central_registrar_convite('a7900000-0000-4000-8000-000000000001');
reset role;
select is(
  (select count(*) from private.convite_do_beta where email = 'da.lista@exemplo.test' and usado_em is null),
  1::bigint,
  'convidar da lista de espera cria o convite do beta');

select testes.autenticar_com_dois_fatores('eduardo@filtroville.test');
select throws_ok(
  $$select public.central_emitir_convite_do_beta('qualquer@exemplo.test')$$,
  '42501', 'sem_permissao', 'Gestão de consultoria não emite convite do beta');
select testes.autenticar_como_anonimo();
select throws_ok(
  $$select public.central_emitir_convite_do_beta('qualquer@exemplo.test')$$,
  '42501', null, 'anon não emite convite');
select testes.autenticar_com_dois_fatores('operador79@grama.test');
select lives_ok(
  $$select public.central_emitir_convite_do_beta(' Sem.Convite@Exemplo.test ')$$,
  'operador emite convite');
select throws_ok(
  $$select public.central_emitir_convite_do_beta('não é e-mail')$$,
  '22023', 'email_invalido', 'e-mail inválido é recusado');
select results_eq(
  $$select acesso from public.abrir_consultoria('c7900000-0000-4000-8000-000000000005', 'Conta Interna',
      '98765432000198')$$,
  $$values ('beta'::text)$$,
  'operador abre consultoria sem convite');

select testes.autenticar_como('sem.convite@exemplo.test');
select results_eq(
  $$select acesso from public.abrir_consultoria('c7900000-0000-4000-8000-000000000004', 'Agora Convidada',
      '77888999000181')$$,
  $$values ('beta'::text)$$,
  'com o convite do operador, abre em beta');

-- ---------------------------------------------------------------- depois do beta
reset role;
update private.configuracao_comercial set fim_do_beta = current_date - 30 where id;
select testes.autenticar_como('depois.do.beta@exemplo.test');
select results_eq(
  $$select acesso from public.abrir_consultoria('c7900000-0000-4000-8000-000000000006', 'Depois do Beta',
      '13579135000103')$$,
  $$values ('teste'::text)$$,
  'depois do beta não precisa de convite e ganha o teste normal');
select results_eq(
  $$select situacao from public.situacao_comercial('c7900000-0000-4000-8000-000000000006')$$,
  $$values ('teste'::text)$$,
  'e a situação é teste');

select * from finish();

rollback;
