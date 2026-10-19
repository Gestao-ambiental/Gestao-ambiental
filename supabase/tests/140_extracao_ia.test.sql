-- Extração por IA (IA-01 a IA-04): só a Gestão inicia, num rascunho com PDF e sem condicionantes;
-- só a service role (Edge Function) conclui ou registra falha; a proposta preenche só campos vazios
-- e entra como condicionantes pendentes; aceitar registra se foi sem edição; nada vaza entre
-- consultorias.
begin;

select plan(23);

select testes.criar_dados_sinteticos();

insert into public.empreendimento (id, consultoria_id, nome, criado_por)
values ('e0000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-00000000000a',
        'Metalúrgica Rio Cubatão', 'd0000000-0000-4000-8000-0000000000a1');
insert into public.unidade (id, consultoria_id, empreendimento_id, nome)
values ('f0000000-0000-4000-8000-0000000000f1', 'c0000000-0000-4000-8000-00000000000a',
        'e0000000-0000-4000-8000-0000000000e1', 'Matriz');

-- Três rascunhos: 1 e 3 com PDF, 2 sem PDF.
select testes.autenticar_como('eduardo@filtroville.test');
select public.criar_instrumento(('10000000-0000-4000-8000-00000000000' || n::text)::uuid,
  'f0000000-0000-4000-8000-0000000000f1')
from generate_series(1, 3) as n;
reset role;

insert into public.documento (id, consultoria_id, entidade)
select ('20000000-0000-4000-8000-00000000000' || n::text)::uuid, 'c0000000-0000-4000-8000-00000000000a', 'instrumento'
from (values (1), (3)) as x (n);
insert into public.documento_versao (id, consultoria_id, documento_id, numero, caminho, nome_original, mime,
                                     tamanho_bytes, sha256, autor_id)
select ('21000000-0000-4000-8000-00000000000' || n::text)::uuid, 'c0000000-0000-4000-8000-00000000000a',
       ('20000000-0000-4000-8000-00000000000' || n::text)::uuid, 1,
       'c0000000-0000-4000-8000-00000000000a/instrumento/21000000-0000-4000-8000-00000000000' || n::text || '.pdf',
       'LAO.pdf', 'application/pdf', 1258291, repeat('a', 64), 'd0000000-0000-4000-8000-0000000000a1'
from (values (1), (3)) as x (n);
update public.documento set versao_vigente_id = ('21000000-0000-4000-8000-00000000000' || right(id::text, 1))::uuid
where id in ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003');
update public.instrumento set documento_id = ('20000000-0000-4000-8000-00000000000' || right(id::text, 1))::uuid
where id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003');
-- Órgão já digitado à mão no rascunho 1: a IA não sobrescreve.
update public.instrumento set orgao = 'IMA (digitado)' where id = '10000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Iniciar
-- ---------------------------------------------------------------------------
select testes.autenticar_como('bruno@filtroville.test');

select throws_ok(
  $$select * from public.iniciar_extracao_ia('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001')$$,
  '42501', 'sem_permissao',
  'Equipe não inicia extração'
);

select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select * from public.iniciar_extracao_ia('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002')$$,
  'P0001', 'pdf_obrigatorio',
  'rascunho sem PDF não é extraído'
);

select results_eq(
  $$select nova, situacao, caminho, mime, tamanho_bytes, 'LAO' = any (tipos)
    from public.iniciar_extracao_ia('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001')$$,
  $$values (true, 'em_andamento', 'c0000000-0000-4000-8000-00000000000a/instrumento/21000000-0000-4000-8000-000000000001.pdf',
            'application/pdf', 1258291::bigint, true)$$,
  'Gestão inicia e recebe o caminho do PDF e os tipos da consultoria'
);

select results_eq(
  $$select nova, situacao
    from public.iniciar_extracao_ia('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001')$$,
  $$values (false, 'em_andamento')$$,
  'repetir o início (retry) devolve a mesma extração, marcada como não nova: a IA não é chamada de novo'
);

select throws_ok(
  $$select * from public.iniciar_extracao_ia('30000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000001')$$,
  'P0001', 'extracao_em_andamento',
  'não começa outra extração enquanto uma está em andamento'
);

select throws_ok(
  $$select public.concluir_extracao_ia('30000000-0000-4000-8000-000000000001', '{"identificacao": {}, "condicionantes": []}',
      'x', 'v1', 1, 1, 1, 1, 1)$$,
  '42501', null,
  'o navegador (authenticated) não conclui extração: custo e tokens não são forjáveis'
);

select throws_ok(
  $$select public.falhar_extracao_ia('30000000-0000-4000-8000-000000000001', 'erro_interno', null, null, null, null,
      null, null, null, null)$$,
  '42501', null,
  'o navegador (authenticated) não registra falha'
);

