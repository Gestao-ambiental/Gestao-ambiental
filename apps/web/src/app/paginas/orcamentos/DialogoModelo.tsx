import { ehDataCivil, formatarDataCivil, formatarDuracao } from '@gestao-ambiental/domain'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'

import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { CaixaSelecao } from '@/components/ui/caixa-selecao'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  excluirModeloDeOrcamento,
  listarModelosDeOrcamento,
  type ModeloDeOrcamento,
  type TratamentoDespesa,
} from '@/lib/api/orcamentos'
import { mensagemDoErro } from '@/lib/erros'

import type { ModeloDeServico } from './catalogo-servicos'
import { classeCampo } from './comum'

export interface SelecaoDoModelo {
  modelo: string
  /** horaVendaId: linha da tabela de preços salva no modelo da consultoria. */
  etapas: { nome: string; horasSugeridas: number | null; horaVendaId?: string | null }[]
  despesas: { nome: string; tratamento?: TratamentoDespesa }[]
  /** Só nos modelos da consultoria. */
  premissas?: string[]
  exclusoes?: string[]
}

/** Modelo da consultoria no mesmo formato do catálogo, para a mesma tela de escolha. */
function comoModeloDeServico(m: ModeloDeOrcamento): ModeloDeServico {
  return {
    id: `proprio:${m.id}`,
    nome: m.nome,
    categoria: 'Modelos da consultoria',
    jurisdicao: 'Modelo salvo pela consultoria',
    consultadoEm: null,
    fonte: null,
    nota: 'Os preços vêm da tabela de preços atual. Informe quantidades, responsáveis e meses; as despesas entram a cotar.',
    etapas: m.itens.map((i) => ({
      nome: i.descricao,
      marcada: true,
      condicional: false,
      horasSugeridas: i.minutos > 0 ? i.minutos / 60 : null,
    })),
    despesas: m.despesas.map((d) => ({ nome: d.descricao, marcada: true, condicional: false })),
  }
}

/** Sem acento e em minúsculas, para a busca achar "licenca" em "Licença". */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Catálogo de modelos de serviço (carta de serviços de Joinville e serviços complementares). O
 * catálogo só carrega quando a janela abre, para não pesar na tela. As etapas e despesas
 * escolhidas viram itens editáveis do orçamento; nada aqui é preço nem exigência oficial.
 */
