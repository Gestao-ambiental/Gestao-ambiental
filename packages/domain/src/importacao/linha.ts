// Linha da importação (ADR-0043): dados normalizados, erros de formato e duplicidade dentro da
// planilha. O banco repete estas regras e acrescenta as que dependem dele (tipo desconhecido,
// empreendimento ou licença já cadastrados, unidade ambígua). Duplicidade nunca é erro.

import { formatarDataCivil, type DataCivil } from '../data-civil'
import { cnpjValido } from '../documento'
import {
  CAMPOS_DA_IMPORTACAO,
  normalizarTextoDeComparacao,
  rotuloDoCampoDaImportacao,
} from './campos'
import { numeroPareceCpf, valorPareceCpf } from './cpf'
import { celulaDeCsv } from './csv'
import { lerDataDaPlanilha } from './datas'
import {
  PRAZO_PARA_DESFAZER_HORAS,
  TEXTO_MAXIMO,
  type CampoDaImportacao,
  type CelulaLida,
  type CodigoDeAvisoDaLinha,
  type CodigoDeErroDaLinha,
  type DadosDaLinha,
  type EntidadeDaImportacao,
  type LinhaLida,
  type MapeamentoDeColunas,
  type ProblemaDaLinha,
} from './tipos'

const CNPJ_COMPLETO = /^[0-9A-Z]{12}[0-9]{2}$/

type CampoDeTexto = Exclude<CampoDaImportacao, 'cnpj' | 'emitido_em' | 'validade'>

const CAMPOS_DE_DATA = ['emitido_em', 'validade'] as const satisfies readonly CampoDaImportacao[]

export function dadosVazios(): DadosDaLinha {
  return {
    empreendimento: null,
    cliente: null,
    cnpj: null,
    unidade: null,
    endereco: null,
    tipo: null,
    numero: null,
    orgao: null,
    emitido_em: null,
    emitido_em_texto: null,
    validade: null,
    validade_texto: null,
    descartados: [],
  }
}

function textoDaCelula(celula: CelulaLida | undefined): string {
  if (!celula) return ''
  return celula.texto.trim()
}

/**
 * CNPJ guardado como número no Excel: o valor inteiro (o texto formatado pode vir em notação
 * 1E+13), com os zeros à esquerda que o Excel tira de volta quando o CNPJ completo é válido.
 */
function textoDoCnpj(celula: CelulaLida | undefined): string {
  if (celula && typeof celula.valor === 'number' && Number.isSafeInteger(celula.valor)) {
    const digitos = String(celula.valor)
    const completo = digitos.padStart(14, '0')
    return digitos.length < 14 && cnpjValido(completo) ? completo : digitos
  }
  return textoDaCelula(celula)
}

/**
 * Dados da linha a partir das colunas escolhidas: sem espaço nas pontas, vazio vira nulo, CNPJ
 * normalizado. Valor com cara de CPF vira nulo e o campo entra em `descartados`; CNPJ com 11
 * dígitos (um CPF) é sempre descartado.
 */
export function montarDadosDaLinha(
  entidade: EntidadeDaImportacao,
  mapeamento: MapeamentoDeColunas,
  cabecalhos: readonly string[],
  linha: LinhaLida,
): DadosDaLinha {
  const dados = dadosVazios()
  const descartados: CampoDaImportacao[] = []
  const celulaDe = (campo: CampoDaImportacao): CelulaLida | undefined => {
    const cabecalho = mapeamento[campo]
    if (!cabecalho) return undefined
    const indice = cabecalhos.indexOf(cabecalho)
    return indice >= 0 ? linha.celulas[indice] : undefined
  }

  for (const { campo } of CAMPOS_DA_IMPORTACAO[entidade]) {
    const celula = celulaDe(campo)
    if (campo === 'cnpj') {
      const texto = textoDoCnpj(celula)
      if (texto === '') continue
      // Como private.normalizar_cnpj: só letras maiúsculas e dígitos, sem cortar no 14º.
      const cnpj = texto.toUpperCase().replace(/[^0-9A-Z]/g, '')
      // O CPF guardado como número perde os zeros à esquerda: confere o número também.
      if (valorPareceCpf(texto) || /^\d{11}$/.test(cnpj) || numeroPareceCpf(celula?.valor)) {
        descartados.push('cnpj')
      } else if (cnpj !== '') dados.cnpj = cnpj
      continue
    }
    if ((CAMPOS_DE_DATA as readonly string[]).includes(campo)) {
      const chave = campo as (typeof CAMPOS_DE_DATA)[number]
      if (!celula) continue
      const { data, textoOriginal } = lerDataDaPlanilha(celula)
      if (textoOriginal === '' && data === null) continue
      if (valorPareceCpf(textoOriginal)) {
        descartados.push(chave)
        continue
      }
      dados[chave] = data
      dados[`${chave}_texto`] = textoOriginal === '' ? null : textoOriginal
      continue
    }
    const texto = textoDaCelula(celula)
    if (texto === '') continue
    if (valorPareceCpf(texto)) {
      descartados.push(campo)
      continue
    }
    dados[campo as CampoDeTexto] = texto
  }
  dados.descartados = descartados
  return dados
}

