// Peças da lista de orçamentos (Protótipo 19): placar do topo e abas por situação.

import { formatarReais } from '@gestao-ambiental/domain'
import { useEffect, useRef } from 'react'

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
import { cn } from '@/lib/utils'

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
 * Abas por situação, com a contagem de cada uma (segue a busca; zero não aparece). Grupo de botões
 * com aria-pressed: filtram a mesma lista, não trocam de painel. A contagem é lida junto com o nome
 * da aba.
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
  const grupo = useRef<HTMLDivElement>(null)

  // No celular, a aba escolhida (ex.: aberta pela URL) entra na área visível da faixa, sem mexer
  // na rolagem da página (scrollIntoView rolaria a página até as abas).
  useEffect(() => {
    const faixa = grupo.current
    const ativa = faixa?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!faixa || !ativa) return
    const fora =
      ativa.offsetLeft < faixa.scrollLeft ||
      ativa.offsetLeft + ativa.offsetWidth > faixa.scrollLeft + faixa.clientWidth
    if (fora) faixa.scrollLeft = Math.max(0, ativa.offsetLeft - 8)
    // As contagens mudam a largura das abas: refaz quando chegam.
  }, [situacao, todas])

  return (
    // Rola na própria região no celular; o respiro em volta deixa o foco visível inteiro.
    <div
      ref={grupo}
      role="group"
      aria-label="Situação"
      className="relative -mx-1 max-w-[calc(100%+8px)] min-w-0 overflow-x-auto px-1 pt-1 [scrollbar-width:none]"
    >
      <div className="flex w-max min-w-full gap-(--e-5) border-b border-(--regra-forte)">
        {ABAS.map((aba) => {
          const ativa = situacao === aba
          const rotulo = aba ? ROTULO_DA_SITUACAO[aba] : 'Todas'
          const quantidade = aba ? (contagem?.[aba] ?? null) : todas
          return (
            <button
              key={aba ?? 'todas'}
              type="button"
              aria-pressed={ativa}
              onClick={() => {
                aoEscolher(aba)
              }}
              className={cn(
                '-mb-px inline-flex h-11 cursor-pointer items-center gap-(--e-2) border-b-[3px] whitespace-nowrap titulo-secao transicao-estado',
                ativa
                  ? 'border-(--marca-linha) text-(--tinta)'
                  : 'border-transparent text-(--tinta-2) hover:text-(--tinta)',
              )}
            >
              {rotulo}
              {quantidade === null || quantidade === 0 ? null : (
                <>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'min-w-6 rounded-(--raio-mini) px-(--e-1) text-center text-xs font-[800] numero',
                      ativa ? 'bg-(--tinta) text-(--folha)' : 'bg-(--aperto) text-(--tinta-2)',
                    )}
                  >
                    {quantidade}
                  </span>
                  <span className="sr-only">: {plural(quantidade, 'orçamento', 'orçamentos')}</span>
                </>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
