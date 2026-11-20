-- Pagamento pela central avança o próximo vencimento (ADR-0026, atualização de 19/11/2026).
--
-- Com pagar_cobranca_simulada só para o operador e sem botão na Gestão, o único pagamento ligado a
-- uma tela é central_simular_pagamento. Ela marcava as cobranças como pagas, mas não mexia na
-- assinatura: proximo_vencimento ficava na data já paga. A troca de plano (que vale a partir de
-- greatest(proximo_vencimento, amanhã)) passava a valer no dia seguinte, e a página Plano mostrava
-- como próximo vencimento uma data paga. Agora, como pagar_cobranca_simulada, a cobrança de plano
-- paga leva proximo_vencimento a um ciclo depois do vencimento dela (a mais recente, quando há
-- mais de uma). Mesma assinatura: as permissões continuam as de antes.

create or replace function public.central_simular_pagamento(p_consultoria_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_ultimo date;
begin
  perform private.exigir_operador();
  with pagas as (
    update public.cobranca as cb
    set situacao = 'paga', pago_em = private.hoje_da_consultoria(p_consultoria_id), atualizada_em = now()
    where cb.consultoria_id = p_consultoria_id and cb.situacao in ('pendente', 'vencida')
    returning cb.tipo, cb.vencimento
  )
  select count(*)::integer, max(p.vencimento) filter (where p.tipo = 'plano')
  into v_total, v_ultimo
  from pagas as p;
  if v_ultimo is not null then
    update public.assinatura as a
    set proximo_vencimento = (v_ultimo
          + case when a.ciclo = 'anual' then interval '1 year' else interval '1 month' end)::date,
        atualizada_em = now()
    where a.consultoria_id = p_consultoria_id;
  end if;
  return v_total;
end;
$$;

revoke all on function public.central_simular_pagamento(uuid) from public, anon;
grant execute on function public.central_simular_pagamento(uuid) to authenticated;
