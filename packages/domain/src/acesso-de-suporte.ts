// Acesso de suporte (ADM-01; ADR-0025; Termos de Uso §13): durações, categorias da emergência e
// os rótulos de tempo. O banco confere as mesmas regras (2, 24 ou 48 horas; emergência de 2 horas;
// as três categorias); aqui ficam para o front oferecer e mostrar sem repetir número solto.

import { dataEHoraNoFuso, formatarDataCivil } from './data-civil'

/** Durações que a Gestão pode autorizar, em horas. O máximo é 48. */
export const DURACOES_DE_SUPORTE_HORAS = [2, 24, 48] as const
export type DuracaoDeSuporte = (typeof DURACOES_DE_SUPORTE_HORAS)[number]

/** O acesso de emergência dura sempre 2 horas. */
export const DURACAO_DA_EMERGENCIA_HORAS = 2

/** Motivo: até 500 caracteres (obrigatório na emergência, opcional na autorização). */
export const LIMITE_DO_MOTIVO_DE_SUPORTE = 500

export const CATEGORIAS_DE_EMERGENCIA = [
  'incidente_de_seguranca',
  'falha_grave',
  'ordem_legal',
] as const
export type CategoriaDeEmergencia = (typeof CATEGORIAS_DE_EMERGENCIA)[number]

export const ROTULO_DA_CATEGORIA_DE_EMERGENCIA: Record<CategoriaDeEmergencia, string> = {
  incidente_de_seguranca: 'Incidente de segurança',
  falha_grave: 'Falha grave que impede o uso',
  ordem_legal: 'Ordem legal ou judicial',
}

export function ehCategoriaDeEmergencia(valor: unknown): valor is CategoriaDeEmergencia {
  return (
    typeof valor === 'string' && (CATEGORIAS_DE_EMERGENCIA as readonly string[]).includes(valor)
  )
}

export function ehDuracaoDeSuporte(valor: unknown): valor is DuracaoDeSuporte {
  return (
    typeof valor === 'number' && (DURACOES_DE_SUPORTE_HORAS as readonly number[]).includes(valor)
  )
}

/** "2 horas", "24 horas", "48 horas". */
export function rotuloDaDuracaoDeSuporte(horas: DuracaoDeSuporte): string {
  return `${String(horas)} horas`
}

/** O acesso vale enquanto agora < fim previsto (o banco usa a mesma regra). */
export function suporteValendo(fimPrevisto: string, agora: Date): boolean {
  return agora.getTime() < new Date(fimPrevisto).getTime()
}

/**
 * Fim do acesso para a faixa do suporte, no fuso da consultoria: "termina às 14:30" quando acaba
 * no mesmo dia civil de agora; senão "termina em 16/11/2026 às 14:30" (autorização de 24 ou 48 h).
 */
export function rotuloDoFimDoSuporte(fimPrevisto: string, fuso: string, agora: Date): string {
  const fim = dataEHoraNoFuso(new Date(fimPrevisto), fuso)
  const hoje = dataEHoraNoFuso(agora, fuso).data
  const hora = fim.hora.slice(0, 5)
  return fim.data === hoje
    ? `termina às ${hora}`
    : `termina em ${formatarDataCivil(fim.data)} às ${hora}`
}
