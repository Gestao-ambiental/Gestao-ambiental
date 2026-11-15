import {
  ESCALA_DA_QUANTIDADE,
  datasDaProposta,
  diferencaDasParcelas,
  distribuirPorMaiorResto,
  formatarCentavos,
  formatarDataCivil,
  formatarPontosBase,
  formatarDocumentoDoTitular,
  mascararCnpj,
  rotuloDoDocumentoDoTitular,
  valorPorFaixas,
} from '@gestao-ambiental/domain'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { chaveDoOrcamento, usePrenderTarefa, useTarefas } from '@/app/consultoria/tempo-ativo'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { obterIdentidade } from '@/lib/api/identidade'
import {
  ROTULO_DA_RESPONSABILIDADE,
  obterContratanteDaProposta,
  obterOrcamento,
  type HoraDeVenda,
  type Orcamento,
} from '@/lib/api/orcamentos'

import { calcularOrcamento } from './calculo'
import { SUFIXO_DA_UNIDADE, numeroComRevisao, textoDaQuantidade, textoDasFaixas } from './comum'
import { DialogoMarcarEnviada } from './DialogoMarcarEnviada'
import './proposta.css'

/**
 * /orcamentos/:id/proposta (ORC-05; Protótipo 21, no formato do modelo de proposta da Envora). A
 * proposta como o cliente recebe: quadro de dados, valor total logo de cara, escopo, composição do
 * investimento, condições, premissas e aceite. Sem custo, margem, horas, responsáveis nem notas
 * internas. Fora do menu lateral para imprimir limpo; "Imprimir ou salvar PDF" usa a impressão do
 * navegador. Rascunho sai marcado como RASCUNHO na tela e em cada página impressa. Só a Gestão.
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
    <div className="min-h-dvh bg-(--background) print:min-h-0 print:bg-[#fff]">
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-(--space-100) border-b bg-(--surface) px-(--space-200) py-(--space-100) print:hidden">
        <Link
          to={`/orcamentos/${id}?etapa=parcelas`}
          className="inline-flex items-center gap-(--space-050) corpo-medio text-(--text-link) no-underline hover:underline"
        >
          <Icone nome="arrow-left" />
          Voltar ao orçamento
        </Link>
        {acoes ? <div className="flex flex-wrap gap-(--space-100)">{acoes}</div> : null}
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

/** Texto como string do CSS (para `content` do @page): sem quebrar a regra nem a tag <style>. */
function textoCss(texto: string): string {
  const limpo = texto
    .replace(/[\r\n]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/</g, '\\3c ')
    .replace(/>/g, '\\3e ')
  return `"${limpo}"`
}

/**
 * Caixas de margem da página impressa (Chrome/Edge/Brave 131+): no rodapé, o número do orçamento,
 * a consultoria com os contatos e "Página X de Y"; do alto da segunda página em diante, a
 * consultoria e "PROPOSTA COMERCIAL"; no rascunho, "RASCUNHO" no alto de todas.
 */
