import {
  ITENS_SUGERIDOS,
  LIMITES_DA_VISTORIA,
  ehDataCivil,
  formatarDataCivil,
  hojeNoFuso,
  type DataCivil,
} from '@gestao-ambiental/domain'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Carregando, EstadoErro } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { CampoData } from '@/components/ui/campo-data'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { classeAreaTexto, classeCampo } from '@/components/ui/estilos-campo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { criarVistoria, listarVistorias } from '@/lib/api/vistorias'
import { mensagemDoErroDaVistoria } from '@/lib/erros'

import { SeloDaVistoria } from '../campo/pecas'
import { CabecalhoDeSecao, VazioDeSecao } from './pecas'

interface ItemDoFormulario {
  chave: string
  titulo: string
  descricao: string
}

function itensIniciais(): ItemDoFormulario[] {
  return ITENS_SUGERIDOS.map((item) => ({
    chave: crypto.randomUUID(),
    titulo: item.titulo,
    descricao: item.descricao ?? '',
  }))
}

type Erros = Partial<Record<'titulo' | 'data' | 'duracao' | 'responsavel' | 'itens', string>>

function DialogoAgendar({
  ocorrenciaId,
  membros,
  aoFechar,
}: {
  ocorrenciaId: string
  membros: readonly { id: string; nome: string }[]
  aoFechar: (agendou: boolean) => void
}) {
  const { atual } = useConsultoria()
  const idBase = useId()
  // Id gerado ao abrir: repetir depois de erro de rede não agenda outra vistoria.
  const [id] = useState(() => crypto.randomUUID())
  const [titulo, setTitulo] = useState('')
  const [data, setData] = useState<DataCivil | null>(null)
  const [hora, setHora] = useState('')
  const [duracao, setDuracao] = useState('')
  const [responsavelId, setResponsavelId] = useState(atual.membroId)
  const [objetivo, setObjetivo] = useState('')
  const [itens, setItens] = useState(itensIniciais)
  const [erros, setErros] = useState<Erros>({})

  const salvar = useMutation({
    mutationFn: (dataPlanejada: DataCivil) =>
      criarVistoria(id, ocorrenciaId, {
        titulo: titulo.trim(),
        objetivo: objetivo.trim() || null,
        responsavelId,
        data: dataPlanejada,
        hora: hora || null,
        duracaoMinutos: duracao ? Number(duracao) : null,
        itens: itens.map((i) => ({
          titulo: i.titulo.trim(),
          descricao: i.descricao.trim() || null,
        })),
      }),
    onSuccess: () => {
      aoFechar(true)
    },
  })

  function validar(): Erros {
    const novos: Erros = {}
    if (!titulo.trim()) novos.titulo = 'Informe o título'
    if (!data) novos.data = 'Informe a data'
    if (!responsavelId) novos.responsavel = 'Escolha o responsável'
    if (duracao) {
      const minutos = Number(duracao)
      if (
        !Number.isInteger(minutos) ||
        minutos < LIMITES_DA_VISTORIA.duracaoMinima ||
        minutos > LIMITES_DA_VISTORIA.duracaoMaxima
      )
        novos.duracao = 'De 5 a 1.440 minutos'
    }
    if (itens.length === 0) novos.itens = 'Inclua ao menos um item'
    else if (itens.some((i) => !i.titulo.trim())) novos.itens = 'Informe o título de cada item'
    return novos
  }

  function mudarItem(chave: string, campo: 'titulo' | 'descricao', valor: string) {
    setItens((atuais) => atuais.map((i) => (i.chave === chave ? { ...i, [campo]: valor } : i)))
  }

  return (
    <Dialogo
      aberto
      aoMudar={(aberto) => {
        if (!aberto) aoFechar(false)
      }}
      titulo="Agendar vistoria"
      largura={560}
      acoes={
        <>
          <Botao
            onClick={() => {
              aoFechar(false)
            }}
          >
            Cancelar
          </Botao>
          <Botao
            aparencia="primario"
            disabled={salvar.isPending}
            onClick={() => {
              const novos = validar()
              setErros(novos)
              if (Object.keys(novos).length === 0 && data) salvar.mutate(data)
            }}
          >
            {salvar.isPending ? 'Agendando…' : 'Agendar'}
          </Botao>
        </>
      }
    >
      {salvar.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErroDaVistoria(salvar.error)}
        </MensagemSecao>
      ) : null}
      <CampoTexto
        rotulo="Título"
        value={titulo}
        maxLength={LIMITES_DA_VISTORIA.titulo}
        erro={erros.titulo}
        onChange={(evento) => {
          setTitulo(evento.target.value)
        }}
      />
      <div className="grid gap-(--e-3) sm:grid-cols-3">
        <CampoData
          rotulo="Data"
          hoje={hojeNoFuso(new Date(), atual.fuso)}
          valor={data}
          erro={erros.data}
          aoMudar={(nova) => {
            setData(nova && ehDataCivil(nova) ? nova : null)
          }}
        />
        <CampoTexto
          rotulo="Hora"
          type="time"
          value={hora}
          onChange={(evento) => {
            setHora(evento.target.value)
          }}
        />
        <CampoTexto
          rotulo="Duração (min)"
          inputMode="numeric"
          value={duracao}
          erro={erros.duracao}
          onChange={(evento) => {
            setDuracao(evento.target.value.replace(/\D/g, ''))
          }}
        />
      </div>
      <label className="flex flex-col gap-(--e-1)">
        <span className="rotulo">Responsável</span>
        <select
          className={classeCampo}
          value={responsavelId}
          aria-invalid={erros.responsavel ? true : undefined}
          onChange={(evento) => {
            setResponsavelId(evento.target.value)
          }}
        >
          {membros.some((m) => m.id === responsavelId) ? null : (
            <option value={responsavelId}>Eu</option>
          )}
          {membros.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-(--e-1)">
        <label htmlFor={`${idBase}-objetivo`} className="rotulo">
          Objetivo
        </label>
        <textarea
          id={`${idBase}-objetivo`}
          rows={2}
          maxLength={LIMITES_DA_VISTORIA.objetivo}
          value={objetivo}
          className={classeAreaTexto}
          onChange={(evento) => {
            setObjetivo(evento.target.value)
          }}
        />
      </div>
      <fieldset className="flex flex-col gap-(--e-2)">
        <legend className="mb-(--e-1) rotulo">Itens do checklist</legend>
        {erros.itens ? (
          <span role="alert" className="text-xs text-(--atraso-texto)">
            {erros.itens}
          </span>
        ) : null}
        <ol className="flex flex-col gap-(--e-2)">
          {itens.map((item, indice) => (
            <li key={item.chave} className="flex items-start gap-(--e-2)">
              <div className="grid flex-1 gap-(--e-15) sm:grid-cols-2">
                <CampoTexto
                  rotulo={`Item ${String(indice + 1)}`}
                  value={item.titulo}
                  maxLength={LIMITES_DA_VISTORIA.tituloDoItem}
                  onChange={(evento) => {
                    mudarItem(item.chave, 'titulo', evento.target.value)
                  }}
                />
                <CampoTexto
                  rotulo={`Descrição do item ${String(indice + 1)}`}
                  value={item.descricao}
                  maxLength={LIMITES_DA_VISTORIA.descricaoDoItem}
                  onChange={(evento) => {
                    mudarItem(item.chave, 'descricao', evento.target.value)
                  }}
                />
              </div>
              <BotaoIcone
                icone="trash-2"
                rotulo={`Remover item ${String(indice + 1)}`}
                className="mt-6"
                onClick={() => {
                  setItens((atuais) => atuais.filter((i) => i.chave !== item.chave))
                }}
              />
            </li>
          ))}
        </ol>
        {itens.length < LIMITES_DA_VISTORIA.itens ? (
          <div>
            <Botao
              tamanho="compacto"
              iconeAntes="plus"
              onClick={() => {
                setItens((atuais) => [
                  ...atuais,
                  { chave: crypto.randomUUID(), titulo: '', descricao: '' },
                ])
              }}
            >
              Adicionar item
            </Botao>
          </div>
        ) : null}
      </fieldset>
    </Dialogo>
  )
}

