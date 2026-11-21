// "Colorir por" no calendário: tipo, área ou pessoa, lembrado no navegador; legenda que filtra;
// cor estável por pessoa; e nada só na cor (sigla no evento, nome no title e na legenda).
import { hojeNoFuso } from '@gestao-ambiental/domain'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { describe, expect, it, vi } from 'vitest'

import type { MembroAtivo } from '@/lib/api/perfil'
import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

import { categorizador, legendaDe } from './colorir-por'
import type { ItemDoDia } from './itens-do-calendario'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const hoje = hojeNoFuso(new Date(), 'America/Sao_Paulo')

const BRUNO = 'd0000000-0000-4000-8000-0000000000a3'
const CARLA = 'd0000000-0000-4000-8000-0000000000a4'

const evento = (
  titulo: string,
  responsavel: { id: string; nome: string } | null,
  tipo = 'prazo',
) => ({
  tipo_evento: tipo,
  data: hoje,
  id: `${tipo}-${titulo}`,
  instrumento_id: 'i1',
  codigo: '4.2',
  titulo,
  empreendimento_nome: 'Metalúrgica Rio Cubatão',
  unidade_nome: 'Matriz',
  licenca: 'LAO 4821/2023',
  responsavel_nome: responsavel?.nome ?? null,
  responsavel_id: responsavel?.id ?? null,
  sem_responsavel: responsavel === null,
  dias: 0,
})

function cenario(): Cenario {
  return {
    sessao: sessaoDe('ana@filtroville.test', 'Ana Ribeiro'),
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
      listar_calendario: {
        data: [
          evento('Relatório de ruído', { id: BRUNO, nome: 'Bruno Kist' }),
          evento('Inventário de fauna', { id: CARLA, nome: 'Carla Souza' }),
          evento('Planilha de efluentes', null),
        ],
      },
    },
    tabelas: {
      membro: [
        {
          id: BRUNO,
          consultoria_id: 'c-Filtroville',
          situacao: 'ativo',
          nome: 'Bruno Kist',
          papel: 'equipe',
          profissao: 'eng_ambiental',
        },
        {
          id: CARLA,
          consultoria_id: 'c-Filtroville',
          situacao: 'ativo',
          nome: 'Carla Souza',
          papel: 'equipe',
          profissao: 'biologo',
        },
      ],
      unidade: [],
    },
  }
}

function legenda() {
  return screen.getByRole('group', { name: /^Legenda/ })
}

describe('calendário: colorir por tipo, área ou pessoa', () => {
  it('começa por tipo; por área, cada evento ganha a cor, a sigla e o nome da área', async () => {
    falso.reiniciar(cenario())
    const usuario = userEvent.setup()
    renderizarApp('/calendario')
    await screen.findByRole('table', { name: /Calendário de/ })
    expect(screen.getByRole('button', { name: 'Tipo' })).toHaveAttribute('aria-pressed', 'true')
    expect(
      within(legenda()).getByRole('button', { name: /^Prazo oficial, 3 eventos/ }),
    ).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Área' }))
    expect(
      await within(legenda()).findByRole('button', { name: /^Engenharia ambiental, 1 evento/ }),
    ).toBeVisible()
    expect(
      within(legenda()).getByRole('button', { name: /^Ciências biológicas, 1 evento/ }),
    ).toBeVisible()
    expect(
      within(legenda()).getByRole('button', { name: /^Sem responsável, 1 evento/ }),
    ).toBeVisible()

    // A cor nunca vai sozinha: o title diz a área e o evento leva a sigla.
    const ruido = screen.getByTitle(/Relatório de ruído.* · Engenharia ambiental$/)
    expect(ruido).toHaveTextContent('EA')
    expect(ruido.getAttribute('style')).toMatch(/--categoria-\d-fundo/)
    // Escolha lembrada no navegador.
    expect(window.localStorage.getItem('grama.calendario.colorir-por')).toBe('area')
  })

  it('por pessoa, a legenda filtra: clicar mostra só aquela pessoa; clicar de novo mostra todas', async () => {
    window.localStorage.setItem('grama.calendario.colorir-por', 'pessoa')
    falso.reiniciar(cenario())
    const usuario = userEvent.setup()
    renderizarApp('/calendario')
    await screen.findByRole('table', { name: /Calendário de/ })
    expect(screen.getByRole('button', { name: 'Pessoa' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByTitle(/Relatório de ruído.* · Bruno Kist$/)).toHaveTextContent('BK')

    const carla = within(legenda()).getByRole('button', { name: /Carla Souza/ })
    await usuario.click(carla)
    expect(carla).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByTitle(/Relatório de ruído/)).not.toBeInTheDocument()
    expect(screen.getByTitle(/Inventário de fauna/)).toBeInTheDocument()

    await usuario.click(carla)
    expect(screen.getByTitle(/Relatório de ruído/)).toBeInTheDocument()

    await usuario.click(within(legenda()).getByRole('button', { name: /Bruno Kist/ }))
    await usuario.click(screen.getByRole('button', { name: 'Mostrar todas' }))
    expect(screen.getByTitle(/Planilha de efluentes/)).toBeInTheDocument()
  })

  it('não tem violações de acessibilidade colorindo por pessoa', async () => {
    window.localStorage.setItem('grama.calendario.colorir-por', 'pessoa')
    falso.reiniciar(cenario())
    const { container } = renderizarApp('/calendario')
    await screen.findByRole('table', { name: /Calendário de/ })
    const r = await axe.run(container)
    expect(r.violations.map((v) => v.id)).toEqual([])
  })
})

describe('categorias (regra)', () => {
  const membro = (id: string, nome: string, profissao: string | null) =>
    ({ id, nome, profissao }) as unknown as MembroAtivo
  const item = (responsavelId: string | null) =>
    ({ chave: `k-${String(responsavelId)}`, tipo: 'prazo', responsavelId }) as ItemDoDia

  it('a cor da pessoa não muda com a ordem da equipe nem com o mês', () => {
    const equipe = [
      membro(BRUNO, 'Bruno Kist', 'eng_ambiental'),
      membro(CARLA, 'Carla Souza', 'biologo'),
    ]
    const uma = categorizador('pessoa', equipe)(item(CARLA))
    const outra = categorizador('pessoa', [...equipe].reverse())(item(CARLA))
    expect(uma.cor).toBe(outra.cor)
    expect(uma.cor).not.toBeNull()
  })

  it('nenhuma categoria colorida usa o verde do destaque: as cores são as da paleta de categorias', () => {
    const equipe = [membro(BRUNO, 'Bruno Kist', 'eng_ambiental')]
    const categoria = categorizador('area', equipe)(item(BRUNO))
    expect(categoria.cor).toBeGreaterThanOrEqual(0)
    expect(categoria.cor).toBeLessThan(9)
  })

  it('a legenda conta por categoria e põe as neutras no fim', () => {
    const equipe = [membro(BRUNO, 'Bruno Kist', 'eng_ambiental')]
    const de = categorizador('pessoa', equipe)
    const linhas = legendaDe([item(null), item(BRUNO), item(BRUNO)], de)
    expect(linhas.map((l) => [l.categoria.rotulo, l.quantidade])).toEqual([
      ['Bruno Kist', 2],
      ['Sem responsável', 1],
    ])
  })
})
