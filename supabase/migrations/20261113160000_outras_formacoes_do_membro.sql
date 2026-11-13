-- Outras formações do membro (ADR-0021 §6; decisões do Eduardo em 13/11/2026).
-- 1. A pessoa pode ter várias formações. membro.profissao continua sendo a principal: é ela que
--    aparece no orçamento, na Equipe e no custo por profissão. As outras ficam em
--    membro.outras_profissoes, com os mesmos códigos da lista fixa.
-- 2. Só formações concluídas (a tela avisa; o banco não tem como conferir).
-- 3. Sem principal não há outras; a principal nunca se repete nas outras; nenhuma se repete.
-- 4. definir_profissao_e_cargo ganha p_outras_profissoes: nulo mantém as que já estão.

alter table public.membro
  add column outras_profissoes public.profissao_do_membro[] not null default '{}';

comment on column public.membro.outras_profissoes is
  'Outras formações concluídas, além da principal (membro.profissao). Códigos da lista fixa (ADR-0021).';

-- Sem repetição dentro da lista (immutable para caber num check).
create function private.sem_repeticao(p_lista text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(p_lista) = (select count(distinct x) from unnest(p_lista) as x)
$$;

revoke all on function private.sem_repeticao(text[]) from public, anon, authenticated;

alter table public.membro
  add constraint membro_outras_profissoes_com_principal
    check (cardinality(outras_profissoes) = 0 or profissao is not null),
  add constraint membro_outras_profissoes_sem_principal
    check (profissao is null or not (profissao = any (outras_profissoes))),
  add constraint membro_outras_profissoes_sem_repeticao
    check (private.sem_repeticao(outras_profissoes::text[])),
  add constraint membro_outras_profissoes_limite
    check (cardinality(outras_profissoes) <= 10);

drop function public.definir_profissao_e_cargo(uuid, text, text);

-- Define profissão principal, cargo e outras formações. A própria pessoa ou a Gestão; nulo na
-- principal ou no cargo limpa; nulo nas outras mantém as atuais. Trocar a principal por uma das
-- outras tira essa das outras. Repetir não muda nada.
create function public.definir_profissao_e_cargo(
  p_membro_id uuid,
  p_profissao text,
  p_cargo text,
  p_outras_profissoes text[] default null
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
      outras_profissoes = outras::public.profissao_do_membro[]
  where m.id = alvo.id
    and (m.profissao is distinct from nova_profissao
         or m.cargo is distinct from novo_cargo
         or m.outras_profissoes::text[] is distinct from outras);
end;
$$;

revoke all on function public.definir_profissao_e_cargo(uuid, text, text, text[]) from public, anon;
grant execute on function public.definir_profissao_e_cargo(uuid, text, text, text[]) to authenticated;
