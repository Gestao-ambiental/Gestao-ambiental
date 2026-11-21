// Cliente do orçamento numa linha só (pedido do Eduardo, 20/11/2026): busca os empreendimentos da
// consultoria e, para quem não está cadastrado, oferece "Cliente novo: <nome>" (prospecto) ou o
// cadastro com CNPJ e unidade. Ao lado, `acao` (o botão "Cliente novo", sempre à vista). Combobox
// WAI-ARIA: setas percorrem, Enter escolhe, Esc fecha.
import { formatarDocumentoDoTitular } from '@gestao-ambiental/domain'
import { useQuery } from '@tanstack/react-query'
import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

import { classeCampo } from '@/components/ui/estilos-campo'
import { Icone } from '@/components/ui/icone'
import { listarEmpreendimentos } from '@/lib/api/empreendimentos'
import { cn } from '@/lib/utils'

export type EscolhaDoCliente =
  | { tipo: 'empreendimento'; id: string; nome: string }
  | { tipo: 'prospecto'; nome: string }
  | { tipo: 'cadastrar'; nome: string }

interface Opcao {
  chave: string
  escolha: EscolhaDoCliente
  rotulo: string
  detalhe: string | null
}

/** Quantos empreendimentos aparecem na lista (o resto aparece ao digitar mais). */
const MAXIMO = 8

