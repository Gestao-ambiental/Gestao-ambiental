import { formatarDataCivil, hojeNoFuso } from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { useSessao } from '@/app/sessao/contexto-sessao'
import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { obterOcorrencia } from '@/lib/api/ocorrencias'
import { listarPrazos } from '@/lib/api/prazos'
import { mensagemDoErro } from '@/lib/erros'
import { usuarioDaSessaoLocal } from '@/lib/supabase'
import { prepararAplicativo } from '@/lib/vistoria/app-offline'
import {
  habilitarVinculoOffline,
  lerVistorias,
  salvarVistoria,
  useConectado,
  type VistoriaNoDispositivo,
} from '@/lib/vistoria/dispositivo'

import { RegistroEmCampo } from './RegistroEmCampo'

const TAMANHO_PAGINA = 15
const filtros = {
  aba: 'minhas' as const,
  responsavelId: null,
  semResponsavel: false,
  tipoId: null,
  empreendimentoId: null,
}

export function PaginaVistorias() {
  const { atual } = useConsultoria()
  const { sessao } = useSessao()
  const conectado = useConectado()
  const usuario = sessao?.user.id ?? (conectado ? undefined : usuarioDaSessaoLocal())
  const escopo = `${usuario ?? ''}/${atual.consultoriaId}/${atual.membroId}`
  const idConsultoria = atual.consultoriaId
  const [pagina, setPagina] = useState(0)
  const [busca, setBusca] = useSearchParams()
  const [recibo, setRecibo] = useState<number>()
  const idAberto = busca.get('ocorrencia')
  const topo = useRef<HTMLElement>(null)
  const cliente = useQueryClient()
  const locais = useQuery({
    queryKey: ['campo-local', escopo],
    networkMode: 'always',
    enabled: Boolean(usuario),
    queryFn: () => lerVistorias(escopo),
  })
  const atribuidas = useQuery({
    queryKey: ['campo-atribuicoes', idConsultoria, atual.membroId, pagina],
    enabled: conectado && Boolean(sessao) && !idAberto,
    queryFn: () => listarPrazos(idConsultoria, filtros, null, 'prazo', pagina, TAMANHO_PAGINA),
  })
  const itensLocais = locais.data ?? []
  const aberta = itensLocais.find((item) => item.ocorrencia.id === idAberto)

  useEffect(() => {
    if (conectado && import.meta.env.PROD) void prepararAplicativo().catch(() => undefined)
  }, [conectado])
  useEffect(() => {
    topo.current?.scrollIntoView({ block: 'start' })
  }, [idAberto])

  function abrir(id: string) {
    setRecibo(undefined)
    setBusca({ ocorrencia: id })
  }

  const preparar = useMutation({
    mutationFn: async (id: string) => {
      if (!usuario || !sessao || !conectado) throw new Error('Conecte-se para preparar a vistoria.')
      const ocorrencia = await obterOcorrencia(id)
      if (
        ocorrencia?.consultoriaId !== idConsultoria ||
        ocorrencia.situacao !== 'aberta' ||
        ocorrencia.responsavelId !== atual.membroId
      ) {
        throw new Error(
          'A ocorrência precisa estar aberta e atribuída a você para preparar uma vistoria.',
        )
      }
      await prepararAplicativo()
      if (usuarioDaSessaoLocal() !== usuario)
        throw new Error('Entre novamente para preparar a vistoria.')
      habilitarVinculoOffline(usuario, atual)
      if ('storage' in navigator && 'persist' in navigator.storage) {
        void navigator.storage.persist().catch(() => undefined)
      }
      const existente = itensLocais.find((item) => item.ocorrencia.id === id)
      const { codigo, titulo, textoLiteral, empreendimentoNome, unidadeNome, prazoAtual, licenca } =
        ocorrencia
      const resumo = {
        id,
        consultoriaId: idConsultoria,
        codigo,
        titulo,
        textoLiteral,
        empreendimentoNome,
        unidadeNome,
        prazoAtual,
        licenca,
      }
      if (existente) return salvarVistoria({ ...existente, ocorrencia: resumo })
      const guarda: VistoriaNoDispositivo = {
        chave: [escopo, id],
        ocorrencia: resumo,
        evidenciaId: crypto.randomUUID(),
        revisao: 0,
        rascunho: {
          dataExecucao: hojeNoFuso(new Date(), atual.fuso),
          resultado: '',
          area: '',
          acompanhante: '',
          observacao: '',
          localizacao: null,
          foto: null,
        },
        envio: null,
      }
      return salvarVistoria(guarda)
    },
    onSuccess: (salva) => {
      cliente.setQueryData<VistoriaNoDispositivo[]>(['campo-local', escopo], (anteriores) => [
        ...(anteriores ?? []).filter((outro) => outro.ocorrencia.id !== salva.ocorrencia.id),
        salva,
      ])
      abrir(salva.ocorrencia.id)
    },
  })

  async function enviado(numero: number) {
    setBusca({})
    setRecibo(numero)
    await Promise.all([
      locais.refetch(),
      cliente.invalidateQueries({
        predicate: ({ queryKey }) =>
          ['campo-atribuicoes', 'ocorrencia', 'evidencias', 'prazos'].includes(String(queryKey[0])),
      }),
    ])
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="flex flex-col gap-2" ref={topo}>
        {idAberto ? (
          <button
            type="button"
            className="flex min-h-11 w-fit items-center gap-2 text-(--text-link)"
            onClick={() => {
              setBusca({})
              void locais.refetch()
            }}
          >
            <Icone nome="arrow-left" /> Minhas vistorias
          </button>
        ) : null}
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="titulo-tela">{aberta?.ocorrencia.titulo ?? 'Minhas vistorias'}</h1>
          <p role="status" className="rounded-full border px-3 py-1 text-xs text-(--text-subtle)">
            {conectado ? 'Com conexão' : 'Sem sinal'}
          </p>
        </div>
        <p className="text-(--text-subtle)">{atual.consultoriaNome}</p>
      </header>

      {locais.isError ? (
        <p role="alert">
          Não foi possível acessar o armazenamento do aparelho. Verifique as configurações do
          navegador.
        </p>
      ) : locais.isPending ? (
        <p role="status">Carregando vistorias do aparelho…</p>
      ) : idAberto ? (
        aberta && usuario ? (
          <RegistroEmCampo
            key={aberta.evidenciaId}
            inicial={aberta}
            usuario={usuario}
            fuso={atual.fuso}
            conectado={conectado}
            aoEnviar={enviado}
            aoRemover={async () => {
              setBusca({})
              await locais.refetch()
            }}
          />
        ) : (
          <p role="alert">Esta vistoria ainda não foi preparada neste aparelho.</p>
        )
      ) : (
        <>
          {recibo !== undefined ? (
            <p role="status" className="rounded-(--radius) border bg-(--surface) p-4">
              Evidência v{recibo} recebida pelo Grama. A vistoria segue para conferência.
            </p>
          ) : null}
          {itensLocais.length > 0 ? (
            <section className="space-y-3" aria-labelledby="titulo-no-aparelho">
              <h2 className="titulo-secao" id="titulo-no-aparelho">
                Neste aparelho
              </h2>
              <ul className="grid gap-2">
                {itensLocais.map((item) => (
                  <li
                    key={item.evidenciaId}
                    className="rounded-(--radius) border bg-(--surface) p-4"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        abrir(item.ocorrencia.id)
                      }}
                      className="flex min-h-11 w-full items-center justify-between gap-4 text-left"
                    >
                      <span className="min-w-0 break-words">
                        <span className="block corpo-medio">{item.ocorrencia.titulo}</span>
                        <span className="block text-xs text-(--text-subtle)">
                          {item.ocorrencia.unidadeNome} ·{' '}
                          {item.envio ? 'Envio pendente' : 'Disponível offline'}
                        </span>
                      </span>
                      <Icone nome="chevron-right" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {!conectado && itensLocais.length === 0 ? (
            <p>Sem vistorias neste aparelho. Prepare uma ocorrência quando voltar a ter conexão.</p>
          ) : null}
          {conectado ? (
            <section aria-labelledby="titulo-atribuidas" className="space-y-3">
              <h2 id="titulo-atribuidas" className="titulo-secao">
                Ocorrências atribuídas a mim
              </h2>
              <p className="text-(--text-subtle)">
                Prepare cada vistoria com internet no aparelho que você vai levar a campo. O acesso
                offline vale por até 24 horas.
              </p>
              {preparar.isError ? (
                <p role="alert">
                  {preparar.error instanceof Error
                    ? preparar.error.message
                    : mensagemDoErro(preparar.error)}
                </p>
              ) : null}
              {atribuidas.isPending ? (
                <p role="status">Buscando suas ocorrências…</p>
              ) : atribuidas.isError ? (
                <div role="alert">
                  <p>Não foi possível buscar suas ocorrências.</p>
                  <Botao className="min-h-11" onClick={() => void atribuidas.refetch()}>
                    Tentar de novo
                  </Botao>
                </div>
              ) : atribuidas.data.itens.length ? (
                <ul className="grid gap-3">
                  {atribuidas.data.itens.map((item) => {
                    const pronta = itensLocais.some((local) => local.ocorrencia.id === item.id)
                    return (
                      <li
                        key={item.id}
                        className="space-y-2 rounded-(--radius) border bg-(--surface) p-4"
                      >
                        <div className="flex flex-wrap justify-between gap-2 text-xs text-(--text-subtle)">
                          <span>{item.codigo ?? 'Condicionante'}</span>
                          <span>Prazo {formatarDataCivil(item.prazo)}</span>
                        </div>
                        <h3 className="break-words corpo-medio">{item.titulo}</h3>
                        <p className="break-words text-(--text-subtle)">
                          {item.empreendimentoNome} · {item.unidadeNome}
                        </p>
                        {item.emConferencia ? (
                          <Link
                            to={`/ocorrencias/${item.id}`}
                            className="inline-flex min-h-11 items-center text-(--text-link)"
                          >
                            Em conferência · acompanhar
                          </Link>
                        ) : (
                          <Botao
                            className="min-h-11"
                            aparencia={pronta ? 'padrao' : 'primario'}
                            iconeAntes="download"
                            disabled={preparar.isPending}
                            onClick={() => {
                              preparar.mutate(item.id)
                            }}
                          >
                            {preparar.isPending && preparar.variables === item.id
                              ? 'Preparando…'
                              : pronta
                                ? 'Renovar acesso offline'
                                : 'Preparar para usar offline'}
                          </Botao>
                        )}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p>Nenhuma ocorrência atribuída a você nesta página.</p>
              )}
              <nav aria-label="Paginação das ocorrências" className="flex justify-between gap-2">
                {pagina > 0 ? (
                  <Botao
                    className="min-h-11"
                    onClick={() => {
                      setPagina(pagina - 1)
                    }}
                  >
                    Página anterior
                  </Botao>
                ) : null}
                {(atribuidas.data?.total ?? 0) > (pagina + 1) * TAMANHO_PAGINA ? (
                  <Botao
                    className="ml-auto min-h-11"
                    onClick={() => {
                      setPagina(pagina + 1)
                    }}
                  >
                    Próxima página
                  </Botao>
                ) : null}
              </nav>
            </section>
          ) : null}

          <details className="rounded-(--radius) border bg-(--surface) p-4">
            <summary className="cursor-pointer corpo-medio">Instalar no celular</summary>
            <p className="mt-2 text-(--text-subtle)">
              No Android, abra o menu do Chrome e escolha Instalar app ou Adicionar à tela inicial.
              No iPhone, use Compartilhar no Safari e selecione Adicionar à Tela de Início.
            </p>
            <p className="mt-2 text-(--text-subtle)">
              Abra o app instalado com internet, entre com sua conta e prepare as vistorias por lá.
            </p>
          </details>
        </>
      )}
    </div>
  )
}
