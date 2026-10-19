import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import {
  EXTRACAO_ABANDONADA_MS,
  FALHA_DEFINITIVA,
  MENSAGEM_DA_FALHA,
  extrairLicenca,
  obterUltimaExtracao,
  type MotivoDaFalha,
} from '@/lib/api/extracao'
import { mensagemDoErro } from '@/lib/erros'

export type Metodo = 'ia' | 'manual'

/**
 * "Como cadastrar" (Protótipo 10): extrair com IA ou manual. A IA só fica disponível com PDF de
 * texto até 10 MB; o manual está sempre disponível.
 */
export function ComoCadastrar({
  metodo,
  aoEscolher,
  semIa,
}: {
  metodo: Metodo | null
  aoEscolher: (metodo: Metodo) => void
  /** Por que a IA não está disponível agora; nulo = disponível. */
  semIa: string | null
}) {
  return (
    <fieldset className="flex flex-col gap-(--space-100)">
      <legend className="mb-(--space-100) titulo-secao">Como cadastrar</legend>
      <div className="grid gap-(--space-150) sm:grid-cols-2">
        <label
          className={
            semIa
              ? 'flex cursor-not-allowed flex-col gap-(--space-050) rounded-(--radius) border bg-(--surface) p-(--space-200) opacity-70'
              : 'flex cursor-pointer flex-col gap-(--space-050) rounded-(--radius) border bg-(--surface) p-(--space-200) transicao-estado has-checked:border-(--border-focus) has-checked:bg-(--surface-selected) hover:bg-(--surface-hover)'
          }
        >
          <span className="inline-flex items-center gap-(--space-100) corpo-medio">
            <input
              type="radio"
              name="como-cadastrar"
              checked={metodo === 'ia'}
              disabled={semIa !== null}
              onChange={() => {
                aoEscolher('ia')
              }}
              aria-labelledby="como-ia"
              aria-describedby="ia-descricao"
              className="size-4 accent-(--brand)"
            />
            <span id="como-ia" className={semIa ? 'text-(--text-disabled)' : undefined}>
              Extrair com IA
            </span>
            <Selo tom="revisao" className="ml-auto">
              IA
            </Selo>
          </span>
          <span id="ia-descricao" className="text-xs text-(--text-subtle)">
            {semIa ??
              'A IA propõe identificação e condicionantes a partir do PDF. Nada vale sem a sua revisão. PDF com texto até 10 MB.'}
          </span>
        </label>
        <label className="flex cursor-pointer flex-col gap-(--space-050) rounded-(--radius) border bg-(--surface) p-(--space-200) transicao-estado has-checked:border-(--border-focus) has-checked:bg-(--surface-selected) hover:bg-(--surface-hover)">
          <span className="inline-flex items-center gap-(--space-100) corpo-medio">
            <input
              type="radio"
              name="como-cadastrar"
              checked={metodo === 'manual'}
              onChange={() => {
                aoEscolher('manual')
              }}
              aria-labelledby="como-manual"
              aria-describedby="manual-descricao"
              className="size-4 accent-(--brand)"
            />
            <span id="como-manual">Cadastrar manualmente</span>
          </span>
          <span id="manual-descricao" className="text-xs text-(--text-subtle)">
            Você preenche a identificação e as condicionantes. Sempre disponível; aceita PDF até 25
            MB ou nenhum.
          </span>
        </label>
      </div>
    </fieldset>
  )
}

// Extrações já pedidas nesta aba: o modo estrito do React monta duas vezes e não pode pedir duas.
const pedidas = new Set<string>()

function segundos(desde: number, agora: number): number {
  return Math.max(0, Math.floor((agora - desde) / 1000))
}

/**
 * Extração em andamento, falha ou pronta (Protótipo 10, artboards 03 e 06; IA-04). Nada trava:
 * dá para seguir pelo manual a qualquer momento, e sair da tela não perde o resultado (quem grava
 * é a Edge Function). Falha leva ao manual sem perder o rascunho.
 */
