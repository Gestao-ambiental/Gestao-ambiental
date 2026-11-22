// Abas de Configurações (ADR-0041): aba nova entra com uma linha aqui (e a rota em rotas.tsx); o
// Ctrl+K (busca/atalhos.ts) lê esta lista, então a aba nova também vira atalho.
// Papel e recurso do plano só escondem a aba (apresentação); quem barra de verdade é o banco.
import type { NomeIcone } from '@/components/ui/icone'
import type { RecursoDoPlanoNoFront } from '@/lib/api/recursos'

export interface SecaoDeConfiguracoes {
  para: string
  rotulo: string
}

export interface AbaDeConfiguracoes {
  /** Rota da aba (a primeira seção, quando há seções). */
  para: string
  rotulo: string
  /** Nome no Ctrl+K, quando o da aba é curto demais fora da tela (ex.: Modelos de documento). */
  rotuloNaBusca?: string
  icone: NomeIcone
  /** Só aparece quando o plano da consultoria tem o recurso (ADR-0030). */
  recurso?: RecursoDoPlanoNoFront
  /** Rotas da mesma aba, escolhidas por um segmentado abaixo das abas. */
  secoes?: readonly SecaoDeConfiguracoes[]
}

export const ABAS_DE_CONFIGURACOES: readonly AbaDeConfiguracoes[] = [
  { para: '/configuracoes/equipe', rotulo: 'Equipe', icone: 'users' },
  { para: '/configuracoes/plano', rotulo: 'Plano e cobrança', icone: 'tag' },
  {
    para: '/configuracoes/custos',
    rotulo: 'Orçamentos',
    icone: 'receipt',
    recurso: 'orcamentos',
    secoes: [
      { para: '/configuracoes/custos', rotulo: 'Custos e taxas' },
      { para: '/configuracoes/proposta', rotulo: 'Dados da proposta' },
    ],
  },
  {
    para: '/configuracoes/modelos',
    rotulo: 'Modelos',
    rotuloNaBusca: 'Modelos de documento',
    icone: 'file-doc',
  },
  {
    para: '/configuracoes/importar',
    rotulo: 'Importar',
    rotuloNaBusca: 'Importar planilha',
    icone: 'upload',
  },
  {
    para: '/configuracoes/ia',
    rotulo: 'IA',
    rotuloNaBusca: 'Conferência por IA',
    icone: 'sparkles',
    recurso: 'ia',
  },
  {
    para: '/configuracoes/vencimentos',
    rotulo: 'Vencimentos',
    rotuloNaBusca: 'Tipos de vencimento',
    icone: 'calendar-check',
  },
]

/** Recursos do plano que alguma aba pede (para consultar uma vez cada). */
export const RECURSOS_DAS_ABAS: readonly RecursoDoPlanoNoFront[] = [
  ...new Set(ABAS_DE_CONFIGURACOES.flatMap((a) => (a.recurso ? [a.recurso] : []))),
]

/** Abas que este plano mostra; sem a resposta do recurso, a aba fica de fora. */
export function abasDeConfiguracoesVisiveis(
  liberados: ReadonlySet<RecursoDoPlanoNoFront>,
  abas: readonly AbaDeConfiguracoes[] = ABAS_DE_CONFIGURACOES,
): AbaDeConfiguracoes[] {
  return abas.filter((a) => !a.recurso || liberados.has(a.recurso))
}

/** Aba dona do caminho (a própria rota, uma seção ou um detalhe abaixo dela). */
export function abaDoCaminho(
  caminho: string,
  abas: readonly AbaDeConfiguracoes[] = ABAS_DE_CONFIGURACOES,
): AbaDeConfiguracoes | undefined {
  const dentro = (para: string) => caminho === para || caminho.startsWith(`${para}/`)
  return abas.find((a) => (a.secoes ?? [a]).some((s) => dentro(s.para)))
}
