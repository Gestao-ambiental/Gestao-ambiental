import { Selo, type TomSelo } from '@/components/ui/selo'
import { ROTULO_DA_SITUACAO, type SituacaoOrcamento } from '@/lib/api/orcamentos'

const TOM_DA_SITUACAO: Record<SituacaoOrcamento, TomSelo> = {
  rascunho: 'padrao',
  enviada: 'andamento',
  negociacao: 'atencao',
  aprovada: 'sucesso',
  recusada: 'perigo',
}

/** Situação do orçamento, sempre com a palavra (a cor nunca é o único sinal). */
export function SeloSituacaoOrcamento({ situacao }: { situacao: SituacaoOrcamento }) {
  return <Selo tom={TOM_DA_SITUACAO[situacao]}>{ROTULO_DA_SITUACAO[situacao]}</Selo>
}
