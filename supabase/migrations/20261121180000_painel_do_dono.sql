-- P8 · Painel do dono (ADR-0054): três leituras só da Gestão, sem tabela nova. Quem ordena e
-- classifica é o domínio (packages/domain/src/painel-do-dono.ts).
--
-- 1. painel_clientes_em_risco: por cliente (o empreendimento sem cliente vira a própria linha),
--    contagens de condicionante ou exigência atrasada, LAO perto (até 30 dias) ou além do limite de
--    protocolo sem protocolo, vencimento vencido, a receber vencido e o valor aprovado.
-- 2. painel_carga: próximas 2 semanas por pessoa (prazos abertos, atrasados e minutos das tarefas
--    de serviço), mais a linha "sem responsável".
-- 3. painel_dinheiro_por_cliente: aprovado, recebido, a receber e vencido (só com a permissão
--    financeira; P7).
-- Todas leem as fontes de private.linhas_de_prazo, que cada pacote só acrescenta.

create function public.painel_clientes_em_risco(p_consultoria_id uuid)
returns table (
  chave uuid,
  nome text,
  empreendimentos integer,
  prazos_atrasados integer,
  lao_alem_do_limite integer,
  lao_perto_do_limite integer,
  vencimentos_vencidos integer,
  receber_vencido_centavos bigint,
  aprovado_centavos bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  financeiro boolean;
begin
  if not private.is_gestao(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  financeiro := private.is_financeiro(p_consultoria_id);

  return query
  with emp as (
    select e.id, coalesce(e.cliente_id, e.id) as chave,
           coalesce(cl.nome, e.nome) as nome
    from public.empreendimento as e
    left join public.cliente as cl on cl.consultoria_id = e.consultoria_id and cl.id = e.cliente_id
    where e.consultoria_id = p_consultoria_id
  ),
  linhas as (
    select l.empreendimento_id, l.tipo_linha, l.dias
    from private.linhas_de_prazo(p_consultoria_id) as l
  ),
  prazos as (
    select emp.chave,
           count(*) filter (where l.tipo_linha in ('ocorrencia', 'exigencia') and l.dias < 0) as atrasados,
           count(*) filter (where l.tipo_linha = 'limite_protocolo' and l.dias < 0) as alem,
           count(*) filter (where l.tipo_linha = 'limite_protocolo' and l.dias between 0 and 30) as perto,
           count(*) filter (where l.tipo_linha in ('vencimento', 'validade') and l.dias < 0) as vencidos
    from linhas as l
    join emp on emp.id = l.empreendimento_id
    group by emp.chave
  ),
  dinheiro as (
    select emp.chave,
           sum(d.vencido_centavos) as vencido,
           sum(d.aprovado_centavos) as aprovado
    from private.dinheiro_dos_orcamentos(p_consultoria_id) as d
    join emp on emp.id = d.empreendimento_id
    where financeiro
    group by emp.chave
  ),
  aprovados as (
    -- Valor aprovado para ordenar o risco, mesmo sem a permissão financeira (é o que a Gestão já
    -- vê na lista de orçamentos).
    select emp.chave, sum(private.total_do_orcamento(o)) as aprovado
    from public.orcamento as o
    join emp on emp.id = o.empreendimento_id
    where o.consultoria_id = p_consultoria_id and o.situacao = 'aprovada' and o.excluido_em is null
    group by emp.chave
  ),
  clientes as (
    select emp.chave, min(emp.nome) as nome, count(*)::integer as empreendimentos
    from emp group by emp.chave
  )
  select c.chave, c.nome, c.empreendimentos,
         coalesce(p.atrasados, 0)::integer, coalesce(p.alem, 0)::integer, coalesce(p.perto, 0)::integer,
         coalesce(p.vencidos, 0)::integer, coalesce(d.vencido, 0)::bigint,
         coalesce(a.aprovado, 0)::bigint
  from clientes as c
  left join prazos as p on p.chave = c.chave
  left join dinheiro as d on d.chave = c.chave
  left join aprovados as a on a.chave = c.chave
  where coalesce(p.atrasados, 0) + coalesce(p.alem, 0) + coalesce(p.perto, 0) + coalesce(p.vencidos, 0) > 0
     or coalesce(d.vencido, 0) > 0;
end;
$$;

revoke all on function public.painel_clientes_em_risco(uuid) from public, anon;
grant execute on function public.painel_clientes_em_risco(uuid) to authenticated;

create function public.painel_carga(p_consultoria_id uuid)
returns table (
  membro_id uuid,
  nome text,
  prazos integer,
  atrasados integer,
  minutos_tarefas integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hoje date;
begin
  if not private.is_gestao(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  hoje := private.hoje_da_consultoria(p_consultoria_id);

  return query
  with prazos as (
    select l.responsavel_id,
           count(*) filter (where l.dias between 0 and 13) as abertos,
           count(*) filter (where l.dias < 0) as atrasados
    from private.linhas_de_prazo(p_consultoria_id) as l
    where private.tipo_linha_tem_responsavel(l.tipo_linha)
    group by l.responsavel_id
  ),
  tarefas as (
    select t.responsavel_id, sum(coalesce(t.minutos_estimados, 0)) as minutos
    from public.tarefa_servico as t
    where t.consultoria_id = p_consultoria_id
      and t.situacao in ('a_fazer', 'em_andamento')
      and t.prazo_interno between hoje and hoje + 13
    group by t.responsavel_id
  ),
  pessoas as (
    select m.id, m.nome from public.membro as m
    where m.consultoria_id = p_consultoria_id and m.situacao = 'ativo'
    union all
    select null::uuid, null::text
  )
  select pe.id, pe.nome,
         coalesce(p.abertos, 0)::integer, coalesce(p.atrasados, 0)::integer,
         coalesce(t.minutos, 0)::integer
  from pessoas as pe
  left join prazos as p on p.responsavel_id is not distinct from pe.id
  left join tarefas as t on t.responsavel_id is not distinct from pe.id
  where pe.id is not null
     or coalesce(p.abertos, 0) + coalesce(p.atrasados, 0) + coalesce(t.minutos, 0) > 0;
end;
$$;

revoke all on function public.painel_carga(uuid) from public, anon;
grant execute on function public.painel_carga(uuid) to authenticated;

create function public.painel_dinheiro_por_cliente(p_consultoria_id uuid)
returns table (
  chave uuid,
  nome text,
  aprovado_centavos bigint,
  recebido_centavos bigint,
  a_receber_centavos bigint,
  vencido_centavos bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_financeiro(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  return query
  select coalesce(e.cliente_id, e.id), min(coalesce(cl.nome, e.nome)),
         sum(d.aprovado_centavos)::bigint, sum(d.recebido_centavos)::bigint,
         sum(d.a_receber_centavos)::bigint, sum(d.vencido_centavos)::bigint
  from private.dinheiro_dos_orcamentos(p_consultoria_id) as d
  join public.empreendimento as e on e.consultoria_id = p_consultoria_id and e.id = d.empreendimento_id
  left join public.cliente as cl on cl.consultoria_id = e.consultoria_id and cl.id = e.cliente_id
  group by coalesce(e.cliente_id, e.id)
  order by sum(d.a_receber_centavos) desc, min(coalesce(cl.nome, e.nome));
end;
$$;

revoke all on function public.painel_dinheiro_por_cliente(uuid) from public, anon;
grant execute on function public.painel_dinheiro_por_cliente(uuid) to authenticated;
