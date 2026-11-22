-- A equipe pode obter apenas o caminho da logo atual para identificar a consultoria no menu.
-- Os demais dados da proposta e a edição da logo conservam as permissões de Gestão.
create function public.obter_logo_da_consultoria(p_consultoria_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select v.caminho
  from public.consultoria_identidade as i
  join public.documento as d
    on d.consultoria_id = i.consultoria_id and d.id = i.logo_documento_id
  join public.documento_versao as v
    on v.consultoria_id = d.consultoria_id and v.id = d.versao_vigente_id
  where i.consultoria_id = p_consultoria_id
    and d.excluido_em is null
    and (select private.is_membro(p_consultoria_id))
$$;

revoke all on function public.obter_logo_da_consultoria(uuid) from public, anon;
grant execute on function public.obter_logo_da_consultoria(uuid) to authenticated;
