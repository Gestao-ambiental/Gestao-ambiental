-- Rascunhos extraídos antes da correção de 20261105052506: o subitem que a IA mandou antes do seu
-- agrupador ficou sem pai. Religa usando a própria resposta guardada da extração (pai_codigo),
-- sem deduzir nada do código. Só rascunho, só item ainda solto, só pai que é agrupador da mesma
-- extração, e sem fechar ciclo. Repetir não muda nada.
do $$
declare
  r record;
  ancestral uuid;
  profundidade integer;
begin
  for r in
    select c.id as filho_id, p.id as pai_id
    from public.extracao_ia as x
    join public.instrumento as i on i.id = x.instrumento_id and i.situacao = 'rascunho'
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(x.resultado -> 'condicionantes') = 'array'
           then x.resultado -> 'condicionantes' else '[]'::jsonb end
    ) as e (valor)
    join public.condicionante as c
      on c.extracao_id = x.id and c.pai_id is null
     and c.codigo = btrim(coalesce(e.valor ->> 'codigo', ''))
    join public.condicionante as p
      on p.extracao_id = x.id and p.id <> c.id
     and p.codigo = btrim(coalesce(e.valor ->> 'pai_codigo', ''))
    join public.condicionante_versao as v on v.id = p.versao_vigente_id and v.natureza = 'agrupador'
    where x.situacao = 'concluida'
      and btrim(coalesce(e.valor ->> 'codigo', '')) <> ''
      and btrim(coalesce(e.valor ->> 'pai_codigo', '')) <> ''
  loop
    ancestral := r.pai_id;
    profundidade := 0;
    while ancestral is not null and ancestral <> r.filho_id and profundidade < 50 loop
      select c.pai_id into ancestral from public.condicionante as c where c.id = ancestral;
      profundidade := profundidade + 1;
    end loop;
    continue when ancestral = r.filho_id;
    update public.condicionante as c set pai_id = r.pai_id where c.id = r.filho_id and c.pai_id is null;
  end loop;
end;
$$;
