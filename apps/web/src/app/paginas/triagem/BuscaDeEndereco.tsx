// Endereço do empreendimento com sugestões enquanto se digita (combobox WAI-ARIA: setas percorrem,
// Enter escolhe, Esc fecha). Espera a pessoa parar de digitar antes de buscar, para não pesar no
// provedor; a Edge Function ainda guarda em cache e limita.

import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useState, type KeyboardEvent } from 'react'

import { classeCampo } from '@/components/ui/estilos-campo'
import { Icone } from '@/components/ui/icone'
import { buscarEnderecos, MINIMO_PARA_BUSCAR, type SugestaoDeEndereco } from '@/lib/api/endereco'
import { cn } from '@/lib/utils'

/** Espera depois da última tecla antes de buscar. */
const ESPERA_MS = 400

export function BuscaDeEndereco({
  inicial,
  aoEscolher,
}: {
  inicial: string
  aoEscolher: (sugestao: SugestaoDeEndereco) => void
}) {
  const base = useId()
  const [texto, setTexto] = useState(inicial)
  const [buscado, setBuscado] = useState('')
  const [aberto, setAberto] = useState(false)
  const [ativa, setAtiva] = useState(0)

  useEffect(() => {
    const limpo = texto.trim()
    const espera = window.setTimeout(() => {
      setBuscado(limpo.length >= MINIMO_PARA_BUSCAR ? limpo : '')
    }, ESPERA_MS)
    return () => {
      window.clearTimeout(espera)
    }
  }, [texto])

  const consulta = useQuery({
    queryKey: ['endereco', buscado],
    queryFn: () => buscarEnderecos(buscado),
    enabled: buscado !== '',
    staleTime: 10 * 60_000,
    retry: false,
  })
  const sugestoes = consulta.data ?? []
  const esperando = texto.trim().length >= MINIMO_PARA_BUSCAR && texto.trim() !== buscado
  const buscando = esperando || (buscado !== '' && consulta.isFetching)
  const mostrarLista = aberto && texto.trim().length >= MINIMO_PARA_BUSCAR

  const idDoCampo = `${base}-campo`
  const idDaLista = `${base}-lista`
  const idDaOpcao = (indice: number) => `${base}-opcao-${String(indice)}`

  function escolher(sugestao: SugestaoDeEndereco | undefined) {
    if (!sugestao) return
    setTexto(sugestao.rotulo)
    setBuscado(sugestao.rotulo.trim())
    setAberto(false)
    aoEscolher(sugestao)
  }

  function aoTeclar(evento: KeyboardEvent<HTMLInputElement>) {
    const ultimo = sugestoes.length - 1
    if (evento.key === 'Escape') {
      setAberto(false)
      return
    }
    if (evento.key === 'Enter') {
      evento.preventDefault()
      if (aberto && !buscando) escolher(sugestoes[ativa])
      return
    }
    let proxima: number | null = null
    if (evento.key === 'ArrowDown') proxima = !aberto ? 0 : ativa >= ultimo ? 0 : ativa + 1
    else if (evento.key === 'ArrowUp') proxima = ativa <= 0 ? ultimo : ativa - 1
    if (proxima !== null && ultimo >= 0) {
      evento.preventDefault()
      setAberto(true)
      setAtiva(Math.max(0, proxima))
      document.getElementById(idDaOpcao(proxima))?.scrollIntoView({ block: 'nearest' })
    }
  }

  return (
    <div className="flex flex-col gap-(--e-1)">
      <label htmlFor={idDoCampo} className="rotulo text-(--tinta)">
        Endereço
      </label>
      <div className="relative">
        <div className="relative flex items-center">
          <Icone
            nome="search"
            className="pointer-events-none absolute left-(--e-3) text-(--icone-2)"
          />
          <input
            id={idDoCampo}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={mostrarLista}
            aria-controls={idDaLista}
            aria-activedescendant={
              mostrarLista && !buscando && sugestoes[ativa] ? idDaOpcao(ativa) : undefined
            }
            autoComplete="off"
            placeholder="Rua, número e cidade"
            value={texto}
            onFocus={() => {
              setAberto(true)
            }}
            onBlur={() => {
              setAberto(false)
            }}
            onChange={(evento) => {
              setTexto(evento.target.value)
              setAberto(true)
              setAtiva(0)
            }}
            onKeyDown={aoTeclar}
            className={cn(classeCampo, 'pl-(--e-8)')}
          />
        </div>
        {mostrarLista ? (
          <div className="absolute top-full right-0 left-0 z-[1000] mt-(--e-1) overflow-hidden rounded-(--raio) border bg-(--flutuante) shadow-sobreposicao">
            <div
              id={idDaLista}
              role="listbox"
              aria-label="Endereços encontrados"
              aria-busy={buscando || undefined}
              className="max-h-[300px] overflow-y-auto py-(--e-1)"
            >
              {sugestoes.map((sugestao, indice) => (
                // O teclado fica no campo (aria-activedescendant): a opção só recebe o clique.
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
                <div
                  key={`${sugestao.rotulo}-${String(sugestao.latitude)}-${String(sugestao.longitude)}`}
                  id={idDaOpcao(indice)}
                  role="option"
                  aria-selected={indice === ativa}
                  onMouseDown={(evento) => {
                    evento.preventDefault()
                  }}
                  onMouseEnter={() => {
                    setAtiva(indice)
                  }}
                  onClick={() => {
                    escolher(sugestao)
                  }}
                  className={cn(
                    'flex cursor-pointer items-center gap-(--e-2) px-(--e-3) py-(--e-2) max-md:min-h-(--controle-toque)',
                    indice === ativa && 'bg-(--toque)',
                  )}
                >
                  <Icone nome="map-pin" className="shrink-0 text-(--tinta-2)" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate corpo-medio text-(--tinta)">{sugestao.rotulo}</span>
                    {sugestao.detalhe ? (
                      <span className="truncate text-xs text-(--tinta-2)">{sugestao.detalhe}</span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
            <div role="status" className="px-(--e-3) pb-(--e-2) empty:hidden">
              {buscando && sugestoes.length === 0 ? (
                <span className="rotulo">Buscando…</span>
              ) : consulta.isError && !buscando ? (
                <span className="rotulo text-(--atraso-texto)">{consulta.error.message}</span>
              ) : consulta.isSuccess && !buscando && sugestoes.length === 0 ? (
                <span className="rotulo">
                  Nenhum endereço encontrado em Santa Catarina. Marque no mapa.
                </span>
              ) : null}
            </div>
            <p className="border-t px-(--e-3) py-(--e-1) text-[11px] text-(--tinta-2)">
              Endereços: © colaboradores do OpenStreetMap
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
