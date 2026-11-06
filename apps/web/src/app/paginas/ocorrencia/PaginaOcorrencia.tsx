import {
  distanciaEmDias,
  estaAtrasada,
  formatarDataCivil,
  resumoDoEnvio,
  rotuloDoCiclo,
  secaoDaOcorrencia,
  type SituacaoExibida,
} from '@gestao-ambiental/domain'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Avatar } from '@/components/ui/avatar'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icone, type NomeIcone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { PilulaStatus } from '@/components/ui/pilula-status'
import { Selo } from '@/components/ui/selo'
import { designarConferente, type Evidencia, type Ocorrencia } from '@/lib/api/ocorrencias'
import type { MembroAtivo } from '@/lib/api/perfil'
import { ehSemPermissao, mensagemDoErro } from '@/lib/erros'
import { cn } from '@/lib/utils'

import { diaEHora, STATUS } from './apoio'
import { useDadosDaOcorrencia } from './dados'
import { PainelAtividade } from './PainelAtividade'
import { SecaoConclusao } from './SecaoConclusao'
import { SecaoConferencia } from './SecaoConferencia'
import { SecaoEvidencia } from './SecaoEvidencia'
import {
  AvisoDeRegularizacao,
  SecaoRegularizar,
  type OpcaoDeRegularizacao,
} from './SecaoRegularizar'

/** Barra de 48px: breadcrumb (no celular, voltar + "Empreendimento / Licença"), ⋯ e fechar. */
function BarraDaOcorrencia({ ocorrencia }: { ocorrencia: Ocorrencia | null }) {
  const navigate = useNavigate()
  const [copiado, setCopiado] = useState(false)
  useEffect(() => {
    if (!copiado) return
    const relogio = setTimeout(() => {
      setCopiado(false)
    }, 2000)
    return () => {
      clearTimeout(relogio)
    }
  }, [copiado])

  function fechar() {
    // Volta para a lista de origem; aberta por link direto, vai para a Visão da equipe.
    if (window.history.length > 1) void navigate(-1)
    else void navigate('/')
  }

  const empreendimento = ocorrencia ? (
    <Link
      to={`/empreendimentos/${ocorrencia.empreendimentoId}`}
      className="text-(--text-subtle) hover:text-(--text)"
    >
      {ocorrencia.empreendimentoNome}
    </Link>
  ) : null
  const licenca = ocorrencia?.licenca ? (
    <Link
      to={`/empreendimentos/${ocorrencia.empreendimentoId}`}
      className="text-(--text-subtle) hover:text-(--text)"
    >
      {ocorrencia.licenca}
    </Link>
  ) : null

  return (
    <div className="flex h-12 shrink-0 items-center gap-(--space-100) border-b px-(--space-300) max-md:px-(--space-100)">
      <BotaoIcone
        icone="chevron-left"
        rotulo="Voltar"
        aparencia="sutil"
        className="md:hidden"
        onClick={fechar}
      />
      <nav aria-label="Caminho" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-(--space-075) corpo whitespace-nowrap">
          {empreendimento ? <li className="truncate">{empreendimento}</li> : null}
          {licenca ? (
            <>
              <li aria-hidden="true" className="text-(--text-subtle)">
                /
              </li>
              <li className="truncate">{licenca}</li>
            </>
          ) : null}
          {ocorrencia ? (
            <>
              <li aria-hidden="true" className="text-(--text-subtle) max-md:hidden">
                /
              </li>
              <li aria-current="page" className="truncate text-(--text) max-md:hidden">
                Condicionante {ocorrencia.codigo}
              </li>
            </>
          ) : null}
        </ol>
      </nav>
      {copiado ? (
        <span role="status" className="text-xs text-(--text-subtle)">
          Link copiado
        </span>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <BotaoIcone icone="ellipsis" rotulo="Mais ações" aparencia="sutil" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              void navigator.clipboard.writeText(window.location.href).then(() => {
                setCopiado(true)
              })
            }}
          >
            <Icone nome="link" />
            Copiar link
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <BotaoIcone
        icone="x"
        rotulo="Fechar"
        aparencia="sutil"
        className="max-md:hidden"
        onClick={fechar}
      />
    </div>
  )
}

