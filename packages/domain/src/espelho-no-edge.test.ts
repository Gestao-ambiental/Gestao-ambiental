// Confere o espelho do domínio no Edge (ADR-0050, pacote L1): os arquivos de
// supabase/functions/_shared/dominio/ têm de ser exatamente o que
// scripts/normas/espelhar-dominio-no-edge.mjs gera a partir de packages/domain/src. Falha quando
// alguém muda o domínio sem regerar.
//
// O domínio não importa APIs do Node nem tem os tipos dele (ADR-0007), e o tsconfig não aceita
// importar o .mjs do script. Por isso os arquivos entram como texto pelo `?raw` do Vitest e a regra
// de transformação está repetida em `transformar` abaixo, idêntica à do script. Se as duas
// divergirem, o arquivo regerado pelo script deixa de bater com a regra daqui e este teste falha.

import { describe, expect, it } from 'vitest'

import classificarAto from './classificar-ato.ts?raw'
import diferencaDeNorma from './diferenca-de-norma.ts?raw'
import filtroDeAto from './filtro-de-ato.ts?raw'
import norma from './norma.ts?raw'
import semCpf from './sem-cpf.ts?raw'
import classificarAtoNoEdge from '../../../supabase/functions/_shared/dominio/classificar-ato.ts?raw'
import diferencaDeNormaNoEdge from '../../../supabase/functions/_shared/dominio/diferenca-de-norma.ts?raw'
import filtroDeAtoNoEdge from '../../../supabase/functions/_shared/dominio/filtro-de-ato.ts?raw'
import normaNoEdge from '../../../supabase/functions/_shared/dominio/norma.ts?raw'
import semCpfNoEdge from '../../../supabase/functions/_shared/dominio/sem-cpf.ts?raw'

const CABECALHO =
  '// Gerado por scripts/normas/espelhar-dominio-no-edge.mjs a partir de packages/domain/src. Não edite.\n\n'
const RE_IMPORT = /(\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"\n]+)\2/g
const RE_EXTENSAO = /\.[cm]?[jt]sx?$|\.json$/

// Mesma regra de `transformar` em scripts/normas/espelhar-dominio-no-edge.mjs.
function transformar(codigo: string): string {
  const corpo = codigo.replace(
    RE_IMPORT,
    (trecho, antes: string, aspas: string, especificador: string) => {
      if (!especificador.startsWith('./') && !especificador.startsWith('../')) {
        throw new Error(`import não relativo não tem como ir para o Edge: ${especificador}`)
      }
      if (RE_EXTENSAO.test(especificador)) return trecho
      return `${antes}${aspas}${especificador}.ts${aspas}`
    },
  )
  return CABECALHO + corpo
}

// Um checkout com CRLF não pode acusar diferença que não existe no repositório (LF).
const lf = (texto: string) => texto.replace(/\r\n/g, '\n')

describe('transformar (regra do espelho no Edge)', () => {
  it('põe .ts nos imports relativos sem extensão e o cabeçalho de gerado', () => {
    const codigo = [
      "import { a } from './norma'",
      "import type { B } from '../outro/tipo'",
      "export { c } from './c'",
      "export * from './d'",
      "import './efeito'",
      "const e = await import('./dinamico')",
      '',
    ].join('\n')
    expect(transformar(codigo)).toBe(
      CABECALHO +
        [
          "import { a } from './norma.ts'",
          "import type { B } from '../outro/tipo.ts'",
          "export { c } from './c.ts'",
          "export * from './d.ts'",
          "import './efeito.ts'",
          "const e = await import('./dinamico.ts')",
          '',
        ].join('\n'),
    )
  })

  it('não mexe em import que já tem extensão nem em código sem import', () => {
    expect(transformar('import x from \'./x.ts\'\nimport y from "./y.json"\n')).toBe(
      CABECALHO + 'import x from \'./x.ts\'\nimport y from "./y.json"\n',
    )
    expect(transformar('export const um = 1\n')).toBe(CABECALHO + 'export const um = 1\n')
  })

  it('recusa import de pacote, que não existe no Edge', () => {
    expect(() => transformar("import { z } from 'zod'\n")).toThrow(/zod/)
  })
})

describe('espelho do domínio em supabase/functions/_shared/dominio', () => {
  it.each([
    ['norma.ts', norma, normaNoEdge],
    ['diferenca-de-norma.ts', diferencaDeNorma, diferencaDeNormaNoEdge],
    ['classificar-ato.ts', classificarAto, classificarAtoNoEdge],
    ['sem-cpf.ts', semCpf, semCpfNoEdge],
    ['filtro-de-ato.ts', filtroDeAto, filtroDeAtoNoEdge],
  ])(
    '%s está em dia (se falhar: node scripts/normas/espelhar-dominio-no-edge.mjs)',
    (_arquivo, dominio, noEdge) => {
      expect(lf(noEdge)).toBe(transformar(lf(dominio)))
    },
  )
})
