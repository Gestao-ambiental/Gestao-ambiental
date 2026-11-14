-- Recursos por plano e plano por contrato (ADR-0030; decisão do Eduardo de 14/11/2026).
--
-- 1. Recursos por plano: além de orçamentos e IA (colunas que já existiam), cada plano tem uma
--    lista de recursos ligados (capacidade, integracao_ima, financeiro, analise_lotes). A central
--    liga e desliga com motivo e histórico (central_definir_recursos_do_plano). Padrão:
--    Essencial nenhum; Equipe capacidade; Escala todos.
--    private.recurso_liberado(cid, recurso) diz se a consultoria pode usar o recurso hoje (teste,
--    beta e conta interna liberam tudo; só leitura não libera nada). A barreira comercial de
--    escrita passa a aceitar o nome de um recurso como 2º argumento (como já fazia com
--    'orcamentos'): tabela de um recurso fora do plano recusa escrita com 'recurso_fora_do_plano'.
--    Os recursos novos ainda não têm tabelas; quando tiverem, a trigger delas recebe o nome.
-- 2. Plano por contrato: a central põe a consultoria num plano sem cobrança pelo Grama (contrato
--    fechado por fora, cortesia ou desconto negociado), até uma data ou sem prazo, com motivo e
--    histórico. Enquanto vale, a situação calculada é 'contrato': limites e recursos do plano,
--    nada de cobrança nem bloqueio por atraso, e assinar ou trocar o plano pelo app é recusado
--    ('plano_por_contrato'). Depois da data, valem as regras de sempre (assinatura, teste
--    encerrado). Fora do MRR (o dinheiro não passa pelo Grama); aparece no Financeiro como
--    "Por contrato".

-- ---------------------------------------------------------------------------
-- 1. Recursos por plano
-- ---------------------------------------------------------------------------
alter table private.plano_catalogo
  add column recursos text[] not null default '{}',
  add constraint plano_catalogo_recursos check (
    recursos <@ array['capacidade', 'integracao_ima', 'financeiro', 'analise_lotes']::text[]);

update private.plano_catalogo
set recursos = case codigo
  when 'equipe' then array['capacidade']
  when 'escala' then array['capacidade', 'integracao_ima', 'financeiro', 'analise_lotes']
  else '{}'::text[] end;

drop function public.catalogo_comercial();

