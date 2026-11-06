import {
  listarPendencias,
  MENSAGEM_DO_ERRO_DE_DATA,
  validarDataFutura,
  type DataCivil,
} from '@gestao-ambiental/domain'
import { useMutation } from '@tanstack/react-query'
import { useRef, useState, type ReactNode } from 'react'

import { AreaTexto } from '@/components/ui/area-texto'
import { Botao } from '@/components/ui/botao'
import { CampoData } from '@/components/ui/campo-data'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Icone, type NomeIcone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { conferirPdf } from '@/lib/api/licencas'
import {
  definirMetaInterna,
  registrarProrrogacao,
  solicitarEncerramento,
  type Evidencia,
  type Ocorrencia,
} from '@/lib/api/ocorrencias'
import { mensagemDoErro } from '@/lib/erros'
import { cn } from '@/lib/utils'

import { envioParaRetomar, janelaDaOcorrencia } from './apoio'
import { FormularioDeEnvio } from './FormularioDeEnvio'
import { ListaAnexos } from './ListaAnexos'
import { RodapeDeAcao, TextoPendencia } from './RodapeDeAcao'

export type OpcaoDeRegularizacao = 'feito' | 'prorrogado' | 'nao_se_aplica' | 'agora'

const OPCOES: readonly {
  valor: OpcaoDeRegularizacao
  titulo: string
  descricao: string
  icone: NomeIcone
}[] = [
  {
    valor: 'feito',
    titulo: 'Já foi feito',
    descricao: 'Enviar evidência com a data de execução',
    icone: 'circle-check',
  },
  {
    valor: 'prorrogado',
    titulo: 'Prazo prorrogado',
    descricao: 'Registrar ofício e novo prazo',
    icone: 'file-text',
  },
  {
    valor: 'nao_se_aplica',
    titulo: 'Não se aplica',
    descricao: 'Solicitar encerramento à Gestão',
    icone: 'x',
  },
  { valor: 'agora', titulo: 'Fazer agora', descricao: 'Definir nova meta', icone: 'clock' },
]

const SUCESSO: Record<OpcaoDeRegularizacao, { titulo: string; texto: string }> = {
  feito: { titulo: 'Enviado para conferência', texto: 'Aguardando a Gestão.' },
  prorrogado: { titulo: 'Prorrogação registrada', texto: 'Prazo oficial atualizado.' },
  nao_se_aplica: { titulo: 'Encerramento solicitado', texto: 'Aguardando decisão da Gestão.' },
  agora: { titulo: 'Meta salva', texto: 'Meta interna atualizada.' },
}

/** Mensagem de sucesso depois de regularizar (fundo de sucesso, título e texto). */
export function AvisoDeRegularizacao({ opcao }: { opcao: OpcaoDeRegularizacao }) {
  const { titulo, texto } = SUCESSO[opcao]
  return (
    <MensagemSecao role="status" tom="sucesso" titulo={titulo}>
      {texto}
    </MensagemSecao>
  )
}

interface Props {
  ocorrencia: Ocorrencia
  ultima: Evidencia | undefined
  urls: ReadonlyMap<string, string>
  /** Última regularização confirmada nesta visita (a página guarda, para sobreviver à troca de seção). */
  sucesso: OpcaoDeRegularizacao | null
  aoConcluir: (opcao: OpcaoDeRegularizacao) => Promise<void>
}

/**
 * Regularizar (Tela 16 v2, seção 8): substitui a Evidência quando o prazo oficial já passou. Quatro
 * situações; cada uma grava pela sua RPC e gera evento na Atividade. Quem executa não encerra: "Não
 * se aplica" vira pedido para a Gestão.
 */
