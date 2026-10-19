-- Extração por IA (épico 9; IA-01, IA-02, IA-04 e o registro de custo do IA-03; ADR-0006).
-- A Edge Function extrair-licenca lê o PDF do rascunho, chama o provedor e grava a proposta como
-- rascunho: identificação só nos campos vazios e condicionantes "pendentes" de revisão. Nada vira
-- prazo, responsável ou cadastro sem a Gestão aceitar. Cada extração registra modelo, versão do
-- prompt, tokens, custo e duração, sem o PDF.
-- Decisões de 19/10/2026: modelo padrão openai/gpt-4.1-mini (configurável); prompt novo e
-- versionado; IA preenche identificação e condicionantes (a periodicidade lida é só texto de apoio).
--
-- Quem pode o quê: iniciar é da Gestão (com o JWT dela). Concluir e registrar falha são só da
-- service role (a Edge Function): custo e tokens não podem ser forjados pelo navegador.
-- Custo em milionésimos de dólar (o provedor cobra frações de centavo) + código da moeda.

create table public.extracao_ia (
  id uuid primary key,
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  instrumento_id uuid not null,
  documento_versao_id uuid not null,
  solicitada_por uuid not null,
  iniciada_em timestamptz not null default now(),
  concluida_em timestamptz,
  duracao_ms integer,
  situacao text not null default 'em_andamento',
  motivo text,
  modelo text,
  versao_prompt text,
  tokens_entrada integer,
  tokens_saida integer,
  custo_micros bigint,
  moeda text not null default 'USD',
  paginas integer,
  itens_propostos integer,
  resultado jsonb,
  constraint extracao_ia_situacao_valida check (situacao in ('em_andamento', 'concluida', 'falhou')),
  constraint extracao_ia_motivo_valido check (motivo is null or motivo in (
    'pdf_sem_texto', 'pdf_grande_demais', 'provedor_indisponivel', 'tempo_esgotado', 'resposta_invalida',
    'configuracao_ausente', 'erro_interno'
  )),
  constraint extracao_ia_falha_com_motivo check ((situacao = 'falhou') = (motivo is not null)),
  constraint extracao_ia_fim_coerente check ((situacao = 'em_andamento') = (concluida_em is null)),
  constraint extracao_ia_numeros_validos check (
    coalesce(duracao_ms, 0) >= 0 and coalesce(tokens_entrada, 0) >= 0 and coalesce(tokens_saida, 0) >= 0
    and coalesce(custo_micros, 0) >= 0 and coalesce(itens_propostos, 0) between 0 and 300
  ),
  constraint extracao_ia_consultoria_id_id_key unique (consultoria_id, id),
  constraint extracao_ia_instrumento_fk foreign key (consultoria_id, instrumento_id)
    references public.instrumento (consultoria_id, id) on delete restrict,
  constraint extracao_ia_versao_fk foreign key (consultoria_id, documento_versao_id)
    references public.documento_versao (consultoria_id, id) on delete restrict,
  constraint extracao_ia_solicitada_por_fk foreign key (consultoria_id, solicitada_por)
    references public.membro (consultoria_id, id) on delete restrict
);

create index extracao_ia_instrumento_idx on public.extracao_ia (consultoria_id, instrumento_id, iniciada_em desc);

comment on table public.extracao_ia is
  'Uma chamada à IA por linha (IA-03): modelo, prompt, tokens, custo, duração e resultado validado. Nunca o PDF.';

alter table public.extracao_ia enable row level security;
alter table public.extracao_ia force row level security;
revoke all on table public.extracao_ia from anon, authenticated;
grant select on table public.extracao_ia to authenticated;

create policy extracao_ia_select_membro_ativo on public.extracao_ia
  for select to authenticated using ((select private.is_membro(consultoria_id)));

create trigger extracao_ia_auditar after insert or update or delete on public.extracao_ia
  for each row execute function private.auditar('consultoria_id', 'resultado');

-- Condicionante proposta pela IA: de onde veio, o que foi proposto e se foi aceita sem edição.
alter table public.condicionante
  add column extracao_id uuid,
  add column fonte_pagina integer,
  add column proposta_ia jsonb,
  add column aceita_sem_edicao boolean,
  add constraint condicionante_extracao_fk foreign key (consultoria_id, extracao_id)
    references public.extracao_ia (consultoria_id, id) on delete restrict,
  add constraint condicionante_fonte_pagina_valida check (fonte_pagina is null or fonte_pagina > 0),
  add constraint condicionante_proposta_so_da_ia check (proposta_ia is null or origem = 'ia');

comment on column public.condicionante.aceita_sem_edicao is
  'Base da métrica de aceitação (IA-02): aceita com código, título, texto e natureza iguais aos propostos.';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Texto ISO (aaaa-mm-dd) para data; qualquer outra coisa (inclusive data inexistente) vira nulo.
