// Lista de espera na central (ADR-0032 e ADR-0034): o operador vê quem se cadastrou pelo site, com
// o link para responder, marca contatado e convida para o beta; lista vazia e recusa do banco têm o
// próprio estado.
import { FunctionsHttpError } from '@supabase/supabase-js'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderizarApp } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const operador = sessaoDe('kadu@grama.test', 'Kadu Operador')

function cenario(rpc: Cenario['rpc'], funcoes?: Cenario['funcoes']): Cenario {
  return {
    sessao: operador,
    doisFatores: { nivel: 'aal2', fatores: [{ id: 'f1', status: 'verified' }] },
    rpc: { sou_operador: { data: true }, ...rpc },
    funcoes,
  }
}

const LINHAS = [
  {
    id: 'l1',
    nome: 'João Lima',
    contato: '5547999991234',
    tipo_contato: 'whatsapp',
    criada_em: '2026-11-15T13:30:00Z',
    contatado_em: null,
    convidado_em: null,
    total: 2,
  },
  {
    id: 'l2',
    nome: 'Marina Souza',
    contato: 'marina@exemplo.test',
    tipo_contato: 'email',
    criada_em: '2026-11-14T12:00:00Z',
    contatado_em: '2026-11-14T15:00:00Z',
    convidado_em: null,
    total: 2,
  },
]

describe('Central: lista de espera (ADR-0032)', () => {
  it('mostra nome, contato com link e a data do cadastro', async () => {
    falso.reiniciar(
      cenario({
        central_lista_de_espera: {
          data: LINHAS,
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

  it('marcar contatado chama o banco e o filtro pede só os pendentes', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(
      cenario({
        central_lista_de_espera: { data: LINHAS },
        central_marcar_contatado: { data: null },
      }),
    )
    renderizarApp('/admin/lista-de-espera')

    const marina = await screen.findByRole('checkbox', { name: 'Contatado: Marina Souza' })
    expect(marina).toBeChecked()
    await usuario.click(screen.getByRole('checkbox', { name: 'Contatado: João Lima' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith('central_marcar_contatado', {
      p_id: 'l1',
      p_contatado: true,
    })

    await usuario.click(screen.getByRole('checkbox', { name: 'Só quem falta contatar' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'central_lista_de_espera',
      expect.objectContaining({ p_so_pendentes: true }),
    )
  })

  it('convite por e-mail passa pela função e confirma o envio', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(
      cenario(
        { central_lista_de_espera: { data: LINHAS } },
        { 'convidar-da-lista-de-espera': { data: { enviado: true } } },
      ),
    )
    renderizarApp('/admin/lista-de-espera')

    await usuario.click(await screen.findByRole('button', { name: 'Convidar: Marina Souza' }))
    expect(falso.cliente.functions.invoke).toHaveBeenCalledWith('convidar-da-lista-de-espera', {
      body: { id: 'l2' },
    })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Convite enviado para marina@exemplo.test.',
    )
  })

  it('convite por WhatsApp abre a conversa com a mensagem e registra no banco', async () => {
    const usuario = userEvent.setup()
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null)
    falso.reiniciar(
      cenario({
        central_lista_de_espera: { data: LINHAS },
        central_registrar_convite: { data: [] },
      }),
    )
    renderizarApp('/admin/lista-de-espera')

    await usuario.click(await screen.findByRole('button', { name: 'Convidar: João Lima' }))
    const url = String(abrir.mock.calls[0]?.[0])
    expect(url.startsWith('https://wa.me/5547999991234?text=')).toBe(true)
    expect(decodeURIComponent(url)).toContain('/criar-conta')
    expect(falso.cliente.rpc).toHaveBeenCalledWith('central_registrar_convite', { p_id: 'l1' })
    expect(falso.cliente.functions.invoke).not.toHaveBeenCalled()
    abrir.mockRestore()
  })

  it('falha no envio do convite aparece traduzida', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(
      cenario(
        { central_lista_de_espera: { data: LINHAS } },
        {
          'convidar-da-lista-de-espera': {
            error: new FunctionsHttpError(
              new Response(JSON.stringify({ erro: 'configuracao_ausente' }), { status: 503 }),
            ),
          },
        },
      ),
    )
    renderizarApp('/admin/lista-de-espera')

    await usuario.click(await screen.findByRole('button', { name: 'Convidar: Marina Souza' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O envio de e-mail não está configurado.',
    )
  })
})
