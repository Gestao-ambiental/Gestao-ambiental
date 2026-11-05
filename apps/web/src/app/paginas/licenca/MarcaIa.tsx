import { Icone } from '@/components/ui/icone'

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
