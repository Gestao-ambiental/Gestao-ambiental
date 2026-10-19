// Prazo de condicionante (LIC-03) e situação da licença (EMP-02). A geração de datas é o espelho
// de private.datas_do_prazo no banco, que grava as ocorrências na ativação: os dois são testados
// com os mesmos casos (packages/domain/src/prazo.test.ts e supabase/tests/100_cadastro_de_licenca).

import {
  adicionarDias,
  adicionarMeses,
  diferencaEmDias,
  ehDataCivil,
  type DataCivil,
} from './data-civil'
import { MAXIMO_OCORRENCIAS } from './recorrencia'
import { datasRenovacaoLao } from './renovacao'

export type Recorrencia =
  | 'anual'
  | 'semestral'
  | 'trimestral'
  | 'bimestral'
  | 'mensal'
  | 'unica'
  | 'na_renovacao'
  | 'continua'
  | 'personalizada'

export type UnidadeCiclo = 'mes' | 'dia'

/** Presets na ordem do Protótipo 13. */
export const RECORRENCIAS: readonly Recorrencia[] = [
  'anual',
  'semestral',
  'trimestral',
  'bimestral',
  'mensal',
  'unica',
  'na_renovacao',
  'continua',
  'personalizada',
]

const MESES: Partial<Record<Recorrencia, number>> = {
  anual: 12,
  semestral: 6,
  trimestral: 3,
  bimestral: 2,
  mensal: 1,
}

export interface Prazo {
  recorrencia: Recorrencia
  /** Só na personalizada. */
  unidade?: UnidadeCiclo | null
  /** Só na personalizada: a cada N meses ou dias corridos. */
  intervalo?: number | null
  primeiraData?: DataCivil | null
}

/** Erro de cadastro do prazo, com o mesmo código que o banco usa. */
export class ErroDePrazo extends Error {
  constructor(
    public readonly codigo:
      | 'primeira_data_obrigatoria'
      | 'intervalo_invalido'
      | 'validade_obrigatoria'
      | 'primeira_data_apos_validade'
      | 'ocorrencias_demais',
  ) {
    super(codigo)
    this.name = 'ErroDePrazo'
  }
}

function cicloDe(prazo: Prazo): { unidade: UnidadeCiclo; intervalo: number } | null {
  const meses = MESES[prazo.recorrencia]
  if (meses) return { unidade: 'mes', intervalo: meses }
  if (prazo.recorrencia !== 'personalizada') return null
  const { unidade, intervalo } = prazo
  if (!unidade || !intervalo || !Number.isInteger(intervalo) || intervalo < 1) {
    throw new ErroDePrazo('intervalo_invalido')
  }
  return { unidade, intervalo }
}

/**
 * Entregas de um prazo até a validade (inclusive). Única e na renovação: uma, na primeira data.
 * Contínua: nenhuma (não vira entrega periódica). Periódica: primeira data + i × intervalo, em
 * meses (sempre a partir da base, fim de mês sem derivar) ou dias corridos.
 */
export function datasDoPrazo(
  prazo: Prazo,
  validade: DataCivil | null | undefined,
): { ciclo: number; prazo: DataCivil }[] {
  if (prazo.recorrencia === 'continua') return []
  const primeira = prazo.primeiraData
  if (!primeira || !ehDataCivil(primeira)) throw new ErroDePrazo('primeira_data_obrigatoria')
  if (prazo.recorrencia === 'unica' || prazo.recorrencia === 'na_renovacao') {
    return [{ ciclo: 1, prazo: primeira }]
  }
  const ciclo = cicloDe(prazo)
  if (!ciclo) throw new ErroDePrazo('intervalo_invalido')
  if (!validade || !ehDataCivil(validade)) throw new ErroDePrazo('validade_obrigatoria')
  if (primeira > validade) throw new ErroDePrazo('primeira_data_apos_validade')

  const datas: { ciclo: number; prazo: DataCivil }[] = []
  for (let i = 0; i <= MAXIMO_OCORRENCIAS; i++) {
    const data =
      ciclo.unidade === 'mes'
        ? adicionarMeses(primeira, i * ciclo.intervalo)
        : adicionarDias(primeira, i * ciclo.intervalo)
    if (data > validade) return datas
    if (i === MAXIMO_OCORRENCIAS) break
    datas.push({ ciclo: i + 1, prazo: data })
  }
  throw new ErroDePrazo('ocorrencias_demais')
}

/**
 * Primeira data sugerida (o humano confirma; nada é inventado quando falta base):
 * periódica = data de referência + um intervalo, se couber na validade; na renovação de LAO =
 * limite de protocolo (validade − 120 dias); única, contínua e demais casos = sem sugestão.
 */
export function sugerirPrimeiraData(
  prazo: Prazo,
  referencia: DataCivil | null | undefined,
  validade: DataCivil | null | undefined,
  siglaDoTipo: string | null | undefined,
): DataCivil | null {
  if (prazo.recorrencia === 'na_renovacao') {
    return validade && ehLao(siglaDoTipo) ? datasRenovacaoLao(validade).limiteProtocolo : null
  }
  if (!referencia || !ehDataCivil(referencia)) return null
  let ciclo
  try {
    ciclo = cicloDe(prazo)
  } catch {
    return null
  }
  if (!ciclo) return null
  const sugerida =
    ciclo.unidade === 'mes'
      ? adicionarMeses(referencia, ciclo.intervalo)
      : adicionarDias(referencia, ciclo.intervalo)
  return validade && sugerida > validade ? null : sugerida
}

