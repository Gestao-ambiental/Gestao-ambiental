// CPF nunca sai do aparelho (ADR-0043): coluna com cara de CPF é descartada antes de qualquer
// envio, e valor com cara de CPF em outra coluna vira vazio. O banco recusa o lote que ainda
// trouxer CPF (cpf_nao_aceito).

import { cpfValido } from '../documento'
import { normalizarCabecalho } from './campos'
import type { CelulaLida, TabelaLida } from './tipos'

const CPF_FORMATADO = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/
const CPF_FORMATADO_DENTRO = /\d{3}\.\d{3}\.\d{3}-\d{2}/

function onzeDigitosValidos(texto: string): boolean {
  const digitos = texto.trim().replace(/[.\-\s]/g, '')
  return /^\d{11}$/.test(digitos) && cpfValido(digitos)
}

/** 000.000.000-00 em qualquer lugar do texto, ou 11 dígitos com os verificadores de CPF. */
export function valorPareceCpf(texto: string): boolean {
  const valor = texto.trim()
  if (valor === '') return false
  return CPF_FORMATADO.test(valor) || CPF_FORMATADO_DENTRO.test(valor) || onzeDigitosValidos(valor)
}

/**
 * Número inteiro de 9 a 11 dígitos que, com os zeros à esquerda que o Excel tira, é um CPF válido
 * (o CPF 012.345.678-90 guardado como número vira 1234567890). Número menor fica de fora: um
 * número de licença curto não vira CPF por acaso.
 */
export function numeroPareceCpf(valor: unknown): boolean {
  if (typeof valor !== 'number' || !Number.isSafeInteger(valor) || valor <= 0) return false
  const digitos = String(valor)
  return digitos.length >= 9 && digitos.length <= 11 && cpfValido(digitos.padStart(11, '0'))
}

/** Texto da célula para procurar CPF: o número inteiro ganha de volta os zeros à esquerda. */
function textoParaProcurarCpf(celula: CelulaLida | undefined): string {
  if (!celula) return ''
  return numeroPareceCpf(celula.valor) ? String(celula.valor).padStart(11, '0') : celula.texto
}

/**
 * Coluna de CPF: cabeçalho com a palavra "cpf" ou com cara de CPF (planilha sem cabeçalho), algum
 * valor 000.000.000-00, ou pelo menos metade dos valores preenchidos com 11 dígitos de CPF válido.
 */
export function colunaPareceCpf(cabecalho: string, valores: readonly string[]): boolean {
  if (normalizarCabecalho(cabecalho).split(' ').includes('cpf')) return true
  if (valorPareceCpf(cabecalho)) return true
  const preenchidos = valores.map((v) => v.trim()).filter((v) => v !== '')
  if (preenchidos.some((v) => CPF_FORMATADO_DENTRO.test(v))) return true
  if (preenchidos.length === 0) return false
  const comCpf = preenchidos.filter(onzeDigitosValidos).length
  return comCpf * 2 >= preenchidos.length
}

/** Tira da tabela as colunas que parecem CPF; devolve os cabeçalhos descartados. */
export function descartarColunasDeCpf(tabela: TabelaLida): {
  tabela: TabelaLida
  descartadas: string[]
} {
  const manter: number[] = []
  const descartadas: string[] = []
  tabela.cabecalhos.forEach((cabecalho, indice) => {
    const valores = tabela.linhas.map((l) => textoParaProcurarCpf(l.celulas[indice]))
    if (colunaPareceCpf(cabecalho, valores)) descartadas.push(cabecalho)
    else manter.push(indice)
  })
  if (descartadas.length === 0) return { tabela, descartadas }
  return {
    tabela: {
      cabecalhos: manter.map((i) => tabela.cabecalhos[i] ?? ''),
      linhas: tabela.linhas.map((linha) => ({
        numeroLinha: linha.numeroLinha,
        celulas: manter.map((i) => linha.celulas[i] ?? { valor: null, texto: '' }),
      })),
    },
    descartadas,
  }
}

// Sem dígito colado dos lados: os 11 primeiros dígitos de um CNPJ não contam.
const CPF_NO_TEXTO = /(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/g

/**
 * Texto livre que sai do aparelho (o nome do arquivo) sem nada com cara de CPF: some o
 * 000.000.000-00 e os 11 dígitos seguidos com verificadores de CPF.
 */
export function tirarCpfDoTexto(texto: string): string {
  return texto
    .replace(CPF_NO_TEXTO, (trecho) =>
      CPF_FORMATADO.test(trecho) || cpfValido(trecho) ? '' : trecho,
    )
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+(?=\.[a-z0-9]+$)/i, '')
    .trim()
}
