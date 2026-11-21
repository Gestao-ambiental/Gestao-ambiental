-- Triagem vira orçamento (ADR-0056). Da conclusão da triagem, "Orçar" abre um rascunho para o
-- empreendimento com os itens e valores que a consultoria já cadastrou para a modalidade
-- (trifásica, AuA ou só LAO) e a taxa do órgão como despesa de repasse (paga direto pelo cliente).
--
-- "Valores da modalidade" = o modelo de orçamento marcado com a modalidade: o que a consultoria
-- já usa para repetir itens e preços (ADR-0031), sem tabela nova nem preço por profissão.
-- No máximo um modelo vivo por modalidade. Sem valores, o rascunho sai só com a taxa e a modalidade,
-- e a tela oferece salvar os itens como valores da modalidade para a próxima vez.

alter table public.orcamento_modelo add column modalidade text;
alter table public.orcamento_modelo
  add constraint orcamento_modelo_modalidade check (modalidade is null or modalidade in ('trifasica', 'AuA', 'LAO'));
create unique index orcamento_modelo_modalidade_viva
  on public.orcamento_modelo (consultoria_id, modalidade)
  where modalidade is not null and excluido_em is null;

comment on column public.orcamento_modelo.modalidade is
  'Modalidade de licenciamento cujos valores este modelo guarda (Orçar da triagem). Um vivo por modalidade.';

alter table public.orcamento add column modalidade text;
alter table public.orcamento
  add constraint orcamento_modalidade check (modalidade is null or modalidade in ('trifasica', 'AuA', 'LAO'));

comment on column public.orcamento.modalidade is
  'Modalidade de licenciamento vinda da triagem (Orçar). Nula nos orçamentos comuns.';

-- Despesas de taxa do órgão não entram nos valores da modalidade (o valor muda a cada triagem).
create function private.eh_taxa_do_orgao(descricao text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select descricao ilike 'Taxa do IMA%' or descricao ilike 'Taxa do município%'
$$;

-- ---------------------------------------------------------------------------
-- Orçar: rascunho com os valores da modalidade e a taxa
-- ---------------------------------------------------------------------------
create function public.criar_orcamento_da_triagem(
  p_id uuid,
  p_consultoria_id uuid,
  p_empreendimento_id uuid,
  p_modalidade text,
  p_objeto text,
  p_taxa jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  dono uuid;
  modelo public.orcamento_modelo%rowtype;
  criado public.orcamento%rowtype;
  ids_da_tabela text[];
  taxa_descricao text := btrim(coalesce(p_taxa ->> 'descricao', ''));
  taxa_valor bigint := (p_taxa ->> 'estimativa_centavos')::bigint;
  despesa_da_taxa jsonb := '[]'::jsonb;
begin
  if private.membro_atual(p_consultoria_id) is null or not private.is_gestao(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'id_obrigatorio' using errcode = '22023';
  end if;
  if p_modalidade is null or p_modalidade not in ('trifasica', 'AuA', 'LAO') then
    raise exception 'modalidade_invalida' using errcode = '22023';
  end if;
  if p_taxa is not null and (
       taxa_descricao = '' or length(taxa_descricao) > 300
       or (taxa_valor is not null and taxa_valor not between 0 and 99999999999)) then
    raise exception 'taxa_invalida' using errcode = '22023';
  end if;

  -- Idempotência pelo id: repetir devolve o mesmo rascunho.
  select o.consultoria_id into dono from public.orcamento as o where o.id = p_id;
  if found then
    if dono = p_consultoria_id then
      return jsonb_build_object('orcamento_id', p_id, 'modelo_id', null);
    end if;
    raise exception 'orcamento_existente' using errcode = 'P0001';
  end if;

  select * into modelo from public.orcamento_modelo as m
  where m.consultoria_id = p_consultoria_id and m.modalidade = p_modalidade and m.excluido_em is null;

  -- Mesmo caminho do rascunho comum: numeração, base de custos e barreiras do plano.
  perform public.criar_orcamento(p_id, p_consultoria_id, p_empreendimento_id, p_objeto, null);
  update public.orcamento as o set modalidade = p_modalidade where o.id = p_id;

  if p_taxa is not null then
    despesa_da_taxa := jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'descricao', taxa_descricao, 'estimativa_centavos', taxa_valor,
      'tratamento', 'cliente_direto'));
  end if;

  if modelo.id is null then
    -- Sem valores da modalidade: só a taxa (a cotar quando não há valor, nunca zero).
    if p_taxa is not null then
      insert into public.orcamento_despesa (consultoria_id, orcamento_id, ordem, descricao,
                                            estimativa_centavos, tratamento)
      values (p_consultoria_id, p_id, 1, taxa_descricao, taxa_valor, 'cliente_direto');
    end if;
    return jsonb_build_object('orcamento_id', p_id, 'modelo_id', null);
  end if;

  select * into criado from public.orcamento as o where o.id = p_id;
  -- Linha da tabela de preços que não existe mais fica sem preço (a tela pede para escolher).
  select coalesce(array_agg(h.valor ->> 'id'), '{}') into ids_da_tabela
  from jsonb_array_elements(coalesce(criado.base_horas_venda, '[]'::jsonb)) as h (valor);

  perform public.salvar_orcamento(p_id, criado.row_version, jsonb_build_object(
    'objeto', criado.objeto,
    'destinatario', criado.destinatario,
    'prazos', criado.prazos,
    'validade_dias', criado.validade_dias,
    'premissas', to_jsonb(modelo.premissas),
    'exclusoes', to_jsonb(modelo.exclusoes),
    'apresentacao', criado.apresentacao,
    'forma_preco', criado.forma_preco,
    'margem_pb', criado.margem_pb,
    'visitas', jsonb_build_object('quantidade', 0, 'km_por_visita', 0, 'outros_por_visita_centavos', 0),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', gen_random_uuid(),
               'descricao', i.valor ->> 'descricao',
               'minutos', coalesce((i.valor ->> 'minutos')::integer, 0),
               'hora_venda_id', case when i.valor ->> 'hora_venda_id' = any (ids_da_tabela)
                                     then i.valor ->> 'hora_venda_id' end,
               'preco_fechado_centavos', (i.valor ->> 'preco_digitado_centavos')::bigint)
             order by i.ordem)
      from jsonb_array_elements(modelo.itens) with ordinality as i (valor, ordem)), '[]'::jsonb),
    'despesas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', gen_random_uuid(),
               'descricao', d.valor ->> 'descricao',
               'estimativa_centavos', null,
               'tratamento', d.valor ->> 'tratamento') order by d.ordem)
      from jsonb_array_elements(modelo.despesas) with ordinality as d (valor, ordem)
      where not private.eh_taxa_do_orgao(d.valor ->> 'descricao')), '[]'::jsonb) || despesa_da_taxa,
    'parcelas', '[]'::jsonb));

  return jsonb_build_object('orcamento_id', p_id, 'modelo_id', modelo.id);
