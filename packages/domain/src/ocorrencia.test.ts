import { describe, expect, it } from 'vitest'

import {
  avisoForaDoCiclo,
  dataForaDoCiclo,
  distanciaEmDias,
  estaAtrasada,
  janelaDoCiclo,
  partesDoComentario,
  pendenciasDoEnvio,
  proximaAcao,
  resumoDoEnvio,
  rotuloDoCiclo,
  rotuloDoDia,
  secaoDaOcorrencia,
  situacaoExibida,
  textoDaPendencia,
  validarDataDeExecucao,
  validarDataFutura,
} from './ocorrencia'

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

describe('envio cancelado (Tela 16 v2)', () => {
  it('cancelar volta para "a fazer", mesmo depois de uma devolução anterior', () => {
    expect(situacaoExibida('aberta', 'cancelada')).toBe('a_fazer')
  })
})

describe('validação da data de execução (DEM-09)', () => {
  const hoje = '2026-11-05'
  const janela = { inicio: '2026-10-01', fim: '2026-12-31' } as const

  it('data válida, no passado ou hoje, dentro do ciclo', () => {
    expect(validarDataDeExecucao('03/11/2026', hoje, janela, true)).toEqual({
      data: '2026-11-03',
      erro: null,
      foraDoCiclo: false,
    })
    expect(validarDataDeExecucao('05/11/2026', hoje, janela, true).erro).toBeNull()
  })

  it('aceita a data colada no formato aaaa-mm-dd', () => {
    expect(validarDataDeExecucao('2026-11-03', hoje, janela, false).data).toBe('2026-11-03')
  })

  it('data futura não é permitida', () => {
    expect(validarDataDeExecucao('06/11/2026', hoje, janela, false)).toEqual({
      data: null,
      erro: 'futura',
      foraDoCiclo: false,
    })
  })

  it('data inexistente é inválida assim que está completa', () => {
    expect(validarDataDeExecucao('31/02/2026', hoje, janela, false).erro).toBe('invalida')
  })

  it('incompleta ou vazia só acusa depois de exigir (tentar enviar ou sair do campo)', () => {
    expect(validarDataDeExecucao('03/11', hoje, janela, false).erro).toBeNull()
    expect(validarDataDeExecucao('03/11', hoje, janela, true).erro).toBe('invalida')
    expect(validarDataDeExecucao('', hoje, janela, false).erro).toBeNull()
    expect(validarDataDeExecucao('  ', hoje, janela, true).erro).toBe('obrigatoria')
  })

  it('fora do ciclo só avisa, não bloqueia', () => {
    const resultado = validarDataDeExecucao('20/09/2026', hoje, janela, true)
    expect(resultado).toEqual({ data: '2026-09-20', erro: null, foraDoCiclo: true })
    expect(avisoForaDoCiclo(janela)).toBe('Fora do ciclo (01/10 a 31/12/2026)')
    expect(avisoForaDoCiclo({ inicio: null, fim: '2026-12-31' })).toBe(
      'Fora do ciclo (até 31/12/2026)',
    )
  })

  it('sem janela conhecida, nunca avisa fora do ciclo (ocorrência atrasada pode ter data antiga)', () => {
    expect(validarDataDeExecucao('20/09/2020', hoje, null, true).foraDoCiclo).toBe(false)
  })
})

describe('novo prazo e nova meta (Regularizar)', () => {
  it('precisam ser depois de hoje', () => {
    expect(validarDataFutura('06/11/2026', '2026-11-05', true)).toEqual({
      data: '2026-11-06',
      erro: null,
    })
    expect(validarDataFutura('05/11/2026', '2026-11-05', true).erro).toBe('passada')
    expect(validarDataFutura('', '2026-11-05', true).erro).toBe('obrigatoria')
    expect(validarDataFutura('', '2026-11-05', false).erro).toBeNull()
    expect(validarDataFutura('32/12/2026', '2026-11-05', false).erro).toBe('invalida')
  })
})

