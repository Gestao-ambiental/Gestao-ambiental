import { describe, expect, it } from 'vitest'

import {
  afetaOEmpreendimento,
  rotuloDoMotivo,
  type CriterioDeNorma,
  type NormaParaAplicar,
  type PerfilDoEmpreendimento,
} from './aplicabilidade'

const JOINVILLE = '4209102'
const BLUMENAU = '4202404'

function norma(
  criterios: CriterioDeNorma[],
  extra: Partial<NormaParaAplicar> = {},
): NormaParaAplicar {
  return { esfera: 'estadual', municipioIbge: null, criterios, ...extra }
}

function perfil(extra: Partial<PerfilDoEmpreendimento> = {}): PerfilDoEmpreendimento {
  return {
    atividades: [
      { codigo: '47.30.00', instrumentoId: 'lao' },
      { codigo: '26.10.01', instrumentoId: null },
    ],
    municipios: [JOINVILLE],
    licencas: [
      { id: 'lao', sigla: 'LAO', orgao: 'IMA', ativa: true },
      { id: 'lai-vencida', sigla: 'LAI', orgao: 'IMA', ativa: false },
      { id: 'municipal', sigla: 'LAO', orgao: 'SAMA Joinville', ativa: true },
    ],
    ...extra,
  }
}

