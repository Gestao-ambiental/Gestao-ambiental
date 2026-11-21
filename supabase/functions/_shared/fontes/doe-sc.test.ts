import assert from 'node:assert/strict'

import { MARCADOR_DE_CPF } from '../dominio/sem-cpf.ts'
import {
  CATEGORIAS_DO_DOE,
  chaveEstadualDoAlvo,
  coletarDoeSc,
  corpoDaBusca,
  lerBuscaDoDoe,
  lerEdicoesDoDoe,
  lerMateriaDoDoe,
  orgaoDoAto,
  TERMOS_DA_BUSCA_NO_DOE,
  URL_DA_BUSCA_NO_DOE,
  urlDaPreviaDaMateria,
  urlDasEdicoesDoDia,
  urlOficialDaMateria,
} from './doe-sc.ts'
import { contextoDeDiario, respostaJson } from './fixtures/diarios.ts'
import { EDICOES_DO_DOE, NA_BUSCA, PREVIAS, respostaDaBusca } from './fixtures/doe-sc.ts'
import { BancoFalso, type ChamadaDeRede, type Rota } from './fixtures/falsos.ts'

const DIA = '2026-11-18'
const [IMA, SEMAE, JUCESC, EXECUTIVO] = CATEGORIAS_DO_DOE.map((c) => c.codigo)

/** Matérias por categoria e termo; o resto da busca volta vazio. */
const BUSCAS: Record<string, unknown[]> = {
  [`${String(SEMAE)}|Portaria`]: [NA_BUSCA.portariaSemae],
  // A mesma matéria volta em outro termo: não é baixada duas vezes.
  [`${String(SEMAE)}|licenciamento`]: [NA_BUSCA.portariaSemae],
  [`${String(IMA)}|CONSEMA`]: [NA_BUSCA.editalDoIma, NA_BUSCA.antiga],
  [`${String(IMA)}|Portaria`]: [NA_BUSCA.portariaDoIma],
  [`${String(JUCESC)}|CGSIM`]: [NA_BUSCA.resolucaoCgsim],
  [`${String(EXECUTIVO)}|14.675`]: [NA_BUSCA.lei],
}

const busca: Rota = (chamada: ChamadaDeRede) => {
  const corpo = JSON.parse(chamada.corpo ?? '{}') as { busca: string; aCdCategoria: number[] }
  const chave = `${String(corpo.aCdCategoria[0])}|${corpo.busca}`
  return respostaJson(respostaDaBusca(corpo.busca, BUSCAS[chave] ?? []))
}

function rotasDoDoe(edicoes: unknown = EDICOES_DO_DOE): Record<string, Rota> {
  const rotas: Record<string, Rota> = {
    [`GET ${urlDasEdicoesDoDia(DIA)}`]: () => respostaJson(edicoes),
    [`POST ${URL_DA_BUSCA_NO_DOE}`]: busca,
  }
  for (const [id, previa] of Object.entries(PREVIAS)) {
    rotas[`GET ${urlDaPreviaDaMateria(id)}`] = () => respostaJson(previa)
  }
  return rotas
}

