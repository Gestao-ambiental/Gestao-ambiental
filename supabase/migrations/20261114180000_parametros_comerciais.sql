-- Planos e parâmetros comerciais editáveis pela central (ADR-0026, seção "Parâmetros pela central";
-- protótipo, decisão do Eduardo de 14/11/2026).
--
--   catalogo_comercial                       qualquer usuário autenticado lê os 3 planos e a
--                                            configuração (preço e limite não são segredo). O front
--                                            mostra preço, nome e limite a partir daqui.
--   central_atualizar_plano                  operador com dois fatores muda nome, mensalidade,
--                                            pessoas, empreendimentos, orçamentos e IA de um plano.
--   central_atualizar_configuracao_comercial operador com dois fatores muda fim do beta, teste
--                                            padrão, adicional, mensalidades no anual e tolerância.
--   central_historico_parametros             histórico append-only (antes e depois, motivo, quem).
--
-- Vale para as PRÓXIMAS cobranças: a cobrança guarda o próprio valor_centavos ao ser criada, e as
-- funções que calculam valor (valor_do_ciclo, equivalente_mensal, adicionais_centavos) e situação
-- (situacao_comercial_calculada, situacao_comercial_em) já leem private.plano_catalogo e
-- private.configuracao_comercial no momento do cálculo; nenhuma usa número fixo. Por isso nenhuma
-- função antiga muda aqui. Motivo obrigatório; os valores são validados pelos checks que já existem
-- nas duas tabelas (valores positivos, anual de 1 a 12 etc.).

-- ---------------------------------------------------------------------------
-- 1. Histórico append-only (schema private: fora da API; leitura só pela RPC do operador).
-- ---------------------------------------------------------------------------
create table private.parametro_comercial_historico (
  id uuid primary key default gen_random_uuid(),
  alvo text not null,
  antes jsonb not null,
  depois jsonb not null,
  motivo text not null,
  alterada_por uuid not null references auth.users (id) on delete restrict,
  alterada_em timestamptz not null default now(),
  constraint parametro_comercial_historico_alvo check (
    alvo in ('configuracao', 'plano:essencial', 'plano:equipe', 'plano:escala')
  ),
  constraint parametro_comercial_historico_motivo check (length(btrim(motivo)) between 1 and 500)
);

comment on table private.parametro_comercial_historico is
  'Mudanças dos planos e da configuração comercial feitas pela central (ADR-0026). Append-only.';
comment on column private.parametro_comercial_historico.alterada_por is
  'Usuário operador (auth.users), não membro.';

create index parametro_comercial_historico_alterada_em_idx
  on private.parametro_comercial_historico (alterada_em desc, id);

alter table private.parametro_comercial_historico enable row level security;
alter table private.parametro_comercial_historico force row level security;
revoke all on table private.parametro_comercial_historico from public, anon, authenticated;

create trigger parametro_comercial_historico_bloquear_update_delete
  before update or delete on private.parametro_comercial_historico
  for each row execute function private.bloquear_alteracao_auditoria();
create trigger parametro_comercial_historico_bloquear_truncate
  before truncate on private.parametro_comercial_historico
  for each statement execute function private.bloquear_alteracao_auditoria();

