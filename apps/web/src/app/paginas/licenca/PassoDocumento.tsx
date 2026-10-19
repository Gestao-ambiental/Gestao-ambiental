import { useIsMutating, useQuery } from '@tanstack/react-query'
import { useId, useRef, useState, type DragEvent } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Carregando, EstadoErro } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { listarEmpreendimentos, listarUnidades } from '@/lib/api/empreendimentos'
import {
  EXTRACAO_ABANDONADA_MS,
  LIMITE_PDF_IA_BYTES,
  obterUltimaExtracao,
} from '@/lib/api/extracao'
import {
  conferirPdf,
  criarInstrumento,
  enviarPdf,
  type Instrumento,
  type ProblemaDoPdf,
} from '@/lib/api/licencas'
import { mensagemDoErro } from '@/lib/erros'
import { cn } from '@/lib/utils'

import { ComoCadastrar, PainelExtracao, type Metodo } from './ExtracaoIa'
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

/** Por que a IA não pode ler este PDF agora (nulo = pode). */
function motivoSemIa(arquivo: File | null, temPdf: boolean): string | null {
  if (!arquivo && !temPdf) return 'Envie o PDF da licença para a IA ler. O manual aceita sem PDF.'
  if (arquivo && arquivo.size > LIMITE_PDF_IA_BYTES)
    return `A IA lê PDF com texto até 10 MB; este tem ${tamanhoLegivel(arquivo.size)}. Siga pelo manual.`
  return null
}

/**
 * /licencas/nova (Protótipo 10; LIC-01, IA-01): empreendimento, unidade, PDF e método. Com IA, o
 * rascunho é criado, o PDF enviado e a extração começa no passo do documento do rascunho.
 */
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
  const [metodo, setMetodo] = useState<Metodo | null>(null)
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
      if (metodoValido === 'ia') {
        await navegar(`/licencas/${id}/documento`, {
          replace: true,
          state: { extrair: crypto.randomUUID() },
        })
      } else {
        await navegar(`/licencas/${id}/identificacao`, { replace: true })
      }
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
    } finally {
      setEnviando(false)
    }
  }

  const semIa = motivoSemIa(arquivo, false)
  const metodoValido = metodo === 'ia' && semIa ? null : metodo
  const podeContinuar = Boolean(unidadeEscolhida) && metodoValido !== null
  const aviso = !unidadeEscolhida
    ? 'Escolha o empreendimento e a unidade.'
    : !metodoValido
      ? 'Escolha como cadastrar.'
      : metodoValido === 'ia'
        ? 'Ao continuar, a IA lê o PDF. Leva até 2 minutos.'
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

        <ComoCadastrar metodo={metodoValido} aoEscolher={setMetodo} semIa={semIa} />
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
  const local = useLocation()
  const pedida = (local.state as { extrair?: string } | null)?.extrair ?? null
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [metodo, setMetodo] = useState<Metodo>(pedida ? 'ia' : 'manual')
  const [extracaoId, setExtracaoId] = useState<string | null>(pedida)
  const [falha, setFalha] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [abertaEm] = useState(() => Date.now())

  const ultima = useQuery({
    queryKey: ['extracao', instrumento.id],
    queryFn: () => obterUltimaExtracao(instrumento.id),
  })
  const pedindo = useIsMutating({ mutationKey: ['extrair', instrumento.id] }) > 0
  const extraindo =
    pedindo ||
    (ultima.data?.situacao === 'em_andamento' &&
      abertaEm - new Date(ultima.data.iniciadaEm).getTime() < EXTRACAO_ABANDONADA_MS)

  const semIa = motivoSemIa(arquivo, Boolean(instrumento.pdf))
  const metodoValido: Metodo = metodo === 'ia' && semIa ? 'manual' : metodo
  const irParaIdentificacao = () => void navegar(`/licencas/${instrumento.id}/identificacao`)

  async function continuar() {
    setFalha(null)
    setEnviando(true)
    try {
      if (arquivo) {
        await enviarPdf(instrumento.id, atual.consultoriaId, arquivo)
        setArquivo(null)
      }
      if (metodoValido === 'ia') setExtracaoId(crypto.randomUUID())
      else irParaIdentificacao()
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
          aviso={
            extraindo
              ? 'Aguardando a extração. O rascunho já está salvo.'
              : metodoValido === 'ia'
                ? 'Ao continuar, a IA lê o PDF. Leva até 2 minutos.'
                : arquivo
                  ? 'O PDF novo é enviado ao continuar.'
                  : undefined
          }
          aoContinuar={() => void continuar()}
          podeContinuar={!extraindo}
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

        <PainelExtracao
          instrumentoId={instrumento.id}
          extracaoId={extracaoId}
          aoConcluir={irParaIdentificacao}
          aoManual={irParaIdentificacao}
          aoTentarDeNovo={() => {
            setExtracaoId(crypto.randomUUID())
          }}
        />
        {extraindo ? null : (
          <ComoCadastrar metodo={metodoValido} aoEscolher={setMetodo} semIa={semIa} />
        )}
      </div>
    </MolduraCadastro>
  )
}
