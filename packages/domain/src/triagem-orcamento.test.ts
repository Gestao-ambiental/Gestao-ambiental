import { describe, expect, it } from 'vitest'

import {
  LICENCAS_DA_MODALIDADE,
  despesaDaTaxa,
  ehModalidade,
  nomeDosValoresDaModalidade,
  objetoDoOrcamentoDaTriagem,
} from './triagem-orcamento'

describe('triagem vira orçamento', () => {
  it('modalidade → licenças do pacote', () => {
    expect(LICENCAS_DA_MODALIDADE.trifasica).toEqual(['LAP', 'LAI', 'LAO'])
    expect(LICENCAS_DA_MODALIDADE.AuA).toEqual(['AuA'])
    expect(LICENCAS_DA_MODALIDADE.LAO).toEqual(['LAO'])
    expect(ehModalidade('trifasica')).toBe(true)
    expect(ehModalidade('LAC')).toBe(false)
  })

  it('objeto e nome dos valores pela modalidade', () => {
    expect(objetoDoOrcamentoDaTriagem('trifasica', ' Cerâmica Itaum ')).toBe(
      'Licenciamento trifásico (LAP, LAI e LAO) · Cerâmica Itaum',
    )
    expect(objetoDoOrcamentoDaTriagem('AuA', null)).toBe('Autorização Ambiental (AuA)')
    expect(nomeDosValoresDaModalidade('LAO')).toBe(
      'Valores · Somente Licença Ambiental de Operação (LAO)',
    )
  })

  it('taxa do IMA: a maior entre as atividades, com a base legal; sem valor, a cotar', () => {
    expect(
      despesaDaTaxa('estadual', [
        { codigo: '24.10.00', centavos: 312345 },
        { codigo: '33.10.00', centavos: 500000 },
      ]),
    ).toEqual({
      descricao: 'Taxa do IMA (Lei estadual 14.262/2007, valores do Decreto 421/2023)',
      estimativaCentavos: 500000,
    })
    expect(despesaDaTaxa('estadual', [])?.estimativaCentavos).toBeNull()
  })

  it('no município, a taxa é dele e fica a cotar; sem órgão, nenhuma despesa', () => {
    expect(despesaDaTaxa('municipal', [{ codigo: 'x', centavos: 1 }])).toEqual({
      descricao: 'Taxa do município',
      estimativaCentavos: null,
    })
    expect(despesaDaTaxa(null, [])).toBeNull()
  })
})
