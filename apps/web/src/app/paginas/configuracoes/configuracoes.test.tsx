// Configurações com abas (ADR-0041): título único, abas de rota, aba Orçamentos pelo plano, lista
// no celular e "sem permissão" para a Equipe.
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe } from '@/test/supabase-falso'

import {
  ABAS_DE_CONFIGURACOES,
  abaDoCaminho,
  abasDeConfiguracoesVisiveis,
} from './abas-de-configuracoes'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

function cenario(papel: 'gestao' | 'equipe', orcamentos = true) {
  falso.reiniciar({
    sessao:
      papel === 'gestao'
        ? sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp')
        : sessaoDe('ana@filtroville.test', 'Ana Ribeiro'),
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', papel)] },
      recurso_liberado: (args) => ({
        data: args.p_recurso === 'orcamentos' ? orcamentos : false,
      }),
    },
  })
}

function simularCelular() {
  vi.stubGlobal('matchMedia', (consulta: string) => ({
    matches: consulta.includes('max-width'),
    media: consulta,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
}

/** Link de uma aba (o menu principal também tem "Orçamentos"). */
const aba = async (nome: string) =>
  within(await screen.findByRole('navigation', { name: 'Configurações' })).findByRole('link', {
    name: nome,
  })

const abasDaTela = () =>
  within(screen.getByRole('navigation', { name: 'Configurações' }))
    .getAllByRole('link')
    .map((link) => link.textContent)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Configurações', () => {
  it('título único, abas logo abaixo com a atual marcada e a ação da aba à direita', async () => {
    cenario('gestao')
    const { container } = renderizarApp('/configuracoes/equipe')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Configurações' }),
    ).toBeInTheDocument()
    await aba('Orçamentos')
    expect(abasDaTela()).toEqual([
      'Equipe',
      'Plano e cobrança',
      'Orçamentos',
      'Modelos',
      'Vencimentos',
    ])
    const abas = screen.getByRole('navigation', { name: 'Configurações' })
    expect(within(abas).getByRole('link', { name: 'Equipe' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('button', { name: 'Convidar pessoa' })).toBeInTheDocument()
    // A aba Importar chega com o pacote seguinte; aqui não aparece.
    expect(within(abas).queryByRole('link', { name: 'Importar' })).not.toBeInTheDocument()
    // O menu principal marca Configurações em qualquer aba.
    const menu = screen.getByRole('navigation', { name: 'Menu principal' })
    expect(within(menu).getByRole('link', { name: 'Configurações' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })

  it('a aba Orçamentos junta Custos e taxas e Dados da proposta num segmentado', async () => {
    cenario('gestao')
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/configuracoes/custos')

    expect(await aba('Orçamentos')).toHaveAttribute('aria-current', 'page')
    const secoes = screen.getByRole('group', { name: 'Orçamentos' })
    expect(within(secoes).getByRole('button', { name: 'Custos e taxas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await usuario.click(within(secoes).getByRole('button', { name: 'Dados da proposta' }))
    // A rota é carregada sob demanda: espera a tela nova chegar.
    await waitFor(() => {
      expect(
        within(screen.getByRole('group', { name: 'Orçamentos' })).getByRole('button', {
          name: 'Dados da proposta',
        }),
      ).toHaveAttribute('aria-pressed', 'true')
    })
    expect(router.state.location.pathname).toBe('/configuracoes/proposta')
    expect(await aba('Orçamentos')).toHaveAttribute('aria-current', 'page')
  })

  it('sem orçamentos no plano, a aba Orçamentos some', async () => {
    cenario('gestao', false)
    renderizarApp('/configuracoes/modelos')
    expect(await aba('Modelos')).toHaveAttribute('aria-current', 'page')
    // A resposta do plano chega depois; a aba não aparece em nenhum momento.
    await new Promise((resolver) => setTimeout(resolver, 50))
    expect(abasDaTela()).toEqual(['Equipe', 'Plano e cobrança', 'Modelos', 'Vencimentos'])
  })

  it('/configuracoes no desktop abre a primeira aba', async () => {
    cenario('gestao')
    const { router } = renderizarApp('/configuracoes')
    await screen.findByRole('button', { name: 'Convidar pessoa' })
    expect(router.state.location.pathname).toBe('/configuracoes/equipe')
  })

  it('/configuracoes no celular mostra as abas como lista e cada item abre a aba', async () => {
    simularCelular()
    cenario('gestao')
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/configuracoes')

    const lista = await screen.findByRole('navigation', { name: 'Configurações' })
    await within(lista).findByRole('link', { name: 'Orçamentos' })
    expect(
      within(lista)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Equipe', 'Plano e cobrança', 'Orçamentos', 'Modelos', 'Vencimentos'])
    expect(router.state.location.pathname).toBe('/configuracoes')

    await usuario.click(within(lista).getByRole('link', { name: 'Plano e cobrança' }))
    expect(router.state.location.pathname).toBe('/configuracoes/plano')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Configurações' }),
    ).toBeInTheDocument()
  })

  it('a Equipe vê "sem permissão" em /configuracoes e nenhuma aba nas abas', async () => {
    cenario('equipe')
    const { router } = renderizarApp('/configuracoes')
    expect(
      await screen.findByRole('heading', { name: 'Você não tem acesso a esta área' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Configurações' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Configurações' })).not.toBeInTheDocument()

    await act(() => router.navigate('/configuracoes/equipe'))
    expect(
      await screen.findByRole('heading', { name: 'Você não tem acesso a esta área' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Configurações' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Convidar pessoa' })).not.toBeInTheDocument()
  })
})

describe('lista das abas de Configurações', () => {
  it('cada caminho acha a aba dona, inclusive seção e detalhe', () => {
    expect(abaDoCaminho('/configuracoes/equipe')?.rotulo).toBe('Equipe')
    expect(abaDoCaminho('/configuracoes/proposta')?.rotulo).toBe('Orçamentos')
    expect(abaDoCaminho('/configuracoes/modelos/md1')?.rotulo).toBe('Modelos')
    expect(abaDoCaminho('/configuracoes/vencimentos')?.rotulo).toBe('Vencimentos')
    expect(abaDoCaminho('/configuracoes')).toBeUndefined()
    expect(abaDoCaminho('/configuracoes/equipe-x')).toBeUndefined()
  })

  it('aba nova entra com uma linha e aparece conforme o recurso', () => {
    const comImportar = [
      ...ABAS_DE_CONFIGURACOES,
      { para: '/configuracoes/importar', rotulo: 'Importar', icone: 'upload' as const },
    ]
    expect(abasDeConfiguracoesVisiveis(new Set(), comImportar).map((a) => a.rotulo)).toEqual([
      'Equipe',
      'Plano e cobrança',
      'Modelos',
      'Vencimentos',
      'Importar',
    ])
    expect(
      abasDeConfiguracoesVisiveis(new Set(['orcamentos']), comImportar).map((a) => a.rotulo),
    ).toContain('Orçamentos')
  })
})
