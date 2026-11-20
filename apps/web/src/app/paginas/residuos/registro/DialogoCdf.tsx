import {
  ROTULO_DA_UNIDADE_DE_RESIDUO,
  UNIDADES_DE_RESIDUO,
  ehUnidadeResiduo,
  formatarCnpj,
  formatarDataCivil,
  formatarQuantidade,
  lerQuantidade,
  mascararCnpj,
  situacaoDoCnpj,
  type DataCivil,
  type UnidadeResiduo,
} from '@gestao-ambiental/domain'
import { useInfiniteQuery, useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { Carregando, EstadoErro } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { CaixaSelecao } from '@/components/ui/caixa-selecao'
import { CampoData } from '@/components/ui/campo-data'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  TAMANHO_PAGINA_RESIDUOS,
  editarCdf,
  enviarPdfResiduo,
  listarMtrs,
  registrarCdf,
  type Cdf,
  type DadosDoCdf,
} from '@/lib/api/residuos'
import { mensagemDoErro } from '@/lib/erros'

import { CampoObservacao, CampoPdf } from './campos'
import { classeControle, cnpjDoCampo, quantidadeParaTexto } from './comum'

/** MTR que o CDF pode cobrir, com os itens para informar a quantidade recebida. */
interface MtrParaEscolher {
  mtrId: string
  numero: string
  emitidoEm: DataCivil
  itens: {
    mtrItemId: string
    residuoCodigo: string
    residuoDescricao: string
    quantidadeMtr: number
    unidadeMtr: UnidadeResiduo
  }[]
}

/** Quantidade que o CDF informa para um item (texto vazio = não informa). */
interface RecebidoNoFormulario {
  quantidade: string
  unidade: UnidadeResiduo
}

type Escolhidos = Record<string, Record<string, RecebidoNoFormulario>>

function escolhidosDoExistente(existente: Cdf | undefined): Escolhidos {
  const saida: Escolhidos = {}
  for (const mtr of existente?.mtrs ?? []) {
    saida[mtr.mtrId] = Object.fromEntries(
      mtr.itens.map((item) => [
        item.mtrItemId,
        {
          quantidade: item.quantidade === null ? '' : quantidadeParaTexto(item.quantidade),
          unidade: item.unidade ?? item.unidadeMtr,
        },
      ]),
    )
  }
  return saida
}

type Erros = Record<string, string | undefined>

/**
 * Registrar ou editar CDF (resíduos, fase 1): número, emissão, destinador, período e os MTRs que
 * ele cobre, com a quantidade recebida por resíduo quando o CDF a informa, e o PDF. Os MTRs para
 * escolher são os do empreendimento ainda sem CDF (mais os que o CDF já cobre, na edição). Monte
 * o diálogo só enquanto estiver aberto.
 */
