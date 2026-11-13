-- Profissão e cargo do membro (ADR-0021; listas aprovadas pelo Eduardo em 13/11/2026).
-- 1. Profissão (no que a pessoa é formada) e cargo (para o que foi contratada) ficam no membro, como
--    códigos de listas fixas do Grama, iguais às de packages/domain/src/profissao-e-cargo.ts.
-- 2. O cargo digitado antes vira membro.cargo_antigo e fica guardado para o de-para: nada é
--    convertido em silêncio.
-- 3. Muda a própria pessoa ou a Gestão da consultoria (mesma regra do cargo de antes).
-- 4. Na equipe do orçamento, a profissão de cada pessoa vem do membro quando está definida.

create domain public.profissao_do_membro as text check (value in (
    'eng_ambiental',
    'eng_sanitarista',
    'eng_ambiental_sanitarista',
    'eng_civil',
    'eng_quimico',
    'eng_florestal',
    'eng_agronomo',
    'eng_minas',
    'eng_agricola',
    'eng_pesca',
    'eng_seguranca_trabalho',
    'eng_cartografo_agrimensor',
    'geologo',
    'geografo',
    'meteorologista',
    'arquiteto_urbanista',
    'biologo',
    'quimico',
    'medico_veterinario',
    'oceanografo',
    'arqueologo',
    'sociologo',
    'antropologo',
    'economista',
    'advogado',
    'gestor_ambiental',
    'ecologo',
    'tec_meio_ambiente',
    'tec_seguranca_trabalho',
    'tec_quimica',
    'tec_agrimensura',
    'tec_agricola',
    'tec_florestal',
    'outra_nao_tecnica'));

create domain public.cargo_do_membro as text check (value in (
    'estagiario',
    'auxiliar_administrativo',
    'tecnico',
    'assistente',
    'analista_junior',
    'analista_pleno',
    'analista_senior',
    'especialista',
    'coordenador',
    'gerente',
    'diretor'));

alter table public.membro rename column cargo to cargo_antigo;
alter table public.membro rename constraint membro_cargo_valido to membro_cargo_antigo_valido;
alter table public.membro
  add column profissao public.profissao_do_membro,
  add column cargo public.cargo_do_membro;

comment on column public.membro.cargo_antigo is
  'Cargo digitado antes da lista fixa (ADR-0021). Só leitura, até o de-para revisado pelo Eduardo.';
comment on column public.membro.profissao is
  'Profissão (formação), código da lista fixa do Grama (ADR-0021).';
comment on column public.membro.cargo is
  'Cargo (para o que foi contratada), código da lista fixa do Grama (ADR-0021).';