function estiloDaPagina(numero: string, rodape: string, nome: string, rascunho: boolean): string {
  const caixa = 'font-family: system-ui, sans-serif; font-size: 8pt; color: #4d4d4d;'
  return `
@page {
  size: A4;
  margin: 16mm 15mm 18mm;
  @bottom-left { content: ${textoCss(`Orçamento nº ${numero}`)}; ${caixa} }
  @bottom-center { content: ${textoCss(rodape)}; ${caixa} text-align: center; }
  @bottom-right { content: "Página " counter(page) " de " counter(pages); ${caixa} }
  @top-left { content: ${textoCss(nome)}; ${caixa} }
  @top-right { content: "PROPOSTA COMERCIAL"; ${caixa} font-weight: 600; letter-spacing: 0.05em; }
  ${rascunho ? `@top-center { content: "RASCUNHO"; ${caixa} font-size: 10pt; font-weight: 700; color: #000; letter-spacing: 0.2em; }` : ''}
}
@page :first {
  @top-left { content: none; }
  @top-right { content: none; }
}
@media print {
  html, body { background: #fff !important; }
}`
}

function Proposta({ orcamento: o }: { orcamento: Orcamento }) {
  const { atual } = useConsultoria()
  const queryClient = useQueryClient()
  const [marcando, setMarcando] = useState(false)
  const [marcada, setMarcada] = useState(false)
  // Tempo ativo do orçamento (ADR-0027): termina ao imprimir/salvar o PDF ou marcar como enviada.
  const tarefas = useTarefas()
  usePrenderTarefa(chaveDoOrcamento(o.id))
  // Dados da consultoria (P8). Sem eles (ou se falhar), a proposta sai só com o nome.
  const consultaIdentidade = useQuery({
    queryKey: ['identidade', atual.consultoriaId],
    queryFn: () => obterIdentidade(atual.consultoriaId),
  })
  // Cliente contratante, CNPJ e unidade do empreendimento. Se falhar, a proposta sai sem eles.
  const consultaContratante = useQuery({
    queryKey: ['proposta-contratante', o.id],
    queryFn: () => obterContratanteDaProposta(o.id),
    enabled: o.empreendimentoId !== null,
  })
  const identidade = consultaIdentidade.data ?? null
  const contratante = consultaContratante.data ?? null
  // Texto vazio vale como não informado: cai no padrão.
  const apresentacao = textoOu(o.apresentacao, textoOu(identidade?.textoApresentacao, ''))
  const nomeDaConsultoria = textoOu(identidade?.razaoSocial, atual.consultoriaNome)
  const contatos = [
    identidade?.email ? `E-mail: ${identidade.email}` : null,
    identidade?.telefone ? `Telefone: ${identidade.telefone}` : null,
    identidade?.site ? `Site: ${identidade.site}` : null,
  ].filter((parte): parte is string => parte !== null)
  const numero = numeroComRevisao(o.ano, o.sequencia, o.revisao)
  const rascunho = o.situacao === 'rascunho'
  // O título da aba vira o nome sugerido do PDF ao salvar.
  useEffect(() => {
    document.title = `Proposta ${numero}${rascunho ? ' (rascunho)' : ''} · ${o.empreendimentoNome}`
  }, [numero, rascunho, o.empreendimentoNome])

  // Data da proposta: a do envio (rascunho: hoje), no fuso da consultoria.
  const datas = datasDaProposta({
    situacao: o.situacao,
    revisao: o.revisao,
    historico: o.historicoSituacao,
    validadeDias: o.validadeDias,
    agora: new Date(),
    fuso: atual.fuso,
  })
  const dataDaProposta = formatarDataCivil(datas.data)
  const validaAte = formatarDataCivil(datas.validaAte)

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
  const linhas = o.base?.horasVenda ?? []

  // Quadro de dados. Sem cliente contratante, quem contrata é o próprio empreendimento.
  const cliente = contratante?.clienteNome ?? o.empreendimentoNome
  const cnpj = contratante?.empreendimentoCnpj ?? o.prospecto?.cnpj ?? null
  const unidade = contratante?.unidades.length === 1 ? contratante.unidades[0] : undefined
  const abrangencia = [
    contratante?.clienteNome && contratante.empreendimentoNome !== contratante.clienteNome
      ? contratante.empreendimentoNome
      : null,
    unidade ? `Unidade ${unidade.nome}${unidade.endereco ? `, ${unidade.endereco}` : ''}` : null,
  ].filter((parte): parte is string => parte !== null)
  const contatoDoCliente = [o.prospecto?.email, o.prospecto?.telefone].filter(
    (parte): parte is string => Boolean(parte),
  )
  const aosCuidados = o.destinatario.trim() === '' ? (o.prospecto?.contato ?? '') : o.destinatario

  const avisos: string[] = []
  if (o.excluidoEm) avisos.push('Este orçamento está na lixeira.')
  if (pendente) avisos.push('O preço ainda está pendente: complete o orçamento antes de enviar.')
  if (!pendente && !parcelasFecham)
    avisos.push('As parcelas não fecham 100% do preço: ajuste na etapa Parcelas.')

  const formaDePagamento =
    o.parcelas.length === 0
      ? ''
      : o.parcelas.length > 1
        ? `em ${String(o.parcelas.length)} parcelas`
        : o.parcelas[0]?.dias === 0
          ? 'à vista'
          : 'em parcela única'

  // Seções numeradas como no modelo; as que não têm conteúdo saem e a numeração segue.
  const temEscopo = o.itens.length > 0
  const temPremissas = o.premissas.length + o.exclusoes.length > 0
  let proxima = 0
  const n = () => String(++proxima)
  const nObjeto = n()
  const nEscopo = temEscopo ? n() : ''
  const nInvestimento = n()
  const nCondicoes = n()
  const nPremissas = temPremissas ? n() : ''
  const nAceite = n()

  return (
    <Moldura
      id={o.id}
      acoes={
        <>
          {rascunho && !o.excluidoEm ? (
            <Botao
              iconeAntes="send"
              onClick={() => {
                setMarcando(true)
              }}
            >
              Marcar como enviada
            </Botao>
          ) : null}
          <Botao
            aparencia="primario"
            iconeAntes="printer"
            onClick={() => {
              tarefas.concluir(chaveDoOrcamento(o.id), 'orcamento', 1)
              window.print()
            }}
          >
            Imprimir ou salvar PDF
          </Botao>
        </>
      }
    >
      <style>
        {estiloDaPagina(
          numero,
          [nomeDaConsultoria, ...contatos].join(' | '),
          nomeDaConsultoria,
          rascunho,
        )}
      </style>
      {rascunho ? (
        <div className="proposta-marca-dagua" aria-hidden="true">
          <span>RASCUNHO</span>
        </div>
      ) : null}
      <h1 className="sr-only">{`Proposta ${numero}`}</h1>
      {marcada && !rascunho ? (
        <MensagemSecao role="status" tom="sucesso" className="print:hidden">
          {`Proposta marcada como enviada em ${dataDaProposta}.`}
        </MensagemSecao>
      ) : null}
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
        className="proposta-folha relative flex flex-col gap-(--space-250) rounded-(--radius-large) border bg-(--surface) p-(--space-200) corpo text-(--text) shadow-cartao sm:p-(--space-400) print:rounded-none print:border-0 print:p-0 print:shadow-none"
      >
        {rascunho ? (
          <p className="flex flex-wrap items-center gap-x-(--space-100) rounded-(--radius) border-2 border-(--lozenge-warning-border) bg-(--lozenge-warning-bg) px-(--space-150) py-(--space-100) text-(--text) print:border-[#000] print:bg-[#fff]">
            <Icone nome="triangle-alert" className="text-(--lozenge-warning-text) print:hidden" />
            <strong className="tracking-[0.2em]">RASCUNHO</strong>
            <span>Não envie esta versão ao cliente como final.</span>
          </p>
        ) : null}

        <header className="flex flex-wrap items-start justify-between gap-(--space-200)">
          <div className="flex flex-col gap-(--space-050)">
            {identidade?.logoUrl ? (
              <img
                src={identidade.logoUrl}
                alt={`Logo de ${nomeDaConsultoria}`}
                className="h-14 max-w-56 object-contain object-left"
              />
            ) : (
              <span className="titulo-secao">{nomeDaConsultoria}</span>
            )}
            <span className="text-xs tracking-wide text-(--text-subtle) uppercase tabular-nums">
              {`Orçamento nº ${numero}`}
            </span>
          </div>
          <span className="corpo-medio tracking-[0.08em] [font-variant:small-caps]">
            Proposta comercial
          </span>
        </header>

        <div className="flex flex-col items-center gap-(--space-050) text-center">
          <h2 className="text-xl font-bold tracking-wide uppercase">
            Proposta técnica e comercial
          </h2>
          <p className="corpo-medio uppercase">{o.objeto}</p>
        </div>

        <section aria-label="Dados da proposta">
          <table className="proposta-tabela">
            <tbody>
              <LinhaDoQuadro rotulo="Cliente">{cliente}</LinhaDoQuadro>
              {cnpj ? (
                <LinhaDoQuadro rotulo={rotuloDoDocumentoDoTitular(cnpj)}>
                  {formatarDocumentoDoTitular(cnpj)}
                </LinhaDoQuadro>
              ) : null}
              {aosCuidados || contatoDoCliente.length > 0 ? (
                <LinhaDoQuadro rotulo="Contato">
                  {aosCuidados ? <span className="block">{`A/C ${aosCuidados}`}</span> : null}
                  {contatoDoCliente.length > 0 ? (
                    <span className="block">{contatoDoCliente.join(' · ')}</span>
                  ) : null}
                </LinhaDoQuadro>
              ) : null}
              {abrangencia.length > 0 ? (
                <LinhaDoQuadro rotulo="Abrangência">{abrangencia.join(' · ')}</LinhaDoQuadro>
              ) : null}
              <LinhaDoQuadro rotulo="Serviço">{o.objeto}</LinhaDoQuadro>
              <LinhaDoQuadro rotulo="Data">{dataDaProposta}</LinhaDoQuadro>
              <LinhaDoQuadro rotulo="Validade">
                {`${String(o.validadeDias)} dias corridos, até ${validaAte}`}
              </LinhaDoQuadro>
            </tbody>
          </table>
        </section>

        <section
          aria-label="Valor total"
          className="proposta-sem-quebra flex flex-wrap items-baseline justify-between gap-x-(--space-200) gap-y-(--space-050) rounded-(--radius) border-2 border-(--proposta-rotulo-fundo) px-(--space-200) py-(--space-150)"
        >
          <span className="corpo-medio uppercase">Valor total da proposta</span>
          <span className="flex flex-wrap items-baseline gap-x-(--space-100)">
            <strong className="text-2xl font-bold tabular-nums">
              {pendente ? 'A definir' : `R$ ${formatarCentavos(total)}`}
            </strong>
            {!pendente && formaDePagamento ? <span>{formaDePagamento}</span> : null}
          </span>
        </section>

        <Secao numero={nObjeto} titulo="Objeto da proposta">
          {apresentacao ? <p className="whitespace-pre-line">{apresentacao}</p> : null}
          <p className="whitespace-pre-line">{o.objeto}</p>
        </Secao>

        {temEscopo ? (
          <Secao numero={nEscopo} titulo="Escopo e prazos de entrega">
            <RegiaoDaTabela rotulo="Tabela de escopo e prazos">
              <table className="proposta-tabela min-w-[32rem] print:min-w-0">
                <thead>
                  <tr>
                    <th scope="col" className="w-16 text-center">
                      Etapa
                    </th>
                    <th scope="col">Descrição</th>
                    <th scope="col" className="w-48">
                      Prazo
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {o.itens.map((i, indice) => (
                    <tr key={i.id}>
                      <td className="text-center tabular-nums">{doisDigitos(indice + 1)}</td>
                      <td className="whitespace-pre-line">{i.descricao}</td>
                      {o.prazos ? (
                        indice === 0 ? (
                          <td rowSpan={o.itens.length} className="whitespace-pre-line">
                            {o.prazos}
                          </td>
                        ) : null
                      ) : (
                        <td>—</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </RegiaoDaTabela>
            {o.prazos ? (
              <p className="text-xs text-(--text-subtle) italic">
                Os prazos são contados após o recebimento integral das informações e documentos
                necessários.
              </p>
            ) : null}
          </Secao>
        ) : null}

        <Secao numero={nInvestimento} titulo="Composição do investimento">
          {pendente ? (
            <p>Valores a definir.</p>
          ) : (
            <RegiaoDaTabela rotulo="Tabela do investimento">
              <table className="proposta-tabela min-w-[40rem] print:min-w-0">
                <thead>
                  <tr>
                    <th scope="col" className="w-14 text-center">
                      Item
                    </th>
                    <th scope="col">Descrição</th>
                    <th scope="col" className="w-28 text-right">
                      Qtd.
                    </th>
                    <th scope="col" className="w-32 text-right">
                      Valor unit.
                    </th>
                    <th scope="col" className="w-32 text-right">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {o.itens.map((i, indice) => {
                    const colunas = colunasDoItem(i, linhas)
                    return (
                      <tr key={i.id}>
                        <td className="text-center tabular-nums">{doisDigitos(indice + 1)}</td>
                        <td>
                          <span className="block whitespace-pre-line">{i.descricao}</span>
                          {colunas.apoio.map((texto) => (
                            <span key={texto} className="block text-xs text-(--text-subtle)">
                              {texto}
                            </span>
                          ))}
                          {i.responsabilidadeTecnica ? (
                            <span className="block corpo-medio">
                              Inclui {ROTULO_DA_RESPONSABILIDADE[i.responsabilidadeTecnica]}
                            </span>
                          ) : null}
                        </td>
                        <td className="text-right tabular-nums">{colunas.quantidade}</td>
                        <td className="text-right tabular-nums">{colunas.unitario}</td>
                        <td className="text-right tabular-nums">
                          {`R$ ${formatarCentavos(i.precoCentavos)}`}
                        </td>
                      </tr>
                    )
                  })}
                  {o.visitas.quantidade > 0 ? (
                    <tr>
                      <td className="text-center tabular-nums">
                        {doisDigitos(o.itens.length + 1)}
                      </td>
                      <td>Visitas técnicas</td>
                      <td className="text-right tabular-nums">
                        {o.visitas.quantidade === 1
                          ? '1 visita'
                          : `${String(o.visitas.quantidade)} visitas`}
                      </td>
                      <td className="text-right tabular-nums">
                        {o.precoVisitasCentavos % o.visitas.quantidade === 0
                          ? `R$ ${formatarCentavos(o.precoVisitasCentavos / o.visitas.quantidade)}`
                          : '—'}
                      </td>
                      <td className="text-right tabular-nums">
                        {`R$ ${formatarCentavos(o.precoVisitasCentavos)}`}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={4} className="uppercase">
                      Valor total da proposta
                    </th>
                    <td className="text-right text-lg font-bold tabular-nums">
                      {`R$ ${formatarCentavos(total)}`}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </RegiaoDaTabela>
          )}
        </Secao>

        <Secao numero={nCondicoes} titulo="Condições comerciais">
          <table className="proposta-tabela">
            <tbody>
              {o.parcelas.length > 0 ? (
                <LinhaDoQuadro rotulo="Pagamento">
                  <ol className="flex flex-col gap-(--space-050)">
                    {o.parcelas.map((p, indice) => (
                      <li key={p.id} className="flex flex-wrap justify-between gap-x-(--space-100)">
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
                </LinhaDoQuadro>
              ) : null}
              <LinhaDoQuadro rotulo="Tributos">Inclusos no valor.</LinhaDoQuadro>
              {porContaDoCliente.length > 0 ? (
                <LinhaDoQuadro rotulo="Por conta do cliente">
                  <ul className="flex flex-col gap-(--space-050)">
                    {porContaDoCliente.map((d) => (
                      <li key={d.id} className="flex flex-wrap justify-between gap-x-(--space-100)">
                        <span>
                          <span>{d.descricao}</span>
                          {d.tratamento === 'reembolsavel'
                            ? ' · reembolso com comprovante'
                            : ' · pago direto pelo cliente'}
                        </span>
                        <span className="tabular-nums">
                          {d.estimativaCentavos === null
                            ? 'a cotar'
                            : `estimativa R$ ${formatarCentavos(d.estimativaCentavos)}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </LinhaDoQuadro>
              ) : null}
              <LinhaDoQuadro rotulo="Serviços adicionais">
                Serviços fora do escopo dependem de orçamento complementar aprovado antes da
                execução.
              </LinhaDoQuadro>
              <LinhaDoQuadro rotulo="Validade">
                {`${String(o.validadeDias)} dias corridos a partir de ${dataDaProposta}, até ${validaAte}.`}
              </LinhaDoQuadro>
            </tbody>
          </table>
        </Secao>

        {temPremissas ? (
          <Secao numero={nPremissas} titulo="Premissas e responsabilidades">
            <ol className="flex list-decimal flex-col gap-(--space-025) pl-(--space-250)">
              {o.premissas.map((texto) => (
                <li key={`p-${texto}`}>{texto}</li>
              ))}
              {o.exclusoes.map((texto) => (
                <li key={`e-${texto}`}>{`Não incluído nesta proposta: ${texto}`}</li>
              ))}
            </ol>
          </Secao>
        ) : null}

        <Secao numero={nAceite} titulo="Aceite" semQuebra>
          <p>
            O aceite formal confirma a concordância com o escopo, os valores, as premissas e as
            condições desta proposta.
          </p>
          <div className="grid gap-(--space-300) pt-(--space-200) sm:grid-cols-2 print:grid-cols-2">
            <Assinatura titulo="Cliente" nome="Nome" />
            <Assinatura titulo={nomeDaConsultoria} nome={nomeDaConsultoria} />
          </div>
        </Secao>

        <footer className="proposta-sem-quebra flex flex-col items-center gap-(--space-025) border-t pt-(--space-150) text-center text-xs text-(--text-subtle)">
          <span className="corpo-medio text-(--text)">{nomeDaConsultoria}</span>
          {identidade?.cnpj || identidade?.endereco ? (
            <span>
              {[identidade.cnpj ? `CNPJ ${mascararCnpj(identidade.cnpj)}` : '', identidade.endereco]
                .filter(Boolean)
                .join(' · ')}
            </span>
          ) : null}
          {contatos.length > 0 ? <span>{contatos.join(' | ')}</span> : null}
        </footer>
      </article>

      <DialogoMarcarEnviada
        orcamento={o}
        aberto={marcando}
        aoMudarAberto={setMarcando}
        aoMarcar={() => {
          tarefas.concluir(chaveDoOrcamento(o.id), 'orcamento', 1)
          setMarcada(true)
          void queryClient.invalidateQueries({ queryKey: ['orcamento', o.id] })
          void queryClient.invalidateQueries({ queryKey: ['orcamentos'] })
        }}
      />
    </Moldura>
  )
}

