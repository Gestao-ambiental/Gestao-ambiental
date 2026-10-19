import {
  ErroDePrazo,
  RECORRENCIAS,
  datasDoPrazo,
  descreverRecorrencia,
  formatarDataCivil,
  nomeDoDiaDaSemana,
  recorrenciaSugerida,
  sugerirPrimeiraData,
  type DataCivil,
  type Prazo,
  type Recorrencia,
  type UnidadeCiclo,
} from '@gestao-ambiental/domain'
import { useMutation } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Carregando, EstadoErro, EstadoVazio } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { CampoTexto } from '@/components/ui/campo-texto'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import {
  confirmarPrazo,
  type Condicionante,
  type DadosPrazo,
  type Instrumento,
} from '@/lib/api/licencas'
import { formatarInstanteComoData } from '@/lib/datas'
import { mensagemDoErro } from '@/lib/erros'
import { cn } from '@/lib/utils'

import { GuardaRascunho } from './GuardaCadastro'
import { MolduraCadastro, RodapeCadastro } from './MolduraCadastro'
import { useCondicionantes, useSalvamento } from './usar-rascunho'

const NOMES_MARCO = {
  emissao: 'Emissão',
  assinatura: 'Assinatura',
  publicacao: 'Publicação',
  recebimento: 'Recebimento',
} as const

const classeCabecalho =
  'h-10 border-b px-(--space-100) text-left rotulo whitespace-nowrap first:pl-(--space-150)'
const classeCelula = 'h-10 border-b px-(--space-100) align-middle first:pl-(--space-150)'

function dataDoMarco(instrumento: Instrumento): DataCivil | null {
  switch (instrumento.marco) {
    case 'emissao':
      return instrumento.emitidoEm
    case 'assinatura':
      return instrumento.assinadoEm
    case 'publicacao':
      return instrumento.publicadoEm
    case 'recebimento':
      return instrumento.recebidoEm
    default:
      return null
  }
}

function nomeDaRecorrencia(recorrencia: Recorrencia): string {
  return recorrencia === 'personalizada' ? 'Personalizada' : descreverRecorrencia({ recorrencia })
}

/**
 * Prazo pronto para confirmar com um clique: a recorrência já escolhida ou a sugerida pela leitura
 * da IA, a primeira data escolhida ou a sugerida pelo marco, e a fonte (o texto literal, se não
 * houver outra). Sem recorrência clara, sem primeira data ou com série inválida: nada (vai ao painel).
 */
function prazoProposto(
  item: Condicionante,
  instrumento: Instrumento,
): { dados: DadosPrazo; sugerido: boolean } | null {
  const base = item.recorrencia
    ? { recorrencia: item.recorrencia, unidade: item.unidade, intervalo: item.intervalo }
    : recorrenciaSugerida(item.periodicidadeIa)
  if (!base) return null
  const referencia = item.dataReferencia ?? dataDoMarco(instrumento)
  const continua = base.recorrencia === 'continua'
  const primeira = continua
    ? null
    : (item.primeiraData ??
      sugerirPrimeiraData(base, referencia, instrumento.validade, instrumento.tipoSigla))
  if (!continua && !primeira) return null
  if (!continua) {
    try {
      datasDoPrazo({ ...base, primeiraData: primeira }, instrumento.validade)
    } catch {
      return null
    }
  }
  const fonte = item.fonteRegra ?? item.textoLiteral
  if (!fonte.trim()) return null
  return {
    sugerido: !item.recorrencia || !item.primeiraData,
    dados: {
      recorrencia: base.recorrencia,
      unidade: base.recorrencia === 'personalizada' ? (base.unidade ?? null) : null,
      intervalo: base.recorrencia === 'personalizada' ? (base.intervalo ?? null) : null,
      dataReferencia: referencia,
      primeiraData: primeira,
      fonteRegra: fonte,
    },
  }
}

function dataDe(valor: string): DataCivil | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? (valor as DataCivil) : null
}

