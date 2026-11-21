import { afterEach, describe, expect, it, vi } from 'vitest'

import type { EventoDoCalendario } from '@/lib/api/prazos'
import type { PrazoDeObrigacaoNoCalendario } from '@/lib/api/residuos'

import {
  eventoIcsDoCalendario,
  eventoIcsDoResiduo,
  eventosIcsDoRecorte,
  exportarIcs,
  nomeDoArquivoIcs,
} from './exportar-ics'

function evento(extra: Partial<EventoDoCalendario> = {}): EventoDoCalendario {
  return {
    tipo: 'prazo',
    data: '2026-12-01',
    id: 'o1',
    codigo: '4.2',
    titulo: 'Relatório de efluentes',
    empreendimentoNome: 'Metalúrgica Açores',
    unidadeNome: 'Matriz',
    licenca: 'LAO 4821/2023',
    responsavelNome: 'Bruno Kist',
    semResponsavel: false,
    ...extra,
  }
}

const residuo: PrazoDeObrigacaoNoCalendario = {
  obrigacaoId: 'ob1',
  empreendimentoId: 'e1',
  empreendimentoNome: 'Metalúrgica Açores',
  tipo: 'dmr_trimestral',
  referencia: '4º trimestre de 2026',
  inicio: '2027-01-01',
  prazo: '2027-01-30',
  dias: 60,
  observacao: null,
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('exportar .ics do calendário', () => {
  it('prazo oficial: uid da ocorrência, código · empreendimento e descrição em linhas', () => {
    expect(eventoIcsDoCalendario(evento())).toEqual({
      uid: 'ocorrencia-o1@gramaapp.com.br',
      data: '2026-12-01',
      resumo: '4.2 · Metalúrgica Açores',
      descricao: 'Relatório de efluentes\nLicença: LAO 4821/2023\nResponsável: Bruno Kist',
    })
  })

  it('sem código usa o rótulo do tipo; sem empreendimento usa o título; omite o que falta', () => {
    expect(
      eventoIcsDoCalendario(
        evento({
          tipo: 'validade',
          id: 'i9',
          codigo: null,
          empreendimentoNome: '',
          titulo: 'Validade LAO 1/2020',
          licenca: null,
          responsavelNome: null,
          semResponsavel: true,
        }),
      ),
    ).toEqual({
      uid: 'validade-i9@gramaapp.com.br',
      data: '2026-12-01',
      resumo: 'Validade · Validade LAO 1/2020',
      descricao: 'Validade LAO 1/2020',
    })
    expect(eventoIcsDoCalendario(evento({ tipo: 'tarefa', id: 't1', codigo: null })).uid).toBe(
      'tarefa-t1@gramaapp.com.br',
    )
  })

  it('resíduo: o dia entra no uid (a obrigação tem vários prazos)', () => {
    expect(eventoIcsDoResiduo(residuo)).toEqual({
      uid: 'residuo-ob1-2027-01-30@gramaapp.com.br',
      data: '2027-01-30',
      resumo: 'DMR trimestral · Metalúrgica Açores',
      descricao: '4º trimestre de 2026',
    })
  })

  it('só o período visível, em ordem de data', () => {
    const recorte = eventosIcsDoRecorte(
      [
        evento({ id: 'b', data: '2026-12-10' }),
        evento({ id: 'a', data: '2026-12-02' }),
        evento({ id: 'fora', data: '2027-02-01' }),
      ],
      [{ ...residuo, prazo: '2026-12-02' }],
      '2026-12-01',
      '2026-12-31',
    )
    expect(recorte.map((e) => e.uid)).toEqual([
      'ocorrencia-a@gramaapp.com.br',
      'residuo-ob1-2026-12-02@gramaapp.com.br',
      'ocorrencia-b@gramaapp.com.br',
    ])
  })

  it('nome do arquivo com o período', () => {
    expect(nomeDoArquivoIcs('2026-12-01', '2026-12-31')).toBe(
      'grama-calendario-2026-12-01-a-2026-12-31.ics',
    )
  })

  it('baixa um text/calendar com o nome do período', async () => {
    let arquivo: Blob | null = null
    URL.createObjectURL = vi.fn((blob: Blob) => {
      arquivo = blob
      return 'blob:ics'
    })
    URL.revokeObjectURL = vi.fn()
    const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('grama-calendario-2026-12-01-a-2026-12-31.ics')
      expect(this.getAttribute('href')).toBe('blob:ics')
    })

    exportarIcs(
      [eventoIcsDoCalendario(evento())],
      '2026-12-01',
      '2026-12-31',
      new Date('2026-11-20T10:30:00Z'),
    )

    expect(clique).toHaveBeenCalledOnce()
    const baixado = arquivo as Blob | null
    expect(baixado?.type).toBe('text/calendar;charset=utf-8')
    const texto = await baixado?.text()
    expect(texto).toContain('SUMMARY:4.2 · Metalúrgica Açores\r\n')
    // Linha longa: dobrada em 75 octetos (a continuação começa com espaço).
    expect(texto).toContain(
      'DESCRIPTION:Relatório de efluentes\\nLicença: LAO 4821/2023\\nResponsável:\r\n  Bruno Kist\r\n',
    )
    expect(texto).toContain('DTSTART;VALUE=DATE:20261201\r\n')
    expect(document.querySelector('a[download]')).toBeNull()
  })
})
