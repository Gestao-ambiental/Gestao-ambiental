import { lerTitularDaLicenca, recursoLiberado } from '@gestao-ambiental/domain'
import { useIsMutating, useQuery } from '@tanstack/react-query'
import { useId, useRef, useState, type DragEvent } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { useTarefas } from '@/app/consultoria/tempo-ativo'
import { useCatalogoComercial } from '@/app/plano/catalogo'
import { useDadosComerciais } from '@/app/plano/situacao'
import { lerTextoDoPdf } from '@/components/pdf/ler-texto-do-pdf'
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
import { tamanhoLegivel } from '@/lib/texto'
import { cn } from '@/lib/utils'

import { EmpreendimentoDaLicenca, type LeituraDoTitular } from './EmpreendimentoDaLicenca'
import { ComoCadastrar, PainelExtracao, type Metodo } from './ExtracaoIa'
import { GuardaRascunho, SoGestao } from './GuardaCadastro'
import { MolduraCadastro, RodapeCadastro } from './MolduraCadastro'

const PROBLEMAS: Record<ProblemaDoPdf, string> = {
  nao_pdf: 'Este arquivo não é um PDF.',
  grande_demais: 'O PDF passa de 25 MB.',
  vazio: 'O arquivo está vazio.',
}

/** Área de envio: arrastar ou escolher. Confere assinatura, tipo e tamanho antes de aceitar. */
function EnvioPdf({
  arquivo,
  atual,
  aoEscolher,
  idEntrada,
}: {
  arquivo: File | null
  atual: string | null
  aoEscolher: (arquivo: File) => void
  /** Id do campo de arquivo, para outro botão da tela abrir o seletor. */
  idEntrada?: string
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
    <div className="flex flex-col gap-(--e-2)">
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
          'flex flex-col items-center gap-(--e-2) rounded-(--raio-painel) border-2 border-dashed px-(--e-4) py-(--e-6) text-center transicao-estado',
          arrastando
            ? 'border-(--marca-linha) bg-(--escolha)'
            : 'border-(--regra-forte) bg-(--folha)',
        )}
      >
        <Icone nome={nome ? 'file-check' : 'file-plus'} tamanho={32} className="text-(--tinta-3)" />
        {nome ? (
          <p className="corpo">
            <span className="corpo-medio">{nome}</span>
            {arquivo ? (
              <span className="text-(--tinta-2)"> · {tamanhoLegivel(arquivo.size)}</span>
            ) : null}
          </p>
        ) : (
          <p className="titulo-secao text-(--tinta)">Arraste o PDF aqui</p>
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
          id={idEntrada}
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
        <p id={ajudaId} className="rotulo">
          PDF até 25 MB
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

/** Por que a IA não pode ler este PDF agora (nulo = pode). Uma linha, sem beco sem saída. */
function motivoSemIa(arquivo: File | null, temPdf: boolean, iaNoPlano = true): string | null {
  if (!iaNoPlano) return 'A extração por IA faz parte dos planos Equipe e Escala.'
  if (!arquivo && !temPdf) return 'Envie o PDF da licença para a IA ler. O manual aceita sem PDF.'
  if (arquivo && arquivo.size > LIMITE_PDF_IA_BYTES)
    return `A IA lê PDF com texto até 10 MB; este tem ${tamanhoLegivel(arquivo.size)}. Siga pelo manual.`
  return null
}

/** A IA está no plano? Sem os dados (carregando ou erro), não bloqueia: o banco decide de fato. */
function useIaNoPlano(): boolean {
  const dados = useDadosComerciais()
  const catalogo = useCatalogoComercial()
  if (!dados.data || !catalogo.data) return true
  return recursoLiberado(dados.data.situacao, 'ia', catalogo.data)
}

/**
 * /licencas/nova (Protótipo 10; LIC-01, IA-01): PDF primeiro, empreendimento e unidade, método.
 * O titular é lido do PDF no navegador (antes de existir rascunho) para sugerir o empreendimento
 * cadastrado ou cadastrar com um clique; sem PDF, dá para escolher ou cadastrar na hora. Com IA, o
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
  const tarefas = useTarefas()
  const iaNoPlano = useIaNoPlano()
  const idEntradaPdf = useId()

  const leituraDoPdf = useQuery({
    queryKey: ['titular-do-pdf', arquivo?.name, arquivo?.size, arquivo?.lastModified],
    queryFn: async () => {
      if (!arquivo) throw new Error('sem_pdf')
      return lerTitularDaLicenca(await lerTextoDoPdf(arquivo))
    },
    enabled: arquivo !== null,
    retry: false,
    staleTime: Infinity,
  })
  const leitura: LeituraDoTitular = !arquivo
    ? { situacao: 'sem_pdf' }
    : leituraDoPdf.isPending
      ? { situacao: 'lendo' }
      : leituraDoPdf.isError
        ? { situacao: 'falhou' }
        : { situacao: 'pronta', titular: leituraDoPdf.data }

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
        // Cadastro com IA (ADR-0027): o tempo ativo conta do envio até confirmar as condicionantes.
        tarefas.iniciar(`ia:${id}`)
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

  const semIa = motivoSemIa(arquivo, false, iaNoPlano)
  const metodoValido = metodo === 'ia' && semIa ? null : metodo
  const podeContinuar = Boolean(unidadeEscolhida) && metodoValido !== null
  const aviso = !unidadeEscolhida
    ? empreendimentoId
      ? 'Escolha a unidade.'
      : 'Escolha ou cadastre o empreendimento.'
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
      <div className="flex flex-col gap-(--e-6)">
        {falha ? (
          <MensagemSecao role="alert" tom="perigo">
            {falha}
          </MensagemSecao>
        ) : null}
        <section aria-labelledby="titulo-pdf" className="flex flex-col gap-(--e-2)">
          <h2 id="titulo-pdf" className="titulo-secao">
            PDF da licença
          </h2>
          <EnvioPdf
            arquivo={arquivo}
            atual={null}
            aoEscolher={setArquivo}
            idEntrada={idEntradaPdf}
          />
        </section>

        <section aria-labelledby="titulo-local" className="flex flex-col gap-(--e-3)">
          <h2 id="titulo-local" className="titulo-secao">
            Empreendimento e unidade
          </h2>
          <EmpreendimentoDaLicenca
            consultoriaId={cid}
            empreendimentos={empreendimentos.data?.itens ?? []}
            carregando={empreendimentos.isPending}
            erro={empreendimentos.isError}
            aoTentarDeNovo={() => void empreendimentos.refetch()}
            empreendimentoId={empreendimentoId}
            unidadeEscolhida={unidadeEscolhida}
            unidades={listaUnidades}
            unidadesCarregando={Boolean(empreendimentoId) && unidades.isPending}
            leitura={leitura}
            aoEscolherEmpreendimento={(novo, unidade) => {
              setEmpreendimentoId(novo)
              setUnidadeId(unidade ?? '')
            }}
            aoEscolherUnidade={setUnidadeId}
            aoPedirPdf={() => {
              document.getElementById(idEntradaPdf)?.click()
            }}
          />
          {empreendimentoId && unidades.isSuccess && listaUnidades.length === 0 ? (
            <MensagemSecao tom="atencao">
              Este empreendimento ainda não tem unidade. A licença pertence a uma unidade:{' '}
              <Link to={`/empreendimentos/${empreendimentoId}`}>cadastre a unidade</Link> e volte.
            </MensagemSecao>
          ) : null}
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
  const tarefas = useTarefas()

  const ultima = useQuery({
    queryKey: ['extracao', instrumento.id],
    queryFn: () => obterUltimaExtracao(instrumento.id),
  })
  const pedindo = useIsMutating({ mutationKey: ['extrair', instrumento.id] }) > 0
  const extraindo =
    pedindo ||
    (ultima.data?.situacao === 'em_andamento' &&
      abertaEm - new Date(ultima.data.iniciadaEm).getTime() < EXTRACAO_ABANDONADA_MS)

  const iaNoPlano = useIaNoPlano()
  const semIa = motivoSemIa(arquivo, Boolean(instrumento.pdf), iaNoPlano)
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
      if (metodoValido === 'ia') {
        tarefas.iniciar(`ia:${instrumento.id}`)
        setExtracaoId(crypto.randomUUID())
      } else irParaIdentificacao()
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
      <div className="flex flex-col gap-(--e-6)">
        {falha ? (
          <MensagemSecao role="alert" tom="perigo">
            {falha}
          </MensagemSecao>
        ) : null}
        <section aria-labelledby="titulo-pdf" className="flex flex-col gap-(--e-2)">
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
