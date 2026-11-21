import assert from 'node:assert/strict'

import {
  criarTratadorDoFeed,
  eventosDoFeed,
  hashDoToken,
  type LinhaDoFeed,
} from './feed-calendario.ts'

const TOKEN = 'a'.repeat(64)
const ID = '11111111-1111-4111-8111-111111111111'
const AGORA = new Date('2026-11-20T10:30:00Z')

const LINHAS: LinhaDoFeed[] = [
  {
    tipoLinha: 'ocorrencia',
    id: ID,
    prazo: '2026-12-01',
    codigo: 'C-01',
    empreendimentoNome: 'Metalúrgica Açores, Matriz',
  },
  {
    tipoLinha: 'exigencia',
    id: '22222222-2222-4222-8222-222222222222',
    prazo: '2026-12-02',
    codigo: null,
    empreendimentoNome: 'Padaria',
  },
]

function montar(resposta: LinhaDoFeed[] | null | 'erro' = LINHAS) {
  const hashes: string[] = []
  const log: string[] = []
  const tratar = criarTratadorDoFeed({
    env: (nome) => (nome === 'LINK_DO_BETA' ? 'https://beta.exemplo.test/' : undefined),
    feed: (hash) => {
      hashes.push(hash)
      if (resposta === 'erro') return Promise.reject(new Error('banco'))
      return Promise.resolve(resposta)
    },
    agora: () => AGORA,
    registrar: (l) => log.push(l),
  })
  return { tratar, hashes, log }
}

const url = (caminho: string) =>
  `https://projeto.exemplo.test/functions/v1/feed-calendario/${caminho}`

Deno.test('hash igual ao do banco (SHA-256 em hexadecimal)', async () => {
  assert.equal(
    await hashDoToken('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  )
})

Deno.test('devolve o .ics com eventos de dia inteiro e os cabeçalhos certos', async () => {
  const { tratar, hashes } = montar()
  const resposta = await tratar(new Request(url(`${TOKEN}.ics`)))
  assert.equal(resposta.status, 200)
  assert.equal(resposta.headers.get('Content-Type'), 'text/calendar; charset=utf-8')
  assert.equal(resposta.headers.get('Cache-Control'), 'private, max-age=900')
  assert.equal(resposta.headers.get('Content-Disposition'), 'inline; filename="grama.ics"')
  assert.equal(resposta.headers.get('X-Content-Type-Options'), 'nosniff')
  assert.deepEqual(hashes, [await hashDoToken(TOKEN)])
  const corpo = await resposta.text()
  assert.ok(corpo.startsWith('BEGIN:VCALENDAR\r\n'))
  assert.ok(corpo.includes('\r\nX-WR-CALNAME:Grama\r\n'))
  assert.ok(corpo.includes(`\r\nUID:ocorrencia-${ID}@gramaapp.com.br\r\n`))
  assert.ok(corpo.includes('\r\nDTSTAMP:20261120T103000Z\r\n'))
  assert.ok(corpo.includes('\r\nDTSTART;VALUE=DATE:20261201\r\nDTEND;VALUE=DATE:20261202\r\n'))
  assert.ok(corpo.includes('\r\nSUMMARY:C-01 · Metalúrgica Açores\\, Matriz\r\n'))
  assert.ok(corpo.includes('\r\nSUMMARY:Exigência · Padaria\r\n'))
  assert.ok(!corpo.includes('DESCRIPTION'))
})

Deno.test('URL do app só para ocorrência e exigência', () => {
  const eventos = eventosDoFeed(
    [
      ...LINHAS,
      {
        tipoLinha: 'vencimento',
        id: ID,
        prazo: '2026-12-03',
        codigo: null,
        empreendimentoNome: 'Padaria',
      },
    ],
    'https://beta.exemplo.test',
  )
  assert.deepEqual(
    eventos.map((e) => e.url),
    [
      `https://beta.exemplo.test/ocorrencias/${ID}`,
      'https://beta.exemplo.test/exigencias/22222222-2222-4222-8222-222222222222',
      null,
    ],
  )
  assert.equal(eventos[2]?.resumo, 'Vencimento · Padaria')
})

Deno.test('HEAD devolve os cabeçalhos sem corpo', async () => {
  const { tratar } = montar()
  const resposta = await tratar(new Request(url(`${TOKEN}.ics`), { method: 'HEAD' }))
  assert.equal(resposta.status, 200)
  assert.equal(resposta.headers.get('Content-Type'), 'text/calendar; charset=utf-8')
  assert.equal(await resposta.text(), '')
})

Deno.test('caminho fora do formato: 404 sem consultar o banco', async () => {
  const { tratar, hashes } = montar()
  for (const caminho of [
    TOKEN,
    `${'A'.repeat(64)}.ics`,
    `${TOKEN.slice(1)}.ics`,
    `${TOKEN}.ics/x`,
    '',
  ]) {
    const resposta = await tratar(new Request(url(caminho)))
    assert.equal(resposta.status, 404, caminho)
    assert.equal(await resposta.text(), 'Não encontrado')
  }
  assert.equal(hashes.length, 0)
})

Deno.test('token inválido no banco: o mesmo 404', async () => {
  const { tratar } = montar(null)
  const resposta = await tratar(new Request(url(`${TOKEN}.ics`)))
  assert.equal(resposta.status, 404)
  assert.equal(await resposta.text(), 'Não encontrado')
})

Deno.test('outro erro do banco: 500 sem o token no log', async () => {
  const { tratar, log } = montar('erro')
  const resposta = await tratar(new Request(url(`${TOKEN}.ics`)))
  assert.equal(resposta.status, 500)
  assert.deepEqual(
    log.map((l) => JSON.parse(l) as unknown),
    [{ etapa: 'feed', motivo: 'erro_interno' }],
  )
  assert.ok(!log.join('').includes(TOKEN))
})

Deno.test('outros métodos: 405', async () => {
  const { tratar, hashes } = montar()
  for (const metodo of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const resposta = await tratar(new Request(url(`${TOKEN}.ics`), { method: metodo }))
    assert.equal(resposta.status, 405, metodo)
  }
  assert.equal(hashes.length, 0)
})

Deno.test('calendário sem prazos: válido e sem eventos', async () => {
  const { tratar } = montar([])
  const corpo = await (await tratar(new Request(url(`${TOKEN}.ics`)))).text()
  assert.ok(corpo.endsWith('X-WR-CALNAME:Grama\r\nEND:VCALENDAR\r\n'))
})
