// Peças da lista de orçamentos (Protótipo 19): indicadores do topo e abas por situação.

import { formatarReais } from '@gestao-ambiental/domain'
import { useEffect, useRef } from 'react'

import { Botao } from '@/components/ui/botao'
import { Esqueleto } from '@/components/ui/esqueleto'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  ROTULO_DA_SITUACAO,
  type IndicadorDeOrcamentos,
  type ResumoDosOrcamentos,
  type SituacaoOrcamento,
} from '@/lib/api/orcamentos'
import { cn } from '@/lib/utils'

const classeCartao =
  'flex min-w-0 flex-col gap-(--e-1) rounded-(--raio-painel) border bg-(--folha) p-(--e-3) shadow-cartao sm:p-(--e-4)'

function plural(quantidade: number, singular: string, varios: string): string {
  return `${String(quantidade)} ${quantidade === 1 ? singular : varios}`
}

/** "R$ 19.100,00"; sem nenhum com preço (mas com orçamentos), "Sem preço": nunca vira zero. */
function valorDoIndicador(indicador: IndicadorDeOrcamentos): string {
  return indicador.quantidade > 0 && indicador.semPreco === indicador.quantidade
    ? 'Sem preço'
    : formatarReais(indicador.valorCentavos)
}

function detalheDoIndicador(indicador: IndicadorDeOrcamentos): string {
  const propostas = plural(indicador.quantidade, 'proposta', 'propostas')
  return indicador.semPreco > 0
    ? `${propostas} · ${String(indicador.semPreco)} sem preço`
    : propostas
}

function Indicador({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe: string }) {
  return (
    <div className={classeCartao}>
      <dt className="corpo text-(--tinta-2)">{titulo}</dt>
      <dd className="titulo-tela text-(--tinta) tabular-nums">{valor}</dd>
      <dd className="corpo text-(--tinta)">{detalhe}</dd>
    </div>
  )
}

/** Indicadores do topo: em elaboração, aguardando decisão e aprovados (fora da lixeira). */
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
        className="grid grid-cols-1 gap-(--e-3) sm:grid-cols-3"
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className={classeCartao}>
            <Esqueleto largura="50%" />
            <Esqueleto largura="70%" altura={24} />
            <Esqueleto largura="40%" />
          </div>
        ))}
      </div>
    )
  }
  return (
    <dl aria-label="Indicadores" className="grid grid-cols-1 gap-(--e-3) sm:grid-cols-3">
      <Indicador
        titulo="Em elaboração"
        valor={String(resumo.emElaboracao)}
        detalhe={resumo.emElaboracao === 1 ? 'rascunho' : 'rascunhos'}
      />
      <Indicador
        titulo="Aguardando decisão"
        valor={valorDoIndicador(resumo.aguardandoDecisao)}
        detalhe={detalheDoIndicador(resumo.aguardandoDecisao)}
      />
      <Indicador
        titulo="Aprovados"
        valor={valorDoIndicador(resumo.aprovados)}
        detalhe={detalheDoIndicador(resumo.aprovados)}
      />
    </dl>
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
 * Abas por situação, com a contagem de cada uma (segue a busca). Grupo de botões com aria-pressed:
 * filtram a mesma lista, não trocam de painel. A contagem é lida junto com o nome da aba.
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
      className="relative max-w-full min-w-0 overflow-x-auto px-1 pt-1"
    >
      <div className="flex min-w-max gap-(--e-4) border-b">
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
                '-mb-px inline-flex cursor-pointer items-center gap-(--e-15) whitespace-nowrap border-b-2 pb-(--e-2) transicao-estado',
                ativa
                  ? 'border-(--marca-linha) corpo-medio text-(--link)'
                  : 'border-transparent corpo text-(--tinta-2) hover:text-(--tinta)',
              )}
            >
              {rotulo}
              {quantidade === null ? null : (
                <>
                  <span
                    aria-hidden="true"
                    className="rounded-(--raio) bg-(--toque) px-1.5 text-xs tabular-nums"
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
