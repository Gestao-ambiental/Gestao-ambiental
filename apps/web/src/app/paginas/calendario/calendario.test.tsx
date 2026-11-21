import { adicionarDias, formatarDataCivil, hojeNoFuso } from '@gestao-ambiental/domain'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const hoje = hojeNoFuso(new Date(), 'America/Sao_Paulo')

const evento = (data: string, tipo: string, titulo: string) => ({
  tipo_evento: tipo,
  data,
  id: `${tipo}-${titulo}`,
  instrumento_id: 'i1',
  codigo: tipo === 'prazo' || tipo === 'meta' ? '4.2' : null,
  titulo,
  empreendimento_nome: 'Metalúrgica Rio Cubatão',
  unidade_nome: 'Matriz',
  licenca: 'LAO 4821/2023',
  responsavel_nome: 'Bruno Kist',
  sem_responsavel: false,
  dias: 0,
})

function cenario(rpc: NonNullable<Cenario['rpc']> = {}): Cenario {
  return {
    sessao: sessaoDe('ana@filtroville.test', 'Ana Ribeiro'),
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
      listar_calendario: {
        data: [
          evento(hoje, 'prazo', 'Relatório A'),
          evento(hoje, 'limite_protocolo', 'Limite de protocolo'),
        ],
      },
      ...rpc,
    },
    tabelas: { membro: [], unidade: [] },
  }
}

