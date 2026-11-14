import { describe, expect, it } from 'vitest'

import { dataCivil } from './data-civil'
import {
  errosDoAceite,
  errosDoRoteiro,
  horasDoCampo,
  minutosDasHoras,
  prazoInternoSugerido,
  proximasSituacoesDaTarefa,
  roteiroInicial,
  rotuloDaAcaoDaTarefa,
} from './tarefas-de-servico'

const hoje = dataCivil('2026-11-14')

describe('prazo interno sugerido', () => {
  it('é o último dia do mês previsto', () => {
    expect(prazoInternoSugerido('2026-02-01')).toBe('2026-02-28')
    expect(prazoInternoSugerido('2028-02-01')).toBe('2028-02-29')
    expect(prazoInternoSugerido('2026-12-01')).toBe('2026-12-31')
  })
  it('sem mês previsto fica sem prazo (nunca inventado)', () => {
    expect(prazoInternoSugerido(null)).toBeNull()
    expect(prazoInternoSugerido('dezembro')).toBeNull()
  })
})

describe('roteiro inicial', () => {
  const itens = [
    {
      id: 'i1',
      descricao: ' Relatório ',
      minutos: 90,
      responsavelId: 'ana',
      mesPrevisto: '2026-12-01',
    },
    { id: 'i2', descricao: 'Protocolo', minutos: 0, responsavelId: null, mesPrevisto: null },
    { id: 'i3', descricao: 'Visita', minutos: 120, responsavelId: 'bruno', mesPrevisto: null },
  ]

  it('uma tarefa por item, com o que a Gestão escolheu no orçamento', () => {
    expect(roteiroInicial(itens, new Set())).toEqual([
      {
        chave: 'i1',
        itemId: 'i1',
        titulo: 'Relatório',
        responsavelId: 'ana',
        horas: '1,5',
        prazoInterno: '2026-12-31',
      },
      {
        chave: 'i2',
        itemId: 'i2',
        titulo: 'Protocolo',
        responsavelId: null,
        horas: '',
        prazoInterno: '',
      },
      {
        chave: 'i3',
        itemId: 'i3',
        titulo: 'Visita',
        responsavelId: 'bruno',
        horas: '2',
        prazoInterno: '',
      },
    ])
  })

  it('item que já tem tarefa (revisão anterior) não entra de novo', () => {
    expect(roteiroInicial(itens, new Set(['i1', 'i3'])).map((t) => t.itemId)).toEqual(['i2'])
  })
})

describe('horas da tarefa', () => {
  it('vazio é não estimada, nunca zero', () => {
    expect(minutosDasHoras('')).toBeNull()
    expect(minutosDasHoras('  ')).toBeNull()
  })
  it('aceita horas decimais e horas e minutos', () => {
    expect(minutosDasHoras('1,5')).toBe(90)
    expect(minutosDasHoras('2h30')).toBe(150)
  })
  it('zero e texto inválido são erro', () => {
    expect(minutosDasHoras('0')).toBeUndefined()
    expect(minutosDasHoras('muito')).toBeUndefined()
  })
  it('minutos voltam para o campo', () => {
    expect(horasDoCampo(600)).toBe('10')
    expect(horasDoCampo(45)).toBe('0,75')
    expect(horasDoCampo(0)).toBe('')
  })
})

describe('validação do aceite', () => {
  it('pessoa, data e referência são obrigatórias', () => {
    expect(errosDoAceite({ aprovadoPor: ' ', dataAceite: '', referencia: '' }, hoje)).toEqual({
      aprovadoPor: 'Informe quem aprovou',
      dataAceite: 'Informe a data do aceite',
      referencia: 'Informe a referência',
    })
  })
  it('data no futuro é recusada; hoje vale', () => {
    expect(
      errosDoAceite(
        { aprovadoPor: 'Sr. Itaum', dataAceite: dataCivil('2026-11-15'), referencia: 'e-mail' },
        hoje,
      ),
    ).toEqual({ dataAceite: 'A data do aceite não pode ser futura' })
    expect(
      errosDoAceite({ aprovadoPor: 'Sr. Itaum', dataAceite: hoje, referencia: 'e-mail' }, hoje),
    ).toEqual({})
  })
})

describe('validação do roteiro', () => {
  it('aponta título vazio e horas inválidas pela chave', () => {
    expect(
      errosDoRoteiro([
        { chave: 'a', itemId: null, titulo: '', responsavelId: null, horas: '', prazoInterno: '' },
        {
          chave: 'b',
          itemId: null,
          titulo: 'Ok',
          responsavelId: null,
          horas: 'abc',
          prazoInterno: '',
        },
        {
          chave: 'c',
          itemId: null,
          titulo: 'Ok',
          responsavelId: null,
          horas: '3',
          prazoInterno: '',
        },
      ]),
    ).toEqual({ a: { titulo: 'Informe a tarefa' }, b: { horas: 'Horas inválidas' } })
  })
})

describe('situação da tarefa', () => {
  it('Equipe inicia, conclui e reabre; não cancela', () => {
    expect(proximasSituacoesDaTarefa('a_fazer', false)).toEqual(['em_andamento', 'concluida'])
    expect(proximasSituacoesDaTarefa('concluida', false)).toEqual(['em_andamento'])
    expect(proximasSituacoesDaTarefa('cancelada', false)).toEqual([])
  })
  it('Gestão também cancela e restaura', () => {
    expect(proximasSituacoesDaTarefa('em_andamento', true)).toEqual([
      'concluida',
      'a_fazer',
      'cancelada',
    ])
    expect(proximasSituacoesDaTarefa('cancelada', true)).toEqual(['a_fazer'])
  })
  it('rótulos dos botões', () => {
    expect(rotuloDaAcaoDaTarefa('a_fazer', 'em_andamento')).toBe('Iniciar')
    expect(rotuloDaAcaoDaTarefa('concluida', 'em_andamento')).toBe('Reabrir')
    expect(rotuloDaAcaoDaTarefa('cancelada', 'a_fazer')).toBe('Restaurar')
  })
})
