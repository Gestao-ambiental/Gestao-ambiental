// Apresentação da exigência (ADR-0045): tom do selo e título. A situação vem do domínio.
import { situacaoDaExigencia, type SituacaoDaExigencia } from '@gestao-ambiental/domain'

import type { TomSelo } from '@/components/ui/selo'
import type { Exigencia } from '@/lib/api/exigencias'

export const TOM_DA_SITUACAO: Readonly<Record<SituacaoDaExigencia, TomSelo>> = {
  aberta: 'andamento',
  vence_hoje: 'atencao',
  atrasada: 'perigo',
  respondida: 'sucesso',
  respondida_fora_do_prazo: 'atencao',
}

export function situacaoDe(
  e: Pick<Exigencia, 'situacao' | 'prazoOficial' | 'primeiraRespostaEm' | 'hoje'>,
): SituacaoDaExigencia {
  return situacaoDaExigencia({
    situacao: e.situacao,
    prazoOficial: e.prazoOficial,
    primeiraRespostaEm: e.primeiraRespostaEm,
    hoje: e.hoje,
  })
}

/** "Ofício 112/2026" ou, sem número, o assunto. */
export function tituloDaExigencia(e: Pick<Exigencia, 'numeroOficio' | 'assunto'>): string {
  return e.numeroOficio ? `Ofício ${e.numeroOficio}` : e.assunto
}
