-- Formação em curso (ADR-0021 §8; decisão do Eduardo em 13/11/2026). Quem ainda está cursando
-- (ex.: estagiário) escolhe a formação que cursa e marca "Ainda estou cursando".
-- 1. membro.profissao_em_curso: a profissão principal é um curso em andamento. Junto do nome aparece
--    "Estudante de <curso>". As outras formações continuam só as concluídas.
-- 2. No custo por profissão, quem cursa forma um grupo à parte (migration seguinte, no salvar da base).
-- 3. Cadastro da conta: metadado profissao_em_curso copiado ao criar o vínculo; completar_cadastro e
--    definir_profissao_e_cargo aceitam o campo (nulo mantém).

alter table public.membro add column profissao_em_curso boolean not null default false;

comment on column public.membro.profissao_em_curso is
  'A profissão principal ainda está em curso (estudante). Junto do nome: "Estudante de <curso>" (ADR-0021 §8).';

create or replace function private.preencher_formacao_membro()
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
    new.profissao_em_curso := coalesce(dados ->> 'profissao_em_curso', 'false') = 'true';
  end if;
  if new.genero is null
     and dados ->> 'genero' in ('feminino', 'masculino', 'nao_informar') then
    new.genero := (dados ->> 'genero')::public.genero_da_pessoa;
  end if;
  return new;
end;
$$;

drop function public.completar_cadastro(text, text);

create function public.completar_cadastro(
  p_profissao text,
  p_genero text,
  p_em_curso boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  nova_profissao text := nullif(btrim(coalesce(p_profissao, '')), '');
  novo_genero text := nullif(btrim(coalesce(p_genero, '')), '');
  em_curso boolean := coalesce(p_em_curso, false);
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
      genero = novo_genero::public.genero_da_pessoa,
      profissao_em_curso = em_curso
  where m.usuario_id = usuario
    and m.situacao = 'ativo'
    and (m.profissao is distinct from nova_profissao or m.genero is distinct from novo_genero
         or m.profissao_em_curso is distinct from em_curso);
end;
$$;

revoke all on function public.completar_cadastro(text, text, boolean) from public, anon;
grant execute on function public.completar_cadastro(text, text, boolean) to authenticated;

drop function public.definir_profissao_e_cargo(uuid, text, text, text[]);

-- Profissão principal (com "em curso"), cargo e outras formações. Mesmas regras de antes.
create function public.definir_profissao_e_cargo(
  p_membro_id uuid,
  p_profissao text,
  p_cargo text,
  p_outras_profissoes text[] default null,
  p_profissao_em_curso boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.membro;
  nova_profissao text := nullif(btrim(coalesce(p_profissao, '')), '');
  novo_cargo text := nullif(btrim(coalesce(p_cargo, '')), '');
  outras text[];
  codigo text;
begin
  select * into alvo from public.membro as m where m.id = p_membro_id for update;
  if not found
     or not (private.is_gestao(alvo.consultoria_id)
             or (alvo.usuario_id = (select auth.uid()) and private.is_membro(alvo.consultoria_id))) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.situacao <> 'ativo' then
    raise exception 'membro_desligado' using errcode = 'P0001';
  end if;
  -- Profissão principal preenchida não volta a ficar vazia: só troca por outra.
  if nova_profissao is null and alvo.profissao is not null then
    raise exception 'profissao_nao_pode_ficar_vazia' using errcode = '22023';
  end if;
  if nova_profissao is not null and private.rotulo_da_profissao(nova_profissao) is null then
    raise exception 'profissao_invalida' using errcode = '22023';
  end if;
  begin
    perform novo_cargo::public.cargo_do_membro;
  exception when check_violation then
    raise exception 'cargo_invalido' using errcode = '22023';
  end;

  outras := coalesce(p_outras_profissoes, alvo.outras_profissoes::text[]);
  foreach codigo in array outras loop
    if private.rotulo_da_profissao(codigo) is null then
      raise exception 'profissao_invalida' using errcode = '22023';
    end if;
  end loop;
  -- Sem repetição, sem a principal, na ordem em que vieram.
  select coalesce(array_agg(o.codigo order by o.ordem), '{}')
    into outras
  from (
    select x.codigo, min(x.ordem) as ordem
    from unnest(outras) with ordinality as x (codigo, ordem)
    where x.codigo is distinct from nova_profissao
    group by x.codigo
  ) as o;
  if cardinality(outras) > 0 and nova_profissao is null then
    raise exception 'profissao_principal_obrigatoria' using errcode = '22023';
  end if;
  if cardinality(outras) > 10 then
    raise exception 'formacoes_demais' using errcode = '22023';
  end if;

  update public.membro as m
  set profissao = nova_profissao::public.profissao_do_membro,
      cargo = novo_cargo::public.cargo_do_membro,
      outras_profissoes = outras::public.profissao_do_membro[],
      profissao_em_curso = coalesce(p_profissao_em_curso, m.profissao_em_curso)
  where m.id = alvo.id
    and (m.profissao is distinct from nova_profissao
         or m.cargo is distinct from novo_cargo
         or m.outras_profissoes::text[] is distinct from outras
         or m.profissao_em_curso is distinct from coalesce(p_profissao_em_curso, m.profissao_em_curso));
end;
$$;


revoke all on function public.definir_profissao_e_cargo(uuid, text, text, text[], boolean) from public, anon;
grant execute on function public.definir_profissao_e_cargo(uuid, text, text, text[], boolean) to authenticated;