describe('afetaOEmpreendimento', () => {
  it('sem critério nenhum não alcança ninguém', () => {
    expect(afetaOEmpreendimento(norma([]), perfil())).toEqual({ afeta: false, motivos: [] })
  })

  it('só tema ou só tipo de licença não alcança ninguém', () => {
    expect(
      afetaOEmpreendimento(norma([{ tipo: 'tema', valor: 'efluentes' }]), perfil()).afeta,
    ).toBe(false)
    expect(
      afetaOEmpreendimento(norma([{ tipo: 'tipo_licenca', valor: 'LAO' }]), perfil()).afeta,
    ).toBe(false)
  })

  describe('(b) atividade', () => {
    it('casa a atividade da licença ativa, com a licença no motivo', () => {
      expect(
        afetaOEmpreendimento(norma([{ tipo: 'atividade', valor: '47.30.00' }]), perfil()),
      ).toEqual({
        afeta: true,
        motivos: [{ criterio: 'atividade', valor: '47.30.00', instrumentoId: 'lao' }],
      })
    })

    it('casa a atividade gravada no empreendimento, sem licença no motivo', () => {
      expect(
        afetaOEmpreendimento(norma([{ tipo: 'atividade', valor: '26.10.01' }]), perfil()).motivos,
      ).toEqual([{ criterio: 'atividade', valor: '26.10.01', instrumentoId: null }])
    })

    it('ignora a atividade de licença que não está ativa', () => {
      const resultado = afetaOEmpreendimento(
        norma([{ tipo: 'atividade', valor: '33.11.00' }]),
        perfil({ atividades: [{ codigo: '33.11.00', instrumentoId: 'lai-vencida' }] }),
      )
      expect(resultado.afeta).toBe(false)
    })

    it('ignora a atividade de licença que não está no perfil', () => {
      const resultado = afetaOEmpreendimento(
        norma([{ tipo: 'atividade', valor: '33.11.00' }]),
        perfil({ atividades: [{ codigo: '33.11.00', instrumentoId: 'outra' }] }),
      )
      expect(resultado.afeta).toBe(false)
    })

    it('não casa atividade diferente', () => {
      expect(
        afetaOEmpreendimento(norma([{ tipo: 'atividade', valor: '47.30.01' }]), perfil()).afeta,
      ).toBe(false)
    })

    it('prefixo de dois e de quatro dígitos casa pelo começo do código, sem pegar outro grupo', () => {
      expect(
        afetaOEmpreendimento(norma([{ tipo: 'prefixo_atividade', valor: '26' }]), perfil()).motivos,
      ).toEqual([{ criterio: 'prefixo_atividade', valor: '26', instrumentoId: null }])
      expect(
        afetaOEmpreendimento(norma([{ tipo: 'prefixo_atividade', valor: '26.10' }]), perfil())
          .afeta,
      ).toBe(true)
      expect(
        afetaOEmpreendimento(norma([{ tipo: 'prefixo_atividade', valor: '26.1' }]), perfil()).afeta,
      ).toBe(false)
      expect(
        afetaOEmpreendimento(norma([{ tipo: 'prefixo_atividade', valor: '2' }]), perfil()).afeta,
      ).toBe(false)
    })

    it('a mesma atividade na licença e no empreendimento dá um motivo para cada', () => {
      const resultado = afetaOEmpreendimento(
        norma([{ tipo: 'atividade', valor: '47.30.00' }]),
        perfil({
          atividades: [
            { codigo: '47.30.00', instrumentoId: 'lao' },
            { codigo: '47.30.00', instrumentoId: 'lao' },
            { codigo: '47.30.00', instrumentoId: null },
          ],
        }),
      )
      expect(resultado.motivos).toEqual([
        { criterio: 'atividade', valor: '47.30.00', instrumentoId: 'lao' },
        { criterio: 'atividade', valor: '47.30.00', instrumentoId: null },
      ])
    })

    it('com atividade, ignora município e competência', () => {
      const resultado = afetaOEmpreendimento(
        norma([
          { tipo: 'atividade', valor: '99.99.99' },
          { tipo: 'municipio', valor: JOINVILLE },
          { tipo: 'competencia', valor: 'estadual' },
        ]),
        perfil(),
      )
      expect(resultado.afeta).toBe(false)
    })
  })

  describe('(e) tipo de licença com atividade', () => {
    it('restringe as licenças pela sigla, sem diferença de caixa', () => {
      const atividades = [
        { codigo: '47.30.00', instrumentoId: 'lao' },
        { codigo: '47.30.00', instrumentoId: 'aua' },
      ]
      const licencas = [
        { id: 'lao', sigla: 'LAO', orgao: 'IMA', ativa: true },
        { id: 'aua', sigla: 'AUA', orgao: 'IMA', ativa: true },
      ]
      expect(
        afetaOEmpreendimento(
          norma([
            { tipo: 'atividade', valor: '47.30.00' },
            { tipo: 'tipo_licenca', valor: 'AuA' },
          ]),
          perfil({ atividades, licencas }),
        ).motivos,
      ).toEqual([{ criterio: 'atividade', valor: '47.30.00', instrumentoId: 'aua' }])
    })

    it('licença sem sigla fica de fora quando há tipo de licença', () => {
      const resultado = afetaOEmpreendimento(
        norma([
          { tipo: 'atividade', valor: '47.30.00' },
          { tipo: 'tipo_licenca', valor: 'LAO' },
        ]),
        perfil({
          atividades: [{ codigo: '47.30.00', instrumentoId: 'x' }],
          licencas: [{ id: 'x', sigla: null, orgao: 'IMA', ativa: true }],
        }),
      )
      expect(resultado.afeta).toBe(false)
    })

    it('não restringe a atividade gravada no empreendimento, que não tem licença', () => {
      expect(
        afetaOEmpreendimento(
          norma([
            { tipo: 'prefixo_atividade', valor: '26' },
            { tipo: 'tipo_licenca', valor: 'LAI' },
          ]),
          perfil(),
        ).motivos,
      ).toEqual([{ criterio: 'prefixo_atividade', valor: '26', instrumentoId: null }])
    })
  })

  describe('(a) norma municipal', () => {
    const municipal = { esfera: 'municipal', municipioIbge: JOINVILLE } as const

    it('com atividade, alcança quem tem unidade no município da norma', () => {
      expect(
        afetaOEmpreendimento(norma([{ tipo: 'atividade', valor: '47.30.00' }], municipal), perfil())
          .afeta,
      ).toBe(true)
    })

    it('com atividade, não alcança quem está em outro município', () => {
      expect(
        afetaOEmpreendimento(
          norma([{ tipo: 'atividade', valor: '47.30.00' }], municipal),
          perfil({ municipios: [BLUMENAU] }),
        ),
      ).toEqual({ afeta: false, motivos: [] })
    })

    it('empreendimento sem unidade com município não é alcançado', () => {
      expect(
        afetaOEmpreendimento(
          norma([{ tipo: 'competencia', valor: 'municipal' }], municipal),
          perfil({ municipios: [] }),
        ).afeta,
      ).toBe(false)
    })

    it('sem critério, mesmo no município, não alcança ninguém', () => {
      expect(afetaOEmpreendimento(norma([], municipal), perfil()).afeta).toBe(false)
    })

    it('com competência municipal, alcança as licenças municipais no município', () => {
      expect(
        afetaOEmpreendimento(
          norma([{ tipo: 'competencia', valor: 'municipal' }], municipal),
          perfil(),
        ).motivos,
      ).toEqual([{ criterio: 'competencia', valor: 'municipal', instrumentoId: 'municipal' }])
    })
  })

  describe('(c) município', () => {
    it('casa as unidades no município do critério', () => {
      expect(
        afetaOEmpreendimento(
          norma([
            { tipo: 'municipio', valor: JOINVILLE },
            { tipo: 'municipio', valor: BLUMENAU },
          ]),
          perfil(),
        ).motivos,
      ).toEqual([{ criterio: 'municipio', valor: JOINVILLE, instrumentoId: null }])
    })

    it('não casa unidade em outro município', () => {
      expect(
        afetaOEmpreendimento(norma([{ tipo: 'municipio', valor: BLUMENAU }]), perfil()).afeta,
      ).toBe(false)
    })

    it('com município, ignora competência', () => {
      expect(
        afetaOEmpreendimento(
          norma([
            { tipo: 'municipio', valor: BLUMENAU },
            { tipo: 'competencia', valor: 'estadual' },
          ]),
          perfil(),
        ).afeta,
      ).toBe(false)
    })
  })

  describe('(d) competência', () => {
    it('estadual casa as licenças ativas do IMA (ou FATMA)', () => {
      const licencas = [
        { id: 'a', sigla: 'LAO', orgao: 'IMA', ativa: true },
        { id: 'b', sigla: 'LAO', orgao: 'Fatma', ativa: true },
        { id: 'c', sigla: 'LAO', orgao: 'IMA/SC', ativa: true },
        { id: 'd', sigla: 'LAO', orgao: 'IMA', ativa: false },
        { id: 'e', sigla: 'LAO', orgao: 'SIMAJ', ativa: true },
        { id: 'f', sigla: 'LAO', orgao: null, ativa: true },
      ]
      expect(
        afetaOEmpreendimento(
          norma([{ tipo: 'competencia', valor: 'estadual' }]),
          perfil({ licencas }),
        ).motivos.map((m) => m.instrumentoId),
      ).toEqual(['a', 'b', 'c'])
    })

    it('municipal casa licenças ativas com órgão preenchido que não é o IMA', () => {
      const licencas = [
        { id: 'a', sigla: 'LAO', orgao: 'IMA', ativa: true },
        { id: 'b', sigla: 'LAO', orgao: 'SAMA', ativa: true },
        { id: 'c', sigla: 'LAO', orgao: '  ', ativa: true },
        { id: 'd', sigla: 'LAO', orgao: null, ativa: true },
        { id: 'e', sigla: 'LAO', orgao: 'SAMA', ativa: false },
      ]
      expect(
        afetaOEmpreendimento(
          norma([{ tipo: 'competencia', valor: 'municipal' }]),
          perfil({ licencas }),
        ).motivos,
      ).toEqual([{ criterio: 'competencia', valor: 'municipal', instrumentoId: 'b' }])
    })

    it('tipo de licença restringe a competência', () => {
      const licencas = [
        { id: 'lao', sigla: 'LAO', orgao: 'IMA', ativa: true },
        { id: 'lai', sigla: 'LAI', orgao: 'IMA', ativa: true },
      ]
      expect(
        afetaOEmpreendimento(
          norma([
            { tipo: 'competencia', valor: 'estadual' },
            { tipo: 'tipo_licenca', valor: 'LAI' },
          ]),
          perfil({ licencas }),
        ).motivos,
      ).toEqual([{ criterio: 'competencia', valor: 'estadual', instrumentoId: 'lai' }])
    })

    it('sem licença ativa não alcança ninguém', () => {
      expect(
        afetaOEmpreendimento(
          norma([{ tipo: 'competencia', valor: 'estadual' }]),
          perfil({ licencas: [] }),
        ).afeta,
      ).toBe(false)
    })
  })
})

