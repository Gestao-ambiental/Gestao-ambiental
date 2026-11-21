// Peças comuns das telas de exigência (ADR-0045): selo da situação, título e o campo do PDF.
import { ROTULO_DA_SITUACAO_DA_EXIGENCIA } from '@gestao-ambiental/domain'
import { useId, useRef } from 'react'

import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { Selo } from '@/components/ui/selo'
import type { Exigencia } from '@/lib/api/exigencias'
import { conferirPdf, type ProblemaDoPdf } from '@/lib/api/licencas'
import { cn } from '@/lib/utils'

import { TOM_DA_SITUACAO, situacaoDe } from './apresentacao'

/** Situação calculada: palavra e forma (a cor nunca é o único sinal). */
export function SeloDaExigencia({ exigencia }: { exigencia: Exigencia }) {
  const situacao = situacaoDe(exigencia)
  return <Selo tom={TOM_DA_SITUACAO[situacao]}>{ROTULO_DA_SITUACAO_DA_EXIGENCIA[situacao]}</Selo>
}

const PROBLEMAS: Record<ProblemaDoPdf, string> = {
  nao_pdf: 'Este arquivo não é um PDF válido.',
  grande_demais: 'O arquivo passa de 25 MB.',
  vazio: 'O arquivo está vazio.',
}

/** Campo de PDF (até 25 MB): confere a assinatura antes de aceitar. */
export function CampoPdf({
  rotulo,
  arquivo,
  erro,
  aoEscolher,
  aoErrar,
  desabilitado = false,
}: {
  rotulo: string
  arquivo: File | null
  erro?: string
  aoEscolher: (arquivo: File) => void
  aoErrar: (mensagem: string) => void
  desabilitado?: boolean
}) {
  const id = useId()
  const entrada = useRef<HTMLInputElement>(null)

  async function escolher(escolhido: File | undefined) {
    if (!escolhido) return
    const problema = await conferirPdf(escolhido)
    if (problema) aoErrar(PROBLEMAS[problema])
    else aoEscolher(escolhido)
  }

  return (
    <div className="flex flex-col gap-(--e-1)">
      <span className="flex min-h-5 items-center rotulo text-(--tinta)" id={`${id}-rotulo`}>
        {rotulo}
      </span>
      <div
        className={cn(
          'flex items-center gap-(--e-2) rounded-(--raio) border border-dashed p-(--e-2) pl-(--e-3)',
          erro ? 'border-(--atraso)' : 'border-(--campo-borda)',
        )}
      >
        <Icone nome="paperclip" className="shrink-0 text-(--icone-2)" />
        <span
          className={cn(
            'min-w-0 flex-1 truncate corpo',
            arquivo ? 'text-(--tinta)' : 'text-(--tinta-2)',
          )}
        >
          {arquivo ? arquivo.name : 'PDF até 25 MB'}
        </span>
        <Botao
          tamanho="compacto"
          aria-describedby={`${id}-rotulo`}
          disabled={desabilitado}
          onClick={() => {
            entrada.current?.click()
          }}
        >
          {arquivo ? 'Trocar' : 'Escolher arquivo'}
        </Botao>
        <input
          ref={entrada}
          type="file"
          accept="application/pdf"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="pdf-da-exigencia"
          onChange={(evento) => {
            void escolher(evento.target.files?.[0])
            evento.target.value = ''
          }}
        />
      </div>
      {erro ? (
        <span role="alert" className="text-xs font-[650] text-(--atraso-texto)">
          {erro}
        </span>
      ) : null}
    </div>
  )
}

/** Mensagem de erro de campo, ligada por id (aria-describedby). */
export function ErroDoCampo({ id, children }: { id: string; children?: string }) {
  if (!children) return null
  return (
    <span id={id} role="alert" className="text-xs font-[650] text-(--atraso-texto)">
      {children}
    </span>
  )
}
