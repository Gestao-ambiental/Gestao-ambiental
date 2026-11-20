// Peças da lista de orçamentos (Protótipo 19): placar do topo e abas por situação.

import { formatarReais } from '@gestao-ambiental/domain'

import { AbasDeFiltro } from '@/components/ui/abas'
import { Botao } from '@/components/ui/botao'
import { Esqueleto } from '@/components/ui/esqueleto'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { ItemDoPlacar, Placar } from '@/components/ui/placar'
import {
  ROTULO_DA_SITUACAO,
  type IndicadorDeOrcamentos,
  type ResumoDosOrcamentos,
  type SituacaoOrcamento,
} from '@/lib/api/orcamentos'

/** "R$ 19.100,00"; sem nenhum com preço (mas com orçamentos), "Sem preço": nunca vira zero. */
function valorDoIndicador(indicador: IndicadorDeOrcamentos): string {
  return indicador.quantidade > 0 && indicador.semPreco === indicador.quantidade
    ? 'Sem preço'
    : formatarReais(indicador.valorCentavos)
}

/** Só o que falta: com parte das propostas sem preço, a soma não conta tudo. */
function detalheDoIndicador(indicador: IndicadorDeOrcamentos): string | undefined {
  return indicador.semPreco > 0 && indicador.semPreco < indicador.quantidade
    ? `${String(indicador.semPreco)} sem preço`
    : undefined
}

function plural(quantidade: number, singular: string, varios: string): string {
  return `${String(quantidade)} ${quantidade === 1 ? singular : varios}`
}

/**
 * Placar do topo: em elaboração, aguardando decisão e aprovados (fora da lixeira). Números
 * grandes numa faixa só; o valor em reais é o que se lê de relance.
 */
export function IndicadoresDosOrcamentos({
  resumo,
  carregando,
  falhou,
  aoTentarDeNovo,
}: {
  resumo: ResumoDosOrcamentos | undefined
  carregando: boolean
  falhou: boolean
  aoTentarDeNovo: () => void
}) {
  if (falhou) {
    return (
      <MensagemSecao
        tom="perigo"
        acoes={
          <Botao tamanho="compacto" onClick={aoTentarDeNovo}>
            Tentar de novo
          </Botao>
        }
      >
        Não foi possível carregar os indicadores.
      </MensagemSecao>
    )
  }
  if (carregando || !resumo) {
    return (
      <div
        role="status"
        aria-label="Carregando indicadores"
        className="grid grid-cols-2 divide-x overflow-hidden rounded-(--raio-painel) border bg-(--folha) md:grid-cols-3"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-(--e-2) px-(--e-5) py-(--e-4) max-md:last:hidden"
          >
            <Esqueleto largura="60%" altura={32} />
            <Esqueleto largura="40%" />
          </div>
        ))}
      </div>
    )
  }
  return (
    <Placar rotulo="Indicadores" tamanho="medio">
      <ItemDoPlacar rotulo="Em elaboração" valor={resumo.emElaboracao} />
      <ItemDoPlacar
        rotulo="Aguardando decisão"
        valor={valorDoIndicador(resumo.aguardandoDecisao)}
        detalhe={detalheDoIndicador(resumo.aguardandoDecisao)}
        apagado={resumo.aguardandoDecisao.quantidade === 0}
      />
      <ItemDoPlacar
        rotulo="Aprovados"
        valor={valorDoIndicador(resumo.aprovados)}
        detalhe={detalheDoIndicador(resumo.aprovados)}
        apagado={resumo.aprovados.quantidade === 0}
      />
    </Placar>
  )
}

/** Valor da aba "Todas" (a situação nula). */
const TODAS = 'todas'

/** Abas da lista, na ordem do protótipo. Nula = todas. */
const ABAS: readonly (SituacaoOrcamento | null)[] = [
  null,
  'rascunho',
  'enviada',
  'negociacao',
  'aprovada',
  'recusada',
]

/**
 * Abas por situação, com a contagem de cada uma (segue a busca; zero não aparece). Filtram a mesma
 * lista abaixo (grupo de botões com aria-pressed, não trocam de painel). A contagem é lida junto com o
 * nome da aba.
 */
export function AbasDeSituacao({
  situacao,
  contagem,
  aoEscolher,
}: {
  situacao: SituacaoOrcamento | null
  contagem: Record<SituacaoOrcamento, number> | undefined
  aoEscolher: (situacao: SituacaoOrcamento | null) => void
}) {
  const todas = contagem ? Object.values(contagem).reduce((soma, n) => soma + n, 0) : null
  const lerContagem = (n: number) => plural(n, 'orçamento', 'orçamentos')
  return (
    <AbasDeFiltro<SituacaoOrcamento | typeof TODAS>
      rotulo="Situação"
      valor={situacao ?? TODAS}
      aoMudar={(valor) => {
        aoEscolher(valor === TODAS ? null : valor)
      }}
      abas={ABAS.map((aba) => ({
        valor: aba ?? TODAS,
        rotulo: aba ? ROTULO_DA_SITUACAO[aba] : 'Todas',
        contagem: aba ? contagem?.[aba] : todas,
        lerContagem,
      }))}
    />
  )
}
