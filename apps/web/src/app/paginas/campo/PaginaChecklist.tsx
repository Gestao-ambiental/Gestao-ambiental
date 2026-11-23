import {
  LIMITES_DA_VISTORIA,
  RESULTADOS_DO_ITEM,
  ROTULO_DO_RESULTADO,
  aceitaRegistro,
  aplicarRascunho,
  exigeComentario,
  progressoDaVistoria,
  type ResultadoDoItem,
} from '@gestao-ambiental/domain'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'

import { Pagina } from '@/app/paginas/Pagina'
import { AvisoDeSaida } from '@/components/aviso-de-saida'
import { Carregando, EstadoErro } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { classeAreaTexto } from '@/components/ui/estilos-campo'
import { Icone, type NomeIcone } from '@/components/ui/icone'
import { Selo, type TomSelo } from '@/components/ui/selo'
import type { FotoDaVistoria, ItemDaVistoriaGravado, Vistoria } from '@/lib/api/vistorias'
import { filaDeCampo, type Pendencia } from '@/lib/campo/fila'
import { cn } from '@/lib/utils'

import { useFotosDaVistoria, useItensDaVistoria, useUrlsDasFotos, useVistoria } from './consultas'
import { classeAcaoPrincipal, classeAcaoSecundaria, classePainel } from './estilos'
import {
  BarraDeAcao,
  BarraDeProgresso,
  CampoObservacao,
  ColunaCampo,
  ComVistoria,
  Miniaturas,
  PainelDoEnvio,
  SituacaoDoEnvio,
  VoltarPara,
} from './pecas'
import { useFotosDoAparelho, useRascunhoDaVistoria } from './rascunho'

interface Registro {
  resultado: ResultadoDoItem
  comentario: string
}

type Resposta = (typeof RESULTADOS_DO_ITEM)[number]

/**
 * Cada resposta tem um ícone próprio (forma além da cor) e, escolhida, fundo e contorno duplo no
 * tom do estado. `aria-pressed` diz qual está marcada.
 */
const VISUAL_DA_RESPOSTA: Record<Resposta, { icone: NomeIcone; marcada: string }> = {
  conforme: {
    icone: 'check',
    marcada: 'border-(--ok-texto) bg-(--ok-fundo) text-(--ok-texto)',
  },
  nao_conforme: {
    icone: 'x',
    marcada: 'border-(--atraso-texto) bg-(--atraso-fundo) text-(--atraso-texto)',
  },
  nao_aplicavel: {
    icone: 'minus',
    marcada: 'border-(--tinta-2) bg-(--neutro-fundo) text-(--tinta)',
  },
  requer_avaliacao: {
    icone: 'circle-help',
    marcada: 'border-(--alerta-texto) bg-(--alerta-fundo) text-(--alerta-texto)',
  },
}

const TOM_DO_RESULTADO: Record<ResultadoDoItem, TomSelo> = {
  pendente: 'padrao',
  conforme: 'sucesso',
  nao_conforme: 'perigo',
  nao_aplicavel: 'padrao',
  requer_avaliacao: 'atencao',
}

