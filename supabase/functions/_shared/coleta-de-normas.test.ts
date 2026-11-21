import assert from 'node:assert/strict'

import { criarTratadorDaColeta, LIMITE_PADRAO } from './coleta-de-normas.ts'
import { buscarComEducacao, ErroDaColeta, USER_AGENT } from './fontes/comum.ts'
import {
  BancoFalso,
  html,
  lerPdfFalso,
  pdf,
  redeFalsa,
  type Rota,
} from './fontes/fixtures/falsos.ts'
import { PAGINA_DAS_INS } from './fontes/fixtures/ima-in.ts'
import { MARCADOR_DE_CPF } from './dominio/sem-cpf.ts'

const TOKEN = 'token-de-teste-da-coleta'
const VARIAVEIS: Record<string, string> = { COLETA_NORMAS_TOKEN: TOKEN }
// 20/11/2026 às 23h em Brasília (já é dia 21 em UTC).
const AGORA = new Date('2026-11-21T02:00:00Z')

const IN = 'https://in.ima.sc.gov.br/'
const PDF_DA_IN = (id: string) =>
  `GET https://in.ima.sc.gov.br/instrucaoNormativa/downloadPDF/${id}`
const chaveDaIn = (n: number) => `sc;ima;instrucao_normativa;${String(n)}`

const TEXTO_IN_0 = [
  'INSTRUÇÃO NORMATIVA Nº 00',
  'Art. 1º Esta IN dá diretrizes gerais ao licenciamento.',
  'Art. 2º O requerimento é feito pelo sistema do IMA.',
  'Art. 3º Esta IN entra em vigor na data de sua publicação.',
].join('\n')

interface Opcoes {
  banco?: BancoFalso
  variaveis?: Record<string, string>
  agora?: Date
}

// Contador único entre execuções: o Storage falso, como o real, recusa caminho repetido.
let uuid = 0

function montar(rotas: Record<string, Rota>, opcoes: Opcoes = {}) {
  const banco = opcoes.banco ?? new BancoFalso()
  const rede = redeFalsa(rotas)
  const log: string[] = []
  const tratar = criarTratadorDaColeta({
    env: (nome) => (opcoes.variaveis ?? VARIAVEIS)[nome],
    fetch: rede.fetch,
    banco,
    lerPdf: lerPdfFalso,
    agora: () => opcoes.agora ?? AGORA,
    esperar: () => Promise.resolve(),
    novoUuid: () => {
      uuid++
      return `00000000-0000-4000-8000-${String(uuid).padStart(12, '0')}`
    },
    registrar: (linha) => log.push(linha),
  })
  return { tratar, banco, rede, log }
}

function pedir(corpo: unknown, token: string | null = TOKEN): Request {
  const cabecalhos: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token !== null) cabecalhos['x-cron-token'] = token
  return new Request('http://localhost/coletar-normas', {
    method: 'POST',
    headers: cabecalhos,
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  })
}

/** Catálogo da carga: IN 0 vigente, IN 12 e IN 84 revogadas; a IN 2 não está. */
function catalogoDasIns(banco = new BancoFalso()): BancoFalso {
  banco.carregar({ chave: chaveDaIn(0), fonte: 'ima_in', id_externo: '0' })
  banco.carregar({
    chave: chaveDaIn(12),
    fonte: 'ima_in',
    id_externo: '12',
    situacao_na_fonte: 'revogada',
  })
  banco.carregar({
    chave: chaveDaIn(84),
    fonte: 'ima_in',
    id_externo: '84',
    situacao_na_fonte: 'revogada',
  })
  return banco
}

function rotasDasIns(pagina = PAGINA_DAS_INS, extra: Record<string, Rota> = {}) {
  return {
    [`GET ${IN}`]: () => html(pagina),
    [PDF_DA_IN('331')]: () => pdf(TEXTO_IN_0, 'in0_331_20241204.pdf'),
    [PDF_DA_IN('344')]: () => pdf('IN 02 texto', 'in2_344_20251010.pdf'),
    [PDF_DA_IN('340')]: () => pdf('IN 12 texto', 'in12_340_20090221.pdf'),
    [PDF_DA_IN('328')]: () => pdf('IN 84 texto', 'in84_328_20240820.pdf'),
    ...extra,
  }
}

