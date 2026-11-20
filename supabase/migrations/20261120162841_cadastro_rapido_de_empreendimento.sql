-- Cadastro rápido de empreendimento dentro do cadastro de licença (passo Documento).
-- Quem ainda não tem empreendimento cadastra, numa transação só, o empreendimento (nome e CNPJ,
-- lidos do PDF ou digitados) e a unidade onde a licença vai ficar (nome e endereço), e recebe o
-- id da unidade para criar o rascunho da licença. Reaproveita as regras de criar_empreendimento e
-- criar_unidade (membro ativo, nome obrigatório, CNPJ válido, limite do plano) e é idempotente
-- pelos dois ids gerados no navegador: repetir depois de erro de rede não duplica nada.

create function public.cadastrar_empreendimento_com_unidade(
  p_empreendimento_id uuid,
  p_consultoria_id uuid,
  p_nome text,
  p_cnpj text,
  p_unidade_id uuid,
  p_unidade_nome text,
  p_unidade_endereco text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  unidade_existente uuid;
begin
  if p_empreendimento_id is null or p_unidade_id is null then
    raise exception 'id_obrigatorio' using errcode = '22023';
  end if;
  if btrim(coalesce(p_unidade_nome, '')) = '' then
    raise exception 'nome_obrigatorio' using errcode = '22023';
  end if;

  -- Membro ativo, nome, CNPJ, limite do plano e idempotência do empreendimento.
  perform public.criar_empreendimento(p_empreendimento_id, p_consultoria_id, p_nome, null, p_cnpj, null);

  -- Repetição: a unidade já existe neste empreendimento (criar_unidade devolve a mesma).
  select u.empreendimento_id into unidade_existente from public.unidade as u where u.id = p_unidade_id;
  if found and unidade_existente <> p_empreendimento_id then
    raise exception 'unidade_existente' using errcode = 'P0001';
  end if;

  return public.criar_unidade(p_unidade_id, p_empreendimento_id, p_unidade_nome, p_unidade_endereco);
end;
$$;

revoke all on function public.cadastrar_empreendimento_com_unidade(uuid, uuid, text, text, uuid, text, text)
  from public, anon;
grant execute on function public.cadastrar_empreendimento_com_unidade(uuid, uuid, text, text, uuid, text, text)
  to authenticated;
