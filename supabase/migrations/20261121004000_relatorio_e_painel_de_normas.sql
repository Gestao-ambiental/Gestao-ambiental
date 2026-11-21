-- Relatório e painel das normas (pacote L10, ADR-0050, LEG-10). Só leitura, só aditiva.
--
-- - listar_requisitos_da_consultoria: os requisitos de todos os empreendimentos, com o que o domínio
--   precisa para calcular a situação (o quadro Conformidade do Painel agrupa por empreendimento).
-- - listar_mudancas_do_empreendimento: mudanças publicadas que alcançaram o empreendimento desde uma
--   data, com o resumo revisado (relatório "Mudanças que afetam o empreendimento").
-- - normas_por_chave: resolve as normas citadas no texto de uma condicionante (base legal), a partir
--   das chaves que o domínio monta.

create function public.listar_requisitos_da_consultoria(
  p_consultoria_id uuid,
  p_limite integer default 500,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  empreendimento_id uuid,
  empreendimento_nome text,
  norma_titulo text,
  aplicavel boolean,
  avaliacao_resultado text,
  avaliada_em date,
  ultima_mudanca_publicada_em timestamptz,
  acao_prazo date,
  total bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id, r.empreendimento_id, e.nome, n.titulo, r.aplicavel,
    av.resultado, av.avaliada_em,
    (select max(m.publicada_em) from private.norma_mudanca as m
     where m.norma_id = r.norma_id and m.situacao = 'publicada'),
    (select min(a.prazo) from public.acao_legal as a
     where a.consultoria_id = r.consultoria_id and a.requisito_id = r.id and a.concluida_em is null),
    count(*) over ()
  from public.requisito_legal as r
  join public.empreendimento as e on e.consultoria_id = r.consultoria_id and e.id = r.empreendimento_id
  join private.norma as n on n.id = r.norma_id
  left join lateral (
    select x.resultado, x.avaliada_em
    from public.avaliacao_conformidade as x
    where x.consultoria_id = r.consultoria_id and x.requisito_id = r.id
    order by x.criado_em desc, x.id desc
    limit 1
  ) as av on true
  where r.consultoria_id = p_consultoria_id and private.is_membro(p_consultoria_id)
  order by e.nome, e.id, n.titulo, r.id
  limit least(greatest(coalesce(p_limite, 500), 1), 1000)
  offset greatest(coalesce(p_deslocamento, 0), 0)
$$;

create function public.listar_mudancas_do_empreendimento(
  p_consultoria_id uuid,
  p_empreendimento_id uuid,
  p_desde date
)
returns table (
  mudanca_id uuid,
  norma_id uuid,
  norma_titulo text,
  tipo_mudanca text,
  publicada_em timestamptz,
  resumo jsonb,
  url_oficial text,
  licencas text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id, n.id, n.titulo, m.tipo, m.publicada_em, m.resumo, n.url_oficial,
    coalesce(
      array_agg(distinct nullif(concat_ws(' ', t.sigla, i.numero), ''))
        filter (where i.id is not null),
      '{}'::text[])
  from public.aviso_norma as a
  join private.norma_mudanca as m on m.id = a.mudanca_id and m.situacao = 'publicada'
  join private.norma as n on n.id = m.norma_id
  left join public.instrumento as i on i.consultoria_id = a.consultoria_id and i.id = a.instrumento_id
  left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
  where a.consultoria_id = p_consultoria_id and a.empreendimento_id = p_empreendimento_id
    and private.is_membro(p_consultoria_id)
    and m.publicada_em >= coalesce(p_desde, '-infinity'::date)
  group by m.id, n.id, n.titulo, m.tipo, m.publicada_em, m.resumo, n.url_oficial
  order by m.publicada_em desc, m.id
  limit 200
$$;

-- Até 50 chaves por chamada; chave que não está no catálogo não volta.
create function public.normas_por_chave(p_chaves text[])
returns table (chave text, id uuid, titulo text, situacao_na_fonte text)
language sql
stable
security definer
set search_path = ''
as $$
  select n.chave, n.id, n.titulo, n.situacao_na_fonte
  from private.norma as n
  where n.chave = any (coalesce(p_chaves[1:50], '{}'::text[]))
    and private.membro_de_alguma_consultoria()
  order by n.chave
$$;

comment on function public.listar_requisitos_da_consultoria(uuid, integer, integer) is
  'Requisitos legais de todos os empreendimentos, para o quadro Conformidade do Painel (situação calculada no domínio).';
comment on function public.listar_mudancas_do_empreendimento(uuid, uuid, date) is
  'Mudanças de norma publicadas que alcançaram o empreendimento desde a data, com o resumo revisado.';
comment on function public.normas_por_chave(text[]) is
  'Normas do catálogo pelas chaves citadas no texto de uma condicionante (base legal). Até 50 chaves.';

revoke all on function public.listar_requisitos_da_consultoria(uuid, integer, integer) from public, anon;
revoke all on function public.listar_mudancas_do_empreendimento(uuid, uuid, date) from public, anon;
revoke all on function public.normas_por_chave(text[]) from public, anon;
grant execute on function public.listar_requisitos_da_consultoria(uuid, integer, integer) to authenticated;
grant execute on function public.listar_mudancas_do_empreendimento(uuid, uuid, date) to authenticated;
grant execute on function public.normas_por_chave(text[]) to authenticated;
