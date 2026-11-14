import type { TarefaDeServico } from '@/lib/api/tarefas'

/** "Vence em 3 dias", "Vence hoje", "Atrasada 2 dias", com palavra (não só cor). */
export function textoDoPrazo(tarefa: Pick<TarefaDeServico, 'dias' | 'situacao'>): string | null {
  if (tarefa.dias === null || tarefa.situacao === 'concluida' || tarefa.situacao === 'cancelada')
    return null
  if (tarefa.dias < 0)
    return `Atrasada ${String(-tarefa.dias)} ${tarefa.dias === -1 ? 'dia' : 'dias'}`
  if (tarefa.dias === 0) return 'Vence hoje'
  return `Vence em ${String(tarefa.dias)} ${tarefa.dias === 1 ? 'dia' : 'dias'}`
}
