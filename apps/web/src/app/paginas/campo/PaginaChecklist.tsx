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
import { useEffect, useId, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'

import { Carregando, EstadoErro } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { Selo } from '@/components/ui/selo'
import {
  registrarItemDaVistoria,
  type FotoDaVistoria,
  type ItemDaVistoriaGravado,
  type Vistoria,
} from '@/lib/api/vistorias'

import {
  chaveDaVistoria,
  useFotosDaVistoria,
  useItensDaVistoria,
  useUrlsDasFotos,
  useVistoria,
} from './consultas'
import { classeAlvo, classeAreaTexto } from './estilos'
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

function ItemDoChecklist({
  vistoria,
  item,
  fotos,
  urls,
  editavel,
}: {
  vistoria: Vistoria
  item: ItemDaVistoriaGravado
  fotos: readonly FotoDaVistoria[]
  urls: Readonly<Record<string, string>> | undefined
  editavel: boolean
}) {
  const queryClient = useQueryClient()
  const idComentario = useId()
  const [resultado, setResultado] = useState<ResultadoDoItem>(item.resultado)
  const [comentario, setComentario] = useState(item.comentario ?? '')
  const [erroComentario, setErroComentario] = useState<string | null>(null)

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

  const exige = exigeComentario(resultado)
  const tituloId = `item-${item.id}-titulo`

  return (
    <li
      id={`item-${item.id}`}
      className="flex flex-col gap-(--e-2) border-b py-(--e-3) last:border-b-0"
    >
      <div className="flex items-start gap-(--e-2)">
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 id={tituloId} className="corpo-medio">
            {item.titulo}
          </h2>
          {item.descricao ? <p className="text-xs text-(--tinta-2)">{item.descricao}</p> : null}
        </div>
        {editavel ? (
          <Link
            to={`/campo/${vistoria.id}/itens/${item.id}/foto`}
            aria-label={`Tirar foto: ${item.titulo}`}
            title="Tirar foto"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-(--raio) border border-(--regra-forte) bg-(--folha) text-(--icone) transicao-estado hover:bg-(--toque)"
          >
            <Icone nome="image" />
          </Link>
        ) : null}
      </div>

      {editavel ? (
        <div role="group" aria-labelledby={tituloId} className="grid grid-cols-2 gap-(--e-15)">
          {RESULTADOS_DO_ITEM.map((opcao) => (
            <Botao
              key={opcao}
              className={`${classeAlvo} whitespace-normal`}
              selecionado={resultado === opcao}
              disabled={salvar.isPending}
              onClick={() => {
                setResultado(opcao)
                gravar({ resultado: opcao, comentario })
              }}
            >
              {ROTULO_DO_RESULTADO[opcao]}
            </Botao>
          ))}
        </div>
      ) : (
        <p>
          <Selo
            tom={
              item.resultado === 'nao_conforme'
                ? 'perigo'
                : item.resultado === 'requer_avaliacao'
                  ? 'atencao'
                  : 'padrao'
            }
          >
            {ROTULO_DO_RESULTADO[item.resultado]}
          </Selo>
        </p>
      )}

      {editavel ? (
        <div className="flex flex-col gap-(--e-1)">
          <label htmlFor={idComentario} className="rotulo">
            Comentário{exige ? ' (obrigatório)' : ''}
          </label>
          <textarea
            id={idComentario}
            rows={2}
            maxLength={LIMITES_DA_VISTORIA.comentario}
            value={comentario}
            aria-invalid={erroComentario ? true : undefined}
            aria-describedby={erroComentario ? `${idComentario}-erro` : undefined}
            className={classeAreaTexto}
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
            <span id={`${idComentario}-erro`} className="text-xs text-(--atraso-texto)">
              {erroComentario}
            </span>
          ) : null}
        </div>
      ) : item.comentario ? (
        <p className="corpo whitespace-pre-line">{item.comentario}</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-(--e-2)">
        <span className="text-xs text-(--tinta-2)">
          {fotos.length} {fotos.length === 1 ? 'foto' : 'fotos'}
        </span>
        {editavel ? (
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
        ) : null}
      </div>
      <Miniaturas fotos={fotos} urls={urls} />
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

  const voltar = <VoltarPara para={`/campo/${vistoria.id}`} rotulo="Detalhe da visita" />

  if (itens.isError || fotos.isError) {
    return (
      <ColunaCampo>
        {voltar}
        <h1 className="titulo-tela text-(--tinta)">Checklist</h1>
        <EstadoErro
          titulo="Não foi possível carregar o checklist."
          aoTentarDeNovo={() => {
            void itens.refetch()
            void fotos.refetch()
          }}
        />
      </ColunaCampo>
    )
  }
  if (itens.isPending || fotos.isPending) {
    return (
      <ColunaCampo>
        {voltar}
        <h1 className="titulo-tela text-(--tinta)">Checklist</h1>
        <Carregando rotulo="Carregando o checklist" linhas={4} />
      </ColunaCampo>
    )
  }

  const progresso = progressoDaVistoria(itens.data)
  return (
    <ColunaCampo>
      {voltar}
      <header className="flex flex-col gap-(--e-1)">
        <p className="text-xs text-(--tinta-2)">
          {[vistoria.empreendimentoNome, vistoria.licenca].filter(Boolean).join(' · ')}
        </p>
        <h1 className="titulo-tela text-(--tinta)">Checklist</h1>
      </header>
      <BarraDeProgresso {...progresso} />

      <ul aria-label="Itens do checklist" className="flex flex-col">
        {itens.data.map((item) => (
          <ItemDoChecklist
            key={item.id}
            vistoria={vistoria}
            item={item}
            fotos={fotos.data.filter((f) => f.itemId === item.id)}
            urls={urls.data}
            editavel={editavel}
          />
        ))}
      </ul>

      <CampoObservacao vistoria={vistoria} editavel={editavel} />

      <BarraDeAcao>
        <Botao asChild className={`${classeAlvo} flex-1`}>
          <Link to={`/campo/${vistoria.id}`}>Voltar</Link>
        </Botao>
        {editavel ? (
          <Botao aparencia="primario" asChild className={`${classeAlvo} flex-[2]`}>
            <Link to={`/campo/${vistoria.id}/envio`}>Revisar envio</Link>
          </Botao>
        ) : null}
      </BarraDeAcao>
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
      voltar={<VoltarPara para={`/campo/${id}`} rotulo="Detalhe da visita" />}
    >
      {(vistoria) => <Checklist vistoria={vistoria} />}
    </ComVistoria>
  )
}
