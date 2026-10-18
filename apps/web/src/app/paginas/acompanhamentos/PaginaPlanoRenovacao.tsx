import {
  datasRenovacaoLao,
  diferencaEmDias,
  etapasRenovacaoLao,
  formatarDataCivil,
  situacaoDaRenovacao,
  type DataCivil,
} from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { SiglaEmpreendimento } from '@/app/paginas/empreendimentos/SiglaEmpreendimento'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { urlDoArquivo } from '@/lib/api/ocorrencias'
import { definirAntecedencia, obterPlano, type PlanoRenovacao } from '@/lib/api/renovacoes'
import { formatarInstanteComHora } from '@/lib/datas'
import { ehSemPermissao, mensagemDoErro } from '@/lib/erros'
import { cn } from '@/lib/utils'

import { DialogoProtocolo } from './DialogoProtocolo'
import { SeloRenovacao } from './SeloRenovacao'

function Migalhas({ licenca }: { licenca?: string }) {
  return (
    <nav aria-label="Caminho" className="flex items-center gap-(--space-050) corpo">
      <Link
        to="/acompanhamentos"
        aria-label="Voltar para Acompanhamentos"
        title="Voltar para Acompanhamentos"
        className="inline-flex size-(--size-control) items-center justify-center rounded-(--radius) text-(--icon) transicao-estado hover:bg-(--neutral-subtle-hover)"
      >
        <Icone nome="chevron-left" />
      </Link>
      <Link to="/acompanhamentos">Acompanhamentos</Link>
      {licenca ? (
        <>
          <span className="text-(--text-subtle)" aria-hidden="true">
            /
          </span>
          <span className="text-(--text-subtle)" aria-current="page">
            Renovação da {licenca}
          </span>
        </>
      ) : null}
    </nav>
  )
}

/** Posição (0–100) de uma data entre o início da preparação e o vencimento. */
function posicao(data: DataCivil, inicio: DataCivil, fim: DataCivil): number {
  const total = Math.max(1, diferencaEmDias(fim, inicio))
  return Math.max(0, Math.min(100, (diferencaEmDias(data, inicio) / total) * 100))
}

function deslocamento(percentual: number): string {
  if (percentual < 12) return 'translate-x-0 items-start text-left'
  if (percentual > 88) return '-translate-x-full items-end text-right'
  return '-translate-x-1/2 items-center text-center'
}

/** Linha do tempo: início da preparação, hoje, limite de protocolo e vencimento (REN-01). */
function LinhaDoTempo({
  inicio,
  limite,
  vencimento,
  hoje,
}: {
  inicio: DataCivil
  limite: DataCivil
  vencimento: DataCivil
  hoje: DataCivil
}) {
  const pLimite = posicao(limite, inicio, vencimento)
  const pHoje = posicao(hoje, inicio, vencimento)
  const hojeVisivel = hoje >= inicio && hoje <= vencimento
  return (
    <div className="flex flex-col gap-(--space-100)">
      <div className="flex justify-between gap-(--space-200)">
        <p className="flex flex-col">
          <span className="text-xs text-(--text-subtle)">Início da preparação</span>
          <span className="corpo-medio">{formatarDataCivil(inicio)}</span>
        </p>
        <p className="flex flex-col items-end text-right">
          <span className="text-xs text-(--text-danger)">Vencimento</span>
          <span className="corpo-medio">{formatarDataCivil(vencimento)}</span>
        </p>
      </div>
      <div className="relative h-3" aria-hidden="true">
        <div className="absolute top-1/2 right-0 left-0 h-1 -translate-y-1/2 rounded-full bg-(--border)" />
        <span className="absolute top-0 left-0 size-3 rounded-[2px] bg-(--lozenge-inprogress-text)" />
        {hojeVisivel ? (
          <span
            className="absolute top-0 h-3 w-1 -translate-x-1/2 rounded-full bg-(--brand)"
            style={{ left: `${String(pHoje)}%` }}
          />
        ) : null}
        <span
          className="absolute top-0 size-3 -translate-x-1/2 rounded-[2px] bg-(--af-amber-500)"
          style={{ left: `${String(pLimite)}%` }}
        />
        <span className="absolute top-0 right-0 size-3 rounded-[2px] bg-(--danger)" />
      </div>
      <div className="relative h-10">
        {hojeVisivel && Math.abs(pHoje - pLimite) > 12 ? (
          <p
            className={cn('absolute top-0 flex flex-col', deslocamento(pHoje))}
            style={{ left: `${String(pHoje)}%` }}
          >
            <span className="text-xs text-(--text-link)">Hoje</span>
            <span className="corpo-medio">{formatarDataCivil(hoje).slice(0, 5)}</span>
          </p>
        ) : null}
        <p
          className={cn('absolute top-0 flex flex-col', deslocamento(pLimite))}
          style={{ left: `${String(pLimite)}%` }}
        >
          <span className="text-xs text-(--text-warning)">Limite de protocolo</span>
          <span className="corpo-medio">{formatarDataCivil(limite)}</span>
        </p>
      </div>
    </div>
  )
}

