import {
  dataForaDoCiclo,
  formatarDataCivil,
  janelaDoCiclo,
  type DataCivil,
} from '@gestao-ambiental/domain'
import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo, type TomSelo } from '@/components/ui/selo'
import {
  conferirArquivoDeEvidencia,
  conferirEvidencia,
  enviarEvidencia,
  urlDoArquivo,
  type Evidencia,
  type Ocorrencia,
  type ProblemaDaEvidencia,
} from '@/lib/api/ocorrencias'
import { formatarInstanteComHora } from '@/lib/datas'
import { mensagemDoErro } from '@/lib/erros'

const SITUACAO: Record<Evidencia['situacao'], { texto: string; tom: TomSelo }> = {
  em_conferencia: { texto: 'Em conferência', tom: 'revisao' },
  aprovada: { texto: 'Aprovada', tom: 'sucesso' },
  devolvida: { texto: 'Devolvida', tom: 'perigo' },
}

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

function dataDe(valor: string): DataCivil | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? (valor as DataCivil) : null
}

/** Formulário de envio: arquivo + data real de execução (obrigatória), com aviso fora do ciclo. */
function EnvioDeEvidencia({
  ocorrencia,
  corrigindo,
  aoEnviar,
}: {
  ocorrencia: Ocorrencia
  corrigindo: boolean
  aoEnviar: () => Promise<void>
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const [evidenciaId] = useState(() => crypto.randomUUID())
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [problema, setProblema] = useState<string | null>(null)
  const [data, setData] = useState('')
  const [erroData, setErroData] = useState<string | null>(null)

  const dataExecucao = dataDe(data)
  const janela = janelaDoCiclo(
    ocorrencia.prazoOriginal,
    ocorrencia.prazoCicloAnterior,
    ocorrencia.dataReferencia,
  )
  const foraDoCiclo = dataExecucao !== null && dataForaDoCiclo(dataExecucao, janela)

  const envio = useMutation({
    mutationFn: () => {
      if (!arquivo || !dataExecucao) throw new Error('incompleto')
      return enviarEvidencia(ocorrencia, evidenciaId, arquivo, dataExecucao)
    },
    onSuccess: aoEnviar,
  })

  async function escolher(escolhido: File | undefined) {
    if (!escolhido) return
    const erro = await conferirArquivoDeEvidencia(escolhido)
    if (erro) {
      setProblema(PROBLEMAS[erro])
      return
    }
    setProblema(null)
    setArquivo(escolhido)
  }

  return (
    <form
      noValidate
      aria-label="Enviar evidência"
      onSubmit={(evento) => {
        evento.preventDefault()
        if (!dataExecucao) {
          setErroData('Informe a data real de execução')
          return
        }
        if (dataExecucao > ocorrencia.hoje) {
          setErroData('A data real de execução não pode estar no futuro')
          return
        }
        envio.mutate()
      }}
      className="flex flex-col gap-(--space-150) rounded-(--radius) border border-dashed border-(--border-strong) p-(--space-150)"
    >
      {envio.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(envio.error)}
        </MensagemSecao>
      ) : null}
      <div className="flex flex-wrap items-center gap-(--space-100)">
        <Icone nome="paperclip" className="text-(--icon)" />
        <span className="min-w-0 flex-1 truncate corpo">
          {arquivo
            ? `${arquivo.name} · ${tamanhoLegivel(arquivo.size)}`
            : corrigindo
              ? 'Escolha o arquivo corrigido'
              : 'Escolha o arquivo da evidência'}
        </span>
        <Botao
          tamanho="compacto"
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
      {problema ? (
        <MensagemSecao role="alert" tom="perigo">
          {problema}
        </MensagemSecao>
      ) : null}
      <CampoTexto
        rotulo="Data real de execução *"
        type="date"
        max={ocorrencia.hoje}
        value={data}
        erro={erroData ?? undefined}
        ajuda="Quando a coleta ou o serviço foi feito. A data do envio não substitui."
        onChange={(evento) => {
          setData(evento.target.value)
          setErroData(null)
        }}
      />
      {foraDoCiclo ? (
        <MensagemSecao tom="atencao">
          A data informada é de {formatarDataCivil(dataExecucao)}, fora deste ciclo
          {janela.inicio
            ? ` (de ${formatarDataCivil(janela.inicio)} a ${formatarDataCivil(janela.fim)})`
            : ` (até ${formatarDataCivil(janela.fim)})`}
          . Confira antes de enviar.
        </MensagemSecao>
      ) : null}
      <div className="flex flex-wrap items-center gap-(--space-100)">
        <span className="flex-1 text-xs text-(--text-subtle)">
          {ocorrencia.conferenteNome
            ? `${ocorrencia.conferenteNome} confere depois do envio.`
            : 'A gestão confere depois do envio.'}
        </span>
        <Botao
          type="submit"
          aparencia="primario"
          iconeAntes="send"
          disabled={!arquivo || envio.isPending}
        >
          {envio.isPending ? 'Enviando…' : 'Enviar para conferência'}
        </Botao>
      </div>
    </form>
  )
}

