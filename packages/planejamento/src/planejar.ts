// Motor de planejamento (especificação 0.1): função pura, determinística, sem relógio nem rede.
// Recebe a carteira, os parâmetros, a data de hoje e a estratégia; devolve o plano ou os erros.

import {
  avancar,
  fimDoNo,
  inicioPeloAlerta,
  inicioPossivel,
  montarRede,
  recuar,
  type No,
} from './calculo'
import { cargaDaRede, horasPorMes } from './carga'
import { mesDoDia, paraData, rotuloDoMes } from './datas'
import { nivelar } from './nivelamento'
import type {
  Carteira,
  CodigoDeAviso,
  CodigoDeAvisoGeral,
  Data,
  Estado,
  Estrategia,
  ItemDoPlano,
  Metricas,
  Parametros,
  Resultado,
} from './tipos'
import { arredondar, em, EPS } from './util'
import { validar } from './validar'

export const VERSAO_DO_MOTOR = '0.1.0'

function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null
  const ordenados = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(ordenados.length / 2)
  return ordenados.length % 2 === 1
    ? em(ordenados, meio)
    : (em(ordenados, meio - 1) + em(ordenados, meio)) / 2
}

export function planejar(
  carteira: Carteira,
  parametros: Parametros,
  hoje: Data,
  estrategia: Estrategia,
): Resultado {
  const conferida = validar(carteira, parametros, hoje, estrategia)
  if (!conferida.ok) return { ok: false, erros: conferida.erros }
  const { atividades, parametros: p, hoje: hojeDia, estrategia: e } = conferida.entrada

  const rede = montarRede(atividades)
  const margemDaGravidade = (no: No) => em(p.margens, em(atividades, no.atividade).gravidade)
  const limite = recuar(rede, () => 0)
  const recomendado = recuar(rede, margemDaGravidade)

  // Datas de referência e estado de cada atividade: iguais em todas as estratégias.
  const inicioLimite = atividades.map((_, i) => em(limite.inicio, em(rede.primeiro, i)))
  const inicioRecomendado = atividades.map((_, i) => em(recomendado.inicio, em(rede.primeiro, i)))
  const estados: Estado[] = atividades.map((_, i) => {
    if (em(inicioLimite, i) < hojeDia) return 'inviavel'
    return em(inicioRecomendado, i) <= hojeDia ? 'iniciar_ja' : 'planejada'
  })

  // Posição planejada: o início desejado da estratégia, ajustado ao possível.
  const desejado =
    e === 'so_prazo'
      ? inicioPeloAlerta(rede, p.alertaDias)
      : e === 'folga_sem_gravidade'
        ? recuar(rede, () => p.margemUnicaDias).inicio
        : recomendado.inicio
  const semNivelamento = avancar(rede, desejado, hojeDia)

  // Horizonte: do mês de hoje ao mês do último prazo (ou o número de meses pedido).
  const primeiroMes = mesDoDia(hojeDia)
  const ultimoPrazo = atividades.reduce((maior, a) => Math.max(maior, a.prazo ?? hojeDia), hojeDia)
  const ultimoMes =
    p.horizonteMeses === null ? mesDoDia(ultimoPrazo) : primeiroMes + p.horizonteMeses - 1

  const avisosGerais: CodigoDeAvisoGeral[] = []
  let inicio = semNivelamento
  if (e === 'metodo_completo') {
    const nivelado = nivelar({
      rede,
      inicio: semNivelamento,
      hoje: hojeDia,
      passoDias: p.passoNivelamentoDias,
      primeiroMes,
      ultimoMes,
      planejada: estados.map((estado) => estado === 'planejada'),
      gravidade: atividades.map((a) => a.gravidade),
      prazoEfetivo: atividades.map((_, i) => em(limite.fim, em(rede.ultimo, i))),
    })
    inicio = nivelado.inicio
    if (nivelado.interrompido) avisosGerais.push('nivelamento_interrompido')
  }

  // Itens, na ordem da carteira de entrada.
  const itens = new Array<ItemDoPlano | undefined>(atividades.length)
  const fimPlanejado: number[] = []
  atividades.forEach((a, i) => {
    const primeiro = em(rede.primeiro, i)
    const ultimo = em(rede.ultimo, i)
    const fim = fimDoNo(rede, ultimo, inicio)
    fimPlanejado.push(fim)
    const estado = em(estados, i)

    const avisos: CodigoDeAviso[] = []
    const possivel = inicioPossivel(rede, primeiro, inicio, hojeDia)
    if (possivel > em(inicioLimite, i)) avisos.push('prazo_nao_cabe')
    else if (possivel > em(inicioRecomendado, i)) avisos.push('margem_nao_cabe')
    if (a.inicioFixo !== null && fim > em(recomendado.fim, ultimo))
      avisos.push('inicio_fixo_tardio')
    if (a.esforcoHoras > 0 && a.duracaoDias === 0) avisos.push('esforco_sem_duracao')
    const foraDoHorizonte = [primeiro, ultimo].some((n) => {
      const no = em(rede.nos, n)
      return [...horasPorMes(em(inicio, n), no.duracao, no.horas).keys()].some((m) => m > ultimoMes)
    })
    if (foraDoHorizonte) avisos.push('fora_do_horizonte')

    const limitante = em(recomendado.limitante, ultimo)
    itens[a.posicao] = {
      atividadeId: a.id,
      inicioLimite: paraData(em(inicioLimite, i)),
      inicioRecomendado: paraData(em(inicioRecomendado, i)),
      folgaDias: em(inicioLimite, i) - hojeDia,
      margemEfetivaDias: em(inicioLimite, i) - em(inicioRecomendado, i),
      diasAteInicio: em(inicioRecomendado, i) - hojeDia,
      estado,
      inicioPlanejado: paraData(em(inicio, primeiro)),
      fimPlanejado: paraData(fim),
      antecipadaDias: em(semNivelamento, primeiro) - em(inicio, primeiro),
      inicioParteFixa: a.antecipabilidade === 'parcial' ? paraData(em(inicio, ultimo)) : null,
      bloqueadaPor: estado === 'planejada' ? [] : a.dependeDe.map((d) => d.id).sort(),
      avisos,
      explicacao: {
        prazo: a.prazo === null ? null : paraData(a.prazo),
        margemDias: em(inicioLimite, i) - em(inicioRecomendado, i),
        esperaDias: a.esperaDias,
        duracaoDias: a.duracaoDias,
        limitadaPor:
          limitante === null ? null : em(atividades, em(rede.nos, limitante).atividade).id,
      },
    }
  })

  // Triagem: inviáveis, depois iniciar já; menor diasAteInicio, mais grave, prazo mais próximo, id.
  const triagem = atividades
    .map((_, i) => i)
    .filter((i) => em(estados, i) !== 'planejada')
    .sort((x, y) => {
      const grupo = (i: number) => (em(estados, i) === 'inviavel' ? 0 : 1)
      const prazoEfetivo = (i: number) => em(limite.fim, em(rede.ultimo, i))
      return (
        grupo(x) - grupo(y) ||
        em(inicioRecomendado, x) - em(inicioRecomendado, y) ||
        em(atividades, y).gravidade - em(atividades, x).gravidade ||
        prazoEfetivo(x) - prazoEfetivo(y) ||
        x - y
      )
    })
    .map((i) => em(atividades, i).id)

  // Carga mensal e métricas, sempre sobre o mesmo horizonte.
  const carga = cargaDaRede(rede, inicio)
  const cargaSemNivelamento = cargaDaRede(rede, semNivelamento)
  const meses: number[] = []
  for (let m = primeiroMes; m <= ultimoMes; m++) meses.push(m)
  const horas = meses.map((m) => carga.get(m) ?? 0)

  let picoHoras = 0
  let mesDoPico = primeiroMes
  horas.forEach((h, k) => {
    if (h > picoHoras + EPS) {
      picoHoras = h
      mesDoPico = em(meses, k)
    }
  })
  const mediaHoras = horas.reduce((soma, h) => soma + h, 0) / horas.length
  const variancia = horas.reduce((soma, h) => soma + (h - mediaHoras) ** 2, 0) / horas.length
  let horasForaDoHorizonte = 0
  for (const [m, h] of carga) if (m > ultimoMes) horasForaDoHorizonte += h

  let zonaCritica = 0
  let atrasadas = 0
  const antecedenciaGraves: number[] = []
  atividades.forEach((a, i) => {
    if (a.prazo === null) return
    const fim = em(fimPlanejado, i)
    if (fim > a.prazo - em(p.margens, a.gravidade)) zonaCritica++
    if (fim > a.prazo) atrasadas++
    if (em(p.graves, a.gravidade)) antecedenciaGraves.push(a.prazo - fim)
  })

  const metricas: Metricas = {
    picoHoras: arredondar(picoHoras),
    mesDoPico: rotuloDoMes(mesDoPico),
    mediaHoras: arredondar(mediaHoras),
    coeficienteVariacao: mediaHoras > EPS ? arredondar(Math.sqrt(variancia) / mediaHoras) : 0,
    zonaCritica,
    atrasadas,
    antecedenciaGravesMediana: mediana(antecedenciaGraves),
    antecedenciaGravesMinima:
      antecedenciaGraves.length === 0 ? null : Math.min(...antecedenciaGraves),
    horasForaDoHorizonte: arredondar(horasForaDoHorizonte),
  }

  return {
    ok: true,
    plano: {
      versaoMotor: VERSAO_DO_MOTOR,
      versaoParametros: p.versao,
      estrategia: e,
      hoje: paraData(hojeDia),
      itens: itens.filter((item) => item !== undefined),
      triagem,
      cargaMensal: meses.map((m, k) => ({
        mes: rotuloDoMes(m),
        horas: arredondar(em(horas, k)),
        horasSemNivelamento: arredondar(cargaSemNivelamento.get(m) ?? 0),
      })),
      metricas,
      avisos: avisosGerais,
    },
  }
}
