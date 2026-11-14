// Indicadores de valor, etapas 2 e 3 (ADR-0027): horas devolvidas à equipe e resumo do mês.
// O front mede o tempo ativo de cada tarefa e grava um evento por tarefa (registrar_tarefa); o
// banco repete este cálculo (private.horas_poupadas_em, migration 20261114190000_tempo_poupado.sql)
// para as RPCs da central e do resumo do mês. Aqui ficam as regras, os limiares e os rótulos.

import { adicionarMeses, diferencaEmDias, type DataCivil } from './data-civil'
import { inicioDoMes } from './carga-da-equipe'

/** Conta como tempo ativo: aba visível e alguma tecla, clique ou rolagem nos últimos 2 minutos. */
export const JANELA_DE_INTERACAO_SEGUNDOS = 120
/** O tempo na área de licenças e prazos é gravado em blocos de no máximo 30 minutos. */
export const BLOCO_DE_ACOMPANHAMENTO_SEGUNDOS = 30 * 60
/** Com 5 condicionantes digitadas medidas, vale o tempo medido no lugar do declarado. */
export const CONDICIONANTES_MANUAIS_PARA_MEDIR = 5
/** Nada aparece antes de 30 dias desde a primeira tarefa registrada… */
export const DIAS_PARA_MOSTRAR_HORAS = 30
/** …ou antes de 10 condicionantes cadastradas (com IA ou à mão). */
export const CONDICIONANTES_PARA_MOSTRAR_HORAS = 10
/** A Gestão responde de novo a linha de base quando a última tem mais de 90 dias. */
export const DIAS_DE_VALIDADE_DA_LINHA_DE_BASE = 90
/** "Responder depois" adia o diálogo por 7 dias (por pessoa, no navegador). */
export const DIAS_PARA_ADIAR_LINHA_DE_BASE = 7
/** Meses no seletor do resumo do mês (o atual e os 5 anteriores). */
export const MESES_DO_RESUMO = 6

export const TIPOS_DE_TAREFA = [
  'cadastro_licenca_ia',
  'cadastro_condicionante_manual',
  'acompanhamento',
  'orcamento',
] as const
export type TipoDeTarefa = (typeof TIPOS_DE_TAREFA)[number]

const DIA_MS = 24 * 60 * 60 * 1000

/** Este instante conta como tempo ativo? (`ultimaInteracaoMs` nulo = nenhuma interação ainda) */
export function contaComoTempoAtivo(
  agoraMs: number,
  ultimaInteracaoMs: number | null,
  abaVisivel: boolean,
): boolean {
  return (
    abaVisivel &&
    ultimaInteracaoMs !== null &&
    agoraMs - ultimaInteracaoMs <= JANELA_DE_INTERACAO_SEGUNDOS * 1000
  )
}

