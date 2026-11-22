import {
  formatarDataCivil,
  aplicarRascunho,
  progressoDaVistoria,
  rotuloDoDiaDaVistoria,
} from '@gestao-ambiental/domain'
import { useMutation } from '@tanstack/react-query'
import { useId, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { Botao } from '@/components/ui/botao'
import { Dialogo } from '@/components/ui/dialogo'
import { classeAreaTexto } from '@/components/ui/estilos-campo'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { conferirVistoria, iniciarVistoria, type Vistoria } from '@/lib/api/vistorias'
import { formatarInstanteComHora } from '@/lib/datas'
import { mensagemDoErroDaVistoria } from '@/lib/erros'

import { useItensDaVistoria, useRecarregarVistoria, useVistoria } from './consultas'
import { classeAcaoPrincipal, classeAcaoSecundaria } from './estilos'
import {
  BarraDeAcao,
  ColunaCampo,
  ComVistoria,
  PainelDoEnvio,
  SeloDaVistoria,
  VoltarPara,
} from './pecas'
import { useRascunhoDaVistoria } from './rascunho'

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-(--e-05) border-b border-(--regra-leve) py-(--e-3) last:border-b-0">
      <dt className="rotulo">{rotulo}</dt>
      <dd className="corpo-medio text-(--tinta)">{children}</dd>
    </div>
  )
}

function DialogoDevolver({
  aberto,
  aoMudar,
  vistoria,
  aoDevolver,
}: {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  vistoria: Vistoria
  aoDevolver: () => void
}) {
  const id = useId()
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const devolver = useMutation({
    mutationFn: () =>
      conferirVistoria(vistoria.id, 'devolvida', motivo.trim(), vistoria.rowVersion),
    onSuccess: aoDevolver,
  })
  return (
    <Dialogo
      aberto={aberto}
      aoMudar={aoMudar}
      titulo="Devolver vistoria"
      acoes={
        <>
          <Botao
            onClick={() => {
              aoMudar(false)
            }}
          >
            Cancelar
          </Botao>
          <Botao
            aparencia="perigo"
            disabled={devolver.isPending}
            onClick={() => {
              if (!motivo.trim()) {
                setErro('Informe o motivo')
                return
              }
              devolver.mutate()
            }}
          >
            {devolver.isPending ? 'Devolvendo…' : 'Devolver'}
          </Botao>
        </>
      }
    >
      {devolver.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErroDaVistoria(devolver.error)}
        </MensagemSecao>
      ) : null}
      <div className="flex flex-col gap-(--e-1)">
        <label htmlFor={id} className="rotulo">
          Motivo
        </label>
        <textarea
          id={id}
          rows={3}
          maxLength={1000}
          value={motivo}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? `${id}-erro` : undefined}
          className={classeAreaTexto}
          onChange={(evento) => {
            setMotivo(evento.target.value)
            if (evento.target.value.trim()) setErro(null)
          }}
        />
        {erro ? (
          <span id={`${id}-erro`} className="rotulo text-(--atraso-texto)">
            {erro}
          </span>
        ) : null}
      </div>
    </Dialogo>
  )
}

/** Aprovar encerra a conferência: pede confirmação com o que vai ser aprovado. */
function DialogoAprovar({
  aberto,
  aoMudar,
  vistoria,
  aoAprovar,
}: {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  vistoria: Vistoria
  aoAprovar: () => void
}) {
  const aprovar = useMutation({
    mutationFn: () => conferirVistoria(vistoria.id, 'aprovada', null, vistoria.rowVersion),
    onSuccess: aoAprovar,
  })
  return (
    <Dialogo
      aberto={aberto}
      aoMudar={aoMudar}
      titulo="Aprovar vistoria?"
      acoes={
        <>
          <Botao
            onClick={() => {
              aoMudar(false)
            }}
          >
            Cancelar
          </Botao>
          <Botao
            aparencia="primario"
            disabled={aprovar.isPending}
            onClick={() => {
              aprovar.mutate()
            }}
          >
            {aprovar.isPending ? 'Aprovando…' : 'Aprovar'}
          </Botao>
        </>
      }
    >
      {aprovar.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErroDaVistoria(aprovar.error)}
        </MensagemSecao>
      ) : null}
      <p className="corpo-medio text-(--tinta)">{vistoria.titulo}</p>
    </Dialogo>
  )
}

