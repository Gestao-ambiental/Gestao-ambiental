import { rotuloDaSituacaoDaRenovacao, type SituacaoDaRenovacao } from '@gestao-ambiental/domain'

import { Selo, type TomSelo } from '@/components/ui/selo'

function tomDe(situacao: SituacaoDaRenovacao): TomSelo {
  switch (situacao.tipo) {
    case 'protocolada':
      return situacao.noPrazo ? 'sucesso' : 'atencao'
    case 'vencida':
    case 'protocolo_atrasado':
      return 'perigoForte'
    case 'protocolo_proximo':
      return 'atencao'
    case 'em_preparacao':
      return 'andamento'
    case 'preparacao_futura':
      return 'padrao'
  }
}

/** Selo da situação calculada da renovação (EQ-05): a data ou os dias vão escritos. */
export function SeloRenovacao({ situacao }: { situacao: SituacaoDaRenovacao }) {
  return (
    <Selo tom={tomDe(situacao)} className="shrink-0">
      {rotuloDaSituacaoDaRenovacao(situacao)}
    </Selo>
  )
}
