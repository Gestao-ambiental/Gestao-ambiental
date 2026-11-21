-- P6 · Relatório mensal ao cliente (ADR-0052). Uma leitura só, para o modelo "Resumo para o
-- cliente": licenças e validades, entregas do mês, protocolos e respostas a exigências do mês e os
-- próximos 90 dias. Só a Gestão gera. Nada de notas, horas, custo nem nomes da equipe: o documento
-- sai para o cliente. Sem link nem login de cliente (fica para a v2).
--
-- O texto do relatório diz "Licenças e validades", nunca "em dia": o Grama não afirma regularidade.
-- As datas são civis (DATE); a conclusão de uma entrega (TIMESTAMPTZ) vira data no fuso da
-- consultoria. A formatação (dd/mm/aaaa) fica em packages/domain (valoresDoRelatorioMensal).

-- Respostas a exigências do órgão no mês. Vazia aqui: a camada de exigências (P3) redefine esta
-- função ao ser juntada (mesmo retorno), como as fontes de private.linhas_de_prazo.
create function private.relatorio_exigencias_do_mes(cid uuid, emp uuid, de date, ate date)
returns table (data date, titulo text, detalhe text)
language sql
stable
set search_path = ''
as $$
  select null::date, null::text, null::text
  where false and cid is not null and emp is not null and de is not null and ate is not null
$$;

comment on function private.relatorio_exigencias_do_mes(uuid, uuid, date, date) is
  'Respostas a exigências no mês, para o relatório ao cliente (P6). Vazia até juntar o P3.';

revoke all on function private.relatorio_exigencias_do_mes(uuid, uuid, date, date) from public, anon;
grant execute on function private.relatorio_exigencias_do_mes(uuid, uuid, date, date) to authenticated;

create function public.dados_para_relatorio_mensal(p_empreendimento_id uuid, p_mes date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  emp public.empreendimento%rowtype;
  fuso text;
  hoje date;
  de date;
  ate date;
begin
  select * into emp from public.empreendimento as e where e.id = p_empreendimento_id;
  if not found or not private.is_gestao(emp.consultoria_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_mes is null then
    raise exception 'mes_invalido' using errcode = '22023';
  end if;

  select c.fuso into fuso from public.consultoria as c where c.id = emp.consultoria_id;
  hoje := private.hoje_da_consultoria(emp.consultoria_id);
  de := date_trunc('month', p_mes)::date;
  ate := (de + interval '1 month' - interval '1 day')::date;

  return jsonb_build_object(
    'consultoria', (select co.nome from public.consultoria as co where co.id = emp.consultoria_id),
    'autor', (select m.nome from public.membro as m
              where m.id = private.membro_atual(emp.consultoria_id)),
    'hoje', hoje,
    'mes', de,
    'empreendimento', jsonb_build_object(
      'nome', emp.nome,
      'cliente', (select cl.nome from public.cliente as cl
                  where cl.consultoria_id = emp.consultoria_id and cl.id = emp.cliente_id),
      'cnpj', emp.cnpj),
    -- Licenças ativas e outros vencimentos com validade (P4 preenche a fonte 'vencimento').
    'licencas', coalesce((
      select jsonb_agg(jsonb_build_object('titulo', x.titulo, 'orgao', x.orgao, 'validade', x.validade)
                       order by x.validade nulls last, x.titulo)
      from (
        select concat_ws(' ', coalesce(t.sigla, 'Licença'), nullif(btrim(i.numero), '')) as titulo,
               i.orgao, i.validade
        from public.instrumento as i
        left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
        where i.consultoria_id = emp.consultoria_id and i.empreendimento_id = emp.id and i.situacao = 'ativo'
        union all
        select l.titulo, null, l.prazo
        from private.linhas_de_prazo(emp.consultoria_id) as l
        where l.tipo_linha = 'vencimento' and l.empreendimento_id = emp.id
      ) as x), '[]'::jsonb),
    -- Entregas concluídas no mês: código e título da condicionante, licença e a data. Sem nota,
    -- responsável, horas nem custo.
    'entregas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'codigo', c.codigo, 'titulo', v.titulo,
               'licenca', concat_ws(' ', coalesce(t.sigla, 'Licença'), nullif(btrim(i.numero), '')),
               'data', (o.concluida_em at time zone fuso)::date)
             order by o.concluida_em, c.codigo)
      from public.ocorrencia as o
      join public.instrumento as i on i.consultoria_id = o.consultoria_id and i.id = o.instrumento_id
      join public.condicionante_versao as v
        on v.consultoria_id = o.consultoria_id and v.id = o.condicionante_versao_id
      join public.condicionante as c on c.consultoria_id = v.consultoria_id and c.id = v.condicionante_id
      left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
      where o.consultoria_id = emp.consultoria_id and i.empreendimento_id = emp.id
        and o.situacao = 'concluida'
        and (o.concluida_em at time zone fuso)::date between de and ate), '[]'::jsonb),
    -- Protocolos de renovação e respostas a exigências no mês.
    'protocolos', coalesce((
      select jsonb_agg(jsonb_build_object('data', x.data, 'titulo', x.titulo, 'detalhe', x.detalhe)
                       order by x.data, x.titulo)
      from (
        select p.protocolado_em as data,
               'Protocolo de renovação: ' || concat_ws(' ', coalesce(t.sigla, 'Licença'),
                                                        nullif(btrim(i.numero), '')) as titulo,
               nullif(btrim(p.protocolo_numero), '') as detalhe
        from public.plano_renovacao as p
        join public.instrumento as i on i.consultoria_id = p.consultoria_id and i.id = p.instrumento_id
        left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
        where p.consultoria_id = emp.consultoria_id and i.empreendimento_id = emp.id
          and p.protocolado_em between de and ate
        union all
        select r.data, r.titulo, r.detalhe
        from private.relatorio_exigencias_do_mes(emp.consultoria_id, emp.id, de, ate) as r
      ) as x), '[]'::jsonb),
    -- Próximos 90 dias, a partir de hoje: o que vem pela frente, sem responsável.
    'proximos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'data', l.prazo, 'tipo', l.tipo_linha, 'codigo', l.codigo, 'titulo', l.titulo,
               'licenca', l.licenca)
             order by l.prazo, l.codigo, l.titulo)
      from private.linhas_de_prazo(emp.consultoria_id) as l
      where l.empreendimento_id = emp.id and l.prazo between hoje and hoje + 90), '[]'::jsonb)
  );
end;
$$;

comment on function public.dados_para_relatorio_mensal(uuid, date) is
  'Relatório mensal ao cliente (P6, ADR-0052): licenças e validades, entregas, protocolos e próximos 90 dias. Só a Gestão.';

revoke all on function public.dados_para_relatorio_mensal(uuid, date) from public, anon;
grant execute on function public.dados_para_relatorio_mensal(uuid, date) to authenticated;
