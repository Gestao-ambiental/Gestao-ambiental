import { formatarDataCivil, rotuloDoDiaDaVistoria } from '@gestao-ambiental/domain'
import { useMutation } from '@tanstack/react-query'
import { useId, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Botao } from '@/components/ui/botao'
import { Dialogo } from '@/components/ui/dialogo'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { conferirVistoria, iniciarVistoria, type Vistoria } from '@/lib/api/vistorias'
import { formatarInstanteComHora } from '@/lib/datas'
import { mensagemDoErroDaVistoria } from '@/lib/erros'

import { useItensDaVistoria, useRecarregarVistoria, useVistoria } from './consultas'
import { classeAlvo, classeAreaTexto, classeCartao } from './estilos'
import { BarraDeAcao, ColunaCampo, ComVistoria, SeloDaVistoria, VoltarPara } from './pecas'

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-(--e-4) border-b py-(--e-2) last:border-b-0">
      <dt className="corpo text-(--tinta-2)">{rotulo}</dt>
      <dd className="text-right corpo-medio">{children}</dd>
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
          <span id={`${id}-erro`} className="text-xs text-(--atraso-texto)">
            {erro}
          </span>
        ) : null}
      </div>
    </Dialogo>
  )
}

function Detalhe({ vistoria }: { vistoria: Vistoria }) {
  const navigate = useNavigate()
  const { atual } = useConsultoria()
  const recarregar = useRecarregarVistoria(vistoria.id)
  const itens = useItensDaVistoria(vistoria.id, true)
  const [devolvendo, setDevolvendo] = useState(false)
  const checklist = `/campo/${vistoria.id}/checklist`

  const iniciar = useMutation({
    mutationFn: () => iniciarVistoria(vistoria.id),
    onSuccess: async () => {
      await recarregar()
      await navigate(checklist)
    },
  })
  const aprovar = useMutation({
    mutationFn: () => conferirVistoria(vistoria.id, 'aprovada', null, vistoria.rowVersion),
    onSuccess: recarregar,
  })
  const erro = iniciar.error ?? aprovar.error

  const quando = [
    rotuloDoDiaDaVistoria(vistoria.dataPlanejada, vistoria.hoje),
    vistoria.horaPlanejada,
  ]
    .filter(Boolean)
    .join(' às ')
  const totalItens = itens.data?.length
  const decisao = vistoria.ultimaDecisao
  const emAberto = vistoria.situacao === 'em_andamento' || vistoria.situacao === 'devolvida'

  return (
    <ColunaCampo>
      <VoltarPara para="/campo" rotulo="Minhas vistorias" />

      <header className="flex flex-col gap-(--e-15)">
        <p className="flex flex-wrap items-center gap-(--e-2) corpo-medio">
          <SeloDaVistoria situacao={vistoria.situacao} />
          <span>{quando}</span>
        </p>
        <h1 className="titulo-tela text-(--tinta)">{vistoria.titulo}</h1>
        <p className="corpo text-(--tinta-2)">{vistoria.empreendimentoNome}</p>
      </header>

      {erro ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErroDaVistoria(erro)}
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

      <dl className={`${classeCartao} px-(--e-3)`}>
        <Linha rotulo="Condicionante">
          <Link to={`/ocorrencias/${vistoria.ocorrenciaId}`}>
            {[vistoria.condicionanteCodigo, vistoria.condicionanteTitulo]
              .filter(Boolean)
              .join(' · ') || 'Ocorrência'}
          </Link>
        </Linha>
        {vistoria.licenca ? <Linha rotulo="Licença">{vistoria.licenca}</Linha> : null}
        <Linha rotulo="Unidade">
          {vistoria.unidadeNome}
          {vistoria.unidadeEndereco ? (
            <span className="block text-xs font-normal text-(--tinta-2)">
              {vistoria.unidadeEndereco}
            </span>
          ) : null}
        </Linha>
        <Linha rotulo="Responsável">{vistoria.responsavelNome ?? 'Sem responsável'}</Linha>
        <Linha rotulo="Prazo da condicionante">{formatarDataCivil(vistoria.prazoAtual)}</Linha>
        {vistoria.duracaoMinutos ? (
          <Linha rotulo="Duração">{vistoria.duracaoMinutos} min</Linha>
        ) : null}
        {vistoria.enviadaEm ? (
          <Linha rotulo="Enviada">
            {[vistoria.enviadaPorNome, formatarInstanteComHora(vistoria.enviadaEm, atual.fuso)]
              .filter(Boolean)
              .join(' · ')}
          </Linha>
        ) : null}
      </dl>

      <section aria-labelledby="titulo-preparacao" className="flex flex-col gap-(--e-15)">
        <h2 id="titulo-preparacao" className="titulo-secao">
          Preparação
        </h2>
        <Link
          to={checklist}
          className={`${classeCartao} flex min-h-11 items-center gap-(--e-3) p-(--e-3) text-(--tinta) no-underline hover:bg-(--toque) hover:no-underline`}
        >
          <Icone nome="file-check" className="text-(--icone)" />
          <span className="flex flex-1 flex-col">
            <span className="corpo-medio">Checklist da vistoria</span>
            <span className="text-xs text-(--tinta-2)">
              {totalItens === undefined
                ? '…'
                : `${String(totalItens)} ${totalItens === 1 ? 'item' : 'itens'}`}
            </span>
          </span>
          <Icone nome="chevron-right" className="text-(--icone)" />
        </Link>
      </section>

      {vistoria.objetivo ? (
        <section
          aria-labelledby="titulo-objetivo"
          className={`${classeCartao} flex flex-col gap-(--e-1) p-(--e-3)`}
        >
          <h2 id="titulo-objetivo" className="corpo-medio">
            Objetivo da visita
          </h2>
          <p className="corpo whitespace-pre-line text-(--tinta-2)">{vistoria.objetivo}</p>
        </section>
      ) : null}

      {vistoria.podeConferir ? (
        <BarraDeAcao>
          <Botao
            className={`${classeAlvo} flex-1`}
            onClick={() => {
              setDevolvendo(true)
            }}
          >
            Devolver
          </Botao>
          <Botao
            aparencia="primario"
            className={`${classeAlvo} flex-1`}
            disabled={aprovar.isPending}
            onClick={() => {
              aprovar.mutate()
            }}
          >
            {aprovar.isPending ? 'Aprovando…' : 'Aprovar'}
          </Botao>
        </BarraDeAcao>
      ) : vistoria.podeRegistrar && vistoria.situacao === 'planejada' ? (
        <BarraDeAcao>
          <Botao
            aparencia="primario"
            larguraTotal
            iconeDepois="arrow-right"
            className={classeAlvo}
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
          <Botao aparencia="primario" larguraTotal asChild className={classeAlvo}>
            <Link to={checklist}>Continuar vistoria</Link>
          </Botao>
        </BarraDeAcao>
      ) : null}

      {vistoria.podeConferir ? (
        <DialogoDevolver
          aberto={devolvendo}
          aoMudar={setDevolvendo}
          vistoria={vistoria}
          aoDevolver={() => {
            setDevolvendo(false)
            void recarregar()
          }}
        />
      ) : null}
    </ColunaCampo>
  )
}

/** /campo/:id (ADR-0033 §5): contexto, preparação, objetivo; começar, continuar ou conferir. */
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