// ---------------------------------------------------------------------------
// Tratador: segredo, pedido e coleta ignorada
// ---------------------------------------------------------------------------
Deno.test('sem o segredo COLETA_NORMAS_TOKEN responde 503 e não toca no banco', async () => {
  const { tratar, banco } = montar({}, { variaveis: {} })
  const resposta = await tratar(pedir({ fonte: 'ima_in' }))
  assert.equal(resposta.status, 503)
  assert.deepEqual(await resposta.json(), { erro: 'configuracao_ausente' })
  assert.deepEqual(banco.chamadas, [])
})

Deno.test('token errado ou ausente responde 401 e não toca no banco', async () => {
  const { tratar, banco } = montar({})
  for (const token of ['outro-token', `${TOKEN}x`, '', null]) {
    const resposta = await tratar(pedir({ fonte: 'ima_in' }, token))
    assert.equal(resposta.status, 401)
    assert.deepEqual(await resposta.json(), { erro: 'sem_permissao' })
  }
  assert.deepEqual(banco.chamadas, [])
})

Deno.test('método diferente de POST responde 405 e OPTIONS responde o CORS', async () => {
  const { tratar } = montar({})
  const get = await tratar(new Request('http://localhost/coletar-normas'))
  assert.equal(get.status, 405)
  const options = await tratar(
    new Request('http://localhost/coletar-normas', { method: 'OPTIONS' }),
  )
  assert.equal(options.status, 200)
  assert.match(options.headers.get('Access-Control-Allow-Headers') ?? '', /x-cron-token/)
})

Deno.test(
  'pedido inválido responde 400 e fonte sem coletor responde fonte_sem_coletor',
  async () => {
    const { tratar, banco } = montar({})
    for (const corpo of [
      'não é json',
      {},
      { fonte: 'IMA IN' },
      { fonte: 'ima_in', limite: 0 },
      { fonte: 'ima_in', limite: 51 },
      { fonte: 'ima_in', janela: '20/11/2026' },
      { fonte: 'ima_in', forcar: 'sim' },
    ]) {
      const resposta = await tratar(pedir(corpo))
      assert.equal(resposta.status, 400, JSON.stringify(corpo))
      assert.deepEqual(await resposta.json(), { erro: 'pedido_invalido' })
    }
    const semColetor = await tratar(pedir({ fonte: 'doe_sc' }))
    assert.equal(semColetor.status, 400)
    assert.deepEqual(await semColetor.json(), { erro: 'fonte_sem_coletor' })
    assert.deepEqual(banco.chamadas, [])
  },
)

Deno.test('janela padrão é o dia de hoje em Brasília, não em UTC', async () => {
  const banco = catalogoDasIns()
  const { tratar } = montar(rotasDasIns(), { banco })
  const resposta = await tratar(pedir({ fonte: 'ima_in' }))
  assert.equal(resposta.status, 200)
  assert.equal(banco.coletas[0]?.janela, '2026-11-20')
})

Deno.test('coleta já concluída na janela é ignorada sem buscar nada', async () => {
  const banco = catalogoDasIns()
  const { tratar, rede } = montar(rotasDasIns(), { banco })
  assert.equal((await tratar(pedir({ fonte: 'ima_in' }))).status, 200)
  const chamadasAntes = rede.chamadas.length

  const repetida = await tratar(pedir({ fonte: 'ima_in' }))
  assert.equal(repetida.status, 200)
  assert.deepEqual(await repetida.json(), {
    ignorada: true,
    fonte: 'ima_in',
    janela: '2026-11-20',
  })
  assert.equal(rede.chamadas.length, chamadasAntes)
  assert.equal(banco.coletas.length, 1)
})