function Propriedade({
  icone,
  rotulo,
  children,
  rotuloId,
  className,
}: {
  icone: NomeIcone
  rotulo: string
  children: ReactNode
  rotuloId?: string
  className?: string
}) {
  return (
    <div className={cn('flex min-h-8 items-center gap-(--space-100)', className)}>
      <dt
        id={rotuloId}
        className="flex w-[132px] shrink-0 items-center gap-(--space-100) corpo text-(--text-subtle)"
      >
        <Icone nome={icone} className="text-(--icon-subtle)" />
        {rotulo}
      </dt>
      <dd className="flex min-w-0 items-center gap-(--space-100) corpo whitespace-nowrap">
        {children}
      </dd>
    </div>
  )
}

const classeSelect =
  'h-(--size-control-sm) max-w-full rounded-(--radius) border border-(--border-input) bg-(--surface-input) px-(--space-075) corpo text-(--text)'

function Conferente({
  ocorrencia,
  ehGestao,
  membros,
  aoMudar,
}: {
  ocorrencia: Ocorrencia
  ehGestao: boolean
  membros: readonly MembroAtivo[]
  aoMudar: () => Promise<void>
}) {
  const designar = useMutation({
    mutationFn: (membroId: string | null) => designarConferente(ocorrencia.id, membroId),
    onSuccess: aoMudar,
  })
  if (!ehGestao || ocorrencia.situacao === 'concluida') {
    return <>{ocorrencia.conferenteNome ?? 'Gestão'}</>
  }
  return (
    <>
      <select
        aria-labelledby="rotulo-conferente"
        className={classeSelect}
        value={ocorrencia.conferenteId ?? ''}
        disabled={designar.isPending}
        onChange={(evento) => {
          designar.mutate(evento.target.value || null)
        }}
      >
        <option value="">Gestão</option>
        {membros.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nome}
          </option>
        ))}
      </select>
      {designar.isError ? (
        <span role="alert" className="text-xs text-(--text-danger)">
          {mensagemDoErro(designar.error)}
        </span>
      ) : null}
    </>
  )
}

function Propriedades({
  ocorrencia,
  exibida,
  atrasada,
  ehGestao,
  membros,
  aoMudar,
}: {
  ocorrencia: Ocorrencia
  exibida: SituacaoExibida
  atrasada: boolean
  ehGestao: boolean
  membros: readonly MembroAtivo[]
  aoMudar: () => Promise<void>
}) {
  const status = STATUS[exibida]
  const responsavel = membros.find((m) => m.id === ocorrencia.responsavelId)
  const nomeResponsavel = ocorrencia.responsavelNome ?? responsavel?.nome ?? null
  return (
    <dl className="grid grid-cols-2 gap-x-(--space-300) gap-y-(--space-050) max-md:grid-cols-1">
      <Propriedade icone="circle-check" rotulo="Status" className="md:order-1">
        <PilulaStatus texto={status.texto} tom={status.tom} />
        {atrasada ? <Selo tom="perigo">Atrasada</Selo> : null}
      </Propriedade>
      <Propriedade icone="calendar" rotulo="Prazo oficial" className="md:order-3">
        <span className={cn(atrasada && 'text-(--text-danger)')}>
          {formatarDataCivil(ocorrencia.prazoAtual)} ·{' '}
          {distanciaEmDias(ocorrencia.prazoAtual, ocorrencia.hoje)}
        </span>
      </Propriedade>
      <Propriedade icone="clock" rotulo="Meta interna" className="max-md:hidden md:order-5">
        {ocorrencia.metaInterna ? formatarDataCivil(ocorrencia.metaInterna) : '—'}
      </Propriedade>
      <Propriedade icone="users" rotulo="Responsável" className="md:order-2">
        {nomeResponsavel ? (
          <>
            <Avatar nome={nomeResponsavel} fotoUrl={responsavel?.fotoUrl ?? null} />
            <span className="truncate">{nomeResponsavel}</span>
          </>
        ) : (
          '—'
        )}
      </Propriedade>
      <Propriedade
        icone="users"
        rotulo="Conferente"
        rotuloId="rotulo-conferente"
        className="max-md:hidden md:order-4"
      >
        <Conferente
          ocorrencia={ocorrencia}
          ehGestao={ehGestao}
          membros={membros}
          aoMudar={aoMudar}
        />
      </Propriedade>
      <Propriedade icone="refresh-cw" rotulo="Ciclo" className="max-md:hidden md:order-6">
        {rotuloDoCiclo(ocorrencia.recorrencia, ocorrencia.prazoOriginal, ocorrencia.ciclo)}
      </Propriedade>
    </dl>
  )
}

