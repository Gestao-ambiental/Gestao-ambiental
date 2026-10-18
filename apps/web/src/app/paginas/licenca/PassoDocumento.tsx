import { useQuery } from '@tanstack/react-query'
import { useId, useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Carregando, EstadoErro } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { listarEmpreendimentos, listarUnidades } from '@/lib/api/empreendimentos'
import {
  conferirPdf,
  criarInstrumento,
  enviarPdf,
  type Instrumento,
  type ProblemaDoPdf,
} from '@/lib/api/licencas'
import { mensagemDoErro } from '@/lib/erros'
import { cn } from '@/lib/utils'

import { GuardaRascunho, SoGestao } from './GuardaCadastro'
import { MolduraCadastro, RodapeCadastro } from './MolduraCadastro'

const PROBLEMAS: Record<ProblemaDoPdf, string> = {
  nao_pdf: 'Este arquivo não é um PDF.',
  grande_demais: 'O PDF passa de 25 MB.',
  vazio: 'O arquivo está vazio.',
}

const classeSelect =
  'h-(--size-control) w-full rounded-(--radius) border border-(--border-input) bg-(--surface-input) px-(--space-100) corpo text-(--text) outline-none focus:border-(--border-focus)'

function tamanhoLegivel(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
    : `${String(Math.max(1, Math.round(bytes / 1024)))} KB`
}

