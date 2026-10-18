import { rotuloDaSituacaoDoPrazo, type SituacaoDoPrazo } from '@gestao-ambiental/domain'

import { Selo, type TomSelo } from '@/components/ui/selo'

function tomDe(situacao: SituacaoDoPrazo): TomSelo {
  switch (situacao.tipo) {
    case 'atrasada':
      return situacao.faixa === 'mais_de_30'
        ? 'perigoForte'
        : situacao.faixa === 'de_8_a_30'
          ? 'perigoMedio'
          : 'perigo'
    case 'vencida':
    case 'protocolo_atrasado':
      return 'perigoForte'
    case 'em_conferencia':
      return 'revisao'
    case 'hoje':
      return 'atencao'
    case 'amanha':
      return 'sucesso'
    case 'em_dias':
      return 'padrao'
  }
}

/** Selo da situação calculada (EQ-03): tons por faixa e o número de dias escrito. */
export function SeloSituacaoPrazo({ situacao }: { situacao: SituacaoDoPrazo }) {
  return <Selo tom={tomDe(situacao)}>{rotuloDaSituacaoDoPrazo(situacao)}</Selo>
}
