import assert from 'node:assert/strict'

import { COLETORES, criarTratadorDaColeta } from '../coleta-de-normas.ts'
import { buscarComEducacao, type ContextoDaColeta, HOSTS_DAS_FONTES } from './comum.ts'
import {
  acharNoCatalogo,
  type Catalogo,
  dataBrasileiraParaIso,
  decodificarHtml,
  diaDaJanela,
  ementaDoTexto,
  htmlParaTextoCorrido,
  numeroParaExibir,
  registrarRevogacoesCitadas,
} from './diarios.ts'
import { contextoDeDiario, latin1 } from './fixtures/diarios.ts'
import { BancoFalso, redeFalsa } from './fixtures/falsos.ts'

Deno.test('o tratador tem coletor para os diários e as fontes federais; o Senado fica sem', () => {
  for (const fonte of ['doe_sc', 'alesc', 'joinville_doem', 'inlabs', 'planalto', 'ciga']) {
    assert.equal(typeof COLETORES[fonte], 'function', fonte)
  }
  assert.equal(COLETORES.senado, undefined)
})

Deno.test('o tratador passa a janela do pedido ao coletor', async () => {
  const banco = new BancoFalso()
  const janelas: (string | undefined)[] = []
  const tratar = criarTratadorDaColeta({
    env: () => 'token',
    fetch: redeFalsa({}).fetch,
    banco,
    lerPdf: () => Promise.resolve(''),
    agora: () => new Date('2026-11-21T02:00:00Z'),
    registrar: () => {},
    coletores: {
      doe_sc: (ctx: ContextoDaColeta) => {
        janelas.push(ctx.janela)
        return Promise.resolve()
      },
    },
  })
  const pedir = (corpo: unknown) =>
    new Request('http://localhost/coletar-normas', {
      method: 'POST',
      headers: { 'x-cron-token': 'token' },
      body: JSON.stringify(corpo),
    })
  assert.equal((await tratar(pedir({ fonte: 'doe_sc', janela: '2026-11-18T20' }))).status, 200)
  assert.equal((await tratar(pedir({ fonte: 'doe_sc' }))).status, 200)
  // Sem janela, o dia em Brasília (23h de 20/11), não em UTC.
  assert.deepEqual(janelas, ['2026-11-18T20', '2026-11-20'])
})

Deno.test(
  'os três domínios novos estão na lista do acesso educado; outros continuam fora',
  async () => {
    for (const host of [
      'portal.doe.sea.sc.gov.br',
      'leis.alesc.sc.gov.br',
      'sei.joinville.sc.gov.br',
    ]) {
      assert.ok((HOSTS_DAS_FONTES as readonly string[]).includes(host), host)
    }
    const rede = redeFalsa({})
    const buscar = buscarComEducacao(rede.fetch, { esperar: () => Promise.resolve() })
    await assert.rejects(
      buscar('https://diariomunicipal.sc.gov.br/', { tipos: ['text/html'] }),
      /dominio_nao_permitido/,
    )
    await assert.rejects(
      buscar('https://www.joinville.sc.gov.br/jornal/index/page/1', { tipos: ['text/html'] }),
      /dominio_nao_permitido/,
    )
    assert.equal(rede.chamadas.length, 0)
  },
)

Deno.test('diaDaJanela, datas, números e ementa', () => {
  const agora = new Date('2026-11-21T02:00:00Z')
  assert.equal(diaDaJanela({ janela: '2026-11-18T20', agora }), '2026-11-18')
  assert.equal(diaDaJanela({ agora }), '2026-11-20')
  assert.equal(dataBrasileiraParaIso('19/11/2026'), '2026-11-19')
  assert.equal(dataBrasileiraParaIso('2026-11-19'), null)
  assert.equal(numeroParaExibir({ tipo: 'lei', numero: '14675' }), '14.675')
  assert.equal(numeroParaExibir({ tipo: 'decreto', numero: '421' }), '421')
  assert.equal(numeroParaExibir({ tipo: 'portaria', numero: '1200' }), '1200')
  assert.equal(
    ementaDoTexto('PORTARIA Nº 1/2026\nDispõe sobre o licenciamento. Revoga a anterior.\nArt. 1º'),
    'Dispõe sobre o licenciamento.',
  )
  assert.equal(ementaDoTexto('PORTARIA Nº 1/2026\nO SECRETÁRIO DE ESTADO, no uso...'), null)
  assert.equal(ementaDoTexto('PORTARIA Nº 1/2026\nConsiderando a necessidade'), null)
  assert.equal(ementaDoTexto('PORTARIA Nº 1/2026'), null)
  assert.equal(ementaDoTexto(`T\n${'a'.repeat(400)}`)?.length, 300)
})