/** Vistorias da ocorrência (ADR-0033, CAMPO-01): lista e agendamento. Concluída não agenda. */
export function SecaoVistorias({
  ocorrenciaId,
  membros,
  podeAgendar,
}: {
  ocorrenciaId: string
  membros: readonly { id: string; nome: string }[]
  podeAgendar: boolean
}) {
  const { atual } = useConsultoria()
  const queryClient = useQueryClient()
  const [agendando, setAgendando] = useState(false)
  const consulta = useInfiniteQuery({
    queryKey: ['vistorias', atual.consultoriaId, 'ocorrencia', ocorrenciaId],
    queryFn: ({ pageParam }) =>
      listarVistorias({
        consultoriaId: atual.consultoriaId,
        ocorrenciaId,
        somenteMinhas: false,
        deslocamento: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (pagina) => pagina.proxima,
  })
  const vistorias = consulta.data?.pages.flatMap((p) => p.itens) ?? []

  return (
    <section aria-labelledby="titulo-vistorias" className="flex flex-col">
      <CabecalhoDeSecao
        id="titulo-vistorias"
        titulo="Vistorias"
        acao={
          podeAgendar ? (
            <Botao
              aparencia="sutil"
              tamanho="compacto"
              iconeAntes="plus"
              onClick={() => {
                setAgendando(true)
              }}
            >
              Agendar vistoria
            </Botao>
          ) : null
        }
      />
      {consulta.isPending ? (
        <Carregando rotulo="Carregando as vistorias" linhas={2} className="mt-(--e-2)" />
      ) : consulta.isError ? (
        <EstadoErro
          className="mt-(--e-2)"
          titulo="Não foi possível carregar as vistorias."
          aoTentarDeNovo={() => void consulta.refetch()}
        />
      ) : vistorias.length === 0 ? (
        <VazioDeSecao>Nenhuma vistoria.</VazioDeSecao>
      ) : (
        <ul className="flex flex-col" aria-label="Vistorias">
          {vistorias.map((v) => (
            <li
              key={v.id}
              className="flex min-h-(--linha) flex-wrap items-center gap-x-(--e-3) gap-y-(--e-1) border-b border-(--regra-leve) py-(--e-2)"
            >
              <span className="flex min-w-0 flex-1 basis-[200px] flex-col">
                <Link to={`/campo/${v.id}`} className="corpo-medio">
                  {v.titulo}
                </Link>
                <span className="text-xs text-(--tinta-2) numero">
                  {[
                    `${formatarDataCivil(v.dataPlanejada)}${v.horaPlanejada ? ` às ${v.horaPlanejada}` : ''}`,
                    v.responsavelNome,
                    `${String(v.itensRegistrados)} de ${String(v.totalItens)} itens`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <SeloDaVistoria situacao={v.situacao} />
            </li>
          ))}
        </ul>
      )}
      {consulta.hasNextPage ? (
        <div className="pt-(--e-2)">
          <Botao
            aparencia="sutil"
            tamanho="compacto"
            disabled={consulta.isFetchingNextPage}
            onClick={() => void consulta.fetchNextPage()}
          >
            Mostrar mais vistorias
          </Botao>
        </div>
      ) : null}
      {agendando ? (
        <DialogoAgendar
          ocorrenciaId={ocorrenciaId}
          membros={membros}
          aoFechar={(agendou) => {
            setAgendando(false)
            if (agendou) void queryClient.invalidateQueries({ queryKey: ['vistorias'] })
          }}
        />
      ) : null}
    </section>
  )
}