function doisDigitos(numero: number): string {
  return String(numero).padStart(2, '0')
}

function Secao({
  numero,
  titulo,
  semQuebra = false,
  children,
}: {
  numero: string
  titulo: string
  semQuebra?: boolean
  children: ReactNode
}) {
  return (
    <section
      aria-label={titulo}
      className={`proposta-secao flex flex-col gap-(--space-100)${semQuebra ? ' proposta-sem-quebra' : ''}`}
    >
      <h3 className="titulo-secao">{`${numero} ${titulo}`}</h3>
      {children}
    </section>
  )
}

/** Linha de tabela de duas colunas: rótulo (fundo da marca) e valor. */
function LinhaDoQuadro({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <tr>
      <th scope="row">{rotulo}</th>
      <td>{children}</td>
    </tr>
  )
}

/** Tabela larga rola na própria região no celular; na impressão, cabe na página. */
function RegiaoDaTabela({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label={rotulo}
      // Região que rola no celular: precisa receber foco para rolar pelo teclado (WCAG 2.1.1).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      className="overflow-x-auto rounded-(--radius) focus-visible:outline-2 focus-visible:outline-(--border-focus) print:overflow-visible"
    >
      {children}
    </div>
  )
}

function Assinatura({ titulo, nome }: { titulo: string; nome: string }) {
  return (
    <div className="flex flex-col gap-(--space-075)">
      <span className="corpo-medio uppercase">{titulo}</span>
      <span className="mt-(--space-500) border-t border-(--text)" aria-hidden="true" />
      <span className="text-center">{nome}</span>
      <span className="text-center">Data: ____/____/________</span>
    </div>
  )
}

