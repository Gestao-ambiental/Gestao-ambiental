// Fila de envio do Campo sem sinal (ADR-0060): o que a técnica registrou fica no aparelho e vai ao
// servidor quando a conexão deixa. Aqui só as regras puras: chave de cada registro, quem substitui
// quem, ordem de envio, espera entre tentativas, foto repetida e contagem do que falta enviar.

import type { ResultadoDoItem } from './vistoria'

/** Resultado e comentário de um item: o último registro do item substitui o anterior. */
export interface RegistroDeItemNaFila {
  tipo: 'item'
  vistoriaId: string
  itemId: string
  resultado: ResultadoDoItem
  comentario: string | null
  /** Instante (ISO) em que a técnica registrou no aparelho. */
  registradoEm: string
}

/** Uma foto: o id vem do aparelho e torna o envio repetível sem duplicar. */
export interface FotoNaFila {
  tipo: 'foto'
  vistoriaId: string
  itemId: string
  fotoId: string
  sha256: string
  /** Instante (ISO) da escolha da foto. */
  registradoEm: string
}

/** Observação geral da vistoria: a última substitui a anterior. */
export interface ObservacaoNaFila {
  tipo: 'observacao'
  vistoriaId: string
  observacao: string | null
  registradoEm: string
}

export type RegistroNaFila = RegistroDeItemNaFila | FotoNaFila | ObservacaoNaFila

/**
 * Chave do registro no aparelho. Item e observação têm uma chave só (o último vence); cada foto
 * tem a sua (fotos se somam).
 */
export function chaveDoRegistro(registro: RegistroNaFila): string {
  switch (registro.tipo) {
    case 'item':
      return `item:${registro.itemId}`
    case 'foto':
      return `foto:${registro.fotoId}`
    case 'observacao':
      return `observacao:${registro.vistoriaId}`
  }
}

const PESO_DO_TIPO: Record<RegistroNaFila['tipo'], number> = { item: 0, foto: 1, observacao: 2 }

/**
 * Ordem de envio: resultados dos itens, depois fotos, depois a observação; dentro de cada tipo, na
 * ordem em que foram registrados (desempate pela chave, para a ordem não depender do armazenamento).
 * Cada foto leva o próprio `itemId`, então a ordem não troca foto de item.
 */
export function ordemDeEnvio<T extends RegistroNaFila>(registros: readonly T[]): T[] {
  return [...registros].sort(
    (a, b) =>
      PESO_DO_TIPO[a.tipo] - PESO_DO_TIPO[b.tipo] ||
      a.registradoEm.localeCompare(b.registradoEm) ||
      chaveDoRegistro(a).localeCompare(chaveDoRegistro(b)),
  )
}

/** Espera antes da tentativa seguinte: 2 s, 4 s, 8 s… até 2 min. */
export const ESPERA_MINIMA_MS = 2_000
export const ESPERA_MAXIMA_MS = 120_000

export function esperaAntesDaTentativa(falhasSeguidas: number): number {
  if (falhasSeguidas <= 0) return 0
  return Math.min(ESPERA_MAXIMA_MS, ESPERA_MINIMA_MS * 2 ** Math.min(falhasSeguidas - 1, 16))
}

/**
 * A mesma imagem escolhida de novo para o mesmo item: compara o SHA-256 com as fotos do item, no
 * servidor e no aparelho. Em outro item a mesma imagem é aceita.
 */
export function fotoRepetida(
  fotosDoItem: readonly { itemId: string; sha256: string | null }[],
  itemId: string,
  sha256: string,
): boolean {
  const alvo = sha256.toLowerCase()
  return fotosDoItem.some((f) => f.itemId === itemId && f.sha256?.toLowerCase() === alvo)
}

export interface ContagemDaFila {
  total: number
  porItem: Readonly<Record<string, number>>
  observacao: boolean
}

/** Quantos registros faltam enviar, no todo e por item. */
export function contarPendencias(registros: readonly RegistroNaFila[]): ContagemDaFila {
  const porItem: Record<string, number> = {}
  let observacao = false
  for (const r of registros) {
    if (r.tipo === 'observacao') observacao = true
    else porItem[r.itemId] = (porItem[r.itemId] ?? 0) + 1
  }
  return { total: registros.length, porItem, observacao }
}

/**
 * Item como a técnica vê: o registro do aparelho, se houver, por cima do que está no servidor.
 * O servidor continua sendo a fonte do que já chegou.
 */
export function aplicarRascunho<
  T extends { id: string; resultado: ResultadoDoItem; comentario: string | null },
>(itens: readonly T[], registros: readonly RegistroNaFila[]): T[] {
  const doAparelho = new Map<string, RegistroDeItemNaFila>()
  for (const r of registros) if (r.tipo === 'item') doAparelho.set(r.itemId, r)
  return itens.map((item) => {
    const local = doAparelho.get(item.id)
    return local ? { ...item, resultado: local.resultado, comentario: local.comentario } : item
  })
}
