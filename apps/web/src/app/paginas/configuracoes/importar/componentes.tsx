// Peças de tela de Importar (ADR-0043): selo da situação e paginação.
import { BotaoIcone } from '@/components/ui/botao-icone'
import { Selo, type TomSelo } from '@/components/ui/selo'
import type { SituacaoDaImportacao } from '@/lib/api/importacao'

const SITUACOES: Record<SituacaoDaImportacao, { rotulo: string; tom: TomSelo }> = {
  em_conferencia: { rotulo: 'Em conferência', tom: 'revisao' },
  efetivada: { rotulo: 'Importada', tom: 'sucesso' },
  desfeita: { rotulo: 'Desfeita', tom: 'padrao' },
}

export function SeloDaImportacao({ situacao }: { situacao: SituacaoDaImportacao }) {
  const { rotulo, tom } = SITUACOES[situacao]
  return <Selo tom={tom}>{rotulo}</Selo>
}

/** Rodapé "1–20 de 54" com anterior e próxima; some quando cabe numa página. */
export function Paginacao({
  pagina,
  tamanho,
  total,
  aoMudar,
}: {
  pagina: number
  tamanho: number
  total: number
  aoMudar: (pagina: number) => void
}) {
  if (total <= tamanho) return null
  const inicio = pagina * tamanho
  const fim = Math.min(total, inicio + tamanho)
  return (
    <div className="flex items-center gap-(--e-2) border-t px-(--e-4) py-(--e-2)">
      <span className="flex-1 rotulo numero" aria-live="polite">
        {inicio + 1}–{fim} de {total}
      </span>
      <BotaoIcone
        icone="chevron-left"
        rotulo="Página anterior"
        disabled={pagina === 0}
        onClick={() => {
          aoMudar(Math.max(0, pagina - 1))
        }}
      />
      <BotaoIcone
        icone="chevron-right"
        rotulo="Próxima página"
        disabled={fim >= total}
        onClick={() => {
          aoMudar(pagina + 1)
        }}
      />
    </div>
  )
}
