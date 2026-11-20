-- Recurso liberado para o front: o membro ativo recebe o mesmo que a regra do banco; quem não é da
-- consultoria e o anônimo são recusados; recurso fora da lista é recusado.
begin;

select plan(5);

select testes.criar_dados_sinteticos();

-- A regra do banco, sem passar pela RPC (o teste troca de usuário no meio).
create function testes.regra_do_recurso(cid uuid, recurso text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.recurso_liberado(cid, recurso)
$$;

select testes.autenticar_como('ana@filtroville.test');

select is(
  public.recurso_liberado('c0000000-0000-4000-8000-00000000000a', 'capacidade'),
  testes.regra_do_recurso('c0000000-0000-4000-8000-00000000000a', 'capacidade'),
  'membro da Equipe recebe o mesmo que a regra do banco'
);

select throws_ok(
  $$select public.recurso_liberado('c0000000-0000-4000-8000-00000000000a', 'qualquer')$$,
  '22023', 'recurso_invalido',
  'recurso fora da lista é recusado'
);

select testes.autenticar_como('gustavo@verdesul.test');

select throws_ok(
  $$select public.recurso_liberado('c0000000-0000-4000-8000-00000000000a', 'capacidade')$$,
  '42501', 'sem_permissao',
  'Gestão de outra consultoria não pergunta pelos recursos de A'
);

select is(
  public.recurso_liberado('c0000000-0000-4000-8000-00000000000b', 'orcamentos'),
  testes.regra_do_recurso('c0000000-0000-4000-8000-00000000000b', 'orcamentos'),
  'cada um pergunta pela própria consultoria'
);

select testes.autenticar_como_anonimo();

select throws_ok(
  $$select public.recurso_liberado('c0000000-0000-4000-8000-00000000000a', 'capacidade')$$,
  '42501', null,
  'anônimo não pergunta'
);

select * from finish();
rollback;
