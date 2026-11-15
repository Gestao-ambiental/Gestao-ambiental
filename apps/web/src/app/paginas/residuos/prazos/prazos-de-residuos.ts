// Resíduos, fase 1: apoio de apresentação para os prazos das obrigações de resíduos (página de
// obrigações, calendário e visão da equipe). Só apresentação; o cálculo é do banco e do domínio.

import {
  ROTULO_DA_OBRIGACAO_RESIDUO,
  formatarDataCivil,
  type DataCivil,
} from '@gestao-ambiental/domain'

import type { TomSelo } from '@/components/ui/selo'
import type { PrazoDeObrigacaoNoCalendario } from '@/lib/api/residuos'

/** Chave de cache dos prazos de resíduos (a página de obrigações invalida ao ligar ou desligar). */
export const CHAVE_PRAZOS_RESIDUO = 'prazos-residuo'

/** Caminho da página de obrigações, com o empreendimento escolhido quando houver. */
export function caminhoDosPrazosDeResiduo(empreendimentoId?: string | null): string {
  return empreendimentoId
    ? `/residuos/prazos?empreendimento=${encodeURIComponent(empreendimentoId)}`
    : '/residuos/prazos'
}

/** Quanto falta, sempre com palavra (a cor nunca é o único sinal). */
export function situacaoDoPrazoDeResiduo(dias: number): { texto: string; tom: TomSelo } {
  if (dias < 0) {
    return { texto: `Venceu há ${String(-dias)} ${dias === -1 ? 'dia' : 'dias'}`, tom: 'perigo' }
  }
  if (dias === 0) return { texto: 'Hoje', tom: 'atencao' }
  if (dias === 1) return { texto: 'Amanhã', tom: 'atencao' }
  return { texto: `Em ${String(dias)} dias`, tom: dias <= 7 ? 'atencao' : 'padrao' }
}

/** Prazos agrupados pelo dia do prazo, para juntar ao mapa `porDia` do calendário. */
export function agruparPrazosDeResiduoPorDia(
  prazos: readonly PrazoDeObrigacaoNoCalendario[],
): Map<DataCivil, PrazoDeObrigacaoNoCalendario[]> {
  const porDia = new Map<DataCivil, PrazoDeObrigacaoNoCalendario[]>()
  for (const prazo of prazos) porDia.set(prazo.prazo, [...(porDia.get(prazo.prazo) ?? []), prazo])
  return porDia
}

/** Texto completo do evento, para o `title` e para a lista do dia. */
export function descricaoDoPrazoDeResiduo(prazo: PrazoDeObrigacaoNoCalendario): string {
  return [
    'Prazo de resíduos',
    ROTULO_DA_OBRIGACAO_RESIDUO[prazo.tipo],
    prazo.referencia,
    prazo.empreendimentoNome,
    prazo.inicio
      ? `entrega de ${formatarDataCivil(prazo.inicio)} a ${formatarDataCivil(prazo.prazo)}`
      : `entrega até ${formatarDataCivil(prazo.prazo)}`,
  ].join(' · ')
}
