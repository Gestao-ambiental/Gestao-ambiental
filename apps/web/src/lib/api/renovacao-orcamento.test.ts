// Wrappers da renovação que vira orçamento (ADR-0044): radar com horizonte e orçamento, criação do
// rascunho pela RPC, orçamento vivo da licença e atividades gravadas na licença.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { falso } from '@/test/supabase-falso'

import { gravarAtividadesNaLicenca, listarAtividadesDaLicenca } from './atividades-da-licenca'
import { criarOrcamentoDeRenovacao, listarRenovacoes, obterOrcamentoDaLicenca } from './renovacoes'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const linha = {
  id: 'p1',
  instrumento_id: 'i1',
  licenca: 'LAO 4821/2023',
  orgao: 'IMA',
  empreendimento_id: 'e1',
  empreendimento_nome: 'Metalúrgica Rio Cubatão',
  unidade_nome: 'Matriz',
  validade: '2027-03-26',
  dias_limite_protocolo: 120,
  antecedencia_dias: 30,
  protocolado_em: null,
  protocolo_numero: null,
  acompanhamento_dias: null,
  hoje: '2026-11-20',
  total: 3,
  orcamento_id: null,
  orcamento_ano: null,
  orcamento_sequencia: null,
  orcamento_revisao: null,
  orcamento_situacao: null,
}

const ERRO = { message: 'sem_permissao', code: '42501' }

beforeEach(() => {
  falso.reiniciar({})
})

describe('listarRenovacoes', () => {
  it('envia o horizonte (6 por padrão) e lê o orçamento da Gestão e da Equipe', async () => {
    falso.reiniciar({
      rpc: {
        listar_renovacoes: {
          data: [
            linha,
            {
              ...linha,
              instrumento_id: 'i2',
              orcamento_id: 'o9',
              orcamento_ano: 2026,
              orcamento_sequencia: 9,
              orcamento_revisao: 1,
              orcamento_situacao: 'rascunho',
            },
            { ...linha, instrumento_id: 'i3', orcamento_situacao: 'enviada' },
          ],
        },
      },
    })
    const pagina = await listarRenovacoes('c1', 1)
    expect(falso.cliente.rpc).toHaveBeenCalledWith('listar_renovacoes', {
      p_consultoria_id: 'c1',
      p_limite: 20,
      p_deslocamento: 20,
      p_horizonte_meses: 6,
    })
    expect(pagina.total).toBe(3)
    expect(pagina.itens.map((r) => r.orcamento)).toEqual([
      null,
      { id: 'o9', numero: 'ORC-2026-009', situacao: 'rascunho' },
      // Equipe: só a situação.
      { id: null, numero: null, situacao: 'enviada' },
    ])
  })

  it('horizonte nulo não manda o parâmetro (resultado de antes)', async () => {
    falso.reiniciar({ rpc: { listar_renovacoes: { data: [] } } })
    expect(await listarRenovacoes('c1', 0, null)).toEqual({ total: 0, itens: [] })
    expect(falso.cliente.rpc).toHaveBeenCalledWith('listar_renovacoes', {
      p_consultoria_id: 'c1',
      p_limite: 20,
      p_deslocamento: 0,
    })
  })

  it('erro do banco sobe', async () => {
    falso.reiniciar({ rpc: { listar_renovacoes: { error: ERRO } } })
    await expect(listarRenovacoes('c1', 0, 12)).rejects.toEqual(ERRO)
  })
})

