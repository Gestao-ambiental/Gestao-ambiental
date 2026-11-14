// Vistoria móvel (Campo), primeiro incremento (ADR-0029, CAMPO-01). Regras de apresentação e as
// conferências que a tela faz antes de gravar; o banco repete as regras de envio, de comentário e
// de localização (migration vistoria_movel).

import { diferencaEmDias, formatarDataCivil, type DataCivil } from './data-civil'

export type SituacaoDaVistoria =
  'planejada' | 'em_andamento' | 'enviada' | 'devolvida' | 'aprovada' | 'cancelada'

export type ResultadoDoItem =
  'pendente' | 'conforme' | 'nao_conforme' | 'nao_aplicavel' | 'requer_avaliacao'

/** Resultados que a pessoa escolhe no checklist, na ordem dos botões. */
export const RESULTADOS_DO_ITEM = [
  'conforme',
  'nao_conforme',
  'nao_aplicavel',
  'requer_avaliacao',
] as const satisfies readonly ResultadoDoItem[]

export const ROTULO_DO_RESULTADO: Record<ResultadoDoItem, string> = {
  pendente: 'Pendente',
  conforme: 'Conforme',
  nao_conforme: 'Não conforme',
  nao_aplicavel: 'Não se aplica',
  requer_avaliacao: 'Requer avaliação',
}

export const ROTULO_DA_SITUACAO_DA_VISTORIA: Record<SituacaoDaVistoria, string> = {
  planejada: 'Planejada',
  em_andamento: 'Em andamento',
  enviada: 'Enviada',
  devolvida: 'Devolvida',
  aprovada: 'Aprovada',
  cancelada: 'Cancelada',
}

/** Limites do ADR-0029 §3 (o banco recusa acima deles). */
export const LIMITES_DA_VISTORIA = {
  titulo: 120,
  objetivo: 1000,
  observacao: 2000,
  itens: 50,
  tituloDoItem: 120,
  descricaoDoItem: 300,
  comentario: 1000,
  legenda: 200,
  localManual: 200,
  duracaoMinima: 5,
  duracaoMaxima: 1440,
} as const

/** Os quatro itens do protótipo, sugeridos ao agendar (decisão 3 do ADR-0029). */
export const ITENS_SUGERIDOS: readonly { titulo: string; descricao: string | null }[] = [
  { titulo: 'Registrar área visitada', descricao: 'Área identificada no empreendimento' },
  { titulo: 'Registrar condições observadas', descricao: 'Nota ou foto das condições' },
  { titulo: 'Identificar acompanhante', descricao: 'Contato registrado na visita' },
  { titulo: 'Anexar foto geral', descricao: null },
]

/** Não conforme e requer avaliação exigem comentário. */
export function exigeComentario(resultado: ResultadoDoItem): boolean {
  return resultado === 'nao_conforme' || resultado === 'requer_avaliacao'
}

/** Só em andamento ou devolvida a vistoria aceita resultado, observação e foto. */
export function aceitaRegistro(situacao: SituacaoDaVistoria): boolean {
  return situacao === 'em_andamento' || situacao === 'devolvida'
}

export interface ItemDaVistoria {
  id: string
  titulo: string
  resultado: ResultadoDoItem
  comentario: string | null
}

export interface ProgressoDaVistoria {
  registrados: number
  total: number
  /** Inteiro de 0 a 100; sem itens, 0. */
  percentual: number
}

/** Registrado = resultado fora de pendente (o que já chegou ao banco). */
export function progressoDaVistoria(
  itens: readonly Pick<ItemDaVistoria, 'resultado'>[],
): ProgressoDaVistoria {
  const total = itens.length
  const registrados = itens.filter((item) => item.resultado !== 'pendente').length
  return {
    registrados,
    total,
    percentual: total === 0 ? 0 : Math.floor((registrados * 100) / total),
  }
}

export type MotivoDaPendencia = 'sem_resultado' | 'sem_comentario'

export interface PendenciaDoEnvio {
  itemId: string
  titulo: string
  motivo: MotivoDaPendencia
}

export const ROTULO_DA_PENDENCIA: Record<MotivoDaPendencia, string> = {
  sem_resultado: 'Sem resultado',
  sem_comentario: 'Falta comentário',
}

/** O que impede o envio, na ordem do checklist: item sem resultado ou sem o comentário exigido. */
export function pendenciasDoEnvio(itens: readonly ItemDaVistoria[]): PendenciaDoEnvio[] {
  const pendencias: PendenciaDoEnvio[] = []
  for (const item of itens) {
    if (item.resultado === 'pendente') {
      pendencias.push({ itemId: item.id, titulo: item.titulo, motivo: 'sem_resultado' })
    } else if (exigeComentario(item.resultado) && !(item.comentario ?? '').trim()) {
      pendencias.push({ itemId: item.id, titulo: item.titulo, motivo: 'sem_comentario' })
    }
  }
  return pendencias
}

export type GrupoDaVistoria = 'atrasadas' | 'hoje' | 'proximas' | 'enviadas'

export const GRUPOS_DA_VISTORIA = [
  'atrasadas',
  'hoje',
  'proximas',
  'enviadas',
] as const satisfies readonly GrupoDaVistoria[]

