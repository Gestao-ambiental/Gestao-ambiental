// Vetores V1–V6 do ADR-0047: os mesmos de supabase/functions/_shared/ics.test.ts.
import { describe, expect, it } from 'vitest'

import type { DataCivil } from './data-civil'
import { dobrarLinhaIcs, escaparTextoIcs, gerarIcs } from './ics'

const AGORA = new Date('2026-11-20T10:30:00Z')
const UID = 'ocorrencia-11111111-1111-4111-8111-111111111111@gramaapp.com.br'

function octetos(texto: string): number {
  return new TextEncoder().encode(texto).length
}

describe('gerarIcs', () => {
  it('V1: calendário com um evento de dia inteiro, texto escapado e CRLF em toda linha', () => {
    expect(
      gerarIcs(
        [
          {
            uid: UID,
            data: '2026-12-01',
            resumo: 'C-01 · Metalúrgica Açores, Matriz; filial\\sul',
          },
        ],
        { nome: 'Grama', agora: AGORA },
      ),
    ).toBe(
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Grama//Prazos//PT-BR\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:Grama\r\nBEGIN:VEVENT\r\nUID:ocorrencia-11111111-1111-4111-8111-111111111111@gramaapp.com.br\r\nDTSTAMP:20261120T103000Z\r\nDTSTART;VALUE=DATE:20261201\r\nDTEND;VALUE=DATE:20261202\r\nSUMMARY:C-01 · Metalúrgica Açores\\, Matriz\\; filial\\\\sul\r\nTRANSP:TRANSPARENT\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n',
    )
  })

  it('V2: o fim do dia inteiro vira o ano', () => {
    const ics = gerarIcs([{ uid: UID, data: '2026-12-31', resumo: 'Prazo' }], {
      nome: 'Grama',
      agora: AGORA,
    })
    expect(ics).toContain('\r\nDTSTART;VALUE=DATE:20261231\r\n')
    expect(ics).toContain('\r\nDTEND;VALUE=DATE:20270101\r\n')
  })

  it('V6: URL sem escape de texto e dobrada em 75 octetos', () => {
    const ics = gerarIcs(
      [
        {
          uid: UID,
          data: '2026-12-01',
          resumo: 'Prazo',
          url: 'https://beta.gramaapp.com.br/ocorrencias/11111111-1111-4111-8111-111111111111',
        },
      ],
      { nome: 'Grama', agora: AGORA },
    )
    expect(ics).toContain(
      '\r\nURL:https://beta.gramaapp.com.br/ocorrencias/11111111-1111-4111-8111-111111\r\n 111111\r\nTRANSP:TRANSPARENT\r\n',
    )
  })

  it('descrição só quando há, escapada, entre o resumo e a URL', () => {
    const ics = gerarIcs(
      [
        {
          uid: UID,
          data: '2026-12-01',
          resumo: 'Prazo',
          descricao: 'Monitoramento\nLicença: LAO 1001/2024',
          url: 'https://x.test/a',
        },
        { uid: 'b@gramaapp.com.br', data: '2026-12-02', resumo: 'Outro', descricao: '' },
      ],
      { nome: 'Grama', agora: AGORA },
    )
    expect(ics).toContain(
      'SUMMARY:Prazo\r\nDESCRIPTION:Monitoramento\\nLicença: LAO 1001/2024\r\nURL:https://x.test/a\r\n',
    )
    expect(ics).toContain('SUMMARY:Outro\r\nTRANSP:TRANSPARENT\r\n')
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
  })

  it('lista vazia: calendário válido sem eventos', () => {
    expect(gerarIcs([], { nome: 'Grama', agora: AGORA })).toBe(
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Grama//Prazos//PT-BR\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:Grama\r\nEND:VCALENDAR\r\n',
    )
  })

  it('escapa o nome do calendário', () => {
    expect(gerarIcs([], { nome: 'Grama; Filtroville', agora: AGORA })).toContain(
      'X-WR-CALNAME:Grama\\; Filtroville\r\n',
    )
  })

  it('nenhuma linha física passa de 75 octetos, mesmo com acento', () => {
    const ics = gerarIcs(
      [{ uid: UID, data: '2026-12-01', resumo: 'Ação de órgão ambiental '.repeat(12) }],
      { nome: 'Grama', agora: AGORA },
    )
    for (const linha of ics.split('\r\n')) expect(octetos(linha)).toBeLessThanOrEqual(75)
  })

  it('recusa data inexistente ou fora do formato', () => {
    const opcoes = { nome: 'Grama', agora: AGORA }
    expect(() => gerarIcs([{ uid: UID, data: '2026-02-30', resumo: 'X' }], opcoes)).toThrow(
      'Data inválida no calendário.',
    )
    expect(() =>
      gerarIcs([{ uid: UID, data: '01/12/2026' as DataCivil, resumo: 'X' }], opcoes),
    ).toThrow('Data inválida no calendário.')
    expect(() => gerarIcs([], { nome: 'Grama', agora: new Date('x') })).toThrow(
      'Data inválida no calendário.',
    )
  })
})

describe('escaparTextoIcs', () => {
  it('V3: quebra de linha vira barra e n', () => {
    expect(escaparTextoIcs('Linha 1\nLinha 2')).toBe('Linha 1\\nLinha 2')
  })

  it('CRLF e CR também viram \\n; barra primeiro, depois ponto e vírgula e vírgula', () => {
    expect(escaparTextoIcs('a\r\nb\rc')).toBe('a\\nb\\nc')
    expect(escaparTextoIcs('a\\;b,c')).toBe('a\\\\\\;b\\,c')
  })

  it('tira os outros caracteres de controle', () => {
    expect(escaparTextoIcs('a\u0000b\tc\u001fd\u007fe')).toBe('abcde')
  })
})

describe('dobrarLinhaIcs', () => {
  it('V4: 80 octetos viram 75 + espaço + 5', () => {
    expect(dobrarLinhaIcs('X'.repeat(80))).toBe('X'.repeat(75) + '\r\n ' + 'X'.repeat(5))
  })

  it('V5: nunca parte um caractere de dois octetos', () => {
    expect(dobrarLinhaIcs('SUMMARY:' + 'ç'.repeat(40))).toBe(
      'SUMMARY:' + 'ç'.repeat(33) + '\r\n ' + 'ç'.repeat(7),
    )
  })

  it('linha de até 75 octetos fica como está; continuações levam até 74 octetos', () => {
    expect(dobrarLinhaIcs('X'.repeat(75))).toBe('X'.repeat(75))
    expect(dobrarLinhaIcs('X'.repeat(75 + 74 + 1))).toBe(
      'X'.repeat(75) + '\r\n ' + 'X'.repeat(74) + '\r\n ' + 'X',
    )
  })

  it('emoji (4 octetos, par substituto) não é partido', () => {
    const linha = 'X'.repeat(73) + '\u{1F600}'
    expect(dobrarLinhaIcs(linha)).toBe('X'.repeat(73) + '\r\n \u{1F600}')
  })
})
