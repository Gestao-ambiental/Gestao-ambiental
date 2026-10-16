// Regras puras do domínio (ADR-0007). As funções portadas do protótipo entram na tarefa 1.4.

/** Data civil no formato ISO `AAAA-MM-DD`, sem hora nem fuso (ADR-0009). */
export type DataCivil = `${number}-${number}-${number}`

/** Formata uma data civil para exibição `dd/mm/aaaa`, sem passar por `Date`. */
export function formatarDataCivil(data: DataCivil): string {
  const [ano, mes, dia] = data.split('-')
  return `${dia ?? ''}/${mes ?? ''}/${ano ?? ''}`
}