/** "Ciclo anterior: 1 PDF + 4 fotos · aprovado por Ana Ribeiro em 14/08 · Ver". */
function CicloAnterior({
  anteriorId,
  evidencias,
  fuso,
}: {
  anteriorId: string
  evidencias: readonly Evidencia[]
  fuso: string
}) {
  const aprovado = evidencias.find((e) => e.situacao === 'aprovada' && e.conferencia)
  if (!aprovado?.conferencia) return null
  return (
    <p className="flex items-start gap-(--space-075) text-xs text-(--text-subtle)">
      <Icone nome="file-check" tamanho={12} className="mt-0.5 shrink-0" />
      <span>
        Ciclo anterior: {resumoDoEnvio(aprovado.arquivos)} · aprovado por{' '}
        {aprovado.conferencia.conferenteNome} em{' '}
        {diaEHora(aprovado.conferencia.em, fuso).slice(0, 5)} ·{' '}
        <Link to={`/ocorrencias/${anteriorId}`} className="text-(--text-link)">
          Ver
        </Link>
      </span>
    </p>
  )
}

function Moldura({ ocorrencia, children }: { ocorrencia: Ocorrencia | null; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-(--surface)">
      <BarraDaOcorrencia ocorrencia={ocorrencia} />
      <div className="min-h-0 flex-1 overflow-y-auto px-(--space-400) py-(--space-300) max-md:px-(--space-200)">
        {children}
      </div>
    </div>
  )
}

/**
 * /ocorrencias/:id (Tela 16 v2; DEM-01, DEM-03, DEM-09): a ocorrência na visão de quem executa.
 * Propriedades, condicionante, evidência (ou Regularizar, se atrasada) e Atividade à direita.
 * Conferir e concluir aparecem só para quem pode; quem pode o quê é decidido no banco.
 */