describe('pendência do envio para conferência', () => {
  it('lista só o que falta, na ordem dos campos', () => {
    expect(pendenciasDoEnvio({ arquivos: 0, dataValida: false })).toEqual([
      'arquivos',
      'data de execução',
    ])
    expect(pendenciasDoEnvio({ arquivos: 2, dataValida: false })).toEqual(['data de execução'])
    expect(pendenciasDoEnvio({ arquivos: 0, dataValida: true })).toEqual(['arquivos'])
    expect(pendenciasDoEnvio({ arquivos: 1, dataValida: true })).toEqual([])
  })

  it('texto da pendência ou pronto para enviar', () => {
    expect(textoDaPendencia(['arquivos', 'data de execução'])).toBe(
      'Pendente: arquivos, data de execução',
    )
    expect(textoDaPendencia([])).toBe('Pronto para enviar')
  })
})

describe('atrasada e seção da ocorrência', () => {
  it('atrasada quando o prazo atual passou e não está concluída', () => {
    expect(estaAtrasada('2020-09-20', '2026-11-05', 'aberta')).toBe(true)
    expect(estaAtrasada('2020-09-20', '2026-11-05', 'em_conferencia')).toBe(true)
    expect(estaAtrasada('2020-09-20', '2026-11-05', 'concluida')).toBe(false)
    expect(estaAtrasada('2026-11-05', '2026-11-05', 'aberta')).toBe(false)
  })

  it('Regularizar substitui a evidência só quando há algo a fazer e está atrasada', () => {
    expect(secaoDaOcorrencia('a_fazer', false)).toBe('evidencia')
    expect(secaoDaOcorrencia('devolvida', false)).toBe('evidencia')
    expect(secaoDaOcorrencia('a_fazer', true)).toBe('regularizar')
    expect(secaoDaOcorrencia('devolvida', true)).toBe('regularizar')
    expect(secaoDaOcorrencia('em_conferencia', true)).toBe('conferencia')
    expect(secaoDaOcorrencia('aprovada', false)).toBe('conferencia')
    expect(secaoDaOcorrencia('concluida', true)).toBe('concluida')
  })
})

describe('textos da tela', () => {
  it('distância em dias até o prazo', () => {
    expect(distanciaEmDias('2026-11-30', '2026-11-05')).toBe('em 25 dias')
    expect(distanciaEmDias('2026-11-05', '2026-11-05')).toBe('hoje')
    expect(distanciaEmDias('2026-11-06', '2026-11-05')).toBe('amanhã')
    expect(distanciaEmDias('2026-11-04', '2026-11-05')).toBe('há 1 dia')
    expect(distanciaEmDias('2020-09-20', '2026-11-05')).toBe('há 2237 dias')
  })

  it('rótulo do ciclo pela recorrência', () => {
    expect(rotuloDoCiclo('trimestral', '2026-11-30', 4)).toBe('4º tri 2026')
    expect(rotuloDoCiclo('trimestral', '2026-01-10', 1)).toBe('1º tri 2026')
    expect(rotuloDoCiclo('semestral', '2026-07-01', 2)).toBe('2º sem 2026')
    expect(rotuloDoCiclo('anual', '2027-03-31', 2)).toBe('2027')
    expect(rotuloDoCiclo('unica', '2020-09-20', 1)).toBe('Ciclo 1')
    expect(rotuloDoCiclo('mensal', '2026-11-30', 7)).toBe('Ciclo 7')
  })

  it('resumo do envio aprovado do ciclo anterior', () => {
    const pdf = { mime: 'application/pdf' }
    const foto = { mime: 'image/jpeg' }
    expect(resumoDoEnvio([pdf, foto, foto, foto, foto])).toBe('1 PDF + 4 fotos')
    expect(resumoDoEnvio([pdf, pdf])).toBe('2 PDFs')
    expect(resumoDoEnvio([foto])).toBe('1 foto')
  })

  it('separador de dia do feed', () => {
    expect(rotuloDoDia('2026-11-05')).toBe('quinta-feira, 5 de novembro')
    expect(rotuloDoDia('2026-11-04')).toBe('quarta-feira, 4 de novembro')
  })

  it('menções no comentário', () => {
    expect(
      partesDoComentario('@Bruno Kist a Limpatec confirmou. @Ana', ['Bruno Kist', 'Bruno']),
    ).toEqual([
      { tipo: 'mencao', nome: 'Bruno Kist' },
      { tipo: 'texto', texto: ' a Limpatec confirmou. @Ana' },
    ])
    expect(partesDoComentario('sem menção', [])).toEqual([{ tipo: 'texto', texto: 'sem menção' }])
  })
})