Deno.test('fonte desligada responde 409 sem buscar; forcar passa', async () => {
  const banco = catalogoDasIns()
  banco.desligadas.add('ima_in')
  const { tratar, rede } = montar(rotasDasIns(), { banco })
  const desligada = await tratar(pedir({ fonte: 'ima_in' }))
  assert.equal(desligada.status, 409)
  assert.deepEqual(await desligada.json(), { erro: 'fonte_desligada' })
  assert.equal(rede.chamadas.length, 0)

  const forcada = await tratar(pedir({ fonte: 'ima_in', forcar: true }))
  assert.equal(forcada.status, 200)
})

// ---------------------------------------------------------------------------
// Acesso educado
// ---------------------------------------------------------------------------
Deno.test('buscarComEducacao identifica o coletor e espera 1 s entre pedidos', async () => {
  const rede = redeFalsa({ [`GET ${IN}`]: () => html('ok') })
  const relogio = [1_000, 1_200, 2_000, 7_000, 7_000]
  const esperas: number[] = []
  const buscar = buscarComEducacao(rede.fetch, {
    agora: () => relogio.shift() ?? 9_999,
    esperar: (ms) => {
      esperas.push(ms)
      return Promise.resolve()
    },
  })
  await buscar(IN, { tipos: ['text/html'] })
  await buscar(IN, { tipos: ['text/html'] })
  await buscar(IN, { tipos: ['text/html'] })
  assert.deepEqual(esperas, [800])
  assert.equal(rede.chamadas[0]?.cabecalhos.get('User-Agent'), USER_AGENT)
  assert.equal(USER_AGENT, 'Grama-coletor/1.0 (+https://gramaapp.com.br)')
})

Deno.test('buscarComEducacao recusa Content-Type inesperado (RSS no lugar da página)', async () => {
  const rede = redeFalsa({
    [`GET ${IN}`]: () =>
      new Response('<rss></rss>', { headers: { 'Content-Type': 'application/rss+xml' } }),
  })
  const buscar = buscarComEducacao(rede.fetch, { esperar: () => Promise.resolve() })
  await assert.rejects(
    buscar(IN, { tipos: ['text/html'] }),
    (erro) => erro instanceof ErroDaColeta && erro.codigo === 'conteudo_inesperado',
  )
})

Deno.test(
  'buscarComEducacao segue redirecionamento no mesmo domínio e recusa outro domínio',
  async () => {
    const rede = redeFalsa({
      [`GET ${IN}a`]: () => new Response(null, { status: 302, headers: { Location: '/b' } }),
      [`GET ${IN}b`]: () => html('chegou'),
      [`GET ${IN}c`]: () =>
        new Response(null, { status: 302, headers: { Location: 'https://outro.example/x' } }),
    })
    const buscar = buscarComEducacao(rede.fetch, { esperar: () => Promise.resolve() })
    const resposta = await buscar(`${IN}a`, { tipos: ['text/html'] })
    assert.equal(await resposta.text(), 'chegou')
    await assert.rejects(
      buscar(`${IN}c`, { tipos: ['text/html'] }),
      (erro) => erro instanceof ErroDaColeta && erro.codigo === 'redirecionamento_externo',
    )
    assert.equal(
      rede.chamadas.some((c) => c.url.startsWith('https://outro.example')),
      false,
    )
  },
)

Deno.test(
  'buscarComEducacao só vai aos domínios das fontes, por https, e traduz HTTP e rede',
  async () => {
    const rede = redeFalsa({
      [`GET ${IN}erro`]: () => html('erro', 500),
      [`GET ${IN}caiu`]: () => {
        throw new TypeError('conexão recusada')
      },
    })
    const buscar = buscarComEducacao(rede.fetch, { esperar: () => Promise.resolve() })
    const codigo = async (url: string) => {
      try {
        await buscar(url, { tipos: ['text/html'] })
        return 'ok'
      } catch (erro) {
        return erro instanceof ErroDaColeta ? erro.codigo : 'outro'
      }
    }
    assert.equal(await codigo('https://outro.example/'), 'dominio_nao_permitido')
    assert.equal(await codigo('http://in.ima.sc.gov.br/'), 'dominio_nao_permitido')
    assert.equal(await codigo(`${IN}erro`), 'http_500')
    assert.equal(await codigo(`${IN}caiu`), 'falha_de_rede')
    assert.equal(rede.chamadas.length, 2)
  },
)

