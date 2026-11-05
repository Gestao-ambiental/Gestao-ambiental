-- Extração da IA: o subitem que vem antes do seu agrupador na resposta (ex.: 3.1.1 antes de 3.1)
-- ficava solto, sem pai. Agora a ligação ao agrupador é feita numa segunda passada, depois que
-- todos os itens existem. Mesma assinatura: os grants continuam.
create or replace function public.concluir_extracao_ia(
  p_id uuid,
  p_resultado jsonb,
  p_modelo text,
  p_versao_prompt text,
  p_tokens_entrada integer,
  p_tokens_saida integer,
  p_custo_micros bigint,
  p_paginas integer,
  p_duracao_ms integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ext public.extracao_ia;
  alvo public.instrumento;
  ident jsonb;
  item jsonb;
  ordem bigint;
  agrupadores jsonb := '{}';
  novo uuid;
  versao uuid;
  pai uuid;
  codigo_item text;
  titulo_item text;
  texto_item text;
  natureza_item public.natureza_condicionante;
  pagina_item integer;
  base_posicao integer;
  quantidade integer := 0;
  tipo uuid;
  campo text;
  -- Subitem que veio antes do agrupador: id do item -> código do agrupador, ligado no fim.
  pendentes jsonb := '{}';
  filho text;
  ancestral uuid;
  profundidade integer;
begin
  select * into ext from public.extracao_ia as x where x.id = p_id for update;
  if not found then
    raise exception 'extracao_inexistente' using errcode = 'P0001';
  end if;
  if ext.situacao = 'concluida' then
    return ext.itens_propostos;
  end if;
  if ext.situacao <> 'em_andamento' then
    raise exception 'extracao_encerrada' using errcode = 'P0001';
  end if;

  select * into alvo from public.instrumento as i where i.id = ext.instrumento_id for update;
  if alvo.situacao <> 'rascunho' then
    raise exception 'instrumento_ativo' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_resultado) is distinct from 'object'
     or jsonb_typeof(p_resultado -> 'identificacao') is distinct from 'object'
     or jsonb_typeof(p_resultado -> 'condicionantes') is distinct from 'array'
     or jsonb_array_length(p_resultado -> 'condicionantes') > 300 then
    raise exception 'resposta_invalida' using errcode = '22023';
  end if;

  -- Identificação: só preenche o que ainda está vazio no rascunho.
  ident := p_resultado -> 'identificacao';
  -- Emissão, assinatura e publicação no futuro são leitura errada: ficam como não encontradas.
  foreach campo in array array['emitido_em', 'assinado_em', 'publicado_em'] loop
    if private.data_ou_nulo(private.valor_proposto(ident -> campo))
       > private.hoje_da_consultoria(alvo.consultoria_id) then
      ident := ident - campo;
    end if;
  end loop;
  select t.id into tipo from public.tipo_instrumento as t
  where t.consultoria_id = alvo.consultoria_id
    and upper(btrim(t.sigla)) = upper(private.valor_proposto(ident -> 'tipo'))
  limit 1;

  update public.instrumento as i
  set tipo_id = coalesce(i.tipo_id, tipo),
      numero = coalesce(i.numero, private.valor_proposto(ident -> 'numero')),
      orgao = coalesce(i.orgao, private.valor_proposto(ident -> 'orgao')),
      emitido_em = coalesce(i.emitido_em, private.data_ou_nulo(private.valor_proposto(ident -> 'emitido_em'))),
      emitido_em_texto = case when i.emitido_em is null and private.data_ou_nulo(private.valor_proposto(ident -> 'emitido_em')) is not null
        then nullif(btrim(coalesce(ident -> 'emitido_em' ->> 'texto', '')), '') else i.emitido_em_texto end,
      assinado_em = coalesce(i.assinado_em, private.data_ou_nulo(private.valor_proposto(ident -> 'assinado_em'))),
      assinado_em_texto = case when i.assinado_em is null and private.data_ou_nulo(private.valor_proposto(ident -> 'assinado_em')) is not null
        then nullif(btrim(coalesce(ident -> 'assinado_em' ->> 'texto', '')), '') else i.assinado_em_texto end,
      publicado_em = coalesce(i.publicado_em, private.data_ou_nulo(private.valor_proposto(ident -> 'publicado_em'))),
      publicado_em_texto = case when i.publicado_em is null and private.data_ou_nulo(private.valor_proposto(ident -> 'publicado_em')) is not null
        then nullif(btrim(coalesce(ident -> 'publicado_em' ->> 'texto', '')), '') else i.publicado_em_texto end,
      recebido_em = coalesce(i.recebido_em, private.data_ou_nulo(private.valor_proposto(ident -> 'recebido_em'))),
      recebido_em_texto = case when i.recebido_em is null and private.data_ou_nulo(private.valor_proposto(ident -> 'recebido_em')) is not null
        then nullif(btrim(coalesce(ident -> 'recebido_em' ->> 'texto', '')), '') else i.recebido_em_texto end,
      validade = coalesce(i.validade, private.data_ou_nulo(private.valor_proposto(ident -> 'validade'))),
      validade_texto = case when i.validade is null and private.data_ou_nulo(private.valor_proposto(ident -> 'validade')) is not null
        then nullif(btrim(coalesce(ident -> 'validade' ->> 'texto', '')), '') else i.validade_texto end,
      row_version = i.row_version + 1
  where i.id = alvo.id;

  -- Condicionantes: só num rascunho ainda sem itens (o início já conferiu; aqui de novo, sob trava).
  if not exists (
    select 1 from public.condicionante as c where c.instrumento_id = alvo.id and c.revisao <> 'descartada'
  ) then
    select coalesce(max(c.posicao), 0) into base_posicao from public.condicionante as c
    where c.instrumento_id = alvo.id;

    for item, ordem in
      select e.valor, e.ordem from jsonb_array_elements(p_resultado -> 'condicionantes') with ordinality as e (valor, ordem)
    loop
      codigo_item := btrim(coalesce(item ->> 'codigo', ''));
      texto_item := coalesce(item ->> 'texto_literal', '');
      titulo_item := nullif(btrim(coalesce(item ->> 'titulo', '')), '');
      if titulo_item is null then
        titulo_item := nullif(left(btrim(regexp_replace(texto_item, '\s+', ' ', 'g')), 120), '');
      end if;
      continue when titulo_item is null;
      begin
        natureza_item := (item ->> 'natureza')::public.natureza_condicionante;
      exception when others then
        raise exception 'resposta_invalida' using errcode = '22023';
      end;
      pagina_item := case when (item ->> 'pagina') ~ '^\d{1,4}$' and (item ->> 'pagina')::integer > 0
                          then (item ->> 'pagina')::integer end;
      pai := case when coalesce(item ->> 'pai_codigo', '') <> ''
                  then (agrupadores ->> btrim(item ->> 'pai_codigo'))::uuid end;

      novo := gen_random_uuid();
      insert into public.condicionante (id, consultoria_id, instrumento_id, pai_id, codigo, posicao, revisao,
                                        origem, extracao_id, fonte_pagina, proposta_ia)
      values (novo, alvo.consultoria_id, alvo.id, pai, codigo_item, base_posicao + ordem::integer, 'pendente',
              'ia', ext.id, pagina_item,
              jsonb_build_object('codigo', codigo_item, 'titulo', titulo_item, 'texto_literal', texto_item,
                                 'natureza', natureza_item, 'pagina', pagina_item,
                                 'periodicidade', nullif(btrim(coalesce(item ->> 'periodicidade', '')), '')));
      insert into public.condicionante_versao (consultoria_id, condicionante_id, titulo, texto_literal, natureza)
      values (alvo.consultoria_id, novo, titulo_item, texto_item, natureza_item)
      returning id into versao;
      update public.condicionante as c set versao_vigente_id = versao where c.id = novo;

      if pai is null and coalesce(btrim(item ->> 'pai_codigo'), '') <> '' then
        pendentes := pendentes || jsonb_build_object(novo::text, btrim(item ->> 'pai_codigo'));
      end if;

      if codigo_item <> '' and natureza_item = 'agrupador' then
        agrupadores := agrupadores || jsonb_build_object(codigo_item, novo);
      end if;
      quantidade := quantidade + 1;
    end loop;

    -- Segunda passada: agora todos os agrupadores existem, então a ordem da resposta não importa.
    for filho, codigo_item in select e.key, e.value #>> '{}' from jsonb_each(pendentes) as e loop
      pai := (agrupadores ->> codigo_item)::uuid;
      continue when pai is null or pai = filho::uuid;
      -- Não fecha ciclo: o agrupador escolhido não pode estar abaixo do próprio item.
      ancestral := pai;
      profundidade := 0;
      while ancestral is not null and ancestral <> filho::uuid and profundidade < 50 loop
        select c.pai_id into ancestral from public.condicionante as c where c.id = ancestral;
        profundidade := profundidade + 1;
      end loop;
      continue when ancestral = filho::uuid;
      update public.condicionante as c set pai_id = pai where c.id = filho::uuid;
    end loop;
  end if;

  update public.extracao_ia as x
  set situacao = 'concluida', resultado = p_resultado, modelo = p_modelo, versao_prompt = p_versao_prompt,
      tokens_entrada = p_tokens_entrada, tokens_saida = p_tokens_saida, custo_micros = p_custo_micros,
      paginas = p_paginas, duracao_ms = p_duracao_ms, itens_propostos = quantidade, concluida_em = now()
  where x.id = ext.id;
  return quantidade;
end;
$$;