/** Catálogo com o que outras fontes já trouxeram. */
function catalogo(): BancoFalso {
  const banco = new BancoFalso()
  banco.carregar({ chave: 'sc;ima;instrucao_normativa;84', fonte: 'ima_in', id_externo: '84' })
  banco.carregar({ chave: 'sc;ima;portaria;300;2026', fonte: 'ima_portaria', id_externo: '4500' })
  banco.carregar({ chave: 'sc;alesc;lei;20101;2026', fonte: 'alesc', id_externo: '54667' })
  banco.carregar({ chave: 'sc;semae;portaria;92;2026', fonte: 'doe_sc', id_externo: '1199000' })
  return banco
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------
Deno.test('lerEdicoesDoDoe lê número, jornal e data, sem os campos de pessoas', () => {
  const edicoes = lerEdicoesDoDoe(EDICOES_DO_DOE)
  assert.deepEqual(edicoes, [
    { cdJornal: 4721, numero: '22884-A', data: '2026-11-18', cancelada: false },
    { cdJornal: 4720, numero: '22884', data: '2026-11-18', cancelada: false },
    { cdJornal: 4719, numero: '22883', data: '2026-11-17', cancelada: false },
  ])
  assert.equal(JSON.stringify(edicoes).includes('Fulano'), false)
  assert.throws(() => lerEdicoesDoDoe({ message: 'E_ROUTE_NOT_FOUND' }), /formato_inesperado/)
  assert.throws(
    () => lerEdicoesDoDoe({ records: { data: [{ cdJornal: 'x' }] } }),
    /formato_inesperado/,
  )
})

Deno.test('lerBuscaDoDoe e lerMateriaDoDoe leem só o que a coleta usa', () => {
  assert.deepEqual(lerBuscaDoDoe(respostaDaBusca('x', [NA_BUSCA.lei, NA_BUSCA.antiga])), [
    { id: '1245300', cdJornal: null, nrJornal: '22884', cancelada: false },
    { id: '935710', cdJornal: 3338, nrJornal: '22097', cancelada: false },
  ])
  assert.throws(() => lerBuscaDoDoe({ total: 0 }), /formato_inesperado/)

  const cgsim = lerMateriaDoDoe(PREVIAS['1245200'])
  assert.equal(cgsim.id, '1245200')
  assert.equal(cgsim.titulo, 'RESOLUÇÃO CGSIM-SC Nº 3, DE 14 DE SETEMBRO DE 2026')
  assert.equal(cgsim.data, '2026-11-18')
  assert.equal(cgsim.numeroDaEdicao, '22884-A')
  assert.equal(cgsim.assunto, 'RESOLUÇÃO')
  // Linhas vazias e espaços repetidos saem.
  assert.match(cgsim.texto, /^RESOLUÇÃO CGSIM-SC Nº 3, DE 14 DE SETEMBRO DE 2026\nEstabelece/)
  assert.match(cgsim.texto, /\(CGSIM-SC\) , no exercício/)
  assert.throws(() => lerMateriaDoDoe({ error: true, item: null }), /formato_inesperado/)
})

Deno.test('URLs, corpo da busca sem acento e endereço oficial da matéria', () => {
  assert.equal(
    urlDasEdicoesDoDia(DIA),
    'https://portal.doe.sea.sc.gov.br/apis/jornal/?page=1&perPage=50&dtStart=2026-11-18%2000:00:00&dtEnd=2026-11-18%2023:59:59',
  )
  assert.deepEqual(JSON.parse(corpoDaBusca('Instrucao Normativa', 4704300)), {
    busca: 'Instrucao Normativa',
    tipoBusca: 2,
    pagination: { from: 0, size: 50 },
    resumo: false,
    aCdAssunto: [],
    aCdCategoria: [4704300],
  })
  assert.equal(
    TERMOS_DA_BUSCA_NO_DOE.some((t) => t.normalize('NFD') !== t),
    false,
  )
  assert.equal(
    urlOficialDaMateria('1237443', '2026-10-23'),
    'https://portal.doe.sea.sc.gov.br/repositorio/2026/20261023/Materias/1237443/1237443_final.html',
  )
})

Deno.test('órgão da chave: lei da ALESC, decreto do Executivo, CGSIM na JUCESC', () => {
  const [ima, semae, jucesc, executivo] = CATEGORIAS_DO_DOE
  assert.ok(ima && semae && jucesc && executivo)
  assert.equal(orgaoDoAto({ tipo: 'lei' }, executivo, '').chave, 'alesc')
  assert.equal(orgaoDoAto({ tipo: 'decreto' }, executivo, '').nome, 'Governo de SC')
  assert.equal(orgaoDoAto({ tipo: 'resolucao' }, jucesc, 'O CGSIM-SC resolve').chave, 'cgsim')
  assert.equal(orgaoDoAto({ tipo: 'portaria' }, jucesc, 'Portaria da Junta').chave, 'jucesc')
  assert.equal(orgaoDoAto({ tipo: 'portaria' }, semae, '').noTitulo, 'SEMAE')
  assert.equal(orgaoDoAto({ tipo: 'resolucao', orgao: 'CONSEMA' }, semae, '').chave, 'consema')
  assert.equal(
    chaveEstadualDoAlvo(
      { tipo: 'instrucao_normativa', numero: '84', ano: 2024 },
      orgaoDoAto({ tipo: 'portaria' }, ima, ''),
    ),
    'sc;ima;instrucao_normativa;84',
  )
  assert.equal(
    chaveEstadualDoAlvo(
      { tipo: 'lei', numero: '14675', ano: 2009 },
      orgaoDoAto({ tipo: 'portaria' }, ima, ''),
    ),
    'sc;alesc;lei;14675;2009',
  )
})

// ---------------------------------------------------------------------------
// Coleta
// ---------------------------------------------------------------------------
Deno.test(
  'DOE-SC: só matérias das edições do dia, sem repetir, e só o normativo ambiental vira norma',
  async () => {
    const banco = catalogo()
    const { ctx, rede } = contextoDeDiario(banco, rotasDoDoe(), { janela: DIA })
    await coletarDoeSc(ctx)
    assert.deepEqual(ctx.contagem.falhas, [])

    // 1 lista de edições, 4 categorias x 7 termos de busca e uma prévia por matéria do dia.
    const buscas = rede.chamadas.filter((c) => c.url === URL_DA_BUSCA_NO_DOE)
    assert.equal(buscas.length, 28)
    assert.match(buscas[0]?.cabecalhos.get('Content-Type') ?? '', /application\/json/)
    const previas = rede.chamadas
      .filter((c) => c.url.includes('/edicao-preview/'))
      .map((c) => c.url.split('/').pop())
    // A matéria de 2023 (outra edição) não é baixada; a repetida, uma vez só.
    assert.deepEqual(previas.sort(), ['1244983', '1245001', '1245100', '1245200', '1245300'])

    // O edital (ato individual) não entra; a portaria do IMA e a lei já estão no catálogo por outra
    // fonte e não são recriadas.
    assert.deepEqual(
      banco.normas.filter((n) => n.fonte === 'doe_sc').map((n) => n.chave),
      ['sc;semae;portaria;92;2026', 'sc;semae;portaria;120;2026', 'sc;cgsim;resolucao;3;2026'],
    )
    assert.equal(banco.versoesDa('sc;ima;portaria;300;2026').length, 0)
    assert.equal(banco.versoesDa('sc;alesc;lei;20101;2026').length, 0)

    const portaria = banco.norma('sc;semae;portaria;120;2026')
    assert.equal(portaria?.dados.titulo, 'Portaria SEMAE 120/2026')
    assert.equal(portaria?.dados.orgao, 'SEMAE')
    assert.equal(portaria?.dados.esfera, 'estadual')
    assert.equal(portaria?.id_externo, '1245001')
    assert.equal(
      portaria?.dados.url_oficial,
      'https://portal.doe.sea.sc.gov.br/repositorio/2026/20261118/Materias/1245001/1245001_final.html',
    )
    assert.match(portaria?.dados.ementa ?? '', /^Revoga a Portaria nº 92, de 2 de março de 2026/)
    const [versao] = banco.versoesDa('sc;semae;portaria;120;2026')
    assert.equal(versao?.objeto, null)
    assert.equal(versao?.mime, 'text/plain')
    assert.equal(versao?.publicada_em, DIA)
    assert.equal(versao?.id_externo, '1245001')
    assert.ok(versao?.texto?.includes(MARCADOR_DE_CPF))
    assert.equal(versao?.texto?.includes('123.456.789-09'), false)

    const cgsim = banco.norma('sc;cgsim;resolucao;3;2026')
    assert.equal(cgsim?.dados.titulo, 'Resolução CGSIM 3/2026')
    assert.equal(
      cgsim?.dados.ementa,
      'Estabelece critérios e disciplina a classificação das atividades econômicas de nível de risco I (baixo risco) no âmbito da REDESIM-SC.',
    )

    // Nada de quem aprovou a edição nem do administrado do edital foi gravado.
    const gravado = JSON.stringify([banco.normas, banco.versoes])
    assert.equal(gravado.includes('Fulano'), false)
    assert.equal(gravado.includes('004.XXX'), false)
  },
)

Deno.test('DOE-SC: revogação de norma do catálogo pelo ato do diário', async () => {
  const banco = catalogo()
  const { ctx } = contextoDeDiario(banco, rotasDoDoe(), { janela: DIA })
  await coletarDoeSc(ctx)

  const portaria92 = banco.norma('sc;semae;portaria;92;2026')
  assert.equal(portaria92?.situacao_na_fonte, 'revogada')
  assert.equal(portaria92?.revogada_em, DIA)
  assert.equal(portaria92?.revogada_por, banco.norma('sc;semae;portaria;120;2026')?.id)
  // A portaria do IMA não ganha versão do DOE, mas a revogação da IN 84 sai com ela como ato.
  const in84 = banco.norma('sc;ima;instrucao_normativa;84')
  assert.equal(in84?.situacao_na_fonte, 'revogada')
  assert.equal(in84?.revogada_por, banco.norma('sc;ima;portaria;300;2026')?.id)
  // A lei 20.101 só altera a 14.675: nenhuma revogação.
  assert.deepEqual(banco.chamadas.filter((c) => c.startsWith('registrar_revogacao')).sort(), [
    'registrar_revogacao:sc;ima;instrucao_normativa;84:sc;ima;portaria;300;2026',
    'registrar_revogacao:sc;semae;portaria;92;2026:sc;semae;portaria;120;2026',
  ])
  // 2 versões novas (SEMAE 120 e CGSIM 3) e 2 revogações.
  assert.equal(ctx.contagem.itensNovos, 4)

  // De novo, sem mudança: nada novo e nenhuma revogação repetida.
  const segunda = contextoDeDiario(banco, rotasDoDoe(), { janela: DIA })
  await coletarDoeSc(segunda.ctx)
  assert.equal(segunda.ctx.contagem.itensNovos, 0)
  assert.equal(banco.versoes.length, 2)
  assert.equal(banco.mudancas.filter((m) => m.tipo === 'revogada').length, 2)
})

Deno.test('DOE-SC: ato de órgão com coletor próprio fora do catálogo fica para ele', async () => {
  const banco = new BancoFalso()
  banco.carregar({ chave: 'sc;ima;instrucao_normativa;84', fonte: 'ima_in', id_externo: '84' })
  const { ctx } = contextoDeDiario(banco, rotasDoDoe(), { janela: DIA })
  await coletarDoeSc(ctx)
  assert.equal(banco.norma('sc;ima;portaria;300;2026'), undefined)
  assert.equal(banco.norma('sc;ima;instrucao_normativa;84')?.situacao_na_fonte, 'vigente')
  // A lei 20.101, sem ninguém no catálogo, entra pelo DOE com a chave da ALESC.
  const lei = banco.norma('sc;alesc;lei;20101;2026')
  assert.equal(lei?.fonte, 'doe_sc')
  assert.equal(lei?.dados.titulo, 'Lei 20.101/2026')
  assert.equal(lei?.dados.numero, '20.101')
  assert.equal(lei?.dados.orgao, 'ALESC')
})

Deno.test('DOE-SC: dia sem edição não busca matérias', async () => {
  const banco = new BancoFalso()
  const soDia17 = {
    records: { data: EDICOES_DO_DOE.records.data.filter((e) => e.vlNumero === '22883') },
  }
  const { ctx, rede } = contextoDeDiario(banco, rotasDoDoe(soDia17), { janela: DIA })
  await coletarDoeSc(ctx)
  assert.equal(rede.chamadas.length, 1)
  assert.equal(ctx.contagem.itensNovos, 0)
  assert.deepEqual(banco.chamadas, [])
})

Deno.test('DOE-SC: a janela com hora usa o dia; sem janela, hoje em Brasília', async () => {
  const banco = new BancoFalso()
  const comHora = contextoDeDiario(banco, rotasDoDoe({ records: { data: [] } }), {
    janela: '2026-11-18T23',
  })
  await coletarDoeSc(comHora.ctx)
  assert.equal(comHora.rede.chamadas[0]?.url, urlDasEdicoesDoDia(DIA))

  // 01h de 19/11 em UTC ainda é 18/11 em Brasília.
  const semJanela = contextoDeDiario(banco, rotasDoDoe({ records: { data: [] } }), {
    agora: new Date('2026-11-19T01:00:00Z'),
  })
  await coletarDoeSc(semJanela.ctx)
  assert.equal(semJanela.rede.chamadas[0]?.url, urlDasEdicoesDoDia(DIA))
})

Deno.test('DOE-SC: resposta fora do formato vira formato_inesperado', async () => {
  const banco = new BancoFalso()
  const { ctx } = contextoDeDiario(banco, rotasDoDoe({ message: 'E_ROUTE_NOT_FOUND' }), {
    janela: DIA,
  })
  await assert.rejects(coletarDoeSc(ctx), /formato_inesperado/)

  // Uma prévia quebrada é falha do item; as outras matérias seguem.
  const rotas = rotasDoDoe()
  rotas[`GET ${urlDaPreviaDaMateria('1245200')}`] = () => respostaJson({ error: true })
  const outro = contextoDeDiario(catalogo(), rotas, { janela: DIA })
  await coletarDoeSc(outro.ctx)
  assert.deepEqual(outro.ctx.contagem.falhas, ['formato_inesperado'])
  assert.ok(outro.log.some((l) => l.includes('materia_1245200')))
  assert.ok(outro.ctx.contagem.itensNovos > 0)
})
