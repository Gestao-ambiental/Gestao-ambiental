// Primeiros passos do orçamento (ADR-0020): seis passos que configuram custos e preços, salvos a
// cada passo num rascunho da consultoria. O rascunho não é a base publicada: ausente fica nulo e
// nunca vira zero. O banco tem as mesmas pendências (private.pendencias_da_configuracao).

import type { ModoDeDeslocamento } from './deslocamento'
import { composicaoDaEquipe, custoFixoPorHora } from './orcamento'
import { linhasMensaisDaEquipe, type RemuneracaoDaPessoa } from './remuneracao'

export interface EstadoDoConvite {
  /** A base completa e validada existe no servidor. */
  baseConfigurada: boolean
  /** Escolha do membro atual, naquela consultoria, persistida no servidor. */
  conviteDispensado: boolean
  /** Há um rascunho salvo para esta consultoria. */
  possuiRascunho: boolean
}

/** A dispensa não bloqueia o orçamento e não altera a configuração de outra pessoa. */
export function exibirConviteDeConfiguracao(estado: EstadoDoConvite): boolean {
  return !estado.baseConfigurada && !estado.conviteDispensado
}

/** Nome do CTA de acesso ao mesmo rascunho; retomar não publica a base. */
export function rotuloDoConviteDeConfiguracao(estado: EstadoDoConvite): string {
  return estado.possuiRascunho ? 'Continuar configuração' : 'Configurar em poucos passos'
}

// ---------------------------------------------------------------------------
// O rascunho, passo a passo
// ---------------------------------------------------------------------------

/**
 * Passo 1. "equipe": a hora de custo sai de como cada pessoa recebe, e as horas faturáveis são as
 * horas da equipe (regra de Custos e taxas). "manual": custo da hora e horas digitados.
 */
export type ModoDoCusto = 'equipe' | 'manual'

export interface PessoaDoRascunho extends RemuneracaoDaPessoa {
  id: string
  membroId: string
  socio: boolean
  profissao: string | null
}

export interface PassoEquipe {
  modo: ModoDoCusto
  equipe: PessoaDoRascunho[]
  /** Só no modo manual. */
  horaTecnicaCentavos: number | null
}

export interface ContaDoRascunho {
  descricao: string
  /** Nula = ainda não informada (não é zero). */
  valorCentavos: number | null
}

export interface PassoContas {
  /** Total digitado; com contas detalhadas, vale a soma delas. */
  custosFixosMensaisCentavos: number | null
  contas: ContaDoRascunho[]
  /** Só no modo manual; com equipe, vêm dela. */
  horasFaturaveisMes: number | null
}

export interface PassoPrecos<Preco = unknown> {
  /** Hora de profissional (profissão obrigatória) e serviços ("Quem faz" opcional), numa lista só. */
  horasVenda: Preco[]
  /** "visita" ou "km"; nulo em rascunho antigo (a base deduz pelos valores). */
  deslocamentoModo?: ModoDeDeslocamento | null
  /** Opcionais: sem valor, a base fica com a visita "não cadastrada". */
  valorVisitaCentavos: number | null
  /** Derivado (combustível ÷ consumo + acréscimo); o banco recalcula na publicação. */
  custoKmCentavos: number | null
  /** Consumo do carro (km por litro), preço do litro e acréscimo por km: só no modo "km". */
  consumoKmPorLitro?: number | null
  precoCombustivelCentavos?: number | null
  acrescimoKmCentavos?: number | null
}

export interface PassoTributos {
  tributosPb: number | null
  taxasPb: number | null
  taxaPorCobrancaCentavos: number | null
  taxaPorAssinaturaCentavos: number | null
  margemDesejadaPb: number | null
  margemMinimaPb: number | null
  /** As margens pré-preenchidas (30% e 25%) só valem depois de confirmadas. */
  margensConfirmadas: boolean
}

/** Os passos já salvos; passo ausente = ainda não salvo. */
export interface DadosDaConfiguracao<Preco = unknown> {
  equipe?: PassoEquipe
  contas?: PassoContas
  precos?: PassoPrecos<Preco>
  tributos?: PassoTributos
}

/** O que falta para publicar, na ordem dos passos (mesmos códigos do banco). */
export type PendenciaDaConfiguracao =
  'equipe' | 'horas' | 'contas' | 'precos' | 'tributos' | 'taxas' | 'margens'

