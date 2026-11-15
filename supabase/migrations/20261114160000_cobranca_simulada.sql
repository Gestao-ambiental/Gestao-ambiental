-- Cobrança SIMULADA do protótipo (ADR-0026; mudança de escopo do Eduardo de 14/11/2026: ver as
-- telas funcionando, sem integração real com o Asaas). A integração real (Edge Functions, webhook,
-- ids do Asaas) fica para depois; as colunas asaas_* existem e ficam nulas.
--
--   assinar_plano_simulado     a Gestão escolhe plano, ciclo e forma: grava a assinatura e a
--                              primeira cobrança pendente (com assinatura ativa, troca de plano a
--                              partir do próximo ciclo).
--   pagar_cobranca_simulada    "Confirmar pagamento" do diálogo de pagamento simulado.
--   cancelar_plano_simulado    o plano vale até o fim do período pago.
--   central_simular_atraso     operador (dois fatores): deixa a cobrança vencida com vencimento
--                              retroativo, para demonstrar a faixa de atraso e o só leitura.
--   central_simular_pagamento  operador (dois fatores): paga as cobranças em aberto.
-- O documento de quem paga (CNPJ ou CPF) NÃO passa por aqui: a tela só valida e descarta.

-- Fim do período pago do plano: o último vencimento pago mais um ciclo, menos um dia. Sem nada
-- pago: ontem (a assinatura deixa de valer na hora).
create function private.fim_do_periodo_pago(cid uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (max(cb.vencimento) + case when a.ciclo = 'anual' then interval '1 year' else interval '1 month' end
             - interval '1 day')::date
     from public.cobranca as cb
     join public.assinatura as a on a.consultoria_id = cb.consultoria_id
     where cb.consultoria_id = cid and cb.tipo = 'plano' and cb.situacao = 'paga'
     group by a.ciclo),
    private.hoje_da_consultoria(cid) - 1
  )
$$;

-- Primeiro vencimento de uma assinatura nova: hoje, o dia seguinte ao fim do teste (beta incluído)
-- ou o dia seguinte ao período já pago de uma assinatura cancelada (primeiroVencimento do domínio).
create function private.primeiro_vencimento(cid uuid)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoje date := private.hoje_da_consultoria(cid);
  s record;
  v_pago_ate date;
begin
  select * into s from private.situacao_comercial_em(cid, v_hoje);
  select a.valida_ate into v_pago_ate from public.assinatura as a where a.consultoria_id = cid;
  return greatest(v_hoje, s.teste_ate + 1, coalesce(v_pago_ate + 1, v_hoje));
end;
$$;

