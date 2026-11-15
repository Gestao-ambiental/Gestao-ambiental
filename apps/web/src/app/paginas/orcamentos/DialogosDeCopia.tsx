// Salvar como modelo e duplicar (ADR-0018, fatia 5; P7). Os dois partem do que está salvo no banco.

import { useId, useState } from 'react'

import { Botao } from '@/components/ui/botao'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { duplicarOrcamento, salvarModeloDeOrcamento } from '@/lib/api/orcamentos'
import { mensagemDoErro } from '@/lib/erros'

import { classeCampo } from './comum'

/** Guarda o escopo do orçamento como modelo da consultoria: sem cliente; só o preço digitado vai junto. */
export function DialogoSalvarModelo({
  aberto,
  aoMudar,
  orcamentoId,
  nomeSugerido,
  aoSalvar,
}: {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  orcamentoId: string
  nomeSugerido: string
  aoSalvar: (nome: string) => void
}) {
  const idCampo = useId()
  const [nome, setNome] = useState(nomeSugerido)
  const [falha, setFalha] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  // Um id por tentativa: repetir o clique não cria dois modelos.
  const [modeloId, setModeloId] = useState(() => crypto.randomUUID())

  function mudar(aberta: boolean) {
    if (aberta) {
      setNome(nomeSugerido)
      setModeloId(crypto.randomUUID())
    }
    setFalha(null)
    aoMudar(aberta)
  }

  async function salvar() {
    const limpo = nome.trim()
    if (!limpo) {
      setFalha('Dê um nome ao modelo.')
      return
    }
    setSalvando(true)
    setFalha(null)
    try {
      await salvarModeloDeOrcamento(orcamentoId, modeloId, limpo)
      aoSalvar(limpo)
      aoMudar(false)
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
      setModeloId(crypto.randomUUID())
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialogo
      aberto={aberto}
      aoMudar={mudar}
      titulo="Salvar como modelo"
      descricao="Guarda o escopo deste orçamento como modelo da consultoria."
      acoes={
        <>
          <Botao
            onClick={() => {
              mudar(false)
            }}
          >
            Cancelar
          </Botao>
          <Botao
            aparencia="primario"
            disabled={salvando}
            aria-busy={salvando || undefined}
            onClick={() => void salvar()}
          >
            {salvando ? 'Salvando…' : 'Salvar modelo'}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-(--space-150)">
        <p className="text-(--text-subtle)">
          O modelo guarda o escopo: os serviços com a unidade e as horas, as despesas (a cotar),
          premissas e exclusões. Sem cliente, responsáveis nem meses. Dos preços, só os digitados
          vão junto; os demais vêm da tabela de preços do momento.
        </p>
        <label htmlFor={idCampo} className="flex flex-col gap-(--space-050)">
          <span className="rotulo">Nome do modelo</span>
          <input
            id={idCampo}
            className={classeCampo}
            maxLength={120}
            value={nome}
            onChange={(e) => {
              setNome(e.target.value)
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

/** Novo rascunho a partir deste orçamento; pergunta se os preços vão junto. */
export function DialogoDuplicar({
  aberto,
  aoMudar,
  orcamentoId,
  aoDuplicar,
}: {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  orcamentoId: string
  aoDuplicar: (novoId: string) => void
}) {
  const [falha, setFalha] = useState<string | null>(null)
  const [duplicando, setDuplicando] = useState<'com' | 'sem' | null>(null)
  const [novoId, setNovoId] = useState(() => crypto.randomUUID())

  function mudar(aberta: boolean) {
    if (aberta) setNovoId(crypto.randomUUID())
    setFalha(null)
    aoMudar(aberta)
  }

  async function duplicar(copiarPrecos: boolean) {
    setDuplicando(copiarPrecos ? 'com' : 'sem')
    setFalha(null)
    try {
      const id = await duplicarOrcamento(orcamentoId, novoId, copiarPrecos)
      aoMudar(false)
      aoDuplicar(id)
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
      setNovoId(crypto.randomUUID())
    } finally {
      setDuplicando(null)
    }
  }

  return (
    <Dialogo
      aberto={aberto}
      aoMudar={mudar}
      titulo="Duplicar orçamento"
      descricao="Escolha se os preços deste orçamento vão junto na cópia."
      largura={560}
      acoes={
        <>
          <Botao
            onClick={() => {
              mudar(false)
            }}
          >
            Cancelar
          </Botao>
          <Botao
            disabled={duplicando !== null}
            aria-busy={duplicando === 'com' || undefined}
            onClick={() => void duplicar(true)}
          >
            {duplicando === 'com' ? 'Duplicando…' : 'Duplicar com os preços'}
          </Botao>
          <Botao
            aparencia="primario"
            disabled={duplicando !== null}
            aria-busy={duplicando === 'sem' || undefined}
            onClick={() => void duplicar(false)}
          >
            {duplicando === 'sem' ? 'Duplicando…' : 'Duplicar sem os preços'}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-(--space-150)">
        <p>
          Cria um rascunho novo, com outro número, para o mesmo cliente. Vão junto os serviços, as
          horas, os responsáveis, as despesas, as condições de pagamento, premissas e exclusões.
        </p>
        <p className="text-(--text-subtle)">
          <strong className="font-semibold text-(--text)">Com os preços</strong> também copia o
          acréscimo, os preços fechados, os outros custos e as estimativas das despesas, que não
          voltam a cotar. <strong className="font-semibold text-(--text)">Sem os preços</strong>,
          esses valores ficam para preencher e as despesas voltam a cotar. A tabela de preços e a
          base de custos são sempre as atuais. O mês não é copiado: escolha o mês para calcular a
          carga. Só orçamentos aprovados contam como comprometidos.
        </p>
        {falha ? (
          <MensagemSecao role="alert" tom="perigo">
            {falha}
          </MensagemSecao>
        ) : null}
      </div>
    </Dialogo>
  )
}
