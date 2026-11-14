import {
  CODIGOS_DE_PLANO,
  MENSALIDADES_NO_ANUAL,
  PLANOS,
  ROTULO_DA_FORMA,
  ROTULO_DO_CICLO,
  adicionaisDoUso,
  equivalenteMensal,
  formatarDataCivil,
  formatarReais,
  mascararDocumento,
  primeiroVencimento,
  tipoDoDocumento,
  valorDoCiclo,
  type CicloDoPlano,
  type CodigoPlano,
  type DataCivil,
  type FormaDePagamento,
} from '@gestao-ambiental/domain'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type SyntheticEvent, type ReactNode } from 'react'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import {
  ROTULO_DA_COBRANCA,
  TAMANHO_PAGINA_COBRANCAS,
  assinarPlanoSimulado,
  cancelarPlanoSimulado,
  listarCobrancas,
  type DadosComerciais,
} from '@/lib/api/plano'
import { ehSemPermissao, mensagemDoErro } from '@/lib/erros'
import { cn } from '@/lib/utils'

import {
  BotaoPagarSimulado,
  DialogoPagamentoSimulado,
  type CobrancaParaPagar,
} from './DialogoPagamentoSimulado'
import {
  CHAVE_COBRANCAS,
  CHAVE_SITUACAO_COMERCIAL,
  TOM_DA_SITUACAO_COMERCIAL,
  rotuloDaSituacao,
  useDadosComerciais,
} from './situacao'

const classeCabecalho =
  'h-10 border-b px-(--space-100) text-left rotulo whitespace-nowrap first:pl-(--space-150) last:pr-(--space-150)'
const classeCelula =
  'h-11 border-b px-(--space-100) align-middle whitespace-nowrap first:pl-(--space-150) last:pr-(--space-150)'

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-(--space-150) rounded-(--radius-large) border bg-(--surface) p-(--space-200) shadow-cartao"
    >
      <h2 id={id} className="titulo-secao text-(--text)">
        {titulo}
      </h2>
      {children}
    </section>
  )
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-(--space-200) gap-y-(--space-025) border-b py-(--space-075) last:border-b-0">
      <dt className="rotulo">{rotulo}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </div>
  )
}

function valorDoPlanoNoCiclo(plano: CodigoPlano, ciclo: CicloDoPlano): string {
  return ciclo === 'anual'
    ? `${formatarReais(valorDoCiclo(plano, 'anual'))} por ano`
    : `${formatarReais(valorDoCiclo(plano, 'mensal'))} por mês`
}

function SituacaoEUso({ dados }: { dados: DadosComerciais }) {
  const s = dados.situacao
  const a = dados.assinatura
  const plano = s.planoVigente
  const ciclo = s.cicloVigente
  const adicionais = adicionaisDoUso(
    { pessoas: dados.uso.pessoas, empreendimentos: dados.uso.empreendimentos },
    s.limites,
  )
  return (
    <Secao titulo="Situação">
      <div>
        <Selo tom={TOM_DA_SITUACAO_COMERCIAL[s.situacao]}>{rotuloDaSituacao(s)}</Selo>
      </div>
      <dl className="flex flex-col">
        <Linha rotulo="Plano">
          {plano && ciclo
            ? `${PLANOS[plano].nome} · ${ROTULO_DO_CICLO[ciclo]}${a?.forma ? ` · ${ROTULO_DA_FORMA[a.forma]}` : ''}`
            : 'Sem plano'}
        </Linha>
        {a?.mudancaEm && a.mudancaEm > dados.hoje && (a.planoAgendado || a.cicloAgendado) ? (
          <Linha rotulo="Mudança agendada">
            {PLANOS[a.planoAgendado ?? a.plano].nome} ·{' '}
            {ROTULO_DO_CICLO[a.cicloAgendado ?? a.ciclo]} a partir de{' '}
            {formatarDataCivil(a.mudancaEm)}
          </Linha>
        ) : null}
        {a?.validaAte ? (
          <Linha rotulo="Assinatura cancelada">Vale até {formatarDataCivil(a.validaAte)}</Linha>
        ) : null}
        {dados.proximoVencimento && !a?.validaAte ? (
          <Linha rotulo="Próximo vencimento">{formatarDataCivil(dados.proximoVencimento)}</Linha>
        ) : null}
        <Linha rotulo="Pessoas">
          {s.limites
            ? `${String(dados.uso.pessoas)} de ${String(s.limites.pessoas)}`
            : String(dados.uso.pessoas)}
        </Linha>
        <Linha rotulo="Empreendimentos ativos">
          {s.limites
            ? `${String(dados.uso.empreendimentos)} de ${String(s.limites.empreendimentos)}`
            : String(dados.uso.empreendimentos)}
        </Linha>
        {s.limites ? (
          <Linha rotulo="Adicionais por mês">{formatarReais(adicionais.valorCentavos)}</Linha>
        ) : null}
        {plano && ciclo && s.limites ? (
          <Linha rotulo={ciclo === 'anual' ? 'Valor mensal equivalente' : 'Valor mensal'}>
            <span className="corpo-medio">
              {formatarReais(equivalenteMensal(plano, ciclo) + adicionais.valorCentavos)}
            </span>
          </Linha>
        ) : null}
      </dl>
    </Secao>
  )
}

