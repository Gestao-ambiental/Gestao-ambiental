-- Prévia da importação (ADR-0043, piloto): o que cada linha conferida cria. Aditiva: nenhuma
-- assinatura muda e conferir_importacao devolve o mesmo resumo de antes.
--
-- Por linha que entra (sem erro e não pulada):
--   cliente: 'novo' quando a linha cria o empreendimento e o cliente ainda não existe (é o que
--            private.cliente_pelo_nome cria na efetivação); 'existente' quando o nome já existe;
--            null sem cliente ou quando a linha usa um empreendimento existente com outro cliente.
--   unidade: 'criar' ou 'existente', com o nome (o da planilha ou "Matriz", o padrão da efetivação).
-- Total: clientes_a_criar, contados uma vez por nome normalizado.
-- Lê os erros e avisos gravados pela última conferência; antes de conferir, devolve linhas vazias.
-- Só a Gestão vinculada; outra consultoria e a Equipe recebem sem_permissao.

create function public.previa_da_importacao(p_importacao_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_imp public.importacao;
  v_cid uuid;
  v_linha public.importacao_linha;
  v_dados jsonb;
  v_achados uuid[];
  v_emp_existente uuid;
  v_unidade uuid;
  v_cliente text;
  v_nome_cliente text;
  v_unidade_situacao text;
  v_nome_unidade text;
  v_novos_clientes jsonb := '{}'::jsonb;
  v_linhas jsonb := '{}'::jsonb;
begin
  select * into v_imp from public.importacao as i where i.id = p_importacao_id;
  if not found or not private.is_gestao_vinculada(v_imp.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  v_cid := v_imp.consultoria_id;
  if v_imp.situacao <> 'em_conferencia' or v_imp.conferida_em is null then
    return jsonb_build_object('clientes_a_criar', 0, 'linhas', '{}'::jsonb);
  end if;

  for v_linha in
    select * from public.importacao_linha as x
    where x.consultoria_id = v_cid and x.importacao_id = v_imp.id
    order by x.numero_linha
  loop
    if jsonb_array_length(v_linha.erros) > 0
       or private.linha_da_importacao_pulada(v_imp.entidade, v_linha.avisos) then
      continue;
    end if;
    v_dados := v_linha.dados;
    v_emp_existente := null;
    v_unidade_situacao := null;
    v_nome_unidade := null;

    -- Empreendimento existente: a conferência marcou empreendimento_ja_existe (aba Licenças).
    if v_imp.entidade = 'licenca' and exists (
      select 1 from jsonb_array_elements(v_linha.avisos) as a
      where a ->> 'codigo' = 'empreendimento_ja_existe'
    ) then
      v_achados := private.empreendimentos_pela_chave(v_cid, v_dados, null);
      if cardinality(v_achados) = 1 then
        v_emp_existente := v_achados[1];
      end if;
    end if;

    -- Cliente.
    v_nome_cliente := private.normalizar_nome(v_dados ->> 'cliente');
    if coalesce(v_nome_cliente, '') = '' then
      v_cliente := null;
    elsif exists (
      select 1 from public.cliente as cl
      where cl.consultoria_id = v_cid and cl.nome_normalizado = v_nome_cliente
    ) then
      v_cliente := 'existente';
    elsif v_emp_existente is null then
      v_cliente := 'novo';
      v_novos_clientes := v_novos_clientes || jsonb_build_object(v_nome_cliente, true);
    else
      v_cliente := null;
    end if;

    -- Unidade.
    if v_imp.entidade = 'empreendimento' then
      if v_dados ->> 'unidade' is not null then
        v_unidade_situacao := 'criar';
        v_nome_unidade := v_dados ->> 'unidade';
      end if;
    else
      v_unidade := private.unidade_existente_da_importacao(v_cid, v_emp_existente, v_dados ->> 'unidade', null);
      if v_unidade is not null then
        v_unidade_situacao := 'existente';
        select u.nome into v_nome_unidade from public.unidade as u where u.id = v_unidade;
      else
        v_unidade_situacao := 'criar';
        v_nome_unidade := coalesce(v_dados ->> 'unidade', 'Matriz');
      end if;
    end if;

    v_linhas := v_linhas || jsonb_build_object(v_linha.numero_linha::text, jsonb_build_object(
      'cliente', v_cliente,
      'unidade', v_unidade_situacao,
      'unidade_nome', v_nome_unidade));
  end loop;

  return jsonb_build_object(
    'clientes_a_criar', (select count(*)::integer from jsonb_object_keys(v_novos_clientes)),
    'linhas', v_linhas);
end;
$$;

comment on function public.previa_da_importacao(uuid) is
  'Por linha conferida que entra: cliente novo ou existente e unidade a criar ou existente; total de clientes a criar.';

revoke all on function public.previa_da_importacao(uuid) from public, anon;
grant execute on function public.previa_da_importacao(uuid) to authenticated;
