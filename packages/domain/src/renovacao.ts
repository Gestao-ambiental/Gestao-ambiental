// Renovação de LAO. Portado de dist/domain.js do protótipo
// (LAO_PROTOCOL_LEAD_DAYS, DEFAULT_RENEWAL_PLANNING_LEAD_DAYS, renewalPlanningLeadDays,
// laoRenewalDates, laoRenewalSteps).
//
// Regra: o pedido de renovação da LAO tem de ser protocolado até 120 dias corridos antes do
// vencimento (limite de protocolo, fixo). A preparação começa `antecedência` dias antes desse limite
// (padrão 30). Mudar a antecedência move só o início da preparação, nunca o limite.

import { adicionarDias, type DataCivil } from './data-civil'

/** Dias corridos entre o limite de protocolo e o vencimento da LAO. Protótipo: `LAO_PROTOCOL_LEAD_DAYS`. */
export const DIAS_LIMITE_PROTOCOLO_LAO = 120

/** Antecedência padrão da preparação. Protótipo: `DEFAULT_RENEWAL_PLANNING_LEAD_DAYS`. */
export const ANTECEDENCIA_PREPARACAO_PADRAO_DIAS = 30

/**
 * Normaliza a antecedência configurada: inteiro ≥ 0; vazio ou inválido cai no padrão (30).
 * Protótipo: `renewalPlanningLeadDays`.
 */
export function antecedenciaPreparacao(valor: number | string | null | undefined): number {
  if (valor === null || valor === undefined || valor === '')
    return ANTECEDENCIA_PREPARACAO_PADRAO_DIAS
  const numero = Number(valor)
  return Number.isInteger(numero) && numero >= 0 ? numero : ANTECEDENCIA_PREPARACAO_PADRAO_DIAS
}

/** Protótipo: `{ planningLeadDays, planningStart, protocolDue }`. */
export interface DatasRenovacaoLao {
  /** Protótipo: `planningLeadDays` */
  antecedenciaDias: number
  /** Protótipo: `planningStart` = limite de protocolo − antecedência */
  inicioPreparacao: DataCivil
  /** Protótipo: `protocolDue` = vencimento − 120 dias */
  limiteProtocolo: DataCivil
}

/** Limite de protocolo e início da preparação a partir do vencimento. Protótipo: `laoRenewalDates`. */
export function datasRenovacaoLao(
  vencimento: DataCivil,
  antecedencia: number | string | null | undefined = ANTECEDENCIA_PREPARACAO_PADRAO_DIAS,
): DatasRenovacaoLao {
  const antecedenciaDias = antecedenciaPreparacao(antecedencia)
  const limiteProtocolo = adicionarDias(vencimento, -DIAS_LIMITE_PROTOCOLO_LAO)
  return {
    antecedenciaDias,
    inicioPreparacao: adicionarDias(limiteProtocolo, -antecedenciaDias),
    limiteProtocolo,
  }
}

/** Protótipo: `{ title, due, done }`. */
export interface EtapaRenovacaoLao {
  titulo: string
  prazo: DataCivil
  concluida: boolean
}

/**
 * Etapas internas da renovação, distribuídas entre o início da preparação e o limite de protocolo.
 * Antecedência 0 → 1 etapa; 1 → 2; até 29 → 3; 30 ou mais → 4. A última vence no limite de protocolo.
 * Protótipo: `laoRenewalSteps`.
 */
export function etapasRenovacaoLao(
  vencimento: DataCivil,
  antecedencia: number | string | null | undefined = ANTECEDENCIA_PREPARACAO_PADRAO_DIAS,
): EtapaRenovacaoLao[] {
  const { antecedenciaDias, limiteProtocolo } = datasRenovacaoLao(vencimento, antecedencia)
  const quantidade =
    antecedenciaDias === 0 ? 1 : antecedenciaDias === 1 ? 2 : antecedenciaDias < 30 ? 3 : 4
  const titulos =
    quantidade === 4
      ? [
          'Abrir preparação da renovação',
          'Reunir laudos, ARTs e documentos',
          'Conferir documentação',
          'Protocolar pedido de renovação',
        ]
      : quantidade === 3
        ? [
            'Abrir preparação da renovação',
            'Conferir documentação',
            'Protocolar pedido de renovação',
          ]
        : quantidade === 2
          ? ['Abrir preparação da renovação', 'Protocolar pedido de renovação']
          : ['Protocolar pedido de renovação']
  return titulos.map((titulo, indice) => {
    const diasAntesDoLimite =
      quantidade === 1
        ? 0
        : Math.round((antecedenciaDias * (quantidade - indice - 1)) / (quantidade - 1))
    return { titulo, prazo: adicionarDias(limiteProtocolo, -diasAntesDoLimite), concluida: false }
  })
}
