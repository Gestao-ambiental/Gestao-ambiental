import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const eduardo = sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp')

function alvara(id: string, numero: string, validade: string, anterior: string | null = null) {
  return {
    id,
    row_version: 1,
    unidade_id: 'u1',
    numero,
    orgao: 'Prefeitura de Joinville',
    notas: null,
    validade,
    anterior_id: anterior,
    unidade: { nome: 'Matriz' },
    documento: {
      versao: { caminho: `c-Filtroville/alvara/${id}.pdf`, nome_original: `${id}.pdf` },
    },
  }
}

function cenario(papel: 'gestao' | 'equipe', alvaras: unknown[] = []): Cenario {
  return {
    sessao: eduardo,
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', papel)] },
      registrar_alvara: { data: 'novo' },
      excluir_alvara: { data: null },
    },
    tabelas: {
      empreendimento: [{ id: 'e1', nome: 'Padaria Boa Vista', cnpj: null, cliente: null }],
      unidade: [{ id: 'u1', nome: 'Matriz', endereco: null }],
      alvara: alvaras,
    },
  }
}

describe('alvarás do empreendimento (ALV-01 e ALV-02)', () => {
  beforeEach(() => {
    falso.reiniciar(
      cenario('gestao', [
        alvara('a2', '2200/2027', '2999-05-31', 'a1'),
        alvara('a1', '1234/2026', '2026-05-31'),
      ]),
    )
  })

  it('mostra o vigente e guarda o renovado, que não se renova de novo', async () => {
    renderizarApp('/empreendimentos/e1')

    const secao = await screen.findByRole('region', { name: 'Alvarás' })
    expect(await within(secao).findByText('Alvará 2200/2027')).toBeInTheDocument()
    expect(within(secao).getByText('Alvará 1234/2026')).toBeInTheDocument()
    expect(within(secao).getByText('Vigente')).toBeInTheDocument()
    expect(within(secao).getByText('Renovado')).toBeInTheDocument()
    expect(
      within(secao).getByRole('button', { name: 'Renovar Alvará 2200/2027' }),
    ).toBeInTheDocument()
    expect(
      within(secao).queryByRole('button', { name: 'Renovar Alvará 1234/2026' }),
    ).not.toBeInTheDocument()
    expect(
      within(secao).getByRole('button', { name: 'Abrir PDF do Alvará 1234/2026' }),
    ).toBeInTheDocument()
  })

  it('renovar exige validade e PDF e manda o anterior junto', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/empreendimentos/e1')

    await usuario.click(await screen.findByRole('button', { name: 'Renovar Alvará 2200/2027' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Renovar alvará' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar alvará' }))
    expect(within(dialogo).getByText('Informe a validade')).toBeInTheDocument()
    expect(within(dialogo).getByText('Anexe o PDF do alvará')).toBeInTheDocument()

    await usuario.type(within(dialogo).getByLabelText('Validade *'), '31/05/2028')
    await usuario.type(within(dialogo).getByLabelText('Número'), '3100/2028')
    const entrada = document.querySelector<HTMLInputElement>('[data-testid="pdf-do-alvara"]')
    if (!entrada) throw new Error('campo de arquivo ausente')
    await usuario.upload(
      entrada,
      new File(['%PDF-1.4 alvara'], 'alvara-2028.pdf', { type: 'application/pdf' }),
    )
    expect(await within(dialogo).findByText('alvara-2028.pdf')).toBeInTheDocument()
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar alvará' }))

    await vi.waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'registrar_alvara',
        expect.objectContaining({
          p_unidade_id: 'u1',
          p_validade: '2028-05-31',
          p_numero: '3100/2028',
          p_orgao: 'Prefeitura de Joinville',
          p_anterior_id: 'a2',
          p_nome_original: 'alvara-2028.pdf',
          p_caminho: expect.stringMatching(/^c-Filtroville\/alvara\/[0-9a-f-]+\.pdf$/) as unknown,
        }) as unknown,
      )
    })
  })

  it('a Equipe vê os alvarás, mas não cadastra, renova nem exclui', async () => {
    falso.reiniciar(cenario('equipe', [alvara('a1', '1234/2026', '2999-05-31')]))
    renderizarApp('/empreendimentos/e1')

    const secao = await screen.findByRole('region', { name: 'Alvarás' })
    expect(await within(secao).findByText('Alvará 1234/2026')).toBeInTheDocument()
    expect(within(secao).queryByRole('button', { name: 'Novo alvará' })).not.toBeInTheDocument()
    expect(within(secao).queryByRole('button', { name: /^Renovar/ })).not.toBeInTheDocument()
    expect(within(secao).queryByRole('button', { name: /^Excluir/ })).not.toBeInTheDocument()
  })

  it('sem alvará, diz que não há nenhum', async () => {
    falso.reiniciar(cenario('gestao'))
    renderizarApp('/empreendimentos/e1')
    expect(await screen.findByText('Nenhum alvará cadastrado.')).toBeInTheDocument()
  })
})
