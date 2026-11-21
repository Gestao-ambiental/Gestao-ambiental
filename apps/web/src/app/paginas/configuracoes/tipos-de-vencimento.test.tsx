// Configurações › Vencimentos (ADR-0046): tipos de vencimento da consultoria.
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const TIPOS = [
  { id: 't-alvara', nome: 'Alvará', antecedencia_dias: 60, exige_pdf: true, ativo: true },
  { id: 't-art', nome: 'ART', antecedencia_dias: 1, exige_pdf: false, ativo: true },
  { id: 't-velho', nome: 'Licença antiga', antecedencia_dias: 90, exige_pdf: false, ativo: false },
]

function cenario(
  papel: 'gestao' | 'equipe',
  tipos: unknown[] = TIPOS,
  rpc: Cenario['rpc'] = {},
): Cenario {
  return {
    sessao: sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp'),
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', papel)] },
      recurso_liberado: { data: false },
      criar_tipo_vencimento: { data: 't-novo' },
      editar_tipo_vencimento: { data: null },
      ...rpc,
    },
    tabelas: { tipo_vencimento: tipos },
  }
}

async function quadro() {
  return screen.findByRole('table', { name: 'Tipos de vencimento' })
}

describe('tipos de vencimento (Configurações › Vencimentos)', () => {
  it('lista com antecedência, PDF obrigatório e situação por extenso', async () => {
    falso.reiniciar(cenario('gestao'))
    const { container } = renderizarApp('/configuracoes/vencimentos')
    const tabela = await quadro()
    const linhas = within(tabela).getAllByRole('row').slice(1)
    expect(linhas).toHaveLength(3)
    const [alvara, art, velho] = linhas as [HTMLElement, HTMLElement, HTMLElement]
    expect(within(alvara).getByText('60 dias')).toBeInTheDocument()
    expect(within(alvara).getByText('Sim')).toBeInTheDocument()
    expect(within(alvara).getByText('Ativo')).toBeInTheDocument()
    expect(within(art).getByText('1 dia')).toBeInTheDocument()
    expect(within(art).getByText('Não')).toBeInTheDocument()
    expect(within(velho).getByText('Desativado')).toBeInTheDocument()
    // A aba fica marcada e a ação principal é "Novo tipo".
    const abas = screen.getByRole('navigation', { name: 'Configurações' })
    expect(within(abas).getByRole('link', { name: 'Vencimentos' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('button', { name: 'Novo tipo' })).toBeInTheDocument()

    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })

  it('novo tipo: confere nome e antecedência antes de criar', async () => {
    falso.reiniciar(cenario('gestao'))
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/vencimentos')
    await quadro()
    await usuario.click(screen.getByRole('button', { name: 'Novo tipo' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo tipo de vencimento' })
    expect(within(dialogo).getByLabelText('Antecedência em dias *')).toHaveValue('60')

    const antecedencia = within(dialogo).getByLabelText('Antecedência em dias *')
    await usuario.clear(antecedencia)
    await usuario.type(antecedencia, '999')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar tipo' }))
    expect(await within(dialogo).findByText('Informe o nome')).toBeInTheDocument()
    expect(within(dialogo).getByText('Use de 0 a 730 dias')).toBeInTheDocument()
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('criar_tipo_vencimento', expect.anything())

    await usuario.type(within(dialogo).getByLabelText('Nome *'), 'Licença sanitária')
    await usuario.clear(antecedencia)
    await usuario.type(antecedencia, '45')
    await usuario.click(within(dialogo).getByLabelText('Exige PDF'))
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar tipo' }))
    await vi.waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('criar_tipo_vencimento', {
        p_consultoria_id: 'c-Filtroville',
        p_nome: 'Licença sanitária',
        p_antecedencia_dias: 45,
        p_exige_pdf: true,
      })
    })
  })

  it('editar com nome de outro tipo: o banco recusa e a tela diz por quê', async () => {
    falso.reiniciar(
      cenario('gestao', TIPOS, {
        editar_tipo_vencimento: { error: { code: 'P0001', message: 'tipo_vencimento_existente' } },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/vencimentos')
    await usuario.click(within(await quadro()).getByRole('button', { name: 'Ações de ART' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Editar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Editar ART' })
    const nome = within(dialogo).getByLabelText('Nome *')
    expect(nome).toHaveValue('ART')
    await usuario.clear(nome)
    await usuario.type(nome, 'Alvará')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar tipo' }))
    expect(await within(dialogo).findByText('Já existe um tipo com este nome.')).toBeInTheDocument()
    expect(falso.cliente.rpc).toHaveBeenCalledWith('editar_tipo_vencimento', {
      p_tipo_id: 't-art',
      p_nome: 'Alvará',
      p_antecedencia_dias: 1,
      p_exige_pdf: false,
      p_ativo: true,
    })
  })

  it('desativar e reativar mantêm o resto do tipo', async () => {
    falso.reiniciar(cenario('gestao'))
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/vencimentos')
    await usuario.click(within(await quadro()).getByRole('button', { name: 'Ações de Alvará' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Desativar' }))
    await vi.waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('editar_tipo_vencimento', {
        p_tipo_id: 't-alvara',
        p_nome: 'Alvará',
        p_antecedencia_dias: 60,
        p_exige_pdf: true,
        p_ativo: false,
      })
    })
    await usuario.click(
      within(await quadro()).getByRole('button', { name: 'Ações de Licença antiga' }),
    )
    await usuario.click(await screen.findByRole('menuitem', { name: 'Reativar' }))
    await vi.waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'editar_tipo_vencimento',
        expect.objectContaining({ p_tipo_id: 't-velho', p_ativo: true }),
      )
    })
  })

  it('vazio: estado vazio com "Novo tipo"', async () => {
    falso.reiniciar(cenario('gestao', []))
    renderizarApp('/configuracoes/vencimentos')
    const vazio = await screen.findByRole('region', { name: 'Nenhum tipo de vencimento' })
    expect(within(vazio).getByRole('button', { name: 'Novo tipo' })).toBeInTheDocument()
  })

  it('erro ao carregar: mensagem e "tentar de novo"', async () => {
    falso.reiniciar(cenario('gestao'))
    const original = falso.cliente.from.getMockImplementation()
    if (!original) throw new Error('falso sem implementação de from')
    falso.cliente.from.mockImplementation((nome: string) => {
      if (nome !== 'tipo_vencimento') return original(nome)
      const construtor = {
        select: () => construtor,
        eq: () => construtor,
        order: () => construtor,
        range: () => Promise.resolve({ data: null, error: { code: '08006', message: 'rede' } }),
      }
      return construtor as unknown as ReturnType<typeof original>
    })
    try {
      renderizarApp('/configuracoes/vencimentos')
      expect(await screen.findByRole('button', { name: /tentar de novo/i })).toBeInTheDocument()
    } finally {
      falso.cliente.from.mockImplementation(original)
    }
  })

  it('a Equipe vê "sem permissão", sem abas nem "Novo tipo"', async () => {
    falso.reiniciar(cenario('equipe'))
    renderizarApp('/configuracoes/vencimentos')
    expect(
      await screen.findByRole('heading', { name: 'Você não tem acesso a esta área' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Novo tipo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Tipos de vencimento' })).not.toBeInTheDocument()
  })
})