Deno.test('decodificarHtml: charset do cabeçalho, do meta, UTF-8 válido ou Windows-1252', () => {
  const utf8 = new TextEncoder().encode('<p>Instrução</p>')
  assert.equal(decodificarHtml(utf8, 'text/html; charset=utf-8'), '<p>Instrução</p>')
  assert.equal(decodificarHtml(utf8, 'text/html'), '<p>Instrução</p>')
  const comMeta = latin1('<meta charset="iso-8859-1"><p>Instrução</p>')
  assert.equal(decodificarHtml(comMeta, null), '<meta charset="iso-8859-1"><p>Instrução</p>')
  assert.equal(decodificarHtml(latin1('<p>Resolução</p>'), 'text/html'), '<p>Resolução</p>')
})

Deno.test('htmlParaTextoCorrido: quebra do código-fonte é espaço; bloco é linha', () => {
  assert.equal(
    htmlParaTextoCorrido('<a>Ver</a>\r\n<div><p>Art. 1º Esta\nLei vale.</p><p>Art. 2º</p></div>'),
    'Ver\nArt. 1º Esta Lei vale.\nArt. 2º',
  )
})

Deno.test(
  'revogação citada: catálogo exato, citação sem ano e norma fora do catálogo',
  async () => {
    const banco = new BancoFalso()
    const lei = banco.carregar({ chave: 'sc;alesc;lei;14262;2007', fonte: 'alesc' })
    banco.carregar({ chave: 'sc;executivo;decreto;421;2023', fonte: 'carga' })
    const catalogo: Catalogo = new Map([
      [
        lei.chave,
        {
          fonte: 'alesc',
          conhecida: {
            norma_id: lei.id,
            chave: lei.chave,
            id_externo: null,
            situacao_na_fonte: 'vigente',
            ultima_versao_id_externo: null,
            ultimo_sha256: null,
            ultima_versao_numero: null,
          },
        },
      ],
    ])
    assert.equal(acharNoCatalogo(catalogo, 'sc;alesc;lei;14262', false)?.[0], lei.chave)
    assert.equal(acharNoCatalogo(catalogo, 'sc;alesc;lei;14262;2008', true), null)

    const { ctx } = contextoDeDiario(banco, {})
    const revogadas = await registrarRevogacoesCitadas(ctx, {
      texto:
        'LEI Nº 20.200, DE 1º DE DEZEMBRO DE 2026\nRevoga a Lei nº 14.262 e o Decreto nº 421, de 2023, e a Lei nº 9.999, de 1990.',
      chaveDoAto: 'sc;alesc;lei;20200;2026',
      revogadaEm: '2026-12-02',
      catalogo,
      chaveDoAlvo: (alvo) =>
        alvo.tipo === 'decreto'
          ? `sc;executivo;decreto;${alvo.numero}${alvo.ano ? `;${String(alvo.ano)}` : ''}`
          : `sc;alesc;lei;${alvo.numero}${alvo.ano ? `;${String(alvo.ano)}` : ''}`,
    })
    // A 14.262 (citada sem ano) e o decreto da carga, que não está no mapa; a 9.999 não existe.
    assert.deepEqual(revogadas, ['sc;alesc;lei;14262;2007', 'sc;executivo;decreto;421;2023'])
    assert.equal(ctx.contagem.itensNovos, 2)
    assert.equal(banco.norma('sc;alesc;lei;14262;2007')?.revogada_em, '2026-12-02')

    // Ato que só altera não revoga nada.
    const nada = await registrarRevogacoesCitadas(ctx, {
      texto: 'Altera a Lei nº 14.675, de 2009.',
      chaveDoAto: 'x;y',
      revogadaEm: null,
      catalogo,
      chaveDoAlvo: () => 'sc;alesc;lei;14675;2009',
    })
    assert.deepEqual(nada, [])
  },
)
