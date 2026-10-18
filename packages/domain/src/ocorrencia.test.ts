import { describe, expect, it } from 'vitest'

import { dataForaDoCiclo, janelaDoCiclo, proximaAcao, situacaoExibida } from './ocorrencia'

describe('situação exibida da ocorrência (Protótipo 16)', () => {
  it('a fazer, devolvida, em conferência, aprovada e concluída', () => {
    expect(situacaoExibida('aberta', null)).toBe('a_fazer')
    expect(situacaoExibida('aberta', 'devolvida')).toBe('devolvida')
    expect(situacaoExibida('em_conferencia', 'em_conferencia')).toBe('em_conferencia')
    expect(situacaoExibida('em_conferencia', 'aprovada')).toBe('aprovada')
    expect(situacaoExibida('concluida', 'aprovada')).toBe('concluida')
  })

  it('reaberta depois de aprovada volta a "a fazer"', () => {
    expect(situacaoExibida('aberta', 'aprovada')).toBe('a_fazer')
  })
})

describe('próxima ação (DEM-02)', () => {
  const etapas = [
    { titulo: 'Coletar amostras', concluida: true },
    { titulo: 'Redigir o relatório', concluida: false },
  ]

  it('a fazer aponta a primeira etapa aberta; sem etapa aberta, enviar', () => {
    expect(proximaAcao('a_fazer', etapas)).toBe('Concluir a etapa “Redigir o relatório”')
    expect(proximaAcao('a_fazer', [])).toBe('Enviar a evidência para conferência')
  })

  it('conferência, correção, conclusão e nada pendente', () => {
    expect(proximaAcao('em_conferencia', etapas)).toBe('Conferir a evidência enviada')
    expect(proximaAcao('devolvida', etapas)).toBe('Corrigir e reenviar a evidência')
    expect(proximaAcao('aprovada', etapas)).toBe('Concluir a ocorrência')
    expect(proximaAcao('concluida', etapas)).toBe('Nada pendente')
  })
})

describe('janela do ciclo (DEM-09)', () => {
  it('do dia seguinte ao prazo anterior até o prazo deste ciclo', () => {
    const janela = janelaDoCiclo('2026-10-15', '2026-07-15', null)
    expect(janela).toEqual({ inicio: '2026-07-16', fim: '2026-10-15' })
    expect(dataForaDoCiclo('2026-09-30', janela)).toBe(false)
    expect(dataForaDoCiclo('2026-07-15', janela)).toBe(true)
    expect(dataForaDoCiclo('2026-10-16', janela)).toBe(true)
    expect(dataForaDoCiclo('2026-10-15', janela)).toBe(false)
  })

  it('primeiro ciclo começa na data de referência; sem ela, só o fim conta', () => {
    expect(janelaDoCiclo('2026-10-15', null, '2026-07-01')).toEqual({
      inicio: '2026-07-01',
      fim: '2026-10-15',
    })
    const semBase = janelaDoCiclo('2026-10-15', null, null)
    expect(dataForaDoCiclo('2020-01-01', semBase)).toBe(false)
    expect(dataForaDoCiclo('2026-10-20', semBase)).toBe(true)
  })
})