function Antecedencia({
  plano,
  podeEditar,
  rascunho,
  aoMudarRascunho,
  aoSalvar,
}: {
  plano: PlanoRenovacao
  podeEditar: boolean
  rascunho: string
  aoMudarRascunho: (valor: string) => void
  aoSalvar: () => Promise<void>
}) {
  const valido = /^\d{1,4}$/.test(rascunho)
  const dias = valido ? Number(rascunho) : plano.antecedencia
  const { inicioPreparacao, limiteProtocolo } = datasRenovacaoLao(
    plano.validade,
    dias,
    plano.diasLimite,
  )
  const salvar = useMutation({
    mutationFn: () => definirAntecedencia(plano.id, dias, plano.rowVersion),
    onSuccess: aoSalvar,
  })
  const mudou = valido && dias !== plano.antecedencia

  return (
    <div className="flex flex-col gap-(--space-050)">
      {salvar.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(salvar.error)}
        </MensagemSecao>
      ) : null}
      <label htmlFor="antecedencia" className="rotulo">
        Antecedência adicional (dias)
      </label>
      <div className="flex flex-wrap items-center gap-(--space-150)">
        <input
          id="antecedencia"
          inputMode="numeric"
          value={rascunho}
          disabled={!podeEditar}
          aria-invalid={valido ? undefined : true}
          aria-describedby="antecedencia-nota"
          onChange={(evento) => {
            aoMudarRascunho(evento.target.value.replace(/\D/g, '').slice(0, 4))
          }}
          className="h-(--size-control) w-28 rounded-(--radius) border border-(--border-input) bg-(--surface-input) px-(--space-100) corpo text-(--text) outline-none transicao-estado focus:border-(--border-focus) disabled:bg-(--surface-disabled) disabled:text-(--text-disabled)"
        />
        <span id="antecedencia-nota" className="text-xs text-(--text-subtle)">
          {valido
            ? `Início da preparação ${formatarDataCivil(inicioPreparacao)} · limite continua ${formatarDataCivil(limiteProtocolo)}`
            : 'Use um número inteiro de 0 ou mais.'}
        </span>
        {podeEditar && mudou ? (
          <Botao
            tamanho="compacto"
            aparencia="primario"
            disabled={salvar.isPending}
            onClick={() => {
              salvar.mutate()
            }}
          >
            {salvar.isPending ? 'Salvando…' : 'Salvar antecedência'}
          </Botao>
        ) : null}
      </div>
    </div>
  )
}

/**
 * /renovacoes/:instrumentoId (Protótipo 17, artboards 02 a 06; REN-01, REN-02): limite de
 * protocolo e início da preparação sem cálculo manual, etapas preparatórias calculadas e o
 * registro do protocolo. Protocolar não prorroga a licença.
 */
