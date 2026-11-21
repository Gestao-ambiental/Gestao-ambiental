// Gera a carga inicial do catálogo de normas (pacote L0): as Instruções Normativas do IMA, a
// portaria que revogou a IN 84, as normas estaduais de base e os critérios de atividade que o
// Simulador de Licenciamento do IMA liga a cada IN.
//
// Uso (na raiz do repositório):
//   curl -sL https://in.ima.sc.gov.br/ -o instrucoes.html
//   node scripts/normas/gerar-carga-inicial.mjs instrucoes.html \
//     [supabase/migrations/20261120230100_carga_inicial_de_normas.sql]
//
// Entradas: o HTML da página de Instruções Normativas (não fica no repositório) e
// DADOS_DO_SIMULADOR_IMA de packages/domain/src/dados-simulador-ima.ts (gerado por
// scripts/ima-simulador/extrair-dados.mjs).

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SAIDA_PADRAO = join(
  raiz,
  'supabase',
  'migrations',
  '20261120230100_carga_inicial_de_normas.sql',
)
const ARQUIVO_DADOS = join(raiz, 'packages', 'domain', 'src', 'dados-simulador-ima.ts')

const [, , arquivoInstrucoes, saida = SAIDA_PADRAO] = process.argv
if (!arquivoInstrucoes) {
  console.error('uso: node scripts/normas/gerar-carga-inicial.mjs <instrucoes.html> [saida.sql]')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 1. INs da página in.ima.sc.gov.br
// ---------------------------------------------------------------------------
// Cada IN é um card: <h3 class="card-title">IN 02 - TÍTULO</h3>, "Atualizada em: dd/mm/aaaa" e os
// links downloadPDF/<idVersao> e visualizar/<idVersao>. O trecho de cada card vai até o próximo
// título de IN, para um card sem link não pegar o id do card seguinte.
function lerInstrucoes(html) {
  const reTitulo = /<h3 class="card-title[^>]*>\s*IN\s*(\d+)\s*-\s*([^<]+?)\s*<\/h3>/g
  const titulos = [...html.matchAll(reTitulo)]
  const instrucoes = new Map()
  const problemas = []
  titulos.forEach((m, i) => {
    const fim = i + 1 < titulos.length ? titulos[i + 1].index : html.length
    const card = html.slice(m.index, fim)
    const numero = Number(m[1])
    const tituloBruto = m[2].replace(/\s+/g, ' ').trim()
    const revogada = /\(\s*REVOGADA\s*\)/i.test(tituloBruto)
    const titulo = tituloBruto.replace(/\s*\(\s*REVOGADA\s*\)\s*/gi, ' ').trim()
    const id = card.match(/(?:downloadPDF|visualizar)\/(\d+)/)?.[1]
    const atualizadaEm = card.match(/Atualizada em:\s*([0-9/]+)/)?.[1] ?? null
    if (!id) {
      problemas.push(`IN ${numero}: sem link da versão`)
      return
    }
    if (instrucoes.has(numero)) {
      problemas.push(`IN ${numero}: repetida na página`)
      return
    }
    instrucoes.set(numero, { numero, titulo, revogada, idVersao: Number(id), atualizadaEm })
  })
  if (problemas.length > 0) {
    console.error(problemas.join('\n'))
    process.exit(1)
  }
  return [...instrucoes.values()].sort((a, b) => a.numero - b.numero)
}

// O site publica quase tudo em maiúsculas. Converte para caixa de frase, mantendo siglas e
// algarismos romanos (classe I, IIA, IIB); título que já vem em caixa mista fica como está.
const SIGLAS = new Set([
  'IMA',
  'LAO',
  'LAP',
  'LAI',
  'AUA',
  'APP',
  'ETE',
  'EIA',
  'RAP',
  'RIMA',
  'TAC',
  'RPPN',
  'CONSEMA',
  'SC',
  'GLP',
  'I',
  'II',
  'III',
  'IIA',
  'IIB',
])
const NOMES_PROPRIOS = [['parque estadual acaraí', 'Parque Estadual Acaraí']]

function caixaDeFrase(titulo) {
  const letras = titulo.replace(/[^\p{L}]/gu, '')
  const maiusculas = letras.replace(/[^\p{Lu}]/gu, '')
  if (letras.length === 0 || maiusculas.length / letras.length < 0.8) return titulo
  let frase = titulo.replace(/[\p{L}\p{N}]+/gu, (palavra) => {
    if (SIGLAS.has(palavra.toUpperCase()) && palavra === palavra.toUpperCase()) return palavra
    // Palavra em caixa mista (ex.: EANs) já vem escrita como deve.
    if (palavra !== palavra.toUpperCase()) return palavra
    return palavra.toLowerCase()
  })
  for (const [de, para] of NOMES_PROPRIOS) frase = frase.replaceAll(de, para)
  return frase.charAt(0).toUpperCase() + frase.slice(1)
}

// ---------------------------------------------------------------------------
// 2. Atividades do simulador (código CONSEMA → IN)
// ---------------------------------------------------------------------------
async function lerAtividades() {
  try {
    const modulo = await import(pathToFileURL(ARQUIVO_DADOS).href)
    return Object.entries(modulo.DADOS_DO_SIMULADOR_IMA).map(([codigo, d]) => ({
      codigo,
      instrucaoNormativa: d.instrucaoNormativa,
    }))
  } catch {
    // Node sem type stripping: lê o objeto como texto.
    const texto = readFileSync(ARQUIVO_DADOS, 'utf8')
    const inicio = texto.indexOf('DADOS_DO_SIMULADOR_IMA')
    const fim = texto.indexOf('INSTRUCOES_NORMATIVAS_IMA', inicio)
    const trecho = texto.slice(inicio, fim < 0 ? texto.length : fim)
    const re = /'([^']+)':\s*\{[^}]*?instrucaoNormativa:\s*(\d+)/g
    return [...trecho.matchAll(re)].map((m) => ({
      codigo: m[1],
      instrucaoNormativa: Number(m[2]),
    }))
  }
}

