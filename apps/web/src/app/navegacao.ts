import type { NomeIcone } from '@/components/ui/icone'

export interface ItemNavegacao {
  para: string
  rotulo: string
  icone: NomeIcone
  /** Só aparece para a Gestão (apresentação; o banco recusa a Equipe de qualquer forma). */
  somenteGestao?: boolean
}

/** Itens do menu principal, na ordem do Protótipo 05; ícones do vocabulário do design system. */
export const ITENS_NAVEGACAO: readonly ItemNavegacao[] = [
  { para: '/', rotulo: 'Visão da equipe', icone: 'list' },
  { para: '/calendario', rotulo: 'Calendário', icone: 'calendar' },
  { para: '/empreendimentos', rotulo: 'Empreendimentos', icone: 'briefcase' },
  { para: '/acompanhamentos', rotulo: 'Acompanhamentos', icone: 'inbox' },
  { para: '/configuracoes/equipe', rotulo: 'Equipe', icone: 'users', somenteGestao: true },
]
