// Atalhos do Ctrl+K (ADR-0041): lista própria, separada do menu. Tirar uma tela do menu não a tira
// da busca (a Triagem de licenciamento e o Planejamento ficam fora do menu e continuam aqui). Papel e
// recurso do plano só escondem o atalho (apresentação); quem barra de verdade é o banco.
import type { PapelMembro } from '@gestao-ambiental/domain'

import type { NomeIcone } from '@/components/ui/icone'
import type { RecursoDoPlanoNoFront } from '@/lib/api/recursos'

import { ITENS_NAVEGACAO } from '../navegacao'
import { ABAS_DE_CONFIGURACOES } from '../paginas/configuracoes/abas-de-configuracoes'

export interface AtalhoDaBusca {
  para: string
  rotulo: string
  icone: NomeIcone
  /** Destino abre uma tela; ação abre a tela já no ponto de fazer algo. */
  tipo: 'destino' | 'acao'
  somenteGestao?: boolean
  /** Só aparece quando o plano da consultoria tem o recurso (ADR-0030). */
  recurso?: RecursoDoPlanoNoFront
}

export const ROTULO_DO_TIPO_DE_ATALHO = { destino: 'Ir para', acao: 'Ações' } as const

/** Cada aba de Configurações (ou cada seção, na aba que tem seções); todas são da Gestão. */
const ATALHOS_DE_CONFIGURACOES: readonly AtalhoDaBusca[] = ABAS_DE_CONFIGURACOES.flatMap((aba) =>
  (aba.secoes ?? [{ para: aba.para, rotulo: aba.rotuloNaBusca ?? aba.rotulo }]).map(
    (secao): AtalhoDaBusca => ({
      para: secao.para,
      rotulo: secao.rotulo,
      icone: aba.icone,
      tipo: 'destino',
      somenteGestao: true,
      recurso: aba.recurso,
    }),
  ),
)

export const ATALHOS_DA_BUSCA: readonly AtalhoDaBusca[] = [
  ...ITENS_NAVEGACAO.map(({ para, rotulo, icone, somenteGestao }): AtalhoDaBusca => ({
    para,
    rotulo,
    icone,
    somenteGestao,
    tipo: 'destino',
  })),
  { para: '/triagem', rotulo: 'Triagem de licenciamento', icone: 'signpost', tipo: 'destino' },
  {
    para: '/planejamento',
    rotulo: 'Planejamento',
    icone: 'square-kanban',
    tipo: 'destino',
    somenteGestao: true,
    recurso: 'capacidade',
  },
  ...ATALHOS_DE_CONFIGURACOES,
  // Conta.
  { para: '/perfil', rotulo: 'Meu perfil', icone: 'circle-user', tipo: 'destino' },
  { para: '/seguranca', rotulo: 'Segurança', icone: 'lock', tipo: 'destino' },
  // Ações que já têm rota.
  {
    para: '/licencas/nova',
    rotulo: 'Cadastrar licença',
    icone: 'plus',
    tipo: 'acao',
    somenteGestao: true,
  },
  {
    para: '/orcamentos/novo',
    rotulo: 'Novo orçamento',
    icone: 'file-plus',
    tipo: 'acao',
    somenteGestao: true,
    recurso: 'orcamentos',
  },
  {
    para: '/configuracoes/modelos/novo',
    rotulo: 'Novo modelo de documento',
    icone: 'file-plus',
    tipo: 'acao',
    somenteGestao: true,
  },
]

/** Recursos do plano que algum atalho pede (para consultar uma vez cada). */
export const RECURSOS_DOS_ATALHOS: readonly RecursoDoPlanoNoFront[] = [
  ...new Set(ATALHOS_DA_BUSCA.flatMap((a) => (a.recurso ? [a.recurso] : []))),
]

/** Atalhos que este papel e este plano veem. */
export function atalhosVisiveis(
  papel: PapelMembro,
  liberados: ReadonlySet<RecursoDoPlanoNoFront>,
): AtalhoDaBusca[] {
  return ATALHOS_DA_BUSCA.filter(
    (a) => (!a.somenteGestao || papel === 'gestao') && (!a.recurso || liberados.has(a.recurso)),
  )
}