// ---------------------------------------------------------------------------
// 3. SQL
// ---------------------------------------------------------------------------
const texto = (valor) => (valor === null ? 'null' : `'${String(valor).replaceAll("'", "''")}'`)
const chaveDaIn = (numero) => `sc;ima;instrucao_normativa;${numero}`
const FORMATO_ATIVIDADE = /^[0-9]{2}\.[0-9]{2}\.[0-9]{2}$/

// Correção conhecida: o site não marca a IN 84 como revogada.
const REVOGACAO_IN_84 = {
  numero: 84,
  revogadaEm: '2026-04-14',
  chavePortaria: 'sc;ima;portaria;96;2026',
}

const NORMAS_DE_BASE = [
  {
    chave: 'sc;consema;resolucao;250;2024',
    orgao: 'CONSEMA',
    tipo: 'resolucao',
    numero: '250',
    ano: 2024,
    titulo: 'Resolução CONSEMA 250/2024',
    url: 'https://www.semae.sc.gov.br/?wpdmdl=3480',
    fonte: 'consema',
    idExterno: '3480',
    temas: [],
    competencias: ['estadual'],
  },
  {
    chave: 'sc;consema;resolucao;251;2024',
    orgao: 'CONSEMA',
    tipo: 'resolucao',
    numero: '251',
    ano: 2024,
    titulo: 'Resolução CONSEMA 251/2024',
    url: 'https://www.semae.sc.gov.br/?wpdmdl=3481',
    fonte: 'consema',
    idExterno: '3481',
    temas: [],
    competencias: ['municipal'],
  },
  {
    chave: 'sc;alesc;lei;14675;2009',
    orgao: 'ALESC',
    tipo: 'lei',
    numero: '14.675',
    ano: 2009,
    titulo: 'Lei 14.675/2009 · Código Estadual do Meio Ambiente',
    url: 'https://leis.alesc.sc.gov.br/ato-normativo/16618',
    fonte: null,
    idExterno: null,
    temas: [],
    competencias: ['estadual', 'municipal'],
  },
  {
    chave: 'sc;alesc;lei;14262;2007',
    orgao: 'ALESC',
    tipo: 'lei',
    numero: '14.262',
    ano: 2007,
    titulo: 'Lei 14.262/2007 · Taxas ambientais',
    url: null,
    fonte: null,
    idExterno: null,
    temas: ['taxas'],
    competencias: [],
  },
  {
    chave: 'sc;executivo;decreto;421;2023',
    orgao: 'Governo de SC',
    tipo: 'decreto',
    numero: '421',
    ano: 2023,
    titulo: 'Decreto 421/2023 · Valores das taxas ambientais',
    url: null,
    fonte: null,
    idExterno: null,
    temas: ['taxas'],
    competencias: [],
  },
]

