// CSV da importação (ADR-0043): UTF-8 com recuo para windows-1252 (o "Salvar como CSV" do Excel
// em português) e separador ";" detectado. A saída "Baixar erros" usa ";" e BOM, para o Excel
// abrir com acento e colunas certas.

// O pacote de domínio não carrega os tipos do DOM; o TextDecoder existe no navegador e no Node.
declare const TextDecoder: new (
  rotulo: string,
  opcoes?: { fatal?: boolean },
) => { decode: (bytes: Uint8Array) => string }

/** Texto do arquivo: UTF-8 quando válido; senão windows-1252. Sem BOM. */
export function decodificarCsv(bytes: Uint8Array): string {
  let texto: string
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    texto = new TextDecoder('windows-1252').decode(bytes)
  }
  return texto.startsWith('\uFEFF') ? texto.slice(1) : texto
}

/** ";" ou ",": conta os dois na primeira linha, fora de aspas; ";" ganha o empate. */
export function detectarSeparadorDoCsv(texto: string): ';' | ',' {
  let pontoEVirgula = 0
  let virgula = 0
  let dentroDeAspas = false
  for (const caractere of texto) {
    if (caractere === '"') dentroDeAspas = !dentroDeAspas
    else if (!dentroDeAspas && (caractere === '\n' || caractere === '\r')) break
    else if (!dentroDeAspas && caractere === ';') pontoEVirgula++
    else if (!dentroDeAspas && caractere === ',') virgula++
  }
  return virgula > pontoEVirgula ? ',' : ';'
}

/**
 * Célula de CSV com ";": entre aspas quando tem separador, aspas ou quebra de linha. Texto que
 * começa com = + - @ ganha um apóstrofo, para a planilha não o tratar como fórmula.
 */
export function celulaDeCsv(valor: string): string {
  const seguro = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor
  return /[;"\r\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro
}