export function DialogoCdf({
  aoMudar,
  empreendimentoId,
  consultoriaId,
  hoje,
  existente,
  aoSalvar,
}: {
  aoMudar: (aberto: boolean) => void
  empreendimentoId: string
  consultoriaId: string
  hoje: DataCivil
  existente?: Cdf
  /** Chamado quando o CDF foi gravado (mesmo que o PDF falhe depois), para recarregar as listas. */
  aoSalvar: () => void
}) {
  const [id] = useState(() => existente?.id ?? crypto.randomUUID())
  const [numero, setNumero] = useState(existente?.numero ?? '')
  const [emitidoEm, setEmitidoEm] = useState<DataCivil | null>(existente?.emitidoEm ?? null)
  const [destinador, setDestinador] = useState(existente?.destinadorNome ?? '')
  const [destinadorCnpj, setDestinadorCnpj] = useState(formatarCnpj(existente?.destinadorCnpj))
  const [periodoInicio, setPeriodoInicio] = useState<DataCivil | null>(
    existente?.periodoInicio ?? null,
  )
  const [periodoFim, setPeriodoFim] = useState<DataCivil | null>(existente?.periodoFim ?? null)
  const [observacao, setObservacao] = useState(existente?.observacao ?? '')
  const [escolhidos, setEscolhidos] = useState<Escolhidos>(() => escolhidosDoExistente(existente))
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erros, setErros] = useState<Erros>({})
  const [gravado, setGravado] = useState(false)

  const semCdf = useInfiniteQuery({
    queryKey: ['mtrs', consultoriaId, empreendimentoId, 'sem-cdf'],
    queryFn: ({ pageParam }) =>
      listarMtrs(consultoriaId, { empreendimentoId, semCdf: true }, pageParam),
    initialPageParam: 0,
    getNextPageParam: (ultima, todas) => {
      const carregados = todas.reduce((soma, p) => soma + p.itens.length, 0)
      return ultima.itens.length === TAMANHO_PAGINA_RESIDUOS && carregados < ultima.total
        ? todas.length
        : undefined
    },
  })

  const jaCobertos: MtrParaEscolher[] = (existente?.mtrs ?? []).map((mtr) => ({
    mtrId: mtr.mtrId,
    numero: mtr.numero,
    emitidoEm: mtr.emitidoEm,
    itens: mtr.itens.map((i) => ({
      mtrItemId: i.mtrItemId,
      residuoCodigo: i.residuoCodigo,
      residuoDescricao: i.residuoDescricao,
      quantidadeMtr: i.quantidadeMtr,
      unidadeMtr: i.unidadeMtr,
    })),
  }))
  const idsCobertos = new Set(jaCobertos.map((m) => m.mtrId))
  const opcoes: MtrParaEscolher[] = [
    ...jaCobertos,
    ...(semCdf.data?.pages.flatMap((p) => p.itens) ?? [])
      .filter((mtr) => !idsCobertos.has(mtr.id))
      .map((mtr) => ({
        mtrId: mtr.id,
        numero: mtr.numero,
        emitidoEm: mtr.emitidoEm,
        itens: mtr.itens.map((i) => ({
          mtrItemId: i.id,
          residuoCodigo: i.residuoCodigo,
          residuoDescricao: i.residuoDescricao,
          quantidadeMtr: i.quantidade,
          unidadeMtr: i.unidade,
        })),
      })),
  ]

  function limpar(chave: string) {
    setErros((e) => ({ ...e, [chave]: undefined }))
  }

  function alternar(mtr: MtrParaEscolher, ligado: boolean) {
    setEscolhidos((atual) => {
      if (!ligado)
        return Object.fromEntries(Object.entries(atual).filter(([mtrId]) => mtrId !== mtr.mtrId))
      return {
        ...atual,
        [mtr.mtrId]: Object.fromEntries(
          mtr.itens.map((i) => [i.mtrItemId, { quantidade: '', unidade: i.unidadeMtr }]),
        ),
      }
    })
  }

  function mudarRecebido(mtrId: string, itemId: string, mudanca: Partial<RecebidoNoFormulario>) {
    setEscolhidos((atual) => {
      const doMtr = atual[mtrId] ?? {}
      const item = doMtr[itemId] ?? { quantidade: '', unidade: 't' }
      return { ...atual, [mtrId]: { ...doMtr, [itemId]: { ...item, ...mudanca } } }
    })
    limpar(`${mtrId}-${itemId}`)
  }

  function dados(): DadosDoCdf | null {
    const novos: Erros = {}
    if (!numero.trim()) novos.numero = 'Informe o número do CDF'
    if (!emitidoEm) novos.emitidoEm = 'Informe a data de emissão'
    else if (emitidoEm > hoje) novos.emitidoEm = 'A data de emissão não pode estar no futuro'
    if (!destinador.trim()) novos.destinador = 'Informe o destinador'
    if (situacaoDoCnpj(destinadorCnpj) === 'incompleto') novos.destinadorCnpj = 'CNPJ incompleto'
    if (!periodoInicio) novos.periodoInicio = 'Informe o início do período'
    if (!periodoFim) novos.periodoFim = 'Informe o fim do período'
    else if (periodoInicio && periodoInicio > periodoFim)
      novos.periodoFim = 'O fim do período vem depois do início'
    const mtrs = Object.entries(escolhidos).map(([mtrId, itens]) => ({
      mtrId,
      itens: Object.entries(itens).flatMap(([mtrItemId, recebido]) => {
        if (!recebido.quantidade.trim()) return []
        const quantidade = lerQuantidade(recebido.quantidade)
        if (quantidade === null) {
          novos[`${mtrId}-${mtrItemId}`] = 'Use um número maior que zero, até 4 casas'
          return []
        }
        return [{ mtrItemId, quantidade, unidade: recebido.unidade }]
      }),
    }))
    setErros(novos)
    if (Object.keys(novos).length > 0 || !emitidoEm || !periodoInicio || !periodoFim) return null
    return {
      numero: numero.trim(),
      emitidoEm,
      destinadorNome: destinador.trim(),
      destinadorCnpj: cnpjDoCampo(destinadorCnpj),
      periodoInicio,
      periodoFim,
      observacao: observacao.trim() || null,
      mtrs,
    }
  }

  const salvar = useMutation({
    mutationFn: async (dadosDoCdf: DadosDoCdf) => {
      if (!gravado) {
        if (existente) await editarCdf(id, existente.rowVersion, dadosDoCdf)
        else await registrarCdf(id, empreendimentoId, dadosDoCdf)
        setGravado(true)
        aoSalvar()
      }
      if (arquivo) await enviarPdfResiduo('cdf', id, consultoriaId, arquivo)
    },
    onSuccess: () => {
      aoMudar(false)
    },
  })

  function enviar() {
    const prontos = dados()
    if (prontos) salvar.mutate(prontos)
  }

  return (
    <Dialogo
      aberto
      aoMudar={aoMudar}
      titulo={existente ? `Editar CDF ${existente.numero}` : 'Registrar CDF'}
      largura={760}
      acoes={
        <>
          <Botao
            onClick={() => {
              aoMudar(false)
            }}
          >
            Cancelar
          </Botao>
          <Botao aparencia="primario" disabled={salvar.isPending} onClick={enviar}>
            {salvar.isPending ? 'Salvando…' : existente ? 'Salvar CDF' : 'Registrar CDF'}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-(--e-4)">
        {salvar.isError ? (
          <MensagemSecao role="alert" tom="perigo">
            {gravado
              ? `CDF salvo, mas o PDF não foi enviado. ${mensagemDoErro(salvar.error)}`
              : mensagemDoErro(salvar.error)}
          </MensagemSecao>
        ) : null}

        <div className="grid gap-(--e-3) sm:grid-cols-2">
          <CampoTexto
            rotulo="Número do CDF *"
            value={numero}
            erro={erros.numero}
            maxLength={60}
            onChange={(evento) => {
              setNumero(evento.target.value)
              limpar('numero')
            }}
          />
          <CampoData
            rotulo="Emissão *"
            hoje={hoje}
            maximo={hoje}
            motivoDoLimite="A data de emissão não pode estar no futuro"
            valor={emitidoEm}
            erro={erros.emitidoEm}
            aoMudar={(data) => {
              setEmitidoEm(data)
              limpar('emitidoEm')
            }}
          />
          <CampoTexto
            rotulo="Destinador *"
            value={destinador}
            erro={erros.destinador}
            maxLength={200}
            onChange={(evento) => {
              setDestinador(evento.target.value)
              limpar('destinador')
            }}
          />
          <CampoTexto
            rotulo="CNPJ do destinador"
            value={destinadorCnpj}
            erro={erros.destinadorCnpj}
            onChange={(evento) => {
              setDestinadorCnpj(mascararCnpj(evento.target.value))
              limpar('destinadorCnpj')
            }}
          />
          <CampoData
            rotulo="Início do período *"
            hoje={hoje}
            valor={periodoInicio}
            erro={erros.periodoInicio}
            aoMudar={(data) => {
              setPeriodoInicio(data)
              limpar('periodoInicio')
            }}
          />
          <CampoData
            rotulo="Fim do período *"
            hoje={hoje}
            valor={periodoFim}
            erro={erros.periodoFim}
            aoMudar={(data) => {
              setPeriodoFim(data)
              limpar('periodoFim')
            }}
          />
        </div>

        <section aria-labelledby="titulo-mtrs-cdf" className="flex flex-col gap-(--e-2)">
          <h3 id="titulo-mtrs-cdf" className="titulo-secao">
            MTRs cobertos
          </h3>
          {semCdf.isPending ? (
            <Carregando rotulo="Carregando MTRs sem CDF" linhas={2} />
          ) : semCdf.isError ? (
            <EstadoErro
              titulo="Não foi possível carregar os MTRs."
              aoTentarDeNovo={() => void semCdf.refetch()}
            />
          ) : opcoes.length === 0 ? (
            <p className="corpo">Nenhum MTR sem CDF neste empreendimento.</p>
          ) : (
            <ul className="flex flex-col gap-(--e-2)">
              {opcoes.map((mtr) => {
                const doMtr = escolhidos[mtr.mtrId]
                return (
                  <li
                    key={mtr.mtrId}
                    className="flex flex-col gap-(--e-2) rounded-(--raio) border p-(--e-2)"
                  >
                    <CaixaSelecao
                      rotulo={`MTR ${mtr.numero} · ${formatarDataCivil(mtr.emitidoEm)}`}
                      checked={Boolean(doMtr)}
                      onChange={(evento) => {
                        alternar(mtr, evento.target.checked)
                      }}
                    />
                    {doMtr ? (
                      <ul className="flex flex-col gap-(--e-2) pl-(--e-6)">
                        {mtr.itens.map((item) => {
                          const recebido = doMtr[item.mtrItemId] ?? {
                            quantidade: '',
                            unidade: item.unidadeMtr,
                          }
                          const chave = `${mtr.mtrId}-${item.mtrItemId}`
                          const nome = `${item.residuoCodigo} ${item.residuoDescricao}`
                          return (
                            <li
                              key={item.mtrItemId}
                              className="grid grid-cols-[1fr_96px] items-end gap-(--e-2) sm:grid-cols-[1fr_160px_96px]"
                            >
                              <p className="col-span-2 min-w-0 corpo sm:col-span-1">
                                <span className="corpo-medio">{item.residuoCodigo}</span>{' '}
                                {item.residuoDescricao} ·{' '}
                                {formatarQuantidade(item.quantidadeMtr, item.unidadeMtr)} no MTR
                              </p>
                              <CampoTexto
                                rotulo="Recebido no CDF"
                                aria-label={`Recebido no CDF: ${nome}`}
                                value={recebido.quantidade}
                                erro={erros[chave]}
                                inputMode="decimal"
                                onChange={(evento) => {
                                  mudarRecebido(mtr.mtrId, item.mtrItemId, {
                                    quantidade: evento.target.value,
                                  })
                                }}
                              />
                              <label className="flex flex-col gap-(--e-1)">
                                <span className="rotulo">Unidade</span>
                                <select
                                  aria-label={`Unidade recebida no CDF: ${nome}`}
                                  className={classeControle}
                                  value={recebido.unidade}
                                  onChange={(evento) => {
                                    if (ehUnidadeResiduo(evento.target.value))
                                      mudarRecebido(mtr.mtrId, item.mtrItemId, {
                                        unidade: evento.target.value,
                                      })
                                  }}
                                >
                                  {UNIDADES_DE_RESIDUO.map((u) => (
                                    <option key={u} value={u}>
                                      {ROTULO_DA_UNIDADE_DE_RESIDUO[u]}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
          {semCdf.hasNextPage ? (
            <div>
              <Botao
                tamanho="compacto"
                disabled={semCdf.isFetchingNextPage}
                onClick={() => void semCdf.fetchNextPage()}
              >
                Mostrar mais MTRs
              </Botao>
            </div>
          ) : null}
        </section>

        <CampoObservacao valor={observacao} aoMudar={setObservacao} />

        <CampoPdf
          rotulo="PDF do CDF"
          arquivo={arquivo}
          atual={existente?.pdf ?? null}
          erro={erros.arquivo}
          aoEscolher={(escolhido) => {
            setArquivo(escolhido)
            limpar('arquivo')
          }}
          aoErro={(mensagem) => {
            setErros((e) => ({ ...e, arquivo: mensagem }))
          }}
        />
      </div>
    </Dialogo>
  )
}
