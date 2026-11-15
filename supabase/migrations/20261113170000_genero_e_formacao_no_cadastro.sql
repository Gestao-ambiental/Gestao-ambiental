-- Gênero e formação no cadastro da conta (ADR-0021 §7; decisões do Eduardo em 13/11/2026).
-- 1. membro.genero: 'feminino' | 'masculino' | 'nao_informar'. Nulo = ainda não respondeu (a tela
--    pede no próximo acesso). Serve só para escrever a profissão junto do nome da pessoa.
-- 2. Quem cria a conta informa formação e gênero nos metadados do Auth ({profissao, genero}). Ao
--    criar o vínculo (criar consultoria ou aceitar convite), o gatilho copia os dois para o membro
--    quando ainda estão vazios. Valor fora das listas é ignorado (fica nulo e a tela pede de novo).
-- 3. completar_cadastro: a própria pessoa grava formação principal e gênero em todos os vínculos
--    ativos dela. definir_meu_genero: só o gênero. Gênero é da pessoa: a Gestão não muda.

create domain public.genero_da_pessoa as text
  check (value in ('feminino', 'masculino', 'nao_informar'));

alter table public.membro add column genero public.genero_da_pessoa;

comment on column public.membro.genero is
  'Gênero informado pela própria pessoa, só para escrever a profissão (ADR-0021 §7). Nulo = não respondeu.';

-- Formação e gênero dos metadados do Auth, quando válidos.
create function private.preencher_formacao_membro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  dados jsonb;
begin
  if new.profissao is not null and new.genero is not null then
    return new;
  end if;
  select u.raw_user_meta_data into dados from auth.users as u where u.id = new.usuario_id;
  if new.profissao is null
     and private.rotulo_da_profissao(dados ->> 'profissao') is not null then
    new.profissao := (dados ->> 'profissao')::public.profissao_do_membro;
    new.outras_profissoes := array_remove(new.outras_profissoes, new.profissao);
  end if;
  if new.genero is null
     and dados ->> 'genero' in ('feminino', 'masculino', 'nao_informar') then
    new.genero := (dados ->> 'genero')::public.genero_da_pessoa;
  end if;
  return new;
end;
$$;

revoke all on function private.preencher_formacao_membro() from public, anon, authenticated;

create trigger membro_preencher_formacao
  before insert on public.membro
  for each row execute function private.preencher_formacao_membro();

-- A própria pessoa: formação principal e gênero em todos os vínculos ativos. Repetir não muda nada.
create function public.completar_cadastro(p_profissao text, p_genero text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  nova_profissao text := nullif(btrim(coalesce(p_profissao, '')), '');
  novo_genero text := nullif(btrim(coalesce(p_genero, '')), '');
begin
  if usuario is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if nova_profissao is null or private.rotulo_da_profissao(nova_profissao) is null then
    raise exception 'profissao_invalida' using errcode = '22023';
  end if;
  if novo_genero is null or novo_genero not in ('feminino', 'masculino', 'nao_informar') then
    raise exception 'genero_invalido' using errcode = '22023';
  end if;

  update public.membro as m
  set profissao = nova_profissao::public.profissao_do_membro,
      outras_profissoes = array_remove(m.outras_profissoes,
                                       nova_profissao::public.profissao_do_membro),
      genero = novo_genero::public.genero_da_pessoa
  where m.usuario_id = usuario
    and m.situacao = 'ativo'
    and (m.profissao is distinct from nova_profissao or m.genero is distinct from novo_genero);
end;
$$;

revoke all on function public.completar_cadastro(text, text) from public, anon;
grant execute on function public.completar_cadastro(text, text) to authenticated;

-- A própria pessoa: só o gênero, em todos os vínculos ativos.
create function public.definir_meu_genero(p_genero text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  novo_genero text := nullif(btrim(coalesce(p_genero, '')), '');
begin
  if usuario is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if novo_genero is null or novo_genero not in ('feminino', 'masculino', 'nao_informar') then
    raise exception 'genero_invalido' using errcode = '22023';
  end if;

  update public.membro as m
  set genero = novo_genero::public.genero_da_pessoa
  where m.usuario_id = usuario
    and m.situacao = 'ativo'
    and m.genero is distinct from novo_genero;
end;
$$;

revoke all on function public.definir_meu_genero(text) from public, anon;
grant execute on function public.definir_meu_genero(text) to authenticated;
