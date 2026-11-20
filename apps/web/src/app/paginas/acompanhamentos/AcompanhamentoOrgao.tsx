import {
  formatarDataCivil,
  INTERVALOS_ACOMPANHAMENTO,
  proximoAcompanhamento,
  rotuloDoIntervalo,
  type DataCivil,
} from '@gestao-ambiental/domain'
import { useMutation } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { definirAcompanhamento, type PlanoRenovacao } from '@/lib/api/renovacoes'
import { mensagemDoErro } from '@/lib/erros'

const OUTRO = 'outro'

const classeCampo =
  'h-(--controle) rounded-(--raio) border border-(--campo-borda) border-b-(--campo-borda) bg-(--campo) px-(--e-2) corpo text-(--tinta) outline-none focus:border-b-(--campo-borda-ativa) focus:shadow-[inset_0_-1px_0_0_var(--campo-borda-ativa)]'

/**
 * "Acompanhar o órgão a cada…" (Protótipo 17, artboard 05; decisão de 19/10/2026): intervalo por
 * processo a partir de 1 dia, com atalhos diário, semanal, quinzenal e mensal. Só a Gestão muda;
 * todos veem o próximo acompanhamento.
 */
export function AcompanhamentoOrgao({
  plano,
  protocoladoEm,
  hoje,
  podeEditar,
  aoSalvar,
}: {
  plano: PlanoRenovacao
  protocoladoEm: DataCivil
  hoje: DataCivil
  podeEditar: boolean
  aoSalvar: () => Promise<void>
}) {
  const seletorId = useId()
  const atual = plano.acompanhamentoDias
  const ehAtalho = (dias: number | null) =>
    dias !== null && INTERVALOS_ACOMPANHAMENTO.some((i) => i.dias === dias)
  const [opcao, setOpcao] = useState(atual === null ? '' : ehAtalho(atual) ? String(atual) : OUTRO)
  const [outro, setOutro] = useState(atual !== null && !ehAtalho(atual) ? String(atual) : '')
  const escolhido = opcao === OUTRO ? Number(outro) : opcao ? Number(opcao) : null
  const valido =
    escolhido !== null && Number.isInteger(escolhido) && escolhido >= 1 && escolhido <= 365

  const salvar = useMutation({
    mutationFn: () => definirAcompanhamento(plano.id, escolhido ?? 0, plano.rowVersion),
    onSuccess: aoSalvar,
  })

  const proximo = proximoAcompanhamento(protocoladoEm, atual, hoje)
  const resumo =
    atual === null
      ? 'Intervalo de acompanhamento ainda não definido.'
      : `${rotuloDoIntervalo(atual)} · próximo acompanhamento ${
          proximo === hoje ? 'hoje' : proximo ? formatarDataCivil(proximo) : '—'
        }`

  if (!podeEditar) return <p className="text-xs text-(--tinta-2)">{resumo}</p>

  return (
    <div className="flex flex-col gap-(--e-2)">
      {salvar.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(salvar.error)}
        </MensagemSecao>
      ) : null}
      <div className="flex flex-wrap items-center gap-(--e-2)">
        <label htmlFor={seletorId} className="corpo">
          Acompanhar o órgão
        </label>
        <select
          id={seletorId}
          value={opcao}
          onChange={(evento) => {
            setOpcao(evento.target.value)
          }}
          className={classeCampo}
        >
          <option value="">Escolha</option>
          {INTERVALOS_ACOMPANHAMENTO.map((i) => (
            <option key={i.dias} value={String(i.dias)}>
              {i.rotulo}
            </option>
          ))}
          <option value={OUTRO}>Outro intervalo…</option>
        </select>
        {opcao === OUTRO ? (
          <label className="inline-flex items-center gap-(--e-1) corpo">
            a cada
            <input
              inputMode="numeric"
              aria-label="Intervalo em dias"
              value={outro}
              onChange={(evento) => {
                setOutro(evento.target.value.replace(/\D/g, '').slice(0, 3))
              }}
              className={`${classeCampo} w-20`}
            />
            dias
          </label>
        ) : null}
        <Botao
          tamanho="compacto"
          aparencia="primario"
          disabled={!valido || escolhido === atual || salvar.isPending}
          onClick={() => {
            salvar.mutate()
          }}
        >
          {salvar.isPending ? 'Salvando…' : 'Salvar'}
        </Botao>
      </div>
      <p className="text-xs text-(--tinta-2)" aria-live="polite">
        {opcao === OUTRO && outro !== '' && !valido ? 'Use de 1 a 365 dias.' : resumo}
      </p>
    </div>
  )
}
