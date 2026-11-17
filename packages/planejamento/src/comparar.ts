// Comparação das estratégias sobre a mesma carteira: uma linha de métricas por estratégia e a
// carga de cada mês. A capacidade vem dos parâmetros (`capacidadeMensalHoras`).

import { planejar } from './planejar'
import {
  ESTRATEGIAS,
  type Aglomeracao,
  type Carteira,
  type Data,
  type ErroDeValidacao,
  type Estrategia,
  type Metricas,
  type Parametros,
} from './tipos'

export interface LinhaDaComparacao {
  estrategia: Estrategia
  metricas: Metricas
  /** Horas de cada mês, na ordem de `meses`. */
  horas: number[]
  /** Atividades em `iniciar_ja` ou `inviavel` na data de hoje (igual em todas as estratégias). */
  emTriagem: number
}

export type Comparacao =
  | { ok: true; meses: string[]; linhas: LinhaDaComparacao[]; aglomeracoes: Aglomeracao[] }
  | { ok: false; erros: ErroDeValidacao[] }

export function comparar(carteira: Carteira, parametros: Parametros, hoje: Data): Comparacao {
  const linhas: LinhaDaComparacao[] = []
  let meses: string[] = []
  let aglomeracoes: Aglomeracao[] = []
  for (const estrategia of ESTRATEGIAS) {
    const resultado = planejar(carteira, parametros, hoje, estrategia)
    if (!resultado.ok) return { ok: false, erros: resultado.erros }
    const { plano } = resultado
    meses = plano.cargaMensal.map((m) => m.mes)
    aglomeracoes = plano.aglomeracoes
    const horas = plano.cargaMensal.map((m) => m.horas)
    linhas.push({
      estrategia,
      metricas: plano.metricas,
      horas,
      emTriagem: plano.triagem.length,
    })
  }
  return { ok: true, meses, linhas, aglomeracoes }
}
