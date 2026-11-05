-- RPC: desfazer a confirmação do prazo de uma obrigação (passo 4). O prazo volta a pendente: tira
-- quem confirmou e quando, e mantém o que foi preenchido (recorrência, datas, fonte) para a pessoa
-- ajustar e confirmar de novo. Mesmas regras do confirmar_prazo (Gestão, rascunho). Repetir não
-- muda nada.
create function public.desfazer_confirmacao_prazo(p_condicionante_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cond public.condicionante;
begin
  select * into cond from public.condicionante as c where c.id = p_condicionante_id;
  if not found then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  perform private.instrumento_para_editar(cond.instrumento_id);

  update public.condicionante_versao as v
  set prazo_confirmado_por = null,
      prazo_confirmado_em = null
  where v.id = cond.versao_vigente_id and v.prazo_confirmado_em is not null;

  if found then
    perform private.tocar_instrumento(cond.instrumento_id);
  end if;
end;
$$;

revoke all on function public.desfazer_confirmacao_prazo(uuid) from public, anon;
grant execute on function public.desfazer_confirmacao_prazo(uuid) to authenticated;
