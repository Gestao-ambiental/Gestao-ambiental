// Funções comuns às telas de registro de MTR e CDF (resíduos, fase 1, sem integração com o IMA).
// Protótipo para revisão.

import { formatarQuantidade, normalizarCnpj, situacaoDoCnpj } from '@gestao-ambiental/domain'

import type { ItemDoMtr } from '@/lib/api/residuos'

/** Caminho da lista de MTRs do empreendimento (rota sugerida ao integrador). */
export function caminhoDosMtrs(empreendimentoId: string): string {
  return `/empreendimentos/${empreendimentoId}/residuos`
}

/** "200301 · 1,5 t" de cada item; mostra até `maximo` e conta o resto. */
export function resumoDosItens(itens: ItemDoMtr[], maximo = 2): string {
  const vistos = itens
    .slice(0, maximo)
    .map((i) => `${i.residuoCodigo} · ${formatarQuantidade(i.quantidade, i.unidade)}`)
  const resto = itens.length - vistos.length
  return resto > 0 ? `${vistos.join('; ')} e mais ${String(resto)}` : vistos.join('; ')
}

/** Quantidade gravada no formato que a pessoa digita ("1.234,5"), sem unidade. */
export function quantidadeParaTexto(quantidade: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(quantidade)
}

/** CNPJ opcional do formulário: vazio vira nulo; incompleto é erro da tela. */
export function cnpjDoCampo(texto: string): string | null {
  return situacaoDoCnpj(texto) === 'vazio' ? null : normalizarCnpj(texto)
}

/** `?registrar=cdf` na lista de MTRs abre o registro do CDF (link da conferência). */
export const PARAMETRO_REGISTRAR = 'registrar'

/** Lista de MTRs do empreendimento já com o registro do CDF aberto. */
export function caminhoParaRegistrarCdf(empreendimentoId: string): string {
  return `${caminhoDosMtrs(empreendimentoId)}?${PARAMETRO_REGISTRAR}=cdf`
}
