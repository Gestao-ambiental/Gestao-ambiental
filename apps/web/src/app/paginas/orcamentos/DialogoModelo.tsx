import { ehDataCivil, formatarDataCivil } from '@gestao-ambiental/domain'
import { useEffect, useMemo, useState } from 'react'

import { Botao } from '@/components/ui/botao'
import { CaixaSelecao } from '@/components/ui/caixa-selecao'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'

import type { ModeloDeServico } from './catalogo-servicos'
import { classeCampo } from './comum'

export interface SelecaoDoModelo {
  modelo: string
  etapas: { nome: string; horasSugeridas: number | null }[]
  despesas: string[]
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
}: {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  aoAplicar: (selecao: SelecaoDoModelo) => void
}) {
  const [modelos, setModelos] = useState<readonly ModeloDeServico[] | null>(null)
  const [falhou, setFalhou] = useState(false)
  const [busca, setBusca] = useState('')
  const [escolhido, setEscolhido] = useState<ModeloDeServico | null>(null)
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

  function escolher(modelo: ModeloDeServico) {
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
      setBusca('')
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
          : 'Modelos da carta de serviços da Prefeitura de Joinville e serviços complementares.'
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
                  etapas: escolhido.etapas
                    .filter((_, i) => etapas.has(i))
                    .map((e) => ({ nome: e.nome, horasSugeridas: e.horasSugeridas })),
                  despesas: escolhido.despesas.filter((_, i) => despesas.has(i)).map((d) => d.nome),
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
                        · {String(e.horasSugeridas).replace('.', ',')}h sugeridas
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
            {categorias.length === 0 ? (
              <p className="text-(--text-subtle)">Nenhum modelo com “{busca}”.</p>
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