export function BuscaDoCliente({
  consultoriaId,
  termo,
  aoMudarTermo,
  aoEscolher,
  acao,
  desabilitado = false,
  focar = false,
}: {
  consultoriaId: string
  termo: string
  aoMudarTermo: (termo: string) => void
  aoEscolher: (escolha: EscolhaDoCliente) => void
  /** Ao lado do campo (ex.: o botão "Cliente novo"). */
  acao?: ReactNode
  desabilitado?: boolean
  /** Foco no campo ao montar: em Novo orçamento, o cliente é a primeira coisa a preencher. */
  focar?: boolean
}) {
  const base = useId()
  const [aberto, setAberto] = useState(false)
  const [ativa, setAtiva] = useState(0)
  const busca = useDeferredValue(termo.trim())
  const campo = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (focar) campo.current?.focus()
  }, [focar])

  const consulta = useQuery({
    queryKey: ['empreendimentos', consultoriaId, busca, 'cliente-do-orcamento'],
    queryFn: () => listarEmpreendimentos(consultoriaId, busca, 0),
    enabled: aberto,
    placeholderData: (anterior) => anterior,
  })

  const nome = termo.trim()
  const opcoes = useMemo<Opcao[]>(() => {
    const achados = (consulta.data?.itens ?? []).slice(0, MAXIMO).map<Opcao>((e) => ({
      chave: e.id,
      escolha: { tipo: 'empreendimento', id: e.id, nome: e.nome },
      rotulo: e.nome,
      detalhe: e.clienteNome ?? (e.cnpj ? formatarDocumentoDoTitular(e.cnpj) : null),
    }))
    if (!nome) return achados
    const igual = achados.some((o) => o.rotulo.toLowerCase() === nome.toLowerCase())
    return [
      ...achados,
      ...(igual
        ? []
        : [
            {
              chave: 'novo',
              escolha: { tipo: 'prospecto', nome } as const,
              rotulo: `Cliente novo: ${nome}`,
              detalhe: 'Só com o nome',
            },
          ]),
      {
        chave: 'cadastrar',
        escolha: { tipo: 'cadastrar', nome },
        rotulo: `${nome} com CNPJ e unidade`,
        detalhe: 'Entra em Empreendimentos',
      },
    ]
  }, [consulta.data, nome])

  const idDaLista = `${base}-lista`
  const idDaOpcao = (indice: number) => `${base}-opcao-${String(indice)}`
  const mostrarLista = aberto && (opcoes.length > 0 || consulta.isPending || consulta.isError)

  function escolher(opcao: Opcao | undefined) {
    if (!opcao) return
    setAberto(false)
    aoEscolher(opcao.escolha)
  }

  function aoTeclar(evento: KeyboardEvent<HTMLInputElement>) {
    const ultimo = opcoes.length - 1
    if (evento.key === 'Escape') {
      setAberto(false)
      return
    }
    if (evento.key === 'Enter') {
      evento.preventDefault()
      if (aberto) escolher(opcoes[ativa])
      return
    }
    let proxima: number | null = null
    if (evento.key === 'ArrowDown') proxima = !aberto ? 0 : ativa >= ultimo ? 0 : ativa + 1
    else if (evento.key === 'ArrowUp') proxima = ativa <= 0 ? ultimo : ativa - 1
    if (proxima !== null) {
      evento.preventDefault()
      setAberto(true)
      setAtiva(Math.max(0, proxima))
      document.getElementById(idDaOpcao(proxima))?.scrollIntoView({ block: 'nearest' })
    }
  }

  return (
    <div className="flex flex-col gap-(--e-1)">
      <label htmlFor={`${base}-campo`} className="rotulo text-(--tinta)">
        Cliente
      </label>
      <div className="flex flex-col gap-(--e-2) sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <div className="relative flex items-center">
            <Icone
              nome="search"
              className="pointer-events-none absolute left-(--e-3) text-(--icone-2)"
            />
            <input
              id={`${base}-campo`}
              type="text"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={mostrarLista}
              aria-controls={idDaLista}
              aria-activedescendant={mostrarLista && opcoes[ativa] ? idDaOpcao(ativa) : undefined}
              autoComplete="off"
              ref={campo}
              placeholder="Nome do cliente"
              value={termo}
              disabled={desabilitado}
              onFocus={() => {
                setAberto(true)
              }}
              onBlur={() => {
                setAberto(false)
              }}
              onChange={(evento) => {
                aoMudarTermo(evento.target.value)
                setAberto(true)
                setAtiva(0)
              }}
              onKeyDown={aoTeclar}
              className={cn(classeCampo, 'pl-(--e-8)')}
            />
          </div>
          {mostrarLista ? (
            <div
              id={idDaLista}
              role="listbox"
              aria-label="Clientes"
              className="absolute top-full right-0 left-0 z-30 mt-(--e-1) max-h-[320px] overflow-y-auto rounded-(--raio) border bg-(--flutuante) py-(--e-1) shadow-sobreposicao"
            >
              {consulta.isPending && opcoes.length === 0 ? (
                <p className="px-(--e-3) py-(--e-2) rotulo">Buscando…</p>
              ) : null}
              {consulta.isError ? (
                <p className="px-(--e-3) py-(--e-2) rotulo text-(--atraso-texto)">
                  Não deu para buscar os empreendimentos.
                </p>
              ) : null}
              {opcoes.map((opcao, indice) => (
                // O teclado fica no campo (aria-activedescendant): a opção só recebe o clique.
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
                <div
                  key={opcao.chave}
                  id={idDaOpcao(indice)}
                  role="option"
                  aria-selected={indice === ativa}
                  // Clicar não tira o foco do campo antes do clique valer.
                  onMouseDown={(evento) => {
                    evento.preventDefault()
                  }}
                  onMouseEnter={() => {
                    setAtiva(indice)
                  }}
                  onClick={() => {
                    escolher(opcao)
                  }}
                  className={cn(
                    'flex cursor-pointer items-center gap-(--e-2) px-(--e-3) py-(--e-2) max-md:min-h-(--controle-toque)',
                    indice === ativa && 'bg-(--toque)',
                  )}
                >
                  <Icone
                    nome={
                      opcao.escolha.tipo === 'empreendimento'
                        ? 'buildings'
                        : opcao.escolha.tipo === 'prospecto'
                          ? 'user'
                          : 'folder-plus'
                    }
                    className="shrink-0 text-(--tinta-2)"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate corpo-medio text-(--tinta)">{opcao.rotulo}</span>
                    {opcao.detalhe ? (
                      <span className="truncate text-xs text-(--tinta-2)">{opcao.detalhe}</span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {acao}
      </div>
    </div>
  )
}
