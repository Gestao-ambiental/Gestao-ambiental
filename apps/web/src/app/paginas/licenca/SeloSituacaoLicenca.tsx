import type { SituacaoDaLicenca } from '@gestao-ambiental/domain'

import { Selo } from '@/components/ui/selo'

import { rotuloDaSituacao } from './situacao-licenca'

export function SeloSituacaoLicenca({ situacao }: { situacao: SituacaoDaLicenca | null }) {
  const { texto, tom } = rotuloDaSituacao(situacao)
  return <Selo tom={tom}>{texto}</Selo>
}
