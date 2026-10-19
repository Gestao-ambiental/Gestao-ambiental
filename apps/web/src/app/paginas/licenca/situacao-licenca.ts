import type { SituacaoDaLicenca } from '@gestao-ambiental/domain'

import type { TomSelo } from '@/components/ui/selo'

/** Texto e tom da situação calculada da licença (Protótipos 08 e 09). `null` = sem licença. */
export function rotuloDaSituacao(situacao: SituacaoDaLicenca | null): {
  texto: string
  tom: TomSelo
} {
  if (!situacao) return { texto: 'Sem licença', tom: 'padrao' }
  switch (situacao.tipo) {
    case 'rascunho':
      return { texto: 'Rascunho', tom: 'padrao' }
    case 'sem_validade':
      return { texto: 'Validade não informada', tom: 'atencao' }
    case 'vencida':
      return { texto: 'Vencida', tom: 'perigo' }
    case 'protocolo':
      return {
        texto:
          situacao.dias === 0
            ? 'Protocolo hoje'
            : situacao.dias === 1
              ? 'Protocolo em 1 dia'
              : `Protocolo em ${String(situacao.dias)} dias`,
        tom: 'atencao',
      }
    case 'protocolo_atrasado':
      return { texto: 'Prazo de protocolo vencido', tom: 'perigo' }
    case 'sem_retorno':
      return { texto: 'Sem retorno do órgão', tom: 'andamento' }
    case 'vigente':
      return { texto: 'Vigente', tom: 'sucesso' }
  }
}