/**
 * Qtd. e valor unitário do serviço para o cliente. Hora: "1 serviço" e o preço do serviço, porque
 * horas são internas (ADR-0018) e assim toda linha fecha Qtd. × Valor unit. = Total. Pacote:
 * "1 pacote". m², ha, diária e campanha: a quantidade e a tarifa; por faixas, a quantidade com as
 * faixas na linha de apoio (nunca uma média como tarifa). Quando o preço mínimo valeu, diz isso.
 */
function colunasDoItem(
  item: Orcamento['itens'][number],
  linhas: readonly HoraDeVenda[],
): { quantidade: string; unitario: string; apoio: string[] } {
  const preco = `R$ ${formatarCentavos(item.precoCentavos)}`
  const linha = linhas.find((h) => h.id === item.horaVendaId)
  if (!linha || linha.unidade === 'hora') {
    return { quantidade: '1 serviço', unitario: preco, apoio: apoioDoMinimo(item, linha) }
  }
  if (linha.unidade === 'pacote') return { quantidade: '1 pacote', unitario: preco, apoio: [] }
  const quantidade = item.quantidadeDezMilesimos
  if (quantidade === null) return { quantidade: '—', unitario: '—', apoio: [] }
  const qtd = textoDaQuantidade(quantidade, linha.unidade)
  const apoio = apoioDoMinimo(item, linha)
  if (linha.faixas.length > 0) {
    return {
      quantidade: qtd,
      unitario: 'por faixas',
      apoio: [`Faixas: ${textoDasFaixas(linha.faixas, linha.unidade).join('; ')}`, ...apoio],
    }
  }
  return {
    quantidade: qtd,
    unitario: `R$ ${formatarCentavos(linha.valorCentavos)}${SUFIXO_DA_UNIDADE[linha.unidade]}`,
    apoio,
  }
}

/** "Preço mínimo do serviço: R$ X" quando a tabela daria menos que o mínimo (o banco faz igual). */
function apoioDoMinimo(item: Orcamento['itens'][number], linha: HoraDeVenda | undefined): string[] {
  if (linha?.minimoCentavos == null) return []
  const quantidade = item.quantidadeDezMilesimos
  let pelaTabela: number | null = null
  if (linha.unidade === 'hora') pelaTabela = Math.round((item.minutos * linha.valorCentavos) / 60)
  else if (quantidade !== null)
    pelaTabela =
      linha.faixas.length > 0
        ? valorPorFaixas(quantidade, linha.faixas)
        : Math.round((quantidade * linha.valorCentavos) / ESCALA_DA_QUANTIDADE)
  return pelaTabela !== null && pelaTabela < linha.minimoCentavos
    ? [`Preço mínimo do serviço: R$ ${formatarCentavos(linha.minimoCentavos)}`]
    : []
}
