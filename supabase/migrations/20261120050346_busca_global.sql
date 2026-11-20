-- Busca global do Grama (Ctrl+K, layout Grama Fluent): um campo só para achar empreendimento,
-- licença, condicionante e orçamento pelo nome, número ou código, sem acento e sem caixa.
-- Só leitura e security invoker: a RLS de cada tabela decide o que volta (a Equipe não lê
-- orçamento; outra consultoria não lê nada). A consultoria do parâmetro é filtro de tela.
-- No máximo 5 por tipo (20 no total), para um tipo não esconder os outros.
-- referencia_id monta a rota: empreendimento → ele mesmo; licença e condicionante → o
-- empreendimento (a licença ativa não tem página própria); orçamento → ele mesmo.
-- Respeita o que cada lista já filtra: condicionante só aceita (sem proposta pendente da IA nem
-- descartada) e orçamento fora da lixeira.

create function public.buscar_no_grama(p_consultoria_id uuid, p_termo text)
returns table (tipo text, id uuid, titulo text, detalhe text, referencia_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  with busca as (
    select
      private.normalizar_nome(left(p_termo, 100)) as termo,
      private.padrao_de_busca(left(p_termo, 100)) as padrao,
      private.normalizar_cnpj(left(p_termo, 100)) as documento
    where length(private.normalizar_nome(left(p_termo, 100))) >= 2
  ),
  empreendimentos as (
    select
      e.id,
      e.nome as titulo,
      cl.nome as detalhe,
      e.id as referencia_id,
      row_number() over (
        order by starts_with(e.nome_normalizado, b.termo) desc, e.nome_normalizado, e.id
      ) as posicao
    from busca as b
    join public.empreendimento as e on e.consultoria_id = p_consultoria_id
    left join public.cliente as cl on cl.consultoria_id = e.consultoria_id and cl.id = e.cliente_id
    where e.nome_normalizado like b.padrao
       or cl.nome_normalizado like b.padrao
       or (b.termo ~ '[0-9]' and strpos(coalesce(e.cnpj, ''), b.documento) > 0)
  ),
  licencas as (
    select
      i.id,
      coalesce(t.sigla, 'Licença') || ' ' || coalesce(nullif(btrim(i.numero), ''), 'sem número') as titulo,
      e.nome as detalhe,
      i.empreendimento_id as referencia_id,
      row_number() over (
        order by starts_with(private.normalizar_nome(i.numero), b.termo) desc, i.criado_em desc, i.id
      ) as posicao
    from busca as b
    join public.instrumento as i on i.consultoria_id = p_consultoria_id
    join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
    left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
    where private.normalizar_nome(concat_ws(' ', t.sigla, i.numero, t.nome)) like b.padrao
  ),
  condicionantes as (
    select
      c.id,
      v.titulo,
      concat_ws(' · ',
        'Condicionante ' || c.codigo,
        coalesce(t.sigla, 'Licença') || ' ' || coalesce(nullif(btrim(i.numero), ''), 'sem número'),
        e.nome) as detalhe,
      i.empreendimento_id as referencia_id,
      row_number() over (
        order by starts_with(private.normalizar_nome(v.titulo), b.termo) desc, i.criado_em desc,
                 c.posicao, c.id
      ) as posicao
    from busca as b
    join public.condicionante as c on c.consultoria_id = p_consultoria_id and c.revisao = 'aceita'
    join public.condicionante_versao as v
      on v.consultoria_id = c.consultoria_id and v.id = c.versao_vigente_id
    join public.instrumento as i on i.consultoria_id = c.consultoria_id and i.id = c.instrumento_id
    join public.empreendimento as e on e.consultoria_id = i.consultoria_id and e.id = i.empreendimento_id
    left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
    where private.normalizar_nome(c.codigo || ' ' || v.titulo) like b.padrao
  ),
  orcamentos as (
    select
      o.id,
      o.objeto as titulo,
      concat_ws(' · ',
        upper(private.numero_do_orcamento(o.ano, o.sequencia)),
        coalesce(e.nome, o.prospecto_nome)) as detalhe,
      o.id as referencia_id,
      row_number() over (order by o.atualizado_em desc, o.id) as posicao
    from busca as b
    join public.orcamento as o on o.consultoria_id = p_consultoria_id and o.excluido_em is null
    left join public.empreendimento as e
      on e.consultoria_id = o.consultoria_id and e.id = o.empreendimento_id
    where private.orcamento_atende_busca(o, e.nome_normalizado, p_termo)
  )
  select r.tipo, r.id, r.titulo, r.detalhe, r.referencia_id
  from (
    select 1 as grupo, 'empreendimento'::text as tipo, x.* from empreendimentos as x where x.posicao <= 5
    union all
    select 2, 'licenca', x.* from licencas as x where x.posicao <= 5
    union all
    select 3, 'condicionante', x.* from condicionantes as x where x.posicao <= 5
    union all
    select 4, 'orcamento', x.* from orcamentos as x where x.posicao <= 5
  ) as r
  order by r.grupo, r.posicao
  limit 20
$$;

comment on function public.buscar_no_grama(uuid, text) is
  'Busca global (Ctrl+K): até 5 por tipo, sem acento e sem caixa. Termo com menos de 2 caracteres não busca. A RLS decide o que volta.';

revoke all on function public.buscar_no_grama(uuid, text) from public, anon;
grant execute on function public.buscar_no_grama(uuid, text) to authenticated;
