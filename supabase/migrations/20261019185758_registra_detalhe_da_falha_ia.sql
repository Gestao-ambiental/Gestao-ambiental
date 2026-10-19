-- Diagnóstico da extração por IA (épico 9, IA-04). Antes, recusa do provedor (chave inválida,
-- sem crédito, modelo ou parâmetro recusado) aparecia como "configuração ausente" e o motivo se
-- perdia. Agora a recusa tem motivo próprio e a extração guarda um detalhe curto do provedor
-- (status HTTP e mensagem; nunca chave, PDF ou conteúdo do documento).

alter table public.extracao_ia
  add column detalhe text,
  add constraint extracao_ia_detalhe_curto check (detalhe is null or length(detalhe) <= 500);

alter table public.extracao_ia drop constraint extracao_ia_motivo_valido;
alter table public.extracao_ia
  add constraint extracao_ia_motivo_valido check (motivo is null or motivo in (
    'pdf_sem_texto', 'pdf_grande_demais', 'provedor_indisponivel', 'provedor_recusou', 'tempo_esgotado',
    'resposta_invalida', 'configuracao_ausente', 'erro_interno'
  ));

comment on column public.extracao_ia.detalhe is
  'Detalhe técnico da falha (ex.: "HTTP 401: ..."), até 500 caracteres. Sem chave, PDF ou conteúdo.';

drop function public.falhar_extracao_ia(uuid, text, text, text, integer, integer, bigint, integer, integer);

-- RPC (só service role): registrar a falha, agora com o detalhe do provedor.
create function public.falhar_extracao_ia(
  p_id uuid,
  p_motivo text,
  p_modelo text,
  p_versao_prompt text,
  p_tokens_entrada integer,
  p_tokens_saida integer,
  p_custo_micros bigint,
  p_paginas integer,
  p_duracao_ms integer,
  p_detalhe text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.extracao_ia as x
  set situacao = 'falhou', motivo = p_motivo, modelo = p_modelo, versao_prompt = p_versao_prompt,
      tokens_entrada = p_tokens_entrada, tokens_saida = p_tokens_saida, custo_micros = p_custo_micros,
      paginas = p_paginas, duracao_ms = p_duracao_ms, concluida_em = now(),
      detalhe = left(nullif(btrim(coalesce(p_detalhe, '')), ''), 500)
  where x.id = p_id and x.situacao = 'em_andamento';
end;
$$;

revoke all on function public.falhar_extracao_ia(uuid, text, text, text, integer, integer, bigint, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.falhar_extracao_ia(uuid, text, text, text, integer, integer, bigint, integer, integer, text)
  to service_role;