export function PainelExtracao({
  instrumentoId,
  extracaoId,
  aoConcluir,
  aoManual,
  aoTentarDeNovo,
}: {
  instrumentoId: string
  /** Extração a pedir agora (vinda do botão Continuar); nula = só acompanha a última. */
  extracaoId: string | null
  aoConcluir: () => void
  aoManual: () => void
  aoTentarDeNovo: () => void
}) {
  const queryClient = useQueryClient()
  const [agora, setAgora] = useState(() => Date.now())

  const ultima = useQuery({
    queryKey: ['extracao', instrumentoId],
    queryFn: () => obterUltimaExtracao(instrumentoId),
    refetchInterval: (consulta) =>
      consulta.state.data?.situacao === 'em_andamento' ? 4000 : false,
  })

  const extrair = useMutation({
    mutationKey: ['extrair', instrumentoId],
    mutationFn: (id: string) => extrairLicenca(id, instrumentoId),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['extracao', instrumentoId] }),
        queryClient.invalidateQueries({ queryKey: ['instrumento', instrumentoId] }),
        queryClient.invalidateQueries({ queryKey: ['condicionantes', instrumentoId] }),
      ])
    },
    onSuccess: (resultado) => {
      if (resultado.situacao === 'concluida') aoConcluir()
    },
  })

  useEffect(() => {
    if (!extracaoId || pedidas.has(extracaoId)) return
    pedidas.add(extracaoId)
    extrair.mutate(extracaoId)
  }, [extracaoId, extrair])

  const dados = ultima.data
  const iniciada = dados ? new Date(dados.iniciadaEm).getTime() : null
  const emAndamento =
    extrair.isPending ||
    extrair.data?.situacao === 'em_andamento' ||
    (dados?.situacao === 'em_andamento' &&
      iniciada !== null &&
      agora - iniciada < EXTRACAO_ABANDONADA_MS)

  useEffect(() => {
    if (!emAndamento) return
    const relogio = window.setInterval(() => {
      setAgora(Date.now())
    }, 1000)
    return () => {
      window.clearInterval(relogio)
    }
  }, [emAndamento])

  // Terminou enquanto a tela acompanhava pelo banco (ex.: voltou depois de sair).
  const concluidaAgora = extrair.data?.situacao === 'concluida'
  if (emAndamento) {
    const decorridos = segundos(iniciada ?? agora, agora)
    const percentual = Math.min(100, Math.round((decorridos / 120) * 100))
    return (
      <section
        aria-labelledby="titulo-extraindo"
        className="flex flex-col gap-(--space-150) rounded-(--radius) border bg-(--surface) p-(--space-200)"
      >
        <div className="flex items-center justify-between gap-(--space-100)">
          <h2 id="titulo-extraindo" className="titulo-secao">
            Extraindo com IA
          </h2>
          <span className="text-xs text-(--text-subtle)" aria-live="off">
            {decorridos} s de até 2 min
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Tempo da extração"
          aria-valuemin={0}
          aria-valuemax={120}
          aria-valuenow={Math.min(120, decorridos)}
          aria-valuetext={`${String(decorridos)} segundos de até 2 minutos`}
          className="h-1 overflow-hidden rounded-full bg-(--border)"
        >
          <div className="h-full bg-(--text)" style={{ width: `${String(percentual)}%` }} />
        </div>
        <p className="corpo" role="status">
          A IA está lendo o PDF e propondo a identificação e as condicionantes.
        </p>
        <div className="flex flex-wrap items-center gap-(--space-150)">
          <Botao onClick={aoManual}>Cancelar e cadastrar manualmente</Botao>
          <span className="text-xs text-(--text-subtle)">
            Pode sair desta tela: a extração continua e o rascunho fica salvo. O que a IA propuser
            entra como pendente de revisão.
          </span>
        </div>
      </section>
    )
  }

  if (extrair.isError) {
    return (
      <MensagemSecao
        role="alert"
        tom="perigo"
        acoes={<Botao onClick={aoManual}>Cadastrar manualmente</Botao>}
      >
        {mensagemDoErro(extrair.error)}
      </MensagemSecao>
    )
  }

  const motivo: MotivoDaFalha | null =
    extrair.data?.situacao === 'falhou'
      ? extrair.data.motivo
      : !extrair.data && dados?.situacao === 'falhou'
        ? dados.motivo
        : !extrair.data && dados?.situacao === 'em_andamento'
          ? 'tempo_esgotado'
          : null
  const detalhe =
    extrair.data?.situacao === 'falhou'
      ? (extrair.data.detalhe ?? null)
      : !extrair.data && dados?.situacao === 'falhou'
        ? dados.detalhe
        : null
  if (motivo) {
    const definitiva = FALHA_DEFINITIVA.has(motivo)
    return (
      <MensagemSecao
        role="alert"
        tom={definitiva ? 'atencao' : 'perigo'}
        acoes={
          <>
            {definitiva ? null : (
              <Botao iconeAntes="refresh-cw" onClick={aoTentarDeNovo}>
                Tentar de novo
              </Botao>
            )}
            <Botao onClick={aoManual}>Cadastrar manualmente</Botao>
          </>
        }
      >
        {MENSAGEM_DA_FALHA[motivo]}
        {detalhe ? (
          <span className="mt-(--space-050) block text-xs text-(--text-subtle)">
            Detalhe técnico: {detalhe}
          </span>
        ) : null}
      </MensagemSecao>
    )
  }

  if (!concluidaAgora && dados?.situacao === 'concluida') {
    return (
      <MensagemSecao tom="sucesso" acoes={<Botao onClick={aoConcluir}>Revisar a proposta</Botao>}>
        A IA propôs {dados.itensPropostos ?? 0} condicionantes. Nada vale até você revisar.
      </MensagemSecao>
    )
  }

  return null
}
