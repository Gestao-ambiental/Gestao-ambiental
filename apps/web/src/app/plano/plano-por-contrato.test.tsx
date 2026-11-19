// Recursos por plano e plano por contrato (ADR-0030): a página de plano mostra o que cada plano
// inclui e, com contrato, não oferece assinar; a central define o contrato com motivo (e mostra
// a recusa do banco) e liga recursos de um plano sem tocar no preço.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const eduardo = sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp')
const operador = sessaoDe('kadu@grama.test', 'Kadu Operador')

/** Linha da RPC situacao_comercial: teste encerrado (criada em 25/02/2027, hoje 01/06/2027). */
const encerrada = {
  hoje: '2027-06-01',
  criada_em: '2027-02-25',
  fim_do_beta: '2027-01-31',
  dias_de_teste: 10,
  interna: false,
  plano: null,
  ciclo: null,
  forma: null,
  plano_agendado: null,
  ciclo_agendado: null,
  mudanca_em: null,
  valida_ate: null,
  proximo_vencimento: null,
  vencimentos_em_aberto: [],
  pessoas: 4,
  convites_pendentes: 0,
  empreendimentos: 2,
  situacao: 'teste_encerrado',
  somente_leitura: true,
  orcamentos_liberados: false,
  teste_ate: '2027-03-11',
  em_atraso_desde: null,
  bloqueio_em: null,
  cobranca_aberta_id: null,
  cobranca_aberta_valor_centavos: null,
  cobranca_aberta_vencimento: null,
  plano_contrato: null,
  contrato_ate: null,
}

const comContrato = {
  ...encerrada,
  situacao: 'contrato',
  somente_leitura: false,
  orcamentos_liberados: true,
  plano_contrato: 'escala',
  contrato_ate: '2027-12-31',
}

function chamadas(nome: string) {
  return falso.cliente.rpc.mock.calls.filter(([rpc]) => rpc === nome)
}

