// Situação de um requisito legal (ADR-0050, LEG-07): calculada a partir do que o banco devolve em
// listar_requisitos_do_empreendimento, nunca gravada. "Rever" é a regra central: a norma ganhou uma
// mudança publicada depois da última avaliação, então a avaliação pode não valer mais.

import type { DataCivil } from './data-civil'

export type SituacaoDoRequisito =
  | 'sugerido'
  | 'nao_se_aplica'
  | 'nao_avaliado'
  | 'rever'
  | 'acao_atrasada'
  | 'nao_conforme'
  | 'conforme'

export interface RequisitoParaSituacao {
  /** Nulo = sugerido e ainda não decidido. */
  aplicavel: boolean | null
  avaliacaoResultado: 'conforme' | 'nao_conforme' | null
  /** Data civil da última avaliação. */
  avaliadaEm: DataCivil | null
  /** Instante da última mudança publicada da norma (ISO), ou nulo. */
  ultimaMudancaPublicadaEm: string | null
  /** Prazo da ação aberta mais próxima, ou nulo. */
  acaoPrazo: DataCivil | null
}

/** Rótulo de cada situação, como a tela escreve (a cor nunca é o único sinal). */
export const ROTULO_DA_SITUACAO_DO_REQUISITO: Readonly<Record<SituacaoDoRequisito, string>> = {
  sugerido: 'Sugerido',
  nao_se_aplica: 'Não se aplica',
  nao_avaliado: 'Não avaliado',
  rever: 'Rever',
  acao_atrasada: 'Ação atrasada',
  nao_conforme: 'Não conforme',
  conforme: 'Conforme',
}

/** Data civil (aaaa-mm-dd) do instante no fuso da consultoria. */
function dataNoFuso(instante: string, fuso: string): DataCivil {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instante))
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? ''
  return `${valor('year')}-${valor('month')}-${valor('day')}` as DataCivil
}

/**
 * Ordem de prioridade: decisão (sugerido, não se aplica), depois avaliação ausente, depois "rever"
 * (norma mudou no dia da avaliação ou depois), depois ação atrasada, e por fim o resultado.
 * Mudança no mesmo dia da avaliação conta como "rever": não dá para saber qual veio antes.
 */
export function situacaoDoRequisito(
  requisito: RequisitoParaSituacao,
  hoje: DataCivil,
  fuso = 'America/Sao_Paulo',
): SituacaoDoRequisito {
  if (requisito.aplicavel === null) return 'sugerido'
  if (!requisito.aplicavel) return 'nao_se_aplica'
  if (requisito.avaliacaoResultado === null || requisito.avaliadaEm === null) return 'nao_avaliado'
  if (
    requisito.ultimaMudancaPublicadaEm !== null &&
    dataNoFuso(requisito.ultimaMudancaPublicadaEm, fuso) >= requisito.avaliadaEm
  ) {
    return 'rever'
  }
  if (requisito.acaoPrazo !== null && requisito.acaoPrazo < hoje) return 'acao_atrasada'
  return requisito.avaliacaoResultado
}

/** Situações que pedem ação de alguém (para contar e ordenar na tela). */
export function requisitoPedeAtencao(situacao: SituacaoDoRequisito): boolean {
  return (
    situacao === 'sugerido' ||
    situacao === 'nao_avaliado' ||
    situacao === 'rever' ||
    situacao === 'acao_atrasada' ||
    situacao === 'nao_conforme'
  )
}