/** Painel do prazo de uma obrigação (prazo verificável, LIC-03). */
function PainelPrazo({
  instrumento,
  item,
  fuso,
  aoFechar,
  aoConfirmar,
}: {
  instrumento: Instrumento
  item: Condicionante
  fuso: string
  aoFechar: () => void
  aoConfirmar: () => Promise<void>
}) {
  const fonteId = useId()
  const marco = dataDoMarco(instrumento)
  const sugerida = item.recorrencia ? null : recorrenciaSugerida(item.periodicidadeIa)
  const [recorrencia, setRecorrencia] = useState<Recorrencia | null>(
    item.recorrencia ?? sugerida?.recorrencia ?? null,
  )
  const [unidade, setUnidade] = useState<UnidadeCiclo>(item.unidade ?? sugerida?.unidade ?? 'mes')
  const [intervalo, setIntervalo] = useState(
    item.intervalo ? String(item.intervalo) : sugerida?.intervalo ? String(sugerida.intervalo) : '',
  )
  const [referencia, setReferencia] = useState<DataCivil | null>(item.dataReferencia ?? marco)
  const [primeira, setPrimeira] = useState<DataCivil | null>(item.primeiraData)
  const [primeiraTocada, setPrimeiraTocada] = useState(Boolean(item.primeiraData))
  const [fonte, setFonte] = useState(item.fonteRegra ?? item.textoLiteral)

  const prazo: Prazo | null = recorrencia
    ? {
        recorrencia,
        unidade: recorrencia === 'personalizada' ? unidade : null,
        intervalo: recorrencia === 'personalizada' ? Number(intervalo) || null : null,
        primeiraData: primeira,
      }
    : null
  const sugestao = prazo
    ? sugerirPrimeiraData(prazo, referencia, instrumento.validade, instrumento.tipoSigla)
    : null
  // Enquanto a pessoa não mexe na primeira data, ela acompanha a sugestão.
  const primeiraEfetiva = primeiraTocada ? primeira : (sugestao ?? primeira)
  const prazoEfetivo = prazo ? { ...prazo, primeiraData: primeiraEfetiva } : null

  let simulacao: { ciclo: number; prazo: DataCivil }[] = []
  let problema: string | null = null
  if (prazoEfetivo && recorrencia !== 'continua') {
    try {
      simulacao = datasDoPrazo(prazoEfetivo, instrumento.validade)
    } catch (erro) {
      problema = erro instanceof ErroDePrazo ? mensagemDoErro({ message: erro.codigo }) : null
    }
  }

  const confirmar = useMutation({
    mutationFn: () => {
      if (!prazoEfetivo) throw new Error('sem recorrência')
      return confirmarPrazo(item.id, {
        recorrencia: prazoEfetivo.recorrencia,
        unidade: prazoEfetivo.unidade ?? null,
        intervalo: prazoEfetivo.intervalo ?? null,
        dataReferencia: referencia,
        primeiraData: recorrencia === 'continua' ? null : primeiraEfetiva,
        fonteRegra: fonte,
      })
    },
    onSuccess: aoConfirmar,
  })

  const semFonte = !fonte.trim()
  const podeConfirmar = Boolean(recorrencia) && !problema && !semFonte && !confirmar.isPending
  const confirmado = Boolean(item.confirmadoEm)

  return (
    <section
      aria-label={`Prazo de ${item.codigo || item.titulo}`}
      className="flex min-h-0 flex-col border-l bg-(--surface)"
    >
      <div className="flex items-start gap-(--space-100) border-b p-(--space-200)">
        <div className="flex min-w-0 flex-1 flex-col gap-(--space-050)">
          <h2 className="titulo-secao">
            Prazo de {[item.codigo, item.titulo].filter(Boolean).join(' · ')}
          </h2>
          <span>
            {confirmado ? (
              <Selo tom="sucesso">Confirmado</Selo>
            ) : (
              <Selo tom="atencao">Pendente de revisão</Selo>
            )}
          </span>
        </div>
        <BotaoIcone icone="x" rotulo="Fechar painel do prazo" onClick={aoFechar} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-(--space-200) overflow-auto p-(--space-200)">
        {confirmar.isError ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErro(confirmar.error)}
          </MensagemSecao>
        ) : null}
        <label htmlFor={fonteId} className="flex flex-col gap-(--space-050)">
          <span className="rotulo">Fonte ou regra *</span>
          <textarea
            id={fonteId}
            rows={3}
            value={fonte}
            aria-invalid={semFonte || undefined}
            onChange={(evento) => {
              setFonte(evento.target.value)
            }}
            className="w-full rounded-(--radius) border border-(--border-input) bg-(--surface-input) px-(--space-100) py-(--space-100) corpo outline-none focus:border-(--border-focus)"
          />
          <span className="text-xs text-(--text-subtle)">
            Trecho do documento ou norma que define o prazo. Sem base no documento, o prazo fica
            pendente: nada é inventado.
          </span>
        </label>

        <fieldset className="flex flex-col gap-(--space-100)">
          <legend className="mb-(--space-050) rotulo">Recorrência</legend>
          <div className="flex flex-wrap gap-(--space-050)">
            {RECORRENCIAS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={recorrencia === r}
                onClick={() => {
                  setRecorrencia(r)
                }}
                className={cn(
                  'h-(--size-control) cursor-pointer rounded-(--radius) border px-(--space-100) corpo transicao-estado',
                  recorrencia === r
                    ? 'border-(--border-focus) bg-(--surface-selected) text-(--text-link)'
                    : 'hover:bg-(--surface-hover)',
                )}
              >
                {nomeDaRecorrencia(r)}
              </button>
            ))}
          </div>
          {recorrencia === 'personalizada' ? (
            <div className="grid grid-cols-[1fr_120px] gap-(--space-150) rounded-(--radius) border p-(--space-150)">
              <label className="flex flex-col gap-(--space-050)">
                <span className="rotulo">Unidade</span>
                <select
                  value={unidade}
                  onChange={(evento) => {
                    setUnidade(evento.target.value as UnidadeCiclo)
                  }}
                  className="h-(--size-control) rounded-(--radius) border border-(--border-input) bg-(--surface-input) px-(--space-100) corpo"
                >
                  <option value="mes">Mês</option>
                  <option value="dia">Dia</option>
                </select>
              </label>
              <CampoTexto
                rotulo="A cada"
                inputMode="numeric"
                value={intervalo}
                onChange={(evento) => {
                  setIntervalo(evento.target.value.replace(/\D/g, ''))
                }}
              />
            </div>
          ) : null}
        </fieldset>

        {recorrencia && recorrencia !== 'continua' ? (
          <>
            <div className="grid gap-(--space-150) sm:grid-cols-2">
              <div className="flex flex-col gap-(--space-050)">
                <span className="rotulo">Marco de cálculo</span>
                <span className="corpo">
                  {instrumento.marco && marco
                    ? `${NOMES_MARCO[instrumento.marco]} · ${formatarDataCivil(marco)}`
                    : 'Não definido'}
                </span>
                <Link to={`/licencas/${instrumento.id}/identificacao`} className="text-xs">
                  Definido no passo 2. Alterar
                </Link>
              </div>
              <CampoTexto
                rotulo="Data de referência"
                type="date"
                ajuda="De onde a recorrência começa a contar."
                value={referencia ?? ''}
                onChange={(evento) => {
                  setReferencia(dataDe(evento.target.value))
                }}
              />
              <CampoTexto
                rotulo="Primeira data"
                type="date"
                ajuda={
                  sugestao
                    ? `Sugerida: ${formatarDataCivil(sugestao)}.`
                    : 'Sem sugestão: informe a data que o documento determina.'
                }
                value={primeiraEfetiva ?? ''}
                onChange={(evento) => {
                  setPrimeiraTocada(true)
                  setPrimeira(dataDe(evento.target.value))
                }}
              />
              <fieldset className="flex flex-col gap-(--space-050)">
                <legend className="rotulo">Contagem</legend>
                <label className="inline-flex items-center gap-(--space-100) corpo">
                  <input
                    type="radio"
                    name="contagem"
                    checked
                    readOnly
                    className="size-4 accent-(--brand)"
                  />
                  Dias corridos
                </label>
                <label className="inline-flex items-center gap-(--space-100) corpo text-(--text-disabled)">
                  <input
                    type="radio"
                    name="contagem"
                    disabled
                    aria-describedby="uteis-indisponivel"
                  />
                  Dias úteis
                </label>
                <span id="uteis-indisponivel" className="text-xs text-(--text-subtle)">
                  Dias úteis entram com o calendário de feriados.
                </span>
              </fieldset>
            </div>

            <div className="flex flex-col gap-(--space-100)">
              <span className="rotulo">Simulação · próximas datas</span>
              {problema ? (
                <MensagemSecao tom="atencao">{problema}</MensagemSecao>
              ) : simulacao.length === 0 ? (
                <p className="text-xs text-(--text-subtle)">
                  Informe as datas para ver a simulação.
                </p>
              ) : (
                <>
                  <ol
                    className="grid grid-cols-2 gap-(--space-100) sm:grid-cols-3"
                    aria-label="Próximas datas"
                  >
                    {simulacao.slice(0, 6).map((d) => (
                      <li
                        key={d.ciclo}
                        className="flex flex-col rounded-(--radius) border px-(--space-100) py-(--space-075)"
                      >
                        <span className="corpo-medio">{formatarDataCivil(d.prazo)}</span>
                        <span className="text-xs text-(--text-subtle)">
                          {nomeDoDiaDaSemana(d.prazo)}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <span className="text-xs text-(--text-subtle)">
                    {simulacao.length === 1 ? '1 entrega' : `${String(simulacao.length)} entregas`}
                    {recorrencia === 'unica' || recorrencia === 'na_renovacao'
                      ? ''
                      : ' até a validade'}
                    .
                  </span>
                </>
              )}
            </div>
          </>
        ) : recorrencia === 'continua' ? (
          <MensagemSecao tom="informacao">
            Condição contínua: cumprida o tempo todo, não gera entrega periódica.
          </MensagemSecao>
        ) : (
          <MensagemSecao tom="atencao">
            Escolha a recorrência para confirmar. Enquanto isso, não dá para continuar.
          </MensagemSecao>
        )}

        {item.confirmadoEm && item.confirmadoPor ? (
          <p className="text-xs text-(--text-subtle)">
            Confirmado por {item.confirmadoPor} em{' '}
            {formatarInstanteComoData(item.confirmadoEm, fuso)}.
          </p>
        ) : null}
      </div>
      <div className="flex items-center justify-end gap-(--space-100) border-t p-(--space-150)">
        {semFonte ? (
          <span className="flex-1 text-xs text-(--text-subtle)">Informe a fonte ou regra.</span>
        ) : null}
        <Botao
          aparencia="primario"
          iconeAntes="check"
          disabled={!podeConfirmar}
          onClick={() => {
            confirmar.mutate()
          }}
        >
          {confirmar.isPending ? 'Confirmando…' : 'Confirmar prazo'}
        </Botao>
      </div>
    </section>
  )
}

/** /licencas/:id/prazos (Protótipo 13; LIC-03). Só dá para continuar com todos confirmados. */
export function PassoPrazos() {
  const { id = '' } = useParams()
  const salvamento = useSalvamento(id)
  return (
    <GuardaRascunho id={id} passo="prazos">
      {(instrumento) => <Prazos instrumento={instrumento} salvamento={salvamento} />}
    </GuardaRascunho>
  )
}

function Prazos({
  instrumento,
  salvamento: { salvoEm, registrar },
}: {
  instrumento: Instrumento
  salvamento: ReturnType<typeof useSalvamento>
}) {
  const navegar = useNavigate()
  const consulta = useCondicionantes(instrumento.id)
  const [aberto, setAberto] = useState<string | null>(null)
  const { fuso } = useConsultoria().atual

  const obrigacoes = (consulta.data ?? []).filter(
    (i) => i.natureza === 'obrigacao' && i.revisao === 'aceita',
  )
  const confirmados = obrigacoes.filter((i) => i.confirmadoEm).length
  const pendentes = obrigacoes.length - confirmados
  const item = obrigacoes.find((i) => i.id === aberto)
  const propostos = new Map(
    obrigacoes.flatMap((o) => {
      const proposto = prazoProposto(o, instrumento)
      return proposto ? [[o.id, proposto] as const] : []
    }),
  )
  const prontos = obrigacoes.filter((o) => !o.confirmadoEm && propostos.has(o.id))

  // Confirmar com um clique: a mesma RPC do painel (registra quem e quando, LIC-03).
  const confirmarRapido = useMutation({
    mutationFn: async (ids: readonly string[]) => {
      for (const idItem of ids) {
        const proposto = propostos.get(idItem)
        if (proposto) await confirmarPrazo(idItem, proposto.dados)
      }
    },
    onSettled: registrar,
  })
  const confirmando = (idItem: string) =>
    confirmarRapido.isPending && confirmarRapido.variables.includes(idItem)

  return (
    <MolduraCadastro
      passo="prazos"
      instrumentoId={instrumento.id}
      identificacao={
        instrumento.tipoSigla && instrumento.numero
          ? `${instrumento.tipoSigla} ${instrumento.numero}`
          : null
      }
      contexto={`${instrumento.empreendimentoNome} · ${instrumento.unidadeNome}`}
      sairPara={`/empreendimentos/${instrumento.empreendimentoId}`}
      salvoEm={salvoEm}
      larga
      rodape={
        <RodapeCadastro
          aviso={
            pendentes > 0
              ? `${String(pendentes)} ${pendentes === 1 ? 'prazo pendente' : 'prazos pendentes'} de revisão. Só dá para continuar com todos confirmados.`
              : undefined
          }
          voltarPara={`/licencas/${instrumento.id}/condicionantes`}
          aoContinuar={() => void navegar(`/licencas/${instrumento.id}/responsaveis`)}
          podeContinuar={consulta.isSuccess && pendentes === 0}
        />
      }
    >
      <div className={cn('grid h-full min-h-0', item && 'lg:grid-cols-[minmax(0,1fr)_480px]')}>
        <div
          className={cn(
            'min-h-0 overflow-auto p-(--space-200) md:p-(--space-300)',
            item && 'hidden lg:block',
          )}
        >
          <div className="mb-(--space-150) flex items-baseline gap-(--space-100)">
            <h2 className="titulo-secao">Prazos das obrigações</h2>
            <span className="text-xs text-(--text-subtle)">
              {confirmados} de {obrigacoes.length} confirmados
            </span>
          </div>
          {confirmarRapido.isError ? (
            <MensagemSecao role="alert" tom="perigo" className="mb-(--space-150)">
              {mensagemDoErro(confirmarRapido.error)}
            </MensagemSecao>
          ) : null}
          {consulta.isPending ? (
            <Carregando rotulo="Carregando prazos" linhas={5} />
          ) : consulta.isError ? (
            <EstadoErro aoTentarDeNovo={() => void consulta.refetch()} />
          ) : obrigacoes.length === 0 ? (
            <EstadoVazio
              icone="calendar"
              titulo="Nenhuma obrigação"
              descricao="Só obrigação vira prazo. Condições contínuas e informações gerais não geram entregas."
            />
          ) : (
            <div className="overflow-x-auto rounded-(--radius) border bg-(--surface)">
              <table className="w-full border-collapse corpo">
                <thead>
                  <tr>
                    <th scope="col" className={classeCabecalho}>
                      Código
                    </th>
                    <th scope="col" className={classeCabecalho}>
                      Título
                    </th>
                    <th scope="col" className={classeCabecalho}>
                      Recorrência
                    </th>
                    <th scope="col" className={classeCabecalho}>
                      Primeira data
                    </th>
                    <th scope="col" className={classeCabecalho}>
                      Confirmado por
                    </th>
                    <th scope="col" className={classeCabecalho}>
                      <span className="flex items-center justify-between gap-(--space-100)">
                        Situação
                        {prontos.length > 0 ? (
                          <Botao
                            tamanho="compacto"
                            iconeAntes="check"
                            disabled={confirmarRapido.isPending}
                            onClick={() => {
                              confirmarRapido.mutate(prontos.map((o) => o.id))
                            }}
                          >
                            {prontos.length === 1
                              ? 'Confirmar 1'
                              : `Confirmar todos (${String(prontos.length)})`}
                          </Botao>
                        ) : null}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {obrigacoes.map((o) => (
                    <tr key={o.id} className={cn(o.id === aberto && 'bg-(--surface-selected)')}>
                      <td className={`${classeCelula} font-mono text-xs text-(--text-subtle)`}>
                        {o.codigo}
                      </td>
                      <td className={classeCelula}>
                        <button
                          type="button"
                          onClick={() => {
                            setAberto(o.id)
                          }}
                          className="cursor-pointer text-left text-(--text-link) hover:underline"
                        >
                          {o.titulo}
                        </button>
                      </td>
                      <td className={classeCelula}>
                        {(() => {
                          const dados = o.recorrencia ? o : propostos.get(o.id)?.dados
                          if (!dados) return <span className="text-(--text-subtle)">Sem base</span>
                          return (
                            <span className="flex flex-col">
                              {descreverRecorrencia({
                                recorrencia: dados.recorrencia ?? 'unica',
                                unidade: dados.unidade,
                                intervalo: dados.intervalo,
                              })}
                              {o.recorrencia ? null : (
                                <span className="text-xs text-(--text-subtle)">
                                  sugerida pela leitura da IA
                                </span>
                              )}
                            </span>
                          )
                        })()}
                      </td>
                      <td className={classeCelula}>
                        {(() => {
                          const primeira = o.primeiraData ?? propostos.get(o.id)?.dados.primeiraData
                          if (!primeira) return <span className="text-(--text-subtle)">—</span>
                          return (
                            <span className="flex flex-col">
                              {formatarDataCivil(primeira)}
                              {o.primeiraData ? null : (
                                <span className="text-xs text-(--text-subtle)">sugerida</span>
                              )}
                            </span>
                          )
                        })()}
                      </td>
                      <td className={`${classeCelula} whitespace-nowrap`}>
                        {o.confirmadoEm && o.confirmadoPor
                          ? `${o.confirmadoPor} · ${formatarInstanteComoData(o.confirmadoEm, fuso).slice(0, 5)}`
                          : '—'}
                      </td>
                      <td className={classeCelula}>
                        {o.confirmadoEm ? (
                          <Selo tom="sucesso">Confirmado</Selo>
                        ) : propostos.has(o.id) ? (
                          <Botao
                            tamanho="compacto"
                            aparencia="primario"
                            iconeAntes="check"
                            aria-label={`Confirmar prazo de ${o.codigo || o.titulo}`}
                            disabled={confirmarRapido.isPending}
                            onClick={() => {
                              confirmarRapido.mutate([o.id])
                            }}
                          >
                            {confirmando(o.id) ? 'Confirmando…' : 'Confirmar'}
                          </Botao>
                        ) : (
                          <Botao
                            tamanho="compacto"
                            aparencia="link"
                            aria-label={`Definir prazo de ${o.codigo || o.titulo}`}
                            onClick={() => {
                              setAberto(o.id)
                            }}
                          >
                            Definir prazo
                          </Botao>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {item ? (
          <PainelPrazo
            key={item.id}
            instrumento={instrumento}
            item={item}
            fuso={fuso}
            aoFechar={() => {
              setAberto(null)
            }}
            aoConfirmar={registrar}
          />
        ) : null}
      </div>
    </MolduraCadastro>
  )
}
