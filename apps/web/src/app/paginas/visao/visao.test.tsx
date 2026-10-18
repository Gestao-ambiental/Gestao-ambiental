import { adicionarDias, hojeNoFuso } from '@gestao-ambiental/domain'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const hoje = hojeNoFuso(new Date(), 'America/Sao_Paulo')

function linha(
  id: string,
  dias: number,
  titulo: string,
  extra: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    tipo_linha: 'ocorrencia',
    id,
    instrumento_id: 'i1',
    prazo: adicionarDias(hoje, dias),
    dias,
    codigo: '4.2',
    titulo,
    empreendimento_id: 'e1',
    empreendimento_nome: 'Metalúrgica Rio Cubatão',
    unidade_nome: 'Matriz',
    licenca: 'LAO 4821/2023',
    responsavel_id: 'm-bruno',
    responsavel_nome: 'Bruno Kist',
    situacao_ocorrencia: 'aberta',
    row_version: 1,
    total: 4,
    ...extra,
  }
}

const linhas = [
  linha('o1', -45, 'Laudo anual de ruído'),
  linha('o2', 0, 'Relatório trimestral', { responsavel_id: null, responsavel_nome: null }),
  linha('o3', 1, 'Inventário anual de resíduos'),
  linha('l1', 6, 'Limite de protocolo', {
    tipo_linha: 'limite_protocolo',
    codigo: null,
    responsavel_id: null,
    responsavel_nome: null,
  }),
]

function cenario(papel: 'gestao' | 'equipe' = 'gestao', extra: Partial<Cenario> = {}): Cenario {
  return {
    sessao: sessaoDe('ana@filtroville.test', 'Ana Ribeiro'),
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', papel)] },
      listar_prazos: (args) => ({ data: args.p_limite === 1 ? [{ total: 4 }] : linhas }),
      contar_prazos: {
        data: [{ atrasadas: 1, hoje: 1, proximos_7: 2, sem_responsavel: 1, total: 3 }],
      },
      listar_empreendimentos: { data: [] },
      atribuir_ocorrencia: { data: 2 },
      listar_calendario: { data: [] },
      ...extra.rpc,
    },
    tabelas: {
      membro: [
        { id: 'm-bruno', nome: 'Bruno Kist' },
        { id: 'm-elisa', nome: 'Elisa Prado' },
      ],
      instrumento: [],
      unidade: [],
      ...extra.tabelas,
    },
  }
}

