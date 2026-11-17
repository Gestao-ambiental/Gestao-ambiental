// Validação da entrada (especificação 0.1, "Validação"). A entrada chega como JSON de fora, então
// nada é presumido pelo tipo: cada campo é conferido. Carteira inválida não gera plano parcial.

import { paraDia } from './datas'
import {
  ESTRATEGIAS,
  type Antecipabilidade,
  type CodigoDeErro,
  type ErroDeValidacao,
  type Estrategia,
} from './tipos'

export interface DependenciaValida {
  id: string
  defasagemDias: number
}

/** Atividade conferida, com datas em dias inteiros e gravidade como posição em `niveis`. */
export interface AtividadeValida {
  id: string
  prazo: number | null
  duracaoDias: number
  esperaDias: number
  esforcoHoras: number
  gravidade: number
  antecipabilidade: Antecipabilidade
  inicioMaisCedo: number | null
  inicioFixo: number | null
  fracaoAntecipavel: number
  dependeDe: DependenciaValida[]
  /** Posição na carteira de entrada, para devolver os itens na mesma ordem. */
  posicao: number
}

export interface ParametrosValidos {
  versao: string
  /** Margem em dias de cada nível, na ordem de `niveis`. */
  margens: number[]
  /** Se o nível entra na métrica de antecedência, na ordem de `niveis`. */
  graves: boolean[]
  margemUnicaDias: number
  alertaDias: number
  passoNivelamentoDias: number
  horizonteMeses: number | null
  capacidadeMensalHoras: number | null
}

export interface EntradaValida {
  /** Em ordem de `id`: o resultado não depende da ordem da carteira. */
  atividades: AtividadeValida[]
  parametros: ParametrosValidos
  hoje: number
  estrategia: Estrategia
}

type Registro = Record<string, unknown>

function ehRegistro(valor: unknown): valor is Registro {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function ehInteiroNaoNegativo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 0
}

function ausente(valor: unknown): valor is null | undefined {
  return valor === null || valor === undefined
}

const ANTECIPABILIDADES: readonly string[] = ['fixa', 'antecipavel', 'parcial']

interface Niveis {
  posicaoPorId: Map<string, number>
}

function validarParametros(
  bruto: unknown,
  erros: ErroDeValidacao[],
): { parametros: ParametrosValidos; niveis: Niveis } | null {
  const errosAntes = erros.length
  const falha = (campo: string, detalhe: string) => {
    erros.push({ codigo: 'parametro_invalido', campo, detalhe })
  }
  if (!ehRegistro(bruto)) {
    falha('parametros', 'deve ser um objeto')
    return null
  }

  if (typeof bruto.versao !== 'string' || bruto.versao.trim() === '') {
    falha('versao', 'texto obrigatório')
  }

  const posicaoPorId = new Map<string, number>()
  const margens: number[] = []
  if (!Array.isArray(bruto.niveis) || bruto.niveis.length === 0) {
    falha('niveis', 'lista com ao menos um nível')
  } else {
    bruto.niveis.forEach((nivel: unknown, i) => {
      const campo = `niveis[${String(i)}]`
      if (!ehRegistro(nivel) || typeof nivel.id !== 'string' || nivel.id === '') {
        falha(campo, 'nível precisa de id')
        return
      }
      if (posicaoPorId.has(nivel.id)) falha(campo, `id repetido: ${nivel.id}`)
      if (!ehInteiroNaoNegativo(nivel.margemDias)) {
        falha(`${campo}.margemDias`, 'inteiro maior ou igual a zero')
        return
      }
      posicaoPorId.set(nivel.id, margens.length)
      margens.push(nivel.margemDias)
    })
  }

  const graves = margens.map(() => false)
  if (!Array.isArray(bruto.niveisGraves)) {
    falha('niveisGraves', 'lista de ids de nível')
  } else {
    for (const id of bruto.niveisGraves as unknown[]) {
      const posicao = typeof id === 'string' ? posicaoPorId.get(id) : undefined
      if (posicao === undefined) falha('niveisGraves', `nível desconhecido: ${String(id)}`)
      else graves[posicao] = true
    }
  }

  const { margemUnicaDias, alertaDias, passoNivelamentoDias, horizonteMeses } = bruto
  const capacidade = bruto.capacidadeMensalHoras
  if (
    !ausente(capacidade) &&
    (typeof capacidade !== 'number' || !Number.isFinite(capacidade) || capacidade <= 0)
  ) {
    falha('capacidadeMensalHoras', 'número maior que zero, ou ausente')
  }
  if (!ehInteiroNaoNegativo(margemUnicaDias)) {
    falha('margemUnicaDias', 'inteiro maior ou igual a zero')
  }
  if (!ehInteiroNaoNegativo(alertaDias)) falha('alertaDias', 'inteiro maior ou igual a zero')
  if (!ehInteiroNaoNegativo(passoNivelamentoDias) || passoNivelamentoDias < 1) {
    falha('passoNivelamentoDias', 'inteiro maior ou igual a 1')
  }
  if (!ausente(horizonteMeses) && (!ehInteiroNaoNegativo(horizonteMeses) || horizonteMeses < 1)) {
    falha('horizonteMeses', 'inteiro maior ou igual a 1, ou ausente')
  }

  if (erros.length > errosAntes) return null
  return {
    niveis: { posicaoPorId },
    parametros: {
      versao: bruto.versao as string,
      margens,
      graves,
      margemUnicaDias: margemUnicaDias as number,
      alertaDias: alertaDias as number,
      passoNivelamentoDias: passoNivelamentoDias as number,
      horizonteMeses: ausente(horizonteMeses) ? null : (horizonteMeses as number),
      capacidadeMensalHoras: ausente(capacidade) ? null : (capacidade as number),
    },
  }
}