function segmentos(caminho: string): string[] {
  return (caminho.split(/[?#]/, 1)[0] ?? '').split('/').filter((s) => s !== '')
}

/**
 * Área de acompanhamento de licenças e prazos: visão da equipe, calendário, acompanhamentos,
 * empreendimentos, ocorrência e plano de renovação. O cadastro de licença fica fora (é medido
 * como cadastro).
 */
export function ehRotaDeAcompanhamento(caminho: string): boolean {
  const [primeiro] = segmentos(caminho)
  return (
    primeiro === undefined ||
    ['calendario', 'acompanhamentos', 'empreendimentos', 'ocorrencias', 'renovacoes'].includes(
      primeiro,
    )
  )
}

/** Respostas da Gestão às 4 perguntas da linha de base. */
export interface LinhaDeBase {
  licencasAtivas: number
  horasSemanaConferindo: number
  minutosPorCondicionante: number
  surpresasPorMes: number
}

/**
 * Mostra o diálogo da linha de base? Sem resposta ou com a última há mais de 90 dias, desde que a
 * pessoa não tenha adiado até depois de agora.
 */
export function precisaResponderLinhaDeBase(
  ultimaRespostaEm: string | null,
  agora: Date,
  adiadaAte: string | null,
): boolean {
  if (adiadaAte !== null && new Date(adiadaAte).getTime() > agora.getTime()) return false
  if (ultimaRespostaEm === null) return true
  return (
    agora.getTime() - new Date(ultimaRespostaEm).getTime() >
    DIAS_DE_VALIDADE_DA_LINHA_DE_BASE * DIA_MS
  )
}

/** Até quando "Responder depois" adia o diálogo. */
export function adiarLinhaDeBase(agora: Date): string {
  return new Date(agora.getTime() + DIAS_PARA_ADIAR_LINHA_DE_BASE * DIA_MS).toISOString()
}

/** Respostas válidas: números inteiros e não negativos (as horas aceitam meia hora), com teto. */
export function errosDaLinhaDeBase(
  respostas: Record<keyof LinhaDeBase, string>,
): Partial<Record<keyof LinhaDeBase, string>> {
  const erros: Partial<Record<keyof LinhaDeBase, string>> = {}
  const limites: Record<keyof LinhaDeBase, [number, boolean]> = {
    licencasAtivas: [100000, true],
    horasSemanaConferindo: [168, false],
    minutosPorCondicionante: [1440, true],
    surpresasPorMes: [1000, true],
  }
  for (const [campo, [maximo, inteiro]] of Object.entries(limites) as [
    keyof LinhaDeBase,
    [number, boolean],
  ][]) {
    const texto = respostas[campo].trim().replace(',', '.')
    const numero = Number(texto)
    if (texto === '' || !Number.isFinite(numero)) erros[campo] = 'Informe um número'
    else if (numero < 0 || numero > maximo) erros[campo] = `Use um número de 0 a ${String(maximo)}`
    else if (inteiro && !Number.isInteger(numero)) erros[campo] = 'Use um número inteiro'
  }
  return erros
}

/**
 * Semanas do mês que contam para o acompanhamento declarado: dias do mês ÷ 7; no mês atual, só os
 * dias até hoje (inclusive).
 */
export function semanasParaAcompanhamento(mes: DataCivil, hoje: DataCivil): number {
  const inicio = inicioDoMes(mes)
  const proximo = adicionarMeses(inicio, 1)
  const fim = hoje < proximo ? hoje : null
  const dias = fim === null ? diferencaEmDias(proximo, inicio) : diferencaEmDias(fim, inicio) + 1
  return Math.max(0, dias) / 7
}

/** O que o cálculo de um mês precisa (contagens das tarefas e a linha de base vigente). */
export interface EntradaDasHorasPoupadas {
  /** Condicionantes confirmadas no cadastro com IA no mês e o tempo ativo dessas tarefas. */
  condicionantesIa: number
  segundosIa: number
  /** Condicionantes digitadas registradas até o fim do mês (acumulado) e o tempo delas. */
  condicionantesManuais: number
  segundosManuais: number
  /** Tempo ativo medido na área de licenças e prazos no mês. */
  segundosAcompanhamento: number
  semanas: number
  /** Linha de base vigente (nula sem resposta). */
  linhaDeBase: Pick<LinhaDeBase, 'horasSemanaConferindo' | 'minutosPorCondicionante'> | null
  /** Custo da hora (hora técnica da base de custos publicada); nulo sem base. */
  horaCentavos: number | null
}

export interface HorasPoupadas {
  /** Minutos por condicionante à mão usados no cálculo; nulo sem medição suficiente nem resposta. */
  minutosManual: number | null
  manualMedido: boolean
  horasCadastro: number
  horasAcompanhamento: number
  horasTotal: number
  /** Total × custo da hora; nulo sem custo da hora. */
  reaisCentavos: number | null
  /** Veio (em parte) de resposta declarada na linha de base. */
  estimado: boolean
}

/** Horas devolvidas à equipe num mês: cadastro com IA + acompanhamento. Nunca negativo. */
export function calcularHorasPoupadas(e: EntradaDasHorasPoupadas): HorasPoupadas {
  const manualMedido = e.condicionantesManuais >= CONDICIONANTES_MANUAIS_PARA_MEDIR
  const minutosManual = manualMedido
    ? e.segundosManuais / e.condicionantesManuais / 60
    : (e.linhaDeBase?.minutosPorCondicionante ?? null)
  const minutosIa = e.condicionantesIa > 0 ? e.segundosIa / e.condicionantesIa / 60 : 0
  const horasCadastro =
    minutosManual === null ? 0 : (Math.max(0, minutosManual - minutosIa) * e.condicionantesIa) / 60
  // Mês sem nenhum acompanhamento medido não devolve horas: sem uso, não há economia a mostrar.
  const horasAcompanhamento =
    e.linhaDeBase === null || e.segundosAcompanhamento <= 0
      ? 0
      : Math.max(
          0,
          e.linhaDeBase.horasSemanaConferindo * e.semanas - e.segundosAcompanhamento / 3600,
        )
  const horasTotal = horasCadastro + horasAcompanhamento
  // O acompanhamento sempre parte das horas declaradas; sem linha de base, só o medido conta.
  const estimado = e.linhaDeBase !== null
  return {
    minutosManual,
    manualMedido,
    horasCadastro,
    horasAcompanhamento,
    horasTotal,
    reaisCentavos: e.horaCentavos === null ? null : Math.round(horasTotal * e.horaCentavos),
    estimado,
  }
}

/**
 * "Juntando dados": nada aparece antes de 30 dias desde a primeira tarefa registrada ou de 10
 * condicionantes cadastradas (o que vier primeiro).
 */
export function juntandoDados(
  primeiraTarefaEm: string | null,
  agora: Date,
  condicionantesCadastradas: number,
): boolean {
  if (condicionantesCadastradas >= CONDICIONANTES_PARA_MOSTRAR_HORAS) return false
  if (primeiraTarefaEm === null) return true
  return agora.getTime() - new Date(primeiraTarefaEm).getTime() < DIAS_PARA_MOSTRAR_HORAS * DIA_MS
}

/** Meses do seletor do resumo: o mês de `hoje` e os anteriores, mais recente primeiro. */
export function mesesDoResumo(hoje: DataCivil, quantidade = MESES_DO_RESUMO): DataCivil[] {
  const atual = inicioDoMes(hoje)
  return Array.from({ length: quantidade }, (_, i) => adicionarMeses(atual, -i))
}

const umaCasa = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/** 12.345 → "12,3 h". */
export function formatarHoras(horas: number): string {
  return `${umaCasa.format(horas)} h`
}
