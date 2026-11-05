import {
  adicionarDias,
  adicionarMeses,
  dataPorExtenso,
  diaDaSemana,
  formatarDataCivil,
  lerDataDigitada,
  mascararData,
  montarData,
  nomeDoMes,
  semanasDoMes,
  type DataCivil,
} from '@gestao-ambiental/domain'
import { Dialog, Popover } from 'radix-ui'
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react'

import { cn } from '@/lib/utils'

import { Botao } from './botao'
import { BotaoIcone } from './botao-icone'
import { Icone } from './icone'

const DIAS_DA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const
const MESES_CURTOS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
] as const

const CONSULTA_CELULAR = '(max-width: 639px)'

/** No celular o calendário abre como gaveta de baixo; no resto, como popover sob o campo. */
function useCelular(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      if (typeof window.matchMedia !== 'function') return () => undefined
      const consulta = window.matchMedia(CONSULTA_CELULAR)
      consulta.addEventListener('change', avisar)
      return () => {
        consulta.removeEventListener('change', avisar)
      }
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(CONSULTA_CELULAR).matches,
    () => false,
  )
}

function partes(data: DataCivil): { ano: number; mes: number } {
  return { ano: Number(data.slice(0, 4)), mes: Number(data.slice(5, 7)) }
}

function foraDoLimite(data: DataCivil, minimo?: DataCivil, maximo?: DataCivil): boolean {
  return (minimo !== undefined && data < minimo) || (maximo !== undefined && data > maximo)
}

interface Props {
  rotulo: string
  valor: DataCivil | null
  aoMudar: (data: DataCivil | null) => void
  /** Hoje no fuso da consultoria: marca o dia e serve ao botão "Hoje". */
  hoje: DataCivil
  minimo?: DataCivil
  maximo?: DataCivil
  /** Por que há datas bloqueadas (aparece no calendário e no erro de quem digita fora do limite). */
  motivoDoLimite?: string
  /** Informação de apoio dentro do calendário (ex.: "Limite de protocolo: 18/10/2026"). */
  nota?: ReactNode
  ajuda?: ReactNode
  erro?: string
  /** Ao lado do rótulo, à direita (ex.: a marca da IA). */
  acessorio?: ReactNode
  disabled?: boolean
  id?: string
  className?: string
}

/**
 * Campo de data civil com máscara dd/mm/aaaa e calendário (dias, meses e anos). Digitar e escolher
 * no calendário dão o mesmo resultado: uma DataCivil, ou null quando vazio ou inválido.
 */