export const ROTULO_DO_GRUPO: Record<GrupoDaVistoria, string> = {
  atrasadas: 'Atrasadas',
  hoje: 'Hoje',
  proximas: 'Próximas',
  enviadas: 'Enviadas',
}

/**
 * Grupo em "Minhas vistorias". Enviada e aprovada vão para Enviadas; as abertas (planejada, em
 * andamento, devolvida) pela data planejada contra o hoje da consultoria. Cancelada não aparece.
 */
export function grupoDaVistoria(
  situacao: SituacaoDaVistoria,
  dataPlanejada: DataCivil,
  hoje: DataCivil,
): GrupoDaVistoria | null {
  if (situacao === 'cancelada') return null
  if (situacao === 'enviada' || situacao === 'aprovada') return 'enviadas'
  const dias = diferencaEmDias(dataPlanejada, hoje)
  if (dias < 0) return 'atrasadas'
  return dias === 0 ? 'hoje' : 'proximas'
}

/** "Hoje", "Amanhã", "Ontem" ou dd/mm/aaaa. */
export function rotuloDoDiaDaVistoria(data: DataCivil, hoje: DataCivil): string {
  const dias = diferencaEmDias(data, hoje)
  if (dias === 0) return 'Hoje'
  if (dias === 1) return 'Amanhã'
  if (dias === -1) return 'Ontem'
  return formatarDataCivil(data)
}

// ---------------------------------------------------------------------------
// Localização da foto
// ---------------------------------------------------------------------------

export type OrigemDoLocal = 'aparelho' | 'manual' | 'nenhum'

export interface LocalDaFoto {
  origem: OrigemDoLocal
  latitude: number | null
  longitude: number | null
  precisaoM: number | null
  localManual: string | null
}

export type ProblemaDoLocal =
  | 'coordenada_obrigatoria'
  | 'coordenada_invalida'
  | 'precisao_invalida'
  | 'descricao_obrigatoria'
  | 'descricao_longa'
  | 'local_incoerente'

export const SEM_LOCAL: LocalDaFoto = {
  origem: 'nenhum',
  latitude: null,
  longitude: null,
  precisaoM: null,
  localManual: null,
}

/**
 * Coordenada do aparelho no formato gravado: 6 casas (numeric(9,6)) e precisão com 1 casa
 * (numeric(8,1)). Precisão ausente ou inválida fica nula.
 */
export function localDoAparelho(coordenadas: {
  latitude: number
  longitude: number
  accuracy?: number | null
}): LocalDaFoto {
  const arredondar = (valor: number, casas: number) => Number(valor.toFixed(casas))
  const precisao = coordenadas.accuracy
  return {
    origem: 'aparelho',
    latitude: arredondar(coordenadas.latitude, 6),
    longitude: arredondar(coordenadas.longitude, 6),
    precisaoM:
      typeof precisao === 'number' && Number.isFinite(precisao) && precisao >= 0
        ? arredondar(Math.min(precisao, 9_999_999.9), 1)
        : null,
    localManual: null,
  }
}

export function localManual(descricao: string): LocalDaFoto {
  return { ...SEM_LOCAL, origem: 'manual', localManual: descricao.trim() }
}

/**
 * Confere a localização antes de gravar (a mesma regra do banco): `aparelho` exige as duas
 * coordenadas em faixa, `manual` exige a descrição, `nenhum` não tem coordenada nem descrição.
 * Precisão só com coordenada e nunca negativa.
 */
export function conferirLocalizacao(local: LocalDaFoto): ProblemaDoLocal | null {
  const { latitude, longitude, precisaoM } = local
  const descricao = (local.localManual ?? '').trim()
  const temCoordenada = latitude !== null || longitude !== null
  switch (local.origem) {
    case 'aparelho': {
      if (descricao) return 'local_incoerente'
      if (latitude === null || longitude === null) return 'coordenada_obrigatoria'
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 ||
        Math.abs(longitude) > 180
      )
        return 'coordenada_invalida'
      if (precisaoM !== null && (!Number.isFinite(precisaoM) || precisaoM < 0))
        return 'precisao_invalida'
      return null
    }
    case 'manual':
      if (temCoordenada || precisaoM !== null) return 'local_incoerente'
      if (!descricao) return 'descricao_obrigatoria'
      return descricao.length > LIMITES_DA_VISTORIA.localManual ? 'descricao_longa' : null
    case 'nenhum':
      return temCoordenada || precisaoM !== null || descricao ? 'local_incoerente' : null
  }
}

/** "-26,304512, -48,845123 · ± 8 m", a descrição digitada ou "Sem localização". */
export function descreverLocal(local: LocalDaFoto): string {
  if (local.origem === 'manual') return local.localManual ?? ''
  if (local.origem === 'nenhum' || local.latitude === null || local.longitude === null)
    return 'Sem localização'
  const numero = (valor: number) => valor.toFixed(6).replace('.', ',')
  const coordenada = `${numero(local.latitude)}, ${numero(local.longitude)}`
  return local.precisaoM === null
    ? coordenada
    : `${coordenada} · ${rotuloDaPrecisao(local.precisaoM)}`
}

/** "± 8 m" (arredonda para o metro; abaixo de 1 m, "± 1 m"). */
export function rotuloDaPrecisao(metros: number): string {
  return `± ${String(Math.max(1, Math.round(metros)))} m`
}