function simularCelular() {
  vi.stubGlobal('matchMedia', (consulta: string) => ({
    matches: consulta.includes('max-width'),
    media: consulta,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('calendário: visões e hoje (EQ-04)', () => {
  it('no desktop abre no mês, com hoje aceso; a lista agrupa por dia a partir de hoje', async () => {
    falso.reiniciar(cenario())
    const usuario = userEvent.setup()
    renderizarApp('/calendario')

    const tabela = await screen.findByRole('table', { name: /Calendário de/ })
    const celulaDeHoje = within(tabela).getByText('Hoje').closest('td')
    expect(celulaDeHoje).toHaveClass('bg-(--sinal-fundo)')
    expect(screen.getByRole('button', { name: 'Mês' })).toHaveAttribute('aria-pressed', 'true')

    await usuario.click(screen.getByRole('button', { name: 'Lista' }))
    const agenda = await screen.findByRole('region', { name: 'Agenda' })
    const dia = within(agenda).getByRole('list', { name: new RegExp(formatarDataCivil(hoje)) })
    expect(within(dia).getByText('4.2 Relatório A').closest('a')).toHaveAttribute(
      'href',
      '/ocorrencias/prazo-Relatório A',
    )
    expect(within(dia).getByText('Protocolo LAO 4821/2023').closest('a')).toHaveAttribute(
      'href',
      '/renovacoes/limite_protocolo-Limite de protocolo',
    )
    expect(within(agenda).getByText('Hoje')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: /Calendário de/ })).toBeNull()
  })

  it('a lista consulta o mês exato, sem os dias das semanas vizinhas', async () => {
    falso.reiniciar(cenario())
    const usuario = userEvent.setup()
    renderizarApp('/calendario')
    await screen.findByRole('table', { name: /Calendário de/ })

    await usuario.click(screen.getByRole('button', { name: 'Lista' }))
    await screen.findByRole('region', { name: 'Agenda' })
    const chamadas = falso.cliente.rpc.mock.calls.filter(([nome]) => nome === 'listar_calendario')
    const [, ultima] = chamadas.at(-1) ?? []
    const { p_de: de, p_ate: ate } = ultima as { p_de: string; p_ate: string }
    expect(de).toBe(`${hoje.slice(0, 7)}-01`)
    expect(ate.slice(0, 7)).toBe(hoje.slice(0, 7))
    expect(adicionarDias(ate as typeof hoje, 1).slice(8)).toBe('01')
  })

  it('no celular abre na lista', async () => {
    simularCelular()
    falso.reiniciar(cenario())
    renderizarApp('/calendario')
    expect(await screen.findByRole('region', { name: 'Agenda' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lista' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('lista vazia leva ao mês seguinte', async () => {
    simularCelular()
    falso.reiniciar(cenario({ listar_calendario: { data: [] } }))
    const usuario = userEvent.setup()
    renderizarApp('/calendario')
    await screen.findByText('Nada a partir de hoje neste período')
    const antes = falso.cliente.rpc.mock.calls.filter(([n]) => n === 'listar_calendario').length

    await usuario.click(screen.getByRole('button', { name: 'Ver o mês seguinte' }))
    await vi.waitFor(() => {
      expect(
        falso.cliente.rpc.mock.calls.filter(([n]) => n === 'listar_calendario').length,
      ).toBeGreaterThan(antes)
    })
  })

  it('erro ao carregar mostra tentar de novo', async () => {
    falso.reiniciar(cenario({ listar_calendario: { error: { message: 'falhou', code: '500' } } }))
    renderizarApp('/calendario')
    expect(await screen.findByText('Não foi possível carregar o calendário.')).toBeInTheDocument()
  })

  it('não tem violações de acessibilidade detectáveis pelo axe', async () => {
    falso.reiniciar(cenario())
    const { container } = renderizarApp('/calendario')
    await screen.findByRole('table', { name: /Calendário de/ })
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})

describe('calendário: exigência e vencimento (base das oito funções)', () => {
  it('a lista escreve o tipo, desenha a forma e leva a exigência à página dela', async () => {
    falso.reiniciar(
      cenario({
        listar_calendario: {
          data: [
            { ...evento(hoje, 'exigencia', 'Apresentar laudo complementar'), id: 'x1' },
            { ...evento(hoje, 'vencimento', 'AVCB'), id: 'v1', responsavel_nome: null },
          ],
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/calendario')
    await screen.findByRole('table', { name: /Calendário de/ })

    await usuario.click(screen.getByRole('button', { name: 'Lista' }))
    const agenda = await screen.findByRole('region', { name: 'Agenda' })
    const dia = within(agenda).getByRole('list', { name: new RegExp(formatarDataCivil(hoje)) })

    expect(within(dia).getByText('Exigência')).toBeInTheDocument()
    expect(within(dia).getByText('Apresentar laudo complementar').closest('a')).toHaveAttribute(
      'href',
      '/exigencias/x1',
    )
    expect(within(dia).getByText('Vencimento')).toBeInTheDocument()
    expect(within(dia).getByText('AVCB').closest('a')).toBeNull()
    expect(dia.querySelector('[data-tipo="exigencia"]')).not.toBeNull()
    expect(dia.querySelector('[data-tipo="vencimento"]')).not.toBeNull()
  })
})

describe('calendário: exportar .ics (ADR-0047)', () => {
  it('baixa o recorte visível como eventos de dia inteiro', async () => {
    falso.reiniciar(cenario())
    let arquivo: Blob | null = null
    let nome = ''
    const criar = vi.fn((blob: Blob) => {
      arquivo = blob
      return 'blob:ics'
    })
    URL.createObjectURL = criar
    URL.revokeObjectURL = vi.fn()
    const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      nome = this.download
    })
    const usuario = userEvent.setup()
    renderizarApp('/calendario')
    await screen.findByRole('table', { name: /Calendário de/ })

    await usuario.click(screen.getByRole('button', { name: 'Mais ações' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Exportar .ics' }))

    expect(clique).toHaveBeenCalledOnce()
    expect(nome).toMatch(/^grama-calendario-\d{4}-\d{2}-\d{2}-a-\d{4}-\d{2}-\d{2}\.ics$/)
    const texto = (await (arquivo as Blob | null)?.text()) ?? ''
    expect(texto).toContain(`DTSTART;VALUE=DATE:${hoje.replace(/-/g, '')}\r\n`)
    expect(texto).toContain('UID:ocorrencia-prazo-Relatório A@gramaapp.com.br\r\n')
    expect(texto).toContain('SUMMARY:4.2 · Metalúrgica Rio Cubatão\r\n')
    expect(texto.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    clique.mockRestore()
  })

  it('sem eventos no período, exportar fica desabilitado', async () => {
    falso.reiniciar(cenario({ listar_calendario: { data: [] } }))
    const usuario = userEvent.setup()
    renderizarApp('/calendario')
    await screen.findByRole('table', { name: /Calendário de/ })

    await usuario.click(screen.getByRole('button', { name: 'Mais ações' }))
    expect(await screen.findByRole('menuitem', { name: 'Exportar .ics' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })
})
