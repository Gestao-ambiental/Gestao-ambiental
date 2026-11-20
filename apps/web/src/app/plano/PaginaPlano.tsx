import {
  CODIGOS_DE_PLANO,
  RECURSOS_DO_PLANO,
  ROTULO_DO_RECURSO,
  ROTULO_DA_FORMA,
  ROTULO_DO_CICLO,
  adicionaisDoUso,
  equivalenteMensal,
  formatarDataCivil,
  formatarReais,
  mascararDocumento,
  tipoDoDocumento,
  valorDoCiclo,
  type CatalogoComercial,
  type CicloDoPlano,
  type CodigoPlano,
  type DataCivil,
  type FormaDePagamento,
} from '@gestao-ambiental/domain'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type SyntheticEvent, type ReactNode } from 'react'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { PaginaDeConfiguracoes } from '@/app/paginas/configuracoes/PaginaDeConfiguracoes'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { classeRadio } from '@/components/ui/caixa-selecao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { ItemDoPlacar, Placar } from '@/components/ui/placar'
import { Segmentado, type OpcaoSegmentada } from '@/components/ui/segmentado'
import { Selo } from '@/components/ui/selo'
import {
  ROTULO_DA_COBRANCA,
  TAMANHO_PAGINA_COBRANCAS,
  assinarPlanoSimulado,
  cancelarPlanoSimulado,
  listarCobrancas,
  type Cobranca,
  type DadosComerciais,
} from '@/lib/api/plano'
import { ehSemPermissao, mensagemDoErro } from '@/lib/erros'
import { cn } from '@/lib/utils'

import { useCatalogoComercial } from './catalogo'
import {
  CHAVE_COBRANCAS,
  CHAVE_SITUACAO_COMERCIAL,
  PAGAMENTO_PELO_SUPORTE,
  TOM_DA_SITUACAO_COMERCIAL,
  rotuloDaSituacao,
  useDadosComerciais,
} from './situacao'

// Quadro (DESIGN.md): cabeçalho em maiúsculas, linhas de 48px com regra leve, número tabular.
const classeCabecalho =
  'h-10 border-b px-(--e-3) text-left rotulo-maiusculo whitespace-nowrap text-(--tinta-2)'
const classeCelula =
  'h-(--linha) border-b border-(--regra-leve) px-(--e-3) align-middle whitespace-nowrap'

function Secao({
  titulo,
  children,
  acao,
}: {
  titulo: string
  children: ReactNode
  acao?: ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-(--e-3)">
      <div className="flex flex-wrap items-center justify-between gap-(--e-2)">
        <h2 id={id} className="titulo-secao text-(--tinta)">
          {titulo}
        </h2>
        {acao}
      </div>
      {children}
    </section>
  )
}

const CICLOS: readonly OpcaoSegmentada<CicloDoPlano>[] = (['mensal', 'anual'] as const).map(
  (c) => ({ valor: c, rotulo: ROTULO_DO_CICLO[c] }),
)

function valorDoPlanoNoCiclo(
  plano: CodigoPlano,
  ciclo: CicloDoPlano,
  catalogo: CatalogoComercial,
): string {
  return ciclo === 'anual'
    ? `${formatarReais(valorDoCiclo(plano, 'anual', catalogo))} por ano`
    : `${formatarReais(valorDoCiclo(plano, 'mensal', catalogo))} por mês`
}