/** Passo (1 a 4) onde cada pendência se resolve. */
export const PASSO_DA_PENDENCIA: Record<PendenciaDaConfiguracao, number> = {
  equipe: 1,
  horas: 2,
  contas: 2,
  precos: 3,
  tributos: 4,
  taxas: 4,
  margens: 4,
}

/** Horas faturáveis da equipe: só quem tem custo e horas do mês conhecidos (como no banco). */
export function horasDaEquipe(equipe: readonly PessoaDoRascunho[]): number {
  try {
    return composicaoDaEquipe(linhasMensaisDaEquipe(equipe)).horasFaturaveisMes
  } catch {
    return 0
  }
}

/** Custo das contas do mês: a soma das detalhadas (todas com valor) ou o total digitado. */
export function custosFixosDoRascunho(contas: PassoContas | undefined): number | null {
  if (!contas) return null
  if (contas.contas.length === 0) return contas.custosFixosMensaisCentavos
  let soma = 0
  for (const conta of contas.contas) {
    if (conta.valorCentavos === null) return null
    soma += conta.valorCentavos
  }
  return soma
}

/**
 * O que ainda falta para publicar. Igual a private.pendencias_da_configuracao. Com equipe, as
 * horas faturáveis vêm dela e entram em "equipe"; no modo manual, são pedidas no passo 2.
 */
export function pendenciasDaConfiguracao(d: DadosDaConfiguracao): PendenciaDaConfiguracao[] {
  const faltam: PendenciaDaConfiguracao[] = []
  if (!d.equipe) {
    faltam.push('equipe', 'horas')
  } else if (d.equipe.modo === 'equipe') {
    if (horasDaEquipe(d.equipe.equipe) <= 0) faltam.push('equipe')
  } else {
    if ((d.equipe.horaTecnicaCentavos ?? 0) <= 0) faltam.push('equipe')
    if ((d.contas?.horasFaturaveisMes ?? 0) <= 0) faltam.push('horas')
  }
  if (custosFixosDoRascunho(d.contas) === null) faltam.push('contas')
  if (!d.precos || d.precos.horasVenda.length === 0) faltam.push('precos')
  const t = d.tributos
  if (t?.tributosPb == null) faltam.push('tributos')
  if (
    t?.taxasPb == null ||
    t.taxaPorCobrancaCentavos === null ||
    t.taxaPorAssinaturaCentavos === null
  ) {
    faltam.push('taxas')
  }
  if (t?.margemDesejadaPb == null || t.margemMinimaPb === null || !t.margensConfirmadas) {
    faltam.push('margens')
  }
  return faltam
}

export interface ResumoDaConfiguracao {
  /** Hora técnica média (equipe) ou digitada; nula enquanto não dá para calcular. */
  horaTecnicaCentavos: number | null
  horasFaturaveisMes: number | null
  custosFixosMensaisCentavos: number | null
  /** Contas do mês ÷ horas faturáveis; nula = pendente, nunca zero presumido. */
  contasPorHoraCentavos: number | null
  quantidadeDePrecos: number
}

/** Os números do resumo (passo 6), com as mesmas contas de Custos e taxas. */
export function resumoDaConfiguracao(d: DadosDaConfiguracao): ResumoDaConfiguracao {
  let hora: number | null = null
  let horas: number | null = null
  if (d.equipe?.modo === 'equipe') {
    try {
      const c = composicaoDaEquipe(linhasMensaisDaEquipe(d.equipe.equipe))
      hora = c.horaTecnicaCentavos
      horas = c.horasFaturaveisMes > 0 ? c.horasFaturaveisMes : null
    } catch {
      hora = null
    }
  } else if (d.equipe) {
    hora = (d.equipe.horaTecnicaCentavos ?? 0) > 0 ? d.equipe.horaTecnicaCentavos : null
    horas = (d.contas?.horasFaturaveisMes ?? 0) > 0 ? (d.contas?.horasFaturaveisMes ?? null) : null
  }
  const fixos = custosFixosDoRascunho(d.contas)
  return {
    horaTecnicaCentavos: hora,
    horasFaturaveisMes: horas,
    custosFixosMensaisCentavos: fixos,
    contasPorHoraCentavos:
      fixos === null || horas === null
        ? null
        : custoFixoPorHora({
            horaTecnicaCentavos: hora ?? 0,
            custosFixosMensaisCentavos: fixos,
            horasFaturaveisMes: horas,
          }),
    quantidadeDePrecos: d.precos?.horasVenda.length ?? 0,
  }
}
