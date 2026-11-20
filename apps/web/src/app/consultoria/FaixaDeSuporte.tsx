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
      className="flex shrink-0 flex-wrap items-center gap-x-(--e-3) gap-y-(--e-15) border-b border-(--alerta-borda) bg-(--alerta-fundo) px-(--e-4) py-(--e-15) text-(--tinta) print:hidden md:px-(--e-6)"
    >
      <Icone nome="triangle-alert" className="text-(--alerta-texto)" />
      <p role="status" className="min-w-0 flex-1 corpo-medio">
        Acesso de suporte · somente leitura ·{' '}
        {rotuloDoFimDoSuporte(suporte.fimPrevisto, atual.fuso, new Date())}
      </p>
      {erro ? (
        <p role="alert" className="corpo text-(--atraso-texto)">
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
