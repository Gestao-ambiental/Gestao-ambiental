// Renovação de LAO. Portado de dist/domain.js do protótipo
// (LAO_PROTOCOL_LEAD_DAYS, DEFAULT_RENEWAL_PLANNING_LEAD_DAYS, renewalPlanningLeadDays,
// laoRenewalDates, laoRenewalSteps).
//
// Regra: o pedido de renovação da LAO tem de ser protocolado até 120 dias corridos antes do
// vencimento (limite de protocolo, fixo). A preparação começa `antecedência` dias antes desse limite
// (padrão 30). Mudar a antecedência move só o início da preparação, nunca o limite.

import { adicionarDias, diferencaEmDias, formatarDataCivil, type DataCivil } from './data-civil'

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

/**
 * Limite de protocolo e início da preparação a partir do vencimento. Protótipo: `laoRenewalDates`.
 * `diasLimite` vem do snapshot do plano (120 hoje): mudar a regra não reescreve planos antigos.
 */
export function datasRenovacaoLao(
  vencimento: DataCivil,
  antecedencia: number | string | null | undefined = ANTECEDENCIA_PREPARACAO_PADRAO_DIAS,
  diasLimite: number = DIAS_LIMITE_PROTOCOLO_LAO,
): DatasRenovacaoLao {
  const antecedenciaDias = antecedenciaPreparacao(antecedencia)
  const limiteProtocolo = adicionarDias(vencimento, -diasLimite)
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
  diasLimite: number = DIAS_LIMITE_PROTOCOLO_LAO,
): EtapaRenovacaoLao[] {
  const { antecedenciaDias, limiteProtocolo } = datasRenovacaoLao(
    vencimento,
    antecedencia,
    diasLimite,
  )
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

/** A partir de quantos dias antes do limite o radar avisa "Protocolo em N dias" (como "próximos 7"). */
export const DIAS_AVISO_PROTOCOLO = 7

/** Situação de uma renovação no radar (EQ-05). Calculada, nunca gravada. */
export type SituacaoDaRenovacao =
  | { tipo: 'protocolada'; em: DataCivil; noPrazo: boolean }
  | { tipo: 'vencida'; dias: number }
  | { tipo: 'protocolo_atrasado'; dias: number }
  | { tipo: 'protocolo_proximo'; dias: number }
  | { tipo: 'em_preparacao'; desde: DataCivil }
  | { tipo: 'preparacao_futura'; inicio: DataCivil }

/**
 * Protocolada vale mais que tudo (e diz se foi até o limite). Sem protocolo: licença vencida,
 * limite passado, limite em até 7 dias, preparação em curso ou ainda por começar.
 * Protocolar não prorroga a licença: "protocolada" não muda a validade.
 */
export function situacaoDaRenovacao(entrada: {
  vencimento: DataCivil
  antecedencia: number
  diasLimite?: number
  protocoladoEm: DataCivil | null
  hoje: DataCivil
}): SituacaoDaRenovacao {
  const { inicioPreparacao, limiteProtocolo } = datasRenovacaoLao(
    entrada.vencimento,
    entrada.antecedencia,
    entrada.diasLimite,
  )
  if (entrada.protocoladoEm) {
    return {
      tipo: 'protocolada',
      em: entrada.protocoladoEm,
      noPrazo: entrada.protocoladoEm <= limiteProtocolo,
    }
  }
  if (entrada.hoje > entrada.vencimento) {
    return { tipo: 'vencida', dias: diferencaEmDias(entrada.hoje, entrada.vencimento) }
  }
  const diasAteLimite = diferencaEmDias(limiteProtocolo, entrada.hoje)
  if (diasAteLimite < 0) return { tipo: 'protocolo_atrasado', dias: -diasAteLimite }
  if (diasAteLimite <= DIAS_AVISO_PROTOCOLO)
    return { tipo: 'protocolo_proximo', dias: diasAteLimite }
  if (entrada.hoje >= inicioPreparacao) return { tipo: 'em_preparacao', desde: inicioPreparacao }
  return { tipo: 'preparacao_futura', inicio: inicioPreparacao }
}

/** Texto do selo (Protótipo 17): o número de dias ou a data vão escritos, nunca só a cor. */
export function rotuloDaSituacaoDaRenovacao(situacao: SituacaoDaRenovacao): string {
  const dias = (n: number) => (n === 1 ? '1 dia' : `${String(n)} dias`)
  const diaMes = (data: DataCivil) => formatarDataCivil(data).slice(0, 5)
  switch (situacao.tipo) {
    case 'protocolada':
      return situacao.noPrazo ? 'Protocolada' : 'Protocolada após o limite'
    case 'vencida':
      return `Vencida há ${dias(situacao.dias)}`
    case 'protocolo_atrasado':
      return `Protocolo atrasado ${dias(situacao.dias)}`
    case 'protocolo_proximo':
      if (situacao.dias === 0) return 'Protocolo hoje'
      if (situacao.dias === 1) return 'Protocolo amanhã'
      return `Protocolo em ${dias(situacao.dias)}`
    case 'em_preparacao':
      return `Em preparação · ${diaMes(situacao.desde)}`
    case 'preparacao_futura':
      return `Preparação a partir de ${diaMes(situacao.inicio)}`
  }
}
