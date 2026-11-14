import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderizarApp } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const operador = sessaoDe('cadu@grama.test', 'Cadu Operador')

function cenario(rpc: Cenario['rpc']): Cenario {
  return {
    sessao: operador,
    doisFatores: { nivel: 'aal2', fatores: [{ id: 'f1', status: 'verified' }] },
    rpc: { sou_operador: { data: true }, central_historico_parametros: { data: [] }, ...rpc },
  }
}

function chamadas(nome: string) {
  return falso.cliente.rpc.mock.calls.filter(([rpc]) => rpc === nome)
}

describe('Planos e parâmetros na central (ADR-0026)', () => {
  it('operador muda o preço do Equipe, vê antes → depois e salva com motivo', async () => {
    falso.reiniciar(cenario({ central_atualizar_plano: { data: null } }))
    const usuario = userEvent.setup()
    renderizarApp('/admin/parametros')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Planos e parâmetros' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Parâmetros' })).toBeInTheDocument()
    expect(await screen.findByText('Nenhuma mudança')).toBeInTheDocument()

    const preco = screen.getByLabelText('Preço mensal do Equipe')
    expect(preco).toHaveValue('1.290,00')
    const linha = screen.getByRole('row', { name: /Equipe/ })
    expect(within(linha).getByText('R$ 12.900,00')).toBeInTheDocument()

    await usuario.clear(preco)
    await usuario.type(preco, '1390')
    expect(preco).toHaveValue('1.390')
    expect(within(linha).getByText('R$ 13.900,00')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Salvar para as próximas cobranças' })
    expect(within(dialogo).getByText('Plano Equipe')).toBeInTheDocument()
    expect(within(dialogo).getByText('Preço mensal: R$ 1.290,00 → R$ 1.390,00')).toBeInTheDocument()
    const salvar = within(dialogo).getByRole('button', { name: 'Salvar' })
    expect(salvar).toBeDisabled()

    await usuario.type(within(dialogo).getByLabelText('Motivo'), 'Reajuste de 2027')
    await usuario.click(salvar)

    expect(await screen.findByText('Parâmetros salvos.')).toBeInTheDocument()
    expect(chamadas('central_atualizar_plano')).toHaveLength(1)
    expect(chamadas('central_atualizar_plano')[0]?.[1]).toEqual({
      p_codigo: 'equipe',
      p_nome: 'Equipe',
      p_mensal_centavos: 139000,
      p_pessoas: 10,
      p_empreendimentos: 30,
      p_orcamentos: true,
      p_ia: true,
      p_motivo: 'Reajuste de 2027',
    })
    expect(chamadas('central_atualizar_configuracao_comercial')).toHaveLength(0)
  })

  it('o banco recusa: o erro aparece no diálogo e nada some', async () => {
    falso.reiniciar(
      cenario({
        central_atualizar_configuracao_comercial: { error: { message: 'valores_invalidos' } },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/admin/parametros')

    const anual = await screen.findByLabelText('Mensalidades no anual')
    await usuario.clear(anual)
    await usuario.type(anual, '11')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText('Mensalidades no anual: 10 → 11')).toBeInTheDocument()
    await usuario.type(within(dialogo).getByLabelText('Motivo'), 'Teste')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(/Confira os valores/)
    expect(screen.queryByText('Parâmetros salvos.')).not.toBeInTheDocument()
  })
})
