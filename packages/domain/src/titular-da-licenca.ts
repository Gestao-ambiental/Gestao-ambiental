// Titular da licença lido do texto do PDF (passo Documento do cadastro de licença).
// Roda no navegador sobre o texto que o pdf.js tira do PDF, antes de existir rascunho: serve para
// sugerir o empreendimento (já cadastrado ou a cadastrar). É sugestão: a pessoa confirma.
// Só lê CNPJ (14 posições). CPF nunca é capturado (CLAUDE.md: sem CPF no nosso banco).

import { cnpjValido } from './documento'
import { normalizarCnpj } from './cnpj'

export interface TitularDaLicenca {
  /** Razão social como está no documento, arrumada para exibir. */
  razaoSocial: string | null
  /** Só os 14 caracteres (sem pontuação). */
  cnpj: string | null
  endereco: string | null
  municipio: string | null
}

const ROTULOS_DO_TITULAR = [
  'razão social',
  'razao social',
  'nome empresarial',
  'empreendedor',
  'requerente',
  'interessado',
  'interessada',
  'titular',
  'empresa',
  'licenciado',
]

const ROTULOS_DO_ENDERECO = [
  'endereço do empreendimento',
  'endereco do empreendimento',
  'local do empreendimento',
  'localização',
  'localizacao',
  'endereço',
  'endereco',
  'logradouro',
]

/** Onde o valor de um rótulo termina: fim da linha ou outro rótulo comum na mesma linha. */
const FIM_DO_VALOR =
  /\s+(?:cnpj|cpf|inscri[çc][ãa]o|endere[çc]o|munic[íi]pio|atividade|c[óo]digo|cep|bairro)\b|\s{3,}|\n/i

const SUFIXOS = ['LTDA', 'LTDA.', 'S.A.', 'S/A', 'SA', 'ME', 'EPP', 'EIRELI', 'S.S.', 'SS']
const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em'])

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** "INDÚSTRIA HORIZONTE LTDA." → "Indústria Horizonte Ltda.". Mantém siglas de forma societária. */
export function arrumarNome(texto: string): string {
  const limpo = texto.replace(/\s+/g, ' ').trim()
  const maiusculas = limpo === limpo.toUpperCase() && /\p{L}/u.test(limpo)
  if (!maiusculas) return limpo
  return limpo
    .split(' ')
    .map((palavra, indice) => {
      const sem = palavra.replace(/[.,;]$/, '')
      if (SUFIXOS.includes(palavra) || SUFIXOS.includes(sem)) {
        return sem === 'LTDA' ? palavra.replace('LTDA', 'Ltda') : palavra
      }
      const minuscula = palavra.toLocaleLowerCase('pt-BR')
      if (indice > 0 && MINUSCULAS.has(minuscula)) return minuscula
      return minuscula.charAt(0).toLocaleUpperCase('pt-BR') + minuscula.slice(1)
    })
    .join(' ')
}

function valorDoRotulo(texto: string, rotulos: readonly string[]): string | null {
  for (const rotulo of rotulos) {
    const padrao = new RegExp(`(?:^|[\\s(])${escaparRegex(rotulo)}\\s*[:\\-–]\\s*([^\\n]+)`, 'i')
    const achado = padrao.exec(texto)
    if (!achado?.[1]) continue
    const valor =
      achado[1]
        .split(FIM_DO_VALOR)[0]
        ?.replace(/[,;\s-]+$/, '')
        .trim() ?? ''
    if (valor.length >= 3 && /\p{L}/u.test(valor)) return valor.slice(0, 160)
  }
  return null
}

const PADRAO_CNPJ =
  /\b([0-9A-Z]{2})[.\s]?([0-9A-Z]{3})[.\s]?([0-9A-Z]{3})[/\s]?([0-9A-Z]{4})[-\s]?(\d{2})\b/g

/** Primeiro CNPJ válido do texto (com verificadores certos). */
function primeiroCnpj(texto: string): { cnpj: string; inicio: number } | null {
  for (const achado of texto.toUpperCase().matchAll(PADRAO_CNPJ)) {
    const candidato = normalizarCnpj(achado.slice(1).join(''))
    if (cnpjValido(candidato)) return { cnpj: candidato, inicio: achado.index }
  }
  return null
}

/** Sem rótulo: o nome que vem logo antes do CNPJ ("... a ECO TRANSPORTES LTDA, inscrita no CNPJ"). */
function nomeAntesDoCnpj(texto: string, inicio: number): string | null {
  const linha = texto.slice(Math.max(0, texto.lastIndexOf('\n', inicio) + 1), inicio)
  const partes = linha.split(/[,:;]/).map((parte) => parte.trim())
  const comSufixo = [...partes]
    .reverse()
    .find((parte) =>
      SUFIXOS.some((sufixo) => new RegExp(`(^|\\s)${escaparRegex(sufixo)}$`, 'i').test(parte)),
    )
  if (!comSufixo) return null
  // Do fim para o começo, enquanto as palavras forem de nome (maiúscula inicial ou conectivo).
  const palavras = comSufixo.split(' ')
  const nome: string[] = []
  for (let i = palavras.length - 1; i >= 0; i--) {
    const palavra = palavras[i] ?? ''
    const deNome = /^[\p{Lu}0-9&]/u.test(palavra) || MINUSCULAS.has(palavra.toLowerCase())
    if (!deNome) break
    nome.unshift(palavra)
  }
  while (nome.length > 0 && MINUSCULAS.has((nome[0] ?? '').toLowerCase())) nome.shift()
  const candidato = nome.join(' ')
  return candidato.length >= 3 ? candidato : null
}

/** Município a partir de "Município: X" ou de "X/SC", "X - SC" no endereço. */
function municipioDe(texto: string, endereco: string | null): string | null {
  const rotulado = valorDoRotulo(texto, ['município', 'municipio'])
  if (rotulado) return arrumarNome(rotulado.replace(/\s*[/-]\s*[A-Z]{2}$/, ''))
  const fonte = endereco ?? texto
  const achado = /([\p{L}][\p{L}' ]{2,40}?)\s*[/-]\s*([A-Z]{2})\b/u.exec(fonte)
  return achado?.[1] ? arrumarNome(achado[1].trim()) : null
}

/** Lê razão social, CNPJ, endereço e município do texto da licença. Campos não achados vêm nulos. */
export function lerTitularDaLicenca(texto: string): TitularDaLicenca {
  const normalizado = texto.replace(/\r/g, '').replace(/[ \t]+/g, ' ')
  const cnpj = primeiroCnpj(normalizado)
  const rotulado = valorDoRotulo(normalizado, ROTULOS_DO_TITULAR)
  const semRotulo = cnpj ? nomeAntesDoCnpj(normalizado, cnpj.inicio) : null
  const razao = rotulado ?? semRotulo
  const endereco = valorDoRotulo(normalizado, ROTULOS_DO_ENDERECO)
  return {
    razaoSocial: razao ? arrumarNome(razao) : null,
    cnpj: cnpj?.cnpj ?? null,
    endereco: endereco ? endereco.replace(/\s+/g, ' ') : null,
    municipio: municipioDe(normalizado, endereco),
  }
}

/** Achou algo útil para sugerir um empreendimento? */
export function titularEncontrado(titular: TitularDaLicenca): boolean {
  return titular.razaoSocial !== null || titular.cnpj !== null
}

/** Nome sugerido para a unidade: o município, se houver; senão "Matriz". */
export function nomeDaUnidadeSugerido(titular: TitularDaLicenca): string {
  return titular.municipio ? `Unidade ${titular.municipio}` : 'Matriz'
}
