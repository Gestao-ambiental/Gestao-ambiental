// Aprovação do orçamento com tarefas (ADR-0029; FIN-01, FIN-03; Protótipo 22). Regras puras: o
// roteiro inicial (uma tarefa por item), o prazo interno sugerido, a validação do aceite e das
// tarefas e as mudanças de situação permitidas. O banco repete as validações (aprovar_orcamento,
// mudar_situacao_tarefa_servico).

import { dataCivil, ehDataCivil, ultimoDiaDoMes, type DataCivil } from './data-civil'
import { lerDuracao } from './orcamento'

export const SITUACOES_DA_TAREFA = ['a_fazer', 'em_andamento', 'concluida', 'cancelada'] as const
export type SituacaoDaTarefa = (typeof SITUACOES_DA_TAREFA)[number]

export const ROTULO_DA_SITUACAO_DA_TAREFA: Record<SituacaoDaTarefa, string> = {
  a_fazer: 'A fazer',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
}

export const METODOS_DE_ACEITE = [
  'email',
  'whatsapp',
  'telefone',
  'reuniao',
  'documento_assinado',
  'outro',
] as const
export type MetodoDeAceite = (typeof METODOS_DE_ACEITE)[number]

export const ROTULO_DO_METODO_DE_ACEITE: Record<MetodoDeAceite, string> = {
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  telefone: 'Telefone',
  reuniao: 'Reunião',
  documento_assinado: 'Documento assinado',
  outro: 'Outro',
}

export function ehSituacaoDaTarefa(valor: unknown): valor is SituacaoDaTarefa {
  return typeof valor === 'string' && (SITUACOES_DA_TAREFA as readonly string[]).includes(valor)
}

/** Prazo interno sugerido: o último dia do mês previsto do serviço (aaaa-mm-01). Sem mês, sem prazo. */
export function prazoInternoSugerido(mesPrevisto: string | null): DataCivil | null {
  if (mesPrevisto === null || !ehDataCivil(mesPrevisto)) return null
  const [ano, mes] = mesPrevisto.split('-').map(Number) as [number, number]
  return dataCivil(
    `${String(ano)}-${String(mes).padStart(2, '0')}-${String(ultimoDiaDoMes(ano, mes)).padStart(2, '0')}`,
  )
}

/** Item do orçamento como a aprovação precisa. */
export interface ItemParaTarefa {
  id: string
  descricao: string
  minutos: number
  responsavelId: string | null
  mesPrevisto: string | null
}

/** Linha do roteiro na tela: texto das horas como digitado; prazo vazio = sem prazo. */
export interface TarefaDoRoteiro {
  chave: string
  itemId: string | null
  titulo: string
  responsavelId: string | null
  horas: string
  prazoInterno: DataCivil | ''
}

/** Minutos → texto do campo de horas ("1,5"; 0 vira vazio). */
export function horasDoCampo(minutos: number): string {
  if (minutos <= 0) return ''
  const horas = minutos / 60
  return Number.isInteger(horas)
    ? String(horas)
    : horas.toFixed(2).replace(/0$/, '').replace('.', ',')
}

/**
 * Roteiro inicial: uma tarefa por item que ainda não tem tarefa (revisão anterior aprovada), com o
 * que a Gestão escolheu no orçamento — descrição, responsável, horas e o fim do mês previsto.
 */
export function roteiroInicial(
  itens: readonly ItemParaTarefa[],
  itensComTarefa: ReadonlySet<string>,
): TarefaDoRoteiro[] {
  return itens
    .filter((i) => !itensComTarefa.has(i.id))
    .map((i) => ({
      chave: i.id,
      itemId: i.id,
      titulo: i.descricao.trim(),
      responsavelId: i.responsavelId,
      horas: horasDoCampo(i.minutos),
      prazoInterno: prazoInternoSugerido(i.mesPrevisto) ?? '',
    }))
}

/** Horas digitadas → minutos. Vazio = não estimada (nulo, nunca zero). `undefined` = inválido. */
export function minutosDasHoras(texto: string): number | null | undefined {
  if (texto.trim() === '') return null
  const minutos = lerDuracao(texto)
  if (minutos === null || minutos <= 0) return undefined
  return minutos
}

export interface AceiteDigitado {
  aprovadoPor: string
  dataAceite: DataCivil | ''
  referencia: string
}

/** Erros do aceite por campo: pessoa, data (não no futuro) e referência obrigatórias. */
export function errosDoAceite(
  aceite: AceiteDigitado,
  hoje: DataCivil,
): Partial<Record<keyof AceiteDigitado, string>> {
  const erros: Partial<Record<keyof AceiteDigitado, string>> = {}
  const pessoa = aceite.aprovadoPor.trim()
  if (pessoa === '') erros.aprovadoPor = 'Informe quem aprovou'
  else if (pessoa.length > 200) erros.aprovadoPor = 'Use até 200 caracteres'
  if (aceite.dataAceite === '') erros.dataAceite = 'Informe a data do aceite'
  else if (aceite.dataAceite > hoje) erros.dataAceite = 'A data do aceite não pode ser futura'
  const referencia = aceite.referencia.trim()
  if (referencia === '') erros.referencia = 'Informe a referência'
  else if (referencia.length > 300) erros.referencia = 'Use até 300 caracteres'
  return erros
}

/** Erros de cada tarefa do roteiro, pela chave: título obrigatório e horas válidas. */
export function errosDoRoteiro(
  tarefas: readonly TarefaDoRoteiro[],
): Record<string, Partial<Record<'titulo' | 'horas', string>>> {
  const erros: Record<string, Partial<Record<'titulo' | 'horas', string>>> = {}
  for (const t of tarefas) {
    const daTarefa: Partial<Record<'titulo' | 'horas', string>> = {}
    const titulo = t.titulo.trim()
    if (titulo === '') daTarefa.titulo = 'Informe a tarefa'
    else if (titulo.length > 200) daTarefa.titulo = 'Use até 200 caracteres'
    if (minutosDasHoras(t.horas) === undefined) daTarefa.horas = 'Horas inválidas'
    if (Object.keys(daTarefa).length > 0) erros[t.chave] = daTarefa
  }
  return erros
}

/** Situações para onde a tarefa pode ir. Cancelar e descancelar só a Gestão. */
export function proximasSituacoesDaTarefa(
  situacao: SituacaoDaTarefa,
  ehGestao: boolean,
): SituacaoDaTarefa[] {
  const base: Record<SituacaoDaTarefa, SituacaoDaTarefa[]> = {
    a_fazer: ['em_andamento', 'concluida'],
    em_andamento: ['concluida', 'a_fazer'],
    concluida: ['em_andamento'],
    cancelada: ehGestao ? ['a_fazer'] : [],
  }
  const proximas = base[situacao]
  return ehGestao && situacao !== 'cancelada' ? [...proximas, 'cancelada'] : proximas
}

/** Rótulo do botão de cada mudança. */
export function rotuloDaAcaoDaTarefa(de: SituacaoDaTarefa, para: SituacaoDaTarefa): string {
  if (para === 'em_andamento') return de === 'concluida' ? 'Reabrir' : 'Iniciar'
  if (para === 'concluida') return 'Concluir'
  if (para === 'cancelada') return 'Cancelar tarefa'
  return de === 'cancelada' ? 'Restaurar' : 'Voltar para a fazer'
}