-- ---------------------------------------------------------------------------
-- Concluir (service role)
-- ---------------------------------------------------------------------------
reset role;
set local role service_role;

select throws_ok(
  $$select public.concluir_extracao_ia('30000000-0000-4000-8000-000000000001', '{"identificacao": {}, "condicionantes": {}}',
      'x', 'v1', 1, 1, 1, 1, 1)$$,
  '22023', 'resposta_invalida',
  'resposta fora do formato é recusada'
);

select throws_ok(
  format($$select public.concluir_extracao_ia('30000000-0000-4000-8000-000000000001', %L, 'x', 'v1', 1, 1, 1, 1, 1)$$,
    jsonb_build_object('identificacao', '{}'::jsonb, 'condicionantes',
      (select jsonb_agg(jsonb_build_object('codigo', n::text, 'titulo', 'Item', 'texto_literal', '', 'natureza', 'obrigacao'))
       from generate_series(1, 301) as n))),
  '22023', 'resposta_invalida',
  'mais de 300 itens é recusado'
);

select set_config('testes.proposta', $json${
  "identificacao": {
    "tipo": {"valor": "lao", "pagina": 1},
    "numero": {"valor": "4821/2023", "pagina": 1},
    "orgao": {"valor": "Instituto do Meio Ambiente", "pagina": 1},
    "emitido_em": {"valor": "2023-02-30", "texto": "30 de fevereiro", "pagina": 1},
    "assinado_em": {"valor": "2023-02-14", "texto": "14 de fevereiro de 2023", "pagina": 1},
    "publicado_em": {"valor": null, "pagina": null},
    "recebido_em": {"valor": null, "pagina": null},
    "validade": {"valor": "2027-02-15", "texto": "válida até 15 de fevereiro de 2027", "pagina": 1}
  },
  "condicionantes": [
    {"codigo": "1", "pai_codigo": null, "titulo": "Disposições gerais", "texto_literal": "1 DISPOSIÇÕES GERAIS",
     "natureza": "agrupador", "pagina": 2, "periodicidade": null},
    {"codigo": "1.1", "pai_codigo": "1", "titulo": "Manter cópia da licença", "texto_literal": "Manter cópia desta licença no local.",
     "natureza": "condicao_continua", "pagina": 2, "periodicidade": null},
    {"codigo": "4.3", "pai_codigo": "4", "titulo": "", "texto_literal": "Realizar, semestralmente, análise do corpo receptor.",
     "natureza": "obrigacao", "pagina": 4, "periodicidade": "semestral"}
  ]
}$json$, true);

select is(
  public.concluir_extracao_ia('30000000-0000-4000-8000-000000000001', current_setting('testes.proposta')::jsonb,
    'openai/gpt-4.1-mini', 'licenca-v1', 18000, 2400, 12345, 12, 41000),
  3,
  'a Edge Function grava a proposta: 3 condicionantes'
);

select is(
  public.concluir_extracao_ia('30000000-0000-4000-8000-000000000001', current_setting('testes.proposta')::jsonb,
    'openai/gpt-4.1-mini', 'licenca-v1', 18000, 2400, 12345, 12, 41000),
  3,
  'repetir a conclusão (retry) não duplica'
);

reset role;

select results_eq(
  $$select t.sigla, i.numero, i.orgao, i.emitido_em, i.assinado_em, i.assinado_em_texto, i.validade, i.validade_texto
    from public.instrumento as i join public.tipo_instrumento as t on t.id = i.tipo_id
    where i.id = '10000000-0000-4000-8000-000000000001'$$,
  $$values ('LAO', '4821/2023', 'IMA (digitado)', null::date, '2023-02-14'::date, '14 de fevereiro de 2023',
            '2027-02-15'::date, 'válida até 15 de fevereiro de 2027')$$,
  'identificação: preenche só o vazio, guarda o texto original e ignora data inexistente'
);

select results_eq(
  $$select c.codigo, p.codigo, c.revisao::text, c.origem, c.fonte_pagina, v.titulo, v.natureza::text,
           c.proposta_ia ->> 'periodicidade'
    from public.condicionante as c
    join public.condicionante_versao as v on v.id = c.versao_vigente_id
    left join public.condicionante as p on p.id = c.pai_id
    where c.instrumento_id = '10000000-0000-4000-8000-000000000001' order by c.posicao$$,
  $$values ('1', null::text, 'pendente', 'ia', 2, 'Disposições gerais', 'agrupador', null::text),
           ('1.1', '1', 'pendente', 'ia', 2, 'Manter cópia da licença', 'condicao_continua', null),
           ('4.3', null, 'pendente', 'ia', 4, 'Realizar, semestralmente, análise do corpo receptor.', 'obrigacao', 'semestral')$$,
  'condicionantes entram pendentes, com fonte, hierarquia só sob agrupador e título do texto quando falta'
);

