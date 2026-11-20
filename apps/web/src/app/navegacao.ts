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

/** Itens do menu principal, na ordem do Protótipo 05, em grupos curtos. */
export const ITENS_NAVEGACAO: readonly ItemNavegacao[] = [
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
  { para: '/triagem', rotulo: 'Triagem de licenciamento', icone: 'signpost', grupo: 'trabalho' },
  {
    para: '/orcamentos',
    rotulo: 'Orçamentos',
    icone: 'receipt',
    somenteGestao: true,
    grupo: 'gestao',
  },
  {
    para: '/resumo-do-mes',
    rotulo: 'Resumo do mês',
    icone: 'chart-column',
    somenteGestao: true,
    grupo: 'gestao',
  },
  {
    para: '/configuracoes/equipe',
    rotulo: 'Equipe',
    icone: 'users',
    somenteGestao: true,
    grupo: 'gestao',
  },
  {
    para: '/configuracoes/plano',
    rotulo: 'Plano e cobrança',
    icone: 'tag',
    somenteGestao: true,
    grupo: 'gestao',
  },
]