const NOMES: Record<Exclude<Recorrencia, 'personalizada'>, string> = {
  anual: 'Anual',
  semestral: 'Semestral',
  trimestral: 'Trimestral',
  bimestral: 'Bimestral',
  mensal: 'Mensal',
  unica: 'Única',
  na_renovacao: 'Na renovação',
  continua: 'Contínua',
}

/** Rótulo da recorrência: "Trimestral", "A cada 45 dias", "A cada 2 meses". */
export function descreverRecorrencia(prazo: Prazo): string {
  if (prazo.recorrencia !== 'personalizada') return NOMES[prazo.recorrencia]
  const { unidade, intervalo } = prazo
  if (!unidade || !intervalo) return 'Personalizada'
  if (unidade === 'dia') return intervalo === 1 ? 'Todo dia' : `A cada ${String(intervalo)} dias`
  return intervalo === 1 ? 'A cada mês' : `A cada ${String(intervalo)} meses`
}

/** A regra dos 120 dias é só da LAO (09 · Regras: não estender a outros tipos sem fonte). */
export function ehLao(sigla: string | null | undefined): boolean {
  return (sigla ?? '').trim().toUpperCase() === 'LAO'
}

// ---------------------------------------------------------------------------
// Situação da licença (calculada, nunca gravada)
// ---------------------------------------------------------------------------

export interface LicencaResumo {
  situacao: 'rascunho' | 'ativo'
  validade: DataCivil | null
  sigla: string | null
  /** Antecedência da preparação da renovação (padrão 30). */
  antecedencia?: number | null
  /** Dias entre o limite de protocolo e a validade, do plano da LAO (padrão 120). */
  diasLimite?: number | null
  /** Data do protocolo da renovação, se já houve. */
  protocoladoEm?: DataCivil | null
}

export type SituacaoDaLicenca =
  | { tipo: 'rascunho' }
  | { tipo: 'sem_validade' }
  | { tipo: 'vencida' }
  | { tipo: 'protocolo'; dias: number }
  | { tipo: 'protocolo_atrasado' }
  | { tipo: 'sem_retorno' }
  | { tipo: 'vigente' }

/**
 * Rascunho; sem validade; vencida (validade antes de hoje); LAO dentro da preparação da
 * renovação: protocolo em N dias até o limite (validade − 120), atrasado depois dele; vigente.
 */
export function situacaoDaLicenca(licenca: LicencaResumo, hoje: DataCivil): SituacaoDaLicenca {
  if (licenca.situacao === 'rascunho') return { tipo: 'rascunho' }
  if (!licenca.validade) return { tipo: 'sem_validade' }
  if (licenca.validade < hoje) return { tipo: 'vencida' }
  if (ehLao(licenca.sigla)) {
    if (licenca.protocoladoEm) return { tipo: 'sem_retorno' }
    const { inicioPreparacao, limiteProtocolo } = datasRenovacaoLao(
      licenca.validade,
      licenca.antecedencia ?? undefined,
      licenca.diasLimite ?? undefined,
    )
    if (hoje >= inicioPreparacao) {
      const dias = diferencaEmDias(limiteProtocolo, hoje)
      return dias >= 0 ? { tipo: 'protocolo', dias } : { tipo: 'protocolo_atrasado' }
    }
  }
  return { tipo: 'vigente' }
}

const URGENCIA: Record<SituacaoDaLicenca['tipo'], number> = {
  vencida: 0,
  protocolo_atrasado: 1,
  protocolo: 2,
  sem_retorno: 3,
  sem_validade: 4,
  rascunho: 5,
  vigente: 6,
}

/**
 * A licença mais urgente de um empreendimento (Protótipo 08: "Situação mostra a licença mais
 * urgente"). Sem licença: `null`. Entre protocolos, o de menos dias.
 */
export function situacaoMaisUrgente(
  licencas: readonly LicencaResumo[],
  hoje: DataCivil,
): SituacaoDaLicenca | null {
  let pior: SituacaoDaLicenca | null = null
  for (const licenca of licencas) {
    const atual = situacaoDaLicenca(licenca, hoje)
    if (
      !pior ||
      URGENCIA[atual.tipo] < URGENCIA[pior.tipo] ||
      (atual.tipo === 'protocolo' && pior.tipo === 'protocolo' && atual.dias < pior.dias)
    ) {
      pior = atual
    }
  }
  return pior
}

/** Validade mais próxima entre as licenças ativas (coluna "Próxima validade"). */
export function proximaValidade(licencas: readonly LicencaResumo[]): DataCivil | null {
  let menor: DataCivil | null = null
  for (const licenca of licencas) {
    if (licenca.situacao === 'ativo' && licenca.validade && (!menor || licenca.validade < menor)) {
      menor = licenca.validade
    }
  }
  return menor
}
