// Base legal de uma condicionante (ADR-0050, LEG-10): as normas citadas no texto literal viram
// chaves candidatas do catálogo. Citação ambígua (Lei 14.675 sem esfera) gera as chaves das duas
// esferas; o banco (normas_por_chave) devolve só as que existem.

import { chaveDaNorma, lerTodosOsIdentificadores, type IdentificadorDeNorma } from './norma'

const ORGAOS_FEDERAIS = new Set(['CONAMA', 'IBAMA'])

function tentar(montar: () => string): string | null {
  try {
    return montar()
  } catch {
    return null
  }
}

/** Chaves candidatas de uma citação. */
export function chavesDaCitacao(id: IdentificadorDeNorma): string[] {
  const ano = id.ano === undefined ? {} : { ano: id.ano }
  const base = { tipo: id.tipo, numero: id.numero, ...ano }
  const candidatas: (string | null)[] = []
  if (id.orgao && ORGAOS_FEDERAIS.has(id.orgao)) {
    candidatas.push(
      tentar(() => chaveDaNorma({ esfera: 'federal', orgao: id.orgao ?? '', ...base })),
    )
  } else if (id.orgao) {
    candidatas.push(
      tentar(() => chaveDaNorma({ esfera: 'estadual', orgao: id.orgao ?? '', ...base })),
    )
  } else if (id.tipo === 'instrucao_normativa' || id.tipo === 'portaria') {
    // IN e portaria sem órgão, numa licença de SC: as do IMA.
    candidatas.push(tentar(() => chaveDaNorma({ esfera: 'estadual', orgao: 'IMA', ...base })))
  } else if (id.tipo === 'lei' || id.tipo === 'lei_complementar') {
    candidatas.push(
      tentar(() => chaveDaNorma({ esfera: 'federal', orgao: 'federal', ...base })),
      tentar(() => chaveDaNorma({ esfera: 'estadual', orgao: 'ALESC', ...base })),
    )
  } else if (id.tipo === 'decreto') {
    candidatas.push(
      tentar(() => chaveDaNorma({ esfera: 'federal', orgao: 'federal', ...base })),
      tentar(() => chaveDaNorma({ esfera: 'estadual', orgao: 'executivo', ...base })),
    )
  }
  // As INs do IMA estão no catálogo sem ano (o número não se repete): a citação com ano também acha.
  if (
    id.tipo === 'instrucao_normativa' &&
    (!id.orgao || id.orgao === 'IMA') &&
    id.ano !== undefined
  ) {
    candidatas.push(
      tentar(() =>
        chaveDaNorma({ esfera: 'estadual', orgao: 'IMA', tipo: id.tipo, numero: id.numero }),
      ),
    )
  }
  return candidatas.filter((c): c is string => c !== null)
}

/** Chaves candidatas de todas as normas citadas no texto, sem repetir, até 50. */
export function chavesCitadas(texto: string): string[] {
  const chaves = new Set<string>()
  for (const id of lerTodosOsIdentificadores(texto)) {
    for (const chave of chavesDaCitacao(id)) chaves.add(chave)
  }
  return [...chaves].slice(0, 50)
}