end;
$$;

comment on function public.criar_orcamento_da_triagem(uuid, uuid, uuid, text, text, jsonb) is
  'Orçar da triagem (ADR-0056): rascunho com os valores da modalidade e a taxa do órgão como repasse. Só Gestão; idempotente pelo id.';

revoke all on function public.criar_orcamento_da_triagem(uuid, uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.criar_orcamento_da_triagem(uuid, uuid, uuid, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Salvar os itens do orçamento como valores da modalidade (substitui os anteriores)
-- ---------------------------------------------------------------------------
create function public.salvar_valores_da_modalidade(
  p_orcamento_id uuid,
  p_modelo_id uuid,
  p_modalidade text,
  p_nome text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  origem public.orcamento%rowtype;
  autor uuid;
  dono uuid;
begin
  select * into origem from public.orcamento as o where o.id = p_orcamento_id;
  if not found or not private.is_gestao(origem.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  autor := private.membro_atual(origem.consultoria_id);
  if autor is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_modalidade is null or p_modalidade not in ('trifasica', 'AuA', 'LAO') then
    raise exception 'modalidade_invalida' using errcode = '22023';
  end if;
  if p_modelo_id is null then
    raise exception 'id_obrigatorio' using errcode = '22023';
  end if;

  -- Idempotência pelo id do modelo.
  select m.consultoria_id into dono from public.orcamento_modelo as m where m.id = p_modelo_id;
  if found then
    if dono = origem.consultoria_id then
      return p_modelo_id;
    end if;
    raise exception 'modelo_existente' using errcode = 'P0001';
  end if;

  -- Os valores anteriores da modalidade vão para a lixeira dos modelos (não somem).
  update public.orcamento_modelo as m
  set excluido_em = now(), excluido_por = autor
  where m.consultoria_id = origem.consultoria_id and m.modalidade = p_modalidade and m.excluido_em is null;

  perform public.salvar_modelo_de_orcamento(p_orcamento_id, p_modelo_id, p_nome);

  update public.orcamento_modelo as m
  set modalidade = p_modalidade,
      despesas = coalesce((
        select jsonb_agg(d.valor order by d.ordem)
        from jsonb_array_elements(m.despesas) with ordinality as d (valor, ordem)
        where not private.eh_taxa_do_orgao(d.valor ->> 'descricao')), '[]'::jsonb)
  where m.id = p_modelo_id;

  return p_modelo_id;
end;
$$;

comment on function public.salvar_valores_da_modalidade(uuid, uuid, text, text) is
  'Guarda os itens do orçamento como valores da modalidade (ADR-0056), sem a taxa do órgão. Só Gestão.';

revoke all on function public.salvar_valores_da_modalidade(uuid, uuid, text, text) from public, anon;
grant execute on function public.salvar_valores_da_modalidade(uuid, uuid, text, text) to authenticated;
