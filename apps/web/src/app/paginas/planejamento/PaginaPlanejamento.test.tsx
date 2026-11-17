import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

describe('planejamento', () => {
  beforeEach(() => {
    // Hoje fixo: o cenário simulado é o ano seguinte (2027), com o pico em março.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-07-01T15:00:00Z') })
    falso.reiniciar({
      sessao: sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp'),
      rpc: {
        meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
        recurso_liberado: (args) => ({ data: args.p_recurso === 'capacidade' }),
      },
    })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('fora do plano com capacidade: sem item no menu e a tela diz que é de outro plano', async () => {
    falso.reiniciar({
      sessao: sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp'),
      rpc: {
        meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
        recurso_liberado: { data: false },
      },
    })
    renderizarApp('/planejamento')

    expect(await screen.findByText('Fora do plano atual')).toBeInTheDocument()
    expect(screen.queryByText('Cenário simulado')).not.toBeInTheDocument()
    const menu = screen.getByRole('navigation', { name: 'Menu principal' })
    expect(within(menu).queryByRole('link', { name: 'Planejamento' })).not.toBeInTheDocument()
    expect(falso.cliente.rpc).toHaveBeenCalledWith('recurso_liberado', {
      p_consultoria_id: 'c-Filtroville',
      p_recurso: 'capacidade',
    })
  })

  it('abre pelo menu e mostra o cenário simulado com carga, alertas e triagem', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/')
    const menu = await screen.findByRole('navigation', { name: 'Menu principal' })
    await usuario.click(await within(menu).findByRole('link', { name: 'Planejamento' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Planejamento' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Cenário simulado')).toBeInTheDocument()
    expect(screen.getByLabelText('Capacidade por mês (h)')).toHaveValue('900')
    expect(screen.getByLabelText('Prazos no pico')).toHaveValue('130')
    expect(screen.getByLabelText('Mês do pico')).toHaveValue('3')
    expect(
      screen.getByRole('img', {
        name: 'Carga mensal em horas, na posição recomendada e com antecipação',
      }),
    ).toBeInTheDocument()

    // Planejando em julho: os meses antes do pico estouram o teto e a tabela diz se cabem.
    const alertas = screen.getByRole('region', { name: 'Alertas de aglomeração' })
    const linhas = within(alertas).getAllByRole('row').slice(1)
    expect(linhas.length).toBeGreaterThan(0)
    expect(
      within(alertas).getByRole('rowheader', { name: 'fevereiro de 2027' }),
    ).toBeInTheDocument()
    for (const linha of linhas) {
      expect(within(linha).getByText(/^(Cabe|Faltam \d[\d.]* h)$/)).toBeInTheDocument()
    }

    expect(screen.getByText('Pico na posição recomendada').nextElementSibling).toHaveTextContent(
      /^\d\.\d{3} h$/,
    )
    expect(screen.getByText('Nenhuma atividade para iniciar já')).toBeInTheDocument()

    // As travas da matriz: quanto do mês de pico pode ser adiantado.
    const travas = screen.getByRole('region', { name: 'Prazos do pico por trava' })
    const cronograma = within(travas).getByRole('rowheader', { name: 'Cronograma aprovado' })
    const numeros = within(cronograma.closest('tr') ?? travas)
      .getAllByRole('cell')
      .map((c) => Number(c.textContent.replace(/\D/g, '')))
    // Em cronograma aprovado só o preparo (20%) se move.
    expect(numeros[2]).toBe((numeros[1] ?? 0) * 0.2)
    const prazoDoOrgao = within(travas).getByRole('rowheader', {
      name: 'Prazo do órgão ou de terceiro',
    })
    expect(
      within(prazoDoOrgao.closest('tr') ?? travas)
        .getAllByRole('cell')
        .at(2),
    ).toHaveTextContent(/^0 h$/)
  })

  it('com capacidade menor, mostra quantas horas faltam', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/planejamento')
    const capacidade = await screen.findByLabelText('Capacidade por mês (h)')
    await usuario.clear(capacidade)
    await usuario.type(capacidade, '400')

    const alertas = screen.getByRole('region', { name: 'Alertas de aglomeração' })
    expect(within(alertas).getAllByText(/^Faltam \d/).length).toBeGreaterThan(0)
    expect(
      Number(screen.getByText('Meses acima da capacidade').nextElementSibling?.textContent.at(0)),
    ).toBeGreaterThan(0)
  })

  it('compara as quatro estratégias e reage ao mês do pico', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/planejamento')
    const estrategias = await screen.findByRole('region', { name: 'Estratégias' })
    const linhas = within(estrategias).getAllByRole('row').slice(1)
    expect(linhas.map((l) => within(l).getByRole('rowheader').textContent)).toEqual([
      'Só pelo prazo',
      'Pela folga, sem gravidade',
      'Método sem antecipar',
      'Método completo',
    ])
    const celulas = (linha: HTMLElement | undefined) =>
      linha
        ? within(linha)
            .getAllByRole('cell')
            .map((c) => c.textContent)
        : []
    const horas = (texto: string | undefined) => Number((texto ?? '').replace(/\D/g, ''))
    expect(celulas(linhas[0])).toHaveLength(5)
    expect(horas(celulas(linhas[3])[0])).toBeLessThan(horas(celulas(linhas[0])[0]))
    expect(horas(celulas(linhas[3])[3])).toBeLessThan(horas(celulas(linhas[0])[3]))

    // Pico em setembro: os alertas saem do começo do ano.
    await usuario.selectOptions(screen.getByLabelText('Mês do pico'), 'setembro')
    const alertas = screen.getByRole('region', { name: 'Alertas de aglomeração' })
    expect(
      within(alertas).queryByRole('rowheader', { name: 'janeiro de 2027' }),
    ).not.toBeInTheDocument()
    expect(within(alertas).getAllByRole('rowheader').length).toBeGreaterThan(0)
  })

  it('a Equipe não vê o item no menu nem o conteúdo da tela', async () => {
    falso.reiniciar({
      sessao: sessaoDe('ana@filtroville.test', 'Ana'),
      rpc: { meus_vinculos: { data: [vinculoFalso('Filtroville', 'equipe')] } },
    })
    renderizarApp('/planejamento')
    expect(await screen.findByText('Você não tem acesso a esta área')).toBeInTheDocument()
    const menu = screen.getByRole('navigation', { name: 'Menu principal' })
    expect(within(menu).queryByRole('link', { name: 'Planejamento' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Capacidade por mês (h)')).not.toBeInTheDocument()
  })

  it('sem pico, não há alerta', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/planejamento')
    const pico = await screen.findByLabelText('Prazos no pico')
    await usuario.clear(pico)
    await usuario.type(pico, '30')
    const capacidade = screen.getByLabelText('Capacidade por mês (h)')
    await usuario.clear(capacidade)
    await usuario.type(capacidade, '3000')
    expect(screen.getByText('Nenhum mês acima da capacidade')).toBeInTheDocument()
  })

  it('valor inválido mostra o erro no campo e esconde o resultado', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/planejamento')
    const capacidade = await screen.findByLabelText('Capacidade por mês (h)')
    await usuario.clear(capacidade)
    expect(capacidade).toHaveAccessibleDescription('Informe um número de horas')
    expect(screen.queryByRole('region', { name: 'Alertas de aglomeração' })).not.toBeInTheDocument()
  })

  it('lista o que é para iniciar já, paginado', async () => {
    vi.setSystemTime(new Date('2026-12-28T15:00:00Z'))
    const usuario = userEvent.setup()
    renderizarApp('/planejamento')
    const triagem = await screen.findByRole('region', { name: 'Iniciar já' })
    expect(within(triagem).getAllByRole('row')).toHaveLength(11)
    expect(within(triagem).getByRole('columnheader', { name: 'Trava' })).toBeInTheDocument()
    expect(within(triagem).getByText(/^Página 1 de \d+$/)).toBeInTheDocument()
    expect(within(triagem).getByRole('button', { name: 'Anterior' })).toBeDisabled()
    await usuario.click(within(triagem).getByRole('button', { name: 'Próxima' }))
    expect(within(triagem).getByText(/^Página 2 de \d+$/)).toBeInTheDocument()
  })

  it('não tem violação de acessibilidade', async () => {
    const { container } = renderizarApp('/planejamento')
    await screen.findByRole('region', { name: 'Alertas de aglomeração' })
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations).toEqual([])
  })
})
