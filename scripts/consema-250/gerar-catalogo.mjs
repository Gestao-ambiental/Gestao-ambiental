// Parser do Anexo VI (e VII) da Resolução CONSEMA 250/2024 consolidada.
// Uso: node parse250.mjs <r250c.txt> <saida.json>
import { readFileSync, writeFileSync } from 'node:fs'

const [, , entrada, saida] = process.argv
const bruto = readFileSync(entrada, 'utf8').split(/\r?\n/)

const ini = bruto.findIndex((l) => /^ANEXO VI\s*$/.test(l.trim()))
const fimVI = bruto.findIndex((l, i) => i > ini && /^ANEXO VII\s*$/.test(l.trim()))
const fimVII = bruto.findIndex((l, i) => i > fimVI && /^ANEXO VIII\s*$/.test(l.trim()))

const ruido = (l) =>
  /^\s*$/.test(l) ||
  /Atualizada até a Resolução CONSEMA|publicada no DOE\/SC|Rodovia Virgílio Várzea|Bairro Saco Grande|consema@semae|GOVERNO DO ESTADO|SECRETARIA DE ESTADO|CONSELHO ESTADUAL|SECRETARIA EXECUTIVA/.test(
    l,
  ) ||
  /^\s*\d{1,3}\s*$/.test(l)

const linhas = bruto
  .slice(ini + 1, fimVI)
  .filter((l) => !ruido(l))
  .map((l) => l.trim())

// ---------- Anexo VII: parâmetros ----------
const vii = bruto
  .slice(fimVI + 1, fimVII)
  .filter((l) => !ruido(l))
  .map((l) => l.trim())
  .join(' ')
const parametros = {}
for (const m of vii.matchAll(
  /(?:^|\s)([A-Za-záÁ]{1,5}(?:\(\d\))?)\s*(?:para [a-z]+)?\s*=\s*(.+?)(?=\s[A-Za-záÁ]{1,5}(?:\(\d\))?\s*(?:para [a-z]+:?)?\s*=|$)/g,
)) {
  const sigla = m[1].replace(/\s/g, '')
  if (!parametros[sigla]) parametros[sigla] = m[2].trim()
}

// Linhas do Anexo VII que o PDF junta ou repete.
parametros.CN = 'capacidade nominal do equipamento (t/h)'
parametros.CP = 'capacidade instalada por ciclo de produção'
parametros.Pax = 'número de passageiros por ano (embarcados e desembarcados)'
parametros.PM = 'produção mensal de ROM (m³/mês)'
parametros.NH = 'número de unidades habitacionais'
parametros.NL =
  'número de leitos (hotelaria: capacidade total de hóspedes; hospital: capacidade de pacientes)'
for (const k of Object.keys(parametros))
  parametros[k] = parametros[k]
    .replace(/\s*\d{2,3}$/, '')
    .replace(/m3/g, 'm³')
    .trim()

// ---------- Anexo VI: itens ----------
// Cabeçalho do item: "17.22.00 - Descrição", "17.40.00 Descrição", "34.41.11: Descrição" ou o
// código sozinho na linha (a descrição vem na seguinte).
const reCodigo = /^(\d{2}\.\d{2}\.\d{2})(?:\s*[-–:]\s*|\s+(?=[A-ZÁÉÍÓÚ])|\s*$)(.*)$/
const reGrupo = /^(\d{2})\s*[-–]\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ ,/E-]+)$/
const itens = []
let grupo = null
let atual = null
for (const l of linhas) {
  const g = l.match(reGrupo)
  if (g && !reCodigo.test(l)) {
    grupo = { codigo: g[1], nome: g[2].trim() }
    atual = null
    continue
  }
  const c = l.match(reCodigo)
  if (c) {
    atual = { codigo: c[1], grupo, texto: [c[2]] }
    itens.push(atual)
    continue
  }
  if (atual) atual.texto.push(l)
}

