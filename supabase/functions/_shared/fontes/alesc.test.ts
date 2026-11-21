import assert from 'node:assert/strict'

import { MARCADOR_DE_CPF } from '../dominio/sem-cpf.ts'
import {
  chaveDaLeiNaAlesc,
  coletarLeisDaAlesc,
  leiDaChave,
  lerAtoDaAlesc,
  lerBuscaDaAlesc,
  lerTituloDeLei,
  TERMO_DAS_LEIS_NOVAS,
  urlDaBuscaNaAlesc,
  urlDoAtoNaAlesc,
} from './alesc.ts'
import {
  ATO_DA_LEI_20115,
  atoDaLei14675,
  BUSCA_DA_LEI_14262,
  BUSCA_MEIO_AMBIENTE,
  BUSCA_VAZIA,
} from './fixtures/alesc.ts'
import { contextoDeDiario } from './fixtures/diarios.ts'
import { BancoFalso, html, type Rota } from './fixtures/falsos.ts'

const CHAVE_14675 = 'sc;alesc;lei;14675;2009'
const CHAVE_14262 = 'sc;alesc;lei;14262;2007'

function rotasDaAlesc(
  ato14675 = atoDaLei14675(),
  extra: Record<string, Rota> = {},
): Record<string, Rota> {
  return {
    [`GET ${urlDoAtoNaAlesc('16618')}`]: () => html(ato14675),
    [`GET ${urlDoAtoNaAlesc('13800')}`]: () =>
      html(
        atoDaLei14675().replace(
          /14\.675, de 13 de abril de 2009/g,
          '14.262, de 21 de dezembro de 2007',
        ),
      ),
    [`GET ${urlDoAtoNaAlesc('54690')}`]: () => html(ATO_DA_LEI_20115),
    [`GET ${urlDaBuscaNaAlesc('14.262')}`]: () => html(BUSCA_DA_LEI_14262),
    [`GET ${urlDaBuscaNaAlesc(TERMO_DAS_LEIS_NOVAS)}`]: () => html(BUSCA_VAZIA),
    ...extra,
  }
}