revoke all on function private.fim_do_periodo_pago(uuid) from public, anon, authenticated;
revoke all on function private.primeiro_vencimento(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Gestão
-- ---------------------------------------------------------------------------

-- Assinar (sem assinatura ativa) ou trocar de plano (com assinatura ativa: vale a partir do próximo
-- vencimento). Devolve a cobrança criada (nula na troca) e o dia da mudança (nulo na assinatura).
create function public.assinar_plano_simulado(
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

-- Pagamento simulado de uma cobrança em aberto (o "Confirmar pagamento" do diálogo). Idempotente.
create function public.pagar_cobranca_simulada(p_cobranca_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.cobranca;
  v_hoje date;
begin
  select * into alvo from public.cobranca as cb where cb.id = p_cobranca_id;
  if not found or not private.is_gestao_vinculada(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.situacao not in ('pendente', 'vencida') then
    return;
  end if;
  v_hoje := private.hoje_da_consultoria(alvo.consultoria_id);
  update public.cobranca as cb
  set situacao = 'paga', pago_em = v_hoje, atualizada_em = now()
  where cb.id = alvo.id;
  if alvo.tipo = 'plano' then
    update public.assinatura as a
    set proximo_vencimento = (alvo.vencimento
          + case when a.ciclo = 'anual' then interval '1 year' else interval '1 month' end)::date,
        atualizada_em = now()
    where a.id = alvo.assinatura_id;
  end if;
end;
$$;

-- Cancelar: o plano vale até o fim do período pago; cobranças ainda não vencidas saem.
create function public.cancelar_plano_simulado(p_consultoria_id uuid)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_valida date;
begin
  if not private.is_gestao_vinculada(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  update public.assinatura as a
  set cancelada_em = now(),
      valida_ate = private.fim_do_periodo_pago(p_consultoria_id),
      situacao_asaas = 'INACTIVE',
      plano_agendado = null, ciclo_agendado = null, mudanca_em = null,
      atualizada_em = now(),
      row_version = a.row_version + 1
  where a.consultoria_id = p_consultoria_id and a.cancelada_em is null;
  update public.cobranca as cb
  set situacao = 'removida', atualizada_em = now()
  where cb.consultoria_id = p_consultoria_id and cb.situacao = 'pendente';
  select a.valida_ate into v_valida from public.assinatura as a where a.consultoria_id = p_consultoria_id;
  if v_valida is null then
    raise exception 'sem_assinatura' using errcode = 'P0001';
  end if;
  return v_valida;
end;
$$;

-- ---------------------------------------------------------------------------
-- Central (operador com dois fatores): demonstração do atraso e do pagamento
-- ---------------------------------------------------------------------------

-- Deixa a cobrança do plano em aberto mais antiga vencida há p_dias (1 a 60); sem cobrança em
-- aberto, cria uma vencida. Com mais de 2 dias úteis, a consultoria fica somente leitura.
create function public.central_simular_atraso(p_consultoria_id uuid, p_dias integer default 5)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assinatura public.assinatura;
  v_id uuid;
  v_hoje date;
begin
  perform private.exigir_operador();
  if p_dias is null or p_dias < 1 or p_dias > 60 then
    raise exception 'dias_invalidos' using errcode = '22023';
  end if;
  select * into v_assinatura from public.assinatura as a where a.consultoria_id = p_consultoria_id;
  if v_assinatura.id is null or v_assinatura.cancelada_em is not null then
    raise exception 'sem_assinatura' using errcode = 'P0001';
  end if;
  v_hoje := private.hoje_da_consultoria(p_consultoria_id);
  select cb.id into v_id from public.cobranca as cb
  where cb.consultoria_id = p_consultoria_id and cb.tipo = 'plano' and cb.situacao in ('pendente', 'vencida')
  order by cb.vencimento, cb.id
  limit 1;
  if v_id is null then
    insert into public.cobranca (consultoria_id, assinatura_id, tipo, valor_centavos, vencimento, situacao, forma)
    values (p_consultoria_id, v_assinatura.id, 'plano',
            private.valor_do_ciclo(v_assinatura.plano, v_assinatura.ciclo), v_hoje - p_dias, 'vencida',
            v_assinatura.forma)
    returning id into v_id;
  else
    update public.cobranca as cb
    set situacao = 'vencida', vencimento = v_hoje - p_dias, atualizada_em = now()
    where cb.id = v_id;
  end if;
  return v_id;
end;
$$;

-- Paga todas as cobranças em aberto da consultoria. Devolve quantas pagou.
create function public.central_simular_pagamento(p_consultoria_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
begin
  perform private.exigir_operador();
  update public.cobranca as cb
  set situacao = 'paga', pago_em = private.hoje_da_consultoria(p_consultoria_id), atualizada_em = now()
  where cb.consultoria_id = p_consultoria_id and cb.situacao in ('pendente', 'vencida');
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke all on function public.assinar_plano_simulado(uuid, text, text, text) from public, anon;
revoke all on function public.pagar_cobranca_simulada(uuid) from public, anon;
revoke all on function public.cancelar_plano_simulado(uuid) from public, anon;
revoke all on function public.central_simular_atraso(uuid, integer) from public, anon;
revoke all on function public.central_simular_pagamento(uuid) from public, anon;
grant execute on function public.assinar_plano_simulado(uuid, text, text, text) to authenticated;
grant execute on function public.pagar_cobranca_simulada(uuid) to authenticated;
grant execute on function public.cancelar_plano_simulado(uuid) to authenticated;
grant execute on function public.central_simular_atraso(uuid, integer) to authenticated;
grant execute on function public.central_simular_pagamento(uuid) to authenticated;
