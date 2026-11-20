import {
  dataForaDoCiclo,
  ehDataCivil,
  formatarDataCivil,
  janelaDoCiclo,
  type DataCivil,
} from '@gestao-ambiental/domain'
import { useMutation } from '@tanstack/react-query'
import { useState, type RefObject } from 'react'

import { BotaoGerarRelatorio } from '@/app/paginas/modelos/GerarRelatorio'
import { Botao } from '@/components/ui/botao'
import { CampoData } from '@/components/ui/campo-data'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo, type TomSelo } from '@/components/ui/selo'
import {
  conferirArquivoDeEvidencia,
  enviarEvidencia,
  urlDoArquivo,
  type Evidencia,
  type Ocorrencia,
  type ProblemaDaEvidencia,
} from '@/lib/api/ocorrencias'
import { formatarInstanteComHora } from '@/lib/datas'
import { mensagemDoErro } from '@/lib/erros'
import { tamanhoLegivel } from '@/lib/texto'

import { RelatoriosEscritos } from '@/app/paginas/relatorios/RelatoriosEscritos'

import { ConferenciaDaIa } from './ConferenciaDaIa'
import { CabecalhoDeSecao, VazioDeSecao } from './pecas'

const SITUACAO: Record<Evidencia['situacao'], { texto: string; tom: TomSelo }> = {
  em_conferencia: { texto: 'Em conferência', tom: 'revisao' },
  aprovada: { texto: 'Aprovada', tom: 'sucesso' },
  devolvida: { texto: 'Devolvida', tom: 'perigo' },
}

const PROBLEMAS: Record<ProblemaDaEvidencia, string> = {
  nao_pdf: 'Este arquivo não é um PDF válido.',
  grande_demais: 'O arquivo passa de 25 MB.',
  vazio: 'O arquivo está vazio.',
  tipo: 'Envie PDF, PNG, JPEG ou DOCX.',
  nao_docx: 'Este arquivo não é um .docx válido.',
}

function dataDe(valor: string): DataCivil | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? (valor as DataCivil) : null
}

/** Formulário de envio: arquivo + data real de execução (obrigatória), com aviso fora do ciclo. */
function EnvioDeEvidencia({
  ocorrencia,
  corrigindo,
  entrada,
  aoEnviar,
}: {
  ocorrencia: Ocorrencia
  corrigindo: boolean
  /** O botão principal do topo abre o seletor de arquivo por aqui. */
  entrada: RefObject<HTMLInputElement | null>
  aoEnviar: () => Promise<void>
}) {
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
      className="mt-(--e-3) flex flex-col gap-(--e-3) rounded-(--raio-painel) border border-dashed border-(--regra-forte) bg-(--folha) p-(--e-4)"
    >
      {envio.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(envio.error)}
        </MensagemSecao>
      ) : null}
      <div className="flex flex-wrap items-center gap-(--e-2)">
        <Icone nome="paperclip" className="text-(--icone-2)" />
        <span
          className={
            arquivo
              ? 'min-w-0 flex-1 truncate corpo-medio numero'
              : 'min-w-0 flex-1 truncate corpo text-(--tinta-2)'
          }
        >
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
          accept="application/pdf,image/png,image/jpeg,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
      <CampoData
        rotulo="Data real de execução *"
        hoje={ocorrencia.hoje}
        maximo={ocorrencia.hoje}
        motivoDoLimite="A data real de execução não pode estar no futuro"
        valor={ehDataCivil(data) ? data : null}
        erro={erroData ?? undefined}
        aoMudar={(nova) => {
          setData(nova ?? '')
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
      <div className="flex justify-end max-md:[&>*]:flex-1">
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
 * Evidência (DEM-03, DEM-09): envio com a data real de execução e as versões enviadas. Upload não
 * conclui: vai para conferência. Aprovar e devolver ficam no topo da tela (PainelAgora).
 */
export function SecaoEvidencia({
  ocorrencia,
  evidencias,
  fuso,
  entrada,
  aoMudar,
}: {
  ocorrencia: Ocorrencia
  evidencias: readonly Evidencia[]
  fuso: string
  entrada: RefObject<HTMLInputElement | null>
  aoMudar: () => Promise<void>
}) {
  const ultima = evidencias[0]
  const abrir = useMutation({
    mutationFn: urlDoArquivo,
    onSuccess: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
  })
  const possoEnviar = ocorrencia.situacao === 'aberta'

  return (
    <section aria-labelledby="titulo-evidencia" className="flex flex-col">
      <CabecalhoDeSecao
        id="titulo-evidencia"
        titulo="Evidência"
        acao={
          possoEnviar ? (
            <BotaoGerarRelatorio
              empreendimentoId={ocorrencia.empreendimentoId}
              empreendimentoNome={ocorrencia.empreendimentoNome}
              ocorrenciaId={ocorrencia.id}
            />
          ) : null
        }
      />
      {abrir.isError ? (
        <MensagemSecao role="alert" tom="perigo" className="mt-(--e-2)">
          {mensagemDoErro(abrir.error)}
        </MensagemSecao>
      ) : null}

      {possoEnviar ? (
        <EnvioDeEvidencia
          ocorrencia={ocorrencia}
          corrigindo={ultima?.situacao === 'devolvida'}
          entrada={entrada}
          aoEnviar={aoMudar}
        />
      ) : null}

      {evidencias.length > 0 ? (
        <ul className="flex flex-col" aria-label="Versões da evidência">
          {evidencias.map((ev) => (
            <li
              key={ev.id}
              className="flex min-h-(--linha) flex-col justify-center gap-(--e-05) border-b border-(--regra-leve) py-(--e-2)"
            >
              <span className="flex flex-wrap items-center gap-x-(--e-2) gap-y-(--e-1)">
                <span className="text-xs font-[800] text-(--tinta-2) numero">v{ev.numero}</span>
                <button
                  type="button"
                  onClick={() => {
                    abrir.mutate(ev.arquivo.caminho)
                  }}
                  className="min-w-0 flex-1 cursor-pointer truncate text-left corpo-medio text-(--link) hover:underline max-md:min-h-(--controle-toque)"
                >
                  {ev.arquivo.nome}
                </button>
                <Selo tom={SITUACAO[ev.situacao].tom}>{SITUACAO[ev.situacao].texto}</Selo>
              </span>
              <span className="text-xs text-(--tinta-2) numero">
                {ev.enviadaPorNome} · {formatarInstanteComHora(ev.enviadaEm, fuso)} · execução{' '}
                {formatarDataCivil(ev.dataExecucao)} · {tamanhoLegivel(ev.arquivo.tamanho)}
              </span>
              {ev.conferencia ? (
                <span className="text-xs text-(--tinta-2) numero">
                  {ev.conferencia.decisao === 'aprovada' ? 'Aprovada' : 'Devolvida'} por{' '}
                  {ev.conferencia.conferenteNome} em{' '}
                  {formatarInstanteComHora(ev.conferencia.em, fuso)}
                  {ev.conferencia.motivo ? (
                    <span className="text-(--tinta)"> · “{ev.conferencia.motivo}”</span>
                  ) : null}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : !possoEnviar ? (
        <VazioDeSecao>Nenhuma evidência enviada.</VazioDeSecao>
      ) : null}

      {ultima ? (
        <ConferenciaDaIa key={ultima.id} ocorrencia={ocorrencia} evidencia={ultima} />
      ) : null}
      <RelatoriosEscritos ocorrenciaId={ocorrencia.id} />
    </section>
  )
}