export function PaginaOcorrencia() {
  const { id = '' } = useParams()
  const { atual } = useConsultoria()
  const ehGestao = atual.papel === 'gestao'
  const dados = useDadosDaOcorrencia(id)
  const { ocorrencia, evidencias, atividade, membros, anteriores, urls, ultima, exibida } = dados
  // Sucesso do Regularizar: fica na página para sobreviver à troca de seção (ex.: vira leitura).
  const [regularizado, setRegularizado] = useState<OpcaoDeRegularizacao | null>(null)

  const codigo = ocorrencia.data?.codigo
  useEffect(() => {
    document.title = `${codigo ? `Condicionante ${codigo}` : 'Ocorrência'} · Grama`
  }, [codigo])

  if (ocorrencia.isPending) {
    return (
      <Moldura ocorrencia={null}>
        <Carregando rotulo="Carregando a ocorrência" linhas={6} />
      </Moldura>
    )
  }
  if (ocorrencia.isError) {
    return (
      <Moldura ocorrencia={null}>
        {ehSemPermissao(ocorrencia.error) ? (
          <SemPermissao />
        ) : (
          <EstadoErro
            titulo="Não foi possível carregar a ocorrência."
            aoTentarDeNovo={() => void ocorrencia.refetch()}
          />
        )}
      </Moldura>
    )
  }
  if (!ocorrencia.data || !exibida) {
    // Inexistente ou de outra consultoria: a RLS não distingue, e a tela também não.
    return (
      <Moldura ocorrencia={null}>
        <h1 className="sr-only">Ocorrência não encontrada</h1>
        <EstadoVazio
          icone="file-text"
          titulo="Ocorrência não encontrada"
          descricao={`Ela não existe ou não é da ${atual.consultoriaNome}.`}
          acaoPrincipal={
            <Botao aparencia="primario" asChild>
              <Link to="/">Voltar para a Visão da equipe</Link>
            </Botao>
          }
        />
      </Moldura>
    )
  }

  const o = ocorrencia.data
  const listaMembros = membros.data ?? []
  const atrasada = estaAtrasada(o.prazoAtual, o.hoje, o.situacao)
  const secao = secaoDaOcorrencia(exibida, atrasada)
  const comentarios = (atividade.data ?? []).filter((e) => e.tipo === 'comentario').length

  async function aoRegularizar(opcao: OpcaoDeRegularizacao) {
    setRegularizado(opcao)
    await dados.recarregar()
  }

  let conteudoDaSecao: ReactNode
  if (evidencias.isError) {
    conteudoDaSecao = (
      <EstadoErro
        titulo="Não foi possível carregar a evidência."
        aoTentarDeNovo={() => void evidencias.refetch()}
      />
    )
  } else if (evidencias.isPending) {
    conteudoDaSecao = <Carregando rotulo="Carregando a evidência" linhas={3} />
  } else if (secao === 'regularizar') {
    conteudoDaSecao = (
      <SecaoRegularizar
        ocorrencia={o}
        ultima={ultima}
        urls={urls}
        sucesso={regularizado}
        aoConcluir={aoRegularizar}
      />
    )
  } else if (secao === 'concluida') {
    conteudoDaSecao = null
  } else {
    conteudoDaSecao = (
      <>
        {regularizado ? <AvisoDeRegularizacao opcao={regularizado} /> : null}
        <SecaoEvidencia
          ocorrencia={o}
          exibida={exibida}
          ultima={ultima}
          membroId={atual.membroId}
          fuso={atual.fuso}
          urls={urls}
          aoMudar={dados.recarregar}
        />
      </>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <Moldura ocorrencia={o}>
          <article className="mx-auto flex w-full max-w-[1040px] flex-col gap-(--space-300) max-md:gap-(--space-250) max-md:pb-32">
            <header className="flex flex-col gap-(--space-250)">
              <h1 className="text-2xl leading-8 font-semibold text-pretty text-(--text) max-md:text-[22px] max-md:leading-7">
                {o.titulo}
              </h1>
              <Propriedades
                ocorrencia={o}
                exibida={exibida}
                atrasada={atrasada}
                ehGestao={ehGestao}
                membros={listaMembros}
                aoMudar={dados.recarregar}
              />
            </header>

            <div className="flex flex-col gap-(--space-100) border-t pt-(--space-300)">
              <p className="text-[15px] leading-6 whitespace-pre-line text-(--text)">
                {o.textoLiteral}
              </p>
              {o.ocorrenciaAnteriorId && anteriores.data ? (
                <CicloAnterior
                  anteriorId={o.ocorrenciaAnteriorId}
                  evidencias={anteriores.data}
                  fuso={atual.fuso}
                />
              ) : null}
            </div>

            {o.situacao === 'concluida' ? null : (
              <div className="flex flex-col gap-(--space-200)">{conteudoDaSecao}</div>
            )}

            <SecaoConferencia
              ocorrencia={o}
              ultima={ultima}
              membroId={atual.membroId}
              ehGestao={ehGestao}
              aoMudar={dados.recarregar}
            />
            {ehGestao ? (
              <SecaoConclusao
                ocorrencia={o}
                ultimaAprovada={ultima?.situacao === 'aprovada'}
                ehGestao={ehGestao}
                fuso={atual.fuso}
                aoMudar={dados.recarregar}
              />
            ) : o.situacao === 'concluida' ? (
              <MensagemSecao tom="sucesso" titulo="Concluída">
                {o.concluidaPorNome ? `Concluída por ${o.concluidaPorNome}.` : null}
              </MensagemSecao>
            ) : null}

            <Link
              to="atividade"
              className="flex h-12 items-center gap-(--space-100) rounded-(--radius) border px-(--space-150) transicao-estado hover:bg-(--surface-hover) md:hidden"
            >
              <Icone nome="inbox" className="text-(--icon)" />
              <span className="flex-1 corpo font-medium">Atividade</span>
              <span className="text-xs text-(--text-subtle)">
                {comentarios === 1 ? '1 comentário' : `${String(comentarios)} comentários`}
              </span>
              <Icone nome="chevron-right" className="text-(--icon)" />
            </Link>
          </article>
        </Moldura>
      </div>

      <PainelAtividade
        className="w-[420px] shrink-0 border-l max-md:hidden"
        ocorrencia={o}
        eventos={atividade.data}
        carregando={atividade.isPending}
        comErro={atividade.isError}
        aoTentarDeNovo={() => void atividade.refetch()}
        evidencias={evidencias.data ?? []}
        membros={listaMembros}
        urls={urls}
        fuso={atual.fuso}
        aoComentar={dados.recarregar}
      />
    </div>
  )
}
