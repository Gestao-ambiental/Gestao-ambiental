// Configurações › IA (ADR-0061): a conferência de relatórios por IA vem desligada; a Gestão liga
// depois de confirmar o que vai ao provedor, e desliga com um clique. A aba só aparece no plano com
// IA; a Equipe vê "sem permissão"; erro do banco aparece; o motivo novo aparece na conferência.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { describe, expect, it, vi } from 'vitest'

import { situacaoDaConferencia } from '@/app/conferencia/rotulos'
import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const DESLIGADA = [
  {
    finalidade: 'conferencia_relatorio',
    autorizada: false,
    decidida_em: null,
    decidida_por_nome: null,
  },
]
const LIGADA = [
  {
    finalidade: 'conferencia_relatorio',
    autorizada: true,
    decidida_em: '2026-11-20T13:00:00Z',
    decidida_por_nome: 'Eduardo Karnopp',
  },
]

function cenario(
  papel: 'gestao' | 'equipe',
  situacao: unknown[] = DESLIGADA,
  rpc: Cenario['rpc'] = {},
  ia = true,
): Cenario {
  return {
    sessao: sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp'),
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', papel)] },
      recurso_liberado: (args) => ({ data: args.p_recurso === 'ia' ? ia : false }),
      autorizacao_ia_atual: { data: situacao },
      definir_autorizacao_ia: (args) => ({ data: args.p_autorizada }),
      ...rpc,
    },
  }
}

async function secao() {
  return screen.findByRole('region', { name: 'Conferência de relatórios por IA' })
}

describe('Configurações › IA', () => {
  it('vem desligada, mostra o que vai à IA e liga só depois de confirmar', async () => {
    falso.reiniciar(cenario('gestao'))
    const usuario = userEvent.setup()
    const { container } = renderizarApp('/configuracoes/ia')
    const regiao = await secao()
    expect(within(regiao).getByText('Desligada')).toBeInTheDocument()
    expect(within(regiao).getByText('CPF, e-mail e telefone')).toBeInTheDocument()
    const abas = screen.getByRole('navigation', { name: 'Configurações' })
    expect(within(abas).getByRole('link', { name: 'IA' })).toHaveAttribute('aria-current', 'page')

    await usuario.click(within(regiao).getByRole('button', { name: 'Ligar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Ligar a conferência por IA?' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('definir_autorizacao_ia', expect.anything())

    await usuario.click(within(regiao).getByRole('button', { name: 'Ligar' }))
    await usuario.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Ligar e autorizar o envio',
      }),
    )
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('definir_autorizacao_ia', {
        p_consultoria_id: expect.any(String) as unknown,
        p_finalidade: 'conferencia_relatorio',
        p_autorizada: true,
      })
    })
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations).toEqual([])
  })

  it('ligada: mostra quem ligou e quando, e desliga sem confirmar', async () => {
    falso.reiniciar(cenario('gestao', LIGADA))
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/ia')
    const regiao = await secao()
    expect(within(regiao).getAllByText('Ligada').length).toBeGreaterThan(0)
    expect(within(regiao).getByText(/por Eduardo Karnopp em 20\/11\/2026/)).toBeInTheDocument()
    await usuario.click(within(regiao).getByRole('button', { name: 'Desligar' }))
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'definir_autorizacao_ia',
        expect.objectContaining({ p_autorizada: false }),
      )
    })
  })

  it('erro ao ligar aparece no diálogo', async () => {
    falso.reiniciar(
      cenario('gestao', DESLIGADA, {
        definir_autorizacao_ia: {
          error: { code: '42501', message: 'consultoria_somente_leitura' },
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/ia')
    await usuario.click(within(await secao()).getByRole('button', { name: 'Ligar' }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Ligar e autorizar o envio' }))
    expect(await within(dialogo).findByRole('alert')).toBeInTheDocument()
  })

  it('erro ao carregar mostra o estado de erro', async () => {
    falso.reiniciar(
      cenario('gestao', DESLIGADA, {
        autorizacao_ia_atual: { error: { code: '08006', message: 'rede' } },
      }),
    )
    renderizarApp('/configuracoes/ia')
    expect(await screen.findByRole('button', { name: /tentar de novo/i })).toBeInTheDocument()
  })

  it('a Equipe vê "sem permissão" e não lê a situação', async () => {
    falso.reiniciar(cenario('equipe'))
    renderizarApp('/configuracoes/ia')
    expect(
      await screen.findByRole('heading', { name: 'Você não tem acesso a esta área' }),
    ).toBeInTheDocument()
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('autorizacao_ia_atual', expect.anything())
  })

  it('plano sem IA: a aba não aparece', async () => {
    falso.reiniciar(cenario('gestao', DESLIGADA, {}, false))
    renderizarApp('/configuracoes/equipe')
    const abas = await screen.findByRole('navigation', { name: 'Configurações' })
    await waitFor(() => {
      expect(within(abas).getAllByRole('link').length).toBeGreaterThan(1)
    })
    expect(within(abas).queryByRole('link', { name: 'IA' })).toBeNull()
  })

  it('conferência sem a autorização diz que a Gestão não ligou', () => {
    expect(
      situacaoDaConferencia(false, { situacao: 'falhou', motivo: 'ia_nao_autorizada' }, 1),
    ).toBe('Não conferido pela IA: a Gestão não ligou a conferência por IA (Configurações › IA)')
  })
})
