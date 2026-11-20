import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const eduardo = sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp')

function registro(id: string, nome: string, situacao = 'ativo', validoAte: string | null = null) {
  return {
    id,
    row_version: 1,
    membro_id: `m-${id}`,
    profissao: 'eng_ambiental',
    conselho: 'crea',
    numero: '98765',
    uf: 'SC',
    valido_ate: validoAte,
    confirmado_em: null,
    membro: { nome, situacao },
  }
}

describe('Equipe: registros profissionais a confirmar', () => {
  beforeEach(() => {
    falso.reiniciar({
      sessao: eduardo,
      rpc: {
        meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
        confirmar_registro_profissional: { data: 2 },
        remover_registro_profissional: { data: null },
      },
      tabelas: {
        membro: [],
        convite: [],
        registro_profissional: [
          registro('r1', 'Bruno Tavares'),
          registro('r2', 'Camila Souza', 'ativo', '2020-01-31'),
          registro('r3', 'Diego Souza', 'desligado'),
        ],
      },
    })
  })

  it('lista só os de membros ativos, com a situação calculada', async () => {
    renderizarApp('/configuracoes/equipe')

    expect(await screen.findByText('Bruno Tavares')).toBeInTheDocument()
    expect(screen.getByText('Camila Souza')).toBeInTheDocument()
    expect(screen.queryByText('Diego Souza')).not.toBeInTheDocument()
    expect(screen.getAllByText('Engenheiro ambiental · Crea-SC 98765')).toHaveLength(1)
    expect(screen.getByText('Aguardando confirmação')).toBeInTheDocument()
    expect(screen.getByText('Vencido')).toBeInTheDocument()
  })

  it('a Gestão confirma ou recusa com a versão que leu', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/equipe')

    await usuario.click(
      await screen.findByRole('button', {
        name: 'Confirmar registro de Engenheiro ambiental de Bruno Tavares',
      }),
    )
    expect(falso.cliente.rpc).toHaveBeenCalledWith('confirmar_registro_profissional', {
      p_registro_id: 'r1',
      p_row_version: 1,
    })

    await usuario.click(
      screen.getByRole('button', {
        name: 'Recusar registro de Engenheiro ambiental de Camila Souza',
      }),
    )
    expect(falso.cliente.rpc).toHaveBeenCalledWith('remover_registro_profissional', {
      p_registro_id: 'r2',
      p_row_version: 1,
    })
  })
})
