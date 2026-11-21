import assert from 'node:assert/strict'

import { dobrarLinhaIcs, escaparTextoIcs, gerarIcs } from './ics.ts'

// Vetores V1 a V6: os mesmos de packages/domain/src/ics.test.ts (ADR-0047).
const AGORA = new Date('2026-11-20T10:30:00Z')
const UID = 'ocorrencia-11111111-1111-4111-8111-111111111111@gramaapp.com.br'

Deno.test('V1: calendário com um evento de dia inteiro e texto escapado', () => {
  const ics = gerarIcs(
    [{ uid: UID, data: '2026-12-01', resumo: 'C-01 · Metalúrgica Açores, Matriz; filial\\sul' }],
    { nome: 'Grama', agora: AGORA },
  )
  assert.equal(
    ics,
    'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Grama//Prazos//PT-BR\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:Grama\r\nBEGIN:VEVENT\r\nUID:ocorrencia-11111111-1111-4111-8111-111111111111@gramaapp.com.br\r\nDTSTAMP:20261120T103000Z\r\nDTSTART;VALUE=DATE:20261201\r\nDTEND;VALUE=DATE:20261202\r\nSUMMARY:C-01 · Metalúrgica Açores\\, Matriz\\; filial\\\\sul\r\nTRANSP:TRANSPARENT\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n',
  )
})

Deno.test('V2: o fim do evento passa a virada do ano', () => {
  const ics = gerarIcs([{ uid: UID, data: '2026-12-31', resumo: 'X' }], {
    nome: 'Grama',
    agora: AGORA,
  })
  assert.ok(ics.includes('\r\nDTSTART;VALUE=DATE:20261231\r\n'))
  assert.ok(ics.includes('\r\nDTEND;VALUE=DATE:20270101\r\n'))
})

Deno.test('V3: quebra de linha vira \\n literal', () => {
  assert.equal(escaparTextoIcs('Linha 1\nLinha 2'), 'Linha 1\\nLinha 2')
  assert.equal(escaparTextoIcs('a\r\nb\rc'), 'a\\nb\\nc')
  assert.equal(escaparTextoIcs('a\tb\u0000c\u007f'), 'abc')
})

Deno.test('V4: dobra em 75 octetos, continuação com espaço', () => {
  assert.equal(dobrarLinhaIcs('X'.repeat(80)), 'X'.repeat(75) + '\r\n ' + 'X'.repeat(5))
  assert.equal(dobrarLinhaIcs('X'.repeat(75)), 'X'.repeat(75))
  // Continuação: o espaço conta, então cabem 74 octetos depois dele.
  assert.equal(
    dobrarLinhaIcs('X'.repeat(75 + 80)),
    'X'.repeat(75) + '\r\n ' + 'X'.repeat(74) + '\r\n ' + 'X'.repeat(6),
  )
})

Deno.test('V5: a dobra nunca parte um caractere multibyte', () => {
  assert.equal(
    dobrarLinhaIcs('SUMMARY:' + 'ç'.repeat(40)),
    'SUMMARY:' + 'ç'.repeat(33) + '\r\n ' + 'ç'.repeat(7),
  )
  const codificador = new TextEncoder()
  for (const linha of dobrarLinhaIcs('SUMMARY:' + '€'.repeat(60)).split('\r\n')) {
    assert.ok(codificador.encode(linha).length <= 75)
  }
})

Deno.test('V6: URL sem escape de texto, dobrada como as outras linhas', () => {
  const ics = gerarIcs(
    [
      {
        uid: UID,
        data: '2026-12-01',
        resumo: 'C-01 · Metalúrgica Açores',
        url: 'https://beta.gramaapp.com.br/ocorrencias/11111111-1111-4111-8111-111111111111',
      },
    ],
    { nome: 'Grama', agora: AGORA },
  )
  assert.ok(
    ics.includes(
      '\r\nURL:https://beta.gramaapp.com.br/ocorrencias/11111111-1111-4111-8111-111111\r\n 111111\r\nTRANSP:TRANSPARENT\r\n',
    ),
  )
})

Deno.test('lista vazia é um calendário válido sem eventos', () => {
  assert.equal(
    gerarIcs([], { nome: 'Grama', agora: AGORA }),
    'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Grama//Prazos//PT-BR\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:Grama\r\nEND:VCALENDAR\r\n',
  )
})

Deno.test('descrição escapada sai antes da URL; vazia ou nula não sai', () => {
  const ics = gerarIcs(
    [
      {
        uid: UID,
        data: '2026-12-01',
        resumo: 'A',
        descricao: 'Título\nLicença: LAO 1/2024',
        url: 'https://x.test/a',
      },
      { uid: 'b', data: '2026-12-02', resumo: 'B', descricao: '', url: null },
    ],
    { nome: 'Grama', agora: AGORA },
  )
  assert.ok(
    ics.includes(
      'SUMMARY:A\r\nDESCRIPTION:Título\\nLicença: LAO 1/2024\r\nURL:https://x.test/a\r\n',
    ),
  )
  assert.ok(ics.includes('SUMMARY:B\r\nTRANSP:TRANSPARENT\r\n'))
})

Deno.test('data inválida lança erro', () => {
  for (const data of ['2026-02-30', '01/12/2026', '2026-13-01', '']) {
    assert.throws(
      () => gerarIcs([{ uid: UID, data, resumo: 'X' }], { nome: 'Grama', agora: AGORA }),
      { message: 'Data inválida no calendário.' },
    )
  }
})
