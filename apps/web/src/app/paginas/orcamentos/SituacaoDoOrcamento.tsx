// Situação manual do orçamento (ORC-04; ADR-0018, fatia 6, P9). Quem muda e quando fica no histórico.
// Aprovar abre o registro do aceite com as tarefas da execução (ADR-0029, DialogoAprovarOrcamento);
// as outras mudanças só trocam a situação. Só "aprovada" conta na carga.

import { useId, useState } from 'react'

import { Botao } from '@/components/ui/botao'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  PROXIMAS_SITUACOES,
  ROTULO_DA_SITUACAO,
  mudarSituacaoOrcamento,
  type Orcamento,
  type SituacaoOrcamento,
} from '@/lib/api/orcamentos'
import { formatarInstanteComoData } from '@/lib/datas'
import { mensagemDoErro } from '@/lib/erros'

import { classeCampo } from './comum'
import { DialogoAprovarOrcamento } from './DialogoAprovarOrcamento'

/** Rótulo do botão de cada mudança. */
function rotuloDaAcao(para: SituacaoOrcamento, revisao: number): string {
  switch (para) {
    case 'enviada':
      return 'Marcar como enviada'
    case 'negociacao':
      return 'Em negociação'
    case 'aprovada':
      return 'Registrar aprovação'
    case 'recusada':
      return 'Marcar como recusada'
    case 'rascunho':
      return `Reabrir como revisão ${String(revisao + 1)}`
  }
}

/** O que acontece com a mudança, em uma frase. */
function explicacao(de: SituacaoOrcamento, para: SituacaoOrcamento, revisao: number): string {
  if (para === 'rascunho')
    return `Volta a rascunho como revisão ${String(revisao + 1)}, uma nova versão para editar. O histórico guarda quando foi reaberta.${de === 'aprovada' ? ' Deixa de contar na carga da equipe até ser aprovado de novo.' : ''}`
  if (de === 'rascunho')
    return 'A proposta deixa de ser editada no lugar; para mudar depois, reabra como nova revisão.'
  if (para === 'recusada') return 'Fica registrado que o cliente recusou. Dá para reabrir depois.'
  return 'Fica registrado que a proposta está em negociação.'
}

export function SituacaoDoOrcamento({
  orcamento,
  alterado,
  fuso,
  aoMudar,
}: {
  orcamento: Pick<
    Orcamento,
    'id' | 'rowVersion' | 'situacao' | 'revisao' | 'historicoSituacao' | 'itens'
  >
  alterado: boolean
  fuso: string
  aoMudar: (para: SituacaoOrcamento) => void
}) {
  const idObservacao = useId()
  const [para, setPara] = useState<SituacaoOrcamento | null>(null)
  const [observacao, setObservacao] = useState('')
  const [falha, setFalha] = useState<string | null>(null)
  const [mudando, setMudando] = useState(false)
  const [aprovando, setAprovando] = useState(false)
  const proximas = PROXIMAS_SITUACOES[orcamento.situacao]

  function abrir(alvo: SituacaoOrcamento | null) {
    setPara(alvo)
    setObservacao('')
    setFalha(null)
  }

  async function confirmar() {
    if (!para) return
    setMudando(true)
    setFalha(null)
    try {
      await mudarSituacaoOrcamento(orcamento.id, orcamento.rowVersion, para, observacao.trim())
      const alvo = para
      abrir(null)
      aoMudar(alvo)
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
    } finally {
      setMudando(false)
    }
  }

  return (
    <section aria-label="Situação do orçamento" className="flex flex-col gap-(--space-100)">
      <div className="flex flex-wrap items-center gap-(--space-100)">
        <span className="rotulo">Mudar situação</span>
        {proximas.map((alvo) => (
          <Botao
            key={alvo}
            tamanho="compacto"
            disabled={alterado}
            title={alterado ? 'Salve antes: a situação muda o que está salvo.' : undefined}
            onClick={() => {
              if (alvo === 'aprovada') setAprovando(true)
              else abrir(alvo)
            }}
          >
            {rotuloDaAcao(alvo, orcamento.revisao)}
          </Botao>
        ))}
      </div>
      {orcamento.historicoSituacao.length > 0 ? (
        <details className="corpo text-(--text-subtle)">
          <summary className="cursor-pointer">
            Histórico da situação ({orcamento.historicoSituacao.length})
          </summary>
          <ol className="mt-(--space-075) flex flex-col gap-(--space-050)">
            {orcamento.historicoSituacao.map((h) => (
              <li key={`${h.em}-${h.para}`}>
                {formatarInstanteComoData(h.em, fuso)} · {h.membroNome ?? 'Membro desligado'}:{' '}
                {ROTULO_DA_SITUACAO[h.de]} para {ROTULO_DA_SITUACAO[h.para]} (revisão {h.revisao})
                {h.observacao ? ` · ${h.observacao}` : ''}
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      <DialogoAprovarOrcamento
        orcamento={orcamento}
        aberto={aprovando}
        aoMudarAberto={setAprovando}
        aoAprovar={() => {
          setAprovando(false)
          aoMudar('aprovada')
        }}
      />

      <Dialogo
        aberto={para !== null}
        aoMudar={(aberto) => {
          if (!aberto) abrir(null)
        }}
        titulo={para ? rotuloDaAcao(para, orcamento.revisao) : ''}
        descricao="Confirme a mudança de situação."
        acoes={
          <>
            <Botao
              onClick={() => {
                abrir(null)
              }}
            >
              Cancelar
            </Botao>
            <Botao
              aparencia="primario"
              disabled={mudando}
              aria-busy={mudando || undefined}
              onClick={() => void confirmar()}
            >
              {mudando ? 'Salvando…' : 'Confirmar'}
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-(--space-150)">
          {para ? <p>{explicacao(orcamento.situacao, para, orcamento.revisao)}</p> : null}
          <label htmlFor={idObservacao} className="flex flex-col gap-(--space-050)">
            <span className="rotulo">Observação (opcional)</span>
            <textarea
              id={idObservacao}
              rows={3}
              maxLength={500}
              className={classeCampo}
              placeholder="Ex.: enviada por e-mail; aprovada por telefone com o Sr. Cliente"
              value={observacao}
              onChange={(e) => {
                setObservacao(e.target.value)
              }}
            />
          </label>
          {falha ? (
            <MensagemSecao role="alert" tom="perigo">
              {falha}
            </MensagemSecao>
          ) : null}
        </div>
      </Dialogo>
    </section>
  )
}
