// Datas da planilha (ADR-0043): dd/mm/aaaa, d/m/aaaa, aaaa-mm-dd e o número de série do Excel
// (sistema 1900). Sem `new Date`: a data civil não pode depender do fuso do aparelho (ADR-0009).
// Ano com dois dígitos ou fora de 1900..2100 é data inválida (decisão conservadora).

import { adicionarDias, ehDataCivil, type DataCivil } from '../data-civil'
import type { CelulaLida } from './tipos'

const ANO_MINIMO = 1900
const ANO_MAXIMO = 2100

function montar(ano: number, mes: number, dia: number): DataCivil | null {
  if (ano < ANO_MINIMO || ano > ANO_MAXIMO) return null
  const texto = `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  return ehDataCivil(texto) ? texto : null
}

/**
 * Número de série do Excel no sistema 1900: 1 = 01/01/1900. O 60 é o 29/02/1900 que o Excel
 * inventou (1900 não foi bissexto): inválido. A parte da hora é ignorada.
 */
export function dataDoSerialDoExcel(serial: number): DataCivil | null {
  if (!Number.isFinite(serial) || serial < 1) return null
  const dia = Math.floor(serial)
  if (dia === 60) return null
  // Até o 59 conta de 31/12/1899; depois do 29/02 fictício, de 30/12/1899.
  const data = adicionarDias('1899-12-31', dia < 60 ? dia : dia - 1)
  const ano = Number(data.slice(0, 4))
  return ano >= ANO_MINIMO && ano <= ANO_MAXIMO ? data : null
}

function dataDoTexto(texto: string): DataCivil | null {
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto)
  if (br) return montar(Number(br[3]), Number(br[2]), Number(br[1]))
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto)
  if (iso) return montar(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  return null
}

/** Data da célula e o texto como veio no arquivo (vazio quando a célula está vazia). */
export function lerDataDaPlanilha(celula: CelulaLida): {
  data: DataCivil | null
  textoOriginal: string
} {
  const textoOriginal = celula.texto.trim()
  if (typeof celula.valor === 'number') {
    return { data: dataDoSerialDoExcel(celula.valor), textoOriginal }
  }
  if (typeof celula.valor === 'string') {
    return {
      data: dataDoTexto(celula.valor.trim()),
      textoOriginal: textoOriginal || celula.valor.trim(),
    }
  }
  return { data: textoOriginal ? dataDoTexto(textoOriginal) : null, textoOriginal }
}