export function DialogoModelo({
  aberto,
  aoMudar,
  aoAplicar,
  consultoriaId,
}: {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  aoAplicar: (selecao: SelecaoDoModelo) => void
  consultoriaId: string
}) {
  const [modelos, setModelos] = useState<readonly ModeloDeServico[] | null>(null)
  const [falhou, setFalhou] = useState(false)
  const [busca, setBusca] = useState('')
  const [escolhido, setEscolhido] = useState<ModeloDeServico | null>(null)
  const [proprio, setProprio] = useState<ModeloDeOrcamento | null>(null)
  const [paginasProprias, setPaginasProprias] = useState(1)
  const [excluindo, setExcluindo] = useState<string | null>(null)
  const [falhaPropria, setFalhaPropria] = useState<string | null>(null)
  const queryClient = useQueryClient()
  // Modelos da consultoria: paginados pelo banco; a busca vai junto.
  const proprios = useQuery({
    queryKey: ['modelos-de-orcamento', consultoriaId, busca.trim(), paginasProprias],
    queryFn: async () => {
      const paginas = await Promise.all(
        Array.from({ length: paginasProprias }, (_, i) =>
          listarModelosDeOrcamento(consultoriaId, busca.trim(), i),
        ),
      )
      return { itens: paginas.flatMap((p) => p.itens), total: paginas[0]?.total ?? 0 }
    },
    enabled: aberto,
  })

  async function excluirProprio(m: ModeloDeOrcamento) {
    setFalhaPropria(null)
    try {
      await excluirModeloDeOrcamento(m.id, m.rowVersion)
      setExcluindo(null)
      await queryClient.invalidateQueries({ queryKey: ['modelos-de-orcamento'] })
    } catch (erro) {
      setFalhaPropria(mensagemDoErro(erro))
    }
  }
  const [etapas, setEtapas] = useState<Set<number>>(new Set())
  const [despesas, setDespesas] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!aberto || modelos) return
    let ativo = true
    import('./catalogo-servicos')
      .then((m) => {
        if (ativo) setModelos(m.MODELOS_DE_SERVICO)
      })
      .catch(() => {
        if (ativo) setFalhou(true)
      })
    return () => {
      ativo = false
    }
  }, [aberto, modelos])

  const encontrados = useMemo(() => {
    const termo = normalizar(busca.trim())
    const lista = modelos ?? []
    return termo
      ? lista.filter((m) => normalizar(`${m.nome} ${m.categoria}`).includes(termo))
      : lista
  }, [modelos, busca])

  const categorias = useMemo(() => {
    const porCategoria = new Map<string, ModeloDeServico[]>()
    for (const m of encontrados) {
      porCategoria.set(m.categoria, [...(porCategoria.get(m.categoria) ?? []), m])
    }
    return [...porCategoria.entries()]
  }, [encontrados])

  function escolher(modelo: ModeloDeServico, doProprio: ModeloDeOrcamento | null = null) {
    setProprio(doProprio)
    setEscolhido(modelo)
    setEtapas(new Set(modelo.etapas.flatMap((e, i) => (e.marcada ? [i] : []))))
    setDespesas(new Set(modelo.despesas.flatMap((d, i) => (d.marcada ? [i] : []))))
  }

  function alternar(conjunto: Set<number>, indice: number): Set<number> {
    const novo = new Set(conjunto)
    if (novo.has(indice)) novo.delete(indice)
    else novo.add(indice)
    return novo
  }

  function fechar(aberta: boolean) {
    if (!aberta) {
      setEscolhido(null)
      setProprio(null)
      setBusca('')
      setPaginasProprias(1)
      setExcluindo(null)
      setFalhaPropria(null)
    }
    aoMudar(aberta)
  }

  const nada = etapas.size === 0 && despesas.size === 0

  return (
    <Dialogo
      aberto={aberto}
      aoMudar={fechar}
      titulo={escolhido ? escolhido.nome : 'Escolher modelo de serviço'}
      descricao={
        escolhido
          ? 'Marque o que entra neste orçamento. Etapas viram itens; despesas entram a cotar.'
          : 'Modelos da consultoria e da carta de serviços da Prefeitura de Joinville.'
      }
      largura={720}
      acoes={
        escolhido ? (
          <>
            <Botao
              onClick={() => {
                setEscolhido(null)
              }}
            >
              Voltar aos modelos
            </Botao>
            <Botao
              aparencia="primario"
              disabled={nada}
              onClick={() => {
                aoAplicar({
                  modelo: escolhido.nome,
                  etapas: escolhido.etapas.flatMap((e, i) =>
                    etapas.has(i)
                      ? [
                          {
                            nome: e.nome,
                            horasSugeridas: e.horasSugeridas,
                            horaVendaId: proprio?.itens[i]?.horaVendaId ?? null,
                          },
                        ]
                      : [],
                  ),
                  despesas: escolhido.despesas.flatMap((d, i) =>
                    despesas.has(i)
                      ? [{ nome: d.nome, tratamento: proprio?.despesas[i]?.tratamento }]
                      : [],
                  ),
                  premissas: proprio?.premissas,
                  exclusoes: proprio?.exclusoes,
                })
                fechar(false)
              }}
            >
              Adicionar ao orçamento
            </Botao>
          </>
        ) : null
      }
    >
      {falhou ? (
        <MensagemSecao role="alert" tom="perigo">
          Não foi possível carregar o catálogo. Tente de novo.
        </MensagemSecao>
      ) : !modelos ? (
        <p role="status" className="text-(--text-subtle)">
          Carregando modelos…
        </p>
      ) : escolhido ? (
        <div className="flex flex-col gap-(--space-200)">
          <p className="text-xs text-(--text-subtle)">
            {escolhido.jurisdicao}
            {escolhido.fonte ? (
              <>
                {' · '}
                <a href={escolhido.fonte} target="_blank" rel="noopener noreferrer">
                  Carta de serviços
                  {ehDataCivil(escolhido.consultadoEm)
                    ? `, consultada em ${formatarDataCivil(escolhido.consultadoEm)}`
                    : ''}
                </a>
              </>
            ) : null}
          </p>
          <fieldset className="flex flex-col gap-(--space-100)">
            <legend className="mb-(--space-100) corpo-medio">Etapas</legend>
            {escolhido.etapas.map((e, i) => (
              <CaixaSelecao
                key={e.nome}
                rotulo={
                  <>
                    {e.nome}
                    {e.condicional ? (
                      <span className="text-(--text-subtle)"> · só quando se aplica</span>
                    ) : null}
                    {e.horasSugeridas !== null ? (
                      <span className="text-(--text-subtle)">
                        {' '}
                        ·{' '}
                        {proprio
                          ? `${formatarDuracao(Math.round(e.horasSugeridas * 60))} no modelo`
                          : `${String(e.horasSugeridas).replace('.', ',')}h sugeridas`}
                      </span>
                    ) : null}
                  </>
                }
                checked={etapas.has(i)}
                onChange={() => {
                  setEtapas((a) => alternar(a, i))
                }}
              />
            ))}
          </fieldset>
          {escolhido.despesas.length > 0 ? (
            <fieldset className="flex flex-col gap-(--space-100)">
              <legend className="mb-(--space-100) corpo-medio">Despesas de terceiros</legend>
              {escolhido.despesas.map((d, i) => (
                <CaixaSelecao
                  key={d.nome}
                  rotulo={
                    <>
                      {d.nome}
                      {d.condicional ? (
                        <span className="text-(--text-subtle)"> · só quando se aplica</span>
                      ) : null}
                    </>
                  }
                  checked={despesas.has(i)}
                  onChange={() => {
                    setDespesas((a) => alternar(a, i))
                  }}
                />
              ))}
            </fieldset>
          ) : null}
          <p className="text-xs text-pretty text-(--text-subtle)">{escolhido.nota}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-(--space-150)">
          <label className="flex flex-col gap-(--space-050)">
            <span className="rotulo">Buscar serviço</span>
            <input
              type="search"
              className={classeCampo}
              placeholder="AUA, LAO, DANC, poda…"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value)
              }}
            />
          </label>
          <div className="max-h-[50vh] overflow-y-auto">
            <section aria-label="Modelos da consultoria" className="mb-(--space-150)">
              <h3 className="mb-(--space-050) rotulo">Modelos da consultoria</h3>
              {proprios.isPending ? (
                <p role="status" className="text-xs text-(--text-subtle)">
                  Carregando modelos da consultoria…
                </p>
              ) : proprios.isError ? (
                <MensagemSecao role="alert" tom="perigo">
                  Não foi possível carregar os modelos da consultoria.{' '}
                  <Botao
                    aparencia="link"
                    onClick={() => {
                      void proprios.refetch()
                    }}
                  >
                    Tentar de novo
                  </Botao>
                </MensagemSecao>
              ) : proprios.data.itens.length === 0 ? (
                <p className="text-xs text-(--text-subtle)">
                  {busca.trim()
                    ? 'Nenhum modelo da consultoria com essa busca.'
                    : 'Nenhum ainda. Num orçamento, use "Salvar como modelo" para guardar o escopo.'}
                </p>
              ) : (
                <>
                  {falhaPropria ? (
                    <MensagemSecao role="alert" tom="perigo">
                      {falhaPropria}
                    </MensagemSecao>
                  ) : null}
                  <ul className="flex flex-col">
                    {proprios.data.itens.map((m) => (
                      <li key={m.id} className="flex items-center gap-(--space-050)">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-baseline justify-between gap-(--space-150) rounded-(--radius) px-(--space-100) py-(--space-075) text-left corpo text-(--text) transicao-estado hover:bg-(--surface-hover) focus-visible:outline-2 focus-visible:outline-(--border-focus)"
                          onClick={() => {
                            escolher(comoModeloDeServico(m), m)
                          }}
                        >
                          <span className="truncate">{m.nome}</span>
                          <span className="shrink-0 text-xs text-(--text-subtle)">
                            {m.itens.length} {m.itens.length === 1 ? 'serviço' : 'serviços'}
                          </span>
                        </button>
                        {excluindo === m.id ? (
                          <span className="flex shrink-0 items-center gap-(--space-050) text-xs">
                            Excluir?
                            <Botao tamanho="compacto" onClick={() => void excluirProprio(m)}>
                              Sim, excluir
                            </Botao>
                            <Botao
                              tamanho="compacto"
                              onClick={() => {
                                setExcluindo(null)
                              }}
                            >
                              Não
                            </Botao>
                          </span>
                        ) : (
                          <BotaoIcone
                            icone="trash-2"
                            rotulo={`Excluir o modelo ${m.nome}`}
                            onClick={() => {
                              setExcluindo(m.id)
                            }}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                  {proprios.data.itens.length < proprios.data.total ? (
                    <Botao
                      aparencia="link"
                      onClick={() => {
                        setPaginasProprias((n) => n + 1)
                      }}
                    >
                      Mostrar mais modelos da consultoria
                    </Botao>
                  ) : null}
                </>
              )}
            </section>
            {categorias.length === 0 ? (
              <p className="text-(--text-subtle)">Nenhum modelo do catálogo com “{busca}”.</p>
            ) : null}
            {categorias.map(([categoria, lista]) => (
              <section key={categoria} aria-label={categoria} className="mb-(--space-150)">
                <h3 className="mb-(--space-050) rotulo">{categoria}</h3>
                <ul className="flex flex-col">
                  {lista.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        className="flex w-full items-baseline justify-between gap-(--space-150) rounded-(--radius) px-(--space-100) py-(--space-075) text-left corpo text-(--text) transicao-estado hover:bg-(--surface-hover) focus-visible:outline-2 focus-visible:outline-(--border-focus)"
                        onClick={() => {
                          escolher(m)
                        }}
                      >
                        <span>{m.nome}</span>
                        <span className="shrink-0 text-xs text-(--text-subtle)">
                          {m.etapas.length} etapas
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </Dialogo>
  )
}