function vazio(dados: DadosDaLinha, campo: CampoDaImportacao): boolean {
  if (campo === 'emitido_em' || campo === 'validade') {
    return dados[campo] === null && dados[`${campo}_texto`] === null
  }
  return dados[campo] === null
}

/**
 * Erros de formato e o aviso de licença vencida. O que depende do banco (tipo desconhecido,
 * duplicidade, unidade ambígua) vem da conferência do banco.
 */
export function validarLinha(
  entidade: EntidadeDaImportacao,
  dados: DadosDaLinha,
  hoje: DataCivil,
): { erros: ProblemaDaLinha[]; avisos: ProblemaDaLinha[] } {
  const erros: ProblemaDaLinha[] = []
  const avisos: ProblemaDaLinha[] = []
  const campos = CAMPOS_DA_IMPORTACAO[entidade]

  for (const campo of dados.descartados) erros.push({ codigo: 'valor_parece_cpf', campo })
  for (const { campo, obrigatorio } of campos) {
    if (obrigatorio && vazio(dados, campo) && !dados.descartados.includes(campo)) {
      erros.push({ codigo: 'campo_obrigatorio', campo })
    }
  }
  for (const { campo } of campos) {
    const valor =
      campo === 'emitido_em' || campo === 'validade' ? dados[`${campo}_texto`] : dados[campo]
    if (valor !== null && valor.length > TEXTO_MAXIMO) erros.push({ codigo: 'texto_longo', campo })
  }
  if (dados.cnpj !== null && !CNPJ_COMPLETO.test(dados.cnpj)) {
    erros.push({ codigo: 'cnpj_invalido', campo: 'cnpj' })
  }
  if (dados.endereco !== null && dados.unidade === null) {
    erros.push({ codigo: 'endereco_sem_unidade', campo: 'endereco' })
  }

  if (entidade === 'licenca') {
    for (const campo of CAMPOS_DE_DATA) {
      if (dados[campo] === null && dados[`${campo}_texto`] !== null) {
        erros.push({ codigo: 'data_invalida', campo })
      }
    }
    if (dados.emitido_em !== null && dados.emitido_em > hoje) {
      erros.push({ codigo: 'data_futura', campo: 'emitido_em' })
    }
    if (dados.emitido_em !== null && dados.validade !== null && dados.validade < dados.emitido_em) {
      erros.push({ codigo: 'validade_antes_da_emissao', campo: 'validade' })
    }
    if (dados.validade !== null && dados.validade < hoje) {
      avisos.push({ codigo: 'licenca_vencida', campo: 'validade' })
    }
  }
  return { erros, avisos }
}

/** Chave de duplicidade do empreendimento: CNPJ, ou nome e cliente normalizados. */
export function chaveDoEmpreendimento(dados: DadosDaLinha): string {
  if (dados.cnpj) return `cnpj:${dados.cnpj}`
  return `nome:${normalizarTextoDeComparacao(dados.empreendimento ?? '')}|${normalizarTextoDeComparacao(dados.cliente ?? '')}`
}

/** Chave de duplicidade da licença: tipo, número e órgão normalizados. */
export function chaveDaLicenca(dados: DadosDaLinha): string {
  return [dados.tipo, dados.numero, dados.orgao]
    .map((v) => normalizarTextoDeComparacao(v ?? ''))
    .join('|')
}

/**
 * Linhas repetidas dentro da planilha: a primeira ganha; as seguintes recebem o aviso de
 * repetida. Linha sem os dados da chave fica de fora (já tem erro de campo obrigatório).
 */