/** Área de envio: arrastar ou escolher. Confere assinatura, tipo e tamanho antes de aceitar. */
function EnvioPdf({
  arquivo,
  atual,
  aoEscolher,
}: {
  arquivo: File | null
  atual: string | null
  aoEscolher: (arquivo: File) => void
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const ajudaId = useId()
  const [problema, setProblema] = useState<string | null>(null)
  const [arrastando, setArrastando] = useState(false)

  async function receber(escolhido: File | undefined) {
    if (!escolhido) return
    const erro = await conferirPdf(escolhido)
    if (erro) {
      setProblema(PROBLEMAS[erro])
      return
    }
    setProblema(null)
    aoEscolher(escolhido)
  }

  function soltar(evento: DragEvent<HTMLDivElement>) {
    evento.preventDefault()
    setArrastando(false)
    void receber(evento.dataTransfer.files[0])
  }

  const nome = arquivo?.name ?? atual

  return (
    <div className="flex flex-col gap-(--space-100)">
      {/* Arrastar é atalho de mouse; pelo teclado, "Escolher arquivo" faz o mesmo. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        onDragOver={(evento) => {
          evento.preventDefault()
          setArrastando(true)
        }}
        onDragLeave={() => {
          setArrastando(false)
        }}
        onDrop={soltar}
        className={cn(
          'flex flex-col items-center gap-(--space-100) rounded-(--radius) border border-dashed p-(--space-300) text-center transicao-estado',
          arrastando
            ? 'border-(--border-focus) bg-(--surface-selected)'
            : 'border-(--border-strong) bg-(--surface)',
        )}
      >
        <Icone nome="file-text" tamanho={24} className="text-(--icon)" />
        {nome ? (
          <p className="corpo">
            <span className="corpo-medio">{nome}</span>
            {arquivo ? (
              <span className="text-(--text-subtle)"> · {tamanhoLegivel(arquivo.size)}</span>
            ) : null}
          </p>
        ) : (
          <p className="corpo">Arraste o PDF aqui ou</p>
        )}
        <Botao
          aria-describedby={ajudaId}
          onClick={() => {
            entrada.current?.click()
          }}
        >
          {nome ? 'Trocar arquivo' : 'Escolher arquivo'}
        </Botao>
        <input
          ref={entrada}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(evento) => {
            void receber(evento.target.files?.[0])
            evento.target.value = ''
          }}
        />
        <p id={ajudaId} className="text-xs text-(--text-subtle)">
          PDF até 25 MB.{' '}
          {atual && !arquivo ? 'Trocar cria uma versão nova; a anterior fica guardada.' : ''}
        </p>
      </div>
      {problema ? (
        <MensagemSecao role="alert" tom="perigo">
          {problema}
        </MensagemSecao>
      ) : null}
    </div>
  )
}

function ComoCadastrar({ manual, aoEscolher }: { manual: boolean; aoEscolher: () => void }) {
  return (
    <fieldset className="grid gap-(--space-150) sm:grid-cols-2">
      <legend className="mb-(--space-100) titulo-secao">Como cadastrar</legend>
      <label className="flex cursor-not-allowed flex-col gap-(--space-050) rounded-(--radius) border bg-(--surface) p-(--space-200) opacity-70">
        <span className="inline-flex items-center gap-(--space-100) corpo-medio text-(--text-disabled)">
          <input
            type="radio"
            name="como-cadastrar"
            disabled
            aria-labelledby="como-ia"
            aria-describedby="ia-indisponivel"
          />
          <span id="como-ia">Extrair com IA</span>
        </span>
        <span id="ia-indisponivel" className="text-xs text-(--text-subtle)">
          A extração por IA ainda não está disponível. O cadastro manual é completo.
        </span>
      </label>
      <label className="flex cursor-pointer flex-col gap-(--space-050) rounded-(--radius) border bg-(--surface) p-(--space-200) transicao-estado has-checked:border-(--border-focus) has-checked:bg-(--surface-selected) hover:bg-(--surface-hover)">
        <span className="inline-flex items-center gap-(--space-100) corpo-medio">
          <input
            type="radio"
            name="como-cadastrar"
            checked={manual}
            onChange={aoEscolher}
            aria-labelledby="como-manual"
            aria-describedby="manual-descricao"
            className="size-4 accent-(--brand)"
          />
          <span id="como-manual">Cadastrar manualmente</span>
        </span>
        <span id="manual-descricao" className="text-xs text-(--text-subtle)">
          Você preenche a identificação e as condicionantes. Sempre disponível; aceita PDF até 25 MB
          ou nenhum.
        </span>
      </label>
    </fieldset>
  )
}

/** /licencas/nova (Protótipo 10, caminho manual; LIC-01): empreendimento, unidade, PDF e método. */
export function PassoDocumentoNovo() {
  return (
    <SoGestao passo="documento">
      <DocumentoNovo />
    </SoGestao>
  )
}

function DocumentoNovo() {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const [busca] = useSearchParams()
  const navegar = useNavigate()
  const [id] = useState(() => crypto.randomUUID())
  const [empreendimentoId, setEmpreendimentoId] = useState(busca.get('empreendimento') ?? '')
  const [unidadeId, setUnidadeId] = useState(busca.get('unidade') ?? '')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [manual, setManual] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const empreendimentos = useQuery({
    queryKey: ['empreendimentos', cid, '', 'selecao'],
    queryFn: () => listarEmpreendimentos(cid, '', 0),
  })
  const unidades = useQuery({
    queryKey: ['unidades', empreendimentoId],
    queryFn: () => listarUnidades(empreendimentoId),
    enabled: Boolean(empreendimentoId),
  })

  const listaUnidades = unidades.data ?? []
  const unidadeValida = listaUnidades.some((u) => u.id === unidadeId)
  const unidadeEscolhida = unidadeValida
    ? unidadeId
    : ((listaUnidades.length === 1 ? listaUnidades[0]?.id : '') ?? '')
  const nomeEmpreendimento = empreendimentos.data?.itens.find(
    (e) => e.id === empreendimentoId,
  )?.nome

  async function continuar() {
    setFalha(null)
    setEnviando(true)
    try {
      await criarInstrumento(id, unidadeEscolhida)
      if (arquivo) await enviarPdf(id, cid, arquivo)
      await navegar(`/licencas/${id}/identificacao`, { replace: true })
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
    } finally {
      setEnviando(false)
    }
  }

  const podeContinuar = Boolean(unidadeEscolhida) && manual
  const aviso = !unidadeEscolhida
    ? 'Escolha o empreendimento e a unidade.'
    : !manual
      ? 'Escolha como cadastrar.'
      : arquivo
        ? 'O PDF é enviado ao continuar.'
        : 'Sem PDF por enquanto: dá para anexar depois.'

  return (
    <MolduraCadastro
      passo="documento"
      contexto={nomeEmpreendimento}
      sairPara={empreendimentoId ? `/empreendimentos/${empreendimentoId}` : '/empreendimentos'}
      rodape={
        <RodapeCadastro
          aviso={aviso}
          aoContinuar={() => void continuar()}
          podeContinuar={podeContinuar}
          continuando={enviando}
        />
      }
    >
      <div className="flex flex-col gap-(--space-300)">
        {falha ? (
          <MensagemSecao role="alert" tom="perigo">
            {falha}
          </MensagemSecao>
        ) : null}
        <section aria-labelledby="titulo-local" className="flex flex-col gap-(--space-100)">
          <h2 id="titulo-local" className="titulo-secao">
            Empreendimento e unidade
          </h2>
          {empreendimentos.isPending ? (
            <Carregando rotulo="Carregando empreendimentos" linhas={1} />
          ) : empreendimentos.isError ? (
            <EstadoErro aoTentarDeNovo={() => void empreendimentos.refetch()} />
          ) : (
            <div className="grid gap-(--space-150) sm:grid-cols-2">
              <label className="flex flex-col gap-(--space-050)">
                <span className="rotulo">Empreendimento</span>
                <select
                  className={classeSelect}
                  value={empreendimentoId}
                  onChange={(evento) => {
                    setEmpreendimentoId(evento.target.value)
                    setUnidadeId('')
                  }}
                >
                  <option value="">Selecione o empreendimento</option>
                  {empreendimentos.data.itens.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-(--space-050)">
                <span className="rotulo">Unidade</span>
                <select
                  className={classeSelect}
                  value={unidadeEscolhida}
                  disabled={!empreendimentoId || unidades.isPending}
                  onChange={(evento) => {
                    setUnidadeId(evento.target.value)
                  }}
                >
                  <option value="">Selecione a unidade</option>
                  {listaUnidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {empreendimentoId && unidades.isSuccess && listaUnidades.length === 0 ? (
            <MensagemSecao tom="atencao">
              Este empreendimento ainda não tem unidade. A licença pertence a uma unidade:{' '}
              <Link to={`/empreendimentos/${empreendimentoId}`}>cadastre a unidade</Link> e volte.
            </MensagemSecao>
          ) : null}
        </section>

        <section aria-labelledby="titulo-pdf" className="flex flex-col gap-(--space-100)">
          <h2 id="titulo-pdf" className="titulo-secao">
            PDF da licença
          </h2>
          <EnvioPdf arquivo={arquivo} atual={null} aoEscolher={setArquivo} />
        </section>

        <ComoCadastrar
          manual={manual}
          aoEscolher={() => {
            setManual(true)
          }}
        />
      </div>
    </MolduraCadastro>
  )
}

/** /licencas/:id/documento: rascunho existente; troca ou anexa o PDF. */
export function PassoDocumento() {
  const { id = '' } = useParams()
  return (
    <GuardaRascunho id={id} passo="documento">
      {(instrumento) => <DocumentoExistente instrumento={instrumento} />}
    </GuardaRascunho>
  )
}

function DocumentoExistente({ instrumento }: { instrumento: Instrumento }) {
  const { atual } = useConsultoria()
  const navegar = useNavigate()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [falha, setFalha] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function continuar() {
    setFalha(null)
    setEnviando(true)
    try {
      if (arquivo) await enviarPdf(instrumento.id, atual.consultoriaId, arquivo)
      await navegar(`/licencas/${instrumento.id}/identificacao`)
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <MolduraCadastro
      passo="documento"
      instrumentoId={instrumento.id}
      contexto={`${instrumento.empreendimentoNome} · ${instrumento.unidadeNome}`}
      sairPara={`/empreendimentos/${instrumento.empreendimentoId}`}
      rodape={
        <RodapeCadastro
          aviso={arquivo ? 'O PDF novo é enviado ao continuar.' : undefined}
          aoContinuar={() => void continuar()}
          podeContinuar
          continuando={enviando}
        />
      }
    >
      <div className="flex flex-col gap-(--space-300)">
        {falha ? (
          <MensagemSecao role="alert" tom="perigo">
            {falha}
          </MensagemSecao>
        ) : null}
        <section aria-labelledby="titulo-pdf" className="flex flex-col gap-(--space-100)">
          <h2 id="titulo-pdf" className="titulo-secao">
            PDF da licença
          </h2>
          <EnvioPdf
            arquivo={arquivo}
            atual={instrumento.pdf?.nome ?? null}
            aoEscolher={setArquivo}
          />
        </section>
      </div>
    </MolduraCadastro>
  )
}
