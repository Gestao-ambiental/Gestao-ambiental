// Resíduos, fase 1: o prazo de uma obrigação de resíduos como evento do calendário (/calendario).
// Marca própria (contorno e o prefixo "Resíduos"), não só cor, para não se confundir com prazo
// oficial, meta, limite de protocolo e validade. Abre a página de obrigações do empreendimento.

import { ROTULO_DA_OBRIGACAO_RESIDUO } from '@gestao-ambiental/domain'
import { Link } from 'react-router'

import type { PrazoDeObrigacaoNoCalendario } from '@/lib/api/residuos'

import { caminhoDosPrazosDeResiduo, descricaoDoPrazoDeResiduo } from './prazos-de-residuos'

interface Props {
  prazo: PrazoDeObrigacaoNoCalendario
  /** Na agenda do celular e no diálogo do dia o texto quebra em vez de truncar. */
  inteiro?: boolean
}

export function EventoPrazoDeResiduo({ prazo, inteiro = false }: Props) {
  return (
    <Link
      to={caminhoDosPrazosDeResiduo(prazo.empreendimentoId)}
      title={descricaoDoPrazoDeResiduo(prazo)}
      className="flex min-w-0 items-center gap-(--e-1) rounded-(--raio) border border-(--ok-borda) bg-(--ok-fundo) px-(--e-15) py-0.5 text-xs text-(--ok-texto) no-underline hover:underline"
    >
      <span className="shrink-0 font-semibold">Resíduos</span>
      <span className={inteiro ? 'break-words' : 'truncate'}>
        {ROTULO_DA_OBRIGACAO_RESIDUO[prazo.tipo]} · {prazo.empreendimentoNome}
      </span>
    </Link>
  )
}
