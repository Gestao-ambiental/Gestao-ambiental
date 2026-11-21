-- Nome escolhido em "Meu perfil" (20/11/2026): o front grava user_metadata.nome pelo Auth. Esse
-- nome vence o do Google e o pedaço do e-mail, chega ao membro pela trigger
-- membro_sincronizar_identidade e não volta ao nome do Google quando a pessoa entra de novo.
begin;

select plan(4);

select testes.criar_dados_sinteticos();

-- Entrou pelo Google: o Google manda full_name.
update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'nome'
                         || '{"full_name": "edukarnopp3"}'::jsonb
where email = 'eduardo@filtroville.test';

select is(
  (select m.nome from public.membro as m join auth.users as u on u.id = m.usuario_id
   where u.email = 'eduardo@filtroville.test' limit 1),
  'edukarnopp3',
  'sem nome escolhido, o membro fica com o nome do Google'
);

-- Salvou o nome no perfil (updateUser grava user_metadata.nome).
update auth.users
set raw_user_meta_data = raw_user_meta_data || '{"nome": "Eduardo Karnopp"}'::jsonb
where email = 'eduardo@filtroville.test';

select is(
  (select count(*) from public.membro as m join auth.users as u on u.id = m.usuario_id
   where u.email = 'eduardo@filtroville.test' and m.nome <> 'Eduardo Karnopp'),
  0::bigint,
  'o nome escolhido chega a todos os vínculos da pessoa'
);

-- Entrou de novo pelo Google: o provedor reescreve full_name e name, mas não o nome escolhido.
update auth.users
set raw_user_meta_data = raw_user_meta_data
                         || '{"full_name": "Edu K", "name": "Edu K"}'::jsonb
where email = 'eduardo@filtroville.test';

select is(
  (select m.nome from public.membro as m join auth.users as u on u.id = m.usuario_id
   where u.email = 'eduardo@filtroville.test' limit 1),
  'Eduardo Karnopp',
  'entrar de novo pelo Google não troca o nome escolhido'
);

select is(
  private.nome_do_usuario('{"nome": "  ", "full_name": "Edu K"}'::jsonb, 'eduardo@filtroville.test'),
  'Edu K',
  'nome em branco não vale: volta para o do Google'
);

select * from finish();

rollback;
