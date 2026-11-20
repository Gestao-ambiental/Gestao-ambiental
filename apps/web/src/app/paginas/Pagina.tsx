import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router'

import { Icone } from '@/components/ui/icone'

interface Props {
  titulo: string
  /** Antes do título, dentro do h1 (ex.: o código da condicionante "4.3"), em tinta secundária. */
  prefixo?: ReactNode
  children: ReactNode
  /** Ação principal da tela (um botão primário), à direita do título; no celular, abaixo. */
  acao?: ReactNode
  /** Linha curta abaixo do título (contagem, órgão, número do documento). */
  meta?: ReactNode
  /** Link de volta, acima do título. */
  voltar?: { para: string; rotulo: string }
}

/**
 * Moldura de página: título grande (Overpass 800, 28px) com a ação principal ao lado. O título
 * também vai para a aba do navegador.
 */
export function Pagina({ titulo, prefixo, children, acao, meta, voltar }: Props) {
  const tituloDaAba = typeof prefixo === 'string' ? `${prefixo} ${titulo}` : titulo
  useEffect(() => {
    document.title = `${tituloDaAba} · Grama`
  }, [tituloDaAba])

  return (
    <div className="flex flex-col gap-(--e-6)">
      <header className="flex flex-col gap-(--e-2)">
        {voltar ? (
          <Link
            to={voltar.para}
            className="inline-flex w-fit items-center gap-(--e-1) rounded-(--raio-mini) corpo-medio text-(--tinta-2) no-underline hover:text-(--tinta) hover:no-underline max-md:min-h-(--controle-toque)"
          >
            <Icone nome="chevron-left" />
            {voltar.rotulo}
          </Link>
        ) : null}
        <div className="flex flex-wrap items-end justify-between gap-x-(--e-6) gap-y-(--e-3)">
          <div className="flex min-w-0 flex-col gap-(--e-1)">
            <h1 className="titulo-tela text-(--tinta)">
              {prefixo ? <span className="numero text-(--tinta-3)">{prefixo} </span> : null}
              {titulo}
            </h1>
            {meta ? <div className="corpo text-(--tinta-2)">{meta}</div> : null}
          </div>
          {acao ? (
            // Um segmentado de largura total no celular (Calendário, Campo) leva a ação junto.
            <div className="flex flex-wrap items-center gap-(--e-2) max-md:has-[[data-largura-total]]:w-full">
              {acao}
            </div>
          ) : null}
        </div>
      </header>
      {children}
    </div>
  )
}
