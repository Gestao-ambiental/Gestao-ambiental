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
