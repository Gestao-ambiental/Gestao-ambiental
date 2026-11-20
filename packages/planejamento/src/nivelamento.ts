// Nivelamento (especificação 0.1, estratégia c): heurística gulosa que baixa os meses mais cheios
// adiantando atividades móveis, nunca atrasando. Não garante o menor pico possível.
//
// Sem capacidade informada, achata o quanto der. Com capacidade (teto), só mexe nos meses acima
// dela e para assim que o mês cabe. Primeiro leva horas para onde há espaço (antecipa o mínimo
// necessário); se ainda sobrar mês acima do teto, reparte o excesso entre os meses vizinhos.

import { inicioPossivel, type Rede } from './calculo'
import { cargaDaRede, horasPorMes } from './carga'
import { em, EPS } from './util'

export interface EntradaDoNivelamento {
  rede: Rede
  /** Posição de partida de cada nó (a recomendada, já ajustada ao possível). */
  inicio: readonly number[]
  hoje: number
  passoDias: number
  /** Teto de horas por mês; `null` = achatar o quanto der. */
  capacidade: number | null
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
  const { rede, hoje, passoDias, primeiroMes, ultimoMes, capacidade } = entrada
  const inicio = [...entrada.inicio]
  const carga = cargaDaRede(rede, inicio)
  const horasEm = (mes: number) => carga.get(mes) ?? 0
  const noHorizonte = (mes: number) => mes >= primeiroMes && mes <= ultimoMes
  let movimentos = 0

  // `teto`: só aceita movimento que reduz as horas acima da capacidade. `pico`: aceita o que
  // baixa o mês mais cheio sem levar outro ao nível dele.
  const rodar = (modo: 'teto' | 'pico'): boolean => {
    const travados = new Set<number>()
    for (;;) {
      // Mês não travado de maior carga; em empate, o mais cedo.
      let mes: number | null = null
      for (let m = primeiroMes; m <= ultimoMes; m++) {
        if (travados.has(m)) continue
        if (mes === null || horasEm(m) > horasEm(mes) + EPS) mes = m
      }
      if (mes === null) break
      const pico = horasEm(mes)
      if (pico <= (capacidade ?? 0) + EPS) break
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

        // Testa 1, 2, 3… passos mais cedo. O ganho de cada teste é negativo quando melhora: sem
        // teto, a maior carga entre os meses tocados menos o pico; com teto, a variação das horas
        // acima da capacidade nesses meses. Fica com o melhor; em empate, a menor antecipação.
        let melhor: { inicio: number; ganho: number; nova: Map<number, number> } | null = null
        for (let novo = atual - passoDias; novo >= possivel; novo -= passoDias) {
          const nova = horasPorMes(novo, no.duracao, no.horas)
          let maior = 0
          let excesso = 0
          for (const m of new Set([...antiga.keys(), ...nova.keys()])) {
            if (!noHorizonte(m)) continue
            const depois = horasEm(m) - (antiga.get(m) ?? 0) + (nova.get(m) ?? 0)
            maior = Math.max(maior, depois)
            if (modo === 'teto' && capacidade !== null) {
              excesso += Math.max(0, depois - capacidade) - Math.max(0, horasEm(m) - capacidade)
            }
          }
          const ganho = modo === 'teto' ? excesso : maior - pico
          if (melhor === null || ganho < melhor.ganho - EPS) melhor = { inicio: novo, ganho, nova }
        }
        if (melhor === null || melhor.ganho >= -EPS) continue

        for (const [m, horas] of antiga) carga.set(m, horasEm(m) - horas)
        for (const [m, horas] of melhor.nova) carga.set(m, horasEm(m) + horas)
        inicio[candidato.no] = melhor.inicio
        aceito = true
        break
      }

      if (!aceito) {
        travados.add(mesDoPico)
      } else if (++movimentos >= LIMITE_DE_MOVIMENTOS) {
        return true
      }
    }
    return false
  }

  const interrompido = (capacidade !== null && rodar('teto')) || rodar('pico')
  return { inicio, interrompido }
}