/**
 * Evidência e conferência (DEM-03, DEM-09). Upload não conclui: vai para conferência. Pode
 * conferir o conferente designado ou, sem designação, a Gestão; com a independência, nunca quem
 * enviou. A tela só explica; o banco recusa o resto.
 */
export function SecaoEvidencia({
  ocorrencia,
  evidencias,
  membroId,
  ehGestao,
  fuso,
  aoMudar,
}: {
  ocorrencia: Ocorrencia
  evidencias: readonly Evidencia[]
  membroId: string
  ehGestao: boolean
  fuso: string
  aoMudar: () => Promise<void>
}) {
  const [devolvendo, setDevolvendo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erroMotivo, setErroMotivo] = useState<string | null>(null)
  const ultima = evidencias[0]

  const conferir = useMutation({
    mutationFn: ({ decisao, texto }: { decisao: 'aprovada' | 'devolvida'; texto: string }) => {
      if (!ultima) throw new Error('sem evidência')
      return conferirEvidencia(ultima.id, decisao, texto)
    },
    onSuccess: async () => {
      setDevolvendo(false)
      setMotivo('')
      await aoMudar()
    },
  })
  const abrir = useMutation({
    mutationFn: urlDoArquivo,
    onSuccess: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
  })

  const aguardando =
    ocorrencia.situacao === 'em_conferencia' && ultima?.situacao === 'em_conferencia'
  const souConferente = ocorrencia.conferenteId === membroId
  const possoConferirPorPapel = ocorrencia.conferenteId ? souConferente : ehGestao
  const enviei = ultima?.enviadaPorId === membroId
  const bloqueadoPorIndependencia = ocorrencia.conferenciaIndependente && enviei
  const possoConferir = aguardando && possoConferirPorPapel && !bloqueadoPorIndependencia
  const possoEnviar = ocorrencia.situacao === 'aberta'

  return (
    <section aria-labelledby="titulo-evidencia" className="flex flex-col gap-(--space-100)">
      <h2 id="titulo-evidencia" className="rotulo-maiusculo text-(--text-subtle)">
        Evidência
      </h2>
      {conferir.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(conferir.error)}
        </MensagemSecao>
      ) : null}

      {ocorrencia.situacao === 'concluida' ? (
        <MensagemSecao tom="informacao">
          Ocorrência concluída. Para enviar algo novo, reabra com motivo.
        </MensagemSecao>
      ) : null}

      {possoEnviar ? (
        <EnvioDeEvidencia
          ocorrencia={ocorrencia}
          corrigindo={ultima?.situacao === 'devolvida'}
          aoEnviar={aoMudar}
        />
      ) : null}

      {aguardando && bloqueadoPorIndependencia && possoConferirPorPapel ? (
        <MensagemSecao tom="atencao">
          Você enviou esta evidência. Outra pessoa precisa conferir.
        </MensagemSecao>
      ) : null}
      {aguardando && souConferente && !bloqueadoPorIndependencia ? (
        <MensagemSecao tom="informacao">Você é o conferente desta ocorrência.</MensagemSecao>
      ) : null}

      {evidencias.length > 0 ? (
        <ul className="flex flex-col rounded-(--radius) border" aria-label="Versões da evidência">
          {evidencias.map((ev) => (
            <li
              key={ev.id}
              className="flex flex-col gap-(--space-050) border-b px-(--space-150) py-(--space-100) last:border-b-0"
            >
              <span className="flex flex-wrap items-center gap-(--space-100)">
                <Icone nome="paperclip" className="text-(--icon)" />
                <button
                  type="button"
                  onClick={() => {
                    abrir.mutate(ev.arquivo.caminho)
                  }}
                  className="min-w-0 flex-1 cursor-pointer truncate text-left corpo-medio text-(--text-link) hover:underline"
                >
                  {ev.arquivo.nome}
                </button>
                <span className="text-xs text-(--text-subtle)">v{ev.numero}</span>
                <Selo tom={SITUACAO[ev.situacao].tom}>{SITUACAO[ev.situacao].texto}</Selo>
              </span>
              <span className="text-xs text-(--text-subtle)">
                {ev.enviadaPorNome} · {formatarInstanteComHora(ev.enviadaEm, fuso)} · execução{' '}
                {formatarDataCivil(ev.dataExecucao)} · {tamanhoLegivel(ev.arquivo.tamanho)}
              </span>
              {ev.conferencia ? (
                <span className="text-xs text-(--text-subtle)">
                  {ev.conferencia.decisao === 'aprovada' ? 'Aprovada' : 'Devolvida'} por{' '}
                  {ev.conferencia.conferenteNome} em{' '}
                  {formatarInstanteComHora(ev.conferencia.em, fuso)}
                  {ev.conferencia.motivo ? ` · Motivo: “${ev.conferencia.motivo}”` : ''}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : !possoEnviar ? (
        <p className="text-xs text-(--text-subtle)">Nenhuma evidência enviada.</p>
      ) : null}

      {possoConferir ? (
        <div className="flex flex-wrap gap-(--space-100)">
          <Botao
            aparencia="primario"
            iconeAntes="check"
            disabled={conferir.isPending}
            onClick={() => {
              conferir.mutate({ decisao: 'aprovada', texto: '' })
            }}
          >
            Aprovar
          </Botao>
          <Botao
            disabled={conferir.isPending}
            onClick={() => {
              setDevolvendo(true)
            }}
          >
            Devolver para correção
          </Botao>
        </div>
      ) : null}

      <Dialogo
        aberto={devolvendo}
        aoMudar={setDevolvendo}
        titulo="Devolver para correção"
        descricao="A evidência volta para quem enviou corrigir. O motivo aparece para a pessoa e fica no histórico."
        acoes={
          <>
            <Botao
              onClick={() => {
                setDevolvendo(false)
              }}
            >
              Cancelar
            </Botao>
            <Botao
              aparencia="perigo"
              disabled={conferir.isPending}
              onClick={() => {
                if (!motivo.trim()) {
                  setErroMotivo('Informe o motivo')
                  return
                }
                conferir.mutate({ decisao: 'devolvida', texto: motivo })
              }}
            >
              Devolver
            </Botao>
          </>
        }
      >
        <CampoTexto
          rotulo="Motivo"
          value={motivo}
          erro={erroMotivo ?? undefined}
          onChange={(evento) => {
            setMotivo(evento.target.value)
            setErroMotivo(null)
          }}
        />
      </Dialogo>
    </section>
  )
}
