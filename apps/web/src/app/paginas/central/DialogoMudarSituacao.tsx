// "Mudar situação" da consultoria (ADM-01; ADR-0022): situação nova e motivo obrigatório, depois
// confirmação. A chave da operação vale enquanto a escolha não muda: repetir depois de uma falha de
// rede não duplica a mudança no banco.

import { useId, useRef, useState } from 'react'

import { Botao } from '@/components/ui/botao'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  ROTULO_SITUACAO_CONSULTORIA,
  SITUACOES_CONSULTORIA,
  mudarSituacaoDaConsultoria,
  type ConsultoriaDetalhada,
  type SituacaoConsultoria,
} from '@/lib/api/central'
import { codigoDoErro, mensagemDoErro } from '@/lib/erros'

import { classeCampo } from './comum'

const LIMITE_MOTIVO = 500
/** Clique que chega logo depois de Continuar (duplo clique) não confirma: Confirmar fica no mesmo lugar. */
const INTERVALO_MINIMO_MS = 400

export function DialogoMudarSituacao({
  consultoria,
  aberto,
  aoMudarAberto,
  aoMudar,
  aoConflito,
}: {
  consultoria: Pick<ConsultoriaDetalhada, 'id' | 'nome' | 'situacao' | 'rowVersion'>
  aberto: boolean
  aoMudarAberto: (aberto: boolean) => void
  aoMudar: (nova: SituacaoConsultoria) => void
  /** A versão mudou em outro lugar: a tela recarrega o detalhe. */
  aoConflito: () => void
}) {
  const idSituacao = useId()
  const idMotivo = useId()
  const idErroMotivo = useId()
  const opcoes = SITUACOES_CONSULTORIA.filter((s) => s !== consultoria.situacao)
  const [nova, setNova] = useState<SituacaoConsultoria>(opcoes[0] ?? 'ativa')
  const [motivo, setMotivo] = useState('')
  const [erroMotivo, setErroMotivo] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [chave, setChave] = useState(() => crypto.randomUUID())
  const [salvando, setSalvando] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const entrouNaConfirmacao = useRef(0)

  function mudarAberto(valor: boolean) {
    if (valor) {
      setNova(opcoes[0] ?? 'ativa')
      setMotivo('')
      setErroMotivo(null)
      setConfirmando(false)
      setChave(crypto.randomUUID())
      setFalha(null)
    }
    aoMudarAberto(valor)
  }

  function continuar() {
    if (motivo.trim() === '') {
      setErroMotivo('Informe o motivo')
      return
    }
    setErroMotivo(null)
    setFalha(null)
    entrouNaConfirmacao.current = Date.now()
    setConfirmando(true)
  }

  async function confirmar() {
    if (Date.now() - entrouNaConfirmacao.current < INTERVALO_MINIMO_MS) return
    setSalvando(true)
    setFalha(null)
    try {
      await mudarSituacaoDaConsultoria(
        consultoria.id,
        nova,
        motivo.trim(),
        consultoria.rowVersion,
        chave,
      )
      aoMudarAberto(false)
      aoMudar(nova)
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
      if (codigoDoErro(erro) === 'conflito_de_versao') aoConflito()
    } finally {
      setSalvando(false)
    }
  }

  const deAte = `${ROTULO_SITUACAO_CONSULTORIA[consultoria.situacao]} para ${ROTULO_SITUACAO_CONSULTORIA[nova]}`

  return (
    <Dialogo
      aberto={aberto}
      aoMudar={mudarAberto}
      titulo={confirmando ? 'Confirmar mudança' : 'Mudar situação'}
      descricao={confirmando ? `${consultoria.nome}: de ${deAte}.` : consultoria.nome}
      acoes={
        confirmando ? (
          <>
            <Botao
              disabled={salvando}
              onClick={() => {
                setConfirmando(false)
                setFalha(null)
              }}
            >
              Voltar
            </Botao>
            <Botao
              aparencia="primario"
              disabled={salvando}
              aria-busy={salvando || undefined}
              onClick={() => void confirmar()}
            >
              {salvando ? 'Salvando…' : 'Confirmar'}
            </Botao>
          </>
        ) : (
          <>
            <Botao
              onClick={() => {
                mudarAberto(false)
              }}
            >
              Cancelar
            </Botao>
            <Botao aparencia="primario" onClick={continuar}>
              Continuar
            </Botao>
          </>
        )
      }
    >
      {confirmando ? (
        <div className="flex flex-col gap-(--space-150)">
          <dl className="flex flex-col gap-(--space-050)">
            <dt className="rotulo">Motivo</dt>
            <dd className="whitespace-pre-wrap break-words">{motivo.trim()}</dd>
          </dl>
          {falha ? (
            <MensagemSecao role="alert" tom="perigo">
              {falha}
            </MensagemSecao>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-(--space-150)">
          <label htmlFor={idSituacao} className="flex flex-col gap-(--space-050)">
            <span className="rotulo">Situação nova</span>
            <select
              id={idSituacao}
              value={nova}
              onChange={(evento) => {
                const valor = opcoes.find((s) => s === evento.target.value)
                if (valor) setNova(valor)
                setChave(crypto.randomUUID())
              }}
              className={`${classeCampo} h-(--size-control)`}
            >
              {opcoes.map((s) => (
                <option key={s} value={s}>
                  {ROTULO_SITUACAO_CONSULTORIA[s]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-(--space-050)">
            <label htmlFor={idMotivo} className="rotulo">
              Motivo
            </label>
            <textarea
              id={idMotivo}
              rows={3}
              maxLength={LIMITE_MOTIVO}
              required
              aria-invalid={erroMotivo ? true : undefined}
              aria-describedby={erroMotivo ? idErroMotivo : undefined}
              value={motivo}
              onChange={(evento) => {
                setMotivo(evento.target.value)
                setChave(crypto.randomUUID())
                if (erroMotivo && evento.target.value.trim() !== '') setErroMotivo(null)
              }}
              className={`${classeCampo} py-(--space-075)`}
            />
            {erroMotivo ? (
              <span id={idErroMotivo} className="text-xs text-(--text-danger)">
                {erroMotivo}
              </span>
            ) : null}
          </div>
        </div>
      )}
    </Dialogo>
  )
}
