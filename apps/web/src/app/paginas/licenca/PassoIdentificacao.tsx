import {
  DIAS_LIMITE_PROTOCOLO_LAO,
  datasRenovacaoLao,
  ehLao,
  formatarDataCivil,
  hojeNoFuso,
  type DataCivil,
} from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Botao } from '@/components/ui/botao'
import type { PedidoDePagina } from '@/components/pdf/VisualizadorPdf'
import { CampoData } from '@/components/ui/campo-data'
import { CampoTexto } from '@/components/ui/campo-texto'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { listarUnidades } from '@/lib/api/empreendimentos'
import { obterUltimaExtracao, type PropostaDeIdentificacao } from '@/lib/api/extracao'
import {
  criarTipo,
  listarOrgaos,
  listarTipos,
  salvarIdentificacao,
  type DadosIdentificacao,
  type Instrumento,
  type Marco,
} from '@/lib/api/licencas'
import { codigoDoErro, mensagemDoErro } from '@/lib/erros'
import { cn } from '@/lib/utils'

import { GuardaRascunho } from './GuardaCadastro'
import { BotaoIa, NaoEncontrado } from './MarcaIa'
import { MolduraCadastro, RodapeCadastro } from './MolduraCadastro'
import { PainelPdf } from './PainelPdf'
import { useSalvamento } from './usar-rascunho'

const NOVO_TIPO = '__novo'

type CampoDeData = 'emitidoEm' | 'assinadoEm' | 'publicadoEm' | 'recebidoEm'

const MARCOS: {
  chave: Marco
  rotulo: string
  campo: CampoDeData
  proposta: keyof PropostaDeIdentificacao
  /** Fatos já ocorridos não aceitam data futura (o banco também recusa). */
  semFuturo: boolean
}[] = [
  {
    chave: 'emissao',
    rotulo: 'Emissão',
    campo: 'emitidoEm',
    proposta: 'emitido_em',
    semFuturo: true,
  },
  {
    chave: 'assinatura',
    rotulo: 'Assinatura',
    campo: 'assinadoEm',
    proposta: 'assinado_em',
    semFuturo: true,
  },
  {
    chave: 'publicacao',
    rotulo: 'Publicação',
    campo: 'publicadoEm',
    proposta: 'publicado_em',
    semFuturo: true,
  },
  {
    chave: 'recebimento',
    rotulo: 'Recebimento',
    campo: 'recebidoEm',
    proposta: 'recebido_em',
    semFuturo: false,
  },
]

const classeSelect =
  'h-(--size-control) w-full rounded-(--radius) border border-(--border-input) bg-(--surface-input) px-(--space-100) corpo text-(--text) transicao-estado outline-none focus:border-(--border-focus) focus:shadow-[0_0_0_1px_var(--border-focus)] aria-invalid:border-(--border-danger)'

/** Rótulo de select com a marca da IA à direita, como no CampoTexto. */
function RotuloComMarca({
  htmlFor,
  children,
  marca,
}: {
  htmlFor: string
  children: ReactNode
  marca?: ReactNode
}) {
  return (
    <div className="flex min-h-5 items-center gap-(--space-100)">
      <label htmlFor={htmlFor} className="flex-1 rotulo">
        {children}
      </label>
      {marca}
    </div>
  )
}

function ErroDoCampo({ id, children }: { id: string; children: ReactNode }) {
  return (
    <span id={id} className="text-xs text-(--text-danger)">
      {children}
    </span>
  )
}

