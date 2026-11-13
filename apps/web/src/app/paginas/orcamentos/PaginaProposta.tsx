import {
  ESCALA_DA_QUANTIDADE,
  diferencaDasParcelas,
  distribuirPorMaiorResto,
  formatarCentavos,
  formatarPontosBase,
  mascararCnpj,
  valorPorFaixas,
} from '@gestao-ambiental/domain'
import { useQuery } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { obterIdentidade } from '@/lib/api/identidade'
import {
  ROTULO_DA_RESPONSABILIDADE,
  obterOrcamento,
  type HoraDeVenda,
  type Orcamento,
} from '@/lib/api/orcamentos'
import { formatarInstanteComoData } from '@/lib/datas'

import { calcularOrcamento } from './calculo'
import { SUFIXO_DA_UNIDADE, numeroComRevisao, textoDaQuantidade, textoDasFaixas } from './comum'

/**
 * /orcamentos/:id/proposta (ORC-05). A proposta como o cliente recebe: serviços com preço, visitas,
 * total, parcelas, o que fica por conta do cliente, prazos, premissas e exclusões. Sem custo,
 * margem, horas, responsáveis nem notas internas. Fora do menu lateral para imprimir limpo;
 * "Imprimir ou salvar PDF" usa a impressão do navegador. Só a Gestão.
 */
export function PaginaProposta() {
  const { atual } = useConsultoria()
  const { id = '' } = useParams()
  const consulta = useQuery({
    queryKey: ['orcamento', id],
    queryFn: () => obterOrcamento(id),
    enabled: atual.papel === 'gestao',
  })

  if (atual.papel !== 'gestao') {
    return (
      <Moldura id={id}>
        <SemPermissao descricao="Orçamentos têm custo e margem: por enquanto, só a gestão acessa." />
      </Moldura>
    )
  }
  if (consulta.isPending) return <Carregando rotulo="Carregando proposta" linhas={8} />
  if (consulta.isError) {
    return (
      <Moldura id={id}>
        <EstadoErro
          titulo="Não foi possível carregar a proposta."
          aoTentarDeNovo={() => void consulta.refetch()}
        />
      </Moldura>
    )
  }
  if (!consulta.data) {
    return (
      <Moldura id={id}>
        <EstadoVazio
          icone="file-text"
          titulo="Orçamento não encontrado"
          descricao="Ele pode ter sido removido, ou você não tem acesso a ele."
        />
      </Moldura>
    )
  }
  return <Proposta orcamento={consulta.data} />
}

/** Barra de cima (não sai na impressão) e o conteúdo. */
function Moldura({ id, acoes, children }: { id: string; acoes?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-(--background) print:bg-white">
      <div className="flex flex-wrap items-center justify-between gap-(--space-100) border-b bg-(--surface) px-(--space-200) py-(--space-100) print:hidden">
        <Link
          to={`/orcamentos/${id}?etapa=parcelas`}
          className="inline-flex items-center gap-(--space-050) corpo-medio text-(--text-link) no-underline hover:underline"
        >
          <Icone nome="arrow-left" />
          Voltar ao orçamento
        </Link>
        {acoes}
      </div>
      <div className="mx-auto flex max-w-[880px] flex-col gap-(--space-200) px-(--space-200) py-(--space-300) print:max-w-none print:p-0">
        {children}
      </div>
    </div>
  )
}

/** O texto, sem espaços nas pontas; vazio ou ausente devolve o padrão. */
function textoOu(texto: string | undefined, padrao: string): string {
  const limpo = texto?.trim() ?? ''
  return limpo === '' ? padrao : limpo
}

