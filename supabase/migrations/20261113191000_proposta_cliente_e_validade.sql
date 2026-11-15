-- Proposta: cliente contratante, CNPJ e unidade do empreendimento (Protótipo 21, card 86e3phvav).
-- Leitura nova e separada de obter_orcamento: a proposta mostra quem contrata e onde, sem mudar
-- a projeção do editor. Sem tabela nem coluna nova. A validade com data é calculada no domínio
-- (packages/domain/src/validade-da-proposta.ts) a partir do histórico orcamento_situacao, que
-- obter_orcamento já devolve.
--
-- security invoker: a RLS de orcamento (só a Gestão da consultoria) decide quem lê. Equipe e outra
-- consultoria recebem nulo. Orçamento de prospecto (sem empreendimento) também devolve nulo: os
-- dados do prospecto já vêm em obter_orcamento.

create function public.obter_contratante_da_proposta(p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'empreendimento_nome', e.nome,
    'empreendimento_cnpj', e.cnpj,
    'cliente_nome', c.nome,
    -- Unidades do empreendimento, pelo nome. O orçamento não aponta uma unidade: a tela decide
    -- o que mostrar (hoje, só quando há uma única).
    'unidades', coalesce((
      select jsonb_agg(jsonb_build_object('nome', u.nome, 'endereco', u.endereco)
                       order by u.nome, u.id)
      from public.unidade as u
      where u.consultoria_id = e.consultoria_id and u.empreendimento_id = e.id), '[]'::jsonb))
  from public.orcamento as o
  join public.empreendimento as e
    on e.consultoria_id = o.consultoria_id and e.id = o.empreendimento_id
  left join public.cliente as c
    on c.consultoria_id = e.consultoria_id and c.id = e.cliente_id
  where o.id = p_id
$$;

comment on function public.obter_contratante_da_proposta(uuid) is
  'Cliente contratante, CNPJ e unidades do empreendimento do orçamento, para a proposta. Só a Gestão (RLS de orcamento).';

revoke all on function public.obter_contratante_da_proposta(uuid) from public, anon;
grant execute on function public.obter_contratante_da_proposta(uuid) to authenticated;