select results_eq(
  $$select situacao, modelo, versao_prompt, tokens_entrada, tokens_saida, custo_micros, moeda, paginas,
           itens_propostos, duracao_ms, solicitada_por
    from public.extracao_ia where id = '30000000-0000-4000-8000-000000000001'$$,
  $$values ('concluida', 'openai/gpt-4.1-mini', 'licenca-v1', 18000, 2400, 12345::bigint, 'USD', 12, 3, 41000,
            'd0000000-0000-4000-8000-0000000000a1'::uuid)$$,
  'a extração registra modelo, prompt, tokens, custo, páginas e duração'
);

select ok(
  exists (select 1 from public.auditoria where entidade = 'extracao_ia'
          and entidade_id = '30000000-0000-4000-8000-000000000001' and not (depois ? 'resultado')),
  'a extração vai para a auditoria, sem o resultado completo'
);

-- ---------------------------------------------------------------------------
-- Revisão: aceito sem edição × editado
-- ---------------------------------------------------------------------------
select testes.autenticar_como('eduardo@filtroville.test');

select throws_ok(
  $$select * from public.iniciar_extracao_ia('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001')$$,
  'P0001', 'condicionantes_existentes',
  'rascunho que já tem condicionantes não é extraído de novo'
);

select public.revisar_condicionante(id, 'aceita')
from public.condicionante where instrumento_id = '10000000-0000-4000-8000-000000000001' and codigo = '1.1';
select public.salvar_condicionante(c.id, c.instrumento_id, null, '4.3', 'Análise semestral do corpo receptor',
  'Realizar, semestralmente, análise do corpo receptor.', 'obrigacao')
from public.condicionante as c where c.instrumento_id = '10000000-0000-4000-8000-000000000001' and c.codigo = '4.3';
select public.revisar_condicionante(id, 'aceita')
from public.condicionante where instrumento_id = '10000000-0000-4000-8000-000000000001' and codigo = '4.3';
select public.revisar_condicionante(id, 'descartada')
from public.condicionante where instrumento_id = '10000000-0000-4000-8000-000000000001' and codigo = '1';

select results_eq(
  $$select codigo, revisao::text, aceita_sem_edicao from public.condicionante
    where instrumento_id = '10000000-0000-4000-8000-000000000001' order by posicao$$,
  $$values ('1', 'descartada', null::boolean), ('1.1', 'aceita', true), ('4.3', 'aceita', false)$$,
  'aceitar registra se o item da IA foi aceito sem edição (base da métrica)'
);

-- ---------------------------------------------------------------------------
-- Falha: não toca o rascunho
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select * from public.iniciar_extracao_ia('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003')$$,
  'Gestão inicia a extração do rascunho 3'
);

reset role;
set local role service_role;
select public.falhar_extracao_ia('30000000-0000-4000-8000-000000000003', 'provedor_recusou', 'openai/gpt-4.1-mini',
  'licenca-v1', null, null, null, 12, 900, '  HTTP 401: No auth credentials found  ');
reset role;

select results_eq(
  $$select x.situacao, x.motivo, x.detalhe, i.numero is null, i.row_version
    from public.extracao_ia as x join public.instrumento as i on i.id = x.instrumento_id
    where x.id = '30000000-0000-4000-8000-000000000003'$$,
  $$values ('falhou', 'provedor_recusou', 'HTTP 401: No auth credentials found', true, 1)$$,
  'a recusa do provedor fica registrada com o detalhe, e o rascunho continua intacto'
);

select throws_ok(
  $$select public.concluir_extracao_ia('30000000-0000-4000-8000-000000000003', '{"identificacao": {}, "condicionantes": []}',
      'x', 'v1', 1, 1, 1, 1, 1)$$,
  'P0001', 'extracao_encerrada',
  'extração que falhou não é concluída depois'
);

select testes.autenticar_como('eduardo@filtroville.test');

select lives_ok(
  $$select * from public.iniciar_extracao_ia('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003')$$,
  'depois da falha dá para tentar de novo'
);

-- ---------------------------------------------------------------------------
-- Isolamento
-- ---------------------------------------------------------------------------
select testes.autenticar_como('helena@verdesul.test');

select is(
  (select count(*) from public.extracao_ia),
  0::bigint,
  'Helena (B) recebe zero extrações de A'
);

select testes.autenticar_como('gustavo@verdesul.test');

select throws_ok(
  $$select * from public.iniciar_extracao_ia('30000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002')$$,
  '42501', 'sem_permissao',
  'Gestão de B não inicia extração em rascunho de A'
);

select * from finish();
rollback;