describe('visão da equipe (EQ-01 a EQ-03)', () => {
  beforeEach(() => {
    falso.reiniciar(cenario())
  })

  it('mostra contadores e a tabela com a situação calculada e rótulos próprios', async () => {
    renderizarApp('/')
    const tabela = await screen.findByRole('table')
    expect(within(tabela).getByText('Atrasada 45 dias')).toBeInTheDocument()
    expect(within(tabela).getByText('Hoje')).toBeInTheDocument()
    expect(within(tabela).getByText('Amanhã')).toBeInTheDocument()
    expect(within(tabela).getByText('Em 6 dias')).toBeInTheDocument()
    expect(within(tabela).getByText('Limite de protocolo')).toBeInTheDocument()

    const contadores = screen.getByRole('group', { name: 'Contadores' })
    expect(within(contadores).getByRole('button', { name: /Atrasadas/ })).toHaveTextContent('1')
    expect(within(contadores).getByRole('button', { name: /Sem responsável/ })).toBeInTheDocument()
    expect(screen.getByText('1–4 de 4')).toBeInTheDocument()
  })

  it('o contador filtra a tabela e o cabeçalho ordena', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/')
    await screen.findByRole('table')

    await usuario.click(screen.getByRole('button', { name: /Atrasadas/ }))
    expect(screen.getByRole('button', { name: /Atrasadas/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'listar_prazos',
      expect.objectContaining({ p_faixa: 'atrasadas' }) as unknown,
    )

    await usuario.click(screen.getByRole('button', { name: 'Prazo' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'listar_prazos',
      expect.objectContaining({ p_ordem: '-prazo' }) as unknown,
    )
  })

  it('Gestão atribui pela linha sem responsável', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/')
    const tabela = await screen.findByRole('table')

    await usuario.click(
      within(tabela).getByRole('button', { name: /Atribuir 4.2 Relatório trimestral/ }),
    )
    await usuario.click(await screen.findByRole('menuitem', { name: 'Elisa Prado' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith('atribuir_ocorrencia', {
      p_ocorrencia_id: 'o2',
      p_membro_id: 'm-elisa',
      p_row_version: 1,
    })
  })

  it('Equipe não atribui nem vê o contador de sem responsável', async () => {
    falso.reiniciar(cenario('equipe'))
    renderizarApp('/')
    const tabela = await screen.findByRole('table')
    expect(within(tabela).queryByRole('button', { name: /Atribuir/ })).toBeNull()
    expect(within(tabela).getByText('Sem responsável')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sem responsável/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Cadastrar licença/ })).toBeNull()
  })

  it('Minhas ações troca a aba', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/')
    await screen.findByRole('table')
    await usuario.click(screen.getByRole('tab', { name: /Minhas ações/ }))
    expect(screen.getByRole('tab', { name: /Minhas ações/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'listar_prazos',
      expect.objectContaining({ p_aba: 'minhas' }) as unknown,
    )
  })

  it('sem dado carregado não mostra contador com zero', async () => {
    falso.reiniciar(cenario('gestao', { rpc: { contar_prazos: { error: { message: 'falhou' } } } }))
    renderizarApp('/')
    await screen.findByRole('table')
    expect(screen.queryByRole('group', { name: 'Contadores' })).toBeNull()
  })

  it('consultoria sem prazos mostra o estado vazio', async () => {
    falso.reiniciar(cenario('gestao', { rpc: { listar_prazos: { data: [] } } }))
    renderizarApp('/')
    expect(await screen.findByText('Nenhum prazo para mostrar')).toBeInTheDocument()
  })

  it('não tem violações de acessibilidade detectáveis pelo axe', async () => {
    const { container } = renderizarApp('/')
    await screen.findByRole('table')
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})

describe('calendário (EQ-04)', () => {
  const evento = (
    data: string,
    tipo: string,
    titulo: string,
    extra: Record<string, unknown> = {},
  ) => ({
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
    ...extra,
  })

  it('mês com eventos do dia, "+N mais" e marcas distintas', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          listar_calendario: {
            data: [
              evento(hoje, 'prazo', 'Relatório A'),
              evento(hoje, 'prazo', 'Relatório B', {
                sem_responsavel: true,
                responsavel_nome: null,
              }),
              evento(hoje, 'meta', 'Relatório C'),
              evento(hoje, 'limite_protocolo', 'Limite de protocolo'),
              evento(hoje, 'validade', 'Validade'),
            ],
          },
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/calendario')

    const tabela = await screen.findByRole('table', { name: /Calendário de/ })
    expect(within(tabela).getByText('Hoje')).toBeInTheDocument()
    expect(within(tabela).getByText('4.2 Relatório A')).toBeInTheDocument()
    expect(within(tabela).getByText('sem resp.')).toBeInTheDocument()
    expect(within(tabela).getByText('Meta')).toBeInTheDocument()

    await usuario.click(within(tabela).getByRole('button', { name: '+2 mais' }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText('Protocolo LAO 4821/2023')).toBeInTheDocument()
    expect(within(dialogo).getByText('Validade LAO 4821/2023')).toBeInTheDocument()
  })

  it('filtros e troca para semana consultam o intervalo certo', async () => {
    falso.reiniciar(cenario())
    const usuario = userEvent.setup()
    renderizarApp('/calendario')
    await screen.findByRole('table', { name: /Calendário de/ })

    await usuario.click(screen.getByRole('checkbox', { name: 'Só sem responsável' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'listar_calendario',
      expect.objectContaining({ p_sem_responsavel: true }) as unknown,
    )

    await usuario.click(screen.getByRole('button', { name: 'Semana' }))
    const chamadas = falso.cliente.rpc.mock.calls.filter(([nome]) => nome === 'listar_calendario')
    const [, ultima] = chamadas.at(-1) ?? []
    const { p_de: de, p_ate: ate } = ultima as { p_de: string; p_ate: string }
    expect(adicionarDias(de as typeof hoje, 6)).toBe(ate)
  })
})