/** Linha do checklist no detalhe: progresso "x de y" e o caminho para registrar. */
function ResumoDoChecklist({ vistoria }: { vistoria: Vistoria }) {
  const itens = useItensDaVistoria(vistoria.id, true)
  const rascunho = useRascunhoDaVistoria(vistoria.id)
  // O que a técnica registrou, no servidor ou ainda no aparelho (ADR-0060).
  const progresso = itens.data
    ? progressoDaVistoria(aplicarRascunho(itens.data, rascunho.registros))
    : null
  return (
    <section aria-labelledby="titulo-checklist" className="flex flex-col gap-(--e-3)">
      <h2 id="titulo-checklist" className="titulo-secao text-(--tinta)">
        Checklist
      </h2>
      {rascunho.contagem.total > 0 ? <PainelDoEnvio vistoriaId={vistoria.id} /> : null}
      <Link
        to={`/campo/${vistoria.id}/checklist`}
        className="flex min-h-14 items-center gap-(--e-4) rounded-(--raio-painel) border bg-(--folha) px-(--e-4) py-(--e-3) text-(--tinta) no-underline transicao-estado hover:bg-(--toque) hover:no-underline"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-(--e-2)">
          <span className="corpo-medio numero">
            {progresso
              ? `${String(progresso.registrados)} de ${String(progresso.total)} ${progresso.total === 1 ? 'item' : 'itens'}`
              : 'Abrir checklist'}
          </span>
          {progresso ? (
            <span aria-hidden className="h-1.5 overflow-hidden rounded-(--raio-mini) bg-(--aperto)">
              <span
                className="block h-full bg-(--acao)"
                style={{ width: `${String(progresso.percentual)}%` }}
              />
            </span>
          ) : null}
        </span>
        <Icone nome="chevron-right" className="text-(--icone)" />
      </Link>
    </section>
  )
}

