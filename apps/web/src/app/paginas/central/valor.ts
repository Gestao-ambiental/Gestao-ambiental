// Métricas de valor da central: o que cada uma mostra, com a unidade, e a formatação.

import { formatarReais, picoSobreMedia, proporcao } from '@gestao-ambiental/domain'
import { useQuery } from '@tanstack/react-query'

import { obterMetricasDeValor, type MetricasDoMes } from '@/lib/api/metricas-de-valor'

export type Unidade = 'percentual' | 'dias' | 'dias_uteis' | 'reais' | 'quantidade' | 'razao'

export interface Metrica {
  rotulo: string
  unidade: Unidade
  valor: (m: MetricasDoMes) => number | null
}

/** Grupo de métricas: prazos, orçamentos e saúde. A ordem é a da tela. */
export const GRUPOS: { titulo: string; metricas: Metrica[] }[] = [
  {
    titulo: 'Prazos',
    metricas: [
      {
        rotulo: 'Entregas no prazo',
        unidade: 'percentual',
        valor: (m) => proporcao(m.prazoCumpridas, m.prazoPrevistas),
      },
      {
        rotulo: 'Antes da meta interna',
        unidade: 'percentual',
        valor: (m) => proporcao(m.metaCumpridas, m.metaPrevistas),
      },
      { rotulo: 'Antecedência média', unidade: 'dias_uteis', valor: (m) => m.antecedenciaMedia },
      {
        rotulo: 'Urgências',
        unidade: 'quantidade',
        valor: (m) => (m.prazoCumpridas > 0 ? m.urgencias : null),
      },
      {
        rotulo: 'Não planejadas',
        unidade: 'percentual',
        valor: (m) => proporcao(m.naoPlanejadas, m.criadas),
      },
      {
        rotulo: 'Atrasadas',
        unidade: 'quantidade',
        valor: (m) => (m.prazoPrevistas > 0 ? m.atrasadas : null),
      },
      {
        rotulo: 'Dias de atraso',
        unidade: 'dias',
        valor: (m) => (m.prazoPrevistas > 0 ? m.diasDeAtraso : null),
      },
      {
        rotulo: 'Renovações protegidas',
        unidade: 'percentual',
        valor: (m) => proporcao(m.renovacoesProtegidas, m.renovacoesVencendo),
      },
      {
        rotulo: 'Carga: pico ÷ média',
        unidade: 'razao',
        valor: (m) => picoSobreMedia(m.cargaPico, m.cargaEntregas, m.cargaCelulas),
      },
    ],
  },
  {
    titulo: 'Orçamentos',
    metricas: [
      { rotulo: 'Da criação ao envio', unidade: 'dias', valor: (m) => m.diasAteEnvio },
      { rotulo: 'Do envio à decisão', unidade: 'dias', valor: (m) => m.diasAteDecisao },
      {
        rotulo: 'Aprovação',
        unidade: 'percentual',
        valor: (m) => proporcao(m.orcamentosAprovados, m.orcamentosDecididos),
      },
      {
        rotulo: 'Ticket médio aprovado',
        unidade: 'reais',
        valor: (m) => m.ticketMedioAprovadoCentavos,
      },
      {
        rotulo: 'Preço pelos custos',
        unidade: 'percentual',
        valor: (m) => proporcao(m.orcamentosPelosCustos, m.orcamentosCriados),
      },
      {
        rotulo: 'Preço digitado',
        unidade: 'percentual',
        valor: (m) => proporcao(m.orcamentosPrecoDigitado, m.orcamentosCriados),
      },
    ],
  },
  {
    titulo: 'Saúde',
    metricas: [
      {
        rotulo: 'Condicionantes com responsável',
        unidade: 'percentual',
        valor: (m) =>
          m.condicionantesAtivas === null || m.condicionantesComResponsavel === null
            ? null
            : proporcao(m.condicionantesComResponsavel, m.condicionantesAtivas),
      },
      {
        rotulo: 'Concluídas com evidência',
        unidade: 'percentual',
        valor: (m) => proporcao(m.concluidasComEvidencia, m.concluidas),
      },
    ],
  },
]

const SEM_DADOS = 'sem dados'

const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

function comSinal(texto: string, numero: number): string {
  if (numero > 0) return `+${texto}`
  if (numero < 0) return `−${texto}`
  return texto
}

/** Valor com o rótulo da unidade; nulo vira "sem dados". */
export function formatarValor(valor: number | null, unidade: Unidade): string {
  if (valor === null) return SEM_DADOS
  switch (unidade) {
    case 'percentual':
      return `${String(Math.round(valor * 100))}%`
    case 'dias':
      return `${decimal.format(valor)} ${valor === 1 ? 'dia' : 'dias'}`
    case 'dias_uteis':
      return `${decimal.format(valor)} ${valor === 1 ? 'dia útil' : 'dias úteis'}`
    case 'reais':
      return formatarReais(Math.round(valor))
    case 'razao':
      return `${decimal.format(valor)}×`
    case 'quantidade':
      return String(valor)
  }
}

/** Variação contra o mês anterior, com sinal e unidade; sem um dos dois meses, nada. */
export function formatarVariacao(diferenca: number | null, unidade: Unidade): string | null {
  if (diferenca === null) return null
  switch (unidade) {
    case 'percentual': {
      const pontos = Math.round(diferenca * 100)
      return comSinal(`${String(Math.abs(pontos))} p.p.`, pontos)
    }
    case 'reais':
      return comSinal(formatarReais(Math.abs(Math.round(diferenca))), diferenca)
    case 'dias':
    case 'dias_uteis':
      return comSinal(
        `${decimal.format(Math.abs(diferenca))} ${unidade === 'dias' ? 'dias' : 'dias úteis'}`,
        diferenca,
      )
    case 'razao':
      return comSinal(`${decimal.format(Math.abs(diferenca))}×`, diferenca)
    case 'quantidade':
      return comSinal(String(Math.abs(diferenca)), diferenca)
  }
}

/** Nenhum mês tem qualquer contagem: nada para mostrar. */
export function semNenhumDado(meses: readonly MetricasDoMes[]): boolean {
  return meses.every(
    (m) =>
      m.prazoPrevistas +
        m.metaPrevistas +
        m.criadas +
        m.renovacoesVencendo +
        m.cargaEntregas +
        m.orcamentosEnviados +
        m.orcamentosDecididos +
        m.orcamentosCriados +
        m.concluidas +
        (m.condicionantesAtivas ?? 0) ===
      0,
  )
}

/** Consulta das métricas com os estados de carregando, erro, sem permissão e vazio. */
export function useMetricasDeValor(consultoriaId: string | null) {
  return useQuery({
    queryKey: ['central', 'valor', consultoriaId],
    queryFn: () => obterMetricasDeValor(consultoriaId),
  })
}
