/**
 * Gera docs/design-system/tokens/fluent.css a partir do pacote oficial @fluentui/tokens (ADR-0015).
 * Nenhum valor do Fluent é digitado à mão: só a rampa da marca, montada com os verdes que o Grama
 * já usava (palette.css) e interpolada em OKLab onde falta tom. Rode com
 * `node scripts/gerar-tokens-fluent.mjs` sempre que mudar a versão do pacote ou a marca.
 *
 * O script falha se algum par de contraste obrigatório ficar abaixo de 4,5:1.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { createDarkTheme, createLightTheme } from '@fluentui/tokens'

// Âncoras da rampa (10 = mais escuro, 160 = mais claro). 80 é o primário no tema claro.
const ANCORAS = {
  10: '#0a241c', // --af-forest
  60: '#14532d', // green-900
  70: '#166534', // green-800
  80: '#15803d', // green-700 (o primário que o app já usava no claro)
  90: '#16a34a', // green-600
  100: '#22c55e', // green-500
  110: '#4ade80', // green-400
  120: '#86efac', // green-300
  130: '#bbf7d0', // green-200
  150: '#dcfce7', // green-100
  160: '#f0fdf4', // green-50
}

const hexParaRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
const rgbParaHex = (rgb) =>
  '#' +
  rgb
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, c)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const gama = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

function paraOklab(hex) {
  const [r, g, b] = hexParaRgb(hex).map(linear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function deOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return rgbParaHex(
    [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ].map(gama),
  )
}

function rampa() {
  const passos = Object.keys(ANCORAS).map(Number)
  const marca = {}
  for (let tom = 10; tom <= 160; tom += 10) {
    if (ANCORAS[tom]) {
      marca[tom] = ANCORAS[tom]
      continue
    }
    const antes = Math.max(...passos.filter((p) => p < tom))
    const depois = Math.min(...passos.filter((p) => p > tom))
    const t = (tom - antes) / (depois - antes)
    const [a, b] = [paraOklab(ANCORAS[antes]), paraOklab(ANCORAS[depois])]
    marca[tom] = deOklab(a.map((v, i) => v + (b[i] - v) * t))
  }
  return marca
}

function luminancia(cor) {
  const [r, g, b] = hexParaRgb(cor).map(linear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

const marca = rampa()
const claro = createLightTheme(marca)
const escuro = createDarkTheme(marca)
// No escuro, o Fluent clareia a marca para texto e foco (tons 100 e 110), como na web oficial.
escuro.colorBrandForeground1 = marca[110]
escuro.colorBrandForeground2 = marca[120]
escuro.colorBrandForegroundLink = marca[100]
escuro.colorBrandForegroundLinkHover = marca[110]
escuro.colorBrandForegroundLinkPressed = marca[90]
escuro.colorBrandStroke1 = marca[100]
escuro.colorCompoundBrandForeground1 = marca[100]
escuro.colorCompoundBrandBackground = marca[100]
escuro.colorCompoundBrandStroke = marca[100]

const PARES = [
  [
    'claro',
    'texto sobre o primário',
    claro.colorNeutralForegroundOnBrand,
    claro.colorBrandBackground,
  ],
  [
    'claro',
    'texto sobre o primário (hover)',
    claro.colorNeutralForegroundOnBrand,
    claro.colorBrandBackgroundHover,
  ],
  ['claro', 'link', claro.colorBrandForegroundLink, claro.colorNeutralBackground1],
  ['claro', 'texto sutil', claro.colorNeutralForeground3, claro.colorNeutralBackground1],
  [
    'claro',
    'texto sutil sobre a página',
    claro.colorNeutralForeground3,
    claro.colorNeutralBackground2,
  ],
  [
    'escuro',
    'texto sobre o primário',
    escuro.colorNeutralForegroundOnBrand,
    escuro.colorBrandBackground,
  ],
  ['escuro', 'link', escuro.colorBrandForegroundLink, escuro.colorNeutralBackground1],
  ['escuro', 'marca como texto', escuro.colorBrandForeground1, escuro.colorNeutralBackground1],
  ['escuro', 'texto sutil', escuro.colorNeutralForeground3, escuro.colorNeutralBackground1],
]
let falhou = false
for (const [tema, nome, texto, fundo] of PARES) {
  const r = contraste(texto, fundo)
  if (r < 4.5) falhou = true
  console.log(
    `${r < 4.5 ? 'FALHA' : 'ok   '} ${tema.padEnd(6)} ${nome}: ${r.toFixed(2)}:1 (${texto} sobre ${fundo})`,
  )
}
if (falhou) {
  console.error('Contraste abaixo de 4,5:1. Ajuste a rampa antes de gerar.')
  process.exit(1)
}

const bloco = (tema) =>
  Object.entries(tema)
    .map(([nome, valor]) => `  --${nome}: ${valor};`)
    .join('\n')

const css = `/* GERADO por scripts/gerar-tokens-fluent.mjs a partir de @fluentui/tokens. Não edite à mão.
   Tokens oficiais do Fluent 2 (web), com a rampa verde do Grama. Os componentes não usam estes
   nomes direto: colors.css, shape.css, typography.css e motion.css apontam os semânticos para cá. */

/* Rampa da marca (10 = mais escuro, 160 = mais claro) */
:root {
${Object.entries(marca)
  .map(([tom, cor]) => `  --marca-${tom}: ${cor};`)
  .join('\n')}
}

:root {
${bloco(claro)}
}

[data-theme='dark'] {
${bloco(escuro)}
}
`

const destino = fileURLToPath(new URL('../docs/design-system/tokens/fluent.css', import.meta.url))
writeFileSync(destino, css)
console.log(`Gerado ${destino} (${Object.keys(claro).length} tokens por tema)`)
