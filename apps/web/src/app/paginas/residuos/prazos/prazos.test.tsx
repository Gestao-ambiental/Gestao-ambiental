import {
  formatarDataCivil,
  hojeNoFuso,
  proximosPrazosDaObrigacaoResiduo,
  type PapelMembro,
} from '@gestao-ambiental/domain'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ContextoConsultoria, type EstadoConsultoria } from '@/app/consultoria/contexto-consultoria'
import { falso, type Cenario } from '@/test/supabase-falso'

import { PaginaObrigacoesResiduos } from './PaginaObrigacoesResiduos'
import { ProximosPrazosDeResiduos } from './ProximosPrazosDeResiduos'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const hoje = hojeNoFuso(new Date(), 'America/Sao_Paulo')

function consultoria(papel: PapelMembro): EstadoConsultoria {
  return {
    atual: {
      membroId: 'm1',
      consultoriaId: 'c1',
      consultoriaNome: 'Filtroville',
      fuso: 'America/Sao_Paulo',
      papel,
      situacao: 'ativo',
      desligadoEm: null,
    },
    suporte: null,
    abrirSuporte: () => Promise.resolve(),
    vinculos: [],
    trocar: () => undefined,
  }
}

function renderizar(conteudo: ReactNode, papel: PapelMembro = 'gestao', caminho = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[caminho]}>
        <ContextoConsultoria.Provider value={consultoria(papel)}>
          {conteudo}
        </ContextoConsultoria.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function obrigacao(tipo: string, ativa: boolean) {
  return {
    tipo,
    ativa,
    observacao: null,
    obrigacao_id: ativa ? `o-${tipo}` : null,
    atualizado_em: ativa ? '2026-11-01T12:00:00Z' : null,
  }
}

function prazo(tipo: string, prazoData: string, dias: number, inicio: string | null = null) {
  return {
    obrigacao_id: `o-${tipo}`,
    empreendimento_id: 'e1',
    empreendimento_nome: 'Metalúrgica Rio Cubatão',
    tipo,
    referencia: '3º trimestre de 2026',
    inicio,
    prazo: prazoData,
    dias,
    observacao: null,
  }
}

function cenario(extra: Cenario['rpc'] = {}): Cenario {
  return {
    rpc: {
      listar_empreendimentos: {
        data: [
          {
            id: 'e1',
            nome: 'Metalúrgica Rio Cubatão',
            cliente_nome: null,
            cnpj: null,
            unidades: 1,
            licencas: [],
          },
        ],
      },
      obrigacoes_residuo: {
        data: [
          obrigacao('dmr_trimestral', true),
          obrigacao('dmrsu_mensal', false),
          obrigacao('inventario_nacional', false),
          obrigacao('rapp_ibama', false),
        ],
      },
      prazos_obrigacoes_residuo: {
        data: [prazo('dmr_trimestral', '2026-10-31', 16, '2026-10-01')],
      },
      definir_obrigacao_residuo: { data: 'o-rapp_ibama' },
      ...extra,
    },
  }
}

describe('prazos de resíduos (fase 1)', () => {
  beforeEach(() => {
    falso.reiniciar(cenario())
  })

  it('Gestão vê as obrigações com o próximo prazo calculado e liga uma delas', async () => {
    const usuario = userEvent.setup()
    const { container } = renderizar(
      <PaginaObrigacoesResiduos />,
      'gestao',
      '/residuos/prazos?empreendimento=e1',
    )

    const tabela = await screen.findByRole('table', { name: 'Obrigações de resíduos' })
    const dmr = within(tabela).getByRole('row', { name: /DMR trimestral/ })
    expect(within(dmr).getByText('Ligada')).toBeInTheDocument()
    const proximo = proximosPrazosDaObrigacaoResiduo('dmr_trimestral', hoje, 1)[0]
    expect(proximo).toBeDefined()
    if (proximo) expect(dmr).toHaveTextContent(formatarDataCivil(proximo.prazo))

    const prazos = await screen.findByRole('table', { name: /Próximos prazos de Metalúrgica/ })
    expect(within(prazos).getByText('31/10/2026')).toBeInTheDocument()
    expect(within(prazos).getByText('01/10/2026 a 31/10/2026')).toBeInTheDocument()
    expect(within(prazos).getByText('Em 16 dias')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Ligar RAPP do IBAMA' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith('definir_obrigacao_residuo', {
      p_empreendimento_id: 'e1',
      p_tipo: 'rapp_ibama',
      p_ativa: true,
      p_observacao: null,
    })

    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations).toEqual([])
  })

  it('mostra a recusa do banco ao salvar', async () => {
    falso.reiniciar(
      cenario({
        definir_obrigacao_residuo: { error: { code: '42501', message: 'sem_permissao' } },
      }),
    )
    const usuario = userEvent.setup()
    renderizar(<PaginaObrigacoesResiduos />, 'gestao', '/residuos/prazos?empreendimento=e1')

    await usuario.click(await screen.findByRole('button', { name: 'Desligar DMR trimestral' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar')
  })

  it('Equipe vê as obrigações sem os botões de ligar e desligar', async () => {
    renderizar(<PaginaObrigacoesResiduos />, 'equipe', '/residuos/prazos?empreendimento=e1')

    const tabela = await screen.findByRole('table', { name: 'Obrigações de resíduos' })
    expect(within(tabela).getAllByRole('row')).toHaveLength(5)
    expect(within(tabela).queryByRole('button')).not.toBeInTheDocument()
  })

  it('o componente do calendário limita as linhas, mostra vazio e sem permissão', async () => {
    falso.reiniciar(
      cenario({
        prazos_obrigacoes_residuo: {
          data: [
            prazo('dmr_trimestral', '2026-10-31', 16, '2026-10-01'),
            prazo('inventario_nacional', '2027-03-31', 167),
          ],
        },
      }),
    )
    const { unmount } = renderizar(<ProximosPrazosDeResiduos limite={1} />)
    const tabela = await screen.findByRole('table', { name: 'Próximos prazos de resíduos' })
    expect(within(tabela).getAllByRole('row')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Ver todos os 2 prazos' })).toHaveAttribute(
      'href',
      '/residuos/prazos',
    )
    unmount()

    falso.reiniciar(cenario({ prazos_obrigacoes_residuo: { data: [] } }))
    const vazio = renderizar(<ProximosPrazosDeResiduos />)
    expect(await screen.findByText('Nenhum prazo de resíduos no período')).toBeInTheDocument()
    vazio.unmount()

    falso.reiniciar(
      cenario({
        prazos_obrigacoes_residuo: { error: { code: '42501', message: 'sem_permissao' } },
      }),
    )
    renderizar(<ProximosPrazosDeResiduos />)
    expect(await screen.findByText('Você não tem acesso a esta área')).toBeInTheDocument()
  })
})
