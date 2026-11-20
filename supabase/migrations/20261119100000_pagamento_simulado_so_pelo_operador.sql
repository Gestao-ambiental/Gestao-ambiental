-- Pagamento simulado só pelo operador da plataforma (ADR-0026, atualização de 19/11/2026).
--
-- Antes, pagar_cobranca_simulada aceitava qualquer Gestão da consultoria: a Gestão marcava a
-- própria cobrança como paga e saía do só leitura sem pagar nada. Agora exige o operador com dois
-- fatores (private.exigir_operador, como as RPCs central_*). A Gestão recebe 'sem_permissao'.
-- Enquanto não há integração com o Asaas, quem confirma o pagamento é a central
-- (central_simular_pagamento ou esta RPC, por cobrança). Idempotente como antes.

create or replace function public.pagar_cobranca_simulada(p_cobranca_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.cobranca;
  v_hoje date;
begin
  perform private.exigir_operador();
  select * into alvo from public.cobranca as cb where cb.id = p_cobranca_id;
  if not found then
    raise exception 'cobranca_inexistente' using errcode = 'P0001';
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

revoke all on function public.pagar_cobranca_simulada(uuid) from public, anon;
grant execute on function public.pagar_cobranca_simulada(uuid) to authenticated;
