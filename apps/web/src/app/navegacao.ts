import {
  Building2,
  CalendarDays,
  ClipboardCheck,
  LayoutList,
  Users,
  type LucideIcon,
} from 'lucide-react'

export interface ItemNavegacao {
  para: string
  rotulo: string
  icone: LucideIcon
}

/** Itens do menu principal, na ordem do Protótipo 05. */
export const ITENS_NAVEGACAO: readonly ItemNavegacao[] = [
  { para: '/', rotulo: 'Visão da equipe', icone: LayoutList },
  { para: '/calendario', rotulo: 'Calendário', icone: CalendarDays },
  { para: '/empreendimentos', rotulo: 'Empreendimentos', icone: Building2 },
  { para: '/acompanhamentos', rotulo: 'Acompanhamentos', icone: ClipboardCheck },
  { para: '/configuracoes/equipe', rotulo: 'Equipe', icone: Users },
]
