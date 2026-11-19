-- Resumo do mês (ADR-0027): reserva antes de enviar, para que repetir o workflow não mande o mesmo
-- resumo duas vezes.
--
-- Antes, a Edge Function enviava e só depois gravava em public.resumo_do_mes_envio. Duas execuções
-- ao mesmo tempo (ou uma repetição logo depois de uma falha ao gravar) mandavam o e-mail de novo.
-- Agora, para cada consultoria e mês:
--   1. reservar_envio_do_resumo  grava a reserva (uma por consultoria e mês). Só uma execução
--                                consegue; uma reserva com mais de 60 minutos (execução que caiu
--                                no meio) pode ser retomada. Já enviado: não reserva.
--   2. envia pelo Resend.
--   3. registrar_envio_do_resumo grava o envio (sem mudança). Falha ao gravar mantém a reserva.
--   Falha no envio: liberar_reserva_do_resumo apaga a reserva, e a próxima execução tenta de novo.
--
-- public.resumo_do_mes_envio continua só de inserção; a reserva vive à parte, fora da API.

create table private.resumo_do_mes_reserva (
  consultoria_id uuid not null references public.consultoria (id) on delete cascade,
  mes date not null,
  reservada_em timestamptz not null default now(),
  constraint resumo_do_mes_reserva_pkey primary key (consultoria_id, mes),
  constraint resumo_do_mes_reserva_mes check (mes = date_trunc('month', mes)::date)
);

comment on table private.resumo_do_mes_reserva is
  'Reserva do envio do resumo do mês (consultoria e mês) enquanto a Edge Function enviar-resumo-do-mes manda o e-mail. Evita envio duplicado. Ver ADR-0027.';

alter table private.resumo_do_mes_reserva enable row level security;
alter table private.resumo_do_mes_reserva force row level security;
revoke all on table private.resumo_do_mes_reserva from public, anon, authenticated;

-- Só service role: reserva o envio. Verdadeiro só para quem reservou; falso quando outra execução
-- reservou há menos de 60 minutos ou o envio já foi gravado.
create function public.reservar_envio_do_resumo(p_consultoria_id uuid, p_mes date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  reservadas integer;
begin
  -- Duas execuções ao mesmo tempo: a segunda espera a primeira na chave e não atualiza a reserva
  -- recente (row_count zero).
  insert into private.resumo_do_mes_reserva as r (consultoria_id, mes, reservada_em)
  values (p_consultoria_id, v_mes, now())
  on conflict (consultoria_id, mes) do update
    set reservada_em = excluded.reservada_em
    where r.reservada_em < now() - interval '60 minutes';
  get diagnostics reservadas = row_count;
  if reservadas = 0 then
    return false;
  end if;

  -- Reserva retomada de uma execução que já tinha gravado o envio: nada a mandar.
  return not exists (
    select 1 from public.resumo_do_mes_envio as e
    where e.consultoria_id = p_consultoria_id and e.mes = v_mes
  );
end;
$$;

revoke all on function public.reservar_envio_do_resumo(uuid, date) from public, anon, authenticated;
grant execute on function public.reservar_envio_do_resumo(uuid, date) to service_role;

-- Só service role: desfaz a reserva depois de uma falha no envio (nada foi mandado).
create function public.liberar_reserva_do_resumo(p_consultoria_id uuid, p_mes date)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.resumo_do_mes_reserva
  where consultoria_id = p_consultoria_id and mes = date_trunc('month', p_mes)::date
$$;

revoke all on function public.liberar_reserva_do_resumo(uuid, date) from public, anon, authenticated;
grant execute on function public.liberar_reserva_do_resumo(uuid, date) to service_role;
