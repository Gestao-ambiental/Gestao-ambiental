import {
  LIMITES_DA_VISTORIA,
  RESULTADOS_DO_ITEM,
  ROTULO_DO_RESULTADO,
  aceitaRegistro,
  exigeComentario,
  progressoDaVistoria,
  type ResultadoDoItem,
} from '@gestao-ambiental/domain'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'

import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { classeAreaTexto } from '@/components/ui/estilos-campo'
import { Icone, type NomeIcone } from '@/components/ui/icone'
import { Selo, type TomSelo } from '@/components/ui/selo'
import {
  registrarItemDaVistoria,
  type FotoDaVistoria,
  type ItemDaVistoriaGravado,
  type Vistoria,
} from '@/lib/api/vistorias'
import { cn } from '@/lib/utils'

import {
  chaveDaVistoria,
  useFotosDaVistoria,
  useItensDaVistoria,
  useUrlsDasFotos,
  useVistoria,
} from './consultas'
import { classeAcaoPrincipal, classeAcaoSecundaria, classePainel } from './estilos'
import {
  BarraDeAcao,
  BarraDeProgresso,
  CampoObservacao,
  ColunaCampo,
  ComVistoria,
  Miniaturas,
  SituacaoDaGravacao,
  VoltarPara,
} from './pecas'

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
  posicao,
  fotos,
  urls,
  editavel,
}: {
  vistoria: Vistoria
  item: ItemDaVistoriaGravado
  posicao: number
  fotos: readonly FotoDaVistoria[]
  urls: Readonly<Record<string, string>> | undefined
  editavel: boolean
}) {
  const queryClient = useQueryClient()
  const idComentario = useId()
  const campoComentario = useRef<HTMLTextAreaElement>(null)
  const [resultado, setResultado] = useState<ResultadoDoItem>(item.resultado)
  const [comentario, setComentario] = useState(item.comentario ?? '')
  const [erroComentario, setErroComentario] = useState<string | null>(null)
  const [comentando, setComentando] = useState(false)

  const salvar = useMutation({
    mutationFn: (registro: Registro) =>
      registrarItemDaVistoria(item.id, registro.resultado, registro.comentario.trim() || null),
    onSuccess: (_, registro) => {
      // Só o que chegou ao banco entra no progresso.
      queryClient.setQueryData<ItemDaVistoriaGravado[]>(
        [...chaveDaVistoria(vistoria.id), 'itens'],
        (itens) =>
          itens?.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  resultado: registro.resultado,
                  comentario: registro.comentario.trim() || null,
                }
              : i,
          ),
      )
      void queryClient.invalidateQueries({ queryKey: ['vistorias'] })
    },
  })

  function gravar(registro: Registro) {
    if (registro.resultado === 'pendente') return
    if (exigeComentario(registro.resultado) && !registro.comentario.trim()) {
      setErroComentario('Informe o comentário')
      return
    }
    setErroComentario(null)
    salvar.mutate(registro)
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
            'flex size-7 shrink-0 items-center justify-center rounded-(--raio-mini) text-xs font-[800] numero',
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
                disabled={salvar.isPending}
                onClick={() => {
                  setResultado(opcao)
                  gravar({ resultado: opcao, comentario })
                }}
                className={cn(
                  'flex min-h-13 cursor-pointer items-center justify-center gap-(--e-2) rounded-(--raio) border px-(--e-2) text-center corpo-medio transicao-estado active:translate-y-px disabled:cursor-wait',
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
              if (evento.target.value.trim()) setErroComentario(null)
            }}
            onBlur={() => {
              const salvo = item.comentario ?? ''
              if (resultado !== item.resultado || comentario.trim() !== salvo.trim())
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

      <Miniaturas fotos={fotos} urls={urls} />

      {editavel ? (
        <div className="flex flex-wrap items-center gap-(--e-2)">
          <Botao asChild className="h-11 min-h-11">
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
              className="h-11 min-h-11"
              onClick={() => {
                setComentando(true)
              }}
            >
              Comentar
            </Botao>
          )}
          <span className="ml-auto">
            <SituacaoDaGravacao
              estado={
                salvar.isPending
                  ? 'salvando'
                  : salvar.isError
                    ? 'erro'
                    : salvar.isSuccess
                      ? 'salvo'
                      : null
              }
              erro={salvar.error}
              aoTentarDeNovo={() => {
                if (salvar.variables) salvar.mutate(salvar.variables)
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
  const editavel = vistoria.podeRegistrar && aceitaRegistro(vistoria.situacao)
  const carregado = itens.isSuccess

  // Vindo da lista de pendências (#item-<id>): leva ao item.
  useEffect(() => {
    if (!carregado || !hash) return
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [carregado, hash])

  const voltar = { para: `/campo/${vistoria.id}`, rotulo: 'Vistoria' }
  const meta = [vistoria.empreendimentoNome, vistoria.licenca].filter(Boolean).join(' · ')

  if (itens.isError || fotos.isError) {
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
  if (itens.isPending || fotos.isPending) {
    return (
      <ColunaCampo>
        <Pagina titulo="Checklist" voltar={voltar} meta={meta}>
          <Carregando rotulo="Carregando o checklist" linhas={4} />
        </Pagina>
      </ColunaCampo>
    )
  }

  const progresso = progressoDaVistoria(itens.data)
  return (
    <ColunaCampo comBarra>
      <Pagina titulo="Checklist" voltar={voltar} meta={<span className="numero">{meta}</span>}>
        <div className="flex flex-col">
          <BarraDeProgresso {...progresso} fixa />
          <ul
            aria-label="Itens do checklist"
            className={cn(classePainel, 'mt-(--e-2) flex flex-col')}
          >
            {itens.data.map((item, indice) => (
              <ItemDoChecklist
                key={item.id}
                vistoria={vistoria}
                item={item}
                posicao={indice + 1}
                fotos={fotos.data.filter((f) => f.itemId === item.id)}
                urls={urls.data}
                editavel={editavel}
              />
            ))}
          </ul>
        </div>

        <CampoObservacao vistoria={vistoria} editavel={editavel} />

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

/** /campo/:id/checklist (ADR-0033 §5): resultado, comentário e fotos por item; observação geral. */
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