export function PaginaPlanoRenovacao() {
  const { instrumentoId = '' } = useParams()
  const { atual } = useConsultoria()
  const queryClient = useQueryClient()
  const ehGestao = atual.papel === 'gestao'
  const [protocoloAberto, setProtocoloAberto] = useState(false)
  const [rascunho, setRascunho] = useState<string | null>(null)

  const plano = useQuery({
    queryKey: ['plano-renovacao', instrumentoId],
    queryFn: () => obterPlano(instrumentoId),
  })
  const abrirComprovante = useMutation({
    mutationFn: urlDoArquivo,
    onSuccess: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
  })

  const licenca = plano.data?.licenca
  useEffect(() => {
    document.title = `${licenca ? `Renovação da ${licenca}` : 'Renovação'} · Grama`
  }, [licenca])

  async function recarregar() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['plano-renovacao', instrumentoId] }),
      queryClient.invalidateQueries({ queryKey: ['renovacoes'] }),
    ])
  }

  if (plano.isPending) {
    return (
      <div className="flex flex-col gap-(--space-200)">
        <Migalhas />
        <Carregando rotulo="Carregando o plano de renovação" linhas={5} />
      </div>
    )
  }
  if (plano.isError) {
    return (
      <div className="flex flex-col gap-(--space-200)">
        <Migalhas />
        {ehSemPermissao(plano.error) ? (
          <SemPermissao />
        ) : (
          <EstadoErro
            titulo="Não foi possível carregar o plano de renovação."
            aoTentarDeNovo={() => void plano.refetch()}
          />
        )}
      </div>
    )
  }
  if (!plano.data) {
    // Inexistente, de outra consultoria ou licença sem plano (só LAO ativa tem).
    return (
      <div className="flex flex-col gap-(--space-200)">
        <Migalhas />
        <h1 className="sr-only">Plano de renovação não encontrado</h1>
        <EstadoVazio
          icone="file-text"
          titulo="Plano de renovação não encontrado"
          descricao="Só LAO ativa tem plano de renovação, e ela precisa ser desta consultoria."
          acaoPrincipal={
            <Botao aparencia="primario" asChild>
              <Link to="/acompanhamentos">Voltar para Acompanhamentos</Link>
            </Botao>
          }
        />
      </div>
    )
  }

  const dados = plano.data
  const protocolado = dados.protocoladoEm !== null
  const podeEditar = ehGestao && !protocolado
  const textoRascunho = rascunho ?? String(dados.antecedencia)
  const diasPrevia = /^\d{1,4}$/.test(textoRascunho) ? Number(textoRascunho) : dados.antecedencia
  const { inicioPreparacao, limiteProtocolo } = datasRenovacaoLao(
    dados.validade,
    diasPrevia,
    dados.diasLimite,
  )
  const etapas = etapasRenovacaoLao(dados.validade, diasPrevia, dados.diasLimite)
  const situacao = situacaoDaRenovacao({
    vencimento: dados.validade,
    antecedencia: dados.antecedencia,
    diasLimite: dados.diasLimite,
    protocoladoEm: dados.protocoladoEm,
    hoje: dados.hoje,
  })

  return (
    <div className="flex flex-col gap-(--space-200)">
      <Migalhas licenca={dados.licenca} />

      <header className="flex flex-wrap items-start gap-(--space-150)">
        <SiglaEmpreendimento nome={dados.empreendimentoNome} grande />
        <div className="flex min-w-0 flex-1 flex-col gap-(--space-025)">
          <h1 className="titulo-tela text-(--text)">Renovação da {dados.licenca}</h1>
          <p className="corpo text-(--text-subtle)">
            <Link to={`/empreendimentos/${dados.empreendimentoId}`}>
              {dados.empreendimentoNome}
            </Link>
            {dados.orgao ? ` · ${dados.orgao}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-(--space-150)">
          <SeloRenovacao situacao={situacao} />
          {podeEditar ? (
            <Botao
              aparencia="primario"
              onClick={() => {
                setProtocoloAberto(true)
              }}
            >
              Registrar protocolo
            </Botao>
          ) : null}
        </div>
      </header>

      {protocolado && dados.protocoladoEm ? (
        <MensagemSecao
          tom="sucesso"
          titulo={`Protocolada em ${formatarDataCivil(dados.protocoladoEm)} · protocolo ${dados.protocoloNumero ?? ''}`}
        >
          <span className="flex flex-wrap items-center gap-x-(--space-100)">
            {dados.comprovante ? (
              <button
                type="button"
                onClick={() => {
                  if (dados.comprovante) abrirComprovante.mutate(dados.comprovante.caminho)
                }}
                className="cursor-pointer text-(--text-link) hover:underline"
              >
                {dados.comprovante.nome}
              </button>
            ) : null}
            {dados.registradoPorNome && dados.registradoEm ? (
              <span className="text-xs text-(--text-subtle)">
                Registrado por {dados.registradoPorNome} em{' '}
                {formatarInstanteComHora(dados.registradoEm, atual.fuso)}
              </span>
            ) : null}
          </span>
        </MensagemSecao>
      ) : null}
      {abrirComprovante.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(abrirComprovante.error)}
        </MensagemSecao>
      ) : null}

      <section
        aria-label="Prazos da renovação"
        className="flex flex-col gap-(--space-150) rounded-(--radius) border bg-(--surface) p-(--space-150)"
      >
        <LinhaDoTempo
          inicio={inicioPreparacao}
          limite={limiteProtocolo}
          vencimento={dados.validade}
          hoje={dados.hoje}
        />
        <p className="text-xs text-(--text-subtle)">
          Limite = vencimento − {dados.diasLimite} dias corridos. Preparação = limite −
          antecedência.
        </p>
        <Antecedencia
          key={dados.rowVersion}
          plano={dados}
          podeEditar={podeEditar}
          rascunho={textoRascunho}
          aoMudarRascunho={setRascunho}
          aoSalvar={async () => {
            setRascunho(null)
            await recarregar()
          }}
        />
        {!ehGestao ? (
          <p className="text-xs text-(--text-subtle)">
            Só a Gestão muda a antecedência e registra o protocolo.
          </p>
        ) : null}
      </section>

      <section
        aria-labelledby="titulo-etapas-renovacao"
        className="flex flex-col overflow-hidden rounded-(--radius) border bg-(--surface)"
      >
        <header className="flex flex-wrap items-center justify-between gap-(--space-100) border-b px-(--space-150) py-(--space-150)">
          <h2 id="titulo-etapas-renovacao" className="titulo-secao">
            Etapas preparatórias
          </h2>
          <span className="text-xs text-(--text-subtle)">
            {etapas.length} {etapas.length === 1 ? 'etapa' : 'etapas'} · antecedência de{' '}
            {diasPrevia} {diasPrevia === 1 ? 'dia' : 'dias'}
          </span>
        </header>
        <ol className="flex flex-col">
          {etapas.map((etapa) => (
            <li
              key={etapa.titulo}
              className="flex items-start gap-(--space-100) border-b px-(--space-150) py-(--space-100) last:border-b-0"
            >
              <Icone nome="clock" className="mt-0.5 text-(--icon)" />
              <span className="flex flex-col">
                <span className="corpo">{etapa.titulo}</span>
                <span className="text-xs text-(--text-subtle)">
                  Meta {formatarDataCivil(etapa.prazo)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <MensagemSecao tom="informacao">
        Protocolar no prazo não prorroga a licença automaticamente. A validade original continua{' '}
        {formatarDataCivil(dados.validade)}.
      </MensagemSecao>

      {podeEditar ? (
        <DialogoProtocolo
          key={String(protocoloAberto)}
          plano={dados}
          aberto={protocoloAberto}
          aoMudar={setProtocoloAberto}
          aoRegistrar={async () => {
            setProtocoloAberto(false)
            await recarregar()
          }}
        />
      ) : null}
    </div>
  )
}