function SituacaoEUso({
  dados,
  catalogo,
}: {
  dados: DadosComerciais
  catalogo: CatalogoComercial
}) {
  const s = dados.situacao
  const a = dados.assinatura
  const plano = s.planoVigente
  const ciclo = s.cicloVigente
  const adicionais = adicionaisDoUso(
    { pessoas: dados.uso.pessoas, empreendimentos: dados.uso.empreendimentos },
    s.limites,
    catalogo,
  )
  const descricao =
    s.situacao === 'contrato' && plano
      ? `${catalogo.planos[plano].nome} por contrato · ${
          dados.contrato?.ate ? `até ${formatarDataCivil(dados.contrato.ate)}` : 'sem prazo'
        }`
      : plano && ciclo
        ? `${catalogo.planos[plano].nome} · ${ROTULO_DO_CICLO[ciclo]}${a?.forma ? ` · ${ROTULO_DA_FORMA[a.forma]}` : ''}`
        : 'Sem plano'
  const mudanca =
    a?.mudancaEm && a.mudancaEm > dados.hoje && (a.planoAgendado || a.cicloAgendado)
      ? `${catalogo.planos[a.planoAgendado ?? a.plano].nome} · ${ROTULO_DO_CICLO[a.cicloAgendado ?? a.ciclo]} a partir de ${formatarDataCivil(a.mudancaEm)}`
      : null

  return (
    <section
      aria-label="Plano atual"
      className="flex flex-col overflow-hidden rounded-(--raio-painel) border bg-(--folha)"
    >
      <div className="flex flex-col gap-(--e-2) border-b px-(--e-5) py-(--e-4)">
        <span className="rotulo">Plano atual</span>
        <div className="flex flex-wrap items-center gap-x-(--e-3) gap-y-(--e-1)">
          <h2 className="titulo-painel text-(--tinta) numero">{descricao}</h2>
          <Selo tom={TOM_DA_SITUACAO_COMERCIAL[s.situacao]}>{rotuloDaSituacao(s)}</Selo>
        </div>
        {mudanca ? (
          <p className="corpo numero">
            <span className="corpo-medio">Mudança agendada:</span> {mudanca}
          </p>
        ) : null}
        {a?.validaAte ? (
          <p className="corpo numero text-(--alerta-texto)">
            <span className="corpo-medio">Assinatura cancelada:</span> vale até{' '}
            {formatarDataCivil(a.validaAte)}
          </p>
        ) : null}
      </div>
      <Placar rotulo="Uso e valores" tamanho="compacto" moldura={false}>
        <ItemDoPlacar
          rotulo="Pessoas"
          valor={
            s.limites
              ? `${String(dados.uso.pessoas)} de ${String(s.limites.pessoas)}`
              : String(dados.uso.pessoas)
          }
        />
        <ItemDoPlacar
          rotulo="Empreendimentos ativos"
          valor={
            s.limites
              ? `${String(dados.uso.empreendimentos)} de ${String(s.limites.empreendimentos)}`
              : String(dados.uso.empreendimentos)
          }
        />
        {dados.proximoVencimento && !a?.validaAte ? (
          <ItemDoPlacar
            rotulo="Próximo vencimento"
            valor={formatarDataCivil(dados.proximoVencimento)}
          />
        ) : null}
        {s.limites ? (
          <ItemDoPlacar
            rotulo="Adicionais por mês"
            valor={formatarReais(adicionais.valorCentavos)}
          />
        ) : null}
        {plano && ciclo && s.limites ? (
          <ItemDoPlacar
            rotulo={ciclo === 'anual' ? 'Valor mensal equivalente' : 'Valor mensal'}
            valor={formatarReais(
              equivalenteMensal(plano, ciclo, catalogo) + adicionais.valorCentavos,
            )}
          />
        ) : null}
      </Placar>
    </section>
  )
}