/** As duas leis da carga ligadas à fonte alesc: a 14.675 com o id 16618 e a 14.262 sem id. */
function carga(): BancoFalso {
  const banco = new BancoFalso()
  banco.carregar({
    chave: CHAVE_14675,
    fonte: 'alesc',
    id_externo: '16618',
    dados: { titulo: 'Lei 14.675/2009 · Código Estadual do Meio Ambiente' },
  })
  banco.carregar({
    chave: CHAVE_14262,
    fonte: 'alesc',
    dados: { titulo: 'Lei 14.262/2007 · Taxas ambientais' },
  })
  return banco
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------
Deno.test('lerTituloDeLei lê tipo, número, ano e data do título da ALESC', () => {
  assert.deepEqual(lerTituloDeLei('LEI Nº 20.059, DE 14 DE AGOSTO DE 2026'), {
    tipo: 'lei',
    numero: '20059',
    ano: 2026,
    data: '2026-08-14',
  })
  assert.deepEqual(lerTituloDeLei('LEI COMPLEMENTAR Nº 739, DE 1º DE MARÇO DE 2019'), {
    tipo: 'lei_complementar',
    numero: '739',
    ano: 2019,
    data: '2019-03-01',
  })
  assert.deepEqual(lerTituloDeLei('LEI Nº 14.675, de 13 de abril de 2009')?.data, '2009-04-13')
  assert.equal(lerTituloDeLei('DECRETO Nº 1.460, DE 26 DE MARÇO DE 2026'), null)
})

Deno.test('lerBuscaDaAlesc lê os cartões na ordem e recusa outra página', () => {
  assert.deepEqual(
    lerBuscaDaAlesc(BUSCA_MEIO_AMBIENTE).map((r) => [r.id, r.numero, r.ano, r.data]),
    [
      ['54690', '20115', 2026, '2026-11-25'],
      ['54688', '20112', 2026, '2026-11-24'],
      ['54667', '20101', 2026, '2026-11-13'],
      ['54456', '20059', 2026, '2026-08-14'],
    ],
  )
  // O link antigo, sem "legislativo/", também vale.
  assert.equal(
    lerBuscaDaAlesc(
      BUSCA_VAZIA.replace(
        '</div><script',
        `<div class="card-title h5"><a href="/ato-normativo/16618">LEI Nº 14.675, de 13 de abril de 2009</a></div></div><script`,
      ),
    )[0]?.id,
    '16618',
  )
  assert.deepEqual(lerBuscaDaAlesc(BUSCA_VAZIA), [])
  assert.throws(() => lerBuscaDaAlesc('<html><body>Erro 500</body></html>'), /formato_inesperado/)
})

Deno.test('lerAtoDaAlesc separa epígrafe, cabeçalho e ementa, e o texto leva o cabeçalho', () => {
  const ato = lerAtoDaAlesc(atoDaLei14675())
  assert.equal(ato.titulo, 'LEI Nº 14.675, de 13 de abril de 2009')
  assert.match(ato.cabecalho, /^Procedência: Governamental/)
  assert.match(ato.cabecalho, /Alterada pelas Leis: 19\.291\/2025; 19\.314\/2025; 19\.677\/2025/)
  assert.match(ato.cabecalho, /ADI TJSC 5069066-65\.2025\.8\.24\.0000/)
  assert.match(ato.cabecalho, /Decretos: 2471\/2009; 1486\/2026; 1517\/2026/)
  assert.equal(
    ato.ementa,
    'Institui o Código Estadual do Meio Ambiente e estabelece outras providências.',
  )
  assert.match(
    ato.texto,
    /^LEI Nº 14\.675, de 13 de abril de 2009\nVer Versão compilada\nProcedência/,
  )
  assert.ok(ato.texto.includes(ato.cabecalho))
  assert.match(ato.texto, /Art\. 1º Esta Lei, ressalvada a competência da União/)
  assert.equal(/<|font-size/.test(ato.texto), false)
  assert.throws(
    () => lerAtoDaAlesc('<html><body><p>sem epígrafe</p></body></html>'),
    /formato_inesperado/,
  )
})

Deno.test('chave da lei da ALESC e de volta', () => {
  assert.equal(chaveDaLeiNaAlesc({ tipo: 'lei', numero: '14675', ano: 2009 }), CHAVE_14675)
  assert.deepEqual(leiDaChave(CHAVE_14262), { tipo: 'lei', numero: '14262', ano: 2007 })
  assert.equal(leiDaChave('sc;executivo;decreto;421;2023'), null)
  assert.equal(
    urlDaBuscaNaAlesc('meio ambiente'),
    'https://leis.alesc.sc.gov.br/legislativo?search=meio+ambiente&sort=data_desc',
  )
})

// ---------------------------------------------------------------------------
// Leis vigiadas
// ---------------------------------------------------------------------------
Deno.test(
  'ALESC: lei vigiada sem mudança (mesmo SHA) não grava nada; com mudança, versão nova',
  async () => {
    const banco = carga()
    const primeira = contextoDeDiario(banco, rotasDaAlesc(), { janela: '2026-11-23' })
    await coletarLeisDaAlesc(primeira.ctx)
    assert.deepEqual(primeira.ctx.contagem.falhas, [])

    // Versão-base sem mudança (regra 4), sem data de publicação e com o id do ato.
    const [base] = banco.versoesDa(CHAVE_14675)
    assert.equal(base?.numero, 1)
    assert.equal(base?.publicada_em, null)
    assert.equal(base?.id_externo, '16618')
    assert.equal(base?.objeto, null)
    assert.match(base?.texto ?? '', /Alterada pelas Leis: 19\.291\/2025/)
    assert.equal(banco.mudancas.length, 0)

    // Mesmo HTML: mesmo SHA, nada gravado.
    const segunda = contextoDeDiario(banco, rotasDaAlesc(), { janela: '2026-11-24' })
    await coletarLeisDaAlesc(segunda.ctx)
    assert.equal(segunda.ctx.contagem.itensNovos, 0)
    assert.equal(banco.versoesDa(CHAVE_14675).length, 1)

    // Uma lei nova no "Alterada pelas Leis": versão 2 com a diferença.
    const mudou = atoDaLei14675(
      '; <a href="https://leis.alesc.sc.gov.br/html/2026/20101_2026_lei.html">20.101/2026</a>',
    )
    const terceira = contextoDeDiario(banco, rotasDaAlesc(mudou), { janela: '2026-11-25' })
    await coletarLeisDaAlesc(terceira.ctx)
    assert.equal(terceira.ctx.contagem.itensNovos, 1)
    const versoes = banco.versoesDa(CHAVE_14675)
    assert.equal(versoes.length, 2)
    assert.match(versoes[1]?.texto ?? '', /19\.677\/2025; 20\.101\/2026/)
    const [mudanca] = banco.mudancas
    assert.equal(mudanca?.tipo, 'alterada')
    assert.equal(mudanca?.norma_id, banco.norma(CHAVE_14675)?.id)
    assert.notDeepEqual(mudanca?.diferenca, {})
  },
)

Deno.test(
  'ALESC: lei sem id externo é achada pela busca e o id fica na URL e na versão',
  async () => {
    const banco = carga()
    const primeira = contextoDeDiario(banco, rotasDaAlesc(), { janela: '2026-11-23' })
    await coletarLeisDaAlesc(primeira.ctx)

    const lei = banco.norma(CHAVE_14262)
    // A busca devolveu primeiro a 17.893 (que só cita a 14.262): ficou o resultado de número e ano iguais.
    assert.equal(lei?.dados.url_oficial, 'https://leis.alesc.sc.gov.br/ato-normativo/13800')
    // garantir_norma sem título: a norma da carga mantém o dela.
    assert.equal(lei?.dados.titulo, 'Lei 14.262/2007 · Taxas ambientais')
    const [versao] = banco.versoesDa(CHAVE_14262)
    assert.equal(versao?.id_externo, '13800')
    assert.match(versao?.texto ?? '', /^LEI Nº 14\.262, de 21 de dezembro de 2007/)

    // Na próxima execução o id vem da última versão: nada de busca.
    const segunda = contextoDeDiario(banco, rotasDaAlesc(), { janela: '2026-11-24' })
    await coletarLeisDaAlesc(segunda.ctx)
    assert.equal(
      segunda.rede.chamadas.some((c) => c.url === urlDaBuscaNaAlesc('14.262')),
      false,
    )
    assert.ok(segunda.rede.chamadas.some((c) => c.url === urlDoAtoNaAlesc('13800')))
  },
)

Deno.test('ALESC: lei que a busca não acha é falha do item; as outras seguem', async () => {
  const banco = carga()
  const rotas = rotasDaAlesc(atoDaLei14675(), {
    [`GET ${urlDaBuscaNaAlesc('14.262')}`]: () => html(BUSCA_VAZIA),
  })
  const { ctx, log } = contextoDeDiario(banco, rotas, { janela: '2026-11-23' })
  await coletarLeisDaAlesc(ctx)
  assert.deepEqual(ctx.contagem.falhas, ['lei_nao_encontrada'])
  assert.ok(log.some((l) => l.includes(CHAVE_14262)))
  assert.equal(banco.versoesDa(CHAVE_14675).length, 1)
})

Deno.test('ALESC: cada página de lei conta no limite da execução', async () => {
  const banco = carga()
  const { ctx } = contextoDeDiario(banco, rotasDaAlesc(), { janela: '2026-11-23', limite: 1 })
  await coletarLeisDaAlesc(ctx)
  assert.equal(ctx.contagem.baixados, 1)
  assert.equal(ctx.contagem.pendentes, 1)
  assert.equal(banco.versoes.length, 1)
})

// ---------------------------------------------------------------------------
// Leis novas
// ---------------------------------------------------------------------------
Deno.test('ALESC: lei de depois da carga e fora do catálogo vira norma com ato novo', async () => {
  const banco = carga()
  // A 20.112 já veio pelo DOE-SC.
  banco.carregar({ chave: 'sc;alesc;lei;20112;2026', fonte: 'doe_sc', id_externo: '1245400' })
  // Já houve coleta concluída da fonte: o ato novo gera mudança "nova" (regra 4 do ADR-0050).
  banco.coletas.push({
    id: 'coleta-anterior',
    fonte: 'alesc',
    janela: '2026-11-26',
    situacao: 'concluida',
    itens: 0,
    erro: null,
  })
  const rotas = rotasDaAlesc(atoDaLei14675(), {
    [`GET ${urlDaBuscaNaAlesc(TERMO_DAS_LEIS_NOVAS)}`]: () => html(BUSCA_MEIO_AMBIENTE),
  })
  const { ctx, rede } = contextoDeDiario(banco, rotas, { janela: '2026-11-27' })
  await coletarLeisDaAlesc(ctx)
  assert.deepEqual(ctx.contagem.falhas, [])

  // A 20.101 e a 20.059 são de antes da carga; a 20.112 já está no catálogo.
  assert.deepEqual(
    banco.normas.filter((n) => n.fonte === 'alesc').map((n) => n.chave),
    [CHAVE_14675, CHAVE_14262, 'sc;alesc;lei;20115;2026'],
  )
  assert.equal(
    rede.chamadas.some((c) => ['54688', '54667', '54456'].some((id) => c.url.endsWith(`/${id}`))),
    false,
  )
  const lei = banco.norma('sc;alesc;lei;20115;2026')
  assert.equal(lei?.id_externo, '54690')
  assert.equal(lei?.dados.titulo, 'Lei 20.115/2026')
  assert.equal(lei?.dados.numero, '20.115')
  assert.equal(lei?.dados.orgao, 'ALESC')
  assert.equal(lei?.dados.url_oficial, 'https://leis.alesc.sc.gov.br/ato-normativo/54690')
  assert.equal(
    lei?.dados.ementa,
    'Dispõe sobre a destinação de resíduos sólidos da construção civil no Estado de Santa Catarina.',
  )
  const [versao] = banco.versoesDa('sc;alesc;lei;20115;2026')
  assert.ok(versao?.texto?.includes(MARCADOR_DE_CPF))
  assert.equal(versao?.texto?.includes('123.456.789-09'), false)
  assert.deepEqual(
    banco.mudancas.map((m) => [m.tipo, m.norma_id]),
    [['nova', lei?.id]],
  )
})
