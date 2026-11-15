-- Modelos próprios e duplicação de orçamento (ADR-0018, fatia 5; P7).
-- 1. orcamento_modelo: modelo de serviço da consultoria, salvo a partir de um orçamento. Guarda só o
--    escopo: objeto, itens (descrição, horas e linha da tabela de preços com a unidade), despesas
--    (descrição e tratamento, sem valor), premissas e exclusões. Nunca cliente, prospecto, preços,
--    estimativas, responsáveis, meses, parcelas ou prazos. Exclusão lógica.
-- 2. duplicar_orcamento: novo rascunho com novo número, para o mesmo cliente ou prospecto. Copia o
--    escopo, os responsáveis ativos, as condições (prazos, validade, parcelas) e a forma de preço.
--    Os preços do orçamento (acréscimo, preço fechado, outros custos, estimativas das despesas e
--    outros gastos da visita) só com p_copiar_precos. Nunca o mês previsto, a situação, o histórico
--    nem a lixeira. A tabela de preços e a base de custos são sempre as atuais.
-- 3. orcamento.duplicado_de: de qual orçamento veio a cópia.

create table public.orcamento_modelo (
  id uuid primary key,
  consultoria_id uuid not null references public.consultoria (id) on delete restrict,
  nome text not null,
  objeto text not null,
  itens jsonb not null,
  despesas jsonb not null default '[]'::jsonb,
  premissas text[] not null default '{}',
  exclusoes text[] not null default '{}',
  orcamento_origem_id uuid,
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  row_version integer not null default 1,
  excluido_em timestamptz,
  excluido_por uuid,
  constraint orcamento_modelo_consultoria_id_id_key unique (consultoria_id, id),
  constraint orcamento_modelo_nome check (length(btrim(nome)) between 1 and 120),
  constraint orcamento_modelo_objeto check (length(btrim(objeto)) > 0),
  constraint orcamento_modelo_listas check (
    jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) between 1 and 200
    and jsonb_typeof(despesas) = 'array' and jsonb_array_length(despesas) <= 100),
  constraint orcamento_modelo_exclusao check ((excluido_em is null) = (excluido_por is null)),
  constraint orcamento_modelo_origem_fk foreign key (consultoria_id, orcamento_origem_id)
    references public.orcamento (consultoria_id, id) on delete restrict,
  constraint orcamento_modelo_criado_por_fk foreign key (consultoria_id, criado_por)
    references public.membro (consultoria_id, id) on delete restrict,
  constraint orcamento_modelo_excluido_por_fk foreign key (consultoria_id, excluido_por)
    references public.membro (consultoria_id, id) on delete restrict
);

comment on table public.orcamento_modelo is
  'Modelo de serviço da consultoria (ADR-0018, P7): só escopo, unidade e horas; sem cliente nem preço.';
comment on column public.orcamento_modelo.itens is
  '[{descricao, minutos, hora_venda_id, unidade}]: a linha da tabela de preços vale a do momento de aplicar.';
comment on column public.orcamento_modelo.despesas is '[{descricao, tratamento}]: entram a cotar.';

create unique index orcamento_modelo_nome_idx
  on public.orcamento_modelo (consultoria_id, lower(btrim(nome))) where excluido_em is null;

alter table public.orcamento_modelo enable row level security;
alter table public.orcamento_modelo force row level security;
revoke all on table public.orcamento_modelo from anon, authenticated;
grant select on table public.orcamento_modelo to authenticated;

create policy orcamento_modelo_select_gestao
  on public.orcamento_modelo for select to authenticated
  using ((select private.is_gestao(consultoria_id)));

create trigger orcamento_modelo_auditar
  after insert or update or delete on public.orcamento_modelo
  for each row execute function private.auditar();

alter table public.orcamento add column duplicado_de uuid;
alter table public.orcamento add constraint orcamento_duplicado_de_fk
  foreign key (consultoria_id, duplicado_de) references public.orcamento (consultoria_id, id) on delete restrict;
