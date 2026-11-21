-- Minha semana: visão pessoal que junta, numa lista só, os prazos da pessoa logada em todas as
-- consultorias em que ela é membro ativo.
--
-- Regras:
-- 1. Quem é a pessoa vem só de auth.uid(). A função não recebe consultoria_id: as consultorias são
--    as dos vínculos ativos da pessoa em public.membro (o acesso de suporte não conta, porque o
--    suporte não tem membro e nada é "dele").
-- 2. Cada linha vem de private.linhas_de_prazo (todas as fontes: ocorrência, exigência, ação de
--    requisito legal e as que vierem), filtrada pelo responsável = o membro da pessoa naquela
--    consultoria. Meta interna da ocorrência entra como evento 'meta', como no calendário.
-- 3. security invoker: a RLS de quem chama continua decidindo o que aparece. Membro desligado não
--    tem vínculo ativo e não vê nada.
-- 4. Consultoria em só leitura comercial ou suspensa/arquivada aparece, marcada (somente_leitura e
--    situacao_consultoria). Leitura nunca é barrada.
-- 5. Situação e atraso são calculados: `dias` = prazo − hoje no fuso de cada consultoria.
-- 6. p_ate é obrigatório (o default nulo só deixa o p_de opcional na assinatura). p_de nulo traz tudo o que ainda não foi concluído até p_ate (inclui os atrasados). Com p_de,
--    o intervalo vai até 62 dias, como no calendário.
-- 7. Paginada: p_limite (1 a 100) e p_deslocamento; `total` é o total de linhas do período.

create function public.minha_semana(
  p_de date default null,
  p_ate date default null,
  p_limite integer default 50,
  p_deslocamento integer default 0
)
returns table (
  consultoria_id uuid,
  consultoria_nome text,
  somente_leitura boolean,
  situacao_consultoria text,
  tipo_evento text,
  tipo_linha text,
  data date,
  id uuid,
  instrumento_id uuid,
  empreendimento_id uuid,
  codigo text,
  titulo text,
  empreendimento_nome text,
  unidade_nome text,
  licenca text,
  dias integer,
  em_conferencia boolean,
  total bigint
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_ate is null or (p_de is not null and (p_ate < p_de or p_ate - p_de > 62)) then
    raise exception 'intervalo_invalido' using errcode = '22023';
  end if;
  if p_limite is null or p_limite < 1 or p_limite > 100
     or p_deslocamento is null or p_deslocamento < 0 then
    raise exception 'paginacao_invalida' using errcode = '22023';
  end if;

  return query
  with meus as (
    select m.consultoria_id, m.id as membro_id, c.nome, c.situacao::text as situacao
    from public.membro as m
    join public.consultoria as c on c.id = m.consultoria_id
    where m.usuario_id = (select auth.uid()) and m.situacao = 'ativo'
  ),
  linhas as (
    select me.consultoria_id, me.nome, me.situacao, l.*
    from meus as me
    cross join lateral private.linhas_de_prazo(me.consultoria_id) as l
    where l.responsavel_id = me.membro_id
  ),
  eventos as (
    select
      l.consultoria_id, l.nome, l.situacao,
      case l.tipo_linha when 'ocorrencia' then 'prazo' else l.tipo_linha end as tipo_evento,
      l.tipo_linha, l.prazo as data, l.id, l.instrumento_id, l.empreendimento_id, l.codigo, l.titulo,
      l.empreendimento_nome, l.unidade_nome, l.licenca, l.dias,
      coalesce(l.situacao_ocorrencia = 'em_conferencia', false) as em_conferencia
    from linhas as l
    where l.prazo <= p_ate and (p_de is null or l.prazo >= p_de)
    union all
    select
      l.consultoria_id, l.nome, l.situacao, 'meta', l.tipo_linha, l.meta_interna, l.id,
      l.instrumento_id, l.empreendimento_id, l.codigo, l.titulo, l.empreendimento_nome,
      l.unidade_nome, l.licenca, l.dias,
      coalesce(l.situacao_ocorrencia = 'em_conferencia', false)
    from linhas as l
    where l.tipo_linha = 'ocorrencia' and l.meta_interna is not null
      and l.meta_interna <= p_ate and (p_de is null or l.meta_interna >= p_de)
  )
  select
    e.consultoria_id, e.nome, private.consultoria_somente_leitura(e.consultoria_id), e.situacao,
    e.tipo_evento, e.tipo_linha, e.data, e.id, e.instrumento_id, e.empreendimento_id, e.codigo,
    e.titulo, e.empreendimento_nome, e.unidade_nome, e.licenca, e.dias, e.em_conferencia,
    count(*) over ()
  from eventos as e
  -- Mesma ordem de ordenarItensDaSemana (packages/domain/src/minha-semana.ts).
  order by e.data, e.nome, e.consultoria_id,
    case e.tipo_evento when 'prazo' then 1 when 'exigencia' then 2 when 'acao_legal' then 3
      when 'meta' then 4 else 5 end,
    e.titulo, e.id
  limit p_limite offset p_deslocamento;
end;
$$;

revoke all on function public.minha_semana(date, date, integer, integer) from public, anon;
grant execute on function public.minha_semana(date, date, integer, integer) to authenticated;

comment on function public.minha_semana(date, date, integer, integer) is
  'Minha semana: prazos da pessoa logada (responsável = o membro dela) em todas as consultorias em que é membro ativo, paginados. Sem consultoria_id do cliente.';