const num = (s) => Number(s.replace(/\./g, '').replace(',', '.'))
const NUM = '(\\d[\\d.]*(?:,\\d+)?)'
const SIG = '([A-Za-zá]{1,5}\\s?(?:\\(\\d\\))?)'

/** Interpreta uma condição de uma variável: "a < X ≤ b", "X ≥ a", "X < a". */
function condicao(t) {
  t = t.replace(/\s+/g, ' ').trim()
  let m
  const op = (s) => s.replace('<=', '≤').replace('>=', '≥')
  if ((m = t.match(new RegExp(`^${NUM}\\s*(<|≤|<=)\\s*${SIG}\\s*(<|≤|<=)\\s*${NUM}$`)))) {
    return {
      parametro: m[3].replace(/\s/g, ''),
      min: num(m[1]),
      minIncl: op(m[2]) === '≤',
      max: num(m[5]),
      maxIncl: op(m[4]) === '≤',
    }
  }
  if ((m = t.match(new RegExp(`^${SIG}\\s*(<|≤|<=|>|≥|>=)\\s*${NUM}$`)))) {
    const o = op(m[2])
    const p = m[1].replace(/\s/g, '')
    if (o === '<' || o === '≤')
      return { parametro: p, min: null, minIncl: false, max: num(m[3]), maxIncl: o === '≤' }
    return { parametro: p, min: num(m[3]), minIncl: o === '≥', max: null, maxIncl: false }
  }
  if ((m = t.match(new RegExp(`^${NUM}\\s*(<|≤)\\s*${SIG}$`)))) {
    return {
      parametro: m[3].replace(/\s/g, ''),
      min: num(m[1]),
      minIncl: m[2] === '≤',
      max: null,
      maxIncl: false,
    }
  }
  return null
}

