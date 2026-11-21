import type { NomeIcone } from '@/components/ui/icone'

export interface ItemNavegacao {
  para: string
  rotulo: string
  icone: NomeIcone
  /** Só aparece para a Gestão (apresentação; o banco recusa a Equipe de qualquer forma). */
  somenteGestao?: boolean
  /** Grupo no trilho: sem grupo fica no topo. */
  grupo?: 'trabalho' | 'gestao'
  /** Aparece na barra inferior do celular (no máximo quatro; o resto vai para "Mais"). */
  naBarraInferior?: boolean
  /** Rótulo curto na barra inferior. */
  rotuloCurto?: string
}

export const ROTULO_DO_GRUPO = { trabalho: 'Trabalho', gestao: 'Gestão' } as const

/**
 * Itens do menu principal (ADR-0041): a Gestão vê 10, a Equipe 7. A Triagem de licenciamento e o
 * Planejamento ficam fora do menu (as rotas continuam); o Ctrl+K tem lista própria
 * (busca/atalhos.ts), então tirar um item daqui não o tira da busca.
 */
export const ITENS_NAVEGACAO: readonly ItemNavegacao[] = [
  // Visão pessoal: os prazos da pessoa em todas as consultorias dela, no topo do menu.
  {
    para: '/minha-semana',
    rotulo: 'Minha semana',
    rotuloCurto: 'Semana',
    icone: 'calendar-check',
    naBarraInferior: true,
  },
  {
    para: '/',
    rotulo: 'Visão da equipe',
    rotuloCurto: 'Início',
    icone: 'timer',
    naBarraInferior: true,
  },
  { para: '/calendario', rotulo: 'Calendário', icone: 'calendar', naBarraInferior: true },
  { para: '/empreendimentos', rotulo: 'Empreendimentos', icone: 'buildings', grupo: 'trabalho' },
  { para: '/acompanhamentos', rotulo: 'Acompanhamentos', icone: 'hourglass', grupo: 'trabalho' },
  { para: '/campo', rotulo: 'Campo', icone: 'clipboard', grupo: 'trabalho', naBarraInferior: true },
  { para: '/residuos', rotulo: 'Resíduos', icone: 'recycle', grupo: 'trabalho' },
  {
    para: '/orcamentos',
    rotulo: 'Orçamentos',
    icone: 'receipt',
    somenteGestao: true,
    grupo: 'gestao',
  },
  {
    para: '/painel',
    rotulo: 'Painel',
    icone: 'chart-column',
    somenteGestao: true,
    grupo: 'gestao',
  },
  {
    para: '/configuracoes',
    rotulo: 'Configurações',
    icone: 'settings',
    somenteGestao: true,
    grupo: 'gestao',
  },
]
