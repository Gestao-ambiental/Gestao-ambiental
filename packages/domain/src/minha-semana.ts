// Minha semana: os prazos da pessoa em todas as consultorias dela, numa lista agrupada por dia.
// A ordem é a mesma da função public.minha_semana (data, consultoria, tipo, título), para que a
// paginação do banco e o agrupamento da tela concordem.
import {
  adicionarDias,
  diferencaEmDias,
  formatarDataCivil,
  nomeDoDiaDaSemana,
  type DataCivil,
} from './data-civil'

/** O mínimo que a ordenação e o agrupamento precisam de cada item. */
export interface ItemDaMinhaSemana {
  data: DataCivil
  consultoriaId: string
  consultoriaNome: string
  /** tipo_evento do banco: 'prazo', 'exigencia', 'acao_legal', 'meta' e o que vier. */
  tipo: string
  titulo: string
  id: string
}

export interface DiaDaMinhaSemana<T extends ItemDaMinhaSemana> {
  data: DataCivil
  /** "Hoje", "Amanhã", "Ontem" ou "quinta-feira, 26/11/2026". */
  rotulo: string
  /** Dia antes de hoje: o que está nele já passou do prazo. */
  passado: boolean
  itens: T[]
}

const ORDEM_DO_TIPO: Readonly<Record<string, number>> = {
  prazo: 1,
  exigencia: 2,
  acao_legal: 3,
  meta: 4,
}

function ordemDoTipo(tipo: string): number {
  return ORDEM_DO_TIPO[tipo] ?? 5
}

function comparar(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Data, nome da consultoria, consultoria, tipo (prazo, exigência, requisito, meta), título, id. */
export function ordenarItensDaSemana<T extends ItemDaMinhaSemana>(itens: readonly T[]): T[] {
  return [...itens].sort(
    (a, b) =>
      comparar(a.data, b.data) ||
      a.consultoriaNome.localeCompare(b.consultoriaNome, 'pt-BR') ||
      comparar(a.consultoriaId, b.consultoriaId) ||
      ordemDoTipo(a.tipo) - ordemDoTipo(b.tipo) ||
      a.titulo.localeCompare(b.titulo, 'pt-BR') ||
      comparar(a.id, b.id),
  )
}

/** Rótulo do dia em relação a hoje (no fuso da consultoria, calculado fora daqui). */
export function rotuloDoDia(data: DataCivil, hoje: DataCivil): string {
  const diferenca = diferencaEmDias(data, hoje)
  if (diferenca === 0) return 'Hoje'
  if (diferenca === 1) return 'Amanhã'
  if (diferenca === -1) return 'Ontem'
  return `${nomeDoDiaDaSemana(data)}, ${formatarDataCivil(data)}`
}

/** Agrupa por dia, na ordem de ordenarItensDaSemana. Dias sem item não aparecem. */
export function agruparPorDia<T extends ItemDaMinhaSemana>(
  itens: readonly T[],
  hoje: DataCivil,
): DiaDaMinhaSemana<T>[] {
  const dias: DiaDaMinhaSemana<T>[] = []
  for (const item of ordenarItensDaSemana(itens)) {
    const ultimo = dias.at(-1)
    if (ultimo?.data === item.data) {
      ultimo.itens.push(item)
    } else {
      dias.push({
        data: item.data,
        rotulo: rotuloDoDia(item.data, hoje),
        passado: diferencaEmDias(item.data, hoje) < 0,
        itens: [item],
      })
    }
  }
  return dias
}

/**
 * Período da semana pedida: 0 é a semana que começa hoje e traz também tudo o que ficou para trás
 * (de nulo); 1, 2… são as semanas seguintes, de 7 em 7 dias. Semana negativa vale como 0.
 */
export function periodoDaMinhaSemana(
  hoje: DataCivil,
  semana: number,
): { de: DataCivil | null; ate: DataCivil } {
  const n = Math.max(0, Math.trunc(semana))
  if (n === 0) return { de: null, ate: adicionarDias(hoje, 6) }
  const de = adicionarDias(hoje, 7 * n)
  return { de, ate: adicionarDias(de, 6) }
}
