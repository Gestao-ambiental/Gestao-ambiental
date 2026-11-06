import {
  avisoForaDoCiclo,
  formatarDataCivil,
  MENSAGEM_DO_ERRO_DE_DATA,
  pendenciasDoEnvio,
  validarDataDeExecucao,
  type DataCivil,
  type JanelaDoCiclo,
} from '@gestao-ambiental/domain'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState, type DragEvent } from 'react'

import { AreaTexto } from '@/components/ui/area-texto'
import { Botao } from '@/components/ui/botao'
import { CampoData } from '@/components/ui/campo-data'
import { CarrosselImagens, type ImagemDoCarrossel } from '@/components/ui/carrossel-imagens'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  conferirArquivoDeEvidencia,
  enviarEvidencia,
  MAXIMO_DE_ARQUIVOS,
  type ArquivoDoEnvio,
  type Evidencia,
  type Ocorrencia,
  type ProblemaDaEvidencia,
} from '@/lib/api/ocorrencias'
import { mensagemDoErro } from '@/lib/erros'

import { ehImagem } from './dados'
import { ListaAnexos, type ItemDeAnexo } from './ListaAnexos'
import { RodapeDeAcao, TextoPendencia } from './RodapeDeAcao'

type Anexo =
  | { tipo: 'mantido'; chave: string; arquivo: ArquivoDoEnvio }
  | { tipo: 'novo'; chave: string; arquivo: File; previa: string | null }

const PROBLEMAS: Record<ProblemaDaEvidencia, string> = {
  tipo: 'Envie PDF, PNG ou JPEG.',
  vazio: 'O arquivo está vazio.',
  grande_demais: 'O arquivo passa de 25 MB.',
  nao_pdf: 'Este arquivo não é um PDF.',
}

const ACEITOS = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg'

interface Props {
  ocorrencia: Ocorrencia
  janela: JanelaDoCiclo | null
  /** Envio devolvido ou cancelado: os arquivos e a data voltam para o formulário. */
  anterior: Evidencia | undefined
  rotuloBotao: string
  urls: ReadonlyMap<string, string>
  aoEnviar: () => Promise<void>
}

/**
 * Formulário de envio para conferência (DEM-03, DEM-09): anexos múltiplos, data de execução com
 * máscara e observações. O botão nunca fica desabilitado: clicar com pendência marca os campos.
 */
