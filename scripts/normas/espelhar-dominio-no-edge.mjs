// Espelha no Edge as regras do catálogo de normas que a coleta usa (ADR-0050, pacote L1).
//
// As Edge Functions (Deno) não importam packages/domain: o supabase/functions/deno.json não tem
// import map e o domínio importa sem extensão ('./norma'), o que o Deno não resolve. Este script
// copia os arquivos abaixo para supabase/functions/_shared/dominio/, troca os imports relativos sem
// extensão por '.ts' e põe um cabeçalho de arquivo gerado.
//
// Uso (na raiz do repositório):
//   node scripts/normas/espelhar-dominio-no-edge.mjs              # regera os arquivos
//   node scripts/normas/espelhar-dominio-no-edge.mjs --conferir   # sai com erro se estiverem velhos
//
// O teste packages/domain/src/espelho-no-edge.test.ts repete a mesma regra e falha se alguém mudar o
// domínio sem regerar.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const ARQUIVOS = ['norma.ts', 'diferenca-de-norma.ts', 'classificar-ato.ts', 'sem-cpf.ts']

export const CABECALHO =
  '// Gerado por scripts/normas/espelhar-dominio-no-edge.mjs a partir de packages/domain/src. Não edite.\n\n'

// `from '...'`, `import '...'` e `import('...')`: o grupo 3 é o especificador.
const RE_IMPORT = /(\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"\n]+)\2/g
const RE_EXTENSAO = /\.[cm]?[jt]sx?$|\.json$/

/**
 * Transforma o código de um arquivo do domínio no arquivo espelhado do Edge: cabeçalho de gerado e
 * imports relativos sem extensão com '.ts'. Import que não é relativo (pacote) não existe no Edge,
 * então é erro.
 * @param {string} codigo
 * @returns {string}
 */
export function transformar(codigo) {
  const corpo = codigo.replace(RE_IMPORT, (trecho, antes, aspas, especificador) => {
    if (!especificador.startsWith('./') && !especificador.startsWith('../')) {
      throw new Error(`import não relativo não tem como ir para o Edge: ${especificador}`)
    }
    if (RE_EXTENSAO.test(especificador)) return trecho
    return `${antes}${aspas}${especificador}.ts${aspas}`
  })
  return CABECALHO + corpo
}

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ORIGEM = join(raiz, 'packages', 'domain', 'src')
const DESTINO = join(raiz, 'supabase', 'functions', '_shared', 'dominio')

function lerSeExiste(caminho) {
  try {
    return readFileSync(caminho, 'utf8')
  } catch {
    return null
  }
}

function principal(argumentos) {
  const conferir = argumentos.includes('--conferir')
  const velhos = []
  if (!conferir) mkdirSync(DESTINO, { recursive: true })
  for (const arquivo of ARQUIVOS) {
    const esperado = transformar(readFileSync(join(ORIGEM, arquivo), 'utf8'))
    const destino = join(DESTINO, arquivo)
    if (lerSeExiste(destino) === esperado) continue
    if (conferir) velhos.push(arquivo)
    else writeFileSync(destino, esperado)
  }
  if (velhos.length > 0) {
    console.error(
      `Espelho do domínio no Edge desatualizado: ${velhos.join(', ')}.\n` +
        'Rode: node scripts/normas/espelhar-dominio-no-edge.mjs',
    )
    process.exit(1)
  }
  console.log(
    conferir
      ? 'Espelho do domínio no Edge em dia.'
      : `Espelho gerado em ${DESTINO} (${ARQUIVOS.length} arquivos).`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal(process.argv.slice(2))
}
