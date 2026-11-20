// Peças comuns das telas de orçamento.

import {
  ESCALA_DA_QUANTIDADE,
  formatarReais,
  formatarReaisDigitados,
  numeroDoOrcamento,
  type FaixaDePreco,
  type UnidadeDeCobranca,
} from '@gestao-ambiental/domain'

/** Nome da unidade de cobrança na tela (ADR-0018). */
export const ROTULO_DA_UNIDADE: Record<UnidadeDeCobranca, string> = {
  hora: 'Hora',
  m2: 'm²',
  ha: 'Hectare',
  diaria: 'Diária',
  campanha: 'Campanha',
  pacote: 'Pacote (preço fechado)',
}

/** "/h", "/m²"…: depois do preço de uma unidade. O pacote não tem. */
export const SUFIXO_DA_UNIDADE: Record<UnidadeDeCobranca, string> = {
  hora: '/h',
  m2: '/m²',
  ha: '/ha',
  diaria: '/diária',
  campanha: '/campanha',
  pacote: '',
}

/**
 * Faixas para ler: "até 500 m²: R$ 2,00/m²", "acima de 500 m²: R$ 1,50/m²". Cada trecho paga o
 * valor da sua faixa; nunca se mostra uma média como tarifa (ADR-0018).
 */
export function textoDasFaixas(
  faixas: readonly FaixaDePreco[],
  unidade: UnidadeDeCobranca,
): string[] {
  return faixas.map((f, i) => {
    const anterior = i === 0 ? null : (faixas[i - 1]?.ateDezMilesimos ?? null)
    const limite =
      f.ateDezMilesimos === null
        ? `acima de ${textoDaQuantidade(anterior ?? 0, unidade)}`
        : `até ${textoDaQuantidade(f.ateDezMilesimos, unidade)}`
    return `${limite}: ${formatarReais(f.valorCentavos)}${SUFIXO_DA_UNIDADE[unidade]}`
  })
}

/** Como a quantidade aparece: "1.250 m²", "12,5 ha", "3 diárias". */
export function textoDaQuantidade(dezMilesimos: number, unidade: UnidadeDeCobranca): string {
  const valor = dezMilesimos / ESCALA_DA_QUANTIDADE
  const numero = valor.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
  switch (unidade) {
    case 'm2':
      return `${numero} m²`
    case 'ha':
      return `${numero} ha`
    case 'diaria':
      return `${numero} ${valor === 1 ? 'diária' : 'diárias'}`
    case 'campanha':
      return `${numero} ${valor === 1 ? 'campanha' : 'campanhas'}`
    default:
      return numero
  }
}

/** "1.250", "12,5" ou "0,0001" → quantidade × 10.000; vazio é nulo; inválido é undefined. */
export function lerQuantidade(texto: string): number | null | undefined {
  const limpo = texto.trim().replace(/\s/g, '')
  if (limpo === '') return null
  // "12," vale 12 enquanto a pessoa ainda digita as casas.
  if (!/^\d{1,3}(\.\d{3})*(,\d{0,4})?$|^\d{1,8}(,\d{0,4})?$/.test(limpo)) return undefined
  const [inteiro = '0', fracao = ''] = limpo.replace(/\./g, '').split(',')
  const valor = Number(inteiro) * ESCALA_DA_QUANTIDADE + Number(fracao.padEnd(4, '0'))
  return valor <= 99_999_999 * ESCALA_DA_QUANTIDADE ? valor : undefined
}

/** 125000 → "12,5" (para o campo de quantidade). */
export function campoDaQuantidade(dezMilesimos: number): string {
  return (dezMilesimos / ESCALA_DA_QUANTIDADE).toLocaleString('pt-BR', {
    maximumFractionDigits: 4,
    useGrouping: false,
  })
}

/** "ORC-2026-041" ou "ORC-2026-041 · rev. 2". */
export function numeroComRevisao(ano: number, sequencia: number, revisao: number): string {
  const numero = numeroDoOrcamento(ano, sequencia)
  return revisao > 1 ? `${numero} · rev. ${String(revisao)}` : numero
}

export const classeCampo =
  'h-(--controle) w-full rounded-(--raio) border border-(--campo-borda) border-b-(--campo-borda) bg-(--campo) px-(--e-2) corpo text-(--tinta) outline-none transicao-estado focus:border-b-(--campo-borda-ativa) focus:shadow-[inset_0_-1px_0_0_var(--campo-borda-ativa)] focus:bg-(--campo-foco) disabled:bg-(--off) disabled:text-(--tinta-off) aria-invalid:border-(--atraso)'

export const classeCabecalho =
  'h-10 border-b px-(--e-2) text-left rotulo whitespace-nowrap first:pl-(--e-3) last:pr-(--e-3)'
export const classeCelula = 'h-11 border-b px-(--e-2) align-middle first:pl-(--e-3) last:pr-(--e-3)'

/**
 * Valor de um campo de reais depois da tecla: com o ponto de milhar (40000 → 40.000). O cursor
 * fica depois do mesmo número que estava antes, mesmo com os pontos entrando ou saindo.
 */
export function reaisDigitados(evento: { target: HTMLInputElement }): string {
  const campo = evento.target
  const bruto = campo.value
  const formatado = formatarReaisDigitados(bruto)
  if (formatado === bruto) return bruto
  const cursor = campo.selectionStart ?? bruto.length
  const antes = bruto.slice(0, cursor).replace(/[^\d,]/g, '').length
  let posicao = 0
  for (let vistos = 0; posicao < formatado.length && vistos < antes; posicao++) {
    if (/[\d,]/.test(formatado.charAt(posicao))) vistos++
  }
  // Só ajusta se o campo ainda mostra este valor: com outra tecla no mesmo quadro, a posição
  // calculada aqui já não vale, e mexer no cursor embaralharia os dígitos.
  requestAnimationFrame(() => {
    if (document.activeElement === campo && campo.value === formatado) {
      campo.setSelectionRange(posicao, posicao)
    }
  })
  return formatado
}
