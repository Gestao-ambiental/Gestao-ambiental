import {
  formatarCentavos,
  formatarPontosBase,
  formatarReais,
  lerReais,
} from '@gestao-ambiental/domain'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  ROTULO_DO_TRATAMENTO,
  obterOrcamento,
  salvarOrcamento,
  type DadosDoRascunho,
  type Orcamento,
  type TratamentoDespesa,
} from '@/lib/api/orcamentos'
import { mensagemDoErro } from '@/lib/erros'

import {
  calcularOrcamento,
  lerHoras,
  lerPercentual,
  lerReaisOuZero,
  textoDasHoras,
  textoDoPercentual,
} from './calculo'
import { classeCabecalho, classeCampo, classeCelula, numeroComRevisao } from './comum'
import { SeloSituacaoOrcamento } from './SeloSituacaoOrcamento'

// ---------------------------------------------------------------------------
// Rascunho da tela: números ficam como texto enquanto a pessoa digita
// ---------------------------------------------------------------------------

interface LinhaItem {
  id: string
  descricao: string
  horas: string
  extra: string
  preco: string
}
interface LinhaDespesa {
  id: string
  descricao: string
  estimativa: string
  tratamento: TratamentoDespesa
}
interface LinhaParcela {
  id: string
  descricao: string
  percentual: string
}
interface Rascunho {
  objeto: string
  destinatario: string
  prazos: string
  validade: string
  premissas: string
  exclusoes: string
  itens: LinhaItem[]
  despesas: LinhaDespesa[]
  parcelas: LinhaParcela[]
}

function rascunhoDe(o: Orcamento): Rascunho {
  return {
    objeto: o.objeto,
    destinatario: o.destinatario,
    prazos: o.prazos,
    validade: String(o.validadeDias),
    premissas: o.premissas.join('\n'),
    exclusoes: o.exclusoes.join('\n'),
    itens: o.itens.map((i) => ({
      id: i.id,
      descricao: i.descricao,
      horas: textoDasHoras(i.horas),
      extra: i.custoDiretoExtraCentavos ? formatarCentavos(i.custoDiretoExtraCentavos) : '',
      preco: formatarCentavos(i.precoCentavos),
    })),
    despesas: o.despesas.map((d) => ({
      id: d.id,
      descricao: d.descricao,
      estimativa: formatarCentavos(d.estimativaCentavos),
      tratamento: d.tratamento,
    })),
    parcelas: o.parcelas.map((p) => ({
      id: p.id,
      descricao: p.descricao,
      percentual: textoDoPercentual(p.percentualPb),
    })),
  }
}

function linhasDeTexto(texto: string): string[] {
  return texto
    .split('\n')
    .map((linha) => linha.trim())
    .filter(Boolean)
}

