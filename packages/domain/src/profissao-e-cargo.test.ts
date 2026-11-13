import { describe, expect, it } from 'vitest'

import {
  CARGOS,
  PROFISSOES,
  cargoDoCodigo,
  gruposDaLista,
  profissaoDoCodigo,
  rotuloDaProfissao,
  rotuloDoCargo,
} from './profissao-e-cargo'

describe('profissão e cargo (listas fixas do Grama)', () => {
  it('códigos e rótulos sem repetição', () => {
    for (const lista of [PROFISSOES, CARGOS]) {
      expect(new Set(lista.map((i) => i.codigo)).size).toBe(lista.length)
      expect(new Set(lista.map((i) => i.rotulo.toLowerCase())).size).toBe(lista.length)
    }
  })

  it('tem as profissões que o Eduardo citou e os cargos aprovados', () => {
    const rotulos = PROFISSOES.map((p) => p.rotulo)
    for (const nome of [
      'Engenheiro ambiental',
      'Engenheiro sanitarista',
      'Engenheiro ambiental e sanitarista',
      'Engenheiro civil',
      'Engenheiro químico',
      'Arquiteto e urbanista',
      'Geólogo',
      'Geógrafo',
      'Biólogo',
    ]) {
      expect(rotulos).toContain(nome)
    }
    expect(PROFISSOES).toHaveLength(34)
    expect(CARGOS.map((c) => c.rotulo)).toEqual([
      'Estagiário',
      'Auxiliar administrativo',
      'Técnico',
      'Assistente',
      'Analista júnior',
      'Analista pleno',
      'Analista sênior',
      'Especialista',
      'Coordenador',
      'Gerente',
      'Diretor',
    ])
  })

  it('código desconhecido não vira válido; rótulo pelo código', () => {
    expect(profissaoDoCodigo('eng_ambiental')).toBe('eng_ambiental')
    expect(profissaoDoCodigo('Eng Ambiental')).toBeNull()
    expect(cargoDoCodigo('estagiario')).toBe('estagiario')
    expect(cargoDoCodigo(null)).toBeNull()
    expect(rotuloDaProfissao('eng_ambiental_sanitarista')).toBe(
      'Engenheiro ambiental e sanitarista',
    )
    expect(rotuloDoCargo('analista_senior')).toBe('Analista sênior')
  })

  it('agrupa na ordem da lista', () => {
    const grupos = gruposDaLista(PROFISSOES)
    expect(grupos.map((g) => g.grupo)).toEqual([
      'Engenharias',
      'Geociências',
      'Outros conselhos',
      'Meio socioeconômico e outras áreas',
      'Nível técnico',
      'Outras',
    ])
    expect(grupos.reduce((n, g) => n + g.itens.length, 0)).toBe(PROFISSOES.length)
  })
})
