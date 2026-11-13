-- Profissão principal obrigatória depois de preenchida (decisão do Eduardo em 13/11/2026,
-- ADR-0021 §7): definir_profissao_e_cargo recusa apagar a principal; só troca por outra. Quem
-- ainda não tem profissão continua podendo salvar só o cargo.

create or replace function public.definir_profissao_e_cargo(
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
      outras_profissoes = outras::public.profissao_do_membro[]
  where m.id = alvo.id
    and (m.profissao is distinct from nova_profissao
         or m.cargo is distinct from novo_cargo
         or m.outras_profissoes::text[] is distinct from outras);
end;
$$;

