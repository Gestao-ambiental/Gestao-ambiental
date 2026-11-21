// Aviso de mudança de norma (L7, ADR-0050 decisão 23, ADR-0055): as mudanças publicadas entram no
// resumo diário; e-mail na hora só para a revogação de norma que afeta licença ativa. Sem sino e
// sem e-mail por mudança. Cópia em supabase/functions/_shared/aviso-de-norma.ts (o Edge não lê
// packages/domain); apps/web/src/lib/espelho-do-edge.test.ts confere que as duas são iguais.

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
