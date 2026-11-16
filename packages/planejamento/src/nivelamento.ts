// Nivelamento (especificação 0.1, estratégia c): heurística gulosa que baixa os meses mais cheios
// adiantando atividades móveis, nunca atrasando. Não garante o menor pico possível.

import { inicioPossivel, type Rede } from './calculo'
import { cargaDaRede, horasPorMes } from './carga'
import { em, EPS } from './util'

export interface EntradaDoNivelamento {
  rede: Rede
  /** Posição de partida de cada nó (a recomendada, já ajustada ao possível). */
  inicio: readonly number[]
  hoje: number
  passoDias: number
  primeiroMes: number
  ultimoMes: number
  /** Por atividade: está `planejada` (as demais já estão o mais cedo possível). */
  planejada: readonly boolean[]
  /** Por atividade: posição da gravidade (maior = mais grave). */
  gravidade: readonly number[]
  /** Por atividade: fim limite, usado como "prazo mais próximo" no desempate. */
  prazoEfetivo: readonly number[]
}

/** Trava de segurança; o procedimento termina sozinho bem antes disso. */
const LIMITE_DE_MOVIMENTOS = 1_000_000

export function nivelar(entrada: EntradaDoNivelamento): {
  inicio: number[]
  interrompido: boolean
} {
  const { rede, hoje, passoDias, primeiroMes, ultimoMes } = entrada
  const inicio = [...entrada.inicio]
  const carga = cargaDaRede(rede, inicio)
  const horasEm = (mes: number) => carga.get(mes) ?? 0
  const noHorizonte = (mes: number) => mes >= primeiroMes && mes <= ultimoMes
  const travados = new Set<number>()
  let movimentos = 0

  for (;;) {
    // Mês não travado de maior carga; em empate, o mais cedo.
    let mes: number | null = null
    for (let m = primeiroMes; m <= ultimoMes; m++) {
      if (travados.has(m)) continue
      if (mes === null || horasEm(m) > horasEm(mes) + EPS) mes = m
    }
    if (mes === null) break
    const pico = horasEm(mes)
    if (pico <= EPS) break
    const mesDoPico = mes

    // Nós móveis com horas no mês: gravidade mais alta, mais horas no mês, prazo mais próximo, id.
    const candidatos: { no: number; horas: number }[] = []
    rede.nos.forEach((no, i) => {
      if (!no.movel || !em(entrada.planejada, no.atividade)) return
      const horas = horasPorMes(em(inicio, i), no.duracao, no.horas).get(mesDoPico) ?? 0
      if (horas > EPS) candidatos.push({ no: i, horas })
    })
    candidatos.sort((a, b) => {
      const atividadeA = em(rede.nos, a.no).atividade
      const atividadeB = em(rede.nos, b.no).atividade
      return (
        em(entrada.gravidade, atividadeB) - em(entrada.gravidade, atividadeA) ||
        (Math.abs(a.horas - b.horas) > EPS ? b.horas - a.horas : 0) ||
        em(entrada.prazoEfetivo, atividadeA) - em(entrada.prazoEfetivo, atividadeB) ||
        atividadeA - atividadeB
      )
    })

    let aceito = false
    for (const candidato of candidatos) {
      const no = em(rede.nos, candidato.no)
      const atual = em(inicio, candidato.no)
      const possivel = inicioPossivel(rede, candidato.no, inicio, hoje)
      const antiga = horasPorMes(atual, no.duracao, no.horas)

      // Testa 1, 2, 3… passos mais cedo; fica com a menor carga máxima entre os meses tocados.
      let melhor: { inicio: number; valor: number; nova: Map<number, number> } | null = null
      for (let novo = atual - passoDias; novo >= possivel; novo -= passoDias) {
        const nova = horasPorMes(novo, no.duracao, no.horas)
        let valor = 0
        for (const m of new Set([...antiga.keys(), ...nova.keys()])) {
          if (!noHorizonte(m)) continue
          valor = Math.max(valor, horasEm(m) - (antiga.get(m) ?? 0) + (nova.get(m) ?? 0))
        }
        if (melhor === null || valor < melhor.valor - EPS) melhor = { inicio: novo, valor, nova }
      }
      if (melhor === null || melhor.valor >= pico - EPS) continue

      for (const [m, horas] of antiga) carga.set(m, horasEm(m) - horas)
      for (const [m, horas] of melhor.nova) carga.set(m, horasEm(m) + horas)
      inicio[candidato.no] = melhor.inicio
      aceito = true
      break
    }

    if (!aceito) {
      travados.add(mesDoPico)
    } else if (++movimentos >= LIMITE_DE_MOVIMENTOS) {
      return { inicio, interrompido: true }
    }
  }
  return { inicio, interrompido: false }
}
