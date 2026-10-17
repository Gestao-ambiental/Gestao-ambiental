-- Políticas do bucket "arquivos": o primeiro segmento do caminho é o consultoria_id;
-- só membro ativo dessa consultoria lê e envia. Sem update e sem delete (objetos imutáveis).
begin;

select plan(9);

select testes.criar_dados_sinteticos();

insert into storage.objects (bucket_id, name)
values ('arquivos', 'c0000000-0000-4000-8000-00000000000a/instrumento/e0000000-0000-4000-8000-000000000001.pdf');

-- Membro de A lê o objeto de A
select testes.autenticar_como('ana@filtroville.test');

select is(
  (select count(*) from storage.objects where bucket_id = 'arquivos'),
  1::bigint,
  'Ana (A) vê o objeto no caminho de A'
);

-- Membro de B não lê, sem erro
select testes.autenticar_como('helena@verdesul.test');

select is(
  (select count(*) from storage.objects where bucket_id = 'arquivos'),
  0::bigint,
  'Helena (B) não vê objeto no caminho de A'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('arquivos', 'c0000000-0000-4000-8000-00000000000a/instrumento/intruso.pdf')$$,
  '42501', null,
  'Helena (B) não envia arquivo para o caminho de A'
);

select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('arquivos', 'c0000000-0000-4000-8000-00000000000b/instrumento/proprio.pdf')$$,
  'Helena (B) envia arquivo para o caminho de B'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('arquivos', 'sem-consultoria/arquivo.pdf')$$,
  '42501', null,
  'caminho sem consultoria_id no primeiro segmento é recusado'
);

-- Membro desligado perde o acesso aos arquivos
reset role;
update public.membro set situacao = 'desligado', desligado_em = now()
where id = 'd0000000-0000-4000-8000-0000000000a5';

select testes.autenticar_como('diego@filtroville.test');

select is(
  (select count(*) from storage.objects where bucket_id = 'arquivos'),
  0::bigint,
  'Diego desligado não vê mais os arquivos de A'
);

-- Imutável: sem política de update nem delete, nada muda
select testes.autenticar_como('eduardo@filtroville.test');

update storage.objects set name = name || '.alterado' where bucket_id = 'arquivos';

select is(
  (select count(*) from storage.objects where bucket_id = 'arquivos' and name like '%.alterado'),
  0::bigint,
  'Gestão não sobrescreve objeto (sem política de update)'
);

reset role;

select is(
  (select count(*) from storage.objects
   where bucket_id = 'arquivos' and name like 'c0000000-0000-4000-8000-00000000000a/%'),
  1::bigint,
  'o objeto de A continua intacto'
);

select is(
  (select count(*) from pg_catalog.pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and cmd in ('UPDATE', 'DELETE', 'ALL') and qual like '%arquivos%'),
  0::bigint,
  'não há política de update ou delete para o bucket arquivos'
);

select * from finish();

rollback;