function OpcaoDePlano({
  plano,
  ciclo,
  escolhido,
  atual,
  aoEscolher,
  nome,
  catalogo,
}: {
  plano: CodigoPlano
  ciclo: CicloDoPlano
  escolhido: boolean
  /** É o plano assinado hoje. */
  atual: boolean
  aoEscolher: () => void
  nome: string
  catalogo: CatalogoComercial
}) {
  const p = catalogo.planos[plano]
  const inclui: { texto: string; tem: boolean }[] = [
    {
      texto: p.orcamentos ? 'Orçamentos, aprovação e tarefas' : 'Sem orçamentos',
      tem: p.orcamentos,
    },
    { texto: p.ia ? 'Leitura da licença por IA' : 'Sem leitura por IA', tem: p.ia },
    ...RECURSOS_DO_PLANO.filter((r) => p.recursos.includes(r)).map((r) => ({
      texto: ROTULO_DO_RECURSO[r],
      tem: true,
    })),
  ]
  // Escolha exclusiva: rádio visível ao lado do nome; o cartão escolhido ganha a borda verde.
  // O nome acessível é só o do plano; o preço e o que inclui entram como descrição.
  const id = useId()
  return (
    <label
      className={cn(
        'flex cursor-pointer flex-col gap-(--e-3) rounded-(--raio-painel) border bg-(--folha) p-(--e-4) transicao-estado hover:border-(--regra-forte)',
        'has-checked:border-(--marca-linha) has-checked:bg-(--escolha) has-checked:shadow-[inset_0_0_0_1px_var(--marca-linha)]',
      )}
    >
      <span className="flex items-start gap-(--e-2)">
        <input
          type="radio"
          name={nome}
          value={plano}
          checked={escolhido}
          onChange={aoEscolher}
          aria-labelledby={`${id}-nome`}
          aria-describedby={`${id}-preco ${id}-inclui`}
          className={cn(classeRadio, 'mt-[3px]')}
        />
        <span className="flex min-w-0 flex-col gap-(--e-05)">
          <span className="flex flex-wrap items-center gap-(--e-2)">
            <span id={`${id}-nome`} className="titulo-secao text-(--tinta)">
              {p.nome}
            </span>
            {atual ? <Selo tom="sucesso">Atual</Selo> : null}
          </span>
          <span className="rotulo numero">
            {p.pessoas} pessoas · {p.empreendimentos} empreendimentos ativos
          </span>
        </span>
      </span>
      <span id={`${id}-preco`} className="flex flex-col gap-(--e-05)">
        <span className="titulo-painel text-(--tinta) numero">
          {valorDoPlanoNoCiclo(plano, ciclo, catalogo)}
        </span>
        {ciclo === 'anual' ? (
          <span className="rotulo numero">
            {catalogo.configuracao.mensalidadesNoAnual} mensalidades, pago de uma vez
          </span>
        ) : null}
      </span>
      <ul
        id={`${id}-inclui`}
        aria-label={`O que o ${p.nome} inclui`}
        className="flex flex-col gap-(--e-05) border-t border-(--regra-leve) pt-(--e-2)"
      >
        {inclui.map((item) => (
          <li
            key={item.texto}
            className={cn(
              'flex items-center gap-(--e-15) text-xs leading-4 font-[650]',
              item.tem ? 'text-(--tinta)' : 'text-(--tinta-3)',
            )}
          >
            <Icone
              nome={item.tem ? 'check' : 'minus'}
              tamanho={12}
              className={item.tem ? 'text-(--ok-texto)' : 'text-(--tinta-3)'}
            />
            {item.texto}
          </li>
        ))}
      </ul>
    </label>
  )
}