function OpcaoDePlano({
  plano,
  ciclo,
  escolhido,
  aoEscolher,
  nome,
}: {
  plano: CodigoPlano
  ciclo: CicloDoPlano
  escolhido: boolean
  aoEscolher: () => void
  nome: string
}) {
  const p = PLANOS[plano]
  return (
    <label
      className={cn(
        'flex cursor-pointer flex-col gap-(--space-050) rounded-(--radius-large) border p-(--space-150) transicao-estado hover:bg-(--surface-hover) has-focus-visible:outline-2 has-focus-visible:outline-(--border-focus)',
        escolhido && 'border-(--brand) bg-(--surface-selected)',
      )}
    >
      <span className="flex items-center gap-(--space-100)">
        <input
          type="radio"
          name={nome}
          value={plano}
          checked={escolhido}
          onChange={aoEscolher}
          className="accent-(--brand)"
        />
        <span className="corpo-medio">{p.nome}</span>
      </span>
      <span className="tabular-nums">{valorDoPlanoNoCiclo(plano, ciclo)}</span>
      {ciclo === 'anual' ? (
        <span className="tabular-nums">{MENSALIDADES_NO_ANUAL} mensalidades, pago de uma vez</span>
      ) : null}
      <span>
        {p.pessoas} pessoas · {p.empreendimentos} empreendimentos ativos
      </span>
      <span>{p.orcamentos ? 'Com orçamentos' : 'Sem orçamentos'}</span>
    </label>
  )
}

