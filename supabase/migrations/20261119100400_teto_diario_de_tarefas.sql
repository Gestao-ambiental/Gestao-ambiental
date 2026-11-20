-- Teto diário do tempo ativo por pessoa (ADR-0027, atualização de 19/11/2026).
--
-- registrar_tarefa limitava cada linha (30 min no acompanhamento, 8 h nas outras; quantidade até
-- 1000), mas não o total: qualquer membro chamava a RPC sem parar e distorcia as horas poupadas
-- (minutos medidos por condicionante, condicionantes com IA, horas de acompanhamento). Agora, por
-- membro e por dia (no fuso da consultoria):
--   segundos ativos  no máximo 24 horas (ninguém fica ativo mais que o dia);
--   quantidade       no máximo 1000 (o mesmo teto que já valia por linha).
-- Passou do teto: 'limite_diario_de_tarefas' e nada é gravado (o front já ignora erro da medição).
-- A linha do membro é travada para que chamadas simultâneas não passem juntas do teto.

create or replace function public.registrar_tarefa(
  p_consultoria_id uuid,
  p_tipo text,
  p_quantidade integer,
  p_segundos integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid;
  v_quantidade integer;
  v_segundos integer;
  v_inicio_do_dia timestamptz;
  v_soma_segundos bigint;
  v_soma_quantidade bigint;
begin
  if p_tipo is null or p_tipo not in (
    'cadastro_licenca_ia', 'cadastro_condicionante_manual', 'acompanhamento', 'orcamento'
  ) then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if p_quantidade is null or p_quantidade < 1 or p_segundos is null or p_segundos < 1 then
    raise exception 'tarefa_invalida' using errcode = '22023';
  end if;

  select m.id into eu
  from public.membro as m
  where m.consultoria_id = p_consultoria_id
    and m.usuario_id = (select auth.uid())
    and m.situacao = 'ativo'
  for update;
  if eu is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  v_quantidade := least(p_quantidade, 1000);
  v_segundos := least(p_segundos, case when p_tipo = 'acompanhamento' then 1800 else 28800 end);

  select (private.hoje_da_consultoria(c.id)::timestamp at time zone c.fuso) into v_inicio_do_dia
  from public.consultoria as c
  where c.id = p_consultoria_id;
  select coalesce(sum(t.segundos_ativos), 0), coalesce(sum(t.quantidade), 0)
  into v_soma_segundos, v_soma_quantidade
  from public.tarefa_cronometrada as t
  where t.consultoria_id = p_consultoria_id and t.membro_id = eu and t.instante >= v_inicio_do_dia;
  if v_soma_segundos + v_segundos > 86400 or v_soma_quantidade + v_quantidade > 1000 then
    raise exception 'limite_diario_de_tarefas' using errcode = 'P0001';
  end if;

  insert into public.tarefa_cronometrada (consultoria_id, membro_id, tipo, quantidade, segundos_ativos)
  values (p_consultoria_id, eu, p_tipo, v_quantidade, v_segundos);
end;
$$;

revoke all on function public.registrar_tarefa(uuid, text, integer, integer) from public, anon;
grant execute on function public.registrar_tarefa(uuid, text, integer, integer) to authenticated;