export function SecaoRegularizar({ ocorrencia, ultima, urls, sucesso, aoConcluir }: Props) {
  const pedidoPendente = ocorrencia.encerramentoSolicitadoEm !== null
  const [opcao, setOpcao] = useState<OpcaoDeRegularizacao | null>(
    sucesso || pedidoPendente ? null : 'feito',
  )
  const aviso: OpcaoDeRegularizacao | null =
    opcao !== null ? null : (sucesso ?? (pedidoPendente ? 'nao_se_aplica' : null))

  async function concluir(escolhida: OpcaoDeRegularizacao) {
    setOpcao(null)
    await aoConcluir(escolhida)
  }

  return (
    <section aria-labelledby="titulo-regularizar" className="flex flex-col gap-(--space-150)">
      <div className="flex items-center gap-(--space-100)">
        <Icone nome="triangle-alert" className="text-(--text-danger)" />
        <h2 id="titulo-regularizar" className="flex-1 titulo-secao">
          Regularizar
        </h2>
        <span className="text-xs text-(--text-subtle)" id="regularizar-instrucao">
          Selecione a situação
        </span>
      </div>

      <div
        role="radiogroup"
        aria-labelledby="titulo-regularizar"
        aria-describedby="regularizar-instrucao"
        className="grid grid-cols-2 gap-(--space-100) max-md:grid-cols-1"
      >
        {OPCOES.map((item) => {
          const marcada = opcao === item.valor
          return (
            <label
              key={item.valor}
              className={cn(
                'flex cursor-pointer items-start gap-(--space-100) rounded-(--radius) border p-(--space-150) text-(--text) transicao-estado',
                'has-[:focus-visible]:shadow-(--focus-ring)',
                marcada
                  ? 'border-(--border-focus) bg-(--surface-selected) shadow-[inset_0_0_0_1px_var(--border-focus)]'
                  : 'border-(--border) bg-(--surface) hover:border-(--border-strong)',
              )}
            >
              <input
                type="radio"
                name={`regularizar-${ocorrencia.id}`}
                value={item.valor}
                checked={marcada}
                onChange={() => {
                  setOpcao(item.valor)
                }}
                className="sr-only"
              />
              <Icone
                nome={item.icone}
                className={cn('mt-0.5', marcada ? 'text-(--text-link)' : 'text-(--icon)')}
              />
              <span className="flex flex-col gap-(--space-025)">
                <span className="corpo font-medium">{item.titulo}</span>
                <span className="text-xs text-(--text-subtle)">{item.descricao}</span>
              </span>
            </label>
          )
        })}
      </div>

      {opcao === 'feito' ? (
        <div className="mt-(--space-050)">
          <FormularioDeEnvio
            ocorrencia={ocorrencia}
            janela={janelaDaOcorrencia(ocorrencia)}
            anterior={envioParaRetomar(ultima)}
            rotuloBotao="Enviar para conferência"
            urls={urls}
            aoEnviar={() => concluir('feito')}
          />
        </div>
      ) : null}
      {opcao === 'prorrogado' ? (
        <FormularioProrrogacao ocorrencia={ocorrencia} aoRegistrar={() => concluir('prorrogado')} />
      ) : null}
      {opcao === 'nao_se_aplica' ? (
        <FormularioEncerramento
          ocorrencia={ocorrencia}
          aoSolicitar={() => concluir('nao_se_aplica')}
        />
      ) : null}
      {opcao === 'agora' ? (
        <FormularioMeta ocorrencia={ocorrencia} aoSalvar={() => concluir('agora')} />
      ) : null}
      {aviso ? <AvisoDeRegularizacao opcao={aviso} /> : null}
    </section>
  )
}

function Formulario({
  children,
  erro,
  pendencias,
  tentou,
  botao,
}: {
  children: ReactNode
  erro: unknown
  pendencias: readonly string[]
  tentou: boolean
  botao: ReactNode
}) {
  return (
    <div className="mt-(--space-050) flex flex-col gap-(--space-200)">
      {children}
      {erro ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(erro)}
        </MensagemSecao>
      ) : null}
      <RodapeDeAcao
        pendencia={<TextoPendencia pendencias={pendencias} tentou={tentou} pronto="Pronto" />}
        botao={botao}
      />
    </div>
  )
}