function validarAtividade(
  bruta: unknown,
  posicao: number,
  niveis: Niveis | null,
  erros: ErroDeValidacao[],
): AtividadeValida | null {
  if (!ehRegistro(bruta) || typeof bruta.id !== 'string' || bruta.id === '') {
    erros.push({
      codigo: 'valor_invalido',
      campo: `atividades[${String(posicao)}].id`,
      detalhe: 'texto obrigatório',
    })
    return null
  }
  const id = bruta.id
  const errosAntes = erros.length
  const erro = (codigo: CodigoDeErro, campo: string, detalhe?: string) => {
    erros.push({ codigo, atividadeId: id, campo, ...(detalhe === undefined ? {} : { detalhe }) })
  }

  const data = (campo: string): number | null => {
    const valor = bruta[campo]
    if (ausente(valor)) return null
    const dia = paraDia(valor)
    if (dia === null) erro('data_invalida', campo, 'use AAAA-MM-DD')
    return dia
  }
  const prazo = data('prazo')
  const inicioMaisCedo = data('inicioMaisCedo')
  const inicioFixo = data('inicioFixo')

  const { duracaoDias, esperaDias, esforcoHoras, gravidade, antecipabilidade } = bruta
  if (!ehInteiroNaoNegativo(duracaoDias)) {
    erro('valor_invalido', 'duracaoDias', 'inteiro maior ou igual a zero')
  }
  if (!ehInteiroNaoNegativo(esperaDias)) {
    erro('valor_invalido', 'esperaDias', 'inteiro maior ou igual a zero')
  }
  if (typeof esforcoHoras !== 'number' || !Number.isFinite(esforcoHoras) || esforcoHoras < 0) {
    erro('valor_invalido', 'esforcoHoras', 'número maior ou igual a zero')
  }

  let posicaoDaGravidade = 0
  if (typeof gravidade !== 'string') {
    erro('gravidade_desconhecida', 'gravidade', 'id de nível obrigatório')
  } else if (niveis) {
    const encontrada = niveis.posicaoPorId.get(gravidade)
    if (encontrada === undefined) erro('gravidade_desconhecida', 'gravidade', gravidade)
    else posicaoDaGravidade = encontrada
  }

  if (typeof antecipabilidade !== 'string' || !ANTECIPABILIDADES.includes(antecipabilidade)) {
    erro('valor_invalido', 'antecipabilidade', 'fixa, antecipavel ou parcial')
  }
  if (inicioFixo !== null && antecipabilidade !== 'fixa') {
    erro('valor_invalido', 'inicioFixo', 'só em atividade fixa')
  }

  const fracao = bruta.fracaoAntecipavel
  let fracaoAntecipavel = 0
  if (antecipabilidade === 'parcial') {
    if (typeof fracao !== 'number' || !(fracao > 0 && fracao < 1)) {
      erro('fracao_invalida', 'fracaoAntecipavel', 'número entre 0 e 1, exclusivos')
    } else {
      fracaoAntecipavel = fracao
    }
  } else if (!ausente(fracao)) {
    erro('fracao_invalida', 'fracaoAntecipavel', 'só em atividade parcial')
  }

  const dependeDe: DependenciaValida[] = []
  const brutas = bruta.dependeDe
  if (!ausente(brutas)) {
    if (!Array.isArray(brutas)) {
      erro('valor_invalido', 'dependeDe', 'lista de { id, defasagemDias }')
    } else {
      brutas.forEach((dependencia: unknown, i) => {
        const campo = `dependeDe[${String(i)}]`
        if (!ehRegistro(dependencia) || typeof dependencia.id !== 'string') {
          erro('valor_invalido', campo, 'precisa de id')
          return
        }
        const defasagem = dependencia.defasagemDias ?? 0
        if (!ehInteiroNaoNegativo(defasagem)) {
          erro('valor_invalido', `${campo}.defasagemDias`, 'inteiro maior ou igual a zero')
          return
        }
        dependeDe.push({ id: dependencia.id, defasagemDias: defasagem })
      })
    }
  }

  if (erros.length > errosAntes) return null
  return {
    id,
    prazo,
    duracaoDias: duracaoDias as number,
    esperaDias: esperaDias as number,
    esforcoHoras: esforcoHoras as number,
    gravidade: posicaoDaGravidade,
    antecipabilidade: antecipabilidade as Antecipabilidade,
    inicioMaisCedo,
    inicioFixo,
    fracaoAntecipavel,
    dependeDe,
    posicao,
  }
}