function EscolhaDePlano({
  dados,
  catalogo,
}: {
  dados: DadosComerciais
  catalogo: CatalogoComercial
}) {
  const { atual } = useConsultoria()
  const queryClient = useQueryClient()
  const ativa = dados.assinatura !== null && dados.assinatura.validaAte === null
  const [plano, setPlano] = useState<CodigoPlano>(dados.assinatura?.plano ?? 'equipe')
  const [ciclo, setCiclo] = useState<CicloDoPlano>(dados.assinatura?.ciclo ?? 'mensal')
  const [forma, setForma] = useState<FormaDePagamento>(dados.assinatura?.forma ?? 'pix')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  // Protótipo: o documento só existe neste estado em memória, é validado e descartado. Não vai para
  // o banco, para o armazenamento do navegador nem para o log.
  const [documento, setDocumento] = useState('')
  const [erros, setErros] = useState<{ nome?: string; email?: string; documento?: string }>({})
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false)
  const nomeDoGrupo = useId()
  const nomeDaForma = useId()

  const atualizar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: [CHAVE_SITUACAO_COMERCIAL] }),
      queryClient.invalidateQueries({ queryKey: [CHAVE_COBRANCAS] }),
    ])

  const assinar = useMutation({
    mutationFn: () => assinarPlanoSimulado(atual.consultoriaId, plano, ciclo, forma),
    onSuccess: async () => {
      setDocumento('')
      await atualizar()
    },
  })
  const trocar = useMutation({
    mutationFn: () => assinarPlanoSimulado(atual.consultoriaId, plano, ciclo, forma),
    onSuccess: atualizar,
  })
  const cancelar = useMutation({
    mutationFn: () => cancelarPlanoSimulado(atual.consultoriaId),
    onSuccess: async () => {
      setConfirmarCancelamento(false)
      await atualizar()
    },
  })

  function enviar(evento: SyntheticEvent) {
    evento.preventDefault()
    if (ativa) {
      trocar.mutate()
      return
    }
    const novos: typeof erros = {}
    if (nome.trim().length < 2) novos.nome = 'Informe o nome de quem paga'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) novos.email = 'Informe um e-mail válido'
    if (!tipoDoDocumento(documento)) novos.documento = 'CNPJ ou CPF inválido'
    setErros(novos)
    if (Object.keys(novos).length === 0) assinar.mutate()
  }

  const ocupado = assinar.isPending || trocar.isPending || cancelar.isPending
  const erro = assinar.error ?? trocar.error

  return (
    <Secao
      titulo={ativa ? 'Trocar plano' : 'Escolher plano'}
      acao={
        <Segmentado
          rotulo="Ciclo"
          opcoes={CICLOS}
          valor={ciclo}
          aoMudar={setCiclo}
          larguraTotalNoCelular
        />
      }
    >
      <form noValidate onSubmit={enviar} className="flex min-w-0 flex-col gap-(--e-5)">
        <fieldset className="grid min-w-0 grid-cols-1 gap-(--e-3) md:grid-cols-3">
          <legend className="sr-only">Plano</legend>
          {CODIGOS_DE_PLANO.map((p) => (
            <OpcaoDePlano
              key={p}
              plano={p}
              ciclo={ciclo}
              nome={nomeDoGrupo}
              catalogo={catalogo}
              escolhido={plano === p}
              atual={ativa && dados.assinatura?.plano === p}
              aoEscolher={() => {
                setPlano(p)
              }}
            />
          ))}
        </fieldset>

        <fieldset className="flex min-w-0 flex-wrap items-center gap-x-(--e-5) gap-y-(--e-2)">
          <legend className="mb-(--e-2) rotulo">Forma de pagamento</legend>
          {(['pix', 'cartao'] as const).map((f) => (
            <label
              key={f}
              className="flex min-h-(--controle) cursor-pointer items-center gap-(--e-2) corpo max-md:min-h-(--controle-toque)"
            >
              <input
                type="radio"
                name={nomeDaForma}
                value={f}
                checked={forma === f}
                onChange={() => {
                  setForma(f)
                }}
                className="size-4 accent-(--acao)"
              />
              {ROTULO_DA_FORMA[f]}
            </label>
          ))}
        </fieldset>

        {ativa ? null : (
          <div className="grid grid-cols-1 gap-(--e-3) md:grid-cols-3">
            <CampoTexto
              rotulo="Nome de quem paga"
              value={nome}
              autoComplete="organization"
              erro={erros.nome}
              onChange={(e) => {
                setNome(e.target.value)
              }}
            />
            <CampoTexto
              rotulo="E-mail de cobrança"
              type="email"
              value={email}
              autoComplete="email"
              erro={erros.email}
              onChange={(e) => {
                setEmail(e.target.value)
              }}
            />
            <CampoTexto
              rotulo="CNPJ ou CPF"
              inputMode="text"
              autoComplete="off"
              value={documento}
              erro={erros.documento}
              onChange={(e) => {
                setDocumento(mascararDocumento(e.target.value))
              }}
            />
          </div>
        )}

        {erro ? (
          <MensagemSecao tom="perigo" role="alert">
            {mensagemDoErro(erro)}
          </MensagemSecao>
        ) : null}
        {trocar.isSuccess ? (
          <MensagemSecao tom="sucesso" role="status">
            {trocar.data.mudancaEm
              ? `O plano muda a partir de ${formatarDataCivil(trocar.data.mudancaEm as DataCivil)}.`
              : 'Plano trocado.'}
          </MensagemSecao>
        ) : null}
        {assinar.isSuccess ? (
          <MensagemSecao tom="sucesso" role="status">
            Assinatura criada.
          </MensagemSecao>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-(--e-2) border-t border-(--regra) pt-(--e-4) max-md:flex-col-reverse max-md:items-stretch">
          {ativa ? (
            <Botao
              aparencia="sutil"
              disabled={ocupado}
              onClick={() => {
                setConfirmarCancelamento(true)
              }}
            >
              Cancelar assinatura
            </Botao>
          ) : null}
          <Botao type="submit" aparencia="primario" disabled={ocupado}>
            {ativa ? 'Trocar plano' : 'Assinar'}
          </Botao>
        </div>
      </form>

      <Dialogo
        aberto={confirmarCancelamento}
        aoMudar={(aberto) => {
          if (!cancelar.isPending) setConfirmarCancelamento(aberto)
        }}
        titulo="Cancelar assinatura?"
        descricao="O plano vale até o fim do período pago. Depois, a consultoria fica somente leitura."
        acoes={
          <>
            <Botao
              disabled={cancelar.isPending}
              onClick={() => {
                setConfirmarCancelamento(false)
              }}
            >
              Manter plano
            </Botao>
            <Botao
              aparencia="perigo"
              disabled={cancelar.isPending}
              onClick={() => {
                cancelar.mutate()
              }}
            >
              Cancelar assinatura
            </Botao>
          </>
        }
      >
        {cancelar.isError ? (
          <p role="alert" className="text-(--atraso-texto)">
            {mensagemDoErro(cancelar.error)}
          </p>
        ) : null}
      </Dialogo>
    </Secao>
  )
}

function SeloCobranca({ situacao }: { situacao: Cobranca['situacao'] }) {
  return (
    <Selo
      tom={
        situacao === 'paga'
          ? 'sucesso'
          : situacao === 'vencida'
            ? 'perigo'
            : situacao === 'pendente'
              ? 'andamento'
              : 'padrao'
      }
    >
      {ROTULO_DA_COBRANCA[situacao]}
    </Selo>
  )
}

function Cobrancas() {
  const { atual } = useConsultoria()
  const consulta = useInfiniteQuery({
    queryKey: [CHAVE_COBRANCAS, atual.consultoriaId],
    queryFn: ({ pageParam }) => listarCobrancas(atual.consultoriaId, pageParam),
    initialPageParam: 0,
    getNextPageParam: (ultima, todas) => {
      const carregados = todas.reduce((soma, p) => soma + p.itens.length, 0)
      return ultima.itens.length === TAMANHO_PAGINA_COBRANCAS && carregados < ultima.total
        ? todas.length
        : undefined
    },
  })
  const itens = consulta.data?.pages.flatMap((p) => p.itens) ?? []

  let conteudo
  if (consulta.isPending) conteudo = <Carregando rotulo="Carregando cobranças" linhas={3} />
  else if (consulta.isError)
    conteudo = (
      <EstadoErro
        titulo="Não foi possível carregar as cobranças."
        descricao="Verifique a conexão e tente de novo."
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  else if (itens.length === 0)
    conteudo = <EstadoVazio icone="file-text" titulo="Nenhuma cobrança" />
  else
    conteudo = (
      <div className="flex flex-col gap-(--e-2)">
        <div
          role="region"
          aria-label="Cobranças"
          className="overflow-x-auto rounded-(--raio-painel) border bg-(--folha) max-md:hidden"
        >
          <table className="w-full border-collapse corpo">
            <thead>
              <tr>
                <th scope="col" className={classeCabecalho}>
                  Vencimento
                </th>
                <th scope="col" className={classeCabecalho}>
                  Referente a
                </th>
                <th scope="col" className={`${classeCabecalho} text-right`}>
                  Valor
                </th>
                <th scope="col" className={classeCabecalho}>
                  Situação
                </th>
                <th scope="col" className={classeCabecalho}>
                  Pago em
                </th>
              </tr>
            </thead>
            <tbody>
              {itens.map((c) => (
                <tr
                  key={c.id}
                  className="transicao-estado hover:bg-(--toque) last:[&>td]:border-b-0"
                >
                  <td className={`${classeCelula} corpo-medio numero`}>
                    {formatarDataCivil(c.vencimento as DataCivil)}
                  </td>
                  <td className={classeCelula}>
                    {c.tipo === 'adicionais' ? 'Adicionais' : 'Plano'}
                  </td>
                  <td className={`${classeCelula} text-right numero`}>
                    {formatarReais(c.valorCentavos)}
                  </td>
                  <td className={classeCelula}>
                    <SeloCobranca situacao={c.situacao} />
                  </td>
                  <td className={`${classeCelula} text-(--tinta-2) numero`}>
                    {c.pagoEm ? formatarDataCivil(c.pagoEm as DataCivil) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul
          aria-label="Cobranças"
          className="flex flex-col rounded-(--raio-painel) border bg-(--folha) md:hidden"
        >
          {itens.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-(--e-3) border-b border-(--regra-leve) px-(--e-4) py-(--e-3) last:border-b-0"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-(--e-05)">
                <span className="flex flex-wrap items-center justify-between gap-x-(--e-2)">
                  <span className="corpo-medio numero">
                    {formatarDataCivil(c.vencimento as DataCivil)}
                  </span>
                  <span className="corpo-medio numero">{formatarReais(c.valorCentavos)}</span>
                </span>
                <span className="flex flex-wrap items-center gap-x-(--e-2) rotulo numero">
                  <SeloCobranca situacao={c.situacao} />
                  {c.tipo === 'adicionais' ? 'Adicionais' : 'Plano'}
                  {c.pagoEm ? ` · paga em ${formatarDataCivil(c.pagoEm as DataCivil)}` : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
        {itens.some((c) => c.situacao === 'pendente' || c.situacao === 'vencida') ? (
          <p className="mt-(--e-2) corpo text-(--tinta-2)">{PAGAMENTO_PELO_SUPORTE}</p>
        ) : null}
        {consulta.hasNextPage ? (
          <Botao
            aparencia="sutil"
            className="self-start"
            disabled={consulta.isFetchingNextPage}
            onClick={() => void consulta.fetchNextPage()}
          >
            Mostrar mais cobranças
          </Botao>
        ) : null}
      </div>
    )

  return <Secao titulo="Cobranças">{conteudo}</Secao>
}

/**
 * Plano e cobrança (ADR-0026), só para a Gestão: situação (teste, beta, conta interna, ativa, em
 * atraso, somente leitura), uso contra os limites, valor com adicionais, escolher ou trocar o plano
 * (mensal ou anual = 10 mensalidades; Pix ou cartão), dados de quem paga e o histórico de
 * cobranças. O pagamento acontece na página do Asaas. A Equipe vê só a faixa de situação.
 */
export function PaginaPlano() {
  const { atual, suporte } = useConsultoria()
  const consulta = useDadosComerciais()
  const catalogo = useCatalogoComercial()
  const gestao = atual.papel === 'gestao'

  let conteudo
  if (!gestao) conteudo = <SemPermissao descricao={null} />
  else if (consulta.isPending || catalogo.isPending)
    conteudo = <Carregando rotulo="Carregando o plano" linhas={5} />
  else if (consulta.isError && ehSemPermissao(consulta.error))
    conteudo = <SemPermissao descricao={null} />
  else if (consulta.isError || catalogo.isError || !consulta.data)
    conteudo = (
      <EstadoErro
        titulo="Não foi possível carregar o plano."
        descricao="Verifique a conexão e tente de novo."
        aoTentarDeNovo={() => {
          void consulta.refetch()
          void catalogo.refetch()
        }}
      />
    )
  else {
    const dados = consulta.data
    conteudo = (
      <div className="flex flex-col gap-(--e-8)">
        <SituacaoEUso dados={dados} catalogo={catalogo.data} />
        {dados.interna || dados.situacao.situacao === 'contrato' || suporte ? null : (
          <EscolhaDePlano dados={dados} catalogo={catalogo.data} />
        )}
        <Cobrancas />
      </div>
    )
  }

  return <PaginaDeConfiguracoes>{conteudo}</PaginaDeConfiguracoes>
}