create function private.data_ou_nulo(texto text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if texto is null or texto !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return texto::date;
exception when others then
  return null;
end;
$$;

revoke all on function private.data_ou_nulo(text) from public, anon, authenticated;

-- Valor textual de um campo proposto ({"valor": …, "pagina": …}), já aparado; vazio vira nulo.
create function private.valor_proposto(campo jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(coalesce(campo ->> 'valor', '')), '')
$$;

revoke all on function private.valor_proposto(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: iniciar uma extração (Gestão, rascunho com PDF e ainda sem condicionantes). Devolve o que a
-- Edge Function precisa: o caminho do PDF no Storage e os tipos de instrumento da consultoria.
-- Repetir com o mesmo id devolve a mesma extração com `nova = false` e a situação atual: a função
-- só chama a IA quando a extração é nova (retry ou clique duplo não pagam duas vezes).
-- ---------------------------------------------------------------------------
create function public.iniciar_extracao_ia(p_id uuid, p_instrumento_id uuid)
returns table (
  nova boolean,
  situacao text,
  motivo text,
  itens_propostos integer,
  caminho text,
  mime text,
  tamanho_bytes bigint,
  tipos text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.instrumento;
  versao public.documento_versao;
  existente public.extracao_ia;
begin
  alvo := private.instrumento_para_editar(p_instrumento_id);

  select * into existente from public.extracao_ia as x where x.id = p_id;
  if found and existente.instrumento_id <> alvo.id then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  if not found then
    select v.* into versao
    from public.documento as d
    join public.documento_versao as v on v.consultoria_id = d.consultoria_id and v.id = d.versao_vigente_id
    where d.consultoria_id = alvo.consultoria_id and d.id = alvo.documento_id and d.excluido_em is null;
    if not found then
      raise exception 'pdf_obrigatorio' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.condicionante as c
      where c.instrumento_id = alvo.id and c.revisao <> 'descartada'
    ) then
      raise exception 'condicionantes_existentes' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.extracao_ia as x
      where x.instrumento_id = alvo.id and x.situacao = 'em_andamento'
        and x.iniciada_em > now() - interval '3 minutes'
    ) then
      raise exception 'extracao_em_andamento' using errcode = 'P0001';
    end if;

    insert into public.extracao_ia (id, consultoria_id, instrumento_id, documento_versao_id, solicitada_por)
    values (p_id, alvo.consultoria_id, alvo.id, versao.id, private.membro_atual(alvo.consultoria_id));
  else
    select v.* into versao from public.documento_versao as v where v.id = existente.documento_versao_id;
  end if;

  return query
  select existente.id is null, coalesce(existente.situacao, 'em_andamento'), existente.motivo,
         existente.itens_propostos, versao.caminho, versao.mime, versao.tamanho_bytes,
         coalesce((select array_agg(t.sigla order by t.sigla) from public.tipo_instrumento as t
                   where t.consultoria_id = alvo.consultoria_id), '{}');
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC (só service role): registrar a falha. A extração não toca o rascunho; o caminho manual segue.
-- ---------------------------------------------------------------------------
create function public.falhar_extracao_ia(
  p_id uuid,
  p_motivo text,
  p_modelo text,
  p_versao_prompt text,
  p_tokens_entrada integer,
  p_tokens_saida integer,
  p_custo_micros bigint,
  p_paginas integer,
  p_duracao_ms integer
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
      paginas = p_paginas, duracao_ms = p_duracao_ms, concluida_em = now()
  where x.id = p_id and x.situacao = 'em_andamento';
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC (só service role): gravar a proposta validada como rascunho. Identificação só nos campos
-- vazios (com o texto original da data); condicionantes "pendentes", na ordem do documento, com
-- subitem ligado ao agrupador proposto. No máximo 300 itens. Repetir não duplica.
-- ---------------------------------------------------------------------------
create function public.concluir_extracao_ia(
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

      if codigo_item <> '' and natureza_item = 'agrupador' then
        agrupadores := agrupadores || jsonb_build_object(codigo_item, novo);
      end if;
      quantidade := quantidade + 1;
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

-- ---------------------------------------------------------------------------
-- Revisão (passo 3): ao aceitar item proposto pela IA, registra se foi aceito sem edição (IA-02).
-- ---------------------------------------------------------------------------
create or replace function public.revisar_condicionante(p_id uuid, p_revisao public.revisao_condicionante)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cond public.condicionante;
  igual boolean;
begin
  select * into cond from public.condicionante as c where c.id = p_id;
  if not found then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  perform private.instrumento_para_editar(cond.instrumento_id);
  if p_revisao is null or p_revisao = 'pendente' then
    raise exception 'revisao_invalida' using errcode = '22023';
  end if;

  if cond.proposta_ia is not null and p_revisao = 'aceita' then
    select cond.codigo = cond.proposta_ia ->> 'codigo'
           and v.titulo = cond.proposta_ia ->> 'titulo'
           and v.texto_literal = cond.proposta_ia ->> 'texto_literal'
           and v.natureza::text = cond.proposta_ia ->> 'natureza'
    into igual
    from public.condicionante_versao as v where v.id = cond.versao_vigente_id;
  end if;

  update public.condicionante as c
  set revisao = p_revisao,
      aceita_sem_edicao = case when c.proposta_ia is not null and p_revisao = 'aceita' then coalesce(igual, false) end
  where c.id = p_id;
  perform private.tocar_instrumento(cond.instrumento_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
revoke all on function public.iniciar_extracao_ia(uuid, uuid) from public, anon;
revoke all on function public.falhar_extracao_ia(uuid, text, text, text, integer, integer, bigint, integer, integer)
  from public, anon, authenticated;
revoke all on function public.concluir_extracao_ia(uuid, jsonb, text, text, integer, integer, bigint, integer, integer)
  from public, anon, authenticated;

grant execute on function public.iniciar_extracao_ia(uuid, uuid) to authenticated;
grant execute on function public.falhar_extracao_ia(uuid, text, text, text, integer, integer, bigint, integer, integer)
  to service_role;
grant execute on function public.concluir_extracao_ia(uuid, jsonb, text, text, integer, integer, bigint, integer, integer)
  to service_role;
