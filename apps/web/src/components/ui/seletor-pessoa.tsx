// Seletor de pessoa (responsável, conferente): botão com avatar e nome que abre uma lista com
// busca, foto e, embaixo do nome, o cargo. Comportamento de combobox (WAI-ARIA APG): setas
// percorrem, Enter escolhe, Esc fecha; o foco fica na busca e a opção ativa vai em
// aria-activedescendant. Visual: campo do design system e superfície de overlay.
import { Popover } from 'radix-ui'
import { useId, useMemo, useState, type KeyboardEvent } from 'react'

import { cn } from '@/lib/utils'

import { Avatar } from './avatar'
import { Icone } from './icone'

export interface PessoaDoSeletor {
  id: string
  nome: string
  /** Linha de baixo: cargo ou, sem ele, o papel. */
  detalhe?: string | null
  fotoUrl?: string | null
}

interface Props {
  pessoas: readonly PessoaDoSeletor[]
  valor: string | null
  aoMudar: (id: string | null) => void
  /** Nome acessível do botão (ex.: "Responsável por 3.1.1"). */
  rotulo: string
  /** Texto do botão sem ninguém escolhido. */
  vazio?: string
  /** Opção que limpa a escolha; null = sem essa opção. */
  rotuloSemPessoa?: string | null
  disabled?: boolean
  className?: string
}