/** Campo de data futura (novo prazo oficial, nova meta) com validação do domínio. */
function useDataFutura(hoje: DataCivil, tentou: boolean) {
  const [texto, setTexto] = useState('')
  const [data, setData] = useState<DataCivil | null>(null)
  const [saiu, setSaiu] = useState(false)
  const validacao = validarDataFutura(texto, hoje, tentou || saiu)
  const valida = validarDataFutura(texto, hoje, true).data
  return {
    valida,
    props: {
      valor: data,
      aoMudar: setData,
      hoje,
      erro: validacao.erro ? MENSAGEM_DO_ERRO_DE_DATA[validacao.erro] : undefined,
      validacaoExterna: {
        aoMudarTexto: setTexto,
        aoSair: () => {
          setSaiu(true)
        },
      },
    },
  }
}

function FormularioProrrogacao({
  ocorrencia,
  aoRegistrar,
}: {
  ocorrencia: Ocorrencia
  aoRegistrar: () => Promise<void>
}) {
  const [id] = useState(() => crypto.randomUUID())
  const [numero, setNumero] = useState('')
  const [tentou, setTentou] = useState(false)
  const [oficio, setOficio] = useState<{ versaoId: string; arquivo: File } | null>(null)
  const [problema, setProblema] = useState<string | null>(null)
  const novoPrazo = useDataFutura(ocorrencia.hoje, tentou)
  const entrada = useRef<HTMLInputElement>(null)
  const botaoAnexar = useRef<HTMLButtonElement>(null)

  const pendencias = listarPendencias([
    { rotulo: 'ofício', ok: numero.trim() !== '' },
    { rotulo: 'novo prazo', ok: novoPrazo.valida !== null },
    { rotulo: 'PDF', ok: oficio !== null },
  ])

  const registrar = useMutation({
    mutationFn: () => {
      if (!novoPrazo.valida || !oficio) throw new Error('novo_prazo_obrigatorio')
      return registrarProrrogacao(ocorrencia, {
        id,
        numeroOficio: numero.trim(),
        novoPrazo: novoPrazo.valida,
        oficio,
      })
    },
    onSuccess: aoRegistrar,
  })

  async function escolher(arquivo: File | undefined) {
    setProblema(null)
    if (!arquivo) return
    const erro = await conferirPdf(arquivo)
    if (erro) {
      setProblema(
        erro === 'nao_pdf'
          ? `${arquivo.name}: Este arquivo não é um PDF.`
          : erro === 'vazio'
            ? `${arquivo.name}: O arquivo está vazio.`
            : `${arquivo.name}: O arquivo passa de 25 MB.`,
      )
      return
    }
    setOficio({ versaoId: crypto.randomUUID(), arquivo })
  }

  return (
    <Formulario
      erro={registrar.error}
      pendencias={pendencias}
      tentou={tentou}
      botao={
        <Botao
          aparencia="primario"
          aria-busy={registrar.isPending || undefined}
          onClick={() => {
            setTentou(true)
            if (registrar.isPending) return
            if (pendencias.length === 0) registrar.mutate()
            else if (!numero.trim()) document.getElementById(`oficio-${ocorrencia.id}`)?.focus()
            else if (!novoPrazo.valida)
              document.getElementById(`novo-prazo-${ocorrencia.id}`)?.focus()
            else botaoAnexar.current?.focus()
          }}
        >
          {registrar.isPending ? 'Registrando…' : 'Registrar prorrogação'}
        </Botao>
      }
    >
      <div className="flex flex-wrap items-start gap-(--space-150)">
        <CampoTexto
          id={`oficio-${ocorrencia.id}`}
          rotulo="Número do ofício *"
          placeholder="Ex.: 1123/2026"
          value={numero}
          maxLength={80}
          erro={tentou && !numero.trim() ? 'Obrigatório' : undefined}
          onChange={(evento) => {
            setNumero(evento.target.value)
          }}
          className="w-[220px] max-md:w-full"
        />
        <CampoData
          id={`novo-prazo-${ocorrencia.id}`}
          rotulo="Novo prazo oficial *"
          {...novoPrazo.props}
          className="w-[220px] max-md:w-full"
        />
      </div>
      <fieldset className="flex flex-col gap-(--space-100)">
        <legend className="mb-(--space-100) rotulo">Ofício (PDF) *</legend>
        {oficio ? (
          <ListaAnexos
            rotulo="Ofício"
            itens={[
              {
                chave: oficio.versaoId,
                nome: oficio.arquivo.name,
                tamanho: oficio.arquivo.size,
                miniaturaUrl: null,
                caminho: null,
              },
            ]}
            aoRemover={() => {
              setOficio(null)
              setTimeout(() => botaoAnexar.current?.focus(), 0)
            }}
          />
        ) : (
          <div>
            <Botao
              ref={botaoAnexar}
              aparencia="sutil"
              iconeAntes="paperclip"
              className="-ml-(--space-100)"
              onClick={() => entrada.current?.click()}
            >
              Anexar arquivo
            </Botao>
          </div>
        )}
        <input
          ref={entrada}
          type="file"
          accept=".pdf,application/pdf"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(evento) => {
            const escolhido = evento.target.files?.[0]
            evento.target.value = ''
            void escolher(escolhido)
          }}
        />
        {tentou && !oficio ? <p className="text-xs text-(--text-danger)">Obrigatório</p> : null}
        {problema ? (
          <p role="alert" className="text-xs text-(--text-danger)">
            {problema}
          </p>
        ) : null}
      </fieldset>
    </Formulario>
  )
}

