// Cópia de packages/domain/src/aviso-de-norma.ts para o Edge (Deno não lê packages/domain). O
// teste do domínio confere que o corpo é igual: mude lá e copie para cá.

export type TipoDeMudancaDeNorma = 'nova' | 'alterada' | 'revogada' | 'republicada'

export const ROTULO_DA_MUDANCA: Record<TipoDeMudancaDeNorma, string> = {
  nova: 'Norma nova',
  alterada: 'Norma alterada',
  revogada: 'Norma revogada',
  republicada: 'Norma republicada',
}

/** E-mail na hora: só revogação que alcança ao menos uma licença ativa. */
export function pedeEmailNaHora(tipo: string, licencasAtivasAfetadas: number): boolean {
  return tipo === 'revogada' && licencasAtivasAfetadas > 0
}

export interface MudancaNoResumo {
  tipo: string
  normaTitulo: string
  empreendimentoNome: string | null
  licenca: string | null
}

/** "Norma revogada · IN 02 · Efluentes · Metalúrgica (LAO 4821/2023)", sem partes vazias. */
export function linhaDaMudanca(m: MudancaNoResumo): string {
  const rotulos: Partial<Record<string, string>> = ROTULO_DA_MUDANCA
  const rotulo = rotulos[m.tipo] ?? 'Mudança de norma'
  const onde = m.empreendimentoNome?.trim()
    ? m.licenca?.trim()
      ? `${m.empreendimentoNome.trim()} (${m.licenca.trim()})`
      : m.empreendimentoNome.trim()
    : ''
  return [rotulo, m.normaTitulo.trim(), onde].filter((parte) => parte.length > 0).join(' · ')
}