describe('rotuloDoMotivo', () => {
  it('monta o rótulo de cada critério', () => {
    expect(rotuloDoMotivo({ criterio: 'atividade', valor: '47.30.00' })).toBe('Atividade 47.30.00')
    expect(rotuloDoMotivo({ criterio: 'prefixo_atividade', valor: '26' })).toBe('Atividades 26.*')
    expect(rotuloDoMotivo({ criterio: 'prefixo_atividade', valor: '26.10' })).toBe(
      'Atividades 26.10.*',
    )
    expect(rotuloDoMotivo({ criterio: 'municipio', valor: JOINVILLE }, 'Joinville')).toBe(
      'Município de Joinville',
    )
    expect(rotuloDoMotivo({ criterio: 'municipio', valor: JOINVILLE })).toBe('Município 4209102')
    expect(rotuloDoMotivo({ criterio: 'municipio', valor: JOINVILLE }, null)).toBe(
      'Município 4209102',
    )
    expect(rotuloDoMotivo({ criterio: 'competencia', valor: 'estadual' })).toBe('Licenças do IMA')
    expect(rotuloDoMotivo({ criterio: 'competencia', valor: 'municipal' })).toBe(
      'Licenças municipais',
    )
    expect(rotuloDoMotivo({ criterio: 'tipo_licenca', valor: 'LAO' })).toBe('Licenças LAO')
    expect(rotuloDoMotivo({ criterio: 'tipo_licenca', valor: 'renovacao' })).toBe(
      'Licenças de renovação',
    )
    expect(rotuloDoMotivo({ criterio: 'tema', valor: 'efluentes' })).toBe('Tema efluentes')
    expect(rotuloDoMotivo({ criterio: 'desconhecido', valor: 'x' })).toBe('x')
  })
})
