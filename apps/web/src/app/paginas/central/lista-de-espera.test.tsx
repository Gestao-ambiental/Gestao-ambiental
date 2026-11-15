// Lista de espera na central (ADR-0032): o operador vê quem se cadastrou pelo site, com o link
// para responder; lista vazia e recusa do banco têm o próprio estado.
import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderizarApp } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const operador = sessaoDe('kadu@grama.test', 'Kadu Operador')

function cenario(rpc: Cenario['rpc']): Cenario {
  return {
    sessao: operador,
    doisFatores: { nivel: 'aal2', fatores: [{ id: 'f1', status: 'verified' }] },
    rpc: { sou_operador: { data: true }, ...rpc },
  }
}

describe('Central: lista de espera (ADR-0032)', () => {
  it('mostra nome, contato com link e a data do cadastro', async () => {
    falso.reiniciar(
      cenario({
        central_lista_de_espera: {
          data: [
            {
              id: 'l1',
              nome: 'João Lima',
              contato: '5547999991234',
              tipo_contato: 'whatsapp',
              criada_em: '2026-11-15T13:30:00Z',
              total: 2,
            },
            {
              id: 'l2',
              nome: 'Marina Souza',
              contato: 'marina@exemplo.test',
              tipo_contato: 'email',
              criada_em: '2026-11-14T12:00:00Z',
              total: 2,
            },
          ],
        },
      }),
    )
    renderizarApp('/admin/lista-de-espera')

    const whats = await screen.findByRole('link', { name: '+55 (47) 99999-1234' })
    expect(whats).toHaveAttribute('href', 'https://wa.me/5547999991234')
    expect(screen.getByRole('link', { name: 'marina@exemplo.test' })).toHaveAttribute(
      'href',
      'mailto:marina@exemplo.test',
    )
    const linhaJoao = screen.getByRole('row', { name: /João Lima/ })
    expect(within(linhaJoao).getByText('15/11/2026 às 10:30')).toBeInTheDocument()
    expect(screen.getByText('2 pessoas')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Central' })).toHaveTextContent('Lista de espera')
  })

  it('lista vazia tem o próprio estado', async () => {
    falso.reiniciar(cenario({ central_lista_de_espera: { data: [] } }))
    renderizarApp('/admin/lista-de-espera')
    expect(await screen.findByText('Ninguém na lista de espera ainda')).toBeInTheDocument()
  })

  it('erro do banco mostra o estado de erro', async () => {
    falso.reiniciar(cenario({ central_lista_de_espera: { error: { message: 'falhou' } } }))
    renderizarApp('/admin/lista-de-espera')
    expect(
      await screen.findByText('Não foi possível carregar a lista de espera.'),
    ).toBeInTheDocument()
  })
})
