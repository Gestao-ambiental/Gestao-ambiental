// Relatório mensal ao cliente (P6, ADR-0052): só a Gestão vê a ação; escolhe o mês, baixa o .docx
// do "Resumo para o cliente" ou abre no editor; o erro do banco aparece.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const eduardo = sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp')

const dados = {
  consultoria: 'Filtroville',
  autor: 'Eduardo Karnopp',
  hoje: '2026-11-21',
  mes: '2026-10-01',
  empreendimento: { nome: 'Metalúrgica Rio Cubatão', cliente: null, cnpj: null },
  licencas: [{ titulo: 'LAO 4821/2023', orgao: 'IMA', validade: '2027-03-10' }],
  entregas: [],
  protocolos: [],
  proximos: [],
}

function cenario(papel: 'gestao' | 'equipe', rpc: Cenario['rpc'] = {}): Cenario {
  return {
    sessao: eduardo,
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', papel)] },
      dados_para_relatorio_mensal: { data: dados },
      ...rpc,
    },
    tabelas: {
      relatorio: [],
      empreendimento: [{ id: 'e1', nome: 'Metalúrgica Rio Cubatão', cnpj: null, cliente: null }],
      unidade: [],
      modelo_documento: [],
    },
  }
}

let baixados: string[] = []

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-21T12:00:00-03:00') })
  falso.reiniciar(cenario('gestao'))
  baixados = []
  URL.createObjectURL = vi.fn(() => 'blob:relatorio')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    baixados.push(this.download)
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function abrir() {
  const usuario = userEvent.setup()
  renderizarApp('/empreendimentos/e1')
  await usuario.click(await screen.findByRole('button', { name: 'Mais ações' }))
  await usuario.click(await screen.findByRole('menuitem', { name: 'Gerar relatório do mês' }))
  const dialogo = await screen.findByRole('dialog', { name: 'Relatório do mês' })
  return { usuario, dialogo }
}

describe('relatório do mês ao cliente', () => {
  it('vem no mês anterior e baixa o .docx do mês escolhido', async () => {
    const { usuario, dialogo } = await abrir()
    const mes = within(dialogo).getByRole('combobox', { name: 'Mês' })
    expect(mes).toHaveValue('2026-10-01')
    await usuario.selectOptions(mes, '2026-09-01')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Baixar .docx' }))
    await waitFor(() => {
      expect(baixados).toEqual([
        'Resumo para o cliente - setembro de 2026 - Metalúrgica Rio Cubatão.docx',
      ])
    })
    expect(falso.cliente.rpc).toHaveBeenCalledWith('dados_para_relatorio_mensal', {
      p_empreendimento_id: 'e1',
      p_mes: '2026-09-01',
    })
  })

  it('"Escrever no Grama" cria o relatório preenchido, sem campos de bloco', async () => {
    falso.reiniciar(cenario('gestao', { criar_relatorio: { data: 1 } }))
    const { usuario, dialogo } = await abrir()
    await usuario.click(within(dialogo).getByRole('button', { name: 'Escrever no Grama' }))
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'criar_relatorio',
        expect.objectContaining({ p_titulo: 'Resumo para o cliente - outubro de 2026' }),
      )
    })
    const chamada = falso.cliente.rpc.mock.calls.find((c) => c[0] === 'criar_relatorio')
    const [, args] = chamada as [string, Record<string, unknown>]
    const conteudo = JSON.stringify(args.p_conteudo)
    expect(conteudo).toContain('LAO 4821/2023')
    expect(conteudo).toContain('Licenças e validades')
    expect(conteudo).not.toContain('bloco_repetido')
  })

  it('as respostas a exigências do mês entram no relatório (P3 + P6)', async () => {
    falso.reiniciar(
      cenario('gestao', {
        criar_relatorio: { data: 1 },
        dados_para_relatorio_mensal: {
          data: {
            ...dados,
            protocolos: [
              {
                data: '2026-10-14',
                titulo: 'Resposta à exigência: Ofício 45/2026 · Laudo de ruído',
                detalhe: 'PROT-797',
              },
            ],
          },
        },
      }),
    )
    const { usuario, dialogo } = await abrir()
    await usuario.click(within(dialogo).getByRole('button', { name: 'Escrever no Grama' }))
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('criar_relatorio', expect.anything())
    })
    const chamada = falso.cliente.rpc.mock.calls.find((c) => c[0] === 'criar_relatorio')
    const [, args] = chamada as [string, Record<string, unknown>]
    const conteudo = JSON.stringify(args.p_conteudo)
    expect(conteudo).toContain('14/10/2026')
    expect(conteudo).toContain('Resposta à exigência: Ofício 45/2026 · Laudo de ruído')
    expect(conteudo).toContain('PROT-797')
    expect(conteudo).not.toContain('Nenhum protocolo no mês.')
  })

  it('mostra o erro do banco e não baixa nada', async () => {
    falso.reiniciar(
      cenario('gestao', { dados_para_relatorio_mensal: { error: { message: 'sem_permissao' } } }),
    )
    const { usuario, dialogo } = await abrir()
    await usuario.click(within(dialogo).getByRole('button', { name: 'Baixar .docx' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'Você não tem permissão para esta ação.',
    )
    expect(baixados).toEqual([])
  })

  it('a Equipe não vê a ação', async () => {
    falso.reiniciar(cenario('equipe'))
    const usuario = userEvent.setup()
    renderizarApp('/empreendimentos/e1')
    await usuario.click(await screen.findByRole('button', { name: 'Mais ações' }))
    expect(await screen.findByRole('menuitem', { name: 'Gerar relatório' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Gerar relatório do mês' })).toBeNull()
  })
})