function Detalhe({ vistoria }: { vistoria: Vistoria }) {
  const navigate = useNavigate()
  const { atual } = useConsultoria()
  const recarregar = useRecarregarVistoria(vistoria.id)
  const [devolvendo, setDevolvendo] = useState(false)
  const [aprovando, setAprovando] = useState(false)
  const checklist = `/campo/${vistoria.id}/checklist`

  const iniciar = useMutation({
    mutationFn: () => iniciarVistoria(vistoria.id),
    onSuccess: async () => {
      await recarregar()
      await navigate(checklist)
    },
  })

  const quando = [
    rotuloDoDiaDaVistoria(vistoria.dataPlanejada, vistoria.hoje),
    vistoria.horaPlanejada,
  ]
    .filter(Boolean)
    .join(' às ')
  const decisao = vistoria.ultimaDecisao
  const emAberto = vistoria.situacao === 'em_andamento' || vistoria.situacao === 'devolvida'

  return (
    <ColunaCampo larga comBarra>
      <Pagina
        titulo={vistoria.titulo}
        voltar={{ para: '/campo', rotulo: 'Minhas vistorias' }}
        meta={
          <span className="flex flex-wrap items-center gap-x-(--e-3) gap-y-(--e-1)">
            <SeloDaVistoria situacao={vistoria.situacao} />
            <span className="corpo-medio numero text-(--tinta)">{quando}</span>
            <span>{vistoria.empreendimentoNome}</span>
          </span>
        }
      >
        {iniciar.isError ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErroDaVistoria(iniciar.error)}
          </MensagemSecao>
        ) : null}

        {decisao?.decisao === 'devolvida' ? (
          <MensagemSecao tom="perigo" titulo="Devolvida">
            {decisao.motivo}
            {decisao.conferenteNome ? ` · ${decisao.conferenteNome}` : ''}
          </MensagemSecao>
        ) : decisao?.decisao === 'aprovada' && vistoria.situacao === 'aprovada' ? (
          <MensagemSecao tom="sucesso" titulo="Aprovada">
            {[decisao.conferenteNome, formatarInstanteComHora(decisao.em, atual.fuso)]
              .filter(Boolean)
              .join(' · ')}
          </MensagemSecao>
        ) : null}

        <div className="grid gap-x-(--e-10) gap-y-(--e-8) lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex flex-col gap-(--e-8)">
            <ResumoDoChecklist vistoria={vistoria} />

            {vistoria.objetivo ? (
              <section aria-labelledby="titulo-objetivo" className="flex flex-col gap-(--e-2)">
                <h2 id="titulo-objetivo" className="titulo-secao text-(--tinta)">
                  Objetivo da visita
                </h2>
                <p className="corpo whitespace-pre-line text-(--tinta)">{vistoria.objetivo}</p>
              </section>
            ) : null}
          </div>

          <section
            aria-labelledby="titulo-dados"
            className="flex flex-col border-t border-(--regra-forte) pt-(--e-2) lg:border-t-0 lg:pt-0"
          >
            <h2 id="titulo-dados" className="sr-only">
              Dados da vistoria
            </h2>
            <dl className="flex flex-col">
              <Linha rotulo="Condicionante">
                <Link
                  to={`/ocorrencias/${vistoria.ocorrenciaId}`}
                  className="max-md:inline-flex max-md:min-h-11 max-md:items-center"
                >
                  {[vistoria.condicionanteCodigo, vistoria.condicionanteTitulo]
                    .filter(Boolean)
                    .join(' · ') || 'Ocorrência'}
                </Link>
              </Linha>
              {vistoria.licenca ? (
                <Linha rotulo="Licença">
                  <span className="numero">{vistoria.licenca}</span>
                </Linha>
              ) : null}
              <Linha rotulo="Unidade">
                {vistoria.unidadeNome}
                {vistoria.unidadeEndereco ? (
                  <span className="block corpo text-(--tinta-2)">{vistoria.unidadeEndereco}</span>
                ) : null}
              </Linha>
              <Linha rotulo="Responsável">{vistoria.responsavelNome ?? 'Sem responsável'}</Linha>
              <Linha rotulo="Prazo da condicionante">
                <span className="numero">{formatarDataCivil(vistoria.prazoAtual)}</span>
              </Linha>
              {vistoria.duracaoMinutos ? (
                <Linha rotulo="Duração">
                  <span className="numero">{vistoria.duracaoMinutos} min</span>
                </Linha>
              ) : null}
              {vistoria.enviadaEm ? (
                <Linha rotulo="Enviada">
                  <span className="numero">
                    {[
                      vistoria.enviadaPorNome,
                      formatarInstanteComHora(vistoria.enviadaEm, atual.fuso),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </Linha>
              ) : null}
            </dl>
          </section>
        </div>

        {vistoria.podeConferir ? (
          <BarraDeAcao>
            <Botao
              className={classeAcaoSecundaria}
              onClick={() => {
                setDevolvendo(true)
              }}
            >
              Devolver
            </Botao>
            <Botao
              aparencia="primario"
              iconeAntes="check"
              className={classeAcaoPrincipal}
              onClick={() => {
                setAprovando(true)
              }}
            >
              Aprovar
            </Botao>
          </BarraDeAcao>
        ) : vistoria.podeRegistrar && vistoria.situacao === 'planejada' ? (
          <BarraDeAcao>
            <Botao
              aparencia="primario"
              iconeDepois="arrow-right"
              className={classeAcaoPrincipal}
              disabled={iniciar.isPending}
              onClick={() => {
                iniciar.mutate()
              }}
            >
              {iniciar.isPending ? 'Começando…' : 'Começar vistoria'}
            </Botao>
          </BarraDeAcao>
        ) : vistoria.podeRegistrar && emAberto ? (
          <BarraDeAcao>
            <Botao aparencia="primario" asChild className={classeAcaoPrincipal}>
              <Link to={checklist}>Continuar vistoria</Link>
            </Botao>
          </BarraDeAcao>
        ) : null}
      </Pagina>

      {vistoria.podeConferir ? (
        <>
          <DialogoDevolver
            aberto={devolvendo}
            aoMudar={setDevolvendo}
            vistoria={vistoria}
            aoDevolver={() => {
              setDevolvendo(false)
              void recarregar()
            }}
          />
          <DialogoAprovar
            aberto={aprovando}
            aoMudar={setAprovando}
            vistoria={vistoria}
            aoAprovar={() => {
              setAprovando(false)
              void recarregar()
            }}
          />
        </>
      ) : null}
    </ColunaCampo>
  )
}

/** /campo/:id (ADR-0033 §5): contexto, checklist, objetivo; começar, continuar ou conferir. */
export function PaginaDetalheVistoria() {
  const { id = '' } = useParams()
  const consulta = useVistoria(id)
  return (
    <ComVistoria
      consulta={consulta}
      voltar={<VoltarPara para="/campo" rotulo="Minhas vistorias" />}
    >
      {(vistoria) => <Detalhe vistoria={vistoria} />}
    </ComVistoria>
  )
}
