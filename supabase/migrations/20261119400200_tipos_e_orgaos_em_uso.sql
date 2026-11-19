-- Tipos de instrumento e órgãos em uso pela consultoria, distintos no banco. A tela lia as linhas de
-- instrumento com limite (1000 e 500, sem ordem) e tirava as repetições no navegador: acima do
-- limite, valores sumiam do filtro da Visão da equipe e das sugestões de órgão.
--
--   listar_tipos_em_uso(consultoria)    tipos com pelo menos um instrumento, por sigla
--   listar_orgaos_em_uso(consultoria)   órgãos preenchidos nos instrumentos, sem repetir
--
-- Security invoker: a RLS de instrumento e tipo_instrumento decide o que aparece; de outra
-- consultoria vem zero linhas.

create function public.listar_tipos_em_uso(p_consultoria_id uuid)
returns table (id uuid, sigla text)
language sql
stable
set search_path = ''
as $$
  select t.id, t.sigla
  from public.tipo_instrumento as t
  where t.consultoria_id = p_consultoria_id
    and exists (
      select 1 from public.instrumento as i
      where i.consultoria_id = t.consultoria_id and i.tipo_id = t.id
    )
  order by t.sigla, t.id
$$;

create function public.listar_orgaos_em_uso(p_consultoria_id uuid)
returns table (orgao text)
language sql
stable
set search_path = ''
as $$
  select distinct i.orgao
  from public.instrumento as i
  where i.consultoria_id = p_consultoria_id and i.orgao is not null and i.orgao <> ''
  order by i.orgao
$$;

revoke all on function public.listar_tipos_em_uso(uuid) from public, anon;
revoke all on function public.listar_orgaos_em_uso(uuid) from public, anon;
grant execute on function public.listar_tipos_em_uso(uuid) to authenticated;
grant execute on function public.listar_orgaos_em_uso(uuid) to authenticated;
