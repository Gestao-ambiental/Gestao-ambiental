-- RPC: mover uma condicionante na árvore do passo 3 (arrastar para dentro ou para fora de um
-- agrupador). Só muda o pai: código, texto e revisão ficam como estão. Mesmas regras de acesso do
-- salvar_condicionante (Gestão, rascunho). O destino é um agrupador não descartado da mesma
-- licença, e nunca o próprio item ou algo abaixo dele (sem ciclo). Repetir não muda nada.
create function public.mover_condicionante(p_id uuid, p_pai_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cond public.condicionante;
  alvo public.instrumento;
  ancestral uuid;
  profundidade integer := 0;
begin
  select * into cond from public.condicionante as c where c.id = p_id;
  if not found then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  -- Trava o instrumento: dois movimentos ao mesmo tempo não fecham um ciclo entre si.
  alvo := private.instrumento_para_editar(cond.instrumento_id);

  if cond.pai_id is not distinct from p_pai_id then
    return;
  end if;

  if p_pai_id is not null then
    if not exists (
      select 1 from public.condicionante as c
      join public.condicionante_versao as v on v.id = c.versao_vigente_id
      where c.id = p_pai_id and c.instrumento_id = alvo.id
        and v.natureza = 'agrupador' and c.revisao <> 'descartada'
    ) then
      raise exception 'agrupador_invalido' using errcode = 'P0001';
    end if;

    ancestral := p_pai_id;
    while ancestral is not null and profundidade < 100 loop
      if ancestral = p_id then
        raise exception 'agrupador_dentro_de_si' using errcode = 'P0001';
      end if;
      select c.pai_id into ancestral from public.condicionante as c where c.id = ancestral;
      profundidade := profundidade + 1;
    end loop;
  end if;

  update public.condicionante as c set pai_id = p_pai_id where c.id = p_id;
  perform private.tocar_instrumento(alvo.id);
end;
$$;

revoke all on function public.mover_condicionante(uuid, uuid) from public, anon;
grant execute on function public.mover_condicionante(uuid, uuid) to authenticated;
