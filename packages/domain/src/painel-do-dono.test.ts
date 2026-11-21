import { describe, expect, it } from 'vitest'

import {
  gravidadeDoRisco,
  motivosDoRisco,
  ordenarClientesEmRisco,
  type ClienteEmRisco,
} from './painel-do-dono'

function cliente(nome: string, extra: Partial<ClienteEmRisco> = {}): ClienteEmRisco {
  return {
    chave: nome,
    nome,
    prazosAtrasados: 0,
    laoAlemDoLimite: 0,
    laoPertoDoLimite: 0,
    vencimentosVencidos: 0,
    receberVencidoCentavos: 0,
    aprovadoCentavos: 0,
    ...extra,
  }
}

describe('painel do dono: clientes em risco', () => {
  it('gravidade soma cada critério uma vez', () => {
    expect(gravidadeDoRisco(cliente('A', { prazosAtrasados: 7 }))).toBe(4)
    expect(gravidadeDoRisco(cliente('A', { laoAlemDoLimite: 1, receberVencidoCentavos: 10 }))).toBe(
      6,
    )
    expect(gravidadeDoRisco(cliente('A'))).toBe(0)
  })

  it('ordena por gravidade e, no empate, pelo valor aprovado; sem risco fica de fora', () => {
    const lista = [
      cliente('Padaria', { receberVencidoCentavos: 5000, aprovadoCentavos: 900_000 }),
      cliente('Cerâmica', { prazosAtrasados: 1, aprovadoCentavos: 100_000 }),
      cliente('Metalúrgica', { prazosAtrasados: 2, aprovadoCentavos: 500_000 }),
      cliente('Fundição', { laoAlemDoLimite: 1 }),
      cliente('Tranquila'),
    ]
    expect(ordenarClientesEmRisco(lista).map((c) => c.nome)).toEqual([
      'Fundição',
      'Metalúrgica',
      'Cerâmica',
      'Padaria',
    ])
    expect(lista[0]?.nome).toBe('Padaria')
  })

  it('motivos em palavras, do mais grave ao menos', () => {
    expect(
      motivosDoRisco(
        cliente('A', {
          prazosAtrasados: 2,
          laoPertoDoLimite: 1,
          vencimentosVencidos: 1,
          receberVencidoCentavos: 100,
        }),
        'R$ 1,00',
      ),
    ).toEqual([
      '2 atrasados',
      '1 vencimento vencido',
      '1 LAO perto do limite de protocolo',
      'R$ 1,00 a receber vencido',
    ])
    expect(motivosDoRisco(cliente('A', { laoAlemDoLimite: 2 }), '')).toEqual([
      '2 LAOs passaram do limite de protocolo',
    ])
  })
})