/** Atividades que sobram depois de retirar, em ordem, as que não dependem de nenhuma pendente. */
function presasEmCiclo(atividades: readonly AtividadeValida[]): string[] {
  const pendentes = new Map(atividades.map((a) => [a.id, new Set(a.dependeDe.map((d) => d.id))]))
  let retirou = true
  while (retirou) {
    retirou = false
    for (const [id, antecessoras] of pendentes) {
      if ([...antecessoras].some((anterior) => pendentes.has(anterior))) continue
      pendentes.delete(id)
      retirou = true
    }
  }
  // O que sobrou depende de um ciclo; fica só quem também tem sucessora presa (o ciclo em si).
  const comSucessoraPresa = new Set<string>()
  for (const antecessoras of pendentes.values()) {
    for (const anterior of antecessoras)
      if (pendentes.has(anterior)) comSucessoraPresa.add(anterior)
  }
  return [...pendentes.keys()].filter((id) => comSucessoraPresa.has(id)).sort()
}

export function validar(
  carteira: unknown,
  parametros: unknown,
  hoje: unknown,
  estrategia: unknown,
): { ok: true; entrada: EntradaValida } | { ok: false; erros: ErroDeValidacao[] } {
  const erros: ErroDeValidacao[] = []

  const conferidos = validarParametros(parametros, erros)

  const hojeDia = paraDia(hoje)
  if (hojeDia === null) {
    erros.push({ codigo: 'data_invalida', campo: 'hoje', detalhe: 'use AAAA-MM-DD' })
  }
  const estrategiaValida = ESTRATEGIAS.find((e) => e === estrategia)
  if (estrategiaValida === undefined) {
    erros.push({
      codigo: 'parametro_invalido',
      campo: 'estrategia',
      detalhe: ESTRATEGIAS.join(', '),
    })
  }

  const atividades: AtividadeValida[] = []
  if (!ehRegistro(carteira) || !Array.isArray(carteira.atividades)) {
    erros.push({ codigo: 'valor_invalido', campo: 'atividades', detalhe: 'lista obrigatória' })
  } else {
    const vistos = new Set<string>()
    carteira.atividades.forEach((bruta: unknown, posicao) => {
      const atividade = validarAtividade(bruta, posicao, conferidos?.niveis ?? null, erros)
      const id = ehRegistro(bruta) && typeof bruta.id === 'string' ? bruta.id : null
      if (id !== null && id !== '') {
        if (vistos.has(id)) {
          erros.push({ codigo: 'id_duplicado', atividadeId: id })
          return
        }
        vistos.add(id)
      }
      if (atividade) atividades.push(atividade)
    })

    // Regras entre atividades: só fazem sentido com todos os ids conhecidos.
    const comSucessora = new Set<string>()
    for (const atividade of atividades) {
      for (const dependencia of atividade.dependeDe) {
        if (!vistos.has(dependencia.id)) {
          erros.push({
            codigo: 'dependencia_inexistente',
            atividadeId: atividade.id,
            campo: 'dependeDe',
            detalhe: dependencia.id,
          })
        } else {
          comSucessora.add(dependencia.id)
        }
      }
    }
    for (const atividade of atividades) {
      if (atividade.prazo === null && !comSucessora.has(atividade.id)) {
        erros.push({ codigo: 'prazo_ausente', atividadeId: atividade.id, campo: 'prazo' })
      }
    }
    const presas = presasEmCiclo(atividades)
    if (presas.length > 0) {
      erros.push({ codigo: 'dependencia_ciclica', detalhe: presas.join(', ') })
    }
  }

  if (erros.length > 0 || !conferidos || hojeDia === null || estrategiaValida === undefined) {
    return { ok: false, erros }
  }
  atividades.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return {
    ok: true,
    entrada: {
      atividades,
      parametros: conferidos.parametros,
      hoje: hojeDia,
      estrategia: estrategiaValida,
    },
  }
}
