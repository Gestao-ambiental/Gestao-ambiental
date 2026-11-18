import { z } from 'zod'

export const RESULTADOS = {
  conforme: 'Conforme',
  nao_conforme: 'Não conforme',
  nao_aplicavel: 'Não aplicável',
  requer_avaliacao: 'Requer avaliação',
}

const instante = z.iso.datetime({ precision: 3 })

export const registroVistoria = z
  .object({
    resultado: z.enum(['conforme', 'nao_conforme', 'nao_aplicavel', 'requer_avaliacao']),
    area: z.string().trim().min(1).max(200),
    acompanhante: z.string().trim().max(160),
    observacao: z.string().trim().max(2000),
    registradoEm: instante,
    fotoEm: instante,
    origemFoto: z.enum(['camera', 'galeria']),
    localizacao: z
      .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        precisao: z.number().min(0).max(20000000),
        obtidaEm: instante,
      })
      .nullable(),
  })
  .refine((registro) => registro.resultado === 'conforme' || registro.observacao !== '')

export type RegistroVistoria = z.infer<typeof registroVistoria>
