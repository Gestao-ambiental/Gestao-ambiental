// Campos e selo comuns às telas de registro de MTR e CDF (resíduos, fase 1). Protótipo.

import { ROTULO_DA_SITUACAO_DO_MTR, type SituacaoMtr } from '@gestao-ambiental/domain'
import { useId, useRef, type ComponentProps, type ReactNode } from 'react'

import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { classeAreaTexto, classeCampo } from '@/components/ui/estilos-campo'
import { Selo, type TomSelo } from '@/components/ui/selo'
import { conferirPdf, type ProblemaDoPdf } from '@/lib/api/licencas'
import type { ArquivoPdf } from '@/lib/api/residuos'
import { cn } from '@/lib/utils'

const TOM_DA_SITUACAO: Record<SituacaoMtr, TomSelo> = {
  salvo: 'andamento',
  recebido: 'sucesso',
  em_armazenamento: 'atencao',
  cancelado: 'padrao',
}

export function SeloSituacaoMtr({ situacao }: { situacao: SituacaoMtr }) {
  return <Selo tom={TOM_DA_SITUACAO[situacao]}>{ROTULO_DA_SITUACAO_DO_MTR[situacao]}</Selo>
}

type PropsSelecao = Omit<ComponentProps<'select'>, 'id'> & {
  rotulo: string
  erro?: string
  children: ReactNode
}

/** Lista de escolha nativa com rótulo e erro ligados ao campo. */
export function CampoSelecao({ rotulo, erro, className, children, ...rest }: PropsSelecao) {
  const id = useId()
  return (
    <div className={cn('flex flex-col gap-(--e-1)', className)}>
      <label htmlFor={id} className="rotulo">
        {rotulo}
      </label>
      <select
        id={id}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : undefined}
        className={classeCampo}
        {...rest}
      >
        {children}
      </select>
      {erro ? (
        <span id={`${id}-erro`} className="text-xs text-(--atraso-texto)">
          {erro}
        </span>
      ) : null}
    </div>
  )
}

/** Texto longo (observação). */
export function CampoObservacao({
  valor,
  aoMudar,
}: {
  valor: string
  aoMudar: (valor: string) => void
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-(--e-1)">
      <label htmlFor={id} className="rotulo">
        Observação
      </label>
      <textarea
        id={id}
        rows={2}
        maxLength={2000}
        value={valor}
        onChange={(evento) => {
          aoMudar(evento.target.value)
        }}
        className={classeAreaTexto}
      />
    </div>
  )
}

const PROBLEMAS_DO_PDF: Record<ProblemaDoPdf, string> = {
  nao_pdf: 'Este arquivo não é um PDF válido.',
  grande_demais: 'O arquivo passa de 25 MB.',
  vazio: 'O arquivo está vazio.',
}

function tamanhoLegivel(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
    : `${String(Math.max(1, Math.round(bytes / 1024)))} KB`
}

/**
 * Escolha do PDF (opcional). Confere o arquivo antes (conferirPdf); o envio acontece depois de
 * registrar, porque o PDF precisa do id do registro.
 */
export function CampoPdf({
  rotulo,
  arquivo,
  atual,
  erro,
  aoEscolher,
  aoErro,
}: {
  rotulo: string
  arquivo: File | null
  /** PDF já anexado (edição): um novo vira nova versão, o antigo fica no histórico. */
  atual: ArquivoPdf | null
  erro?: string
  aoEscolher: (arquivo: File) => void
  aoErro: (mensagem: string) => void
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const id = useId()

  async function escolher(escolhido: File | undefined) {
    if (!escolhido) return
    const problema = await conferirPdf(escolhido)
    if (problema) aoErro(PROBLEMAS_DO_PDF[problema])
    else aoEscolher(escolhido)
  }

  return (
    <div className="flex flex-col gap-(--e-1)">
      <span className="rotulo" id={id}>
        {rotulo}
      </span>
      <div className="flex min-w-0 items-center gap-(--e-2) rounded-(--raio) border border-dashed border-(--regra-forte) p-(--e-2)">
        <Icone nome="paperclip" className="shrink-0 text-(--icone)" />
        <span className="min-w-0 flex-1 truncate corpo">
          {arquivo
            ? `${arquivo.name} · ${tamanhoLegivel(arquivo.size)}`
            : atual
              ? atual.nome || 'PDF anexado'
              : 'Nenhum PDF'}
        </span>
        <Botao
          tamanho="compacto"
          aria-describedby={id}
          onClick={() => {
            entrada.current?.click()
          }}
        >
          {arquivo || atual ? 'Trocar PDF' : 'Escolher PDF'}
        </Botao>
        <input
          ref={entrada}
          type="file"
          accept="application/pdf"
          data-testid={`arquivo-${rotulo}`}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(evento) => {
            void escolher(evento.target.files?.[0])
            evento.target.value = ''
          }}
        />
      </div>
      {erro ? (
        <span role="alert" className="text-xs text-(--atraso-texto)">
          {erro}
        </span>
      ) : null}
    </div>
  )
}
