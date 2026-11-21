-- Cores por categoria no calendário (pedido do Eduardo, 20/11/2026): para colorir por pessoa ou
-- por área (a profissão do responsável), a tela precisa do responsável pelo id, nunca pelo nome.
-- A função ganha a coluna responsavel_id no fim; o resto fica igual (mesmos argumentos, mesma
-- ordem das colunas, mesma regra de acesso). Quem já chamava continua funcionando.

drop function public.listar_calendario(uuid, date, date, uuid, uuid, boolean);

create function public.listar_calendario(
  p_consultoria_id uuid,
  p_de date,
  p_ate date,
  p_responsavel_id uuid default null,
  p_unidade_id uuid default null,
  p_sem_responsavel boolean default false
)
returns table (
  tipo_evento text,
  data date,
  id uuid,
  instrumento_id uuid,
  codigo text,
  titulo text,
  empreendimento_nome text,
  unidade_nome text,
  licenca text,
  responsavel_nome text,
  sem_responsavel boolean,
  dias integer,
  responsavel_id uuid
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 62 then
    raise exception 'intervalo_invalido' using errcode = '22023';
  end if;

  return query
  with linhas as (
    select * from private.linhas_de_prazo(p_consultoria_id) as l
    where (p_responsavel_id is null or l.responsavel_id = p_responsavel_id)
      and (p_unidade_id is null or l.unidade_id = p_unidade_id)
      and (not coalesce(p_sem_responsavel, false) or (l.tipo_linha = 'ocorrencia' and l.responsavel_id is null))
  )
  select
    case l.tipo_linha when 'ocorrencia' then 'prazo' else l.tipo_linha end,
    l.prazo, l.id, l.instrumento_id, l.codigo, l.titulo, l.empreendimento_nome, l.unidade_nome, l.licenca,
    l.responsavel_nome, l.tipo_linha = 'ocorrencia' and l.responsavel_id is null, l.dias, l.responsavel_id
  from linhas as l
  where l.prazo between p_de and p_ate
  union all
  select
    'meta', l.meta_interna, l.id, l.instrumento_id, l.codigo, l.titulo, l.empreendimento_nome, l.unidade_nome,
    l.licenca, l.responsavel_nome, l.responsavel_id is null, l.dias, l.responsavel_id
  from linhas as l
  where l.tipo_linha = 'ocorrencia' and l.meta_interna between p_de and p_ate
  order by 2, 1, 5, 3;
end;
$$;

revoke all on function public.listar_calendario(uuid, date, date, uuid, uuid, boolean) from public, anon;
grant execute on function public.listar_calendario(uuid, date, date, uuid, uuid, boolean) to authenticated;