function normalizar(t) {
  return (
    t
      .normalize('NFC')
      .replace(/\s+/g, ' ')
      .replace(/Cmáx\s+([CM])/g, 'Cmáx$1')
      .replace(/\b(AE|AU|L|Q)\s+\((\d)\)/g, '$1($2)')
      .replace(/\bA\s*\((\d)\)/g, 'AU($1)')
      // Erro de digitação no original (03.34.00 e 03.34.02): "40.000.00 < CP" é 40.000.000.
      .replace(/\b40\.000\.00 </g, '40.000.000 <')
      .replace(/Porte Média:/g, 'Porte Médio:')
      .replace(/<\s*=/g, '≤')
      .replace(/>\s*=/g, '≥')
      .replace(/:\s*(pequeno|médio|grande)\s*(?=\()/gi, ' ')
      .trim()
  )
}

const PORTES = { Mínimo: 'minimo', Pequeno: 'pequeno', Médio: 'medio', Grande: 'grande' }

const saidaItens = []
const problemas = []
for (const it of itens) {
  const tudo = normalizar(it.texto.join(' '))
  const iPot = tudo.search(/(?:Pot\.?\s*|Potencial\s*)?Poluidor\s*\/?\s*Degradador/i)
  const descricao = (iPot >= 0 ? tudo.slice(0, iPot) : tudo).trim().replace(/\s*\.$/, '.')
  const resto = iPot >= 0 ? tudo.slice(iPot) : ''
  const pot = {}
  for (const [k, rot] of [
    ['ar', 'Ar'],
    ['agua', 'Água'],
    ['solo', 'Solo'],
    ['geral', 'Geral'],
  ]) {
    const m = resto.match(new RegExp(`${rot}\\s*:?\\s*([PMG])\\b`, 'i'))
    pot[k] = m ? m[1] : null
  }
  const revogado = /revogad[ao]/i.test(tudo)

  // Corta a parte de portes: do primeiro "Porte" em diante.
  const iPorte = resto.search(/Porte\b/)
  let portesTxt = iPorte >= 0 ? resto.slice(iPorte) : ''
  // Observações livres (LAC etc.) depois dos portes.
  const observacoes = []
  const mLac = portesTxt.match(
    /(Esta atividade poder[áa] ser licenciada por meio da expedi[çc][ãa]o de Licen[çc]a Ambiental por Compromisso.*?)(?=$)/,
  )
  if (mLac) {
    observacoes.push(mLac[1].trim())
    portesTxt = portesTxt.slice(0, mLac.index)
  }

  // Frases que valem para a atividade inteira ou para um porte.
  const redacao = [
    ...portesTxt.matchAll(
      /\(Reda[çc][ãa]o dada pela Resolu[çc][ãa]o CONSEMA n[ºo°]?\s*([\d/]+)\)/gi,
    ),
  ].map((m) => m[1])
  portesTxt = portesTxt.replace(
    /\(Reda[çc][ãa]o dada pela Resolu[çc][ãa]o CONSEMA n[ºo°]?\s*[\d/]+\)/gi,
    ' ',
  )
  let auaGlobal = false
  let somenteLao = false
  const auaPorPorte = new Set()
  portesTxt = portesTxt.replace(
    /(?:Esta atividade ser[áa]|Todos os portes ser[ãa]o) licenciad[ao]s? (?:apenas )?por meio da expedi[çc][ãa]o de Autoriza[çc][ãa]o Ambiental\s*[–—-]\s*AuA\.?/gi,
    () => {
      auaGlobal = true
      return ' '
    },
  )
  portesTxt = portesTxt.replace(
    /Esta atividade ser[áa] licenciada apenas por meio da expedi[çc][ãa]o de Licen[çc]a Ambiental de Opera[çc][ãa]o\s*[–—-]\s*LAO\.?/gi,
    () => {
      somenteLao = true
      return ' '
    },
  )
  portesTxt = portesTxt.replace(
    /O porte ["“]?(P|M|G|pequeno|m[ée]dio|grande|m[íi]nimo)["”]? ser[áa] licenciado por meio da expedi[çc][ãa]o de Autoriza[çc][ãa]o Ambiental\s*[–—-]\s*AuA\.?/gi,
    (_, x) => {
      const k = x.toLowerCase()
      auaPorPorte.add(
        k === 'p' || k === 'pequeno'
          ? 'pequeno'
          : k === 'm' || k.startsWith('mé') || k === 'medio'
            ? 'medio'
            : k === 'g' || k === 'grande'
              ? 'grande'
              : 'minimo',
      )
      return ' '
    },
  )
  portesTxt = portesTxt.replace(/\s+/g, ' ').trim()
  const faixas = []
  let auaUnico = false
  if (/Porte\s*:?\s*Único/i.test(portesTxt)) {
    auaUnico = auaGlobal || /Autoriza[çc][ãa]o Ambiental/i.test(portesTxt)
    const est = portesTxt.match(/\((RAP|EAS|EIA)\)/)
    faixas.push({
      porte: 'unico',
      condicoes: [],
      estudo: est ? est[1] : null,
      modalidade: auaUnico ? 'AuA' : 'trifasica',
      textoOriginal: portesTxt.trim(),
    })
  } else {
    const partes = portesTxt.split(
      /(?=(?:Porte\s+)?(?:Mínimo|Pequeno|Médio|Grande|mínimo|pequeno|médio|grande)\*?\s*:)/,
    )
    for (const p of partes) {
      const m = p.match(
        /^(?:Porte\s+)?(Mínimo|Pequeno|Médio|Grande|mínimo|pequeno|médio|grande)\*?\s*:\s*(.*)$/,
      )
      if (!m) {
        if (p.trim() && !/^Porte\s*$/.test(p.trim())) observacoes.push(p.trim())
        continue
      }
      const porte = PORTES[m[1][0].toUpperCase() + m[1].slice(1)]
      let corpo = m[2].trim()
      const est = corpo.match(/\((RAP|EAS|EIA)([^)]*)\)?/)
      const aua = auaGlobal || auaPorPorte.has(porte) || /Autoriza[çc][ãa]o Ambiental/i.test(corpo)
      // Condição: texto antes do "(EST)" ou do " - ".
      let cond = corpo
      if (est) cond = corpo.slice(0, est.index)
      else if (/\s-/.test(corpo)) cond = corpo.slice(0, corpo.search(/\s-/))
      cond = cond.replace(/\(Redação.*$/i, '').trim()
      const condicoes = []
      let ok = true
      for (const alt of cond.split(/\s+ou\s+/)) {
        const c = condicao(alt)
        if (c) condicoes.push(c)
        else ok = false
      }
      const faixa = {
        porte,
        condicoes,
        estudo: est ? est[1] : null,
        ressalvaDoEstudo: est && est[2].trim() ? est[2].replace(/^[,\s]*/, '').trim() : null,
        modalidade: aua ? 'AuA' : somenteLao ? 'LAO' : 'trifasica',
        textoOriginal: `Porte ${m[1]}: ${corpo}`.trim(),
      }
      if (!ok || condicoes.length === 0) {
        faixa.condicoes = condicoes
        problemas.push({ codigo: it.codigo, motivo: 'condição não interpretada', texto: cond })
      }
      if (!est && !aua) faixa.semEstudo = true
      faixas.push(faixa)
    }
  }
  if (faixas.length === 0 && !revogado)
    problemas.push({ codigo: it.codigo, motivo: 'sem faixas', texto: resto.slice(0, 200) })
  if (!pot.geral && !revogado)
    problemas.push({ codigo: it.codigo, motivo: 'sem potencial geral', texto: resto.slice(0, 120) })

  saidaItens.push({
    codigo: it.codigo,
    grupo: it.grupo,
    descricao,
    potencial: pot,
    revogado,
    faixas,
    observacoes,
    redacaoDada: redacao,
  })
}

// O texto consolidado mantém a redação antiga seguida da nova com o mesmo código: vale a última.
const porCodigo = new Map()
for (const i of saidaItens) porCodigo.set(i.codigo, i)
const unicos = [...porCodigo.values()].filter((i) => !i.revogado)

const porMotivo = {}
for (const p of problemas) porMotivo[p.motivo] = (porMotivo[p.motivo] ?? 0) + 1
console.log(
  `itens no texto=${saidaItens.length} vigentes=${unicos.length} parametros=${Object.keys(parametros).length}`,
  porMotivo,
)
if (problemas.length > 0) {
  for (const p of problemas) console.error(`${p.codigo}: ${p.motivo}: ${p.texto}`)
  process.exit(1)
}

const nomeDoGrupo = (g) =>
  g ? `${g.codigo} · ${g.nome.charAt(0)}${g.nome.slice(1).toLowerCase()}` : ''

const atividades = unicos.map((i) => ({
  codigo: i.codigo,
  grupo: nomeDoGrupo(i.grupo),
  descricao: i.descricao,
  potencial: i.potencial,
  faixas: i.faixas.map((f) => ({
    porte: f.porte,
    condicoes: f.condicoes,
    estudo: f.estudo,
    ressalvaDoEstudo: f.ressalvaDoEstudo ?? null,
    modalidade: f.modalidade,
    textoOriginal: f.textoOriginal,
  })),
  observacoes: i.observacoes,
  redacaoDada: i.redacaoDada.at(-1) ?? null,
}))

if (saida.endsWith('.json')) {
  writeFileSync(saida, JSON.stringify({ parametros, atividades }, null, 2))
} else {
  const ts = `// GERADO por scripts/consema-250/gerar-catalogo.mjs: não editar à mão.
// Fonte: Resolução CONSEMA 250/2024, Anexos VI e VII, texto consolidado até a 314/2026
// (https://www.semae.sc.gov.br/?wpdmdl=3480). Ver docs/estudos/triagem-licenciamento-consema-250.md.

import type { CatalogoDeAtividades } from './triagem-licenciamento'

export const CATALOGO_CONSEMA_250: CatalogoDeAtividades = ${JSON.stringify(
    {
      fonte: 'Resolução CONSEMA 250/2024, consolidada até a Resolução CONSEMA 314/2026',
      atividades,
      parametros,
    },
    null,
    2,
  )}
`
  writeFileSync(saida, ts)
}
