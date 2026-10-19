import {
  rotuloDaSituacaoDaRenovacao,
  type DataCivil,
  type SituacaoDaRenovacao,
} from '@gestao-ambiental/domain'

import { Selo, type TomSelo } from '@/components/ui/selo'

function tomDe(situacao: SituacaoDaRenovacao, hoje: DataCivil): TomSelo {
  switch (situacao.tipo) {
    case 'protocolada':
      // Aguardando o órgão: em andamento; dia de acompanhar ou protocolo fora do prazo, atenção.
      return situacao.proximoAcompanhamento === hoje || !situacao.noPrazo ? 'atencao' : 'andamento'
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
export function SeloRenovacao({
  situacao,
  hoje,
}: {
  situacao: SituacaoDaRenovacao
  hoje: DataCivil
}) {
  return (
    <Selo tom={tomDe(situacao, hoje)} className="shrink-0">
      {rotuloDaSituacaoDaRenovacao(situacao, hoje)}
    </Selo>
  )
}