comment on column public.orcamento.duplicado_de is 'Orçamento de onde esta cópia veio (fatia 5).';

-- ---------------------------------------------------------------------------
-- Salvar como modelo: lê o orçamento salvo no banco (nunca o que o aparelho manda) e copia só o
-- escopo. Repetir com o mesmo p_modelo_id devolve o modelo já criado.
-- ---------------------------------------------------------------------------
create function public.salvar_modelo_de_orcamento(p_orcamento_id uuid, p_modelo_id uuid, p_nome text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  origem public.orcamento%rowtype;
  autor uuid;
  nome_limpo text := btrim(coalesce(p_nome, ''));
  existente uuid;
begin
  if p_modelo_id is null then
    raise exception 'id_obrigatorio' using errcode = '22023';
  end if;
  select * into origem from public.orcamento as o where o.id = p_orcamento_id;
  if not found or not private.is_gestao(origem.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  autor := private.membro_atual(origem.consultoria_id);
  if autor is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  select m.consultoria_id into existente from public.orcamento_modelo as m where m.id = p_modelo_id;
  if found then
    if existente = origem.consultoria_id then
      return p_modelo_id;
    end if;
    raise exception 'modelo_existente' using errcode = 'P0001';
  end if;

  if origem.excluido_em is not null then
    raise exception 'orcamento_na_lixeira' using errcode = 'P0001';
  end if;
  if length(nome_limpo) not between 1 and 120 then
    raise exception 'nome_invalido' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.orcamento_modelo as m
    where m.consultoria_id = origem.consultoria_id and m.excluido_em is null
      and lower(btrim(m.nome)) = lower(nome_limpo)
  ) then
    raise exception 'modelo_com_mesmo_nome' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.orcamento_item as i
    where i.consultoria_id = origem.consultoria_id and i.orcamento_id = origem.id
  ) then
    raise exception 'modelo_sem_itens' using errcode = '22023';
  end if;

  insert into public.orcamento_modelo (
    id, consultoria_id, nome, objeto, itens, despesas, premissas, exclusoes, orcamento_origem_id, criado_por)
  values (
    p_modelo_id, origem.consultoria_id, nome_limpo, origem.objeto,
    (select jsonb_agg(jsonb_build_object(
              'descricao', i.descricao,
              'minutos', i.minutos,
              'hora_venda_id', i.hora_venda_id,
              'unidade', coalesce(hv.unidade, 'hora')) order by i.ordem, i.id)
     from public.orcamento_item as i
     left join lateral (
       select h.valor ->> 'unidade' as unidade
       from jsonb_array_elements(coalesce(origem.base_horas_venda, '[]'::jsonb)) as h (valor)
       where h.valor ->> 'id' = i.hora_venda_id
       limit 1
     ) as hv on true
     where i.consultoria_id = origem.consultoria_id and i.orcamento_id = origem.id),
    coalesce((
      select jsonb_agg(jsonb_build_object('descricao', d.descricao, 'tratamento', d.tratamento)
                       order by d.ordem, d.id)
      from public.orcamento_despesa as d
      where d.consultoria_id = origem.consultoria_id and d.orcamento_id = origem.id), '[]'::jsonb),
    origem.premissas, origem.exclusoes, origem.id, autor);

  return p_modelo_id;
end;
$$;

revoke all on function public.salvar_modelo_de_orcamento(uuid, uuid, text) from public, anon;
grant execute on function public.salvar_modelo_de_orcamento(uuid, uuid, text) to authenticated;

