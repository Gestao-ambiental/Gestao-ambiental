import { rotuloDoFimDoSuporte } from '@gestao-ambiental/domain'
import { useState } from 'react'

import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { mensagemDoErro } from '@/lib/erros'

import { useConsultoria } from './contexto-consultoria'

/**
 * Faixa permanente no topo enquanto o operador navega a consultoria como suporte (ADR-0025):
 * "Acesso de suporte · somente leitura · termina às hh:mm" (fuso da consultoria) e o botão de sair.
 * Região nomeada; o texto fica num role="status" para o leitor de tela anunciar.
 */
export function FaixaDeSuporte() {
  const { atual, suporte } = useConsultoria()
  const [saindo, setSaindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  if (!suporte) return null

  async function sair() {
    if (!suporte) return
    setSaindo(true)
    setErro(null)
    try {
      await suporte.sair()
    } catch (falha) {
      setErro(mensagemDoErro(falha))
      setSaindo(false)
    }
  }

  return (
    <section
      aria-label="Acesso de suporte"
      className="flex shrink-0 flex-wrap items-center gap-x-(--space-150) gap-y-(--space-075) border-b border-(--lozenge-warning-border) bg-(--lozenge-warning-bg) px-(--space-200) py-(--space-075) text-(--text) print:hidden md:px-(--space-300)"
    >
      <Icone nome="triangle-alert" className="text-(--lozenge-warning-text)" />
      <p role="status" className="min-w-0 flex-1 corpo-medio">
        Acesso de suporte · somente leitura ·{' '}
        {rotuloDoFimDoSuporte(suporte.fimPrevisto, atual.fuso, new Date())}
      </p>
      {erro ? (
        <p role="alert" className="corpo text-(--text-danger)">
          {erro}
        </p>
      ) : null}
      <Botao
        tamanho="compacto"
        iconeAntes="log-out"
        disabled={saindo}
        aria-busy={saindo || undefined}
        onClick={() => void sair()}
      >
        Sair do acesso de suporte
      </Botao>
    </section>
  )
}