describe('Plano e cobrança com recursos e contrato (ADR-0030)', () => {
  it('cada plano mostra o que inclui', async () => {
    falso.reiniciar({
      sessao: eduardo,
      rpc: {
        meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
        situacao_comercial: { data: [encerrada] },
      },
    })
    renderizarApp('/configuracoes/plano')
    const essencial = await screen.findByRole('list', { name: 'O que o Essencial inclui' })
    expect(within(essencial).getByText('Sem orçamentos')).toBeInTheDocument()
    expect(within(essencial).getByText('Sem leitura por IA')).toBeInTheDocument()
    const equipe = screen.getByRole('list', { name: 'O que o Equipe inclui' })
    expect(within(equipe).getByText('Capacidade e carga da equipe')).toBeInTheDocument()
    expect(within(equipe).queryByText('Análise de lotes')).not.toBeInTheDocument()
    const escala = screen.getByRole('list', { name: 'O que o Escala inclui' })
    expect(within(escala).getByText('Análise de lotes')).toBeInTheDocument()
    expect(within(escala).getByText('Integração com o MTR do IMA')).toBeInTheDocument()
  })

  it('com plano por contrato: mostra o plano e a data, sem oferecer assinar', async () => {
    falso.reiniciar({
      sessao: eduardo,
      rpc: {
        meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
        situacao_comercial: { data: [comContrato] },
      },
    })
    renderizarApp('/configuracoes/plano')
    expect(await screen.findAllByText('Plano por contrato')).not.toHaveLength(0)
    expect(screen.getByText('Escala por contrato · até 31/12/2027')).toBeInTheDocument()
    expect(screen.getByText('4 de 25')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Assinar' })).not.toBeInTheDocument()
  })
})

const detalhe = {
  id: 'c-a',
  nome: 'Filtroville Consultoria Ambiental',
  criada_em: '2026-10-01T15:00:00Z',
  fuso: 'America/Sao_Paulo',
  situacao: 'ativa',
  situacao_alterada_em: null,
  gestao: [{ nome: 'Eduardo Karnopp', email: 'eduardo@filtroville.test' }],
  pessoas_ativas: 4,
  orcamentos: 0,
  empreendimentos: 2,
  licencas: 3,
  situacao_motivo: null,
  situacao_alterada_por_nome: null,
  row_version: 1,
}

function cenarioDaCentral(rpc: Cenario['rpc'] = {}): Cenario {
  return {
    sessao: operador,
    doisFatores: { nivel: 'aal2', fatores: [{ id: 'f1', status: 'verified' }] },
    rpc: {
      sou_operador: { data: true },
      central_detalhar_consultoria: { data: [detalhe] },
      central_listar_pessoas: { data: [] },
      central_historico_situacao: { data: [] },
      central_historico_comercial: { data: [] },
      central_cobrancas: { data: [] },
      central_plano_da_consultoria: {
        data: [{ ...encerrada, condicao_row_version: 3, situacao_asaas: null }],
      },
      central_historico_parametros: { data: [] },
      ...rpc,
    },
  }
}

describe('Central: plano por contrato e recursos (ADR-0030)', () => {
  it('operador põe a consultoria no Escala por contrato, com motivo', async () => {
    falso.reiniciar(cenarioDaCentral({ central_definir_plano_contrato: { data: 4 } }))
    const usuario = userEvent.setup()
    renderizarApp('/admin/consultorias/c-a')

    await usuario.click(await screen.findByRole('button', { name: 'Definir plano por contrato' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Plano por contrato' })
    await usuario.selectOptions(within(dialogo).getByLabelText('Plano'), 'escala')
    const salvar = within(dialogo).getByRole('button', { name: 'Salvar' })
    expect(salvar).toBeDisabled()
    await usuario.type(within(dialogo).getByLabelText('Motivo'), 'Contrato anual fechado por fora')
    await usuario.click(salvar)

    await waitFor(() => {
      expect(chamadas('central_definir_plano_contrato')).toHaveLength(1)
    })
    expect(chamadas('central_definir_plano_contrato')[0]?.[1]).toEqual({
      p_consultoria_id: 'c-a',
      p_plano: 'escala',
      p_ate: null,
      p_motivo: 'Contrato anual fechado por fora',
      p_row_version: 3,
    })
  })

  it('a recusa do banco aparece no diálogo', async () => {
    falso.reiniciar(
      cenarioDaCentral({
        central_definir_plano_contrato: { error: { message: 'conflito_de_versao' } },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/admin/consultorias/c-a')
    await usuario.click(await screen.findByRole('button', { name: 'Definir plano por contrato' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Plano por contrato' })
    await usuario.type(within(dialogo).getByLabelText('Motivo'), 'Contrato')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByRole('alert')).toBeInTheDocument()
  })

  it('ligar um recurso no plano chama só a função de recursos', async () => {
    falso.reiniciar(cenarioDaCentral({ central_definir_recursos_do_plano: { data: null } }))
    const usuario = userEvent.setup()
    renderizarApp('/admin/parametros')

    await usuario.click(await screen.findByLabelText('Análise de lotes no Equipe'))
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Salvar para as próximas cobranças' })
    expect(
      within(dialogo).getByText(
        'Recursos: Capacidade e carga da equipe → Capacidade e carga da equipe, Análise de lotes',
      ),
    ).toBeInTheDocument()
    await usuario.type(within(dialogo).getByLabelText('Motivo'), 'Lotes no Equipe')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByText('Parâmetros salvos.')).toBeInTheDocument()
    expect(chamadas('central_definir_recursos_do_plano')[0]?.[1]).toEqual({
      p_codigo: 'equipe',
      p_recursos: ['capacidade', 'analise_lotes'],
      p_motivo: 'Lotes no Equipe',
    })
    expect(chamadas('central_atualizar_plano')).toHaveLength(0)
  })
})
