import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const ana = sessaoDe('ana@filtroville.test', 'Ana Ribeiro')
const TITULO = 'Metalúrgica Rio Cubatão'
const ITENS_DO_MENU = [
  'Editar empreendimento',
  'Gerenciar unidades',
  'Gerar relatório',
  'Gerar relatório do mês',
  'Registrar exigência',
  'Novo orçamento',
  'Triar atividades',
]
const SO_DA_GESTAO = ['Gerar relatório do mês', 'Registrar exigência', 'Novo orçamento']
const ITENS_DA_EQUIPE = ITENS_DO_MENU.filter((item) => !SO_DA_GESTAO.includes(item))

function cenario(papel: 'gestao' | 'equipe', tabelas: Cenario['tabelas'] = {}): Cenario {
  return {
    sessao: ana,
    rpc: { meus_vinculos: { data: [vinculoFalso('Filtroville', papel)] } },
    tabelas: {
      empreendimento: [{ id: 'e1', nome: TITULO, cnpj: null, cliente: null }],
      unidade: [{ id: 'u1', nome: 'Matriz', endereco: null }],
      ...tabelas,
    },
  }
}

async function cabecalho() {
  const titulo = await screen.findByRole('heading', { level: 1, name: TITULO })
  const elemento = titulo.closest('header')
  if (!elemento) throw new Error('cabeçalho ausente')
  return elemento
}

/** Faz a leitura de `empreendimento` falhar (ou ficar pendente) e mantém o resto do falso. */
function leituraDoEmpreendimento(resposta: Promise<{ data: null; error: unknown }>) {
  const original = falso.cliente.from.getMockImplementation()
  if (!original) throw new Error('falso sem implementação de from')
  falso.cliente.from.mockImplementation((tabela: string) => {
    if (tabela !== 'empreendimento') return original(tabela)
    const construtor = {
      select: () => construtor,
      eq: () => construtor,
      maybeSingle: () => resposta,
    }
    return construtor as unknown as ReturnType<typeof original>
  })
  return original
}

describe('cabeçalho do empreendimento (uma ação principal + "…")', () => {
  let restaurar: ReturnType<typeof leituraDoEmpreendimento> | null = null
  afterEach(() => {
    if (restaurar) falso.cliente.from.mockImplementation(restaurar)
    restaurar = null
  })

  it('Gestão: só "Cadastrar licença" como ação principal; o resto no "…"', async () => {
    falso.reiniciar(cenario('gestao'))
    const usuario = userEvent.setup()
    renderizarApp('/empreendimentos/e1')
    const topo = await cabecalho()

    expect(within(topo).getByRole('link', { name: 'Cadastrar licença' })).toHaveAttribute(
      'href',
      '/licencas/nova?empreendimento=e1',
    )
    // Fora do menu, o cabeçalho só tem o "…" como botão (nada de Editar ou Novo relatório soltos).
    expect(
      within(topo)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Mais ações'])
    expect(screen.queryByRole('button', { name: 'Gerenciar unidades' })).not.toBeInTheDocument()

    await usuario.click(within(topo).getByRole('button', { name: 'Mais ações' }))
    const itens = await screen.findAllByRole('menuitem')
    expect(itens.map((item) => item.textContent)).toEqual(ITENS_DO_MENU)
  })

  it('Equipe: sem ação principal de Gestão; o "…" mantém o que a Equipe já fazia', async () => {
    falso.reiniciar(cenario('equipe'))
    const usuario = userEvent.setup()
    renderizarApp('/empreendimentos/e1')
    const topo = await cabecalho()

    expect(within(topo).queryByRole('link', { name: 'Cadastrar licença' })).not.toBeInTheDocument()
    await usuario.click(within(topo).getByRole('button', { name: 'Mais ações' }))
    const itens = await screen.findAllByRole('menuitem')
    expect(itens.map((item) => item.textContent)).toEqual(ITENS_DA_EQUIPE)
  })

  it('"Triar atividades" abre a triagem com o empreendimento', async () => {
    falso.reiniciar(cenario('equipe'))
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/empreendimentos/e1')
    await usuario.click(within(await cabecalho()).getByRole('button', { name: 'Mais ações' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Triar atividades' }))

    expect(router.state.location.pathname).toBe('/triagem')
    expect(router.state.location.search).toBe('?empreendimento=e1')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Triagem de licenciamento' }),
    ).toBeInTheDocument()
  })

  it('"Editar empreendimento" e "Gerar relatório" abrem os diálogos de antes', async () => {
    falso.reiniciar(cenario('gestao'))
    const usuario = userEvent.setup()
    renderizarApp('/empreendimentos/e1')
    const topo = await cabecalho()

    await usuario.click(within(topo).getByRole('button', { name: 'Mais ações' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Editar empreendimento' }))
    const edicao = await screen.findByRole('dialog', { name: 'Editar empreendimento' })
    expect(within(edicao).getByDisplayValue(TITULO)).toBeInTheDocument()
    await usuario.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await usuario.click(within(topo).getByRole('button', { name: 'Mais ações' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Gerar relatório' }))
    expect(await screen.findByRole('dialog', { name: 'Novo relatório' })).toBeInTheDocument()
  })

  it('as seções seguem a ordem de antes: Licenças antes de Alvarás', async () => {
    falso.reiniciar(cenario('gestao'))
    renderizarApp('/empreendimentos/e1')
    await cabecalho()
    await screen.findByRole('heading', { level: 2, name: 'Alvarás' })
    const titulos = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(titulos.indexOf('Licenças')).toBeGreaterThanOrEqual(0)
    expect(titulos.indexOf('Licenças')).toBeLessThan(titulos.indexOf('Alvarás'))
  })

  it('carregando: esqueleto anunciado, sem cabeçalho de ações', async () => {
    falso.reiniciar(cenario('gestao'))
    restaurar = leituraDoEmpreendimento(new Promise(() => undefined))
    renderizarApp('/empreendimentos/e1')
    expect(await screen.findByText('Carregando o empreendimento')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mais ações' })).not.toBeInTheDocument()
  })

  it('erro: mensagem e "tentar de novo", sem o "…"', async () => {
    falso.reiniciar(cenario('gestao'))
    restaurar = leituraDoEmpreendimento(
      Promise.resolve({ data: null, error: { code: '08006', message: 'rede caiu' } }),
    )
    renderizarApp('/empreendimentos/e1')
    expect(
      await screen.findByText('Não foi possível carregar o empreendimento.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /tentar de novo/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mais ações' })).not.toBeInTheDocument()
  })

  it('sem permissão: o servidor negou, a tela diz isso em vez de "erro"', async () => {
    falso.reiniciar(cenario('equipe'))
    restaurar = leituraDoEmpreendimento(
      Promise.resolve({ data: null, error: { code: '42501', message: 'permission denied' } }),
    )
    renderizarApp('/empreendimentos/e1')
    expect(await screen.findByText('Você não tem acesso a esta área')).toBeInTheDocument()
    expect(
      screen.queryByText('Não foi possível carregar o empreendimento.'),
    ).not.toBeInTheDocument()
  })

  it('vazio: de outra consultoria (ou inexistente) aparece como não encontrado, sem o "…"', async () => {
    falso.reiniciar(cenario('gestao', { empreendimento: [] }))
    renderizarApp('/empreendimentos/outro')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Empreendimento não encontrado' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mais ações' })).not.toBeInTheDocument()
  })
})
