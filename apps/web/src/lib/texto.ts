/** Até duas iniciais em maiúsculas ("Metalúrgica Rio Cubatão" → "MR"). */
export function iniciais(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0] ?? '')
    .join('')
    .toUpperCase()
}

/** Tamanho de arquivo para a tela: "350 KB", "2,4 MB" (nunca "0 KB"). */
export function tamanhoLegivel(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
    : `${String(Math.max(1, Math.round(bytes / 1024)))} KB`
}

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Confere o formato de um id vindo da URL antes de mandá-lo a uma coluna uuid do banco. */
export function ehUuid(valor: string | null | undefined): valor is string {
  return typeof valor === 'string' && FORMATO_UUID.test(valor)
}
