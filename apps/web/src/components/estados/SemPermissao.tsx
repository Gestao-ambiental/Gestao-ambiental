import type { ReactNode } from 'react'

import { EstadoVazio } from './EstadoVazio'

interface Props {
  titulo?: string
  descricao?: ReactNode
  className?: string
}

/**
 * Sem permissão: o servidor negou (RLS/RPC). É só apresentação; quem decide o acesso é o banco.
 * Não revela se o registro existe.
 */
export function SemPermissao({
  titulo = 'Você não tem acesso a esta área',
  descricao = 'Se precisar dela, peça à gestão da sua consultoria.',
  className,
}: Props) {
  return <EstadoVazio icone="lock" titulo={titulo} descricao={descricao} className={className} />
}