export function marcarRepetidas(
  entidade: EntidadeDaImportacao,
  linhas: readonly { numeroLinha: number; dados: DadosDaLinha }[],
): Map<number, ProblemaDaLinha> {
  const vistas = new Set<string>()
  const marcadas = new Map<number, ProblemaDaLinha>()
  for (const { numeroLinha, dados } of linhas) {
    const completa =
      entidade === 'empreendimento'
        ? dados.cnpj !== null || dados.empreendimento !== null
        : dados.tipo !== null && dados.numero !== null && dados.orgao !== null
    if (!completa) continue
    const chave =
      entidade === 'empreendimento' ? chaveDoEmpreendimento(dados) : chaveDaLicenca(dados)
    if (vistas.has(chave)) {
      marcadas.set(
        numeroLinha,
        entidade === 'empreendimento'
          ? { codigo: 'empreendimento_repetido_na_planilha', campo: 'empreendimento' }
          : { codigo: 'licenca_repetida_na_planilha', campo: 'numero' },
      )
    } else {
      vistas.add(chave)
    }
  }
  return marcadas
}

const MENSAGENS_FIXAS: Record<
  Exclude<CodigoDeErroDaLinha | CodigoDeAvisoDaLinha, 'empreendimento_ja_existe'>,
  string
> = {
  campo_obrigatorio: 'em branco',
  data_invalida: 'data inválida',
  data_futura: 'Emissão no futuro',
  validade_antes_da_emissao: 'Validade antes da emissão',
  cnpj_invalido: 'CNPJ incompleto',
  valor_parece_cpf: 'parece CPF e foi apagado',
  tipo_desconhecido: 'Tipo de licença não cadastrado',
  unidade_ambigua: 'Empreendimento com várias unidades: informe a unidade',
  endereco_sem_unidade: 'Endereço sem unidade',
  empreendimento_ambiguo: 'Mais de um empreendimento com estes dados',
  texto_longo: `mais de ${String(TEXTO_MAXIMO)} caracteres`,
  empreendimento_parecido: 'Já existe empreendimento com este nome',
  empreendimento_repetido_na_planilha: 'Repetido na planilha: fica de fora',
  licenca_ja_existe: 'Licença já cadastrada: fica de fora',
  licenca_repetida_na_planilha: 'Repetida na planilha: fica de fora',
  licenca_vencida: 'Licença vencida',
}

const COM_ROTULO = new Set<string>([
  'campo_obrigatorio',
  'data_invalida',
  'valor_parece_cpf',
  'texto_longo',
])

/** Texto curto do problema na tela e no CSV de erros. */
export function mensagemDoProblema(
  problema: ProblemaDaLinha,
  entidade: EntidadeDaImportacao,
): string {
  if (problema.codigo === 'empreendimento_ja_existe') {
    return entidade === 'empreendimento'
      ? 'Empreendimento já cadastrado: fica de fora'
      : 'Entra no empreendimento já cadastrado'
  }
  const mensagem = (MENSAGENS_FIXAS as Record<string, string | undefined>)[problema.codigo]
  if (!mensagem) return 'Linha com problema'
  if (COM_ROTULO.has(problema.codigo) && problema.campo) {
    return `${rotuloDoCampoDaImportacao(problema.campo)}: ${mensagem}`
  }
  return mensagem
}

function valorNoCsv(dados: DadosDaLinha, campo: CampoDaImportacao): string {
  if (campo === 'emitido_em' || campo === 'validade') {
    return dados[`${campo}_texto`] ?? formatarDataCivil(dados[campo])
  }
  return dados[campo] ?? ''
}

/** "Baixar erros (.csv)": Linha, as colunas da entidade e os erros, com ";" e BOM. */
export function linhasComErroEmCsv(
  entidade: EntidadeDaImportacao,
  linhas: readonly { numeroLinha: number; dados: DadosDaLinha; erros: ProblemaDaLinha[] }[],
): string {
  const campos = CAMPOS_DA_IMPORTACAO[entidade]
  const cabecalho = ['Linha', ...campos.map((c) => c.rotulo), 'Erros']
  const corpo = linhas.map((linha) => [
    String(linha.numeroLinha),
    ...campos.map((c) => valorNoCsv(linha.dados, c.campo)),
    linha.erros.map((e) => mensagemDoProblema(e, entidade)).join(' | '),
  ])
  return `\uFEFF${[cabecalho, ...corpo].map((l) => l.map(celulaDeCsv).join(';')).join('\r\n')}\r\n`
}

/** Desfazer vale até 24 h depois de efetivar (o banco confere de novo). */
export function podeDesfazer(efetivadaEm: string, agora: Date): boolean {
  const efetivada = Date.parse(efetivadaEm)
  if (Number.isNaN(efetivada)) return false
  return agora.getTime() < efetivada + PRAZO_PARA_DESFAZER_HORAS * 60 * 60 * 1000
}