function FormularioEncerramento({
  ocorrencia,
  aoSolicitar,
}: {
  ocorrencia: Ocorrencia
  aoSolicitar: () => Promise<void>
}) {
  const [id] = useState(() => crypto.randomUUID())
  const [justificativa, setJustificativa] = useState('')
  const [tentou, setTentou] = useState(false)
  const pendencias = listarPendencias([
    { rotulo: 'justificativa', ok: justificativa.trim() !== '' },
  ])
  const solicitar = useMutation({
    mutationFn: () => solicitarEncerramento(id, ocorrencia.id, justificativa.trim()),
    onSuccess: aoSolicitar,
  })

  return (
    <Formulario
      erro={solicitar.error}
      pendencias={pendencias}
      tentou={tentou}
      botao={
        <Botao
          aparencia="primario"
          iconeAntes="send"
          aria-busy={solicitar.isPending || undefined}
          onClick={() => {
            setTentou(true)
            if (solicitar.isPending) return
            if (pendencias.length === 0) solicitar.mutate()
            else document.getElementById(`justificativa-${ocorrencia.id}`)?.focus()
          }}
        >
          {solicitar.isPending ? 'Solicitando…' : 'Solicitar encerramento'}
        </Botao>
      }
    >
      <AreaTexto
        id={`justificativa-${ocorrencia.id}`}
        rotulo="Justificativa *"
        placeholder="Ex.: CSAOs desativadas em 2021"
        value={justificativa}
        maxLength={2000}
        erro={tentou && !justificativa.trim() ? 'Obrigatório' : undefined}
        onChange={(evento) => {
          setJustificativa(evento.target.value)
        }}
      />
    </Formulario>
  )
}

function FormularioMeta({
  ocorrencia,
  aoSalvar,
}: {
  ocorrencia: Ocorrencia
  aoSalvar: () => Promise<void>
}) {
  const [tentou, setTentou] = useState(false)
  const meta = useDataFutura(ocorrencia.hoje, tentou)
  const pendencias = listarPendencias([{ rotulo: 'data', ok: meta.valida !== null }])
  const salvar = useMutation({
    mutationFn: () => {
      if (!meta.valida) throw new Error('meta_obrigatoria')
      return definirMetaInterna(ocorrencia.id, meta.valida)
    },
    onSuccess: aoSalvar,
  })

  return (
    <Formulario
      erro={salvar.error}
      pendencias={pendencias}
      tentou={tentou}
      botao={
        <Botao
          aparencia="primario"
          aria-busy={salvar.isPending || undefined}
          onClick={() => {
            setTentou(true)
            if (salvar.isPending) return
            if (pendencias.length === 0) salvar.mutate()
            else document.getElementById(`meta-${ocorrencia.id}`)?.focus()
          }}
        >
          {salvar.isPending ? 'Salvando…' : 'Salvar meta'}
        </Botao>
      }
    >
      <CampoData
        id={`meta-${ocorrencia.id}`}
        rotulo="Nova meta interna *"
        {...meta.props}
        className="w-[220px] max-md:w-full"
      />
    </Formulario>
  )
}
