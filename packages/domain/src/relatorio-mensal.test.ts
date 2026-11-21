import { describe, expect, it } from 'vitest'

import { preencherModelo, problemaDoConteudo, type NoDoDocumento } from './modelo-documento'
import {
  mesPorExtenso,
  modeloResumoParaOCliente,
  valoresDoRelatorioMensal,
  type DadosParaRelatorioMensal,
} from './relatorio-mensal'

const DADOS: DadosParaRelatorioMensal = {
  consultoria: 'Filtroville',
  autor: 'Eduardo',
  hoje: '2026-11-21',
  mes: '2026-11-01',
  empreendimento: { nome: 'Metalúrgica Açores', cliente: 'Açores S.A.', cnpj: '11222333000181' },
  licencas: [{ titulo: 'LAO 4821/2023', orgao: 'IMA', validade: '2027-03-10' }],
  entregas: [
    {
      codigo: '4.2',
      titulo: 'Relatório de efluentes',
      licenca: 'LAO 4821/2023',
      data: '2026-11-05',
    },
  ],
  protocolos: [],
  proximos: [
    { data: '2026-12-01', tipo: 'ocorrencia', codigo: '5.1', titulo: 'Ruído', licenca: null },
  ],
}

function texto(no: NoDoDocumento): string {
  if (no.type === 'text') return no.text ?? ''
  const filhos = (no.content ?? []).map(texto).join('')
  return no.type === 'paragraph' || no.type === 'heading' ? `${filhos}\n` : filhos
}

describe('relatório mensal ao cliente', () => {
  it('mês por extenso', () => {
    expect(mesPorExtenso('2026-11-01')).toBe('novembro de 2026')
    expect(mesPorExtenso('2026-03-01')).toBe('março de 2026')
  })

  it('o modelo-semente é válido e não afirma regularidade', () => {
    const modelo = modeloResumoParaOCliente()
    expect(problemaDoConteudo(modelo)).toBeNull()
    expect(JSON.stringify(modelo)).toContain('Licenças e validades')
    expect(JSON.stringify(modelo).toLowerCase()).not.toContain('em dia')
  })

  it('preenche os campos e repete os blocos por item, com datas dd/mm/aaaa', () => {
    const { valores, listas } = valoresDoRelatorioMensal(DADOS)
    const { documento, semValor } = preencherModelo(modeloResumoParaOCliente(), valores, listas)
    const saida = texto(documento)
    expect(saida).toContain('Resumo de novembro de 2026')
    expect(saida).toContain('11.222.333/0001-81')
    expect(saida).toContain('LAO 4821/2023 · IMA · validade 10/03/2027')
    expect(saida).toContain('05/11/2026 · 4.2 Relatório de efluentes · LAO 4821/2023')
    expect(saida).toContain('Nenhum protocolo no mês.')
    // Campo do item que falta sai como travessão.
    expect(saida).toContain('01/12/2026 · 5.1 Ruído · —')
    expect(semValor).toEqual([])
    expect(JSON.stringify(documento)).not.toContain('bloco_repetido')
    expect(JSON.stringify(documento)).not.toContain('campo_do_item')
  })

  it('sem listas, cada bloco vira o texto de vazio', () => {
    const { documento } = preencherModelo(modeloResumoParaOCliente(), {})
    expect(texto(documento)).toContain('Nenhuma entrega concluída no mês.')
  })
})

describe('blocos repetíveis no modelo', () => {
  const comBloco = (lista: string, chave: string): NoDoDocumento => ({
    type: 'doc',
    content: [
      {
        type: 'bloco_repetido',
        attrs: { lista },
        content: [{ type: 'paragraph', content: [{ type: 'campo_do_item', attrs: { chave } }] }],
      },
    ],
  })

  it('recusa lista desconhecida, campo que a lista não tem e bloco dentro de bloco', () => {
    expect(problemaDoConteudo(comBloco('entregas', 'titulo'))).toBeNull()
    expect(problemaDoConteudo(comBloco('salarios', 'titulo'))).toBe('campo_desconhecido')
    expect(problemaDoConteudo(comBloco('entregas', 'horas'))).toBe('campo_desconhecido')
    const aninhado: NoDoDocumento = {
      type: 'doc',
      content: [
        {
          type: 'bloco_repetido',
          attrs: { lista: 'entregas' },
          content: [comBloco('licencas', 'titulo')],
        },
      ],
    }
    expect(problemaDoConteudo(aninhado)).toBe('campo_desconhecido')
  })

  it('campo do item fora de bloco é recusado e, ao preencher, some', () => {
    const solto: NoDoDocumento = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'campo_do_item', attrs: { chave: 'titulo' } }] },
      ],
    }
    expect(problemaDoConteudo(solto)).toBe('campo_desconhecido')
    expect(preencherModelo(solto, {}).documento.content?.[0]?.content).toEqual([])
  })

  it('bloco sem itens usa o texto padrão quando não traz o seu', () => {
    const { documento } = preencherModelo(comBloco('entregas', 'titulo'), {}, { entregas: [] })
    expect(texto(documento)).toBe('Nada no período.\n')
  })
})
