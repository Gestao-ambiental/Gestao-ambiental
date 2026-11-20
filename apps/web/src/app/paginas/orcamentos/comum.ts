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

/** Campo nativo de uma linha: o mesmo do design system (estilos-campo), num lugar só. */
export { classeCampo } from '@/components/ui/estilos-campo'

/** Cabeçalho e célula das tabelas de orçamento, no padrão do quadro. */
export const classeCabecalho =
  'h-10 border-b px-(--e-2) text-left rotulo-maiusculo text-(--tinta-2) whitespace-nowrap first:pl-(--e-4) last:pr-(--e-4)'
export const classeCelula =
  'h-(--linha) border-b border-(--regra-leve) px-(--e-2) py-(--e-15) align-middle first:pl-(--e-4) last:pr-(--e-4)'

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

/** Etapas do editor de orçamento, na ordem em que o orçamento se forma. */
export const ETAPAS = [
  { id: 'servicos', titulo: 'Serviços' },
  { id: 'preco', titulo: 'Preço e margem' },
  { id: 'parcelas', titulo: 'Parcelas' },
] as const