// ---------------------------------------------------------------------------
// Fluxo das versões (IMA · INs, com RPCs falsas)
// ---------------------------------------------------------------------------
Deno.test('primeira coleta grava a versão-base sem mudança, inclusive da IN nova', async () => {
  const banco = catalogoDasIns()
  const { tratar } = montar(rotasDasIns(), { banco })
  const resposta = await tratar(pedir({ fonte: 'ima_in' }))
  assert.equal(resposta.status, 200)
  const corpo = await resposta.json()
  assert.deepEqual(corpo, {
    coleta_id: banco.coletas[0]?.id,
    itens_novos: 4,
    baixados: 4,
    pendentes: 0,
  })
  assert.equal(banco.versoes.length, 4)
  assert.deepEqual(banco.mudancas, [])
  assert.equal(banco.coletas[0]?.situacao, 'concluida')

  // A IN 2 entrou no catálogo com a chave e o título da carga.
  const in2 = banco.norma(chaveDaIn(2))
  assert.equal(in2?.dados.titulo, 'IN 2 · Disposição final de rejeitos em aterros')
  assert.equal(in2?.dados.url_oficial, 'https://in.ima.sc.gov.br/instrucaoNormativa/visualizar/344')
  assert.equal(in2?.id_externo, '2')

  // Versão: id do PDF, data do nome do arquivo, arquivo no Storage em normas/<norma>/<uuid>.
  const [v0] = banco.versoesDa(chaveDaIn(0))
  const norma0 = banco.norma(chaveDaIn(0))?.id ?? ''
  assert.equal(v0?.id_externo, '331')
  assert.equal(v0?.publicada_em, '2024-12-04')
  assert.equal(v0?.publicada_em_texto, '20241204')
  assert.equal(v0?.mime, 'application/pdf')
  assert.match(v0?.sha256 ?? '', /^[0-9a-f]{64}$/)
  assert.match(v0?.objeto ?? '', new RegExp(`^normas/${norma0}/[0-9a-f-]{36}$`))
  assert.ok(banco.arquivos.has((v0?.objeto ?? '').replace(/^normas\//, '')))
  assert.equal(v0?.texto, TEXTO_IN_0)
})

Deno.test(
  'versão nova da IN gera mudança alterada com a diferença; IN nova depois da carga gera nova',
  async () => {
    const banco = catalogoDasIns()
    // Dia 1: a página ainda não tem a IN 02.
    const semIn2 = PAGINA_DAS_INS.replace('>IN 02 - ', '>')
    const primeiro = montar(rotasDasIns(semIn2), { banco })
    assert.equal((await primeiro.tratar(pedir({ fonte: 'ima_in' }))).status, 200)
    assert.equal(banco.versoes.length, 3)

    // Dia 2: a IN 00 tem versão nova (id 350) e a IN 02 aparece.
    const textoNovo = TEXTO_IN_0.replace('pelo sistema do IMA', 'pelo SinFAT')
    const paginaNova = PAGINA_DAS_INS.replaceAll('downloadPDF/331', 'downloadPDF/350')
    const segundo = montar(
      rotasDasIns(paginaNova, { [PDF_DA_IN('350')]: () => pdf(textoNovo, 'in0_350_20261123.pdf') }),
      { banco, agora: new Date('2026-11-23T12:00:00Z') },
    )
    const resposta = await segundo.tratar(pedir({ fonte: 'ima_in' }))
    assert.equal(resposta.status, 200, segundo.log.join('|'))
    const corpo = (await resposta.json()) as Record<string, unknown>
    assert.equal(corpo.itens_novos, 2)
    // Só os dois PDFs novos foram baixados (além da página).
    assert.deepEqual(
      segundo.rede.chamadas.map((c) => c.url),
      [
        IN,
        'https://in.ima.sc.gov.br/instrucaoNormativa/downloadPDF/350',
        'https://in.ima.sc.gov.br/instrucaoNormativa/downloadPDF/344',
      ],
    )

    const versoes0 = banco.versoesDa(chaveDaIn(0))
    assert.deepEqual(
      versoes0.map((v) => [v.numero, v.id_externo]),
      [
        [1, '331'],
        [2, '350'],
      ],
    )
    const alterada = banco.mudancas.find((m) => m.tipo === 'alterada')
    assert.equal(alterada?.versao_nova_id, versoes0[1]?.id)
    assert.deepEqual(alterada?.diferenca, {
      estruturada: true,
      incluidos: [],
      revogados: [],
      alterados: [
        {
          caminho: 'art2',
          rotulo: 'Art. 2º',
          antes: 'O requerimento é feito pelo sistema do IMA.',
          depois: 'O requerimento é feito pelo SinFAT.',
        },
      ],
      iguais: 2,
    })
    const nova = banco.mudancas.find((m) => m.tipo === 'nova')
    assert.equal(nova?.norma_id, banco.norma(chaveDaIn(2))?.id)
    assert.equal(banco.mudancas.length, 2)
  },
)

Deno.test(
  'limite por execução: baixa primeiro as mudanças, o resto fica para a próxima',
  async () => {
    const banco = new BancoFalso()
    for (const n of [0, 2, 12, 84]) {
      banco.carregar({
        chave: chaveDaIn(n),
        fonte: 'ima_in',
        id_externo: String(n),
        situacao_na_fonte: n === 12 || n === 84 ? 'revogada' : 'vigente',
      })
    }
    // A IN 84 já tem versão-base com outro id: é mudança e passa na frente.
    const in84 = banco.norma(chaveDaIn(84))?.id ?? ''
    await banco.registrarVersao(
      'coleta-carga',
      in84,
      { sha256: 'a'.repeat(64), id_externo: '300' },
      null,
      false,
    )

    const { tratar, rede } = montar(rotasDasIns(), { banco })
    const resposta = await tratar(pedir({ fonte: 'ima_in', limite: 2 }))
    const corpo = (await resposta.json()) as Record<string, unknown>
    assert.equal(resposta.status, 200)
    assert.equal(corpo.baixados, 2)
    assert.equal(corpo.pendentes, 2)
    assert.deepEqual(
      rede.chamadas.slice(1).map((c) => c.url.split('/').pop()),
      ['328', '331'],
    )
    assert.equal(LIMITE_PADRAO, 15)
  },
)

Deno.test('CPF sai do texto antes de gravar; PDF ilegível grava a versão sem texto', async () => {
  const banco = catalogoDasIns()
  const comCpf = `${TEXTO_IN_0}\nResponsável técnico, CPF: 123.456.789-09, e CPF 004.XXX.XXX-61.`
  const { tratar } = montar(
    rotasDasIns(PAGINA_DAS_INS, {
      [PDF_DA_IN('331')]: () => pdf(comCpf, 'in0_331_20241204.pdf'),
      [PDF_DA_IN('344')]: () => pdf('ilegivel', 'in2_344_20251010.pdf'),
    }),
    { banco },
  )
  assert.equal((await tratar(pedir({ fonte: 'ima_in' }))).status, 200)
  const [v0] = banco.versoesDa(chaveDaIn(0))
  assert.ok(v0?.texto?.includes(MARCADOR_DE_CPF))
  assert.equal(v0?.texto?.includes('123.456.789-09'), false)
  assert.equal(v0?.texto?.includes('004.XXX.XXX-61'), false)
  const [v2] = banco.versoesDa(chaveDaIn(2))
  assert.equal(v2?.texto, null)
  assert.match(v2?.sha256 ?? '', /^[0-9a-f]{64}$/)
})

Deno.test(
  '"(REVOGADA)" novo revoga a IN sem ato; a IN 84 revogada por portaria não volta',
  async () => {
    const banco = catalogoDasIns()
    const in12 = banco.norma(chaveDaIn(12))
    if (in12) in12.situacao_na_fonte = 'vigente'
    const { tratar } = montar(rotasDasIns(), { banco })
    const resposta = await tratar(pedir({ fonte: 'ima_in' }))
    assert.equal(resposta.status, 200)
    assert.ok(banco.chamadas.includes(`registrar_revogacao:${chaveDaIn(12)}:-`))
    assert.equal(banco.norma(chaveDaIn(12))?.situacao_na_fonte, 'revogada')
    assert.equal(banco.norma(chaveDaIn(84))?.situacao_na_fonte, 'revogada')
    assert.equal(
      banco.chamadas.some((c) => c.startsWith(`registrar_revogacao:${chaveDaIn(84)}`)),
      false,
    )
    assert.equal(banco.mudancas.filter((m) => m.tipo === 'revogada').length, 1)
  },
)

Deno.test(
  'página sem INs (formato mudou) marca a coleta como falhou e não grava versão',
  async () => {
    const banco = catalogoDasIns()
    const { tratar, log } = montar(rotasDasIns('<html><body>Manutenção</body></html>'), { banco })
    const resposta = await tratar(pedir({ fonte: 'ima_in' }))
    assert.equal(resposta.status, 502)
    const corpo = (await resposta.json()) as Record<string, unknown>
    assert.equal(corpo.erro, 'formato_inesperado')
    assert.equal(banco.coletas[0]?.situacao, 'falhou')
    assert.equal(banco.coletas[0]?.erro, 'formato_inesperado')
    assert.equal(banco.versoes.length, 0)
    assert.ok(log.every((linha) => !linha.includes(TOKEN)))
  },
)

Deno.test('RSS no lugar da página das INs vira conteudo_inesperado', async () => {
  const banco = catalogoDasIns()
  const { tratar } = montar(
    {
      [`GET ${IN}`]: () =>
        new Response('<rss/>', {
          headers: { 'Content-Type': 'application/rss+xml; charset=UTF-8' },
        }),
    },
    { banco },
  )
  const resposta = await tratar(pedir({ fonte: 'ima_in' }))
  assert.equal(resposta.status, 502)
  assert.equal(((await resposta.json()) as Record<string, unknown>).erro, 'conteudo_inesperado')
  assert.equal(banco.coletas[0]?.erro, 'conteudo_inesperado')
})

Deno.test('falha de um PDF não para os outros, mas marca a coleta para o alerta', async () => {
  const banco = catalogoDasIns()
  const { tratar } = montar(
    rotasDasIns(PAGINA_DAS_INS, { [PDF_DA_IN('344')]: () => html('fora do ar', 503) }),
    { banco },
  )
  const resposta = await tratar(pedir({ fonte: 'ima_in' }))
  assert.equal(resposta.status, 502)
  const corpo = (await resposta.json()) as Record<string, unknown>
  assert.equal(corpo.erro, 'http_503')
  assert.equal(corpo.itens_novos, 3)
  assert.equal(banco.versoes.length, 3)
  assert.equal(banco.coletas[0]?.situacao, 'falhou')
  assert.equal(banco.coletas[0]?.itens, 3)
})

Deno.test('mesmo arquivo de novo não vira versão nem mudança', async () => {
  const banco = catalogoDasIns()
  const um = montar(rotasDasIns(), { banco })
  await um.tratar(pedir({ fonte: 'ima_in' }))
  const dois = montar(rotasDasIns(), { banco })
  const resposta = await dois.tratar(pedir({ fonte: 'ima_in', janela: '2026-11-23' }))
  assert.equal(resposta.status, 200)
  assert.equal(((await resposta.json()) as Record<string, unknown>).itens_novos, 0)
  assert.equal(banco.versoes.length, 4)
  assert.deepEqual(
    dois.rede.chamadas.map((c) => c.url),
    [IN],
  )
})