function ItemDoChecklist({
  vistoria,
  item,
  noServidor,
  pendencias,
  posicao,
  fotos,
  urls,
  editavel,
  aoMudarNaoSalvo,
}: {
  vistoria: Vistoria
  /** O item como a técnica vê: o rascunho do aparelho por cima do servidor. */
  item: ItemDaVistoriaGravado
  /** Algo deste item já chegou ao servidor (resultado ou foto)? */
  noServidor: boolean
  /** Registros deste item ainda no aparelho. */
  pendencias: readonly Pendencia[]
  posicao: number
  fotos: readonly FotoDaVistoria[]
  urls: Readonly<Record<string, string>> | undefined
  editavel: boolean
  /** Há escolha ou comentário que ainda não foi guardado no aparelho? */
  aoMudarNaoSalvo: (itemId: string, naoSalvo: boolean) => void
}) {
  const idComentario = useId()
  const campoComentario = useRef<HTMLTextAreaElement>(null)
  const [resultado, setResultado] = useState<ResultadoDoItem>(item.resultado)
  const [comentario, setComentario] = useState(item.comentario ?? '')
  // O texto da caixa agora, para a gravação que termina saber se ele já mudou de novo.
  const comentarioDigitado = useRef(comentario)
  const [erroComentario, setErroComentario] = useState<string | null>(null)
  const [comentando, setComentando] = useState(false)
  // O registro que não coube no aparelho, para "Tentar de novo".
  const [naoGuardado, setNaoGuardado] = useState<Registro | null>(null)
  const doAparelho = useFotosDoAparelho(pendencias)

  // Grava primeiro no aparelho; a fila envia ao servidor quando puder (ADR-0060). Até o aparelho
  // confirmar, sair da tela pede confirmação.
  function guardar(registro: Registro) {
    aoMudarNaoSalvo(item.id, true)
    filaDeCampo
      .registrar({
        tipo: 'item',
        vistoriaId: vistoria.id,
        itemId: item.id,
        resultado: registro.resultado,
        comentario: registro.comentario.trim() || null,
        registradoEm: new Date().toISOString(),
      })
      .then(
        () => {
          setNaoGuardado(null)
          aoMudarNaoSalvo(item.id, comentarioDigitado.current.trim() !== registro.comentario.trim())
        },
        () => {
          setNaoGuardado(registro)
        },
      )
  }

  function gravar(registro: Registro) {
    if (registro.resultado === 'pendente') return
    if (exigeComentario(registro.resultado) && !registro.comentario.trim()) {
      setErroComentario('Informe o comentário')
      return
    }
    setErroComentario(null)
    guardar(registro)
  }

  useEffect(() => {
    if (comentando) campoComentario.current?.focus()
  }, [comentando])

  const exige = exigeComentario(resultado)
  const mostraComentario = exige || comentando || comentario.trim() !== ''
  const tituloId = `item-${item.id}-titulo`
  const registrado = item.resultado !== 'pendente'

  return (
    <li
      id={`item-${item.id}`}
      className="flex scroll-mt-24 flex-col gap-(--e-3) border-b border-(--regra-leve) px-(--e-4) py-(--e-4) last:border-b-0"
    >
      <div className="flex items-start gap-(--e-3)">
        <span
          aria-hidden
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-(--raio-mini) text-xs font-semibold numero',
            registrado ? 'bg-(--ok-fundo) text-(--ok-texto)' : 'bg-(--aperto) text-(--tinta-2)',
          )}
        >
          {registrado ? <Icone nome="check" tamanho={14} /> : posicao}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-(--e-05)">
          <h2 id={tituloId} className="titulo-secao text-(--tinta)">
            {item.titulo}
          </h2>
          {item.descricao ? <p className="corpo text-(--tinta-2)">{item.descricao}</p> : null}
        </div>
      </div>

      {editavel ? (
        <div role="group" aria-labelledby={tituloId} className="grid grid-cols-2 gap-(--e-2)">
          {RESULTADOS_DO_ITEM.map((opcao) => {
            const marcada = resultado === opcao
            const visual = VISUAL_DA_RESPOSTA[opcao]
            return (
              <button
                key={opcao}
                type="button"
                aria-pressed={marcada}
                onClick={() => {
                  setResultado(opcao)
                  gravar({ resultado: opcao, comentario })
                }}
                className={cn(
                  'flex min-h-13 cursor-pointer items-center justify-center gap-(--e-2) rounded-(--raio) border px-(--e-2) text-center corpo-medio transicao-estado active:translate-y-px',
                  marcada
                    ? cn('ring-1 ring-current ring-inset', visual.marcada)
                    : 'border-(--regra-forte) bg-(--folha) text-(--tinta) hover:bg-(--toque)',
                )}
              >
                <Icone nome={visual.icone} tamanho={18} />
                {ROTULO_DO_RESULTADO[opcao]}
              </button>
            )
          })}
        </div>
      ) : (
        <p>
          <Selo tom={TOM_DO_RESULTADO[item.resultado]}>{ROTULO_DO_RESULTADO[item.resultado]}</Selo>
        </p>
      )}

      {editavel && mostraComentario ? (
        <div className="flex flex-col gap-(--e-1)">
          <label htmlFor={idComentario} className="rotulo">
            Comentário{exige ? ' (obrigatório)' : ''}
          </label>
          <textarea
            ref={campoComentario}
            id={idComentario}
            rows={2}
            maxLength={LIMITES_DA_VISTORIA.comentario}
            value={comentario}
            aria-invalid={erroComentario ? true : undefined}
            aria-describedby={erroComentario ? `${idComentario}-erro` : undefined}
            className={cn(classeAreaTexto, 'min-h-16')}
            onChange={(evento) => {
              setComentario(evento.target.value)
              comentarioDigitado.current = evento.target.value
              if (evento.target.value.trim()) setErroComentario(null)
              aoMudarNaoSalvo(
                item.id,
                evento.target.value.trim() !== (item.comentario ?? '').trim(),
              )
            }}
            onBlur={() => {
              const guardado = item.comentario ?? ''
              if (resultado !== item.resultado || comentario.trim() !== guardado.trim())
                gravar({ resultado, comentario })
            }}
          />
          {erroComentario ? (
            <span id={`${idComentario}-erro`} className="rotulo text-(--atraso-texto)">
              {erroComentario}
            </span>
          ) : null}
        </div>
      ) : !editavel && item.comentario ? (
        <p className="corpo whitespace-pre-line text-(--tinta)">{item.comentario}</p>
      ) : null}

      <Miniaturas fotos={fotos} urls={urls} doAparelho={doAparelho} />

      {editavel ? (
        <div className="flex flex-wrap items-center gap-(--e-2)">
          <Botao asChild className="h-(--controle-toque) min-h-(--controle-toque)">
            <Link
              to={`/campo/${vistoria.id}/itens/${item.id}/foto`}
              aria-label={`Tirar foto: ${item.titulo}`}
            >
              <Icone nome="camera" />
              Tirar foto
            </Link>
          </Botao>
          {mostraComentario ? null : (
            <Botao
              aparencia="sutil"
              iconeAntes="message-square"
              className="h-(--controle-toque) min-h-(--controle-toque)"
              onClick={() => {
                setComentando(true)
              }}
            >
              Comentar
            </Botao>
          )}
          <span className="ml-auto">
            <SituacaoDoEnvio
              pendencias={pendencias}
              noServidor={noServidor}
              erroNoAparelho={naoGuardado !== null}
              aoGravarDeNovo={() => {
                if (naoGuardado) guardar(naoGuardado)
              }}
            />
          </span>
        </div>
      ) : null}
    </li>
  )
}