export function FormularioDeEnvio({
  ocorrencia,
  janela,
  anterior,
  rotuloBotao,
  urls,
  aoEnviar,
}: Props) {
  const [anexos, setAnexos] = useState<Anexo[]>(() =>
    (anterior?.arquivos ?? []).map((arquivo) => ({
      tipo: 'mantido',
      chave: arquivo.versaoId,
      arquivo,
    })),
  )
  const [texto, setTexto] = useState(() =>
    anterior ? formatarDataCivil(anterior.dataExecucao) : '',
  )
  const [data, setData] = useState<DataCivil | null>(anterior?.dataExecucao ?? null)
  const [saiuDaData, setSaiuDaData] = useState(false)
  const [observacoes, setObservacoes] = useState('')
  const [tentou, setTentou] = useState(false)
  const [problema, setProblema] = useState<string | null>(null)
  const [carrossel, setCarrossel] = useState<number | null>(null)
  const [evidenciaId] = useState(() => crypto.randomUUID())
  const entrada = useRef<HTMLInputElement>(null)
  const botaoAnexar = useRef<HTMLButtonElement>(null)

  // Prévias locais (object URL) vivem enquanto o anexo está na lista.
  const previas = useRef(new Set<string>())
  useEffect(() => {
    const ativas = previas.current
    return () => {
      for (const url of ativas) URL.revokeObjectURL(url)
    }
  }, [])

  const validacao = validarDataDeExecucao(texto, ocorrencia.hoje, janela, tentou || saiuDaData)
  const dataValida = validarDataDeExecucao(texto, ocorrencia.hoje, janela, true).data !== null
  const pendencias = pendenciasDoEnvio({ arquivos: anexos.length, dataValida })

  const enviar = useMutation({
    mutationFn: () => {
      if (!validacao.data) throw new Error('data_execucao_obrigatoria')
      return enviarEvidencia(ocorrencia, {
        evidenciaId,
        dataExecucao: validacao.data,
        observacoes,
        mantidos: anexos.flatMap((a) => (a.tipo === 'mantido' ? [a.arquivo.versaoId] : [])),
        novos: anexos.flatMap((a) =>
          a.tipo === 'novo' ? [{ versaoId: a.chave, arquivo: a.arquivo }] : [],
        ),
      })
    },
    onSuccess: aoEnviar,
  })

  async function adicionar(arquivos: readonly File[]) {
    setProblema(null)
    const aceitos: Anexo[] = []
    for (const arquivo of arquivos) {
      const erro = await conferirArquivoDeEvidencia(arquivo)
      if (erro) {
        setProblema(`${arquivo.name}: ${PROBLEMAS[erro]}`)
        continue
      }
      let previa: string | null = null
      if (ehImagem(arquivo.type)) {
        previa = URL.createObjectURL(arquivo)
        previas.current.add(previa)
      }
      aceitos.push({ tipo: 'novo', chave: crypto.randomUUID(), arquivo, previa })
    }
    setAnexos((atuais) => {
      const juntos = [...atuais, ...aceitos]
      if (juntos.length > MAXIMO_DE_ARQUIVOS) {
        setProblema('Envie até 20 arquivos por vez.')
        return juntos.slice(0, MAXIMO_DE_ARQUIVOS)
      }
      return juntos
    })
  }

  function remover(chave: string) {
    setAnexos((atuais) => {
      const saindo = atuais.find((a) => a.chave === chave)
      if (saindo?.tipo === 'novo' && saindo.previa) {
        URL.revokeObjectURL(saindo.previa)
        previas.current.delete(saindo.previa)
      }
      return atuais.filter((a) => a.chave !== chave)
    })
    botaoAnexar.current?.focus()
  }

  function soltar(evento: DragEvent) {
    evento.preventDefault()
    void adicionar([...evento.dataTransfer.files])
  }

  function clicarEnviar() {
    setTentou(true)
    if (enviar.isPending) return
    if (pendencias.length > 0) {
      if (anexos.length === 0) botaoAnexar.current?.focus()
      else document.getElementById(`data-execucao-${ocorrencia.id}`)?.focus()
      return
    }
    enviar.mutate()
  }

  const itens: ItemDeAnexo[] = anexos.map((a) =>
    a.tipo === 'mantido'
      ? {
          chave: a.chave,
          nome: a.arquivo.nome,
          tamanho: a.arquivo.tamanho,
          miniaturaUrl: ehImagem(a.arquivo.mime) ? (urls.get(a.arquivo.caminho) ?? null) : null,
          caminho: a.arquivo.caminho,
        }
      : {
          chave: a.chave,
          nome: a.arquivo.name,
          tamanho: a.arquivo.size,
          miniaturaUrl: a.previa,
          caminho: null,
        },
  )
  const imagens: ImagemDoCarrossel[] = itens.flatMap((item) =>
    item.miniaturaUrl ? [{ id: item.chave, nome: item.nome, url: item.miniaturaUrl }] : [],
  )
  const faltamArquivos = tentou && anexos.length === 0

  return (
    // Arrastar é atalho de mouse; pelo teclado, "Anexar arquivo" faz o mesmo.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="flex flex-col gap-(--space-200)"
      onDragOver={(evento) => {
        evento.preventDefault()
      }}
      onDrop={soltar}
    >
      <fieldset className="flex flex-col gap-(--space-100)">
        <legend className="mb-(--space-100) rotulo">Anexos *</legend>
        <ListaAnexos
          rotulo="Anexos"
          itens={itens}
          aoRemover={remover}
          aoAbrirImagem={(chave) => {
            setCarrossel(imagens.findIndex((imagem) => imagem.id === chave))
          }}
        />
        <div>
          <Botao
            ref={botaoAnexar}
            aparencia="sutil"
            iconeAntes="paperclip"
            className="-ml-(--space-100)"
            aria-describedby={faltamArquivos ? `anexos-erro-${ocorrencia.id}` : undefined}
            onClick={() => entrada.current?.click()}
          >
            Anexar arquivo
          </Botao>
          <input
            ref={entrada}
            type="file"
            multiple
            accept={ACEITOS}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(evento) => {
              const escolhidos = [...(evento.target.files ?? [])]
              evento.target.value = ''
              void adicionar(escolhidos)
            }}
          />
        </div>
        {faltamArquivos ? (
          <p id={`anexos-erro-${ocorrencia.id}`} className="text-xs text-(--text-danger)">
            Obrigatório
          </p>
        ) : null}
        {problema ? (
          <p role="alert" className="text-xs text-(--text-danger)">
            {problema}
          </p>
        ) : null}
      </fieldset>

      <CampoData
        id={`data-execucao-${ocorrencia.id}`}
        rotulo="Data de execução *"
        valor={data}
        aoMudar={setData}
        hoje={ocorrencia.hoje}
        erro={validacao.erro ? MENSAGEM_DO_ERRO_DE_DATA[validacao.erro] : undefined}
        aviso={validacao.foraDoCiclo && janela ? avisoForaDoCiclo(janela) : undefined}
        validacaoExterna={{
          aoMudarTexto: setTexto,
          aoSair: () => {
            setSaiuDaData(true)
          },
        }}
        className="max-w-[220px] max-md:max-w-none"
      />

      <AreaTexto
        rotulo="Observações"
        placeholder="Opcional"
        value={observacoes}
        maxLength={2000}
        onChange={(evento) => {
          setObservacoes(evento.target.value)
        }}
      />

      {enviar.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(enviar.error)}
        </MensagemSecao>
      ) : null}

      <RodapeDeAcao
        pendencia={<TextoPendencia pendencias={pendencias} tentou={tentou} />}
        botao={
          <Botao
            aparencia="primario"
            iconeAntes="send"
            aria-busy={enviar.isPending || undefined}
            onClick={clicarEnviar}
          >
            {enviar.isPending ? 'Enviando…' : rotuloBotao}
          </Botao>
        }
      />

      <CarrosselImagens imagens={imagens} indice={carrossel} aoMudarIndice={setCarrossel} />
    </div>
  )
}
