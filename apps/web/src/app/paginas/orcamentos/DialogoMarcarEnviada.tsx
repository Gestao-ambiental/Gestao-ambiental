// "Marcar como enviada" na barra da proposta (Protótipo 21). Mesma confirmação, mesmo texto e
// mesma RPC de SituacaoDoOrcamento (ORC-04): só a situação muda, com quem e quando no histórico.

import { useId, useState } from 'react'

import { Botao } from '@/components/ui/botao'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { mudarSituacaoOrcamento, type Orcamento } from '@/lib/api/orcamentos'
import { mensagemDoErro } from '@/lib/erros'

import { classeAreaTexto } from '@/components/ui/estilos-campo'

export function DialogoMarcarEnviada({
  orcamento,
  aberto,
  aoMudarAberto,
  aoMarcar,
}: {
  orcamento: Pick<Orcamento, 'id' | 'rowVersion'>
  aberto: boolean
  aoMudarAberto: (aberto: boolean) => void
  aoMarcar: () => void
}) {
  const idObservacao = useId()
  const [observacao, setObservacao] = useState('')
  const [falha, setFalha] = useState<string | null>(null)
  const [mudando, setMudando] = useState(false)

  function mudarAberto(valor: boolean) {
    if (valor) {
      setObservacao('')
      setFalha(null)
    }
    aoMudarAberto(valor)
  }

  async function confirmar() {
    setMudando(true)
    setFalha(null)
    try {
      await mudarSituacaoOrcamento(orcamento.id, orcamento.rowVersion, 'enviada', observacao.trim())
      aoMudarAberto(false)
      aoMarcar()
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
    } finally {
      setMudando(false)
    }
  }

  return (
    <Dialogo
      aberto={aberto}
      aoMudar={mudarAberto}
      titulo="Marcar como enviada"
      descricao="Confirme a mudança de situação."
      acoes={
        <>
          <Botao
            onClick={() => {
              mudarAberto(false)
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
      <div className="flex flex-col gap-(--e-3)">
        <p>
          A proposta deixa de ser editada no lugar; para mudar depois, reabra como nova revisão.
        </p>
        <label htmlFor={idObservacao} className="flex flex-col gap-(--e-1)">
          <span className="rotulo">Observação (opcional)</span>
          <textarea
            id={idObservacao}
            rows={3}
            maxLength={500}
            className={classeAreaTexto}
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
  )
}