-- Modelos ativos da consultoria, por nome, paginados. A RLS restringe à Gestão.
create function public.listar_modelos_de_orcamento(
  p_consultoria_id uuid,
  p_busca text default null,
  p_limite integer default 50,
  p_deslocamento integer default 0
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with filtrados as (
    select m.*
    from public.orcamento_modelo as m
    where m.consultoria_id = p_consultoria_id and m.excluido_em is null
      and (nullif(btrim(coalesce(p_busca, '')), '') is null
           or m.nome ilike '%' || btrim(p_busca) || '%' or m.objeto ilike '%' || btrim(p_busca) || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrados),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'nome', f.nome, 'objeto', f.objeto, 'itens', f.itens, 'despesas', f.despesas,
               'premissas', to_jsonb(f.premissas), 'exclusoes', to_jsonb(f.exclusoes),
               'criado_em', f.criado_em, 'row_version', f.row_version) order by lower(f.nome), f.id)
      from (
        select * from filtrados
        order by lower(nome), id
        limit least(greatest(coalesce(p_limite, 50), 1), 100)
        offset greatest(coalesce(p_deslocamento, 0), 0)
      ) as f), '[]'::jsonb))
$$;

revoke all on function public.listar_modelos_de_orcamento(uuid, text, integer, integer) from public, anon;
grant execute on function public.listar_modelos_de_orcamento(uuid, text, integer, integer) to authenticated;

-- Exclusão lógica do modelo (os orçamentos feitos com ele não mudam).
create function public.excluir_modelo_de_orcamento(p_id uuid, p_row_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.orcamento_modelo%rowtype;
  autor uuid;
begin
  select * into alvo from public.orcamento_modelo as m where m.id = p_id for update;
  if not found or not private.is_gestao(alvo.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  autor := private.membro_atual(alvo.consultoria_id);
  if autor is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.excluido_em is not null then
    return;
  end if;
  if alvo.row_version <> p_row_version then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  update public.orcamento_modelo as m
  set excluido_em = now(), excluido_por = autor, atualizado_em = now(), row_version = m.row_version + 1
  where m.id = p_id;
end;
$$;

revoke all on function public.excluir_modelo_de_orcamento(uuid, integer) from public, anon;
grant execute on function public.excluir_modelo_de_orcamento(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Duplicar: cria pelo mesmo caminho de sempre (criar_orcamento + salvar_orcamento), então valem as
-- mesmas regras e a mesma numeração. Repetir com o mesmo p_novo_id devolve a cópia já feita.
-- ---------------------------------------------------------------------------
create function public.duplicar_orcamento(p_id uuid, p_novo_id uuid, p_copiar_precos boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  origem public.orcamento%rowtype;
  existente public.orcamento%rowtype;
  copiar boolean := coalesce(p_copiar_precos, false);
  prospecto jsonb;
  ids_da_tabela text[];
  versao integer;
begin
  if p_novo_id is null then
    raise exception 'id_obrigatorio' using errcode = '22023';
  end if;
  select * into origem from public.orcamento as o where o.id = p_id;
  if not found or not private.is_gestao(origem.consultoria_id)
     or private.membro_atual(origem.consultoria_id) is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  select * into existente from public.orcamento as o where o.id = p_novo_id;
  if found then
    if existente.consultoria_id = origem.consultoria_id and existente.duplicado_de = p_id then
      return p_novo_id;
    end if;
    raise exception 'orcamento_existente' using errcode = 'P0001';
  end if;

  if origem.excluido_em is not null then
    raise exception 'orcamento_na_lixeira' using errcode = 'P0001';
  end if;

  if origem.empreendimento_id is null then
    prospecto := jsonb_build_object(
      'nome', origem.prospecto_nome, 'cnpj', origem.prospecto_cnpj, 'contato', origem.prospecto_contato,
      'email', origem.prospecto_email, 'telefone', origem.prospecto_telefone);
  end if;

  perform public.criar_orcamento(p_novo_id, origem.consultoria_id, origem.empreendimento_id, origem.objeto,
                                 prospecto);

  -- Linha da tabela de preços que não existe mais fica sem preço (a tela pede para escolher).
  select coalesce(array_agg(h.valor ->> 'id'), '{}'), o.row_version
    into ids_da_tabela, versao
  from public.orcamento as o
  left join lateral jsonb_array_elements(coalesce(o.base_horas_venda, '[]'::jsonb)) as h (valor) on true
  where o.id = p_novo_id
  group by o.row_version;

  perform public.salvar_orcamento(p_novo_id, versao, jsonb_build_object(
    'objeto', origem.objeto,
    'destinatario', origem.destinatario,
    'prazos', origem.prazos,
    'validade_dias', origem.validade_dias,
    'premissas', to_jsonb(origem.premissas),
    'exclusoes', to_jsonb(origem.exclusoes),
    'forma_preco', origem.forma_preco,
    'margem_pb', case when copiar then origem.margem_pb end,
    'visitas', jsonb_build_object(
      'quantidade', origem.visitas,
      'km_por_visita', origem.km_por_visita,
      'outros_por_visita_centavos', case when copiar then origem.outros_por_visita_centavos else 0 end),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', gen_random_uuid(),
               'descricao', i.descricao,
               'minutos', i.minutos,
               'hora_venda_id', case when i.hora_venda_id = any (ids_da_tabela) then i.hora_venda_id end,
               'responsavel_id', case when exists (
                   select 1 from public.membro as m
                   where m.consultoria_id = origem.consultoria_id and m.id = i.responsavel_id
                     and m.situacao = 'ativo') then i.responsavel_id end,
               'quantidade', i.quantidade,
               'custo_direto_extra_centavos', case when copiar then i.custo_direto_extra_centavos else 0 end,
               'preco_fechado_centavos', case when copiar then i.preco_fechado_centavos end)
             order by i.ordem, i.id)
      from public.orcamento_item as i
      where i.consultoria_id = origem.consultoria_id and i.orcamento_id = origem.id), '[]'::jsonb),
    'despesas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', gen_random_uuid(),
               'descricao', d.descricao,
               'estimativa_centavos', case when copiar then d.estimativa_centavos end,
               'tratamento', d.tratamento) order by d.ordem, d.id)
      from public.orcamento_despesa as d
      where d.consultoria_id = origem.consultoria_id and d.orcamento_id = origem.id), '[]'::jsonb),
    'parcelas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', gen_random_uuid(),
               'descricao', p.descricao,
               'dias', p.dias,
               'percentual_pb', p.percentual_pb) order by p.ordem, p.id)
      from public.orcamento_parcela as p
      where p.consultoria_id = origem.consultoria_id and p.orcamento_id = origem.id), '[]'::jsonb)));

  update public.orcamento as o set duplicado_de = origem.id where o.id = p_novo_id;
  return p_novo_id;
