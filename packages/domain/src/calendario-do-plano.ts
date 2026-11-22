// Prévia do calendário de uma licença antes de ativar o plano (LIC-04): todas as condicionantes
// juntas, por mês, com o responsável. Conta pela mesma regra de public.ativar_plano: só
// condicionante aceita de natureza obrigação, com as datas de datasDoPrazo até a validade. O total
// é o número de ocorrências que a ativação cria (o mesmo caso em
// supabase/tests/100_cadastro_de_licenca.test.sql dá 8 nos dois lados).

import type { DataCivil } from './data-civil'
import { datasDoPrazo, sugerirPrimeiraData, type Prazo } from './prazo'

export interface ItemDoPlano {
  id: string
  codigo: string
  titulo: string
  /** Só 'obrigacao' gera prazo; as outras naturezas ficam fora do calendário. */
  natureza: string
  /** Só 'aceita' entra no plano (pendente bloqueia a ativação; descartada fica fora). */
  revisao: string
  responsavelId: string | null
  /** Sem recorrência: null. */
  prazo: Prazo | null
}

export interface PrazoDaPrevia {
  data: DataCivil
  ciclo: number
  itemId: string
  codigo: string
  titulo: string
  responsavelId: string | null
}

export interface MesDaPrevia {
  /** "AAAA-MM". */
  mes: string
  prazos: PrazoDaPrevia[]
}

export interface PreviaDoCalendario {
  /** Ocorrências que a ativação cria. */
  total: number
  meses: MesDaPrevia[]
  /** Por condicionante: a primeira data e quantas entregas ela gera (null: não gera prazo). */
  porItem: Record<string, { primeiraData: DataCivil | null; total: number }>
  /** Obrigações aceitas cujo prazo não fecha (sem primeira data, série inválida). */
  comProblema: string[]
}

export interface ContextoDoPlano {
  validade: DataCivil | null
  /** Marco da licença, base da primeira data sugerida quando o prazo não tem referência. */
  referencia: DataCivil | null
  siglaDoTipo: string | null
}

/** O item entra no plano (e vira ocorrências na ativação)? Espelho do filtro de ativar_plano. */
export function entraNoPlano(item: Pick<ItemDoPlano, 'natureza' | 'revisao'>): boolean {
  return item.revisao === 'aceita' && item.natureza === 'obrigacao'
}

export function previaDoCalendario(
  itens: readonly ItemDoPlano[],
  contexto: ContextoDoPlano,
): PreviaDoCalendario {
  const prazos: PrazoDaPrevia[] = []
  const porItem: PreviaDoCalendario['porItem'] = {}
  const comProblema: string[] = []

  for (const item of itens) {
    if (!entraNoPlano(item) || !item.prazo) {
      porItem[item.id] = { primeiraData: null, total: 0 }
      if (entraNoPlano(item)) comProblema.push(item.id)
      continue
    }
    // Prazo confirmado: as datas exatamente como o banco gera (a referência gravada, mesmo nula).
    // Sem primeira data: a sugerida pelo marco, como no passo Prazos.
    const sugerir = !item.prazo.primeiraData
    const referencia = sugerir
      ? (item.prazo.dataReferencia ?? contexto.referencia)
      : item.prazo.dataReferencia
    const primeira = sugerir
      ? sugerirPrimeiraData(item.prazo, referencia, contexto.validade, contexto.siglaDoTipo)
      : item.prazo.primeiraData
    let datas: { ciclo: number; prazo: DataCivil }[]
    try {
      datas = datasDoPrazo(
        { ...item.prazo, dataReferencia: referencia, primeiraData: primeira },
        contexto.validade,
      )
    } catch {
      porItem[item.id] = { primeiraData: null, total: 0 }
      comProblema.push(item.id)
      continue
    }
    porItem[item.id] = { primeiraData: datas[0]?.prazo ?? null, total: datas.length }
    for (const d of datas) {
      prazos.push({
        data: d.prazo,
        ciclo: d.ciclo,
        itemId: item.id,
        codigo: item.codigo,
        titulo: item.titulo,
        responsavelId: item.responsavelId,
      })
    }
  }

  prazos.sort((a, b) =>
    a.data === b.data
      ? a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true })
      : a.data < b.data
        ? -1
        : 1,
  )
  const meses: MesDaPrevia[] = []
  for (const p of prazos) {
    const mes = p.data.slice(0, 7)
    const ultimo = meses.at(-1)
    if (ultimo?.mes === mes) ultimo.prazos.push(p)
    else meses.push({ mes, prazos: [p] })
  }
  return { total: prazos.length, meses, porItem, comProblema }
}
