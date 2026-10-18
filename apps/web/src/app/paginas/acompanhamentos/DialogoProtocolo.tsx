import type { DataCivil } from '@gestao-ambiental/domain'
import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { conferirArquivoDeEvidencia, type ProblemaDaEvidencia } from '@/lib/api/ocorrencias'
import { registrarProtocolo, type PlanoRenovacao } from '@/lib/api/renovacoes'
import { mensagemDoErro } from '@/lib/erros'

const PROBLEMAS: Record<ProblemaDaEvidencia, string> = {
  nao_pdf: 'Este arquivo não é um PDF válido.',
  grande_demais: 'O arquivo passa de 25 MB.',
  vazio: 'O arquivo está vazio.',
  tipo: 'Envie PDF, PNG ou JPEG.',
}

function tamanhoLegivel(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
    : `${String(Math.max(1, Math.round(bytes / 1024)))} KB`
}

/** Modal "Registrar protocolo" (Protótipo 17, artboard 04; REN-02): número, data e comprovante. */
export function DialogoProtocolo({
  plano,
  aberto,
  aoMudar,
  aoRegistrar,
}: {
  plano: PlanoRenovacao
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  aoRegistrar: () => Promise<void>
}) {
  const entrada = useRef<HTMLInputElement>(null)
  // Id gerado aqui: repetir depois de erro de rede não registra outro comprovante.
  const [versaoId] = useState(() => crypto.randomUUID())
  const [numero, setNumero] = useState('')
  const [data, setData] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erros, setErros] = useState<{ numero?: string; data?: string; arquivo?: string }>({})

  const registrar = useMutation({
    mutationFn: () => {
      if (!arquivo) throw new Error('sem comprovante')
      return registrarProtocolo(plano, versaoId, { numero, data: data as DataCivil, arquivo })
    },
    onSuccess: aoRegistrar,
  })

  async function escolher(escolhido: File | undefined) {
    if (!escolhido) return
    const problema = await conferirArquivoDeEvidencia(escolhido)
    if (problema) {
      setErros((e) => ({ ...e, arquivo: PROBLEMAS[problema] }))
      return
    }
    setErros((e) => ({ ...e, arquivo: undefined }))
    setArquivo(escolhido)
  }

  function enviar() {
    const novos: typeof erros = {}
    if (!numero.trim()) novos.numero = 'Informe o número do protocolo'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) novos.data = 'Informe a data do protocolo'
    else if (data > plano.hoje) novos.data = 'A data do protocolo não pode estar no futuro'
    if (!arquivo) novos.arquivo = 'Anexe o comprovante'
    setErros(novos)
    if (Object.keys(novos).length === 0) registrar.mutate()
  }

  return (
    <Dialogo
      aberto={aberto}
      aoMudar={aoMudar}
      titulo="Registrar protocolo"
      descricao="Protocolar não altera a validade da licença nem as obrigações em vigor."
      acoes={
        <>
          <Botao
            onClick={() => {
              aoMudar(false)
            }}
          >
            Cancelar
          </Botao>
          <Botao aparencia="primario" disabled={registrar.isPending} onClick={enviar}>
            {registrar.isPending ? 'Registrando…' : 'Registrar protocolo'}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-(--space-150)">
        {registrar.isError ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErro(registrar.error)}
          </MensagemSecao>
        ) : null}
        <CampoTexto
          rotulo="Número do protocolo *"
          value={numero}
          erro={erros.numero}
          onChange={(evento) => {
            setNumero(evento.target.value)
            setErros((e) => ({ ...e, numero: undefined }))
          }}
        />
        <CampoTexto
          rotulo="Data *"
          type="date"
          max={plano.hoje}
          value={data}
          erro={erros.data}
          onChange={(evento) => {
            setData(evento.target.value)
            setErros((e) => ({ ...e, data: undefined }))
          }}
        />
        <div className="flex flex-col gap-(--space-050)">
          <span className="rotulo" id="rotulo-comprovante">
            Comprovante *
          </span>
          <div className="flex items-center gap-(--space-100) rounded-(--radius) border border-dashed border-(--border-strong) p-(--space-100)">
            <Icone nome="paperclip" className="text-(--icon)" />
            <span className="min-w-0 flex-1 truncate corpo">
              {arquivo
                ? `${arquivo.name} · ${tamanhoLegivel(arquivo.size)}`
                : 'PDF, PNG ou JPEG até 25 MB'}
            </span>
            <Botao
              tamanho="compacto"
              aria-describedby="rotulo-comprovante"
              onClick={() => {
                entrada.current?.click()
              }}
            >
              {arquivo ? 'Trocar' : 'Escolher arquivo'}
            </Botao>
            <input
              ref={entrada}
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(evento) => {
                void escolher(evento.target.files?.[0])
                evento.target.value = ''
              }}
            />
          </div>
          {erros.arquivo ? (
            <span role="alert" className="text-xs text-(--text-danger)">
              {erros.arquivo}
            </span>
          ) : null}
        </div>
      </div>
    </Dialogo>
  )
}
