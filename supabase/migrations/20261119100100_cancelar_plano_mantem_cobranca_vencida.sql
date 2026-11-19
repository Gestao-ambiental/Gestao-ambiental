-- Cancelar o plano não apaga dívida (ADR-0026, atualização de 19/11/2026).
--
-- Antes, cancelar_plano_simulado marcava como 'removida' TODA cobrança pendente, inclusive as já
-- vencidas. Uma consultoria bloqueada cancelava (a dívida sumia) e assinava de novo: voltava a
-- escrever sem pagar. Agora:
--   cancelar_plano_simulado  só remove as cobranças que ainda não venceram (vencimento >= hoje da
--                            consultoria; a mesma regra do atraso, que conta vencimento < hoje).
--   assinar_plano_simulado   uma assinatura nova (sem plano ativo) é recusada com
--                            'cobranca_em_atraso' enquanto houver cobrança em aberto vencida.
--                            A troca de plano com assinatura ativa não muda.

create or replace function public.cancelar_plano_simulado(p_consultoria_id uuid)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_valida date;
  v_hoje date;
begin
  if not private.is_gestao_vinculada(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  v_hoje := private.hoje_da_consultoria(p_consultoria_id);
  update public.assinatura as a
  set cancelada_em = now(),
      valida_ate = private.fim_do_periodo_pago(p_consultoria_id),
      situacao_asaas = 'INACTIVE',
      plano_agendado = null, ciclo_agendado = null, mudanca_em = null,
      atualizada_em = now(),
      row_version = a.row_version + 1
  where a.consultoria_id = p_consultoria_id and a.cancelada_em is null;
  -- Só as que ainda não venceram; as vencidas continuam devidas.
  update public.cobranca as cb
  set situacao = 'removida', atualizada_em = now()
  where cb.consultoria_id = p_consultoria_id and cb.situacao = 'pendente' and cb.vencimento >= v_hoje;
  select a.valida_ate into v_valida from public.assinatura as a where a.consultoria_id = p_consultoria_id;
  if v_valida is null then
    raise exception 'sem_assinatura' using errcode = 'P0001';
  end if;
  return v_valida;
end;
$$;

create or replace function public.assinar_plano_simulado(
  p_consultoria_id uuid,
  p_plano text,
  p_ciclo text,
  p_forma text
)
returns table (cobranca_id uuid, mudanca_em date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoje date;
  v_interna boolean;
  v_atual public.assinatura;
  v_vencimento date;
  v_assinatura uuid;
  v_cobranca uuid;
  v_adicionais integer;
  v_mudanca date;
begin
  if not private.is_gestao_vinculada(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_plano is null or p_plano not in ('essencial', 'equipe', 'escala') then
    raise exception 'plano_invalido' using errcode = '22023';
  end if;
  if p_ciclo is null or p_ciclo not in ('mensal', 'anual') then
    raise exception 'ciclo_invalido' using errcode = '22023';
  end if;
  if p_forma is null or p_forma not in ('pix', 'cartao') then
    raise exception 'forma_invalida' using errcode = '22023';
  end if;
  perform 1 from public.consultoria as c where c.id = p_consultoria_id for update;
  select coalesce(cc.interna, false) into v_interna
  from public.consultoria as c
  left join public.consultoria_condicao_comercial as cc on cc.consultoria_id = c.id
  where c.id = p_consultoria_id;
  if v_interna then
    raise exception 'conta_interna_sem_cobranca' using errcode = 'P0001';
  end if;
  v_hoje := private.hoje_da_consultoria(p_consultoria_id);

  select * into v_atual from public.assinatura as a where a.consultoria_id = p_consultoria_id;

  if v_atual.id is not null and v_atual.cancelada_em is null then
    -- Troca: consolida uma troca já vencida e agenda a nova para o próximo vencimento.
    update public.assinatura as a
    set plano = coalesce(a.plano_agendado, a.plano),
        ciclo = coalesce(a.ciclo_agendado, a.ciclo),
        plano_agendado = null, ciclo_agendado = null, mudanca_em = null
    where a.id = v_atual.id and a.mudanca_em is not null and a.mudanca_em <= v_hoje;
    select * into v_atual from public.assinatura as a where a.id = v_atual.id;
    v_mudanca := greatest(coalesce(v_atual.proximo_vencimento, v_hoje + 1), v_hoje + 1);
    if p_plano = v_atual.plano and p_ciclo = v_atual.ciclo then
      v_mudanca := null;
    end if;
    update public.assinatura as a
    set plano_agendado = case when v_mudanca is null then null else p_plano end,
        ciclo_agendado = case when v_mudanca is null then null else p_ciclo end,
        mudanca_em = v_mudanca,
        forma = p_forma,
        atualizada_em = now(),
        row_version = a.row_version + 1
    where a.id = v_atual.id;
    return query select null::uuid, v_mudanca;
    return;
  end if;

  -- Assinatura nova: não com dívida vencida (cancelar e assinar de novo não apaga o atraso).
  if exists (
    select 1 from public.cobranca as cb
    where cb.consultoria_id = p_consultoria_id and cb.situacao in ('pendente', 'vencida')
      and cb.vencimento < v_hoje
  ) then
    raise exception 'cobranca_em_atraso' using errcode = 'P0001';
  end if;

  v_vencimento := private.primeiro_vencimento(p_consultoria_id);
  insert into public.assinatura as a (consultoria_id, plano, ciclo, forma, proximo_vencimento)
  values (p_consultoria_id, p_plano, p_ciclo, p_forma, v_vencimento)
  on conflict (consultoria_id) do update
    set plano = excluded.plano, ciclo = excluded.ciclo, forma = excluded.forma,
        plano_agendado = null, ciclo_agendado = null, mudanca_em = null,
        situacao_asaas = 'ACTIVE', proximo_vencimento = excluded.proximo_vencimento,
        cancelada_em = null, valida_ate = null, atualizada_em = now(), row_version = a.row_version + 1
  returning a.id into v_assinatura;

  insert into public.cobranca (consultoria_id, assinatura_id, tipo, valor_centavos, vencimento, situacao, forma)
  values (p_consultoria_id, v_assinatura, 'plano', private.valor_do_ciclo(p_plano, p_ciclo), v_vencimento,
          'pendente', p_forma)
  returning id into v_cobranca;

  v_adicionais := private.adicionais_centavos(p_plano, private.pessoas_ativas(p_consultoria_id),
                                              private.empreendimentos_ativos(p_consultoria_id));
  if v_adicionais > 0 then
    insert into public.cobranca (consultoria_id, assinatura_id, tipo, valor_centavos, vencimento, situacao, forma)
    values (p_consultoria_id, v_assinatura, 'adicionais', v_adicionais, v_vencimento, 'pendente', p_forma);
  end if;

  return query select v_cobranca, null::date;
end;
$$;

revoke all on function public.cancelar_plano_simulado(uuid) from public, anon;
revoke all on function public.assinar_plano_simulado(uuid, text, text, text) from public, anon;
grant execute on function public.cancelar_plano_simulado(uuid) to authenticated;
grant execute on function public.assinar_plano_simulado(uuid, text, text, text) to authenticated;
