-- Dados para o relatório gerado a partir de um modelo (ADR-0036, fatia 2).
-- Uma leitura só, com o que os campos do modelo usam: consultoria, quem gera, hoje (no fuso da
-- consultoria), empreendimento, unidade, licença e condicionante. A formatação (dd/mm/aaaa, máscara
-- do CNPJ) fica em packages/domain (valoresDoRelatorio). A Edge Function da conferência por IA
-- (fatia 3) usa a mesma leitura para comparar o relatório com o cadastro.
--
-- Sem a ocorrência: licença e unidade só entram quando o empreendimento tem uma só (licença ativa e
-- unidade); com mais de uma, o campo sai em branco e a pessoa completa no Word.
-- security invoker: a RLS de cada tabela decide o que a pessoa lê. Outra consultoria recebe
-- 'sem_permissao', igual a um id que não existe.

create function public.dados_para_relatorio(p_empreendimento_id uuid, p_ocorrencia_id uuid default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  emp public.empreendimento%rowtype;
  v_instrumento uuid;
  v_unidade uuid;
  condicionante jsonb;
begin
  select * into emp from public.empreendimento as e where e.id = p_empreendimento_id;
  if not found then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  if p_ocorrencia_id is not null then
    select o.instrumento_id,
           jsonb_build_object(
             'codigo', c.codigo,
             'titulo', v.titulo,
             'texto', v.texto_literal,
             'prazo', o.prazo_oficial_atual,
             'responsavel', r.nome)
    into v_instrumento, condicionante
    from public.ocorrencia as o
    join public.instrumento as i on i.consultoria_id = o.consultoria_id and i.id = o.instrumento_id
    join public.condicionante_versao as v
      on v.consultoria_id = o.consultoria_id and v.id = o.condicionante_versao_id
    join public.condicionante as c on c.consultoria_id = v.consultoria_id and c.id = v.condicionante_id
    left join public.membro as r on r.consultoria_id = o.consultoria_id and r.id = o.responsavel_id
    where o.id = p_ocorrencia_id and i.empreendimento_id = emp.id;
    if not found then
      raise exception 'sem_permissao' using errcode = '42501';
    end if;
  else
    select min(i.id::text)::uuid into v_instrumento
    from public.instrumento as i
    where i.consultoria_id = emp.consultoria_id and i.empreendimento_id = emp.id and i.situacao = 'ativo'
    having count(*) = 1;
  end if;

  if v_instrumento is not null then
    select i.unidade_id into v_unidade from public.instrumento as i where i.id = v_instrumento;
  else
    select min(u.id::text)::uuid into v_unidade
    from public.unidade as u
    where u.consultoria_id = emp.consultoria_id and u.empreendimento_id = emp.id
    having count(*) = 1;
  end if;

  return jsonb_build_object(
    'consultoria', (select co.nome from public.consultoria as co where co.id = emp.consultoria_id),
    'autor', (select m.nome from public.membro as m
              where m.id = private.membro_atual(emp.consultoria_id)),
    'hoje', private.hoje_da_consultoria(emp.consultoria_id),
    'empreendimento', jsonb_build_object(
      'nome', emp.nome,
      'cliente', (select cl.nome from public.cliente as cl
                  where cl.consultoria_id = emp.consultoria_id and cl.id = emp.cliente_id),
      'cnpj', emp.cnpj,
      'unidade', (select u.nome from public.unidade as u where u.id = v_unidade),
      'endereco', (select u.endereco from public.unidade as u where u.id = v_unidade)),
    'licenca', (
      select jsonb_build_object(
        'tipo', t.sigla, 'numero', i.numero, 'orgao', i.orgao, 'emissao', i.emitido_em,
        'validade', i.validade)
      from public.instrumento as i
      left join public.tipo_instrumento as t on t.consultoria_id = i.consultoria_id and t.id = i.tipo_id
      where i.id = v_instrumento),
    'condicionante', condicionante
  );
end;
$$;

revoke all on function public.dados_para_relatorio(uuid, uuid) from public, anon;
grant execute on function public.dados_para_relatorio(uuid, uuid) to authenticated;