-- Rótulo da profissão: o mesmo texto que a tela mostra (rotuloDaProfissao, no domínio).
create function private.rotulo_da_profissao(p_codigo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_codigo
    when 'eng_ambiental' then 'Engenheiro ambiental'
    when 'eng_sanitarista' then 'Engenheiro sanitarista'
    when 'eng_ambiental_sanitarista' then 'Engenheiro ambiental e sanitarista'
    when 'eng_civil' then 'Engenheiro civil'
    when 'eng_quimico' then 'Engenheiro químico'
    when 'eng_florestal' then 'Engenheiro florestal'
    when 'eng_agronomo' then 'Engenheiro agrônomo'
    when 'eng_minas' then 'Engenheiro de minas'
    when 'eng_agricola' then 'Engenheiro agrícola'
    when 'eng_pesca' then 'Engenheiro de pesca'
    when 'eng_seguranca_trabalho' then 'Engenheiro de segurança do trabalho'
    when 'eng_cartografo_agrimensor' then 'Engenheiro cartógrafo e agrimensor'
    when 'geologo' then 'Geólogo'
    when 'geografo' then 'Geógrafo'
    when 'meteorologista' then 'Meteorologista'
    when 'arquiteto_urbanista' then 'Arquiteto e urbanista'
    when 'biologo' then 'Biólogo'
    when 'quimico' then 'Químico'
    when 'medico_veterinario' then 'Médico veterinário'
    when 'oceanografo' then 'Oceanógrafo'
    when 'arqueologo' then 'Arqueólogo'
    when 'sociologo' then 'Sociólogo'
    when 'antropologo' then 'Antropólogo'
    when 'economista' then 'Economista'
    when 'advogado' then 'Advogado'
    when 'gestor_ambiental' then 'Gestor ambiental (tecnólogo)'
    when 'ecologo' then 'Ecólogo'
    when 'tec_meio_ambiente' then 'Técnico em meio ambiente'
    when 'tec_seguranca_trabalho' then 'Técnico em segurança do trabalho'
    when 'tec_quimica' then 'Técnico em química'
    when 'tec_agrimensura' then 'Técnico em agrimensura'
    when 'tec_agricola' then 'Técnico agrícola'
    when 'tec_florestal' then 'Técnico florestal'
    when 'outra_nao_tecnica' then 'Outra formação (não técnica)'
  end
$$;

revoke all on function private.rotulo_da_profissao(text) from public, anon, authenticated;

drop function public.definir_cargo(uuid, text);

-- Define profissão e cargo. A própria pessoa ou a Gestão; nulo limpa. Repetir não muda nada.
create function public.definir_profissao_e_cargo(
  p_membro_id uuid,
  p_profissao text,
  p_cargo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.membro;
  nova_profissao text := nullif(btrim(coalesce(p_profissao, '')), '');
  novo_cargo text := nullif(btrim(coalesce(p_cargo, '')), '');
begin
  select * into alvo from public.membro as m where m.id = p_membro_id for update;
  if not found
     or not (private.is_gestao(alvo.consultoria_id)
             or (alvo.usuario_id = (select auth.uid()) and private.is_membro(alvo.consultoria_id))) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if alvo.situacao <> 'ativo' then
    raise exception 'membro_desligado' using errcode = 'P0001';
  end if;
  if nova_profissao is not null and private.rotulo_da_profissao(nova_profissao) is null then
    raise exception 'profissao_invalida' using errcode = '22023';
  end if;
  begin
    perform novo_cargo::public.cargo_do_membro;
  exception when check_violation then
    raise exception 'cargo_invalido' using errcode = '22023';
  end;

  update public.membro as m
  set profissao = nova_profissao::public.profissao_do_membro,
      cargo = novo_cargo::public.cargo_do_membro
  where m.id = alvo.id
    and (m.profissao is distinct from nova_profissao or m.cargo is distinct from novo_cargo);
end;
$$;

revoke all on function public.definir_profissao_e_cargo(uuid, text, text) from public, anon;
grant execute on function public.definir_profissao_e_cargo(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Equipe do orçamento: a profissão de cada pessoa vem do membro, quando definida. A função de
-- sempre vira private.salvar_base_de_custos_completa; a pública só ajusta a equipe e a chama.
-- Sem profissão no membro, vale o texto da linha (bases antigas), como antes.
-- ---------------------------------------------------------------------------
alter function public.salvar_base_de_custos(
  uuid, bigint, bigint, numeric, integer, integer, integer, integer, bigint, bigint,
  jsonb, jsonb, bigint, bigint, jsonb, bigint)
  rename to salvar_base_de_custos_completa;
alter function public.salvar_base_de_custos_completa(
  uuid, bigint, bigint, numeric, integer, integer, integer, integer, bigint, bigint,
  jsonb, jsonb, bigint, bigint, jsonb, bigint)
  set schema private;
revoke all on function private.salvar_base_de_custos_completa(
  uuid, bigint, bigint, numeric, integer, integer, integer, integer, bigint, bigint,
  jsonb, jsonb, bigint, bigint, jsonb, bigint) from public, anon, authenticated;

create function public.salvar_base_de_custos(
  p_consultoria_id uuid,
  p_hora_tecnica_centavos bigint,
  p_custos_fixos_mensais_centavos bigint,
  p_horas_faturaveis_mes numeric,
  p_margem_desejada_pb integer,
  p_margem_minima_pb integer,
  p_tributos_pb integer,
  p_taxas_pb integer,
  p_taxa_por_cobranca_centavos bigint,
  p_taxa_por_assinatura_centavos bigint,
  p_equipe jsonb default '[]'::jsonb,
  p_custos_fixos jsonb default '[]'::jsonb,
  p_valor_visita_centavos bigint default 0,
  p_custo_km_centavos bigint default 0,
  p_horas_venda jsonb default '[]'::jsonb,
  p_piso_hora_centavos bigint default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  equipe jsonb := coalesce(p_equipe, '[]'::jsonb);
begin
  if jsonb_typeof(equipe) = 'array' then
    select coalesce(jsonb_agg(
             case when jsonb_typeof(e.valor) = 'object' and m.profissao is not null
                  then e.valor || jsonb_build_object('profissao', private.rotulo_da_profissao(m.profissao))
                  else e.valor end
             order by e.ordem), '[]'::jsonb)
      into equipe
    from jsonb_array_elements(equipe) with ordinality as e (valor, ordem)
    left join public.membro as m
      on m.consultoria_id = p_consultoria_id
     and jsonb_typeof(e.valor) = 'object'
     and m.id::text = e.valor ->> 'membro_id';
  end if;
  perform private.salvar_base_de_custos_completa(
    p_consultoria_id, p_hora_tecnica_centavos, p_custos_fixos_mensais_centavos,
    p_horas_faturaveis_mes, p_margem_desejada_pb, p_margem_minima_pb, p_tributos_pb, p_taxas_pb,
    p_taxa_por_cobranca_centavos, p_taxa_por_assinatura_centavos, equipe, p_custos_fixos,
    p_valor_visita_centavos, p_custo_km_centavos, p_horas_venda, p_piso_hora_centavos);
end;
$$;

revoke all on function public.salvar_base_de_custos(
  uuid, bigint, bigint, numeric, integer, integer, integer, integer, bigint, bigint,
  jsonb, jsonb, bigint, bigint, jsonb, bigint) from public, anon;
grant execute on function public.salvar_base_de_custos(
  uuid, bigint, bigint, numeric, integer, integer, integer, integer, bigint, bigint,
  jsonb, jsonb, bigint, bigint, jsonb, bigint) to authenticated;