function Proposta({ orcamento: o }: { orcamento: Orcamento }) {
  const { atual } = useConsultoria()
  // Dados da consultoria (P8). Sem eles (ou se falhar), a proposta sai só com o nome.
  const consultaIdentidade = useQuery({
    queryKey: ['identidade', atual.consultoriaId],
    queryFn: () => obterIdentidade(atual.consultoriaId),
  })
  const identidade = consultaIdentidade.data ?? null
  // Texto vazio vale como não informado: cai no padrão.
  const apresentacao = textoOu(o.apresentacao, textoOu(identidade?.textoApresentacao, ''))
  const nomeDaConsultoria = textoOu(identidade?.razaoSocial, atual.consultoriaNome)
  const contato = [identidade?.telefone, identidade?.email, identidade?.site].filter(
    (parte): parte is string => Boolean(parte),
  )
  const numero = numeroComRevisao(o.ano, o.sequencia, o.revisao)
  // O título da aba vira o nome sugerido do PDF ao salvar.
  useEffect(() => {
    document.title = `Proposta ${numero} · ${o.empreendimentoNome}`
  }, [numero, o.empreendimentoNome])

  // A pendência sai da mesma regra do editor; os preços são os gravados pelo banco.
  const calculo = calcularOrcamento(
    o.itens.map((i) => ({
      minutos: i.minutos,
      custoDiretoExtraCentavos: i.custoDiretoExtraCentavos,
      horaVendaId: i.horaVendaId,
      responsavelId: i.responsavelId,
      quantidadeDezMilesimos: i.quantidadeDezMilesimos,
      precoFechadoCentavos: i.precoFechadoCentavos,
    })),
    o.visitas,
    o.despesas.filter((d) => d.tratamento === 'incluida').map((d) => d.estimativaCentavos),
    o.parcelas.map((p) => p.percentualPb),
    o.margemPb ?? o.base?.margemDesejadaPb ?? 0,
    o.base,
    o.formaPreco,
  )
  const total = o.itens.reduce((soma, i) => soma + i.precoCentavos, 0) + o.precoVisitasCentavos
  const percentuais = o.parcelas.map((p) => p.percentualPb)
  const parcelasFecham = o.parcelas.length > 0 && diferencaDasParcelas(percentuais) === 0
  const parcelas = parcelasFecham ? distribuirPorMaiorResto(total, percentuais) : []
  const porContaDoCliente = o.despesas.filter((d) => d.tratamento !== 'incluida')
  const pendente = calculo.pendencia !== null

  const avisos: string[] = []
  if (o.excluidoEm) avisos.push('Este orçamento está na lixeira.')
  if (pendente) avisos.push('O preço ainda está pendente: complete o orçamento antes de enviar.')
  if (!pendente && !parcelasFecham)
    avisos.push('As parcelas não fecham 100% do preço: ajuste na etapa Parcelas.')

  return (
    <Moldura
      id={o.id}
      acoes={
        <Botao
          aparencia="primario"
          iconeAntes="printer"
          onClick={() => {
            window.print()
          }}
        >
          Imprimir ou salvar PDF
        </Botao>
      }
    >
      <h1 className="sr-only">{`Proposta ${numero}`}</h1>
      {avisos.length > 0 ? (
        <div className="flex flex-col gap-(--space-100) print:hidden">
          {avisos.map((aviso) => (
            <MensagemSecao key={aviso} tom="atencao">
              {aviso}
            </MensagemSecao>
          ))}
        </div>
      ) : null}

      <article
        aria-label={`Proposta ${numero}`}
        className="flex flex-col gap-(--space-300) rounded-(--radius-large) border bg-(--surface) p-(--space-200) text-(--text) shadow-cartao sm:p-(--space-400) print:rounded-none print:border-0 print:p-0 print:shadow-none"
      >
        <header className="flex flex-wrap items-start justify-between gap-(--space-200) border-b pb-(--space-200)">
          <div className="flex flex-col gap-(--space-050)">
            {identidade?.logoUrl ? (
              <img
                src={identidade.logoUrl}
                alt={`Logo de ${nomeDaConsultoria}`}
                className="mb-(--space-050) h-14 max-w-56 object-contain object-left"
              />
            ) : null}
            <span className="corpo-medio">{nomeDaConsultoria}</span>
            {identidade?.cnpj ? (
              <span className="text-xs text-(--text-subtle)">
                CNPJ {mascararCnpj(identidade.cnpj)}
              </span>
            ) : null}
            {identidade?.endereco ? (
              <span className="text-xs text-(--text-subtle)">{identidade.endereco}</span>
            ) : null}
            {contato.length > 0 ? (
              <span className="text-xs text-(--text-subtle)">{contato.join(' · ')}</span>
            ) : null}
            <h2 className="mt-(--space-100) titulo-tela">Proposta comercial</h2>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-(--space-150) gap-y-(--space-025) text-right corpo">
            <dt className="text-(--text-subtle)">Número</dt>
            <dd className="tabular-nums">{numero}</dd>
            <dt className="text-(--text-subtle)">Data</dt>
            <dd className="tabular-nums">{formatarInstanteComoData(o.atualizadoEm, atual.fuso)}</dd>
            <dt className="text-(--text-subtle)">Validade</dt>
            <dd>{`${String(o.validadeDias)} dias`}</dd>
          </dl>
        </header>

        <section aria-label="Cliente" className="flex flex-col gap-(--space-050)">
          <h3 className="rotulo">Para</h3>
          <p className="corpo-medio">{o.empreendimentoNome}</p>
          {o.prospecto?.cnpj ? (
            <p className="text-(--text-subtle)">CNPJ {mascararCnpj(o.prospecto.cnpj)}</p>
          ) : null}
          {o.destinatario ? <p>A/C {o.destinatario}</p> : null}
        </section>

        {apresentacao ? (
          <section aria-label="Apresentação" className="flex flex-col gap-(--space-050)">
            <p className="whitespace-pre-line">{apresentacao}</p>
          </section>
        ) : null}

        <section aria-label="Objeto" className="flex flex-col gap-(--space-050)">
          <h3 className="rotulo">Objeto</h3>
          <p className="whitespace-pre-line">{o.objeto}</p>
        </section>

        <section aria-label="Serviços e valores" className="flex flex-col gap-(--space-100)">
          <h3 className="rotulo">Serviços e valores</h3>
          {pendente ? (
            <p className="text-(--text-subtle)">Valores a definir.</p>
          ) : (
            <table className="w-full border-collapse corpo">
              <thead>
                <tr className="border-b text-left">
                  <th scope="col" className="py-(--space-075) pr-(--space-150) corpo-medio">
                    Serviço
                  </th>
                  <th scope="col" className="w-40 py-(--space-075) text-right corpo-medio">
                    Valor (R$)
                  </th>
                </tr>
              </thead>
              <tbody>
                {o.itens.map((i) => (
                  <tr key={i.id} className="border-b align-top">
                    <td className="py-(--space-075) pr-(--space-150) whitespace-pre-line">
                      {i.descricao}
                      <DetalheDaUnidade item={i} linhas={o.base?.horasVenda ?? []} />
                      {i.responsabilidadeTecnica ? (
                        <span className="block corpo-medio">
                          Inclui {ROTULO_DA_RESPONSABILIDADE[i.responsabilidadeTecnica]}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-(--space-075) text-right tabular-nums">
                      {formatarCentavos(i.precoCentavos)}
                    </td>
                  </tr>
                ))}
                {o.visitas.quantidade > 0 ? (
                  <tr className="border-b align-top">
                    <td className="py-(--space-075) pr-(--space-150)">
                      {`Visitas técnicas (${String(o.visitas.quantidade)})`}
                    </td>
                    <td className="py-(--space-075) text-right tabular-nums">
                      {formatarCentavos(o.precoVisitasCentavos)}
                    </td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot>
                <tr>
                  <th
                    scope="row"
                    className="py-(--space-100) pr-(--space-150) text-left corpo-medio"
                  >
                    Total
                  </th>
                  <td className="py-(--space-100) text-right text-lg font-semibold tabular-nums">
                    {`R$ ${formatarCentavos(total)}`}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </section>

        {o.parcelas.length > 0 ? (
          <section aria-label="Condições de pagamento" className="flex flex-col gap-(--space-100)">
            <h3 className="rotulo">Condições de pagamento</h3>
            <ol className="flex flex-col gap-(--space-050)">
              {o.parcelas.map((p, indice) => (
                <li key={p.id} className="flex flex-wrap justify-between gap-(--space-100)">
                  <span>
                    {`${String(indice + 1)}. ${p.descricao}`}
                    {p.dias > 0 ? `, ${String(p.dias)} dias após` : ''}
                  </span>
                  <span className="tabular-nums">
                    {formatarPontosBase(p.percentualPb)}
                    {parcelas[indice] !== undefined && !pendente
                      ? ` · R$ ${formatarCentavos(parcelas[indice])}`
                      : ''}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {porContaDoCliente.length > 0 ? (
          <section aria-label="Por conta do cliente" className="flex flex-col gap-(--space-100)">
            <h3 className="rotulo">Por conta do cliente (não incluído no valor)</h3>
            <ul className="flex flex-col gap-(--space-050)">
              {porContaDoCliente.map((d) => (
                <li key={d.id} className="flex flex-wrap justify-between gap-(--space-100)">
                  <span>
                    {d.descricao}
                    <span className="text-(--text-subtle)">
                      {d.tratamento === 'reembolsavel'
                        ? ' · reembolso com comprovante'
                        : ' · pago direto pelo cliente'}
                    </span>
                  </span>
                  <span className="tabular-nums text-(--text-subtle)">
                    {d.estimativaCentavos === null
                      ? 'a cotar'
                      : `estimativa R$ ${formatarCentavos(d.estimativaCentavos)}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {o.prazos ? (
          <section aria-label="Prazos" className="flex flex-col gap-(--space-050)">
            <h3 className="rotulo">Prazos</h3>
            <p className="whitespace-pre-line">{o.prazos}</p>
          </section>
        ) : null}

        <ListaDeTextos titulo="Premissas" itens={o.premissas} />
        <ListaDeTextos titulo="Não incluído nesta proposta" itens={o.exclusoes} />
      </article>
    </Moldura>
  )
}

/**
 * Como o serviço é cobrado, para o cliente: "1.250 m² × R$ 2,00/m²" ou "Pacote". Na hora não
 * aparece nada: horas são internas (ADR-0018).
 */
/**
 * Como o serviço foi cobrado: "12,5 ha × R$ 80,00/ha", "Pacote", ou a quantidade com as faixas
 * (nunca uma média como tarifa). Quando o preço mínimo valeu, diz isso.
 */
function DetalheDaUnidade({
  item,
  linhas,
}: {
  item: Orcamento['itens'][number]
  linhas: readonly HoraDeVenda[]
}) {
  const linha = linhas.find((h) => h.id === item.horaVendaId)
  if (!linha) return null
  if (linha.unidade === 'pacote') {
    return <span className="block text-xs text-(--text-subtle)">Pacote</span>
  }
  const quantidade = item.quantidadeDezMilesimos
  const porFaixas = linha.faixas.length > 0 && linha.unidade !== 'hora'
  // Valor pela tabela, para saber se o mínimo valeu (o banco calcula o mesmo).
  let pelaTabela: number | null = null
  if (linha.unidade === 'hora') pelaTabela = Math.round((item.minutos * linha.valorCentavos) / 60)
  else if (quantidade !== null)
    pelaTabela = porFaixas
      ? valorPorFaixas(quantidade, linha.faixas)
      : Math.round((quantidade * linha.valorCentavos) / ESCALA_DA_QUANTIDADE)
  const minimoValeu =
    linha.minimoCentavos !== null && pelaTabela !== null && pelaTabela < linha.minimoCentavos
  const minimo = minimoValeu ? (
    <span className="block text-xs text-(--text-subtle)">
      Preço mínimo do serviço: R$ {formatarCentavos(linha.minimoCentavos ?? 0)}
    </span>
  ) : null
  if (linha.unidade === 'hora' || quantidade === null) return minimo
  return (
    <>
      <span className="block text-xs text-(--text-subtle) tabular-nums">
        {textoDaQuantidade(quantidade, linha.unidade)}
        {porFaixas ? (
          <> por faixas: {textoDasFaixas(linha.faixas, linha.unidade).join('; ')}</>
        ) : (
          <>
            {' '}
            × R$ {formatarCentavos(linha.valorCentavos)}
            {SUFIXO_DA_UNIDADE[linha.unidade]}
          </>
        )}
      </span>
      {minimo}
    </>
  )
}

function ListaDeTextos({ titulo, itens }: { titulo: string; itens: readonly string[] }) {
  if (itens.length === 0) return null
  return (
    <section aria-label={titulo} className="flex flex-col gap-(--space-050)">
      <h3 className="rotulo">{titulo}</h3>
      <ul className="list-disc flex-col gap-(--space-025) pl-(--space-250)">
        {itens.map((texto) => (
          <li key={texto}>{texto}</li>
        ))}
      </ul>
    </section>
  )
}
