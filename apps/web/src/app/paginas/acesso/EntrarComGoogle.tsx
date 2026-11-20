import { useState } from 'react'

import logoGoogle from '@/assets/marca/google-g.svg'
import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { entrarComGoogle, googleDisponivel } from '@/lib/api/acesso'

import { MENSAGEM_GOOGLE_DESLIGADO, MENSAGEM_GOOGLE_FALHOU } from './retorno-do-google'

/**
 * "Continuar com Google" acima do e-mail e senha, com o separador "ou" (ADR-0040). Antes de sair
 * do Grama confere se o provedor está ligado no Supabase: desligado, mostra a frase e a pessoa
 * segue com e-mail e senha. `voltarPara` é o caminho interno de volta (entrar, convite).
 */
export function EntrarComGoogle({ voltarPara }: { voltarPara: string }) {
  const [saindo, setSaindo] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)

  async function continuar() {
    setFalha(null)
    setSaindo(true)
    try {
      if (!(await googleDisponivel())) {
        setFalha(MENSAGEM_GOOGLE_DESLIGADO)
        setSaindo(false)
        return
      }
      await entrarComGoogle(voltarPara)
      // Daqui o navegador sai para o Google; o botão fica em "Abrindo o Google…".
    } catch {
      setFalha(MENSAGEM_GOOGLE_FALHOU)
      setSaindo(false)
    }
  }

  return (
    <div className="flex flex-col gap-(--e-4)">
      {falha ? (
        <MensagemSecao role="alert" tom="atencao">
          {falha}
        </MensagemSecao>
      ) : null}
      <Botao larguraTotal disabled={saindo} onClick={() => void continuar()}>
        <img src={logoGoogle} alt="" aria-hidden="true" width={18} height={18} />
        {saindo ? 'Abrindo o Google…' : 'Continuar com Google'}
      </Botao>
      <div
        aria-hidden="true"
        className="flex items-center gap-(--e-3) text-xs text-(--tinta-3) before:h-px before:flex-1 before:bg-(--regra) after:h-px after:flex-1 after:bg-(--regra)"
      >
        ou
      </div>
    </div>
  )
}
