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

/** Rótulo curto para a plaqueta cheia: os dias já estão na coluna "Faltam". */
function rotuloCurto(situacao: SituacaoDoPrazo): string | null {
  if (situacao.tipo === 'vencida') return 'Vencida'
  if (situacao.tipo === 'protocolo_atrasado') return 'Protocolo vencido'
  return null
}

/**
 * Selo da situação calculada (EQ-03): tons por faixa e o número de dias escrito. Na plaqueta de
 * vencida e de protocolo vencido, a tela mostra o rótulo curto e o leitor de tela lê o completo.
 */
export function SeloSituacaoPrazo({ situacao }: { situacao: SituacaoDoPrazo }) {
  const completo = rotuloDaSituacaoDoPrazo(situacao)
  const curto = rotuloCurto(situacao)
  if (!curto) return <Selo tom={tomDe(situacao)}>{completo}</Selo>
  return (
    <Selo tom={tomDe(situacao)} title={completo}>
      <span aria-hidden>{curto}</span>
      <span className="sr-only">{completo}</span>
    </Selo>
  )
}