describe('criarOrcamentoDeRenovacao', () => {
  it('manda a taxa em centavos e devolve o id que o banco der', async () => {
    falso.reiniciar({ rpc: { criar_orcamento_de_renovacao: { data: 'o-existente' } } })
    expect(await criarOrcamentoDeRenovacao('o-novo', 'c1', 'i1', 562079)).toBe('o-existente')
    expect(falso.cliente.rpc).toHaveBeenCalledWith('criar_orcamento_de_renovacao', {
      p_id: 'o-novo',
      p_consultoria_id: 'c1',
      p_instrumento_id: 'i1',
      p_taxa_centavos: 562079,
    })
  })

  it('taxa nula não vai (despesa a cotar)', async () => {
    falso.reiniciar({ rpc: { criar_orcamento_de_renovacao: { data: 'o-novo' } } })
    await criarOrcamentoDeRenovacao('o-novo', 'c1', 'i1', null)
    expect(falso.cliente.rpc).toHaveBeenCalledWith('criar_orcamento_de_renovacao', {
      p_id: 'o-novo',
      p_consultoria_id: 'c1',
      p_instrumento_id: 'i1',
    })
  })

  it('erro do banco sobe', async () => {
    falso.reiniciar({ rpc: { criar_orcamento_de_renovacao: { error: ERRO } } })
    await expect(criarOrcamentoDeRenovacao('o-novo', 'c1', 'i1', 0)).rejects.toEqual(ERRO)
  })
})

describe('obterOrcamentoDaLicenca', () => {
  it('lê o orçamento vivo da licença com o número', async () => {
    falso.reiniciar({
      tabelas: { orcamento: [{ id: 'o7', ano: 2026, sequencia: 7, situacao: 'negociacao' }] },
    })
    expect(await obterOrcamentoDaLicenca('i1')).toEqual({
      id: 'o7',
      numero: 'ORC-2026-007',
      situacao: 'negociacao',
    })
    expect(falso.cliente.from).toHaveBeenCalledWith('orcamento')
  })

  it('sem orçamento vivo, nulo', async () => {
    falso.reiniciar({ tabelas: { orcamento: [] } })
    expect(await obterOrcamentoDaLicenca('i1')).toBeNull()
  })
})

describe('atividades da licença', () => {
  it('lista com porte, potencial e só as medidas numéricas', async () => {
    falso.reiniciar({
      tabelas: {
        atividade_licenciada: [
          {
            id: 'a1',
            codigo: '12.80.10',
            descricao: 'Usinagem com pintura',
            porte: 'medio',
            potencial: 'M',
            medidas: { 'AU(3)': 0.5, texto: 'x' },
            fonte: 'CONSEMA 250/2024',
            registrado_em: '2026-11-19T12:00:00Z',
            row_version: 2,
          },
        ],
      },
    })
    expect(await listarAtividadesDaLicenca('i1')).toEqual([
      {
        id: 'a1',
        codigo: '12.80.10',
        descricao: 'Usinagem com pintura',
        porte: 'medio',
        potencial: 'M',
        medidas: { 'AU(3)': 0.5 },
        fonte: 'CONSEMA 250/2024',
        registradoEm: '2026-11-19T12:00:00Z',
        rowVersion: 2,
      },
    ])
    expect(falso.cliente.from).toHaveBeenCalledWith('atividade_licenciada')
  })

  it('grava pela RPC e devolve quantas a licença tem', async () => {
    falso.reiniciar({ rpc: { gravar_atividades_na_licenca: { data: 3 } } })
    const atividade = {
      codigo: '12.80.10',
      descricao: 'Usinagem com pintura',
      porte: 'medio' as const,
      potencial: 'M' as const,
      medidas: { 'AU(3)': 0.5 },
      fonte: 'CONSEMA 250/2024',
    }
    expect(await gravarAtividadesNaLicenca('c1', 'i1', [atividade])).toBe(3)
    expect(falso.cliente.rpc).toHaveBeenCalledWith('gravar_atividades_na_licenca', {
      p_consultoria_id: 'c1',
      p_instrumento_id: 'i1',
      p_atividades: [atividade],
    })
  })

  it('erro ao gravar sobe', async () => {
    const erro = { message: 'atividades_invalidas', code: '22023' }
    falso.reiniciar({ rpc: { gravar_atividades_na_licenca: { error: erro } } })
    await expect(gravarAtividadesNaLicenca('c1', 'i1', [])).rejects.toEqual(erro)
  })
})
