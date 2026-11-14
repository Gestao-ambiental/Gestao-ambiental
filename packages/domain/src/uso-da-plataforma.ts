// Sinal de uso da plataforma (ADM-01; ADR-0024): em que área do sistema a pessoa está, quando
// conta como "usando agora" e quando a central avisa que uma consultoria parou de usar.
// O banco grava uma linha por pessoa, dia (no fuso da consultoria) e área; aqui ficam os limiares
// e as classificações, que o front usa e passa às RPCs da central como parâmetro.

import { diferencaEmDias, hojeNoFuso } from './data-civil'

/** Uso nos últimos 15 minutos conta como "agora". */
export const MINUTOS_PARA_AGORA = 15
/** Consultoria com pessoas ativas e 14 dias sem uso entra no alerta da central. */
export const DIAS_SEM_USO_PARA_ALERTA = 14
/** Janela de "dias com uso" por pessoa e por área: 30 dias, hoje incluído. */
export const JANELA_DE_USO_DIAS = 30
/** O front registra cada área no máximo uma vez a cada 5 minutos; o banco também só renova depois disso. */
export const INTERVALO_DE_REGISTRO_MINUTOS = 5

export const MODULOS_DE_USO = [
  'licencas_e_prazos',
  'orcamentos',
  'propostas',
  'equipe_e_conta',
] as const
export type ModuloDeUso = (typeof MODULOS_DE_USO)[number]

export const ROTULO_DO_MODULO_DE_USO: Record<ModuloDeUso, string> = {
  licencas_e_prazos: 'Licenças e prazos',
  orcamentos: 'Orçamentos',
  propostas: 'Propostas',
  equipe_e_conta: 'Equipe e conta',
}

export function ehModuloDeUso(valor: unknown): valor is ModuloDeUso {
  return typeof valor === 'string' && (MODULOS_DE_USO as readonly string[]).includes(valor)
}

const MINUTO_MS = 60_000
const DIA_MS = 24 * 60 * MINUTO_MS

function segmentos(caminho: string): string[] {
  return (caminho.split(/[?#]/, 1)[0] ?? '').split('/').filter((s) => s !== '')
}

/**
 * Área do sistema de um caminho do app. Nula onde não se registra uso: central administrativa,
 * telas sem consultoria (entrar, escolher ou criar consultoria, convite) e caminhos desconhecidos.
 */
export function moduloDaRota(caminho: string): ModuloDeUso | null {
  const [primeiro, segundo, terceiro] = segmentos(caminho)
  if (primeiro === undefined) return 'licencas_e_prazos' // Visão da equipe
  switch (primeiro) {
    case 'calendario':
    case 'empreendimentos':
    case 'ocorrencias':
    case 'acompanhamentos':
    case 'renovacoes':
    case 'licencas':
    case 'residuos': // Resíduos, fase 1 (ADR-0028): MTR, CDF, conferência, painel e prazos
      return 'licencas_e_prazos'
    case 'orcamentos':
      return segundo !== undefined && terceiro === 'proposta' ? 'propostas' : 'orcamentos'
    case 'configuracoes':
      if (segundo === 'custos') return 'orcamentos'
      if (segundo === 'proposta') return 'propostas'
      if (segundo === 'equipe') return 'equipe_e_conta'
      return null
    case 'perfil':
    case 'seguranca':
      return 'equipe_e_conta'
    default:
      return null
  }
}

/** Como mostrar o último uso: nunca, agora (15 min), hoje (no fuso) ou há N dias civis. */
export type ClasseDoUltimoUso =
  { tipo: 'nunca' } | { tipo: 'agora' } | { tipo: 'hoje' } | { tipo: 'dias'; dias: number }

/** O instante conta como "agora"? Relógio adiantado no servidor (instante no futuro) também conta. */
export function usandoAgora(ultimoUsoEm: string, agora: Date): boolean {
  return agora.getTime() - new Date(ultimoUsoEm).getTime() < MINUTOS_PARA_AGORA * MINUTO_MS
}

/**
 * Classifica o último uso. "Hoje" e "há N dias" contam dias civis no fuso da consultoria, nunca
 * no fuso do aparelho: 23:50 de ontem é "há 1 dia" mesmo que tenham passado 20 minutos.
 */
export function classificarUltimoUso(
  ultimoUsoEm: string | null,
  agora: Date,
  fuso: string,
): ClasseDoUltimoUso {
  if (ultimoUsoEm === null) return { tipo: 'nunca' }
  if (usandoAgora(ultimoUsoEm, agora)) return { tipo: 'agora' }
  const dias = diferencaEmDias(hojeNoFuso(agora, fuso), hojeNoFuso(new Date(ultimoUsoEm), fuso))
  return dias <= 0 ? { tipo: 'hoje' } : { tipo: 'dias', dias }
}

export function rotuloDoUltimoUso(classe: ClasseDoUltimoUso): string {
  switch (classe.tipo) {
    case 'nunca':
      return 'Nunca'
    case 'agora':
      return 'Agora'
    case 'hoje':
      return 'Hoje'
    case 'dias':
      return classe.dias === 1 ? 'Há 1 dia' : `Há ${String(classe.dias)} dias`
  }
}

/** Dias inteiros (de 24 h) desde um instante; zero se o instante está no futuro. */
export function diasDesde(instante: string, agora: Date): number {
  return Math.max(0, Math.floor((agora.getTime() - new Date(instante).getTime()) / DIA_MS))
}

export interface ConsultoriaParaAlerta {
  pessoasAtivas: number
  ultimoUsoEm: string | null
  criadaEm: string
  arquivada: boolean
}

/**
 * Alerta "sem uso" da central: consultoria não arquivada, com pessoas ativas e nenhum uso nos
 * últimos 14 dias. A que nunca usou entra quando foi criada há mais de 14 dias. É a mesma regra
 * de central_alertas_sem_uso, que recebe o limiar daqui.
 */
export function precisaDeAlertaDeSemUso(
  consultoria: ConsultoriaParaAlerta,
  agora: Date,
  dias = DIAS_SEM_USO_PARA_ALERTA,
): boolean {
  if (consultoria.arquivada || consultoria.pessoasAtivas <= 0) return false
  const referencia = new Date(consultoria.ultimoUsoEm ?? consultoria.criadaEm).getTime()
  return referencia < agora.getTime() - dias * DIA_MS
}

/** "Sem uso há 20 dias" ou, se nunca usou, "Nunca usou · criada há 30 dias". */
export function rotuloDoAlertaDeSemUso(
  consultoria: Pick<ConsultoriaParaAlerta, 'ultimoUsoEm' | 'criadaEm'>,
  agora: Date,
): string {
  const plural = (n: number) => (n === 1 ? '1 dia' : `${String(n)} dias`)
  if (consultoria.ultimoUsoEm === null) {
    return `Nunca usou · criada há ${plural(diasDesde(consultoria.criadaEm, agora))}`
  }
  return `Sem uso há ${plural(diasDesde(consultoria.ultimoUsoEm, agora))}`
}

/** O front pode registrar de novo esta área? Só se o último registro tem 5 minutos ou mais. */
export function podeRegistrarUso(ultimoRegistroMs: number | undefined, agoraMs: number): boolean {
  return (
    ultimoRegistroMs === undefined ||
    agoraMs - ultimoRegistroMs >= INTERVALO_DE_REGISTRO_MINUTOS * MINUTO_MS
  )
}
