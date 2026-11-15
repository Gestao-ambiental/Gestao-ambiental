import { describe, expect, it } from 'vitest'

import { MODELOS_DE_SERVICO } from './catalogo-servicos'

// Referência tirada do catálogo antes de ele passar para o formato enxuto (14/11/2026):
// SHA-256 do JSON.stringify do array completo de modelos no formato antigo.
const SHA256_DO_CATALOGO_ANTIGO = 'e1e097d261853ebc72bb06121e0941706370eee16d2832944532a99fcbf2a58f'

const NOTA_PADRAO =
  'Modelo de escopo para revisão técnica. Os itens não são uma lista universal de exigências. Confirmar atividade, porte, fase, competência e documentos existentes; preço, horas e despesas precisam ser preenchidos. ART: distinguir trabalho técnico e taxa de registro. Taxas não são honorários. Não há garantia de deferimento.'

async function sha256(texto: string) {
  const resumo = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return Array.from(new Uint8Array(resumo), (b) => b.toString(16).padStart(2, '0')).join('')
}

describe('catálogo de modelos de serviço', () => {
  it('devolve exatamente o mesmo conteúdo do formato antigo', async () => {
    expect(await sha256(JSON.stringify(MODELOS_DE_SERVICO))).toBe(SHA256_DO_CATALOGO_ANTIGO)
  })

  it('mantém as contagens de modelos, etapas, despesas e itens marcados', () => {
    const itens = MODELOS_DE_SERVICO.flatMap((m) => [...m.etapas, ...m.despesas])
    expect(MODELOS_DE_SERVICO).toHaveLength(56)
    expect(MODELOS_DE_SERVICO.flatMap((m) => m.etapas)).toHaveLength(286)
    expect(MODELOS_DE_SERVICO.flatMap((m) => m.despesas)).toHaveLength(199)
    expect(itens.filter((i) => i.marcada)).toHaveLength(266)
    expect(itens.every((i) => i.marcada === !i.condicional)).toBe(true)
    expect(new Set(MODELOS_DE_SERVICO.map((m) => m.id)).size).toBe(56)
  })

  it('mantém as horas sugeridas e a nota extra do DANC', () => {
    const danc = MODELOS_DE_SERVICO.find((m) => m.id === 'danc')
    expect(danc?.etapas.map((e) => [e.nome, e.horasSugeridas, e.marcada])).toEqual([
      ['Verificação da atividade e enquadramento', 1, true],
      ['Conferência dos documentos do empreendimento', 1, true],
      ['Preenchimento do requerimento e protocolo', 1, true],
      ['Vistoria ou estudo complementar, se necessário', null, false],
      ['Acompanhamento do pedido — limite a definir', null, false],
    ])
    expect(danc?.nota).toBe(
      `${NOTA_PADRAO} Sugestão comercial inicial: 1h por etapa básica (3h no total), ajustável após conferir o caso. Não é prazo legal nem média medida.`,
    )
  })

  it('mantém um modelo sem despesa fixa item a item', () => {
    expect(MODELOS_DE_SERVICO.at(-1)).toEqual({
      id: 'mtr',
      nome: 'MTR — manifesto de transporte de resíduos',
      categoria: 'Resíduos',
      jurisdicao: 'Joinville / SAMA',
      consultadoEm: '2026-11-11',
      fonte:
        'https://www.joinville.sc.gov.br/servicos/emitir-manifesto-de-transporte-de-residuos-mtr/',
      nota: NOTA_PADRAO,
      etapas: [
        {
          nome: 'Conferência do cadastro do gerador, do transportador e do destinador',
          marcada: true,
          condicional: false,
          horasSugeridas: null,
        },
        {
          nome: 'Emissão dos manifestos no sistema',
          marcada: true,
          condicional: false,
          horasSugeridas: null,
        },
        {
          nome: 'Conferência dos certificados de destinação final (CDF)',
          marcada: false,
          condicional: true,
          horasSugeridas: null,
        },
        {
          nome: 'Rotina mensal de emissão — definir volume',
          marcada: false,
          condicional: true,
          horasSugeridas: null,
        },
      ],
      despesas: [{ nome: 'Taxas do sistema, se houver', marcada: false, condicional: true }],
    })
  })
})
