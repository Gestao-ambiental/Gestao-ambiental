import { describe, expect, it } from 'vitest'

import { ITENS_NAVEGACAO } from '../navegacao'
import { ABAS_DE_CONFIGURACOES } from '../paginas/configuracoes/abas-de-configuracoes'
import { ATALHOS_DA_BUSCA, atalhosVisiveis } from './atalhos'

const rotulos = (atalhos: readonly { rotulo: string }[]) => atalhos.map((a) => a.rotulo)

describe('atalhos do Ctrl+K (ADR-0041)', () => {
  it('trazem todo item do menu, a Triagem, cada aba de Configurações, Perfil e Segurança', () => {
    const destinos = new Set(ATALHOS_DA_BUSCA.map((a) => a.para))
    for (const item of ITENS_NAVEGACAO) expect(destinos).toContain(item.para)
    for (const aba of ABAS_DE_CONFIGURACOES) {
      for (const secao of aba.secoes ?? [aba]) expect(destinos).toContain(secao.para)
    }
    expect(destinos).toContain('/triagem')
    expect(destinos).toContain('/perfil')
    expect(destinos).toContain('/seguranca')
  })

  it('não repetem destino', () => {
    const destinos = ATALHOS_DA_BUSCA.map((a) => a.para)
    expect(new Set(destinos).size).toBe(destinos.length)
  })

  it('a Gestão vê Configurações, as abas e as ações; os de orçamento só com o recurso', () => {
    const semOrcamentos = rotulos(atalhosVisiveis('gestao', new Set()))
    expect(semOrcamentos).toEqual(
      expect.arrayContaining([
        'Triagem de licenciamento',
        'Painel',
        'Configurações',
        'Equipe',
        'Plano e cobrança',
        'Modelos de documento',
        'Importar planilha',
        'Cadastrar licença',
        'Novo modelo de documento',
      ]),
    )
    expect(semOrcamentos).not.toContain('Custos e taxas')
    expect(semOrcamentos).not.toContain('Dados da proposta')
    expect(semOrcamentos).not.toContain('Novo orçamento')

    const comOrcamentos = rotulos(atalhosVisiveis('gestao', new Set(['orcamentos'])))
    expect(comOrcamentos).toEqual(
      expect.arrayContaining(['Custos e taxas', 'Dados da proposta', 'Novo orçamento']),
    )
  })

  it('o Planejamento, fora do menu, só aparece para a Gestão com capacidade no plano', () => {
    expect(rotulos(atalhosVisiveis('gestao', new Set()))).not.toContain('Planejamento')
    expect(rotulos(atalhosVisiveis('gestao', new Set(['capacidade'])))).toContain('Planejamento')
    expect(rotulos(atalhosVisiveis('equipe', new Set(['capacidade'])))).not.toContain(
      'Planejamento',
    )
  })

  it('a Equipe vê o trabalho, a Triagem e a conta; nada da Gestão, mesmo com o recurso', () => {
    const daEquipe = rotulos(atalhosVisiveis('equipe', new Set(['orcamentos', 'capacidade'])))
    expect(daEquipe).toEqual([
      'Minha semana',
      'Visão da equipe',
      'Calendário',
      'Empreendimentos',
      'Acompanhamentos',
      'Campo',
      'Resíduos',
      'Triagem de licenciamento',
      'Meu perfil',
      'Segurança',
    ])
  })
})