/** "a, b e c" */
function juntar(itens: readonly string[]): string {
  return itens.length <= 1
    ? (itens[0] ?? '')
    : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1] ?? ''}`
}

function inicial(instrumento: Instrumento): DadosIdentificacao {
  return {
    unidadeId: instrumento.unidadeId,
    tipoId: instrumento.tipoId,
    numero: instrumento.numero ?? '',
    orgao: instrumento.orgao ?? '',
    emitidoEm: instrumento.emitidoEm,
    assinadoEm: instrumento.assinadoEm,
    publicadoEm: instrumento.publicadoEm,
    recebidoEm: instrumento.recebidoEm,
    marco: instrumento.marco,
    validade: instrumento.validade,
  }
}

/** Valor de <input type="date"> (já é AAAA-MM-DD, sem fuso) ou nulo. */
function dataDe(valor: string): DataCivil | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? (valor as DataCivil) : null
}

/**
 * /licencas/:id/identificacao (Protótipo 11; LIC-01, IA-02). Rascunho salva incompleto. Campo
 * vindo da IA mostra a marca e a página da fonte; o que a IA não achou fica vazio e dito.
 */
export function PassoIdentificacao() {
  const { id = '' } = useParams()
  // Fora do formulário: o formulário remonta com a versão salva, o "salvo às" continua.
  const salvamento = useSalvamento(id)
  return (
    <GuardaRascunho id={id} passo="identificacao">
      {(instrumento) => (
        <Identificacao
          key={`${instrumento.id}:${String(instrumento.rowVersion)}`}
          instrumento={instrumento}
          salvamento={salvamento}
        />
      )}
    </GuardaRascunho>
  )
}

function Identificacao({
  instrumento,
  salvamento: { salvoEm, registrar },
}: {
  instrumento: Instrumento
  salvamento: ReturnType<typeof useSalvamento>
}) {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const hoje = hojeNoFuso(new Date(), atual.fuso)
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const [dados, setDados] = useState(() => inicial(instrumento))
  const [novoTipo, setNovoTipo] = useState({ sigla: '', nome: '' })
  const [criandoTipo, setCriandoTipo] = useState(false)

  const tipos = useQuery({ queryKey: ['tipos', cid], queryFn: () => listarTipos(cid) })
  const orgaos = useQuery({ queryKey: ['orgaos', cid], queryFn: () => listarOrgaos(cid) })
  const unidades = useQuery({
    queryKey: ['unidades', instrumento.empreendimentoId],
    queryFn: () => listarUnidades(instrumento.empreendimentoId),
  })

  const tipo = tipos.data?.find((t) => t.id === dados.tipoId)

  const extracao = useQuery({
    queryKey: ['extracao', instrumento.id],
    queryFn: () => obterUltimaExtracao(instrumento.id),
  })
  const proposta = extracao.data?.situacao === 'concluida' ? extracao.data.identificacao : null
  const [paginaPdf, setPaginaPdf] = useState<PedidoDePagina | null>(null)
  const verPagina = (numero: number, trechos?: PedidoDePagina['trechos']) => {
    setPaginaPdf((anterior) => ({ numero, vez: (anterior?.vez ?? 0) + 1, trechos }))
  }
  /**
   * O que procurar no PDF para destacar a fonte do campo: a data como está escrita, o valor lido
   * e, no tipo, o nome por extenso (o documento diz "Licença Ambiental de Operação", não "LAO").
   */
  function trechosDe(chave: keyof PropostaDeIdentificacao): PedidoDePagina['trechos'] {
    const campo = proposta?.[chave]
    if (!campo?.valor) return []
    if (chave === 'tipo') {
      const lido = tipos.data?.find((t) => t.sigla.toUpperCase() === campo.valor?.toUpperCase())
      return [lido?.nome, campo.valor]
    }
    const data = dataDe(campo.valor)
    return data ? [campo.texto, formatarDataCivil(data)] : [campo.valor]
  }
  /** Ícone da IA ao lado do rótulo quando o valor atual é o proposto. */
  function marca(chave: keyof PropostaDeIdentificacao, valor: string | null): ReactNode {
    const campo = proposta?.[chave]
    if (!campo?.valor) return undefined
    const igual =
      chave === 'tipo'
        ? tipo?.sigla.toUpperCase() === campo.valor.toUpperCase()
        : valor === campo.valor
    return igual ? (
      <BotaoIa
        pagina={campo.pagina}
        aoVerPagina={(pagina) => {
          verPagina(pagina, trechosDe(chave))
        }}
      />
    ) : undefined
  }
  /** Abaixo do campo, quando a IA procurou e não achou e o campo segue vazio. */
  function naoAchou(chave: keyof PropostaDeIdentificacao, valor: string | null): ReactNode {
    const campo = proposta?.[chave]
    return campo && !campo.valor && !valor ? <NaoEncontrado /> : undefined
  }
  const marcosPreenchidos = MARCOS.filter((m) => dados[m.campo])
  const faltaTipo = !dados.tipoId
  const faltaValidade = !dados.validade
  const faltaMarco = !dados.marco
  const completa = !faltaTipo && !faltaValidade && !faltaMarco
  // Continuar fica sempre ativo (Protótipo 11, artboard 3): o que falta aparece ao tentar.
  const [tentouContinuar, setTentouContinuar] = useState(false)
  const avisoRef = useRef<HTMLDivElement>(null)
  const mostrarFaltas = tentouContinuar && !completa

  function mudar<K extends keyof DadosIdentificacao>(campo: K, valor: DadosIdentificacao[K]) {
    setDados((anterior) => {
      const proximo = { ...anterior, [campo]: valor }
      // Marco sem a data correspondente deixa de valer (o banco também recusa).
      const marco = MARCOS.find((m) => m.chave === proximo.marco)
      if (marco && !proximo[marco.campo]) proximo.marco = null
      return proximo
    })
  }

  const salvar = useMutation({
    mutationFn: () => salvarIdentificacao(instrumento.id, instrumento.rowVersion, dados),
  })
  const adicionarTipo = useMutation({
    mutationFn: () => criarTipo(cid, novoTipo.sigla, novoTipo.nome),
    onSuccess: async (tipoId) => {
      await queryClient.invalidateQueries({ queryKey: ['tipos', cid] })
      mudar('tipoId', tipoId)
      setCriandoTipo(false)
      setNovoTipo({ sigla: '', nome: '' })
    },
  })

  async function gravar(depois?: string) {
    try {
      await salvar.mutateAsync()
      if (depois) await navegar(depois)
      await registrar()
    } catch {
      // a mensagem aparece pela mutation
    }
  }

  function continuar() {
    if (!completa) {
      setTentouContinuar(true)
      // O aviso fica no topo do formulário; o foco o traz para a vista e o leitor de tela o lê.
      requestAnimationFrame(() => {
        avisoRef.current?.focus()
      })
      return
    }
    void gravar(`/licencas/${instrumento.id}/condicionantes`)
  }

  const conflito = codigoDoErro(salvar.error) === 'conflito_de_versao'
  const dataLimite =
    dados.validade && ehLao(tipo?.sigla) ? datasRenovacaoLao(dados.validade).limiteProtocolo : null
  const limite = dataLimite
    ? `${formatarDataCivil(dataLimite)} · ${String(DIAS_LIMITE_PROTOCOLO_LAO)} dias antes da validade`
    : null

  return (
    <MolduraCadastro
      passo="identificacao"
      instrumentoId={instrumento.id}
      identificacao={tipo && dados.numero ? `${tipo.sigla} ${dados.numero}` : null}
      contexto={`${instrumento.empreendimentoNome} · ${instrumento.unidadeNome}`}
      sairPara={`/empreendimentos/${instrumento.empreendimentoId}`}
      salvoEm={salvoEm}
      larga
      rodape={
        <RodapeCadastro
          aoSalvar={() => void gravar()}
          salvando={salvar.isPending}
          aviso={
            proposta
              ? 'Confira os campos com o ícone da IA. Dá para salvar o rascunho incompleto.'
              : 'Dá para salvar o rascunho incompleto.'
          }
          voltarPara={`/licencas/${instrumento.id}/documento`}
          aoContinuar={continuar}
          podeContinuar
          continuando={salvar.isPending}
        />
      }
    >
      <div className="grid h-full min-h-0 lg:grid-cols-[minmax(0,9fr)_minmax(0,11fr)]">
        <form
          noValidate
          aria-label="Identificação da licença"
          onSubmit={(evento) => {
            evento.preventDefault()
          }}
          className="flex min-h-0 flex-col gap-(--space-300) overflow-auto bg-(--surface) p-(--space-200) md:p-(--space-300)"
        >
          {mostrarFaltas ? (
            <div ref={avisoRef} tabIndex={-1} className="outline-none">
              <MensagemSecao role="alert" tom="perigo">
                Para continuar, confirme{' '}
                {juntar(
                  [
                    faltaTipo && 'o tipo de instrumento',
                    faltaValidade && 'a validade',
                    faltaMarco && 'o marco dos prazos',
                  ].filter((x): x is string => Boolean(x)),
                )}
                .
              </MensagemSecao>
            </div>
          ) : null}
          {salvar.isError ? (
            <MensagemSecao
              role="alert"
              tom="perigo"
              acoes={
                conflito ? (
                  <Botao
                    onClick={() =>
                      void queryClient.invalidateQueries({
                        queryKey: ['instrumento', instrumento.id],
                      })
                    }
                  >
                    Recarregar
                  </Botao>
                ) : undefined
              }
            >
              {mensagemDoErro(salvar.error)}
            </MensagemSecao>
          ) : null}

          <fieldset className="grid gap-(--space-150) sm:grid-cols-2">
            <legend className="mb-(--space-100) titulo-secao">Licença</legend>
            <div className="flex flex-col gap-(--space-050)">
              <RotuloComMarca htmlFor="tipo-instrumento" marca={marca('tipo', dados.tipoId)}>
                Tipo de instrumento *
              </RotuloComMarca>
              <select
                id="tipo-instrumento"
                className={classeSelect}
                aria-invalid={mostrarFaltas && faltaTipo ? true : undefined}
                aria-describedby={mostrarFaltas && faltaTipo ? 'erro-tipo' : undefined}
                value={criandoTipo ? NOVO_TIPO : (dados.tipoId ?? '')}
                onChange={(evento) => {
                  if (evento.target.value === NOVO_TIPO) {
                    setCriandoTipo(true)
                    return
                  }
                  setCriandoTipo(false)
                  mudar('tipoId', evento.target.value || null)
                }}
              >
                <option value="">Selecione o tipo</option>
                {(tipos.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.sigla} — {t.nome}
                  </option>
                ))}
                <option value={NOVO_TIPO}>Outro tipo…</option>
              </select>
              {mostrarFaltas && faltaTipo ? (
                <ErroDoCampo id="erro-tipo">Escolha o tipo de instrumento</ErroDoCampo>
              ) : (
                naoAchou('tipo', dados.tipoId)
              )}
            </div>
            <CampoTexto
              rotulo="Número"
              placeholder="0000/0000"
              acessorio={marca('numero', dados.numero || null)}
              ajuda={naoAchou('numero', dados.numero || null)}
              value={dados.numero}
              onChange={(evento) => {
                mudar('numero', evento.target.value)
              }}
            />
            {criandoTipo ? (
              <div className="flex flex-col gap-(--space-100) rounded-(--radius) border p-(--space-150) sm:col-span-2">
                <div className="grid gap-(--space-150) sm:grid-cols-[120px_1fr]">
                  <CampoTexto
                    rotulo="Sigla"
                    value={novoTipo.sigla}
                    onChange={(evento) => {
                      setNovoTipo((t) => ({ ...t, sigla: evento.target.value }))
                    }}
                  />
                  <CampoTexto
                    rotulo="Nome do tipo"
                    value={novoTipo.nome}
                    onChange={(evento) => {
                      setNovoTipo((t) => ({ ...t, nome: evento.target.value }))
                    }}
                  />
                </div>
                {adicionarTipo.isError ? (
                  <MensagemSecao role="alert" tom="perigo">
                    {mensagemDoErro(adicionarTipo.error)}
                  </MensagemSecao>
                ) : null}
                <div className="flex justify-end gap-(--space-100)">
                  <Botao
                    tamanho="compacto"
                    onClick={() => {
                      setCriandoTipo(false)
                    }}
                  >
                    Cancelar
                  </Botao>
                  <Botao
                    tamanho="compacto"
                    aparencia="primario"
                    disabled={!novoTipo.sigla.trim() || adicionarTipo.isPending}
                    onClick={() => {
                      adicionarTipo.mutate()
                    }}
                  >
                    Adicionar tipo
                  </Botao>
                </div>
              </div>
            ) : null}
            <CampoTexto
              rotulo="Órgão licenciador"
              list="orgaos-usados"
              placeholder="IMA, SAMA Joinville…"
              acessorio={marca('orgao', dados.orgao || null)}
              ajuda={naoAchou('orgao', dados.orgao || null)}
              value={dados.orgao}
              onChange={(evento) => {
                mudar('orgao', evento.target.value)
              }}
            />
            <datalist id="orgaos-usados">
              {(orgaos.data ?? []).map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
            <div className="flex flex-col gap-(--space-050)">
              <RotuloComMarca htmlFor="unidade">Unidade</RotuloComMarca>
              <select
                id="unidade"
                className={classeSelect}
                value={dados.unidadeId}
                onChange={(evento) => {
                  mudar('unidadeId', evento.target.value)
                }}
              >
                {(
                  unidades.data ?? [{ id: instrumento.unidadeId, nome: instrumento.unidadeNome }]
                ).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-(--space-150)">
            <legend className="mb-(--space-100) titulo-secao">Dados do documento</legend>
            <div className="grid gap-(--space-150) sm:grid-cols-2">
              {MARCOS.map((m) => (
                <CampoData
                  key={m.chave}
                  rotulo={m.rotulo}
                  hoje={hoje}
                  maximo={m.semFuturo ? hoje : undefined}
                  motivoDoLimite={
                    m.semFuturo
                      ? `Datas futuras ficam bloqueadas para ${m.rotulo.toLowerCase()}`
                      : undefined
                  }
                  acessorio={marca(m.proposta, dados[m.campo])}
                  ajuda={naoAchou(m.proposta, dados[m.campo])}
                  valor={dados[m.campo]}
                  aoMudar={(data) => {
                    mudar(m.campo, data)
                  }}
                />
              ))}
            </div>
            <fieldset
              aria-describedby={mostrarFaltas && faltaMarco ? 'erro-marco' : undefined}
              className={cn(
                'flex flex-col gap-(--space-100) rounded-(--radius) border px-(--space-200) pt-(--space-100) pb-(--space-150)',
                mostrarFaltas && faltaMarco && 'border-(--border-danger)',
              )}
            >
              <legend className="px-(--space-050) rotulo">Marco usado para os prazos *</legend>
              {marcosPreenchidos.length === 0 ? (
                <p className="text-xs text-(--text-subtle)">
                  Preencha ao menos uma data para escolher.
                </p>
              ) : (
                <div className="flex flex-wrap gap-x-(--space-300) gap-y-(--space-100)">
                  {marcosPreenchidos.map((m) => (
                    <label
                      key={m.chave}
                      className="group inline-flex cursor-pointer items-center gap-(--space-100) corpo text-(--text)"
                    >
                      <input
                        type="radio"
                        name="marco"
                        checked={dados.marco === m.chave}
                        onChange={() => {
                          mudar('marco', m.chave)
                        }}
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className="inline-flex size-4 shrink-0 items-center justify-center rounded-(--radius-circle) border border-(--border-input) bg-(--surface-input) transicao-estado group-hover:border-(--border-strong) group-hover:bg-(--surface-hover) peer-checked:border-(--brand) peer-checked:bg-(--brand) peer-focus-visible:shadow-[0_0_0_2px_var(--border-focus)] after:size-1.5 after:rounded-(--radius-circle) after:bg-(--text-inverse) after:opacity-0 peer-checked:after:opacity-100"
                      />
                      {m.rotulo} · {formatarDataCivil(dados[m.campo])}
                    </label>
                  ))}
                </div>
              )}
              {mostrarFaltas && faltaMarco ? (
                <ErroDoCampo id="erro-marco">Escolha o marco dos prazos</ErroDoCampo>
              ) : null}
            </fieldset>
          </fieldset>

          <fieldset className="grid gap-(--space-150) sm:grid-cols-2">
            <legend className="mb-(--space-100) titulo-secao">Validade</legend>
            <CampoData
              rotulo="Validade confirmada *"
              hoje={hoje}
              acessorio={marca('validade', dados.validade)}
              ajuda={naoAchou('validade', dados.validade)}
              erro={mostrarFaltas && faltaValidade ? 'Confirme a validade' : undefined}
              nota={
                dataLimite ? `Limite de protocolo: ${formatarDataCivil(dataLimite)}` : undefined
              }
              valor={dados.validade}
              aoMudar={(data) => {
                mudar('validade', data)
              }}
            />
            <div className="flex flex-col gap-(--space-050) sm:pt-(--space-300)">
              <span className="rotulo">Limite de protocolo</span>
              <span className="corpo">
                {limite ??
                  (!dados.validade
                    ? 'Depende da validade'
                    : tipo
                      ? 'Sem regra de renovação para este tipo'
                      : 'Depende do tipo')}
              </span>
            </div>
          </fieldset>
        </form>
        <PainelPdf
          instrumento={instrumento}
          paginaPedida={paginaPdf}
          className="hidden min-h-[480px] lg:flex"
        />
      </div>
    </MolduraCadastro>
  )
}
