// Situação de uma linha da visão da equipe (EQ-03): calculada a partir de `dias` (prazo − hoje,
// com hoje no fuso da consultoria, calculado no banco), nunca gravada. Validade, limite de
// protocolo e atraso de demanda têm rótulos próprios; "sem responsável" não é situação.

export type TipoLinhaDePrazo = 'ocorrencia' | 'validade' | 'limite_protocolo'

/** Faixa do atraso: até 7 dias, de 8 a 30, mais de 30 (tons distintos na tela). */
export type FaixaDeAtraso = 'ate_7' | 'de_8_a_30' | 'mais_de_30'

export type SituacaoDoPrazo =
  | { tipo: 'atrasada'; dias: number; faixa: FaixaDeAtraso }
  | { tipo: 'em_conferencia' }
  | { tipo: 'hoje' }
  | { tipo: 'amanha' }
  | { tipo: 'em_dias'; dias: number }
  | { tipo: 'vencida'; dias: number }
  | { tipo: 'protocolo_atrasado'; dias: number }

export function faixaDeAtraso(diasDeAtraso: number): FaixaDeAtraso {
  if (diasDeAtraso <= 7) return 'ate_7'
  if (diasDeAtraso <= 30) return 'de_8_a_30'
  return 'mais_de_30'
}

/**
 * Situação de uma linha. Ocorrência em conferência mostra isso enquanto não atrasa; atrasada vale
 * mais que "em conferência" (o prazo oficial passou do mesmo jeito).
 */
export function situacaoDoPrazo(linha: {
  tipo: TipoLinhaDePrazo
  dias: number
  emConferencia?: boolean
}): SituacaoDoPrazo {
  const { tipo, dias } = linha
  if (dias < 0) {
    if (tipo === 'validade') return { tipo: 'vencida', dias: -dias }
    if (tipo === 'limite_protocolo') return { tipo: 'protocolo_atrasado', dias: -dias }
    return { tipo: 'atrasada', dias: -dias, faixa: faixaDeAtraso(-dias) }
  }
  if (tipo === 'ocorrencia' && linha.emConferencia) return { tipo: 'em_conferencia' }
  if (dias === 0) return { tipo: 'hoje' }
  if (dias === 1) return { tipo: 'amanha' }
  return { tipo: 'em_dias', dias }
}

/** Texto do selo (a cor nunca é o único sinal: o número de dias vai escrito). */
export function rotuloDaSituacaoDoPrazo(situacao: SituacaoDoPrazo): string {
  const dias = (n: number) => (n === 1 ? '1 dia' : `${String(n)} dias`)
  switch (situacao.tipo) {
    case 'atrasada':
      return `Atrasada ${dias(situacao.dias)}`
    case 'em_conferencia':
      return 'Em conferência'
    case 'hoje':
      return 'Hoje'
    case 'amanha':
      return 'Amanhã'
    case 'em_dias':
      return `Em ${dias(situacao.dias)}`
    case 'vencida':
      return `Vencida há ${dias(situacao.dias)}`
    case 'protocolo_atrasado':
      return `Protocolo atrasado ${dias(situacao.dias)}`
  }
}