create function public.catalogo_comercial()
returns table (
  codigo text,
  nome text,
  mensal_centavos integer,
  pessoas integer,
  empreendimentos integer,
  orcamentos boolean,
  ia boolean,
  recursos text[],
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
  select p.codigo, p.nome, p.mensal_centavos, p.pessoas, p.empreendimentos, p.orcamentos, p.ia,
         p.recursos, p.ordem, cfg.adicional_mensal_centavos, cfg.mensalidades_no_anual,
         cfg.dias_de_teste_padrao, cfg.dias_uteis_de_tolerancia, cfg.fim_do_beta, cfg.moeda
  from private.plano_catalogo as p
  cross join private.configuracao_comercial as cfg
  where (select auth.uid()) is not null
  order by p.ordem, p.codigo
$$;

revoke all on function public.catalogo_comercial() from public, anon;
grant execute on function public.catalogo_comercial() to authenticated;

-- Ligar e desligar recursos de um plano (operador com dois fatores, motivo e histórico).
create function public.central_definir_recursos_do_plano(
  p_codigo text,
  p_recursos text[],
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
  v_novos text[];
begin
  perform private.exigir_operador();
  v_motivo := private.motivo_obrigatorio(p_motivo);
  select * into v_atual from private.plano_catalogo as p where p.codigo = p_codigo for update;
  if not found then
    raise exception 'plano_inexistente' using errcode = 'P0001';
  end if;
  -- Ordem fixa e sem repetição, para o histórico comparar listas iguais.
  select coalesce(array_agg(r order by r), '{}') into v_novos
  from (select distinct unnest(coalesce(p_recursos, '{}'::text[])) as r) as x;
  if not v_novos <@ array['capacidade', 'integracao_ima', 'financeiro', 'analise_lotes']::text[] then
    raise exception 'recurso_invalido' using errcode = '22023';
  end if;
  if (select coalesce(array_agg(r order by r), '{}') from unnest(v_atual.recursos) as r) = v_novos then
    return;
  end if;

  update private.plano_catalogo as p set recursos = v_novos where p.codigo = p_codigo;
  insert into private.parametro_comercial_historico (alvo, antes, depois, motivo, alterada_por)
  values ('plano:' || p_codigo, jsonb_build_object('recursos', to_jsonb(v_atual.recursos)),
          jsonb_build_object('recursos', to_jsonb(v_novos)), v_motivo, (select auth.uid()));
end;
$$;

revoke all on function public.central_definir_recursos_do_plano(text, text[], text) from public, anon;
grant execute on function public.central_definir_recursos_do_plano(text, text[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Plano por contrato: colunas, histórico e situação calculada
-- ---------------------------------------------------------------------------
alter table public.consultoria_condicao_comercial
  add column plano_contrato text,
  add column contrato_ate date,
  add constraint consultoria_condicao_comercial_plano_contrato check (
    plano_contrato is null or plano_contrato in ('essencial', 'equipe', 'escala')),
  add constraint consultoria_condicao_comercial_contrato_coerente check (
    plano_contrato is not null or contrato_ate is null);

comment on column public.consultoria_condicao_comercial.plano_contrato is
  'Plano definido pela central sem cobrança pelo Grama (ADR-0030); nulo = sem contrato.';
comment on column public.consultoria_condicao_comercial.contrato_ate is
  'Último dia do plano por contrato; nulo = sem prazo.';

alter table public.condicao_comercial_historico
  drop constraint condicao_comercial_historico_tipo,
  add constraint condicao_comercial_historico_tipo check (
    tipo in ('dias_de_teste', 'interna', 'plano_contrato'));

drop function private.situacao_comercial_calculada(
  date, date, date, integer, boolean, text, text, text, text, date, date, date[]);

create function private.situacao_comercial_calculada(
  p_hoje date,
  p_criada_em date,
  p_fim_do_beta date,
  p_dias_de_teste integer,
  p_interna boolean,
  p_plano text,
  p_ciclo text,
  p_plano_agendado text,
  p_ciclo_agendado text,
  p_mudanca_em date,
  p_valida_ate date,
  p_vencimentos_em_aberto date[],
  p_plano_contrato text default null,
  p_contrato_ate date default null
)
returns table (
  situacao text,
  somente_leitura boolean,
  orcamentos_liberados boolean,
  plano_vigente text,
  ciclo_vigente text,
  limite_pessoas integer,
  limite_empreendimentos integer,
  teste_ate date,
  beta_ate date,
  em_atraso_desde date,
  bloqueio_em date,
  vence_hoje boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_teste_ate date;
  v_beta_ate date;
  v_vence_hoje boolean := p_hoje = any (coalesce(p_vencimentos_em_aberto, '{}'::date[]));
  v_plano text;
  v_ciclo text;
  v_pessoas integer;
  v_empreendimentos integer;
  v_orcamentos boolean;
  v_mais_antigo date;
  v_ultimo_dia date;
  v_tolerancia integer;
begin
  select cfg.dias_uteis_de_tolerancia into v_tolerancia from private.configuracao_comercial as cfg;
  v_beta_ate := case when p_criada_em <= p_fim_do_beta then p_fim_do_beta end;
  v_teste_ate := private.fim_do_teste(
    case when p_criada_em <= p_fim_do_beta then p_fim_do_beta + 1 else p_criada_em end,
    p_dias_de_teste
  );

  if p_interna then
    return query select 'interna'::text, false, true, null::text, null::text, null::integer,
      null::integer, v_teste_ate, v_beta_ate, null::date, null::date, false;
    return;
  end if;

  -- Plano por contrato (ADR-0030): vale até a data (ou sem prazo), sem cobrança nem atraso.
  if p_plano_contrato is not null and (p_contrato_ate is null or p_hoje <= p_contrato_ate) then
    select pc.pessoas, pc.empreendimentos, pc.orcamentos
    into v_pessoas, v_empreendimentos, v_orcamentos
    from private.plano_catalogo as pc
    where pc.codigo = p_plano_contrato;
    return query select 'contrato'::text, false, coalesce(v_orcamentos, false), p_plano_contrato,
      null::text, v_pessoas, v_empreendimentos, v_teste_ate, v_beta_ate, null::date, null::date, false;
    return;
  end if;

  if p_plano is not null then
    v_plano := case when p_plano_agendado is not null and p_mudanca_em is not null and p_hoje >= p_mudanca_em
                    then p_plano_agendado else p_plano end;
    v_ciclo := case when p_ciclo_agendado is not null and p_mudanca_em is not null and p_hoje >= p_mudanca_em
                    then p_ciclo_agendado else p_ciclo end;
  end if;

  if v_beta_ate is not null and p_hoje <= v_beta_ate then
    return query select 'beta'::text, false, true, v_plano, v_ciclo, null::integer, null::integer,
      v_teste_ate, v_beta_ate, null::date, null::date, v_vence_hoje;
    return;
  end if;

  if p_plano is not null and (p_valida_ate is null or p_hoje <= p_valida_ate) then
    select pc.pessoas, pc.empreendimentos, pc.orcamentos
    into v_pessoas, v_empreendimentos, v_orcamentos
    from private.plano_catalogo as pc
    where pc.codigo = v_plano;

    select min(v) into v_mais_antigo
    from unnest(coalesce(p_vencimentos_em_aberto, '{}'::date[])) as v
    where v < p_hoje;

    if v_mais_antigo is not null then
      v_ultimo_dia := private.somar_dias_uteis(v_mais_antigo, v_tolerancia);
      if p_hoje > v_ultimo_dia then
        return query select 'bloqueada'::text, true, false, v_plano, v_ciclo, v_pessoas, v_empreendimentos,
          v_teste_ate, v_beta_ate, v_mais_antigo, v_ultimo_dia + 1, v_vence_hoje;
      else
        return query select 'em_atraso'::text, false, v_orcamentos, v_plano, v_ciclo, v_pessoas,
          v_empreendimentos, v_teste_ate, v_beta_ate, v_mais_antigo, v_ultimo_dia + 1, v_vence_hoje;
      end if;
      return;
    end if;

    if p_hoje <= v_teste_ate then
      return query select 'teste'::text, false, true, v_plano, v_ciclo, null::integer, null::integer,
        v_teste_ate, v_beta_ate, null::date, null::date, v_vence_hoje;
      return;
    end if;

    return query select 'ativa'::text, false, v_orcamentos, v_plano, v_ciclo, v_pessoas, v_empreendimentos,
      v_teste_ate, v_beta_ate, null::date, null::date, v_vence_hoje;
    return;
  end if;

  if p_hoje <= v_teste_ate then
    return query select 'teste'::text, false, true, null::text, null::text, null::integer, null::integer,
      v_teste_ate, v_beta_ate, null::date, null::date, v_vence_hoje;
    return;
  end if;

  return query select case when p_plano is not null then 'cancelada' else 'teste_encerrado' end,
    true, false, null::text, null::text, null::integer, null::integer, v_teste_ate, v_beta_ate,
    null::date, null::date, false;
end;
$$;

revoke all on function private.situacao_comercial_calculada(
  date, date, date, integer, boolean, text, text, text, text, date, date, date[], text, date)
  from public, anon, authenticated;

create or replace function private.situacao_comercial_em(cid uuid, p_hoje date)
returns table (
  situacao text,
  somente_leitura boolean,
  orcamentos_liberados boolean,
  plano_vigente text,
  ciclo_vigente text,
  limite_pessoas integer,
  limite_empreendimentos integer,
  teste_ate date,
  beta_ate date,
  em_atraso_desde date,
  bloqueio_em date,
  vence_hoje boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_criada date;
  v_cfg private.configuracao_comercial;
  v_condicao public.consultoria_condicao_comercial;
  v_assinatura public.assinatura;
  v_vencimentos date[];
begin
  select (c.criada_em at time zone c.fuso)::date into v_criada from public.consultoria as c where c.id = cid;
  if not found then
    return;
  end if;
  select * into v_cfg from private.configuracao_comercial as cfg where cfg.id;
  select * into v_condicao from public.consultoria_condicao_comercial as cc where cc.consultoria_id = cid;
  select * into v_assinatura from public.assinatura as a where a.consultoria_id = cid;
  select coalesce(array_agg(cb.vencimento order by cb.vencimento), '{}'::date[]) into v_vencimentos
  from public.cobranca as cb
  where cb.consultoria_id = cid and cb.situacao in ('pendente', 'vencida');

  return query select * from private.situacao_comercial_calculada(
    p_hoje,
    v_criada,
    v_cfg.fim_do_beta,
    coalesce(v_condicao.dias_de_teste, v_cfg.dias_de_teste_padrao),
    coalesce(v_condicao.interna, false),
    v_assinatura.plano,
    v_assinatura.ciclo,
    v_assinatura.plano_agendado,
    v_assinatura.ciclo_agendado,
    v_assinatura.mudanca_em,
    v_assinatura.valida_ate,
    v_vencimentos,
    v_condicao.plano_contrato,
    v_condicao.contrato_ate
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Recurso liberado hoje e barreira de escrita por recurso
-- ---------------------------------------------------------------------------
create function private.recurso_liberado(cid uuid, p_recurso text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s record;
begin
  select * into s from private.situacao_comercial_em(cid, private.hoje_da_consultoria(cid));
  if not found or s.somente_leitura then
    return false;
  end if;
  if s.situacao in ('interna', 'beta', 'teste') then
    return true;
  end if;
  if p_recurso = 'orcamentos' then
    return s.orcamentos_liberados;
  end if;
  return exists (
    select 1 from private.plano_catalogo as pc
    where pc.codigo = s.plano_vigente
      and case p_recurso when 'ia' then pc.ia else p_recurso = any (pc.recursos) end
  );
end;
$$;

revoke all on function private.recurso_liberado(uuid, text) from public, anon, authenticated;

create or replace function private.bloquear_escrita_comercial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  coluna text := coalesce(tg_argv[0], 'consultoria_id');
  modulo text := coalesce(tg_argv[1], '');
  livres text[];
  cid uuid;
  s record;
begin
  if (select auth.uid()) is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    livres := case tg_table_name
      when 'consultoria' then array['situacao', 'situacao_motivo', 'situacao_alterada_em', 'situacao_alterada_por', 'row_version']
      when 'membro' then array['nome', 'email']
      else array[]::text[]
    end;
    if cardinality(livres) > 0 and (to_jsonb(new) - livres) = (to_jsonb(old) - livres) then
      return new;
    end if;
  end if;

  if tg_op = 'DELETE' then
    cid := (to_jsonb(old) ->> coluna)::uuid;
  else
    cid := (to_jsonb(new) ->> coluna)::uuid;
  end if;

  if cid is not null then
    select * into s from private.situacao_comercial_em(cid, private.hoje_da_consultoria(cid));
    if found then
      if s.somente_leitura then
        raise exception 'consultoria_somente_leitura' using errcode = '42501', detail = s.situacao;
      end if;
      if modulo = 'orcamentos' and not s.orcamentos_liberados then
        raise exception 'orcamentos_fora_do_plano' using errcode = '42501',
          hint = 'Orçamentos fazem parte dos planos Equipe e Escala.';
      end if;
      if modulo not in ('', 'orcamentos') and not private.recurso_liberado(cid, modulo) then
        raise exception 'recurso_fora_do_plano' using errcode = '42501', detail = modulo;
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Plano por contrato pela central e bloqueio de assinar pelo app enquanto vale
-- ---------------------------------------------------------------------------
-- p_plano nulo encerra o contrato. p_ate nulo = sem prazo; com data, não pode ser passada.
create function public.central_definir_plano_contrato(
  p_consultoria_id uuid,
  p_plano text,
  p_ate date,
  p_motivo text,
  p_row_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  atual public.consultoria_condicao_comercial;
  cfg private.configuracao_comercial;
  motivo_limpo text;
  anterior text;
  novo text;
begin
  perform private.exigir_operador();
  motivo_limpo := private.motivo_obrigatorio(p_motivo);
  if p_plano is not null and not exists (select 1 from private.plano_catalogo as pc where pc.codigo = p_plano) then
    raise exception 'plano_inexistente' using errcode = 'P0001';
  end if;
  if p_plano is null and p_ate is not null then
    raise exception 'valores_invalidos' using errcode = '22023';
  end if;
  perform 1 from public.consultoria as c where c.id = p_consultoria_id for update;
  if not found then
    raise exception 'consultoria_inexistente' using errcode = 'P0001';
  end if;
  if p_ate is not null and p_ate < private.hoje_da_consultoria(p_consultoria_id) then
    raise exception 'data_no_passado' using errcode = '22023';
  end if;
  select * into cfg from private.configuracao_comercial as x where x.id;
  select * into atual from public.consultoria_condicao_comercial as cc where cc.consultoria_id = p_consultoria_id;
  if coalesce(atual.row_version, 0) <> coalesce(p_row_version, -1) then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;

  anterior := coalesce(atual.plano_contrato || coalesce(' até ' || atual.contrato_ate::text, ' sem prazo'), 'sem contrato');
  novo := coalesce(p_plano || coalesce(' até ' || p_ate::text, ' sem prazo'), 'sem contrato');
  if anterior = novo then
    return coalesce(atual.row_version, 0);
  end if;

  insert into public.consultoria_condicao_comercial as cc
    (consultoria_id, dias_de_teste, interna, plano_contrato, contrato_ate, alterada_em, alterada_por)
  values (p_consultoria_id, cfg.dias_de_teste_padrao, false, p_plano, p_ate, now(), (select auth.uid()))
  on conflict (consultoria_id) do update
    set plano_contrato = p_plano,
        contrato_ate = p_ate,
        alterada_em = now(),
        alterada_por = (select auth.uid()),
        row_version = cc.row_version + 1;

  insert into public.condicao_comercial_historico
    (consultoria_id, tipo, valor_anterior, valor_novo, motivo, alterada_por)
  values (p_consultoria_id, 'plano_contrato', anterior, novo, motivo_limpo, (select auth.uid()));

  return (select cc.row_version from public.consultoria_condicao_comercial as cc
          where cc.consultoria_id = p_consultoria_id);
end;
$$;

revoke all on function public.central_definir_plano_contrato(uuid, text, date, text, integer) from public, anon;
grant execute on function public.central_definir_plano_contrato(uuid, text, date, text, integer) to authenticated;

-- Enquanto o plano por contrato vale, a Gestão não assina nem troca de plano pelo app.
create function private.recusar_assinatura_com_contrato()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if (tg_op = 'INSERT'
      or new.plano is distinct from old.plano
      or new.plano_agendado is distinct from old.plano_agendado
      or new.ciclo_agendado is distinct from old.ciclo_agendado)
     and exists (
       select 1 from private.situacao_comercial_em(new.consultoria_id,
                                                   private.hoje_da_consultoria(new.consultoria_id)) as s
       where s.situacao = 'contrato') then
    raise exception 'plano_por_contrato' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.recusar_assinatura_com_contrato() from public, anon, authenticated;

create trigger assinatura_recusar_com_contrato
  before insert or update on public.assinatura
  for each row execute function private.recusar_assinatura_com_contrato();

-- ---------------------------------------------------------------------------
-- 5. Central: plano da consultoria (com o contrato) e Financeiro (grupo "Por contrato")
-- ---------------------------------------------------------------------------
drop function public.central_plano_da_consultoria(uuid);

create function public.central_plano_da_consultoria(p_consultoria_id uuid)
returns table (
  hoje date,
  criada_em date,
  fim_do_beta date,
  dias_de_teste integer,
  interna boolean,
  condicao_row_version integer,
  plano text,
  ciclo text,
  forma text,
  plano_agendado text,
  ciclo_agendado text,
  mudanca_em date,
  valida_ate date,
  proximo_vencimento date,
  situacao_asaas text,
  vencimentos_em_aberto jsonb,
  pessoas integer,
  convites_pendentes integer,
  empreendimentos integer,
  situacao text,
  somente_leitura boolean,
  teste_ate date,
  em_atraso_desde date,
  bloqueio_em date,
  plano_contrato text,
  contrato_ate date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoje date;
begin
  perform private.exigir_operador();
  v_hoje := private.hoje_da_consultoria(p_consultoria_id);
  return query
  select
    v_hoje,
    (c.criada_em at time zone c.fuso)::date,
    cfg.fim_do_beta,
    coalesce(cc.dias_de_teste, cfg.dias_de_teste_padrao),
    coalesce(cc.interna, false),
    coalesce(cc.row_version, 0),
    a.plano,
    a.ciclo,
    a.forma,
    a.plano_agendado,
    a.ciclo_agendado,
    a.mudanca_em,
    a.valida_ate,
    a.proximo_vencimento,
    a.situacao_asaas,
    coalesce((
      select jsonb_agg(cb.vencimento order by cb.vencimento) from public.cobranca as cb
      where cb.consultoria_id = c.id and cb.situacao in ('pendente', 'vencida')
    ), '[]'::jsonb),
    private.pessoas_ativas(c.id),
    private.convites_pendentes(c.id),
    private.empreendimentos_ativos(c.id),
    s.situacao,
    s.somente_leitura,
    s.teste_ate,
    s.em_atraso_desde,
    s.bloqueio_em,
    cc.plano_contrato,
    cc.contrato_ate
  from public.consultoria as c
  cross join private.configuracao_comercial as cfg
  cross join lateral private.situacao_comercial_em(c.id, v_hoje) as s
  left join public.consultoria_condicao_comercial as cc on cc.consultoria_id = c.id
  left join public.assinatura as a on a.consultoria_id = c.id
  where c.id = p_consultoria_id;
end;
$$;

revoke all on function public.central_plano_da_consultoria(uuid) from public, anon;
grant execute on function public.central_plano_da_consultoria(uuid) to authenticated;

drop function public.central_resumo_financeiro();

create function public.central_resumo_financeiro()
returns table (
  pagantes integer,
  em_teste integer,
  beta integer,
  internas integer,
  em_atraso integer,
  bloqueadas integer,
  cancelados integer,
  teste_encerrado integer,
  teste_acabando integer,
  mrr_centavos bigint,
  ticket_medio_centavos bigint,
  mensais integer,
  anuais integer,
  receita_essencial_centavos bigint,
  receita_equipe_centavos bigint,
  receita_escala_centavos bigint,
  por_contrato integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_operador();
  return query
  with r as (
    select x.* from public.consultoria as c cross join lateral private.resumo_comercial(c.id) as x
  ),
  pagas as (
    select * from r where r.situacao in ('ativa', 'em_atraso', 'bloqueada')
  )
  select
    (select count(*) from r where r.situacao = 'ativa')::integer,
    (select count(*) from r where r.situacao = 'teste')::integer,
    (select count(*) from r where r.situacao = 'beta')::integer,
    (select count(*) from r where r.situacao = 'interna')::integer,
    (select count(*) from r where r.situacao in ('em_atraso', 'bloqueada'))::integer,
    (select count(*) from r where r.situacao = 'bloqueada')::integer,
    (select count(*) from r where r.situacao = 'cancelada')::integer,
    (select count(*) from r where r.situacao = 'teste_encerrado')::integer,
    (select count(*) from r where r.teste_acabando)::integer,
    coalesce((select sum(p.mensal_centavos) from pagas as p), 0)::bigint,
    coalesce((select round(avg(p.mensal_centavos)) from pagas as p), 0)::bigint,
    (select count(*) from pagas as p where p.ciclo = 'mensal')::integer,
    (select count(*) from pagas as p where p.ciclo = 'anual')::integer,
    coalesce((select sum(p.mensal_centavos) from pagas as p where p.plano = 'essencial'), 0)::bigint,
    coalesce((select sum(p.mensal_centavos) from pagas as p where p.plano = 'equipe'), 0)::bigint,
    coalesce((select sum(p.mensal_centavos) from pagas as p where p.plano = 'escala'), 0)::bigint,
    (select count(*) from r where r.situacao = 'contrato')::integer;
end;
$$;

revoke all on function public.central_resumo_financeiro() from public, anon;
grant execute on function public.central_resumo_financeiro() to authenticated;

create or replace function public.central_financeiro_lista(
  p_grupo text default null,
  p_limite integer default 50,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  nome text,
  situacao text,
  plano text,
  ciclo text,
  teste_ate date,
  em_atraso_desde date,
  mensal_centavos integer,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_operador();
  if p_grupo is not null and p_grupo not in (
    'pagantes', 'teste', 'teste_acabando', 'beta', 'internas', 'em_atraso', 'cancelados',
    'teste_encerrado', 'contrato'
  ) then
    raise exception 'grupo_invalido' using errcode = '22023';
  end if;
  return query
  select c.id, c.nome, r.situacao, r.plano, r.ciclo, r.teste_ate, r.em_atraso_desde, r.mensal_centavos,
         count(*) over ()
  from public.consultoria as c
  cross join lateral private.resumo_comercial(c.id) as r
  where p_grupo is null
     or (p_grupo = 'pagantes' and r.situacao = 'ativa')
     or (p_grupo = 'teste' and r.situacao = 'teste')
     or (p_grupo = 'teste_acabando' and r.teste_acabando)
     or (p_grupo = 'beta' and r.situacao = 'beta')
     or (p_grupo = 'internas' and r.situacao = 'interna')
     or (p_grupo = 'em_atraso' and r.situacao in ('em_atraso', 'bloqueada'))
     or (p_grupo = 'cancelados' and r.situacao = 'cancelada')
     or (p_grupo = 'teste_encerrado' and r.situacao = 'teste_encerrado')
     or (p_grupo = 'contrato' and r.situacao = 'contrato')
  order by private.normalizar_nome(c.nome), c.id
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0);
end;
$$;

-- A situação que o app calcula (packages/domain) também recebe o contrato.
drop function public.situacao_comercial(uuid);

create function public.situacao_comercial(p_consultoria_id uuid)
returns table (
  hoje date,
  criada_em date,
  fim_do_beta date,
  dias_de_teste integer,
  interna boolean,
  plano text,
  ciclo text,
  forma text,
  plano_agendado text,
  ciclo_agendado text,
  mudanca_em date,
  valida_ate date,
  proximo_vencimento date,
  vencimentos_em_aberto jsonb,
  pessoas integer,
  convites_pendentes integer,
  empreendimentos integer,
  situacao text,
  somente_leitura boolean,
  orcamentos_liberados boolean,
  teste_ate date,
  em_atraso_desde date,
  bloqueio_em date,
  cobranca_aberta_id uuid,
  cobranca_aberta_valor_centavos integer,
  cobranca_aberta_vencimento date,
  plano_contrato text,
  contrato_ate date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoje date;
  v_gestao boolean;
begin
  if not private.is_membro(p_consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  v_hoje := private.hoje_da_consultoria(p_consultoria_id);
  v_gestao := private.is_gestao(p_consultoria_id);

  return query
  select
    v_hoje,
    (c.criada_em at time zone c.fuso)::date,
    cfg.fim_do_beta,
    coalesce(cc.dias_de_teste, cfg.dias_de_teste_padrao),
    coalesce(cc.interna, false),
    a.plano,
    a.ciclo,
    a.forma,
    a.plano_agendado,
    a.ciclo_agendado,
    a.mudanca_em,
    a.valida_ate,
    a.proximo_vencimento,
    coalesce((
      select jsonb_agg(cb.vencimento order by cb.vencimento) from public.cobranca as cb
      where cb.consultoria_id = c.id and cb.situacao in ('pendente', 'vencida')
    ), '[]'::jsonb),
    private.pessoas_ativas(c.id),
    private.convites_pendentes(c.id),
    private.empreendimentos_ativos(c.id),
    s.situacao,
    s.somente_leitura,
    s.orcamentos_liberados,
    s.teste_ate,
    s.em_atraso_desde,
    s.bloqueio_em,
    case when v_gestao then ab.id end,
    case when v_gestao then ab.valor_centavos end,
    case when v_gestao then ab.vencimento end,
    cc.plano_contrato,
    cc.contrato_ate
  from public.consultoria as c
  cross join private.configuracao_comercial as cfg
  cross join lateral private.situacao_comercial_em(c.id, v_hoje) as s
  left join public.consultoria_condicao_comercial as cc on cc.consultoria_id = c.id
  left join public.assinatura as a on a.consultoria_id = c.id
  left join lateral (
    select cb.id, cb.valor_centavos, cb.vencimento
    from public.cobranca as cb
    where cb.consultoria_id = c.id and cb.situacao in ('pendente', 'vencida') and cb.vencimento <= v_hoje
    order by cb.vencimento, cb.id
    limit 1
  ) as ab on true
  where c.id = p_consultoria_id;
end;
$$;

revoke all on function public.situacao_comercial(uuid) from public, anon;
grant execute on function public.situacao_comercial(uuid) to authenticated;
