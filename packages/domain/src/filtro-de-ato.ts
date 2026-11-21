// Filtro dos atos lidos nos diários oficiais (catálogo de normas, ADR-0050, pacote L2). Regra barata
// que decide, antes de gravar, se um ato do DOE-SC, da ALESC ou do DOEM de Joinville é norma
// ambiental. Atos individuais (licença ou autorização concedida a terceiro, auto de infração, edital
// de notificação) e atos de pessoal ou de compras nunca entram, mesmo publicados por órgão ambiental.

import { ORGAOS_RECONHECIDOS, lerIdentificadorDeNorma } from './norma'
import type { IdentificadorDeNorma } from './norma'

export interface AtoDoDiario {
  /** Título ou cabeçalho do ato ("PORTARIA Nº 096/2026", "Instrução Normativa SEI Nº 02/2026"). */
  titulo: string
  /** Texto integral (ou o resumo, quando a fonte só traz isso). */
  texto: string
  /** Categoria do diário ("IMA – Instituto do Meio Ambiente", "JUCESC – Junta Comercial"). */
  categoria?: string
  /** Órgão ou unidade que publicou ("SAMA.UAT", "Secretaria de Meio Ambiente"). */
  entidade?: string
  /** Tipo do documento na fonte ("Autorização Ambiental - AuA", "INSTRUÇÃO NORMATIVA"). */
  tipoDocumento?: string
}

export type MotivoDoFiltro =
  'normativo_ambiental' | 'ato_individual' | 'pessoal' | 'fora_do_tema' | 'sem_identificador'

export interface AvaliacaoDoAto {
  relevante: boolean
  motivo: MotivoDoFiltro
  /** Norma que o próprio ato é. Sempre null no ato individual. */
  identificador: IdentificadorDeNorma | null
}

// Palavra inteira, também com acento (o \b do JavaScript não conhece letras acentuadas).
const INICIO = '(?<![\\p{L}\\p{N}])'
const FIM = '(?![\\p{L}\\p{N}])'

// Ato individual: só no começo do título ou do texto (uma IN cita "Licença Ambiental de Operação"
// no corpo o tempo todo) e em qualquer ponto do tipo do documento.
const PREFIXO_DO_INDIVIDUAL =
  '^[\\s\\p{P}]*(?:(?:extrato|renova[çc][ãa]o|aviso|publica[çc][ãa]o)\\s+(?:d[aeo]s?\\s+)?)?'
const INDIVIDUAL =
  'licen[çc]a\\s+ambiental|licen[çc]a\\s+(?:pr[ée]via|de\\s+instala[çc][ãa]o|de\\s+opera[çc][ãa]o)|' +
  'autoriza[çc][ãa]o\\s+ambiental|auto\\s+de\\s+infra[çc][ãa]o|' +
  'edital\\s+de\\s+(?:notifica[çc][ãa]o|intima[çc][ãa]o)|notifica[çc][ãa]o\\s+de\\s+auto'
const SIGLA_DO_INDIVIDUAL = `${INICIO}(?:LAO|LAI|LAP|AuA|AUA)${FIM}`
const INDIVIDUAL_NO_COMECO = new RegExp(`${PREFIXO_DO_INDIVIDUAL}(?:${INDIVIDUAL})${FIM}`, 'iu')
const SIGLA_NO_COMECO = new RegExp(`${PREFIXO_DO_INDIVIDUAL}${SIGLA_DO_INDIVIDUAL}`, 'u')
const INDIVIDUAL_EM_QUALQUER_PONTO = new RegExp(`${INICIO}(?:${INDIVIDUAL})${FIM}`, 'iu')
const SIGLA_EM_QUALQUER_PONTO = new RegExp(SIGLA_DO_INDIVIDUAL, 'u')

// Pessoal e compras: na categoria, no tipo, no título e na abertura do texto (onde fica o verbo do
// ato: "RESOLVE: NOMEAR ..."), nunca no corpo inteiro, que pode citar contrato ou licitação.
const PESSOAL = new RegExp(
  INICIO +
    '(?:nomei(?:a|am)|nomear|nomea[çc][ãa]o|exoner(?:a|am|ar)|exonera[çc][ãa]o|' +
    'design(?:a|am|ar)|designa[çc][ãa]o|f[ée]rias|gratifica[çc](?:[ãa]o|[õo]es)|di[áa]rias|' +
    'contratos?|contrata[çc][ãa]o|licita[çc](?:[ãa]o|[õo]es)|preg[ãa]o|' +
    'atas?\\s+de\\s+registro\\s+de\\s+pre[çc]os?|extratos?|termo\\s+aditivo)' +
    FIM,
  'iu',
)
const RESOLVE = new RegExp(`${INICIO}resolve(?:m)?${FIM}`, 'iu')
const TAMANHO_DA_ABERTURA = 400
const TAMANHO_DEPOIS_DO_RESOLVE = 300

// Órgão ambiental na categoria ou na entidade. Siglas só em maiúsculas ("SAMA.UAT" vale).
const ORGAO_AMBIENTAL = new RegExp(
  `${INICIO}(?:IMA|SEMAE|CONSEMA|SAMA|FLORAM|FUJAMA|COMDEMA)${FIM}`,
  'u',
)
const MEIO_AMBIENTE = /meio\s+ambiente/iu

