-- Extração por IA só para quem tem IA no plano (ADR-0026, ADR-0030).
-- O catálogo já diz que o Essencial não tem IA (plano_catalogo.ia = false), mas iniciar_extracao_ia
-- não consultava o plano: qualquer Gestão chamava a IA paga. Agora uma extração nova pergunta a
-- private.recurso_liberado(cid, 'ia') (teste, beta e conta interna liberam; só leitura não libera)
-- e recusa com 'ia_fora_do_plano' (42501, como 'orcamentos_fora_do_plano'), ou com
-- 'consultoria_somente_leitura' quando o motivo é o atraso. Repetir uma extração já existente (mesmo
-- id) continua só devolvendo a situação: não chama a IA. O cadastro manual segue disponível.
-- Base: a definição de 20261019165545_cria_extracao_ia.sql (a última); muda só a conferência do plano.

create or replace function public.iniciar_extracao_ia(p_id uuid, p_instrumento_id uuid)
returns table (
  nova boolean,
  situacao text,
  motivo text,
  itens_propostos integer,
  caminho text,
  mime text,
  tamanho_bytes bigint,
  tipos text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo public.instrumento;
  versao public.documento_versao;
  existente public.extracao_ia;
begin
  alvo := private.instrumento_para_editar(p_instrumento_id);

  select * into existente from public.extracao_ia as x where x.id = p_id;
  if found and existente.instrumento_id <> alvo.id then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  if not found then
    if not private.recurso_liberado(alvo.consultoria_id, 'ia') then
      if exists (
        select 1 from private.situacao_comercial_em(alvo.consultoria_id, private.hoje_da_consultoria(alvo.consultoria_id)) as s
        where s.somente_leitura
      ) then
        raise exception 'consultoria_somente_leitura' using errcode = '42501';
      end if;
      raise exception 'ia_fora_do_plano' using errcode = '42501',
        hint = 'A extração por IA não faz parte do plano desta consultoria.';
    end if;

    select v.* into versao
    from public.documento as d
    join public.documento_versao as v on v.consultoria_id = d.consultoria_id and v.id = d.versao_vigente_id
    where d.consultoria_id = alvo.consultoria_id and d.id = alvo.documento_id and d.excluido_em is null;
    if not found then
      raise exception 'pdf_obrigatorio' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.condicionante as c
      where c.instrumento_id = alvo.id and c.revisao <> 'descartada'
    ) then
      raise exception 'condicionantes_existentes' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.extracao_ia as x
      where x.instrumento_id = alvo.id and x.situacao = 'em_andamento'
        and x.iniciada_em > now() - interval '3 minutes'
    ) then
      raise exception 'extracao_em_andamento' using errcode = 'P0001';
    end if;

    insert into public.extracao_ia (id, consultoria_id, instrumento_id, documento_versao_id, solicitada_por)
    values (p_id, alvo.consultoria_id, alvo.id, versao.id, private.membro_atual(alvo.consultoria_id));
  else
    select v.* into versao from public.documento_versao as v where v.id = existente.documento_versao_id;
  end if;

  return query
  select existente.id is null, coalesce(existente.situacao, 'em_andamento'), existente.motivo,
         existente.itens_propostos, versao.caminho, versao.mime, versao.tamanho_bytes,
         coalesce((select array_agg(t.sigla order by t.sigla) from public.tipo_instrumento as t
                   where t.consultoria_id = alvo.consultoria_id), '{}');
end;
$$;