export function CampoData({
  rotulo,
  valor,
  aoMudar,
  hoje,
  minimo,
  maximo,
  motivoDoLimite,
  nota,
  ajuda,
  erro,
  acessorio,
  disabled = false,
  id,
  className,
}: Props) {
  const gerado = useId()
  const campoId = id ?? gerado
  const apoioId = `${campoId}-apoio`
  const celular = useCelular()
  const campoRef = useRef<HTMLInputElement>(null)

  const [texto, setTexto] = useState(() => formatarDataCivil(valor))
  const [erroDigitado, setErroDigitado] = useState<string | null>(null)
  const [aberto, setAberto] = useState(false)
  // Valor vindo de fora (rascunho recarregado, "Limpar" do pai): o texto acompanha, sem efeito.
  const [valorVisto, setValorVisto] = useState(valor)
  if (valor !== valorVisto) {
    setValorVisto(valor)
    setTexto(formatarDataCivil(valor))
    setErroDigitado(null)
  }

  function emitir(data: DataCivil | null) {
    setValorVisto(data)
    if (data !== valor) aoMudar(data)
  }

  function erroDoLimite(): string {
    return motivoDoLimite ?? 'Data fora do período permitido.'
  }

  function aoDigitar(bruto: string) {
    // "aaaa-mm-dd" colado de outro lugar também vale; o campo mostra em dd/mm/aaaa.
    const colado = /^\d{4}-/.test(bruto.trim())
    const mascarado = colado ? bruto.trim().slice(0, 10) : mascararData(bruto)
    const leitura = lerDataDigitada(mascarado)
    setTexto(colado && leitura.situacao === 'valida' ? formatarDataCivil(leitura.data) : mascarado)
    if (leitura.situacao === 'valida') {
      if (foraDoLimite(leitura.data, minimo, maximo)) {
        setErroDigitado(erroDoLimite())
        emitir(null)
      } else {
        setErroDigitado(null)
        emitir(leitura.data)
      }
      return
    }
    setErroDigitado(
      leitura.situacao === 'inexistente' ? 'Essa data não existe. Use dd/mm/aaaa' : null,
    )
    emitir(null)
  }

  function aoSair() {
    if (lerDataDigitada(texto).situacao === 'incompleta') {
      setErroDigitado('Data incompleta. Use dd/mm/aaaa')
    }
  }

  function escolher(data: DataCivil | null) {
    setTexto(formatarDataCivil(data))
    setErroDigitado(null)
    emitir(data)
    setAberto(false)
  }

  const mensagemErro = erroDigitado ?? erro
  const apoio = mensagemErro ?? ajuda

  const painel = (
    <PainelCalendario
      selecionada={valor}
      hoje={hoje}
      minimo={minimo}
      maximo={maximo}
      motivoDoLimite={motivoDoLimite}
      nota={nota}
      grande={celular}
      aoEscolher={escolher}
    />
  )

  const botaoCalendario = (
    <button
      type="button"
      disabled={disabled}
      aria-label={`Abrir calendário de ${rotulo.replace(/\s*\*$/, '')}`}
      aria-haspopup="dialog"
      aria-expanded={aberto}
      onClick={() => {
        setAberto((a) => !a)
      }}
      className={cn(
        'absolute inset-y-px right-px inline-flex w-9 cursor-pointer items-center justify-center rounded-r-(--radius) text-(--icon) transicao-estado outline-none',
        'hover:bg-(--neutral-subtle-hover) focus-visible:shadow-[inset_0_0_0_2px_var(--border-focus)] disabled:cursor-not-allowed disabled:text-(--text-disabled) disabled:hover:bg-transparent',
        aberto && 'bg-(--surface-selected) text-(--brand) hover:bg-(--surface-selected)',
      )}
    >
      <Icone nome="calendar" />
    </button>
  )

  return (
    <div className={cn('flex flex-col gap-(--space-050)', className)}>
      <div className="flex min-h-5 items-center gap-(--space-100)">
        <label htmlFor={campoId} className="flex-1 rotulo">
          {rotulo}
        </label>
        {acessorio}
      </div>
      {celular ? (
        <Dialog.Root open={aberto} onOpenChange={setAberto}>
          <div className="relative flex items-center">
            <EntradaData
              id={campoId}
              ref={campoRef}
              texto={texto}
              aberto={aberto}
              disabled={disabled}
              invalido={Boolean(mensagemErro)}
              apoioId={apoio ? apoioId : undefined}
              aoDigitar={aoDigitar}
              aoSair={aoSair}
            />
            {botaoCalendario}
          </div>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-(--scrim) data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
            <Dialog.Content
              aria-describedby={undefined}
              className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col overflow-auto rounded-t-[12px] border-t bg-(--surface-overlay) px-(--space-200) pt-(--space-100) pb-(--space-300) text-(--text) shadow-sobreposicao outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom"
            >
              <span
                aria-hidden="true"
                className="mx-auto mb-(--space-150) h-1 w-10 rounded-full bg-(--border-strong)"
              />
              <div className="mb-(--space-150) flex items-center justify-between gap-(--space-100)">
                <Dialog.Title className="titulo-secao">{rotulo.replace(/\s*\*$/, '')}</Dialog.Title>
                <Dialog.Close asChild>
                  <BotaoIcone icone="x" rotulo="Fechar calendário" />
                </Dialog.Close>
              </div>
              {painel}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      ) : (
        <Popover.Root open={aberto} onOpenChange={setAberto}>
          <Popover.Anchor asChild>
            <div className="relative flex items-center">
              <EntradaData
                id={campoId}
                ref={campoRef}
                texto={texto}
                aberto={aberto}
                disabled={disabled}
                invalido={Boolean(mensagemErro)}
                apoioId={apoio ? apoioId : undefined}
                aoDigitar={aoDigitar}
                aoSair={aoSair}
              />
              {botaoCalendario}
            </div>
          </Popover.Anchor>
          <Popover.Portal>
            <Popover.Content
              align="start"
              sideOffset={4}
              collisionPadding={8}
              aria-label={`Calendário de ${rotulo.replace(/\s*\*$/, '')}`}
              onOpenAutoFocus={(evento) => {
                // O foco vai para o dia (o painel cuida), não para o primeiro botão.
                evento.preventDefault()
              }}
              onCloseAutoFocus={(evento) => {
                evento.preventDefault()
                campoRef.current?.focus()
              }}
              className="z-50 w-[276px] rounded-(--radius) border bg-(--surface-overlay) p-(--space-150) text-(--text) shadow-sobreposicao outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
            >
              {painel}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
      {apoio ? (
        <span
          id={apoioId}
          className={cn(
            'inline-flex items-start gap-(--space-075) text-xs',
            mensagemErro ? 'text-(--text-danger)' : 'text-(--text-subtle)',
          )}
        >
          {mensagemErro ? <Icone nome="circle-alert" tamanho={12} className="mt-0.5" /> : null}
          {apoio}
        </span>
      ) : null}
    </div>
  )
}

function EntradaData({
  id,
  ref,
  texto,
  aberto,
  disabled,
  invalido,
  apoioId,
  aoDigitar,
  aoSair,
}: {
  id: string
  ref: Ref<HTMLInputElement>
  texto: string
  aberto: boolean
  disabled: boolean
  invalido: boolean
  apoioId?: string
  aoDigitar: (texto: string) => void
  aoSair: () => void
}) {
  return (
    <input
      id={id}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="dd/mm/aaaa"
      maxLength={10}
      value={texto}
      disabled={disabled}
      aria-invalid={invalido ? true : undefined}
      aria-describedby={apoioId}
      onChange={(evento) => {
        aoDigitar(evento.target.value)
      }}
      onBlur={aoSair}
      className={cn(
        'h-(--size-control) w-full rounded-(--radius) border bg-(--surface-input) pr-10 pl-(--space-100) corpo text-(--text) tabular-nums transicao-estado outline-none placeholder:text-(--text-subtlest)',
        'border-(--border-input) hover:bg-(--surface-hover) focus:border-(--border-focus) focus:bg-(--surface-input-focus) focus:shadow-[0_0_0_1px_var(--border-focus)]',
        'disabled:cursor-not-allowed disabled:bg-(--surface-disabled) disabled:text-(--text-disabled) disabled:hover:bg-(--surface-disabled)',
        aberto &&
          'border-(--border-focus) bg-(--surface-input-focus) shadow-[0_0_0_1px_var(--border-focus)]',
        invalido &&
          'border-(--border-danger) focus:border-(--border-danger) focus:shadow-[0_0_0_1px_var(--border-danger)]',
      )}
    />
  )
}

type Vista = 'dias' | 'meses' | 'anos'

/** Calendário: grade de dias, de meses e de anos, com teclado em tudo (setas, PageUp/PageDown). */
export function PainelCalendario({
  selecionada,
  hoje,
  minimo,
  maximo,
  motivoDoLimite,
  nota,
  grande = false,
  aoEscolher,
}: {
  selecionada: DataCivil | null
  hoje: DataCivil
  minimo?: DataCivil
  maximo?: DataCivil
  motivoDoLimite?: string
  nota?: ReactNode
  grande?: boolean
  aoEscolher: (data: DataCivil | null) => void
}) {
  const inicial = selecionada ?? hoje
  const [vista, setVista] = useState<Vista>('dias')
  const [focada, setFocada] = useState<DataCivil>(inicial)
  const [inicioDosAnos, setInicioDosAnos] = useState(() => partes(inicial).ano - 4)
  const { ano, mes } = partes(focada)
  const gradeRef = useRef<HTMLDivElement>(null)
  // Ao abrir e a cada tecla de navegação, o foco vai ao dia focado (roving tabindex).
  const moverFoco = useRef(true)
  useEffect(() => {
    if (!moverFoco.current || vista !== 'dias') return
    gradeRef.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus()
    moverFoco.current = false
  }, [vista, focada])

  function irPara(data: DataCivil) {
    moverFoco.current = true
    setFocada(data)
  }

  function teclaNaGrade(evento: KeyboardEvent<HTMLDivElement>) {
    const passos: Record<string, () => DataCivil> = {
      ArrowLeft: () => adicionarDias(focada, -1),
      ArrowRight: () => adicionarDias(focada, 1),
      ArrowUp: () => adicionarDias(focada, -7),
      ArrowDown: () => adicionarDias(focada, 7),
      Home: () => adicionarDias(focada, -diaDaSemana(focada)),
      End: () => adicionarDias(focada, 6 - diaDaSemana(focada)),
      PageUp: () => adicionarMeses(focada, evento.shiftKey ? -12 : -1),
      PageDown: () => adicionarMeses(focada, evento.shiftKey ? 12 : 1),
    }
    const passo = passos[evento.key]
    if (!passo) return
    evento.preventDefault()
    irPara(passo())
  }

  const anterior = {
    dias: {
      rotulo: 'Mês anterior',
      fazer: () => {
        irPara(adicionarMeses(focada, -1))
      },
    },
    meses: {
      rotulo: 'Ano anterior',
      fazer: () => {
        setFocada(adicionarMeses(focada, -12))
      },
    },
    anos: {
      rotulo: 'Anos anteriores',
      fazer: () => {
        setInicioDosAnos((i) => i - 12)
      },
    },
  }[vista]
  const proximo = {
    dias: {
      rotulo: 'Próximo mês',
      fazer: () => {
        irPara(adicionarMeses(focada, 1))
      },
    },
    meses: {
      rotulo: 'Próximo ano',
      fazer: () => {
        setFocada(adicionarMeses(focada, 12))
      },
    },
    anos: {
      rotulo: 'Próximos anos',
      fazer: () => {
        setInicioDosAnos((i) => i + 12)
      },
    },
  }[vista]

  const hojeBloqueado = foraDoLimite(hoje, minimo, maximo)
  const celula = grande ? 'h-11' : 'h-8'

  return (
    <div className="flex flex-col gap-(--space-100)">
      <div className="flex items-center justify-between gap-(--space-050)">
        <BotaoIcone
          icone="chevron-left"
          rotulo={anterior.rotulo}
          tamanho="compacto"
          onClick={anterior.fazer}
        />
        {vista === 'anos' ? (
          <span className="corpo-medio" aria-live="polite">
            {inicioDosAnos} – {inicioDosAnos + 11}
          </span>
        ) : (
          <button
            type="button"
            aria-live="polite"
            onClick={() => {
              if (vista === 'dias') {
                setVista('meses')
              } else {
                setInicioDosAnos(ano - 4)
                setVista('anos')
              }
            }}
            className="inline-flex cursor-pointer items-center gap-(--space-050) rounded-(--radius) px-(--space-100) py-(--space-025) corpo-medio transicao-estado outline-none hover:bg-(--neutral-subtle-hover) focus-visible:shadow-[0_0_0_2px_var(--border-focus)]"
          >
            {vista === 'dias' ? `${nomeDoMes(mes)} de ${String(ano)}` : String(ano)}
            <Icone nome="chevron-down" tamanho={12} className="text-(--icon)" />
            <span className="sr-only">
              {vista === 'dias' ? ', escolher mês e ano' : ', escolher ano'}
            </span>
          </button>
        )}
        <BotaoIcone
          icone="chevron-right"
          rotulo={proximo.rotulo}
          tamanho="compacto"
          onClick={proximo.fazer}
        />
      </div>

      {vista === 'dias' ? (
        <div
          ref={gradeRef}
          role="grid"
          // O foco anda pelos dias (um só com tabIndex 0); a grade em si só recebe as teclas.
          tabIndex={-1}
          aria-label={`${nomeDoMes(mes)} de ${String(ano)}`}
          onKeyDown={teclaNaGrade}
          className="flex w-full flex-col"
        >
          <div role="row" className="grid grid-cols-7">
            {DIAS_DA_SEMANA.map((d) => (
              <span key={d} role="columnheader" className="pb-(--space-050) text-center rotulo">
                {d}
              </span>
            ))}
          </div>
          {semanasDoMes(ano, mes).map((semana) => (
            <div key={semana[0]} role="row" className="grid grid-cols-7">
              {semana.map((dia) => {
                const doMes = partes(dia).mes === mes
                const escolhido = dia === selecionada
                const ehHoje = dia === hoje
                const bloqueado = foraDoLimite(dia, minimo, maximo)
                return (
                  <div key={dia} role="gridcell" aria-selected={escolhido} className="p-px">
                    <button
                      type="button"
                      tabIndex={dia === focada ? 0 : -1}
                      aria-label={dataPorExtenso(dia)}
                      aria-current={ehHoje ? 'date' : undefined}
                      aria-disabled={bloqueado || undefined}
                      onClick={() => {
                        if (!bloqueado) aoEscolher(dia)
                      }}
                      onFocus={() => {
                        if (dia !== focada) setFocada(dia)
                      }}
                      className={cn(
                        'relative flex w-full items-center justify-center rounded-(--radius) corpo tabular-nums transicao-estado outline-none focus-visible:shadow-[0_0_0_2px_var(--border-focus)]',
                        celula,
                        bloqueado
                          ? 'cursor-not-allowed text-(--text-disabled)'
                          : 'cursor-pointer hover:bg-(--neutral-subtle-hover)',
                        !bloqueado && !doMes && 'text-(--text-subtle)',
                        !bloqueado && doMes && 'text-(--text)',
                        ehHoje && !escolhido && 'corpo-medio text-(--text-link)',
                        escolhido &&
                          'bg-(--brand) corpo-medio text-(--text-inverse) hover:bg-(--brand-hover)',
                      )}
                    >
                      {Number(dia.slice(8))}
                      {ehHoje && !escolhido ? (
                        <span
                          aria-hidden="true"
                          className="absolute bottom-0.5 left-1/2 h-0.5 w-3 -translate-x-1/2 rounded-full bg-(--brand)"
                        />
                      ) : null}
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      ) : vista === 'meses' ? (
        <div
          role="group"
          aria-label={`Meses de ${String(ano)}`}
          className="grid grid-cols-3 gap-(--space-050)"
        >
          {MESES_CURTOS.map((rotulo, indice) => {
            const numero = indice + 1
            const escolhido = selecionada
              ? partes(selecionada).ano === ano && partes(selecionada).mes === numero
              : false
            const atual = partes(hoje).ano === ano && partes(hoje).mes === numero
            return (
              <BotaoGrade
                key={rotulo}
                rotuloAcessivel={`${nomeDoMes(numero)} de ${String(ano)}`}
                escolhido={escolhido}
                atual={atual}
                grande={grande}
                aoClicar={() => {
                  const dia = Math.min(Number(focada.slice(8)), 28)
                  moverFoco.current = true
                  setFocada(montarData(ano, numero, dia))
                  setVista('dias')
                }}
              >
                {rotulo}
              </BotaoGrade>
            )
          })}
        </div>
      ) : (
        <div role="group" aria-label="Anos" className="grid grid-cols-3 gap-(--space-050)">
          {Array.from({ length: 12 }, (_, i) => inicioDosAnos + i).map((umAno) => (
            <BotaoGrade
              key={umAno}
              rotuloAcessivel={String(umAno)}
              escolhido={selecionada ? partes(selecionada).ano === umAno : false}
              atual={partes(hoje).ano === umAno}
              grande={grande}
              aoClicar={() => {
                setFocada(montarData(umAno, mes, Math.min(Number(focada.slice(8)), 28)))
                setVista('meses')
              }}
            >
              {umAno}
            </BotaoGrade>
          ))}
        </div>
      )}

      {vista === 'dias' && (nota ?? (motivoDoLimite && (minimo ?? maximo))) ? (
        <p className="flex items-start gap-(--space-075) text-xs text-(--text-subtle)">
          <Icone nome="clock" tamanho={12} className="mt-0.5" />
          <span>{nota ?? motivoDoLimite}</span>
        </p>
      ) : null}

      <div className="flex items-center justify-between border-t pt-(--space-100)">
        <Botao
          aparencia="sutil"
          tamanho="compacto"
          disabled={hojeBloqueado}
          onClick={() => {
            aoEscolher(hoje)
          }}
        >
          Hoje
        </Botao>
        <Botao
          aparencia="sutil"
          tamanho="compacto"
          disabled={!selecionada}
          onClick={() => {
            aoEscolher(null)
          }}
        >
          Limpar
        </Botao>
      </div>
    </div>
  )
}

function BotaoGrade({
  children,
  rotuloAcessivel,
  escolhido,
  atual,
  grande,
  aoClicar,
}: {
  children: ReactNode
  rotuloAcessivel: string
  escolhido: boolean
  atual: boolean
  grande: boolean
  aoClicar: () => void
}) {
  return (
    <button
      type="button"
      aria-label={rotuloAcessivel}
      aria-pressed={escolhido}
      aria-current={atual ? 'date' : undefined}
      onClick={aoClicar}
      className={cn(
        'relative flex cursor-pointer items-center justify-center rounded-(--radius) corpo transicao-estado outline-none hover:bg-(--neutral-subtle-hover) focus-visible:shadow-[0_0_0_2px_var(--border-focus)]',
        grande ? 'h-12' : 'h-10',
        atual && !escolhido && 'corpo-medio text-(--text-link)',
        escolhido && 'bg-(--brand) corpo-medio text-(--text-inverse) hover:bg-(--brand-hover)',
      )}
    >
      {children}
      {atual && !escolhido ? (
        <span
          aria-hidden="true"
          className="absolute bottom-1 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-(--brand)"
        />
      ) : null}
    </button>
  )
}