function EscolhaDePlano({ dados }: { dados: DadosComerciais }) {
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
  const [aPagar, setAPagar] = useState<CobrancaParaPagar | null>(null)
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
    onSuccess: async (resultado) => {
      setDocumento('')
      await atualizar()
      if (resultado.cobrancaId) {
        setAPagar({
          id: resultado.cobrancaId,
          valorCentavos: valorDoCiclo(plano, ciclo),
          vencimento: primeiroVencimento(dados.hoje, dados.situacao.testeAte),
        })
      }
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
    <Secao titulo={ativa ? 'Trocar plano' : 'Escolher plano'}>
      <form noValidate onSubmit={enviar} className="flex flex-col gap-(--space-200)">
        <fieldset className="flex flex-wrap gap-(--space-100)">
          <legend className="mb-(--space-075) rotulo">Ciclo</legend>
          {(['mensal', 'anual'] as const).map((c) => (
            <Botao
              key={c}
              selecionado={ciclo === c}
              onClick={() => {
                setCiclo(c)
              }}
            >
              {ROTULO_DO_CICLO[c]}
            </Botao>
          ))}
        </fieldset>

        <fieldset className="grid grid-cols-1 gap-(--space-100) md:grid-cols-3">
          <legend className="mb-(--space-075) rotulo">Plano</legend>
          {CODIGOS_DE_PLANO.map((p) => (
            <OpcaoDePlano
              key={p}
              plano={p}
              ciclo={ciclo}
              nome={nomeDoGrupo}
              escolhido={plano === p}
              aoEscolher={() => {
                setPlano(p)
              }}
            />
          ))}
        </fieldset>

        <fieldset className="flex flex-wrap gap-(--space-200)">
          <legend className="mb-(--space-075) rotulo">Forma de pagamento</legend>
          {(['pix', 'cartao'] as const).map((f) => (
            <label key={f} className="flex items-center gap-(--space-075)">
              <input
                type="radio"
                name={nomeDaForma}
                value={f}
                checked={forma === f}
                onChange={() => {
                  setForma(f)
                }}
                className="accent-(--brand)"
              />
              {ROTULO_DA_FORMA[f]}
            </label>
          ))}
        </fieldset>

        {ativa ? null : (
          <div className="grid grid-cols-1 gap-(--space-150) md:grid-cols-3">
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

        <div className="flex flex-wrap gap-(--space-100)">
          <Botao type="submit" aparencia="primario" disabled={ocupado}>
            {ativa ? 'Trocar plano' : 'Assinar e pagar'}
          </Botao>
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
          <p role="alert" className="text-(--text-danger)">
            {mensagemDoErro(cancelar.error)}
          </p>
        ) : null}
      </Dialogo>
      <DialogoPagamentoSimulado
        cobranca={aPagar}
        aoFechar={() => {
          setAPagar(null)
        }}
      />
    </Secao>
  )
}

function Cobrancas() {
  const { atual, suporte } = useConsultoria()
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
      <div className="flex flex-col gap-(--space-100)">
        <div
          role="region"
          aria-label="Cobranças"
          className="overflow-x-auto rounded-(--radius-large) border"
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
                <th scope="col" className={classeCabecalho}>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {itens.map((c) => (
                <tr key={c.id} className="last:[&>td]:border-b-0">
                  <td className={classeCelula}>{formatarDataCivil(c.vencimento as DataCivil)}</td>
                  <td className={classeCelula}>
                    {c.tipo === 'adicionais' ? 'Adicionais' : 'Plano'}
                  </td>
                  <td className={`${classeCelula} text-right tabular-nums`}>
                    {formatarReais(c.valorCentavos)}
                  </td>
                  <td className={classeCelula}>
                    <Selo
                      tom={
                        c.situacao === 'paga'
                          ? 'sucesso'
                          : c.situacao === 'vencida'
                            ? 'perigo'
                            : c.situacao === 'pendente'
                              ? 'andamento'
                              : 'padrao'
                      }
                    >
                      {ROTULO_DA_COBRANCA[c.situacao]}
                    </Selo>
                  </td>
                  <td className={classeCelula}>
                    {c.pagoEm ? formatarDataCivil(c.pagoEm as DataCivil) : '—'}
                  </td>
                  <td className={classeCelula}>
                    {!suporte && (c.situacao === 'pendente' || c.situacao === 'vencida') ? (
                      <BotaoPagarSimulado cobranca={c} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {consulta.hasNextPage ? (
          <Botao
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
  const gestao = atual.papel === 'gestao'

  let conteudo
  if (!gestao) conteudo = <SemPermissao descricao={null} />
  else if (consulta.isPending) conteudo = <Carregando rotulo="Carregando o plano" linhas={5} />
  else if (consulta.isError && ehSemPermissao(consulta.error))
    conteudo = <SemPermissao descricao={null} />
  else if (consulta.isError || !consulta.data)
    conteudo = (
      <EstadoErro
        titulo="Não foi possível carregar o plano."
        descricao="Verifique a conexão e tente de novo."
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  else {
    const dados = consulta.data
    conteudo = (
      <div className="flex flex-col gap-(--space-200)">
        <SituacaoEUso dados={dados} />
        {dados.interna || suporte ? null : <EscolhaDePlano dados={dados} />}
        <Cobrancas />
      </div>
    )
  }

  return <Pagina titulo="Plano e cobrança">{conteudo}</Pagina>
}
