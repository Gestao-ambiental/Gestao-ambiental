-- Perfil do membro (cargo e foto, para o seletor de responsável): cargo pela própria pessoa ou pela
-- Gestão; foto só pela própria pessoa, PNG ou JPEG até 2 MiB, versionada; nada atravessa consultorias.
begin;

select plan(21);

select testes.criar_dados_sinteticos();

insert into storage.objects (bucket_id, name, metadata) values
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/membro/90000001-0000-4000-8000-000000000000.png',
   '{"mimetype": "image/png", "size": 40960}'),
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/membro/90000002-0000-4000-8000-000000000000.jpg',
   '{"mimetype": "image/jpeg", "size": 51200}'),
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/membro/90000003-0000-4000-8000-000000000000.png',
   '{"mimetype": "application/pdf", "size": 4096}'),
  ('arquivos', 'c0000000-0000-4000-8000-00000000000a/membro/90000004-0000-4000-8000-000000000000.png',
   '{"mimetype": "image/png", "size": 3145728}'),
  ('arquivos', 'c0000000-0000-4000-8000-00000000000b/membro/90000005-0000-4000-8000-000000000000.png',
   '{"mimetype": "image/png", "size": 40960}');

-- ---------------------------------------------------------------------------
-- Cargo
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select lives_ok(
  $$select public.definir_cargo('d0000000-0000-4000-8000-0000000000a2', '  Analista ambiental ')$$,
  'Equipe (Ana) define o próprio cargo'
);

select is(
  (select cargo from public.membro where id = 'd0000000-0000-4000-8000-0000000000a2'),
  'Analista ambiental',
  'cargo é gravado sem espaços nas pontas'
);

select throws_ok(
  $$select public.definir_cargo('d0000000-0000-4000-8000-0000000000a3', 'Diretor')$$,
  '42501', 'sem_permissao',
  'Equipe (Ana) não muda o cargo de outra pessoa (Bruno)'
);

select throws_ok(
  $$select public.definir_cargo('d0000000-0000-4000-8000-0000000000a2', repeat('a', 81))$$,
  '22023', 'cargo_longo_demais',
  'cargo com mais de 80 caracteres é recusado'
);

select testes.autenticar_como('eduardo@filtroville.test');

select lives_ok(
  $$select public.definir_cargo('d0000000-0000-4000-8000-0000000000a3', 'Técnico de campo')$$,
  'Gestão (Eduardo) define o cargo de Bruno'
);

select lives_ok(
  $$select public.definir_cargo('d0000000-0000-4000-8000-0000000000a3', '   ')$$,
  'cargo vazio limpa'
);

select is(
  (select cargo from public.membro where id = 'd0000000-0000-4000-8000-0000000000a3'),
  null,
  'cargo vazio fica nulo'
);

select testes.autenticar_como('gustavo@verdesul.test');

select throws_ok(
  $$select public.definir_cargo('d0000000-0000-4000-8000-0000000000a2', 'Estagiária')$$,
  '42501', 'sem_permissao',
  'Gestão de outra consultoria (Gustavo) não muda o cargo de Ana, mesmo sabendo o id'
);

reset role;

select is(
  (select count(*) from public.auditoria
   where entidade = 'membro' and entidade_id = 'd0000000-0000-4000-8000-0000000000a2' and acao = 'update'
     and depois ->> 'cargo' = 'Analista ambiental'),
  1::bigint,
  'mudança de cargo fica na auditoria'
);

-- ---------------------------------------------------------------------------
-- Foto
-- ---------------------------------------------------------------------------
select testes.autenticar_como('ana@filtroville.test');

select is(
  public.registrar_foto_membro('d0000000-0000-4000-8000-0000000000a2', '90000001-0000-4000-8000-000000000000',
    'c0000000-0000-4000-8000-00000000000a/membro/90000001-0000-4000-8000-000000000000.png', 'ana.png',
    repeat('a', 64)),
  '90000001-0000-4000-8000-000000000000'::uuid,
  'Ana registra a própria foto'
);