const temasSql = (temas) => `'{${temas.join(',')}}'`

function gerarSql(instrucoes, atividades) {
  const numeros = new Set(instrucoes.map((i) => i.numero))
  if (!numeros.has(REVOGACAO_IN_84.numero)) throw new Error('IN 84 não está na página')

  const ignoradas = []
  const foraDoFormato = []
  const ligacoes = []
  for (const a of [...atividades].sort((x, y) => x.codigo.localeCompare(y.codigo))) {
    if (!FORMATO_ATIVIDADE.test(a.codigo)) foraDoFormato.push(a.codigo)
    else if (!numeros.has(a.instrucaoNormativa)) ignoradas.push(a)
    else ligacoes.push(a)
  }
  if (foraDoFormato.length > 0) {
    throw new Error(`códigos fora do formato 00.00.00: ${foraDoFormato.join(', ')}`)
  }

  const revogadas = instrucoes.filter(
    (i) => i.revogada || i.numero === REVOGACAO_IN_84.numero,
  ).length
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  const linhas = []
  linhas.push(
    `-- Carga inicial do catálogo de normas (pacote L0). Gerado por scripts/normas/gerar-carga-inicial.mjs`,
    `-- em ${hoje}. Não edite à mão: baixe a página e rode o script de novo.`,
    `--   curl -sL https://in.ima.sc.gov.br/ -o instrucoes.html`,
    `--   node scripts/normas/gerar-carga-inicial.mjs instrucoes.html`,
    `--`,
    `-- ${instrucoes.length} Instruções Normativas do IMA (${revogadas} revogadas), a Portaria IMA 096/2026,`,
    `-- ${NORMAS_DE_BASE.length} normas estaduais de base e ${ligacoes.length} critérios de atividade do Simulador do IMA.`,
    `-- Tudo com on conflict do nothing: reaplicar não duplica nem falha.`,
    '',
    '-- ---------------------------------------------------------------------------',
    '-- 1. Portaria IMA 096/2026 (revoga a IN 84)',
    '-- ---------------------------------------------------------------------------',
    '-- Correção conhecida: a IN 84 foi revogada pela Portaria IMA 096/2026, publicada no DOE 22734',
    '-- de 14/04/2026, mas a página in.ima.sc.gov.br não marca a IN 84 como revogada.',
    'insert into private.norma (chave, esfera, orgao, tipo, numero, ano, titulo, fonte, id_externo)',
    `values (${texto(REVOGACAO_IN_84.chavePortaria)}, 'estadual', 'IMA', 'portaria', '96', 2026,`,
    `        'Portaria IMA 096/2026', 'ima_portaria', null)`,
    'on conflict do nothing;',
    '',
    '-- ---------------------------------------------------------------------------',
    '-- 2. Instruções Normativas do IMA (in.ima.sc.gov.br)',
    '-- ---------------------------------------------------------------------------',
    'insert into private.norma (chave, esfera, orgao, tipo, numero, ano, titulo, url_oficial, fonte,',
    '                           id_externo, situacao_na_fonte, revogada_em, revogada_por, temas, ementa)',
    'values',
  )
  const valores = instrucoes.map((i) => {
    const ehIn84 = i.numero === REVOGACAO_IN_84.numero
    const situacao = i.revogada || ehIn84 ? 'revogada' : 'vigente'
    const revogadaEm = ehIn84 ? `'${REVOGACAO_IN_84.revogadaEm}'::date` : 'null'
    const revogadaPor = ehIn84
      ? `(select p.id from private.norma as p where p.chave = ${texto(REVOGACAO_IN_84.chavePortaria)})`
      : 'null::uuid'
    const titulo = `IN ${i.numero} · ${caixaDeFrase(i.titulo)}`
    const url = `https://in.ima.sc.gov.br/instrucaoNormativa/visualizar/${i.idVersao}`
    return (
      `  (${texto(chaveDaIn(i.numero))}, 'estadual', 'IMA', 'instrucao_normativa', '${i.numero}', null,\n` +
      `   ${texto(titulo)},\n` +
      `   ${texto(url)}, 'ima_in', '${i.numero}', '${situacao}', ${revogadaEm}, ${revogadaPor}, '{}', null)`
    )
  })
  linhas.push(valores.join(',\n'), 'on conflict do nothing;', '')

  linhas.push(
    '-- ---------------------------------------------------------------------------',
    '-- 3. Normas estaduais de base',
    '-- ---------------------------------------------------------------------------',
    'insert into private.norma (chave, esfera, orgao, tipo, numero, ano, titulo, url_oficial, fonte,',
    '                           id_externo, temas)',
    'values',
    NORMAS_DE_BASE.map(
      (n) =>
        `  (${texto(n.chave)}, 'estadual', ${texto(n.orgao)}, '${n.tipo}', ${texto(n.numero)}, ${n.ano},\n` +
        `   ${texto(n.titulo)}, ${texto(n.url)}, ${texto(n.fonte)}, ${texto(n.idExterno)}, ${temasSql(n.temas)})`,
    ).join(',\n'),
    'on conflict do nothing;',
    '',
    '-- Competência (estadual ou municipal) a que cada norma de base se aplica.',
    'insert into private.norma_criterio (norma_id, tipo, valor, origem)',
    "select n.id, 'competencia', v.valor, 'curadoria'",
    'from (values',
    NORMAS_DE_BASE.flatMap((n) => n.competencias.map((c) => `  (${texto(n.chave)}, '${c}')`)).join(
      ',\n',
    ),
    ') as v (chave, valor)',
    'join private.norma as n on n.chave = v.chave',
    'on conflict do nothing;',
    '',
    '-- ---------------------------------------------------------------------------',
    '-- 4. Atividades CONSEMA ligadas à IN pelo Simulador de Licenciamento do IMA',
    '-- ---------------------------------------------------------------------------',
  )
  if (ignoradas.length > 0) {
    linhas.push(
      '-- Ignoradas (a IN do simulador não está na página in.ima.sc.gov.br):',
      ...ignoradas.map((a) => `--   ${a.codigo} → IN ${a.instrucaoNormativa}`),
    )
  } else {
    linhas.push('-- Nenhuma atividade ignorada: todas as INs do simulador estão na página.')
  }
  linhas.push(
    'insert into private.norma_criterio (norma_id, tipo, valor, origem)',
    "select n.id, 'atividade', v.codigo, 'simulador_ima'",
    'from (values',
    ligacoes.map((a) => `  ('${a.codigo}', ${texto(chaveDaIn(a.instrucaoNormativa))})`).join(',\n'),
    ') as v (codigo, chave)',
    'join private.norma as n on n.chave = v.chave',
    'on conflict do nothing;',
    '',
  )
  return {
    sql: linhas.join('\n'),
    ligacoes: ligacoes.length,
    ignoradas: ignoradas.length,
    revogadas,
  }
}

const instrucoes = lerInstrucoes(readFileSync(arquivoInstrucoes, 'utf8'))
const atividades = await lerAtividades()
const { sql, ligacoes, ignoradas, revogadas } = gerarSql(instrucoes, atividades)
writeFileSync(saida, sql)
console.log(
  `${instrucoes.length} INs (${revogadas} revogadas), ${ligacoes} atividades ligadas, ` +
    `${ignoradas} ignoradas → ${relative(process.cwd(), saida)}`,
)
