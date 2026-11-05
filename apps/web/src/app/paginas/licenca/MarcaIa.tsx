import { Icone } from '@/components/ui/icone'
import { Selo } from '@/components/ui/selo'

/**
 * Marca de item proposto pela IA em lista (Protótipo 12): diz de onde veio e leva o PDF à página
 * da fonte. A marca é texto ("IA"), não só cor nem ícone.
 */
export function MarcaIa({
  pagina,
  aoVerPagina,
  texto = 'Proposto pela IA',
}: {
  pagina: number | null
  aoVerPagina: (pagina: number) => void
  texto?: string
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-(--space-050) text-xs text-(--text-subtle)">
      <Selo tom="revisao">IA</Selo>
      {texto}
      {pagina ? (
        <>
          {' · '}
          <button
            type="button"
            onClick={() => {
              aoVerPagina(pagina)
            }}
            className="cursor-pointer text-(--text-link) hover:underline"
          >
            ver página {pagina}
          </button>
        </>
      ) : null}
      . Confira.
    </span>
  )
}

/**
 * Marca de campo proposto pela IA (Protótipo 11): o ícone ao lado do rótulo. O nome acessível e a
 * dica dizem que veio da IA e de qual página; o clique leva o PDF até ela.
 */
export function BotaoIa({
  pagina,
  aoVerPagina,
}: {
  pagina: number | null
  aoVerPagina: (pagina: number) => void
}) {
  const descricao = pagina
    ? `Proposto pela IA, ver na página ${String(pagina)} do PDF`
    : 'Proposto pela IA'
  return (
    <button
      type="button"
      aria-label={descricao}
      title={pagina ? `Proposto pela IA · p. ${String(pagina)}` : 'Proposto pela IA'}
      disabled={!pagina}
      onClick={() => {
        if (pagina) aoVerPagina(pagina)
      }}
      className="inline-flex h-5 w-6 shrink-0 cursor-pointer items-center justify-center rounded-(--radius) text-(--ia) transicao-estado outline-none hover:bg-(--neutral-subtle-hover) focus-visible:shadow-[0_0_0_2px_var(--border-focus)] disabled:cursor-default disabled:hover:bg-transparent"
    >
      <Icone nome="sparkles" />
    </button>
  )
}

/** A IA procurou e não achou: o campo fica vazio, nunca com valor inventado. */
export function NaoEncontrado() {
  return (
    <span className="inline-flex items-center gap-(--space-075) text-xs text-(--text-warning)">
      <Icone nome="info" tamanho={12} />
      Não encontrado no documento
    </span>
  )
}