function Checklist({ vistoria }: { vistoria: Vistoria }) {
  const { hash } = useLocation()
  const itens = useItensDaVistoria(vistoria.id, true)
  const fotos = useFotosDaVistoria(vistoria.id, true)
  const urls = useUrlsDasFotos(vistoria.id, fotos.data ?? [])
  const rascunho = useRascunhoDaVistoria(vistoria.id)
  const editavel = vistoria.podeRegistrar && aceitaRegistro(vistoria.situacao)
  const carregado = itens.data !== undefined && fotos.data !== undefined && rascunho.carregado
  // Itens com escolha ou comentário que ainda não foram guardados no aparelho: sair da tela pede
  // confirmação, porque só aí eles se perderiam.
  const naoSalvos = useRef(new Set<string>())
  const [temNaoSalvo, setTemNaoSalvo] = useState(false)
  const mudarNaoSalvo = useCallback((itemId: string, naoSalvo: boolean) => {
    if (naoSalvo) naoSalvos.current.add(itemId)
    else naoSalvos.current.delete(itemId)
    setTemNaoSalvo(naoSalvos.current.size > 0)
  }, [])

  // Vindo da lista de pendências (#item-<id>): leva ao item.
  useEffect(() => {
    if (!carregado || !hash) return
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [carregado, hash])

  const voltar = { para: `/campo/${vistoria.id}`, rotulo: 'Vistoria' }
  const meta = [vistoria.empreendimentoNome, vistoria.licenca].filter(Boolean).join(' · ')

  // Sem sinal, a releitura falha, mas o que já foi lido continua na tela.
  if (!itens.data || !fotos.data || !rascunho.carregado) {
    if ((itens.isError && !itens.data) || (fotos.isError && !fotos.data)) {
      return (
        <ColunaCampo>
          <Pagina titulo="Checklist" voltar={voltar} meta={meta}>
            <EstadoErro
              titulo="Não foi possível carregar o checklist."
              aoTentarDeNovo={() => {
                void itens.refetch()
                void fotos.refetch()
              }}
            />
          </Pagina>
        </ColunaCampo>
      )
    }
    return (
      <ColunaCampo>
        <Pagina titulo="Checklist" voltar={voltar} meta={meta}>
          <Carregando rotulo="Carregando o checklist" linhas={4} />
        </Pagina>
      </ColunaCampo>
    )
  }

  const doServidor = itens.data
  const vistos = aplicarRascunho(doServidor, rascunho.registros)
  const progresso = progressoDaVistoria(vistos)
  const fotosDoServidor = fotos.data
  return (
    <ColunaCampo comBarra>
      <Pagina titulo="Checklist" voltar={voltar} meta={<span className="numero">{meta}</span>}>
        <div className="flex flex-col">
          <BarraDeProgresso {...progresso} fixa />
          {editavel || rascunho.contagem.total > 0 ? (
            <PainelDoEnvio vistoriaId={vistoria.id} />
          ) : null}
          <ul
            aria-label="Itens do checklist"
            className={cn(classePainel, 'mt-(--e-2) flex flex-col')}
          >
            {vistos.map((item, indice) => {
              const fotosDoItem = fotosDoServidor.filter((f) => f.itemId === item.id)
              return (
                <ItemDoChecklist
                  key={item.id}
                  vistoria={vistoria}
                  item={item}
                  noServidor={
                    doServidor[indice]?.resultado !== 'pendente' || fotosDoItem.length > 0
                  }
                  pendencias={rascunho.doItem(item.id)}
                  posicao={indice + 1}
                  fotos={fotosDoItem}
                  urls={urls.data}
                  editavel={editavel}
                  aoMudarNaoSalvo={mudarNaoSalvo}
                />
              )
            })}
          </ul>
        </div>

        <CampoObservacao vistoria={vistoria} editavel={editavel} />

        <AvisoDeSaida
          bloquear={() => naoSalvos.current.size > 0}
          sujo={temNaoSalvo}
          descricao="Um registro do checklist ainda não foi guardado no aparelho. Se sair agora, ele se perde."
        />

        <BarraDeAcao>
          <Botao aparencia="sutil" asChild className={classeAcaoSecundaria}>
            <Link to={`/campo/${vistoria.id}`}>Voltar</Link>
          </Botao>
          {editavel ? (
            <Botao aparencia="primario" asChild className={classeAcaoPrincipal}>
              <Link to={`/campo/${vistoria.id}/envio`}>
                Revisar envio
                <Icone nome="arrow-right" />
              </Link>
            </Botao>
          ) : null}
        </BarraDeAcao>
      </Pagina>
    </ColunaCampo>
  )
}

/**
 * /campo/:id/checklist (ADR-0033 §5, ADR-0060): resultado, comentário e fotos por item; observação
 * geral. Tudo vai primeiro para o aparelho e segue ao servidor quando houver conexão.
 */
export function PaginaChecklist() {
  const { id = '' } = useParams()
  const consulta = useVistoria(id)
  return (
    <ComVistoria
      consulta={consulta}
      voltar={<VoltarPara para={`/campo/${id}`} rotulo="Vistoria" />}
    >
      {(vistoria) => <Checklist vistoria={vistoria} />}
    </ComVistoria>
  )
}
