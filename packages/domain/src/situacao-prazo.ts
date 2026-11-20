// Situação de uma linha da visão da equipe (EQ-03): calculada a partir de `dias` (prazo − hoje,
// com hoje no fuso da consultoria, calculado no banco), nunca gravada. Validade, limite de
// protocolo e atraso de demanda têm rótulos próprios; "sem responsável" não é situação.

/**
 * Tipos de linha das fontes de prazo (private.linhas_de_prazo). Exigência (do órgão, com
 * responsável) e vencimento (sem responsável) chegam com o P3 e o P4; até lá as fontes vêm vazias.
 */
export type TipoLinhaDePrazo =
  'ocorrencia' | 'validade' | 'limite_protocolo' | 'exigencia' | 'vencimento'

export const TIPOS_LINHA_DE_PRAZO: readonly TipoLinhaDePrazo[] = [
  'ocorrencia',
  'validade',
  'limite_protocolo',
  'exigencia',
  'vencimento',
]

/** Nome do tipo de linha, como a tela escreve (a cor nunca é o único sinal do tipo). */
export const ROTULO_DO_TIPO_DE_LINHA: Readonly<Record<TipoLinhaDePrazo, string>> = {
  ocorrencia: 'Condicionante',
  validade: 'Validade',
  limite_protocolo: 'Limite de protocolo',
  exigencia: 'Exigência',
  vencimento: 'Vencimento',
}

/**
 * Ponto único que diz quais tipos aceitam a ação Atribuir na tela. Só a ocorrência no P0; o P3
 * acrescenta 'exigencia' junto com a RPC atribuir_exigencia. (O banco já conta exigência sem
 * responsável em "sem responsável": private.tipo_linha_tem_responsavel.)
 */
export const TIPOS_COM_RESPONSAVEL: readonly TipoLinhaDePrazo[] = ['ocorrencia']

export function tipoAceitaResponsavel(tipo: TipoLinhaDePrazo): boolean {
  return TIPOS_COM_RESPONSAVEL.includes(tipo)
}

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

/** Como o tipo atrasa: demanda com responsável atrasa; validade e vencimento vencem. */
function situacaoDoAtraso(tipo: TipoLinhaDePrazo, diasDeAtraso: number): SituacaoDoPrazo {
  switch (tipo) {
    case 'validade':
    case 'vencimento':
      return { tipo: 'vencida', dias: diasDeAtraso }
    case 'limite_protocolo':
      return { tipo: 'protocolo_atrasado', dias: diasDeAtraso }
    case 'ocorrencia':
    case 'exigencia':
      return { tipo: 'atrasada', dias: diasDeAtraso, faixa: faixaDeAtraso(diasDeAtraso) }
  }
}

/**
 * Situação de uma linha. Ocorrência em conferência mostra isso enquanto não atrasa; atrasada vale
 * mais que "em conferência" (o prazo oficial passou do mesmo jeito). Exigência segue a ocorrência
 * (prazo com responsável, sem conferência); vencimento segue a validade.
 */
export function situacaoDoPrazo(linha: {
  tipo: TipoLinhaDePrazo
  dias: number
  emConferencia?: boolean
}): SituacaoDoPrazo {
  const { tipo, dias } = linha
  if (dias < 0) return situacaoDoAtraso(tipo, -dias)
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
      return `Prazo de protocolo vencido há ${dias(situacao.dias)}`
  }
}