/** Converte o rascunho para o formato da RPC. Devolve a primeira mensagem de erro, se houver. */
function paraSalvar(r: Rascunho): DadosDoRascunho | string {
  if (!r.objeto.trim()) return 'Diga o que está sendo orçado.'
  const validade = Number(r.validade)
  if (!Number.isInteger(validade) || validade < 1 || validade > 365)
    return 'Validade: um número de 1 a 365 dias.'
  const itens: DadosDoRascunho['itens'] = []
  for (const [indice, i] of r.itens.entries()) {
    const horas = lerHoras(i.horas)
    const preco = lerReaisOuZero(i.preco)
    const extra = lerReaisOuZero(i.extra)
    if (!i.descricao.trim()) return `Item ${String(indice + 1)}: informe o serviço.`
    if (horas === null) return `Item ${String(indice + 1)}: horas inválidas.`
    if (preco === null || extra === null) return `Item ${String(indice + 1)}: valor inválido.`
    itens.push({
      id: i.id,
      descricao: i.descricao,
      horas,
      precoCentavos: preco,
      custoDiretoExtraCentavos: extra,
    })
  }
  const despesas: DadosDoRascunho['despesas'] = []
  for (const [indice, d] of r.despesas.entries()) {
    const estimativa = lerReaisOuZero(d.estimativa)
    if (!d.descricao.trim()) return `Despesa ${String(indice + 1)}: informe a despesa.`
    if (estimativa === null) return `Despesa ${String(indice + 1)}: valor inválido.`
    despesas.push({
      id: d.id,
      descricao: d.descricao,
      estimativaCentavos: estimativa,
      tratamento: d.tratamento,
    })
  }
  const parcelas: DadosDoRascunho['parcelas'] = []
  for (const [indice, p] of r.parcelas.entries()) {
    const percentual = lerPercentual(p.percentual)
    if (!p.descricao.trim()) return `Parcela ${String(indice + 1)}: diga quando vence.`
    if (percentual === null) return `Parcela ${String(indice + 1)}: percentual de 0 a 100.`
    parcelas.push({ id: p.id, descricao: p.descricao, percentualPb: percentual })
  }
  return {
    objeto: r.objeto,
    destinatario: r.destinatario,
    prazos: r.prazos,
    validadeDias: validade,
    premissas: linhasDeTexto(r.premissas),
    exclusoes: linhasDeTexto(r.exclusoes),
    itens,
    despesas,
    parcelas,
  }
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

/**
 * /orcamentos/:id (onda 5; ORC-02, ORC-03, ORC-04). Rascunho editável numa tela só: itens,
 * preço e margem, despesas de terceiros e parcelas. Detalhes ficam recolhidos. Custo e margem são
 * internos e só a Gestão vê. Proposta enviada é só leitura.
 */
export function PaginaOrcamento() {
  const { atual } = useConsultoria()
  const { id = '' } = useParams()

  const consulta = useQuery({
    queryKey: ['orcamento', id],
    queryFn: () => obterOrcamento(id),
    enabled: atual.papel === 'gestao',
  })

  if (atual.papel !== 'gestao') {
    return (
      <Pagina titulo="Orçamento">
        <SemPermissao descricao="Orçamentos têm custo e margem: por enquanto, só a gestão acessa." />
      </Pagina>
    )
  }
  if (consulta.isPending) return <Carregando rotulo="Carregando orçamento" linhas={6} />
  if (consulta.isError) {
    return (
      <Pagina titulo="Orçamento">
        <EstadoErro
          titulo="Não foi possível carregar o orçamento."
          aoTentarDeNovo={() => void consulta.refetch()}
        />
      </Pagina>
    )
  }
  if (!consulta.data) {
    return (
      <Pagina titulo="Orçamento">
        <EstadoVazio
          icone="file-text"
          titulo="Orçamento não encontrado"
          descricao="Ele pode ter sido removido, ou você não tem acesso a ele."
        />
      </Pagina>
    )
  }
  // A chave remonta o editor quando outra versão chega do servidor.
  return (
    <Editor
      key={`${consulta.data.id}:${String(consulta.data.rowVersion)}`}
      orcamento={consulta.data}
    />
  )
}

function Editor({ orcamento }: { orcamento: Orcamento }) {
  const queryClient = useQueryClient()
  const editavel = orcamento.situacao === 'rascunho'
  const [r, setR] = useState<Rascunho>(() => rascunhoDe(orcamento))
  const [alterado, setAlterado] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)

  function mudar(alterar: (anterior: Rascunho) => Rascunho) {
    setR(alterar)
    setAlterado(true)
  }

  const calculo = useMemo(() => {
    const linhas = r.itens.map((i) => ({
      horas: lerHoras(i.horas) ?? 0,
      precoCentavos: lerReaisOuZero(i.preco) ?? 0,
      custoDiretoExtraCentavos: lerReaisOuZero(i.extra) ?? 0,
    }))
    const percentuais = r.parcelas.map((p) => lerPercentual(p.percentual) ?? 0)
    return calcularOrcamento(linhas, percentuais, orcamento.base)
  }, [r.itens, r.parcelas, orcamento.base])

  async function salvar() {
    const dados = paraSalvar(r)
    if (typeof dados === 'string') {
      setFalha(dados)
      return
    }
    setFalha(null)
    setSalvando(true)
    try {
      await salvarOrcamento(orcamento.id, orcamento.rowVersion, dados)
      setAlterado(false)
      await queryClient.invalidateQueries({ queryKey: ['orcamento', orcamento.id] })
      await queryClient.invalidateQueries({ queryKey: ['orcamentos'] })
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
    } finally {
      setSalvando(false)
    }
  }

  const itensAbaixo = calculo.itens.filter((item) => item.situacao === 'abaixo_da_minima').length

  return (
    <div className="flex flex-col gap-(--space-200)">
      <Link to="/orcamentos" className="text-xs text-(--text-subtle) no-underline hover:underline">
        Orçamentos
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-(--space-150)">
        <div className="flex flex-col gap-(--space-050)">
          <Pagina titulo={orcamento.empreendimentoNome}>{null}</Pagina>
          <p className="flex flex-wrap items-center gap-(--space-100) text-(--text-subtle)">
            <span className="tabular-nums">
              {numeroComRevisao(orcamento.ano, orcamento.sequencia, orcamento.revisao)}
            </span>
            <SeloSituacaoOrcamento situacao={orcamento.situacao} />
            {alterado ? <span>Alterações não salvas</span> : null}
          </p>
        </div>
        {editavel ? (
          <Botao
            aparencia="primario"
            disabled={salvando || !alterado}
            aria-busy={salvando || undefined}
            onClick={() => void salvar()}
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </Botao>
        ) : null}
      </div>

      {falha ? (
        <MensagemSecao role="alert" tom="perigo">
          {falha}
        </MensagemSecao>
      ) : null}
      {!editavel ? (
        <MensagemSecao tom="informacao">
          Proposta enviada não é editada no lugar. Mudanças viram uma nova revisão.
        </MensagemSecao>
      ) : null}

      <div className="overflow-hidden rounded-(--radius) border bg-(--surface)">
        {/* Números principais */}
        <div className="grid gap-(--space-200) border-b p-(--space-200) sm:grid-cols-3">
          <Numero rotulo="Preço sugerido">
            {calculo.precoSugeridoCentavos === null ? (
              <span className="text-(--text-subtle)">—</span>
            ) : (
              formatarReais(calculo.precoSugeridoCentavos)
            )}
          </Numero>
          <Numero rotulo="Preço praticado">{formatarReais(calculo.precoPraticadoCentavos)}</Numero>
          <Numero
            rotulo="Margem"
            apoio={
              orcamento.base
                ? `desejada ${formatarPontosBase(orcamento.base.margemDesejadaPb)} · mínima ${formatarPontosBase(orcamento.base.margemMinimaPb)} no total`
                : undefined
            }
          >
            {calculo.margemPontosBase === null ? (
              <span className="text-(--text-subtle)">—</span>
            ) : (
              <span
                className={
                  calculo.situacaoDaMargem === 'abaixo_da_minima'
                    ? 'text-(--text-danger)'
                    : undefined
                }
              >
                {formatarPontosBase(calculo.margemPontosBase)}
              </span>
            )}
          </Numero>
        </div>

        {!orcamento.base ? (
          <div className="border-b p-(--space-200)">
            <MensagemSecao tom="atencao">
              Custos e taxas ainda não configurados: o rateio está pendente e não há preço sugerido.{' '}
              <Link to="/configuracoes/custos">Configurar custos e taxas</Link>
            </MensagemSecao>
          </div>
        ) : null}
        {calculo.situacaoDaMargem === 'abaixo_da_minima' ? (
          <div className="border-b p-(--space-200)">
            <MensagemSecao role="status" tom="perigo">
              A margem total está abaixo da mínima.
            </MensagemSecao>
          </div>
        ) : null}

        {/* Itens */}
        <Secao titulo="Itens">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse corpo">
              <thead>
                <tr>
                  <th scope="col" className={classeCabecalho}>
                    Serviço
                  </th>
                  <th scope="col" className={`${classeCabecalho} w-24 text-right`}>
                    Horas
                  </th>
                  <th scope="col" className={`${classeCabecalho} w-36 text-right`}>
                    Outros custos (R$)
                  </th>
                  <th scope="col" className={`${classeCabecalho} w-36 text-right`}>
                    Preço (R$)
                  </th>
                  <th scope="col" className={`${classeCabecalho} w-24 text-right`}>
                    Margem
                  </th>
                  {editavel ? (
                    <th scope="col" className={`${classeCabecalho} w-12`}>
                      <span className="sr-only">Remover</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {r.itens.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={`${classeCelula} text-(--text-subtle)`}>
                      Nenhum item ainda. Adicione os serviços deste orçamento.
                    </td>
                  </tr>
                ) : null}
                {r.itens.map((item, indice) => {
                  const c = calculo.itens[indice]
                  const n = String(indice + 1)
                  return (
                    <tr key={item.id}>
                      <td className={classeCelula}>
                        <input
                          aria-label={`Serviço do item ${n}`}
                          className={classeCampo}
                          value={item.descricao}
                          disabled={!editavel}
                          onChange={(e) => {
                            const valor = e.target.value
                            mudar((a) => ({
                              ...a,
                              itens: a.itens.map((x) =>
                                x.id === item.id ? { ...x, descricao: valor } : x,
                              ),
                            }))
                          }}
                        />
                      </td>
                      <td className={classeCelula}>
                        <CampoNumero
                          rotulo={`Horas do item ${n}`}
                          valor={item.horas}
                          invalido={lerHoras(item.horas) === null}
                          desabilitado={!editavel}
                          aoMudar={(valor) => {
                            mudar((a) => ({
                              ...a,
                              itens: a.itens.map((x) =>
                                x.id === item.id ? { ...x, horas: valor } : x,
                              ),
                            }))
                          }}
                        />
                      </td>
                      <td className={classeCelula}>
                        <CampoNumero
                          rotulo={`Outros custos do item ${n}`}
                          reais
                          valor={item.extra}
                          invalido={lerReaisOuZero(item.extra) === null}
                          desabilitado={!editavel}
                          aoMudar={(valor) => {
                            mudar((a) => ({
                              ...a,
                              itens: a.itens.map((x) =>
                                x.id === item.id ? { ...x, extra: valor } : x,
                              ),
                            }))
                          }}
                        />
                      </td>
                      <td className={classeCelula}>
                        <CampoNumero
                          rotulo={`Preço do item ${n}`}
                          reais
                          valor={item.preco}
                          invalido={lerReaisOuZero(item.preco) === null}
                          desabilitado={!editavel}
                          aoMudar={(valor) => {
                            mudar((a) => ({
                              ...a,
                              itens: a.itens.map((x) =>
                                x.id === item.id ? { ...x, preco: valor } : x,
                              ),
                            }))
                          }}
                        />
                      </td>
                      <td className={`${classeCelula} text-right tabular-nums`}>
                        {c?.margemPontosBase === null || c === undefined ? (
                          <span className="text-(--text-subtle)">—</span>
                        ) : (
                          <span
                            className={
                              c.situacao === 'abaixo_da_minima'
                                ? 'text-(--text-warning)'
                                : undefined
                            }
                          >
                            {formatarPontosBase(c.margemPontosBase)}
                            {c.situacao === 'abaixo_da_minima' ? (
                              <span className="sr-only"> (abaixo da mínima)</span>
                            ) : null}
                          </span>
                        )}
                      </td>
                      {editavel ? (
                        <td className={classeCelula}>
                          <BotaoIcone
                            icone="trash-2"
                            rotulo={`Remover item ${n}`}
                            onClick={() => {
                              mudar((a) => ({
                                ...a,
                                itens: a.itens.filter((x) => x.id !== item.id),
                              }))
                            }}
                          />
                        </td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-(--space-100) px-(--space-150) py-(--space-100)">
            {editavel ? (
              <Botao
                aparencia="link"
                iconeAntes="plus"
                onClick={() => {
                  mudar((a) => ({
                    ...a,
                    itens: [
                      ...a.itens,
                      { id: crypto.randomUUID(), descricao: '', horas: '', extra: '', preco: '' },
                    ],
                  }))
                }}
              >
                Adicionar item
              </Botao>
            ) : (
              <span />
            )}
            {itensAbaixo > 0 && calculo.situacaoDaMargem === 'adequada' ? (
              <p className="text-xs text-(--text-warning)">
                {itensAbaixo === 1 ? 'Um item está' : `${String(itensAbaixo)} itens estão`} abaixo
                da margem mínima. O total está acima, então o envio fica liberado.
              </p>
            ) : null}
          </div>
        </Secao>

        {/* Despesas de terceiros */}
        <Secao titulo="Despesas de terceiros">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse corpo">
              <thead>
                <tr>
                  <th scope="col" className={classeCabecalho}>
                    Despesa
                  </th>
                  <th scope="col" className={`${classeCabecalho} w-64`}>
                    Como é paga
                  </th>
                  <th scope="col" className={`${classeCabecalho} w-36 text-right`}>
                    Estimativa (R$)
                  </th>
                  {editavel ? (
                    <th scope="col" className={`${classeCabecalho} w-12`}>
                      <span className="sr-only">Remover</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {r.despesas.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={`${classeCelula} text-(--text-subtle)`}>
                      Nenhuma despesa de terceiros.
                    </td>
                  </tr>
                ) : null}
                {r.despesas.map((d, indice) => {
                  const n = String(indice + 1)
                  return (
                    <tr key={d.id}>
                      <td className={classeCelula}>
                        <input
                          aria-label={`Despesa ${n}`}
                          className={classeCampo}
                          value={d.descricao}
                          disabled={!editavel}
                          onChange={(e) => {
                            const valor = e.target.value
                            mudar((a) => ({
                              ...a,
                              despesas: a.despesas.map((x) =>
                                x.id === d.id ? { ...x, descricao: valor } : x,
                              ),
                            }))
                          }}
                        />
                      </td>
                      <td className={classeCelula}>
                        <select
                          aria-label={`Como é paga a despesa ${n}`}
                          className={classeCampo}
                          value={d.tratamento}
                          disabled={!editavel}
                          onChange={(e) => {
                            const valor = e.target.value as TratamentoDespesa
                            mudar((a) => ({
                              ...a,
                              despesas: a.despesas.map((x) =>
                                x.id === d.id ? { ...x, tratamento: valor } : x,
                              ),
                            }))
                          }}
                        >
                          {(Object.keys(ROTULO_DO_TRATAMENTO) as TratamentoDespesa[]).map((t) => (
                            <option key={t} value={t}>
                              {ROTULO_DO_TRATAMENTO[t]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={classeCelula}>
                        <CampoNumero
                          rotulo={`Estimativa da despesa ${n}`}
                          reais
                          valor={d.estimativa}
                          invalido={lerReaisOuZero(d.estimativa) === null}
                          desabilitado={!editavel}
                          aoMudar={(valor) => {
                            mudar((a) => ({
                              ...a,
                              despesas: a.despesas.map((x) =>
                                x.id === d.id ? { ...x, estimativa: valor } : x,
                              ),
                            }))
                          }}
                        />
                      </td>
                      {editavel ? (
                        <td className={classeCelula}>
                          <BotaoIcone
                            icone="trash-2"
                            rotulo={`Remover despesa ${n}`}
                            onClick={() => {
                              mudar((a) => ({
                                ...a,
                                despesas: a.despesas.filter((x) => x.id !== d.id),
                              }))
                            }}
                          />
                        </td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {editavel ? (
            <div className="px-(--space-150) py-(--space-100)">
              <Botao
                aparencia="link"
                iconeAntes="plus"
                onClick={() => {
                  mudar((a) => ({
                    ...a,
                    despesas: [
                      ...a.despesas,
                      {
                        id: crypto.randomUUID(),
                        descricao: '',
                        estimativa: '',
                        tratamento: 'cliente_direto',
                      },
                    ],
                  }))
                }}
              >
                Adicionar despesa
              </Botao>
            </div>
          ) : null}
        </Secao>

        {/* Parcelas */}
        <Secao titulo="Parcelas">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse corpo">
              <thead>
                <tr>
                  <th scope="col" className={classeCabecalho}>
                    Quando vence
                  </th>
                  <th scope="col" className={`${classeCabecalho} w-24 text-right`}>
                    %
                  </th>
                  <th scope="col" className={`${classeCabecalho} w-36 text-right`}>
                    Valor (R$)
                  </th>
                  {editavel ? (
                    <th scope="col" className={`${classeCabecalho} w-12`}>
                      <span className="sr-only">Remover</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {r.parcelas.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={`${classeCelula} text-(--text-subtle)`}>
                      Nenhuma parcela. Adicione ao menos uma antes de enviar.
                    </td>
                  </tr>
                ) : null}
                {r.parcelas.map((p, indice) => {
                  const n = String(indice + 1)
                  const valor = calculo.parcelasCentavos[indice]
                  return (
                    <tr key={p.id}>
                      <td className={classeCelula}>
                        <input
                          aria-label={`Quando vence a parcela ${n}`}
                          placeholder="Ex.: 3 dias após a assinatura do contrato"
                          className={classeCampo}
                          value={p.descricao}
                          disabled={!editavel}
                          onChange={(e) => {
                            const texto = e.target.value
                            mudar((a) => ({
                              ...a,
                              parcelas: a.parcelas.map((x) =>
                                x.id === p.id ? { ...x, descricao: texto } : x,
                              ),
                            }))
                          }}
                        />
                      </td>
                      <td className={classeCelula}>
                        <CampoNumero
                          rotulo={`Percentual da parcela ${n}`}
                          valor={p.percentual}
                          invalido={lerPercentual(p.percentual) === null}
                          desabilitado={!editavel}
                          aoMudar={(texto) => {
                            mudar((a) => ({
                              ...a,
                              parcelas: a.parcelas.map((x) =>
                                x.id === p.id ? { ...x, percentual: texto } : x,
                              ),
                            }))
                          }}
                        />
                      </td>
                      <td className={`${classeCelula} text-right tabular-nums`}>
                        {valor === undefined ? '—' : formatarCentavos(valor)}
                      </td>
                      {editavel ? (
                        <td className={classeCelula}>
                          <BotaoIcone
                            icone="trash-2"
                            rotulo={`Remover parcela ${n}`}
                            onClick={() => {
                              mudar((a) => ({
                                ...a,
                                parcelas: a.parcelas.filter((x) => x.id !== p.id),
                              }))
                            }}
                          />
                        </td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-(--space-100) px-(--space-150) py-(--space-100)">
            {editavel ? (
              <Botao
                aparencia="link"
                iconeAntes="plus"
                onClick={() => {
                  mudar((a) => ({
                    ...a,
                    parcelas: [
                      ...a.parcelas,
                      { id: crypto.randomUUID(), descricao: '', percentual: '' },
                    ],
                  }))
                }}
              >
                Adicionar parcela
              </Botao>
            ) : (
              <span />
            )}
            {r.parcelas.length > 0 && calculo.diferencaParcelasPontosBase !== 0 ? (
              <p role="status" className="text-xs text-(--text-danger)">
                {calculo.diferencaParcelasPontosBase > 0
                  ? `Faltam ${formatarPontosBase(calculo.diferencaParcelasPontosBase)} para fechar 100%.`
                  : `Passa de 100% em ${formatarPontosBase(-calculo.diferencaParcelasPontosBase)}.`}
              </p>
            ) : r.parcelas.length > 0 ? (
              <p className="text-xs text-(--text-subtle)">Somam 100% do preço praticado.</p>
            ) : null}
          </div>
        </Secao>

        {/* Detalhes recolhidos */}
        <Recolhido titulo="Objeto, destinatário, prazos e validade" resumo={`${r.validade} dias`}>
          <div className="grid gap-(--space-200) sm:grid-cols-2">
            <CampoArea
              id="orcamento-objeto"
              rotulo="O que está sendo orçado"
              linhas={1}
              valor={r.objeto}
              desabilitado={!editavel}
              aoMudar={(valor) => {
                mudar((a) => ({ ...a, objeto: valor }))
              }}
            />
            <CampoArea
              id="orcamento-destinatario"
              rotulo="Destinatário da proposta"
              linhas={1}
              valor={r.destinatario}
              desabilitado={!editavel}
              aoMudar={(valor) => {
                mudar((a) => ({ ...a, destinatario: valor }))
              }}
            />
            <CampoArea
              id="orcamento-prazos"
              rotulo="Prazos"
              linhas={3}
              valor={r.prazos}
              desabilitado={!editavel}
              aoMudar={(valor) => {
                mudar((a) => ({ ...a, prazos: valor }))
              }}
            />
            <div className="flex flex-col gap-(--space-050)">
              <label htmlFor="orcamento-validade" className="rotulo">
                Validade da proposta (dias)
              </label>
              <input
                id="orcamento-validade"
                inputMode="numeric"
                className={`${classeCampo} max-w-32 text-right tabular-nums`}
                value={r.validade}
                disabled={!editavel}
                onChange={(e) => {
                  const valor = e.target.value
                  mudar((a) => ({ ...a, validade: valor }))
                }}
              />
            </div>
          </div>
        </Recolhido>
        <Recolhido titulo="Premissas" resumo={String(linhasDeTexto(r.premissas).length)}>
          <CampoArea
            id="orcamento-premissas"
            rotulo="Uma premissa por linha"
            linhas={5}
            valor={r.premissas}
            desabilitado={!editavel}
            aoMudar={(valor) => {
              mudar((a) => ({ ...a, premissas: valor }))
            }}
          />
        </Recolhido>
        <Recolhido titulo="Exclusões" resumo={String(linhasDeTexto(r.exclusoes).length)}>
          <CampoArea
            id="orcamento-exclusoes"
            rotulo="Uma exclusão por linha"
            linhas={5}
            valor={r.exclusoes}
            desabilitado={!editavel}
            aoMudar={(valor) => {
              mudar((a) => ({ ...a, exclusoes: valor }))
            }}
          />
        </Recolhido>
        {orcamento.base ? (
          <Recolhido
            titulo="Como o preço foi calculado"
            resumo={`custos + taxas fixas ÷ (1 − margem − tributos − taxas)`}
          >
            <dl className="grid max-w-xl grid-cols-[1fr_auto] gap-x-(--space-200) gap-y-(--space-075) corpo">
              <dt className="text-(--text-subtle)">
                Custo dos itens (horas, outros custos e rateio)
              </dt>
              <dd className="text-right tabular-nums">
                {calculo.custoTotalCentavos === null
                  ? '—'
                  : formatarCentavos(calculo.custoTotalCentavos)}
              </dd>
              <dt className="text-(--text-subtle)">Taxas fixas por cobrança e assinatura</dt>
              <dd className="text-right tabular-nums">
                {formatarCentavos(calculo.fixosPorCobrancaCentavos)}
              </dd>
              <dt className="text-(--text-subtle)">Margem desejada, sobre o preço de venda</dt>
              <dd className="text-right tabular-nums">
                {formatarPontosBase(orcamento.base.margemDesejadaPb)}
              </dd>
              <dt className="text-(--text-subtle)">Tributos sobre o faturamento</dt>
              <dd className="text-right tabular-nums">
                {formatarPontosBase(orcamento.base.tributosPb)}
              </dd>
              <dt className="text-(--text-subtle)">Taxas percentuais de cobrança</dt>
              <dd className="text-right tabular-nums">
                {formatarPontosBase(orcamento.base.taxasPb)}
              </dd>
              <dt className="text-(--text-subtle)">Hora técnica · custo fixo por hora</dt>
              <dd className="text-right tabular-nums">
                {formatarCentavos(orcamento.base.horaTecnicaCentavos)} ·{' '}
                {formatarCentavos(orcamento.base.custoFixoHoraCentavos)}
              </dd>
            </dl>
          </Recolhido>
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Peças da tela
// ---------------------------------------------------------------------------

function Numero({
  rotulo,
  apoio,
  children,
}: {
  rotulo: string
  apoio?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-(--space-025)">
      <span className="rotulo">{rotulo}</span>
      <span className="text-2xl font-semibold tabular-nums text-(--text)">{children}</span>
      {apoio ? <span className="text-xs text-(--text-subtle)">{apoio}</span> : null}
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="border-b pt-(--space-150)" aria-label={titulo}>
      <h2 className="px-(--space-150) pb-(--space-100) titulo-secao text-(--text)">{titulo}</h2>
      {children}
    </section>
  )
}

function Recolhido({
  titulo,
  resumo,
  children,
}: {
  titulo: string
  resumo: string
  children: ReactNode
}) {
  return (
    <details className="group border-b last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center gap-(--space-100) px-(--space-150) py-(--space-150) corpo text-(--text) hover:bg-(--surface-hover) [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="w-3 text-(--text-subtle) group-open:rotate-45">
          +
        </span>
        <span className="flex-1">{titulo}</span>
        <span className="text-(--text-subtle)">{resumo}</span>
      </summary>
      <div className="px-(--space-150) pb-(--space-200)">{children}</div>
    </details>
  )
}

function CampoNumero({
  rotulo,
  valor,
  invalido,
  desabilitado,
  reais = false,
  aoMudar,
}: {
  rotulo: string
  valor: string
  invalido: boolean
  desabilitado: boolean
  /** Valor em reais: ao sair do campo, formata como "8.900,00". */
  reais?: boolean
  aoMudar: (valor: string) => void
}) {
  return (
    <input
      aria-label={rotulo}
      inputMode="decimal"
      aria-invalid={invalido || undefined}
      className={`${classeCampo} text-right tabular-nums`}
      value={valor}
      disabled={desabilitado}
      onChange={(e) => {
        aoMudar(e.target.value)
      }}
      onBlur={() => {
        // Reais digitados ficam no formato da tela ao sair do campo.
        if (!reais) return
        const centavos = lerReais(valor)
        if (centavos !== null) aoMudar(formatarCentavos(centavos))
      }}
    />
  )
}

function CampoArea({
  id,
  rotulo,
  linhas,
  valor,
  desabilitado,
  aoMudar,
}: {
  id: string
  rotulo: string
  linhas: number
  valor: string
  desabilitado: boolean
  aoMudar: (valor: string) => void
}) {
  return (
    <div className="flex flex-col gap-(--space-050)">
      <label htmlFor={id} className="rotulo">
        {rotulo}
      </label>
      <textarea
        id={id}
        rows={linhas}
        className={`${classeCampo} h-auto min-h-(--size-control) py-(--space-075)`}
        value={valor}
        disabled={desabilitado}
        onChange={(e) => {
          aoMudar(e.target.value)
        }}
      />
    </div>
  )
}