select is(
  public.registrar_foto_membro('d0000000-0000-4000-8000-0000000000a2', '90000001-0000-4000-8000-000000000000',
    'c0000000-0000-4000-8000-00000000000a/membro/90000001-0000-4000-8000-000000000000.png', 'ana.png',
    repeat('a', 64)),
  '90000001-0000-4000-8000-000000000000'::uuid,
  'repetir o registro devolve a mesma versão'
);

select results_eq(
  $$select d.entidade, v.numero, v.mime, v.autor_id
    from public.membro as m
    join public.documento as d on d.id = m.foto_documento_id
    join public.documento_versao as v on v.id = d.versao_vigente_id
    where m.id = 'd0000000-0000-4000-8000-0000000000a2'$$,
  $$values ('membro'::text, 1, 'image/png'::text, 'd0000000-0000-4000-8000-0000000000a2'::uuid)$$,
  'a foto é a versão 1 de um documento de membro, de autoria da própria Ana'
);

select throws_ok(
  $$select public.registrar_foto_membro('d0000000-0000-4000-8000-0000000000a2', '90000003-0000-4000-8000-000000000000',
    'c0000000-0000-4000-8000-00000000000a/membro/90000003-0000-4000-8000-000000000000.png', 'x.png', repeat('a', 64))$$,
  '22023', 'arquivo_tipo_invalido',
  'arquivo que não é PNG nem JPEG é recusado'
);

select throws_ok(
  $$select public.registrar_foto_membro('d0000000-0000-4000-8000-0000000000a2', '90000004-0000-4000-8000-000000000000',
    'c0000000-0000-4000-8000-00000000000a/membro/90000004-0000-4000-8000-000000000000.png', 'x.png', repeat('a', 64))$$,
  '22023', 'arquivo_grande_demais',
  'imagem acima de 2 MiB é recusada'
);

select throws_ok(
  $$select public.registrar_foto_membro('d0000000-0000-4000-8000-0000000000a2', '90000005-0000-4000-8000-000000000000',
    'c0000000-0000-4000-8000-00000000000b/membro/90000005-0000-4000-8000-000000000000.png', 'x.png', repeat('a', 64))$$,
  '22023', 'caminho_invalido',
  'objeto de outra consultoria não vira foto'
);

select lives_ok(
  $$select public.registrar_foto_membro('d0000000-0000-4000-8000-0000000000a2', '90000002-0000-4000-8000-000000000000',
    'c0000000-0000-4000-8000-00000000000a/membro/90000002-0000-4000-8000-000000000000.jpg', 'ana.jpg', repeat('b', 64))$$,
  'trocar a foto registra outra versão'
);

select results_eq(
  $$select count(*)::integer, max(v.numero)
    from public.membro as m join public.documento_versao as v on v.documento_id = m.foto_documento_id
    where m.id = 'd0000000-0000-4000-8000-0000000000a2'$$,
  $$values (2, 2)$$,
  'a troca fica no mesmo documento, versão 2'
);

select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select public.registrar_foto_membro('d0000000-0000-4000-8000-0000000000a2', gen_random_uuid(),
    'c0000000-0000-4000-8000-00000000000a/membro/90000001-0000-4000-8000-000000000000.png', 'x.png', repeat('a', 64))$$,
  '42501', 'sem_permissao',
  'nem a Gestão troca a foto de outra pessoa'
);

select testes.autenticar_como('gustavo@verdesul.test');

select is(
  (select count(*) from public.documento where entidade = 'membro'),
  0::bigint,
  'usuário de outra consultoria vê zero fotos de membros de A'
);

select testes.autenticar_como('ana@filtroville.test');

select lives_ok(
  $$select public.remover_foto_membro('d0000000-0000-4000-8000-0000000000a2');
    select public.remover_foto_membro('d0000000-0000-4000-8000-0000000000a2')$$,
  'Ana tira a foto (repetir é inofensivo)'
);

select results_eq(
  $$select (select foto_documento_id from public.membro where id = 'd0000000-0000-4000-8000-0000000000a2') is null,
           (select count(*) from public.documento where entidade = 'membro' and excluido_em is not null)$$,
  $$values (true, 1::bigint)$$,
  'sem foto no membro; o documento é excluído logicamente, não apagado'
);

select * from finish();
rollback;