end;
$$;

revoke all on function public.duplicar_orcamento(uuid, uuid, boolean) from public, anon;
grant execute on function public.duplicar_orcamento(uuid, uuid, boolean) to authenticated;

-- Leitura do orçamento com "duplicado_de".
create or replace function public.obter_orcamento(p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id,
    'consultoria_id', o.consultoria_id,
    'ano', o.ano,
    'sequencia', o.sequencia,
    'revisao', o.revisao,
    'situacao', o.situacao,
    'empreendimento_id', o.empreendimento_id,
    'empreendimento_nome', coalesce(e.nome, o.prospecto_nome),
    'prospecto', case when o.prospecto_nome is null then null else jsonb_build_object(
      'nome', o.prospecto_nome,
      'cnpj', o.prospecto_cnpj,
      'contato', o.prospecto_contato,
      'email', o.prospecto_email,
      'telefone', o.prospecto_telefone) end,
    'objeto', o.objeto,
    'destinatario', o.destinatario,
    'prazos', o.prazos,
    'validade_dias', o.validade_dias,
    'premissas', to_jsonb(o.premissas),
    'exclusoes', to_jsonb(o.exclusoes),
    'moeda', o.moeda,
    'margem_pb', o.margem_pb,
    'forma_preco', o.forma_preco,
    'visitas', jsonb_build_object(
      'quantidade', o.visitas,
      'km_por_visita', o.km_por_visita,
      'outros_por_visita_centavos', o.outros_por_visita_centavos),
    'preco_visitas_centavos', o.preco_visitas_centavos,
    'base', case when o.base_registrada_em is null then null else jsonb_build_object(
      'hora_tecnica_centavos', o.base_hora_tecnica_centavos,
      'custo_fixo_hora_centavos', o.base_custo_fixo_hora_centavos,
      'margem_desejada_pb', o.base_margem_desejada_pb,
      'margem_minima_pb', o.base_margem_minima_pb,
      'tributos_pb', o.base_tributos_pb,
      'taxas_pb', o.base_taxas_pb,
      'taxa_por_cobranca_centavos', o.base_taxa_por_cobranca_centavos,
      'taxa_por_assinatura_centavos', o.base_taxa_por_assinatura_centavos,
      'valor_visita_centavos', coalesce(o.base_valor_visita_centavos, 0),
      'custo_km_centavos', coalesce(o.base_custo_km_centavos, 0),
      'custos_fixos_mensais_centavos', coalesce(o.base_custos_fixos_mensais_centavos, 0),
      'custos_fixos_equipe_centavos', coalesce(o.base_custos_fixos_equipe_centavos, 0),
      'custos_fixos_detalhe', coalesce(o.base_custos_fixos_detalhe, '[]'::jsonb),
      'horas_venda', coalesce(o.base_horas_venda, '[]'::jsonb),
      'custo_hora_profissao', coalesce(o.base_custo_hora_profissao, '[]'::jsonb),
      'custo_hora_membro', coalesce(o.base_custo_hora_membro, '[]'::jsonb),
      'registrada_em', o.base_registrada_em) end,
    'atualizado_em', o.atualizado_em,
    'excluido_em', o.excluido_em,
    'row_version', o.row_version,
    -- Cópia de outro orçamento (fatia 5): só o número, para a tela dizer de onde veio.
    'duplicado_de', (
      select jsonb_build_object('id', d.id, 'ano', d.ano, 'sequencia', d.sequencia, 'revisao', d.revisao)
      from public.orcamento as d
      where d.consultoria_id = o.consultoria_id and d.id = o.duplicado_de),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'descricao', i.descricao, 'minutos', i.minutos,
        'preco_automatico', i.preco_automatico, 'preco_centavos', i.preco_centavos,
        'custo_direto_extra_centavos', i.custo_direto_extra_centavos,
        'hora_venda_id', i.hora_venda_id, 'responsavel_id', i.responsavel_id,
        'mes_previsto', i.mes_previsto, 'quantidade', i.quantidade,
        'preco_fechado_centavos', i.preco_fechado_centavos) order by i.ordem, i.id)
      from public.orcamento_item as i
      where i.consultoria_id = o.consultoria_id and i.orcamento_id = o.id), '[]'::jsonb),
    'despesas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'descricao', d.descricao, 'estimativa_centavos', d.estimativa_centavos,
        'tratamento', d.tratamento) order by d.ordem, d.id)
      from public.orcamento_despesa as d
      where d.consultoria_id = o.consultoria_id and d.orcamento_id = o.id), '[]'::jsonb),
    'parcelas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'descricao', p.descricao, 'dias', p.dias, 'percentual_pb', p.percentual_pb)
        order by p.ordem, p.id)
      from public.orcamento_parcela as p
      where p.consultoria_id = o.consultoria_id and p.orcamento_id = o.id), '[]'::jsonb)
  )
  from public.orcamento as o
  left join public.empreendimento as e on e.consultoria_id = o.consultoria_id and e.id = o.empreendimento_id
  where o.id = p_id
$$;
