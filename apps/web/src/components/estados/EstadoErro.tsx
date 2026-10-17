import type { ReactNode } from 'react'

import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'

interface Props {
  titulo?: string
  descricao?: ReactNode
  /** Se informado, mostra "Tentar de novo" (ex.: refetch da consulta). */
  aoTentarDeNovo?: () => void
  className?: string
}

/**
 * Erro ao carregar: mensagem de seção em tom de perigo, sem detalhe técnico, com "Tentar de novo".
 * Erro nunca é silencioso (design system).
 */
export function EstadoErro({
  titulo = 'Não foi possível carregar',
  descricao = 'Verifique a conexão e tente de novo. Se continuar, avise a gestão da consultoria.',
  aoTentarDeNovo,
  className,
}: Props) {
  return (
    <MensagemSecao
      role="alert"
      tom="perigo"
      titulo={titulo}
      className={className}
      acoes={
        aoTentarDeNovo ? (
          <Botao iconeAntes="refresh-cw" onClick={aoTentarDeNovo}>
            Tentar de novo
          </Botao>
        ) : undefined
      }
    >
      {descricao}
    </MensagemSecao>
  )
}
