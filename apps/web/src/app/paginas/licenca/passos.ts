export const PASSOS = [
  { chave: 'documento', rotulo: 'Documento' },
  { chave: 'identificacao', rotulo: 'Identificação' },
  { chave: 'condicionantes', rotulo: 'Condicionantes' },
  { chave: 'prazos', rotulo: 'Prazos' },
  { chave: 'responsaveis', rotulo: 'Responsáveis' },
] as const

export type ChavePasso = (typeof PASSOS)[number]['chave']