-- Motivo limpo (1 a 500 caracteres) ou erro estável.
create function private.motivo_obrigatorio(p_motivo text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if v is null then
    raise exception 'motivo_obrigatorio' using errcode = '22023';
  end if;
  if length(v) > 500 then
    raise exception 'texto_longo_demais' using errcode = '22023';
  end if;
  return v;
end;
$$;

revoke all on function private.motivo_obrigatorio(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Leitura: qualquer autenticado.
-- ---------------------------------------------------------------------------
create function public.catalogo_comercial()
returns table (
  codigo text,
  nome text,
  mensal_centavos integer,
  pessoas integer,
  empreendimentos integer,
  orcamentos boolean,
  ia boolean,
  ordem integer,
  adicional_mensal_centavos integer,
  mensalidades_no_anual integer,
  dias_de_teste_padrao integer,
  dias_uteis_de_tolerancia integer,
  fim_do_beta date,
  moeda text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.codigo, p.nome, p.mensal_centavos, p.pessoas, p.empreendimentos, p.orcamentos, p.ia, p.ordem,
         cfg.adicional_mensal_centavos, cfg.mensalidades_no_anual, cfg.dias_de_teste_padrao,
         cfg.dias_uteis_de_tolerancia, cfg.fim_do_beta, cfg.moeda
  from private.plano_catalogo as p
  cross join private.configuracao_comercial as cfg
  where (select auth.uid()) is not null
  order by p.ordem, p.codigo
$$;

-- ---------------------------------------------------------------------------
-- 3. Escrita: operador com dois fatores, motivo obrigatório, histórico na mesma transação.
-- Repetir os mesmos valores não muda nada nem grava histórico.
-- ---------------------------------------------------------------------------
create function public.central_atualizar_plano(
  p_codigo text,
  p_nome text,
  p_mensal_centavos integer,
  p_pessoas integer,
  p_empreendimentos integer,
  p_orcamentos boolean,
  p_ia boolean,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text;
  v_atual private.plano_catalogo;
  v_antes jsonb;
  v_depois jsonb;
begin
  perform private.exigir_operador();
  v_motivo := private.motivo_obrigatorio(p_motivo);
  if p_nome is null or btrim(p_nome) = '' or length(btrim(p_nome)) > 60 or p_mensal_centavos is null
     or p_pessoas is null or p_empreendimentos is null or p_orcamentos is null or p_ia is null then
    raise exception 'valores_invalidos' using errcode = '22023';
  end if;
  select * into v_atual from private.plano_catalogo as p where p.codigo = p_codigo for update;
  if not found then
    raise exception 'plano_inexistente' using errcode = 'P0001';
  end if;

  v_antes := jsonb_build_object('nome', v_atual.nome, 'mensal_centavos', v_atual.mensal_centavos,
    'pessoas', v_atual.pessoas, 'empreendimentos', v_atual.empreendimentos,
    'orcamentos', v_atual.orcamentos, 'ia', v_atual.ia);
  v_depois := jsonb_build_object('nome', btrim(p_nome), 'mensal_centavos', p_mensal_centavos,
    'pessoas', p_pessoas, 'empreendimentos', p_empreendimentos,
    'orcamentos', p_orcamentos, 'ia', p_ia);
  if v_antes = v_depois then
    return;
  end if;

  begin
    update private.plano_catalogo as p
    set nome = btrim(p_nome), mensal_centavos = p_mensal_centavos, pessoas = p_pessoas,
        empreendimentos = p_empreendimentos, orcamentos = p_orcamentos, ia = p_ia
    where p.codigo = p_codigo;
  exception when check_violation then
    raise exception 'valores_invalidos' using errcode = '22023';
  end;

  insert into private.parametro_comercial_historico (alvo, antes, depois, motivo, alterada_por)
  values ('plano:' || p_codigo, v_antes, v_depois, v_motivo, (select auth.uid()));
end;
$$;

create function public.central_atualizar_configuracao_comercial(
  p_fim_do_beta date,
  p_dias_de_teste_padrao integer,
  p_adicional_mensal_centavos integer,
  p_mensalidades_no_anual integer,
  p_dias_uteis_de_tolerancia integer,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text;
  v_atual private.configuracao_comercial;
  v_antes jsonb;
  v_depois jsonb;
begin
  perform private.exigir_operador();
  v_motivo := private.motivo_obrigatorio(p_motivo);
  if p_fim_do_beta is null or p_dias_de_teste_padrao is null or p_adicional_mensal_centavos is null
     or p_mensalidades_no_anual is null or p_dias_uteis_de_tolerancia is null then
    raise exception 'valores_invalidos' using errcode = '22023';
  end if;
  select * into v_atual from private.configuracao_comercial as cfg where cfg.id for update;

  v_antes := jsonb_build_object('fim_do_beta', v_atual.fim_do_beta,
    'dias_de_teste_padrao', v_atual.dias_de_teste_padrao,
    'adicional_mensal_centavos', v_atual.adicional_mensal_centavos,
    'mensalidades_no_anual', v_atual.mensalidades_no_anual,
    'dias_uteis_de_tolerancia', v_atual.dias_uteis_de_tolerancia);
  v_depois := jsonb_build_object('fim_do_beta', p_fim_do_beta,
    'dias_de_teste_padrao', p_dias_de_teste_padrao,
    'adicional_mensal_centavos', p_adicional_mensal_centavos,
    'mensalidades_no_anual', p_mensalidades_no_anual,
    'dias_uteis_de_tolerancia', p_dias_uteis_de_tolerancia);
  if v_antes = v_depois then
    return;
  end if;

  begin
    update private.configuracao_comercial as cfg
    set fim_do_beta = p_fim_do_beta, dias_de_teste_padrao = p_dias_de_teste_padrao,
        adicional_mensal_centavos = p_adicional_mensal_centavos,
        mensalidades_no_anual = p_mensalidades_no_anual,
        dias_uteis_de_tolerancia = p_dias_uteis_de_tolerancia
    where cfg.id;
  exception when check_violation then
    raise exception 'valores_invalidos' using errcode = '22023';
  end;

  insert into private.parametro_comercial_historico (alvo, antes, depois, motivo, alterada_por)
  values ('configuracao', v_antes, v_depois, v_motivo, (select auth.uid()));
end;
$$;

-- Histórico das mudanças (mais recente primeiro), paginado.
create function public.central_historico_parametros(
  p_limite integer default 50,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  alvo text,
  antes jsonb,
  depois jsonb,
  motivo text,
  alterada_em timestamptz,
  alterada_por_nome text,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_operador();
  return query
  select h.id, h.alvo, h.antes, h.depois, h.motivo, h.alterada_em,
         private.nome_do_usuario(u.raw_user_meta_data, u.email), count(*) over ()
  from private.parametro_comercial_historico as h
  join auth.users as u on u.id = h.alterada_por
  order by h.alterada_em desc, h.id
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0);
end;
$$;

revoke all on function public.catalogo_comercial() from public, anon;
revoke all on function public.central_atualizar_plano(text, text, integer, integer, integer, boolean, boolean, text)
  from public, anon;
revoke all on function public.central_atualizar_configuracao_comercial(date, integer, integer, integer, integer, text)
  from public, anon;
revoke all on function public.central_historico_parametros(integer, integer) from public, anon;
grant execute on function public.catalogo_comercial() to authenticated;
grant execute on function public.central_atualizar_plano(text, text, integer, integer, integer, boolean, boolean, text)
  to authenticated;
grant execute on function public.central_atualizar_configuracao_comercial(date, integer, integer, integer, integer, text)
  to authenticated;
grant execute on function public.central_historico_parametros(integer, integer) to authenticated;
