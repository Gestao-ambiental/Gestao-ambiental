-- Compatibilidade: a 20261119400100 trocou public.listar_vistorias para exigir a consultoria
-- (p_consultoria_id). As telas que ainda não foram atualizadas (o beta no ar e as camadas sem a
-- vistoria-geral) chamam a assinatura antiga, de 4 parâmetros, e passaram a dar erro no Campo.
-- Esta migration recria a assinatura antiga, igual à da 20261115030000_vistoria_movel, ao lado da
-- nova. O PostgREST escolhe pela lista de parâmetros: com p_consultoria_id vai a nova; sem ela, a
-- antiga. Tirar quando todas as telas passarem a consultoria.

create function public.listar_vistorias(
  p_ocorrencia_id uuid default null,
  p_somente_minhas boolean default false,
  p_limite integer default 50,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  consultoria_id uuid,
  ocorrencia_id uuid,
  titulo text,
  responsavel_id uuid,
  responsavel_nome text,
  data_planejada date,
  hora_planejada time,
  duracao_minutos integer,
  situacao public.situacao_vistoria,
  iniciada_em timestamptz,
  enviada_em timestamptz,
  condicionante_codigo text,
  condicionante_titulo text,
  empreendimento_id uuid,
  empreendimento_nome text,
  unidade_id uuid,
  unidade_nome text,
  licenca text,
  total_itens integer,
  itens_registrados integer,
  hoje date,
  row_version integer,
  total bigint
)
language sql
stable
set search_path = ''
as $$
  select v.id, v.consultoria_id, v.ocorrencia_id, v.titulo, v.responsavel_id, r.nome,
         v.data_planejada, v.hora_planejada, v.duracao_minutos, v.situacao, v.iniciada_em, v.enviada_em,
         c.codigo, cv.titulo, e.id, e.nome, u.id, u.nome,
         nullif(concat_ws(' ', t.sigla, i.numero), ''),
         (select count(*)::integer from public.vistoria_item as it
          where it.consultoria_id = v.consultoria_id and it.vistoria_id = v.id),
         (select count(*)::integer from public.vistoria_item as it
          where it.consultoria_id = v.consultoria_id and it.vistoria_id = v.id and it.resultado <> 'pendente'),
         private.hoje_da_consultoria(v.consultoria_id),
         v.row_version,
         count(*) over ()
  from public.vistoria as v
  join public.ocorrencia as o on o.consultoria_id = v.consultoria_id and o.id = v.ocorrencia_id
  join public.instrumento as i on i.consultoria_id = o.consultoria_id and i.id = o.instrumento_id
  join public.unidade as u on u.consultoria_id = i.consultoria_id and u.id = i.unidade_id
  join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
  left join public.condicionante_versao as cv on cv.consultoria_id = o.consultoria_id and cv.id = o.condicionante_versao_id
  left join public.condicionante as c on c.consultoria_id = cv.consultoria_id and c.id = cv.condicionante_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  left join public.membro as r on r.consultoria_id = v.consultoria_id and r.id = v.responsavel_id
  where (p_ocorrencia_id is null or v.ocorrencia_id = p_ocorrencia_id)
    and (not coalesce(p_somente_minhas, false) or v.responsavel_id = private.membro_atual(v.consultoria_id))
  order by v.data_planejada, v.hora_planejada nulls last, v.criada_em, v.id
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0)
$$;

comment on function public.listar_vistorias(uuid, boolean, integer, integer) is
  'Assinatura antiga, sem a consultoria, mantida para as telas que ainda não passam p_consultoria_id.';

revoke all on function public.listar_vistorias(uuid, boolean, integer, integer) from public, anon;
grant execute on function public.listar_vistorias(uuid, boolean, integer, integer) to authenticated;
