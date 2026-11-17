-- Recurso liberado para o front (ADR-0030): a tela pergunta se a consultoria pode usar um recurso
-- do plano hoje (ex.: 'capacidade' para o Planejamento e a jornada) e esconde o que não está no
-- plano. É só apresentação: as tabelas e RPCs de cada recurso continuam barrando no banco.
-- Só membro ativo da consultoria pergunta; recurso fora da lista é recusado.

create function public.recurso_liberado(p_consultoria_id uuid, p_recurso text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_membro(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_recurso is null
     or p_recurso not in ('capacidade', 'integracao_ima', 'financeiro', 'analise_lotes', 'ia', 'orcamentos') then
    raise exception 'recurso_invalido' using errcode = '22023';
  end if;
  return private.recurso_liberado(p_consultoria_id, p_recurso);
end;
$$;

revoke all on function public.recurso_liberado(uuid, text) from public, anon;
grant execute on function public.recurso_liberado(uuid, text) to authenticated;
