-- Aviso do acesso de emergência guarda se o e-mail saiu (ADR-0025, atualização de 19/11/2026).
--
-- O gatilho (pg_net) e o front da central chamam a Edge Function quase juntos. Quem perdia a
-- reserva recebia { enviados: 0 } e a central mostrava "e-mail enviado" sem saber se o envio do
-- outro chamador deu certo; se ele falhasse, liberava a reserva e ninguém tentava de novo. Agora:
--   private.aviso_de_emergencia.enviado_em  quando o Resend aceitou o e-mail.
--   marcar_aviso_de_emergencia_enviado(id)  service role; grava enviado_em depois do envio.
--   estado_do_aviso_de_emergencia(id)       service role; 'enviado', 'em_andamento' (reservado,
--                                           ainda sem resultado) ou 'livre' (sem reserva).
-- Quem perde a reserva espera o resultado do outro: 'enviado' responde que já saiu; 'livre' (o
-- outro falhou e liberou) reserva e envia, virando a nova tentativa; sem resultado a tempo, a
-- central diz que o envio não foi confirmado.

alter table private.aviso_de_emergencia add column enviado_em timestamptz;

create function public.marcar_aviso_de_emergencia_enviado(p_acesso_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update private.aviso_de_emergencia set enviado_em = now() where id = p_acesso_id
$$;

create function public.estado_do_aviso_de_emergencia(p_acesso_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case when a.enviado_em is null then 'em_andamento' else 'enviado' end
     from private.aviso_de_emergencia as a where a.id = p_acesso_id),
    'livre')
$$;

revoke all on function public.marcar_aviso_de_emergencia_enviado(uuid) from public, anon, authenticated;
revoke all on function public.estado_do_aviso_de_emergencia(uuid) from public, anon, authenticated;
grant execute on function public.marcar_aviso_de_emergencia_enviado(uuid) to service_role;
grant execute on function public.estado_do_aviso_de_emergencia(uuid) to service_role;
