// Carga mensal (especificação 0.1): as horas se distribuem por igual entre os dias de trabalho;
// a espera não gera horas; com duração zero, tudo cai no dia de início.

import type { Rede } from './calculo'
import { mesDoDia, primeiroDiaDoMes } from './datas'
import { em } from './util'

/** Horas de um bloco de trabalho em cada mês que ele toca (índice do mês → horas). */
export function horasPorMes(inicio: number, duracao: number, horas: number): Map<number, number> {
  const meses = new Map<number, number>()
  if (horas <= 0) return meses
  if (duracao === 0) {
    meses.set(mesDoDia(inicio), horas)
    return meses
  }
  const porDia = horas / duracao
  const ultimo = inicio + duracao - 1
  let dia = inicio
  while (dia <= ultimo) {
    const mes = mesDoDia(dia)
    const ate = Math.min(ultimo, primeiroDiaDoMes(mes + 1) - 1)
    meses.set(mes, porDia * (ate - dia + 1))
    dia = ate + 1
  }
  return meses
}

/** Carga de toda a rede, somada sempre na ordem dos nós (resultado independe da ordem de entrada). */
export function cargaDaRede(rede: Rede, inicio: readonly number[]): Map<number, number> {
  const carga = new Map<number, number>()
  rede.nos.forEach((no, i) => {
    for (const [mes, horas] of horasPorMes(em(inicio, i), no.duracao, no.horas)) {
      carga.set(mes, (carga.get(mes) ?? 0) + horas)
    }
  })
  return carga
}
