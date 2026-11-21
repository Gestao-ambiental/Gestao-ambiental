// Peças comuns da seção Vencimentos e do diálogo (ADR-0046), fora dos componentes por causa do
// fast refresh.
import type { Vencimento } from '@/lib/api/vencimentos'

/** "Alvará 200/2026" ou só "Alvará". */
export function descricaoDoVencimento(v: Pick<Vencimento, 'tipoNome' | 'numero'>): string {
  return [v.tipoNome, v.numero].filter(Boolean).join(' ')
}

/** Vigentes da série pela validade mais próxima; depois os renovados, do mais novo ao mais antigo. */
export function ordenarVencimentos(itens: readonly Vencimento[]): Vencimento[] {
  const vigentes = itens
    .filter((v) => !v.renovado)
    .sort((a, b) => a.validoAte.localeCompare(b.validoAte) || a.id.localeCompare(b.id))
  const renovados = itens
    .filter((v) => v.renovado)
    .sort((a, b) => b.validoAte.localeCompare(a.validoAte) || a.id.localeCompare(b.id))
  return [...vigentes, ...renovados]
}

/** Consultas que mudam quando um vencimento muda: a seção, a Visão e o Calendário. */
export function chavesDosVencimentos(empreendimentoId: string) {
  return [['vencimentos', empreendimentoId], ['prazos'], ['calendario']] as const
}