// Tema ambiental no título ou no texto. "Emissão", "supressão" e "outorga" sozinhas pegariam nota
// fiscal, cargo suprimido e outorga onerosa do direito de construir; por isso vêm com complemento.
const TEMA_AMBIENTAL = new RegExp(
  INICIO +
    '(?:licenciamento|ambienta(?:l|is)|res[íi]duos?|efluentes?|' +
    'emiss(?:[ãa]o|[õo]es)\\s+(?:atmosf[ée]ricas?|de\\s+(?:poluentes|gases|ru[íi]dos?|odores|efluentes))|' +
    'supress[ãa]o\\s+(?:de\\s+)?vegeta(?:[çc][ãa]o|l)|' +
    '[áa]reas?\\s+de\\s+preserva[çc][ãa]o\\s+permanente|' +
    'fauna|flora|recursos\\s+h[íi]dricos|outorgas?(?!\\s+onerosa))' +
    FIM,
  'iu',
)
const SIGLA_DE_TEMA = new RegExp(`${INICIO}(?:CONSEMA|APPs?)${FIM}`, 'u')
const CGSIM = new RegExp(`${INICIO}CGSIM${FIM}`, 'u')
const CLASSIFICACAO_DE_RISCO = /(?:n[íi]vel|grau|classifica[çc][ãa]o)\s+de\s+risco|baixo\s+risco/iu

// Ruído entre o tipo e o número que a leitura do identificador não aceita: o "SEI" do DOEM de
// Joinville ("Instrução Normativa SEI Nº 02/2026"), "Conjunta" e siglas de órgão fora da lista
// reconhecida ("CGSIM-SC", "COMDEMA", "SES/SAP"). Sigla de órgão reconhecido fica, sem a UF
// ("IMA-SC" vira "IMA"). Palavra que não é sigla (minúscula, "Nº") deixa o trecho como está.
const ORGAOS: readonly string[] = ORGAOS_RECONHECIDOS
const TIPO_E_RUIDO = new RegExp(
  `(${INICIO}(?:lei(?:\\s+complementar)?|decreto|resolu[çc][ãa]o|instru[çc][ãa]o\\s+normativa|` +
    'portaria|delibera[çc][ãa]o)\\s+)((?:\\S+\\s+){1,3}?)(?=n\\.?\\s*[º°o]|n[uú]mero|\\d)',
  'giu',
)
const PALAVRA_DE_RUIDO = /^(?:SEI|[Cc]onjunta|CONJUNTA|[A-Z][A-Z0-9]*(?:[-./][A-Z0-9]+)*)$/u

function semRuido(cabecalho: string): string {
  return cabecalho.replace(TIPO_E_RUIDO, (trecho, tipo: string, ruido: string) => {
    const palavras = ruido.trim().split(/\s+/u)
    if (!palavras.every((p) => PALAVRA_DE_RUIDO.test(p))) return trecho
    const orgaos = palavras
      .map((p) => p.replace(/-[A-Z]{2}$/u, ''))
      .filter((p) => ORGAOS.includes(p))
    return tipo + orgaos.map((orgao) => `${orgao} `).join('')
  })
}

function abertura(texto: string): string {
  const resolve = RESOLVE.exec(texto)
  const inicio = texto.slice(0, TAMANHO_DA_ABERTURA)
  if (resolve === null) return inicio
  const depois = resolve.index + resolve[0].length
  return `${inicio} ${texto.slice(depois, depois + TAMANHO_DEPOIS_DO_RESOLVE)}`
}

function ehAtoIndividual(ato: AtoDoDiario): boolean {
  const tipo = ato.tipoDocumento ?? ''
  if (INDIVIDUAL_EM_QUALQUER_PONTO.test(tipo) || SIGLA_EM_QUALQUER_PONTO.test(tipo)) return true
  return [ato.titulo, ato.texto].some(
    (trecho) => INDIVIDUAL_NO_COMECO.test(trecho) || SIGLA_NO_COMECO.test(trecho),
  )
}

function ehPessoal(ato: AtoDoDiario): boolean {
  return [ato.categoria ?? '', ato.tipoDocumento ?? '', ato.titulo, abertura(ato.texto)].some(
    (trecho) => PESSOAL.test(trecho),
  )
}

/** Norma que o próprio ato é: pelo título e, se ele não disser, pela abertura do texto. */
function identificadorDoAto(ato: AtoDoDiario): IdentificadorDeNorma | null {
  return (
    lerIdentificadorDeNorma(semRuido(ato.titulo)) ??
    lerIdentificadorDeNorma(semRuido(ato.texto.slice(0, TAMANHO_DA_ABERTURA)))
  )
}

function ehAmbiental(ato: AtoDoDiario): boolean {
  if ([ato.categoria ?? '', ato.entidade ?? ''].some((o) => ORGAO_AMBIENTAL.test(o))) return true
  if ([ato.categoria ?? '', ato.entidade ?? ''].some((o) => MEIO_AMBIENTE.test(o))) return true
  const conteudo = `${ato.titulo}\n${ato.texto}`
  if (TEMA_AMBIENTAL.test(conteudo) || SIGLA_DE_TEMA.test(conteudo)) return true
  return CGSIM.test(conteudo) && CLASSIFICACAO_DE_RISCO.test(conteudo)
}

/**
 * Diz se o ato do diário entra no catálogo de normas. Ordem: ato individual, pessoal, sem
 * identificador de norma, fora do tema ambiental. Só "normativo_ambiental" é relevante.
 */
export function avaliarAtoDoDiario(ato: AtoDoDiario): AvaliacaoDoAto {
  if (ehAtoIndividual(ato)) {
    return { relevante: false, motivo: 'ato_individual', identificador: null }
  }
  const identificador = identificadorDoAto(ato)
  if (ehPessoal(ato)) return { relevante: false, motivo: 'pessoal', identificador }
  if (identificador === null) {
    return { relevante: false, motivo: 'sem_identificador', identificador: null }
  }
  if (!ehAmbiental(ato)) return { relevante: false, motivo: 'fora_do_tema', identificador }
  return { relevante: true, motivo: 'normativo_ambiental', identificador }
}
