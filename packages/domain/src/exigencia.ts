// Exigência do órgão (ADR-0045): prazo do ofício, meta interna e situação calculada. O prazo conta a
// partir do dia seguinte ao recebimento (prazoDeOficio), em dias corridos ou úteis (só feriados
// nacionais). O banco recalcula o mesmo prazo em SQL (private.prazo_da_exigencia) e recusa o que
// divergir; a tabela de casos do teste é a mesma do pgTAP 743.

import { ehDataCivil, type DataCivil } from './data-civil'
import { diaUtilAnterior, prazoDeOficio, type UnidadePrazo } from './dias-uteis'
import { feriadosNacionais } from './planos'

/** Maior prazo em dias aceito no registro (o banco recusa acima com prazo_invalido). */
export const DIAS_MAXIMOS_DA_EXIGENCIA = 365

/** Fluxo gravado no banco: aberta até a primeira resposta, depois respondida (sem volta). */
export type SituacaoGravadaDaExigencia = 'aberta' | 'respondida'

/** Situação exibida: calculada a partir do fluxo, do prazo oficial e de hoje. Nunca gravada. */
export type SituacaoDaExigencia =
  'aberta' | 'vence_hoje' | 'atrasada' | 'respondida' | 'respondida_fora_do_prazo'

export const ROTULO_DA_SITUACAO_DA_EXIGENCIA: Readonly<Record<SituacaoDaExigencia, string>> = {
  aberta: 'Aberta',
  vence_hoje: 'Vence hoje',
  atrasada: 'Atrasada',
  respondida: 'Respondida',
  respondida_fora_do_prazo: 'Respondida fora do prazo',
}

/** Dias fora de 1 a 365 ou data de recebimento inválida. */
export class ErroDeExigencia extends Error {}

function ano(data: DataCivil): number {
  return Number(data.slice(0, 4))
}

function feriadosDosAnos(primeiro: number, ultimo: number): DataCivil[] {
  const lista: DataCivil[] = []
  for (let a = primeiro; a <= ultimo; a++) lista.push(...feriadosNacionais(a))
  return lista
}

/**
 * Prazo oficial do ofício e a meta interna sugerida: `dias` corridos ou úteis contados a partir do
 * dia seguinte ao recebimento. Em corridos, o prazo que cai em fim de semana ou feriado não é
 * empurrado; a meta é que antecipa para o dia útil anterior.
 */
export function prazoDaExigencia(
  recebidoEm: DataCivil,
  dias: number,
  contagem: UnidadePrazo,
): { prazoOficial: DataCivil; metaInterna: DataCivil } {
  if (!ehDataCivil(recebidoEm)) throw new ErroDeExigencia('Data de recebimento inválida.')
  if (!Number.isInteger(dias) || dias < 1 || dias > DIAS_MAXIMOS_DA_EXIGENCIA) {
    throw new ErroDeExigencia(`Prazo de 1 a ${String(DIAS_MAXIMOS_DA_EXIGENCIA)} dias.`)
  }
  const inicio = ano(recebidoEm)
  const { oficial, interno } = prazoDeOficio(
    recebidoEm,
    dias,
    contagem,
    feriadosDosAnos(inicio, inicio + 2),
  )
  return { prazoOficial: oficial, metaInterna: interno < recebidoEm ? recebidoEm : interno }
}

/**
 * Meta interna sugerida para um prazo: o próprio prazo, se útil; senão o dia útil anterior. Nunca
 * antes do recebimento (ofício recebido no fim de semana com prazo curto): aí a meta é o próprio
 * recebimento, que o banco aceita (meta entre o recebimento e o prazo).
 */
export function metaInternaSugerida(prazoOficial: DataCivil, recebidoEm?: DataCivil): DataCivil {
  const a = ano(prazoOficial)
  const meta = diaUtilAnterior(prazoOficial, feriadosDosAnos(a - 1, a))
  return recebidoEm !== undefined && meta < recebidoEm ? recebidoEm : meta
}

/** A meta fica entre o recebimento e o prazo oficial, inclusive. */
export function metaInternaValida(
  meta: DataCivil,
  recebidoEm: DataCivil,
  prazoOficial: DataCivil,
): boolean {
  return recebidoEm <= meta && meta <= prazoOficial
}

/** Prorrogação só para depois do prazo atual. */
export function prorrogacaoValida(prazoAtual: DataCivil, prazoNovo: DataCivil): boolean {
  return prazoNovo > prazoAtual
}

/**
 * Situação exibida. Respondida conta a data do primeiro protocolo contra o prazo oficial atual
 * (prorrogado, se houve); aberta compara o prazo com hoje no fuso da consultoria.
 */
export function situacaoDaExigencia(e: {
  situacao: SituacaoGravadaDaExigencia
  prazoOficial: DataCivil
  primeiraRespostaEm: DataCivil | null
  hoje: DataCivil
}): SituacaoDaExigencia {
  if (e.situacao === 'respondida') {
    return (e.primeiraRespostaEm ?? e.prazoOficial) <= e.prazoOficial
      ? 'respondida'
      : 'respondida_fora_do_prazo'
  }
  if (e.hoje < e.prazoOficial) return 'aberta'
  if (e.hoje === e.prazoOficial) return 'vence_hoje'
  return 'atrasada'
}
