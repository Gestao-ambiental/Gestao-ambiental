// Extrai do Simulador de Licenciamento do IMA (https://consultas.ima.sc.gov.br/simulador) os dados
// por atividade que a página já traz embutidos (sem passar pelo reCAPTCHA do cálculo), e da página
// de Instruções Normativas (https://in.ima.sc.gov.br/) o título e o link de cada IN.
//
// Uso:
//   curl -sL https://consultas.ima.sc.gov.br/simulador -o simulador.html
//   curl -sL https://in.ima.sc.gov.br/ -o instrucoes.html
//   node scripts/ima-simulador/extrair-dados.mjs simulador.html instrucoes.html \
//     packages/domain/src/dados-simulador-ima.ts
//
// Do simulador saem, por código CONSEMA: a tabela da taxa (tabelaCalculo: 2 = Tabela 02, 3 = Tabela
// 03, 0 = fórmula dos itens 13 e 14 do anexo da Lei 14.262/2007), a IN do IMA e se a atividade
// paga TFASC. Porte, estudo e modalidade o simulador calcula no servidor; aqui eles vêm da
// resolução (packages/domain/src/triagem-licenciamento.ts).

import { readFileSync, writeFileSync } from 'node:fs'

const [, , arquivoSimulador, arquivoInstrucoes, saida] = process.argv
if (!arquivoSimulador || !arquivoInstrucoes || !saida) {
  console.error('uso: node extrair-dados.mjs <simulador.html> <instrucoes.html> <saida.ts>')
  process.exit(1)
}

const simulador = readFileSync(arquivoSimulador, 'utf8')
const marca = 'const atividades = '
const inicio = simulador.indexOf(marca)
if (inicio < 0) throw new Error('lista de atividades não encontrada no simulador')
const fim = simulador.indexOf('];', inicio) + 1
const atividades = JSON.parse(simulador.slice(inicio + marca.length, fim))

const instrucoesHtml = readFileSync(arquivoInstrucoes, 'utf8')
const reIn =
  /<h3 class="card-title[^>]*>\s*IN\s*(\d+)\s*-\s*([^<]+?)\s*<\/h3>[\s\S]*?Atualizada em:\s*([0-9/]+)[\s\S]*?downloadPDF\/(\d+)/g
const instrucoes = new Map()
for (const m of instrucoesHtml.matchAll(reIn)) {
  const numero = Number(m[1])
  if (!instrucoes.has(numero)) {
    instrucoes.set(numero, {
      numero,
      titulo: m[2].replace(/\s+/g, ' ').trim(),
      atualizadaEm: m[3],
      id: Number(m[4]),
    })
  }
}

const problemas = []
const porCodigo = {}
for (const a of atividades) {
  const tabela = a.tabelaCalculo
  if (![0, 2, 3].includes(tabela)) problemas.push(`${a.codigoConsema}: tabela ${tabela}`)
  if (!instrucoes.has(a.numeroIn)) problemas.push(`${a.codigoConsema}: IN ${a.numeroIn} sem título`)
  porCodigo[a.codigoConsema] = {
    tabela,
    instrucaoNormativa: a.numeroIn,
    tfasc: a.tfasc === true,
    tipologia: a.tipologiaSigla.trim(),
    potencialNoSimulador: a.potencialGeral,
  }
}
if (problemas.length > 0) {
  console.error(problemas.join('\n'))
  process.exit(1)
}

const usadas = [...new Set([0, ...atividades.map((a) => a.numeroIn)])].sort((x, y) => x - y)
const ins = {}
for (const n of usadas) ins[n] = instrucoes.get(n)

const hoje = new Date().toISOString().slice(0, 10)
const ts = `// Gerado por scripts/ima-simulador/extrair-dados.mjs em ${hoje}. Não edite à mão.
// Fonte: Simulador de Licenciamento do IMA (consultas.ima.sc.gov.br/simulador) e página de
// Instruções Normativas (in.ima.sc.gov.br).

export interface DadosDoSimuladorIma {
  /** Tabela da taxa de análise: 2 = Tabela 02, 3 = Tabela 03, 0 = fórmula (itens 13 e 14). */
  tabela: 0 | 2 | 3
  instrucaoNormativa: number
  /** A atividade paga a Taxa de Fiscalização Ambiental de Santa Catarina (TFASC). */
  tfasc: boolean
  tipologia: string
  /** Potencial poluidor geral que o simulador usa (pode seguir resolução anterior à 250). */
  potencialNoSimulador: 'P' | 'M' | 'G'
}

export interface InstrucaoNormativaIma {
  numero: number
  titulo: string
  atualizadaEm: string
  id: number
}

export const DADOS_DO_SIMULADOR_IMA: Readonly<Record<string, DadosDoSimuladorIma>> = ${JSON.stringify(porCodigo, null, 2)}

export const INSTRUCOES_NORMATIVAS_IMA: Readonly<Record<number, InstrucaoNormativaIma>> = ${JSON.stringify(ins, null, 2)}
`
writeFileSync(saida, ts)
console.log(`${atividades.length} atividades, ${usadas.length} INs → ${saida}`)
