-- Custo por profissão com formação em curso (ADR-0021 §8; decisão do Eduardo em 13/11/2026).
-- Quem ainda está cursando entra no custo por profissão num grupo à parte, "Estudante de <curso>",
-- para o salário de estagiário não baixar a hora técnica dos formados. O nome do curso é o mesmo
-- de rotuloDoCurso (packages/domain/src/profissao-e-cargo.ts).

create function private.rotulo_do_curso(p_codigo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_codigo
    when 'eng_ambiental' then 'Estudante de engenharia ambiental'
    when 'eng_sanitarista' then 'Estudante de engenharia sanitária'
    when 'eng_ambiental_sanitarista' then 'Estudante de engenharia ambiental e sanitária'
    when 'eng_civil' then 'Estudante de engenharia civil'
    when 'eng_quimico' then 'Estudante de engenharia química'
    when 'eng_florestal' then 'Estudante de engenharia florestal'
    when 'eng_agronomo' then 'Estudante de agronomia'
    when 'eng_minas' then 'Estudante de engenharia de minas'
    when 'eng_agricola' then 'Estudante de engenharia agrícola'
    when 'eng_pesca' then 'Estudante de engenharia de pesca'
    when 'eng_seguranca_trabalho' then 'Estudante de engenharia de segurança do trabalho'
    when 'eng_cartografo_agrimensor' then 'Estudante de engenharia cartográfica e de agrimensura'
    when 'geologo' then 'Estudante de geologia'
    when 'geografo' then 'Estudante de geografia'
    when 'meteorologista' then 'Estudante de meteorologia'
    when 'arquiteto_urbanista' then 'Estudante de arquitetura e urbanismo'
    when 'biologo' then 'Estudante de ciências biológicas'
    when 'quimico' then 'Estudante de química'
    when 'medico_veterinario' then 'Estudante de medicina veterinária'
    when 'oceanografo' then 'Estudante de oceanografia'
    when 'arqueologo' then 'Estudante de arqueologia'
    when 'sociologo' then 'Estudante de ciências sociais'
    when 'antropologo' then 'Estudante de antropologia'
    when 'economista' then 'Estudante de ciências econômicas'
    when 'advogado' then 'Estudante de direito'
    when 'gestor_ambiental' then 'Estudante de gestão ambiental'
    when 'ecologo' then 'Estudante de ecologia'
    when 'tec_meio_ambiente' then 'Estudante de técnico em meio ambiente'
    when 'tec_seguranca_trabalho' then 'Estudante de técnico em segurança do trabalho'
    when 'tec_quimica' then 'Estudante de técnico em química'
    when 'tec_agrimensura' then 'Estudante de técnico em agrimensura'
    when 'tec_agricola' then 'Estudante de técnico agrícola'
    when 'tec_florestal' then 'Estudante de técnico florestal'
    when 'outra_nao_tecnica' then 'Estudante de outra formação (não técnica)'
  end
$$;

revoke all on function private.rotulo_do_curso(text) from public, anon, authenticated;

-- A pública ajusta a profissão da equipe pelo cadastro do membro (em curso: o curso) e chama a
-- completa. Mesma assinatura e mesmos grants da migration 20261113183000.
create or replace function public.salvar_base_de_custos(
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
  p_piso_hora_centavos bigint default 0,
  p_deslocamento_modo text default null,
  p_consumo_km_por_litro numeric default null,
  p_preco_combustivel_centavos bigint default null,
  p_acrescimo_km_centavos bigint default null
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
                  then e.valor || jsonb_build_object('profissao',
                         case when m.profissao_em_curso then private.rotulo_do_curso(m.profissao)
                              else private.rotulo_da_profissao(m.profissao) end)
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
    p_valor_visita_centavos, p_custo_km_centavos, p_horas_venda, p_piso_hora_centavos,
    p_deslocamento_modo, p_consumo_km_por_litro, p_preco_combustivel_centavos, p_acrescimo_km_centavos);
end;
$$;

