import { describe, expect, it } from 'vitest'
import {
  camposUsados,
  nomeDoArquivoDoRelatorio,
  preencherModelo,
  problemaDoConteudo,
  valoresDoRelatorio,
  type NoDoDocumento,
} from './modelo-documento'

const modelo: NoDoDocumento = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [
        { type: 'text', text: 'Relatório da ' },
        { type: 'campo', attrs: { chave: 'condicionante.codigo' }, marks: [{ type: 'bold' }] },
      ],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'campo', attrs: { chave: 'empreendimento.nome' } },
        { type: 'text', text: ', licença ' },
        { type: 'campo', attrs: { chave: 'licenca.numero' } },
        { type: 'text', text: ', válida até ' },
        { type: 'campo', attrs: { chave: 'licenca.validade' } },
        { type: 'text', text: '. ' },
        { type: 'campo', attrs: { chave: 'empreendimento.nome' } },
      ],
    },
  ],
}

describe('preencherModelo', () => {
  it('troca os campos pelos valores e mantém as marcas', () => {
    const { documento, semValor } = preencherModelo(modelo, {
      'condicionante.codigo': '4.1',
      'empreendimento.nome': 'Fazenda Boa Vista',
      'licenca.numero': 'LAO 4821/2023',
      'licenca.validade': '10/03/2028',
    })
    expect(semValor).toEqual([])
    expect(documento.content?.[0]?.content?.[1]).toEqual({
      type: 'text',
      text: '4.1',
      marks: [{ type: 'bold' }],
    })
    const paragrafo = documento.content?.[1]?.content?.map((n) => n.text).join('')
    expect(paragrafo).toBe(
      'Fazenda Boa Vista, licença LAO 4821/2023, válida até 10/03/2028. Fazenda Boa Vista',
    )
  })

  it('campo sem valor sai como [Rótulo] e é listado uma vez', () => {
    const { documento, semValor } = preencherModelo(modelo, { 'empreendimento.nome': '  ' })
    expect(semValor).toEqual([
      'condicionante.codigo',
      'empreendimento.nome',
      'licenca.numero',
      'licenca.validade',
    ])
    expect(documento.content?.[1]?.content?.[0]?.text).toBe('[Nome do empreendimento]')
  })

  it('não altera o modelo recebido', () => {
    const antes = JSON.stringify(modelo)
    preencherModelo(modelo, { 'empreendimento.nome': 'X' })
    expect(JSON.stringify(modelo)).toBe(antes)
  })

  it('descarta campo com chave desconhecida', () => {
    const { documento } = preencherModelo(
      {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'campo', attrs: { chave: 'x' } }] }],
      },
      {},
    )
    expect(documento.content?.[0]?.content).toEqual([])
  })
})

describe('problemaDoConteudo', () => {
  it('aceita o modelo válido', () => {
    expect(problemaDoConteudo(modelo)).toBeNull()
  })
  it('recusa raiz que não é doc e árvore malformada', () => {
    expect(problemaDoConteudo({ type: 'paragraph' })).toBe('formato')
    expect(problemaDoConteudo({ type: 'doc', content: [{ text: 'sem tipo' }] })).toBe('formato')
    expect(problemaDoConteudo(null)).toBe('formato')
  })
  it('recusa campo desconhecido e conteúdo grande demais', () => {
    expect(
      problemaDoConteudo({ type: 'doc', content: [{ type: 'campo', attrs: { chave: 'cpf' } }] }),
    ).toBe('campo_desconhecido')
    expect(
      problemaDoConteudo({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a'.repeat(500_001) }] }],
      }),
    ).toBe('grande_demais')
  })
})

describe('camposUsados', () => {
  it('lista na ordem, sem repetir', () => {
    expect(camposUsados(modelo)).toEqual([
      'condicionante.codigo',
      'empreendimento.nome',
      'licenca.numero',
      'licenca.validade',
    ])
  })
})

describe('valoresDoRelatorio', () => {
  it('formata datas e CNPJ e omite o que falta', () => {
    const valores = valoresDoRelatorio({
      consultoria: 'Filtroville',
      autor: 'Ana Ribeiro',
      hoje: '2026-11-19',
      empreendimento: {
        nome: 'Fazenda Boa Vista',
        cliente: null,
        cnpj: '11222333000181',
        unidade: 'Sede',
        endereco: ' ',
      },
      licenca: {
        tipo: 'LAO',
        numero: '4821/2023',
        orgao: 'IMA',
        emissao: '2023-03-10',
        validade: null,
      },
      condicionante: null,
    })
    expect(valores).toEqual({
      'empreendimento.nome': 'Fazenda Boa Vista',
      'empreendimento.cnpj': '11.222.333/0001-81',
      'empreendimento.unidade': 'Sede',
      'licenca.tipo': 'LAO',
      'licenca.numero': '4821/2023',
      'licenca.orgao': 'IMA',
      'licenca.emissao': '10/03/2023',
      'relatorio.consultoria': 'Filtroville',
      'relatorio.autor': 'Ana Ribeiro',
      'relatorio.data': '19/11/2026',
    })
  })
})

describe('nomeDoArquivoDoRelatorio', () => {
  it('junta modelo e empreendimento e limpa caracteres proibidos', () => {
    expect(nomeDoArquivoDoRelatorio('Relatório: semestral', 'Posto A/B')).toBe(
      'Relatório semestral - Posto A B.docx',
    )
    expect(nomeDoArquivoDoRelatorio('  ', null)).toBe('Relatório.docx')
  })
})