interface Opcao {
  id: string | null
  pessoa: PessoaDoSeletor | null
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function SemPessoa({ tamanho = 24 }: { tamanho?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-(--border-input) text-(--text-subtle)"
      style={{ width: tamanho, height: tamanho }}
    >
      <Icone nome="user" tamanho={tamanho <= 20 ? 12 : 16} />
    </span>
  )
}

export function SeletorPessoa({
  pessoas,
  valor,
  aoMudar,
  rotulo,
  vazio = 'Atribuir',
  rotuloSemPessoa = 'Sem responsável',
  disabled = false,
  className,
}: Props) {
  const base = useId()
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [ativa, setAtiva] = useState(0)
  const escolhida = pessoas.find((p) => p.id === valor) ?? null

  const opcoes = useMemo<Opcao[]>(() => {
    const termo = normalizar(busca.trim())
    const achadas = pessoas
      .filter(
        (p) =>
          !termo ||
          normalizar(p.nome).includes(termo) ||
          normalizar(p.detalhe ?? '').includes(termo),
      )
      .map((p) => ({ id: p.id, pessoa: p }))
    return rotuloSemPessoa !== null && !termo ? [{ id: null, pessoa: null }, ...achadas] : achadas
  }, [busca, pessoas, rotuloSemPessoa])

  const idDaOpcao = (indice: number) => `${base}-opcao-${String(indice)}`
  const idDaLista = `${base}-lista`

  function abrir(novo: boolean) {
    setAberto(novo)
    if (novo) {
      setBusca('')
      const atual = valor === null ? 0 : pessoas.findIndex((p) => p.id === valor)
      setAtiva(Math.max(0, valor === null ? 0 : atual + (rotuloSemPessoa !== null ? 1 : 0)))
    }
  }

  function escolher(opcao: Opcao) {
    setAberto(false)
    if (opcao.id !== valor) aoMudar(opcao.id)
  }

  function rolarAte(indice: number) {
    document.getElementById(idDaOpcao(indice))?.scrollIntoView({ block: 'nearest' })
  }

  function aoTeclar(evento: KeyboardEvent<HTMLInputElement>) {
    const ultimo = opcoes.length - 1
    let proxima: number | null = null
    if (evento.key === 'ArrowDown') proxima = ativa >= ultimo ? 0 : ativa + 1
    else if (evento.key === 'ArrowUp') proxima = ativa <= 0 ? ultimo : ativa - 1
    else if (evento.key === 'Home') proxima = 0
    else if (evento.key === 'End') proxima = ultimo
    else if (evento.key === 'Enter') {
      evento.preventDefault()
      const opcao = opcoes[ativa]
      if (opcao) escolher(opcao)
      return
    }
    if (proxima !== null && ultimo >= 0) {
      evento.preventDefault()
      setAtiva(proxima)
      rolarAte(proxima)
    }
  }

  return (
    <Popover.Root open={aberto} onOpenChange={abrir}>
      <Popover.Trigger
        type="button"
        role="combobox"
        aria-label={rotulo}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        disabled={disabled}
        onKeyDown={(evento) => {
          if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
            evento.preventDefault()
            abrir(true)
          }
        }}
        className={cn(
          'flex h-(--size-control) min-w-0 cursor-pointer items-center gap-(--space-100) rounded-(--radius) border border-(--border-input) border-b-(--border-input-accessible) bg-(--surface-input) px-(--space-100) text-left corpo text-(--text) transicao-estado',
          'hover:bg-(--surface-hover) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--border-focus)',
          'disabled:cursor-not-allowed disabled:text-(--text-disabled)',
          className,
        )}
      >
        {escolhida ? (
          <Avatar nome={escolhida.nome} fotoUrl={escolhida.fotoUrl} tamanho="pequeno" />
        ) : (
          <SemPessoa tamanho={20} />
        )}
        <span
          className={cn('min-w-0 flex-1 truncate', !escolhida && 'text-(--text-subtle)')}
          title={escolhida?.nome}
        >
          {escolhida ? escolhida.nome : vazio}
        </span>
        <Icone nome="chevron-down" className="shrink-0 text-(--text-subtle)" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className={cn(
            'z-50 flex w-(--radix-popover-trigger-width) min-w-[280px] flex-col overflow-hidden rounded-(--radius) border bg-(--surface-overlay) text-(--text) shadow-sobreposicao',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 duration-(--duration-medium)',
          )}
        >
          <div className="flex items-center gap-(--space-100) border-b px-(--space-150)">
            <Icone nome="search" className="shrink-0 text-(--text-subtle)" />
            <input
              type="text"
              role="combobox"
              aria-label="Buscar pessoa"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls={idDaLista}
              aria-activedescendant={opcoes[ativa] ? idDaOpcao(ativa) : undefined}
              autoComplete="off"
              placeholder="Buscar pessoa"
              value={busca}
              onChange={(evento) => {
                setBusca(evento.target.value)
                setAtiva(0)
              }}
              onKeyDown={aoTeclar}
              className="h-(--size-control) min-w-0 flex-1 bg-transparent corpo text-(--text) outline-none placeholder:text-(--text-subtlest)"
            />
          </div>
          <div
            id={idDaLista}
            role="listbox"
            aria-label={rotulo}
            className="max-h-[288px] overflow-y-auto py-(--space-050)"
          >
            {opcoes.length === 0 ? (
              <p className="px-(--space-150) py-(--space-100) rotulo">Ninguém encontrado</p>
            ) : null}
            {opcoes.map((opcao, indice) => {
              const selecionada = opcao.id === valor
              return (
                // O teclado fica na busca (aria-activedescendant): a opção só recebe o clique.
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
                <div
                  key={opcao.id ?? '-'}
                  id={idDaOpcao(indice)}
                  role="option"
                  aria-selected={selecionada}
                  onMouseDown={(evento) => {
                    evento.preventDefault()
                  }}
                  onMouseMove={() => {
                    if (ativa !== indice) setAtiva(indice)
                  }}
                  onClick={() => {
                    escolher(opcao)
                  }}
                  className={cn(
                    'flex cursor-pointer items-center gap-(--space-100) px-(--space-150) py-(--space-075)',
                    selecionada
                      ? indice === ativa
                        ? 'bg-(--surface-selected-hover)'
                        : 'bg-(--surface-selected)'
                      : indice === ativa && 'bg-(--surface-hover)',
                  )}
                >
                  {opcao.pessoa ? (
                    <Avatar
                      nome={opcao.pessoa.nome}
                      fotoUrl={opcao.pessoa.fotoUrl}
                      tamanho="grande"
                    />
                  ) : (
                    <SemPessoa tamanho={32} />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate corpo text-(--text)">
                      {opcao.pessoa ? opcao.pessoa.nome : rotuloSemPessoa}
                    </span>
                    {opcao.pessoa?.detalhe ? (
                      <span className="truncate text-xs text-(--text-subtle)">
                        {opcao.pessoa.detalhe}
                      </span>
                    ) : null}
                  </span>
                  {selecionada ? (
                    <Icone nome="check" className="shrink-0 text-(--text-link)" />
                  ) : null}
                </div>
              )
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
