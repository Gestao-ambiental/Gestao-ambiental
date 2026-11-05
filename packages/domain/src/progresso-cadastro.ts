// Em que passo do cadastro de licença (Protótipos 10 a 14) um rascunho parou. Os critérios são os
// mesmos que o banco confere para ativar o plano (public.ativar_plano): identificação completa,
// condicionantes revisadas e prazos das obrigações confirmados. Só apresentação: quem decide a
// ativação é o banco.

/** Documento, Identificação, Condicionantes, Prazos, Responsáveis. */
export const TOTAL_PASSOS_CADASTRO = 5

export interface EstadoDoRascunho {
  /** Tipo, marco e validade preenchidos. */
  identificacaoCompleta: boolean
  /** Condicionantes não descartadas (agrupadores incluídos). */
  condicionantes: number
  /** Condicionantes ainda com revisão pendente. */
  condicionantesPendentes: number
  /** Obrigações aceitas sem prazo confirmado. */
  prazosPendentes: number
}

/**
 * Índice (0 a 4) do passo atual: o primeiro ainda não concluído. O documento (0) já passou, porque
 * o rascunho nasce nele; os responsáveis (4) só terminam na ativação.
 */
export function passoDoRascunho(estado: EstadoDoRascunho): number {
  if (!estado.identificacaoCompleta) return 1
  if (estado.condicionantes === 0 || estado.condicionantesPendentes > 0) return 2
  if (estado.prazosPendentes > 0) return 3
  return 4
}
