import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const eduardo = sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp')
const ana = sessaoDe('ana@filtroville.test', 'Ana Ribeiro')
const operador = sessaoDe('kadu@grama.test', 'Kadu Operador')
const CPF = '529.982.247-25'

/** Linha da RPC situacao_comercial: em teste (criada em 25/02/2027, hoje 01/03/2027). */
const emTeste = {
  hoje: '2027-03-01',
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
  situacao: 'teste',
  somente_leitura: false,
  orcamentos_liberados: true,
  teste_ate: '2027-03-10',
  em_atraso_desde: null,
  bloqueio_em: null,
  cobranca_aberta_id: null,
  cobranca_aberta_valor_centavos: null,
  cobranca_aberta_vencimento: null,
}

/** Equipe, cobrança vencida há mais de 2 dias úteis: só leitura. */
const bloqueada = {
  ...emTeste,
  hoje: '2027-05-12',
  plano: 'equipe',
  ciclo: 'mensal',
  forma: 'pix',
  vencimentos_em_aberto: ['2027-05-07'],
  situacao: 'bloqueada',
  somente_leitura: true,
}

function chamadas(nome: string) {
  return falso.cliente.rpc.mock.calls.filter(([rpc]) => rpc === nome)
}

describe('Plano e cobrança (ADR-0026)', () => {
  it('Gestão escolhe o plano e assina sem marcar a cobrança como paga; o CPF não sai da tela', async () => {
    falso.reiniciar({
      sessao: eduardo,
      rpc: {
        meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
        situacao_comercial: { data: [emTeste] },
        assinar_plano_simulado: { data: [{ cobranca_id: 'cob-1', mudanca_em: null }] },
      },
    })
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/plano')

    // Plano e cobrança é uma aba de Configurações (ADR-0041).
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Configurações' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Plano e cobrança' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(await screen.findByText('Em teste até 10/03/2027')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Anual' }))
    const escala = screen.getByRole('radio', { name: /Escala/ })
    await usuario.click(escala)
    expect(screen.getByText('R$ 29.900,00 por ano')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Assinar' }))
    expect(await screen.findByText('CNPJ ou CPF inválido')).toBeInTheDocument()
    expect(chamadas('assinar_plano_simulado')).toHaveLength(0)

    await usuario.type(screen.getByLabelText('Nome de quem paga'), 'Filtroville Consultoria')
    await usuario.type(screen.getByLabelText('E-mail de cobrança'), 'financeiro@filtroville.test')
    await usuario.type(screen.getByLabelText('CNPJ ou CPF'), '52998224725')
    expect(screen.getByLabelText('CNPJ ou CPF')).toHaveValue(CPF)
    await usuario.click(screen.getByRole('button', { name: 'Assinar' }))

    expect(await screen.findByText('Assinatura criada.')).toBeInTheDocument()
    expect(chamadas('assinar_plano_simulado')[0]?.[1]).toEqual({
      p_consultoria_id: 'c-Filtroville',
      p_plano: 'escala',
      p_ciclo: 'anual',
      p_forma: 'pix',
    })
    // O documento não vai para o banco nem para o armazenamento do navegador.
    expect(JSON.stringify(falso.cliente.rpc.mock.calls)).not.toContain('52998224725')
    expect(
      JSON.stringify(
        Object.keys(window.localStorage).map((chave) => window.localStorage.getItem(chave)),
      ),
    ).not.toContain('52998224725')

    // O pagamento é confirmado pela central (operador), nunca pela Gestão.
    expect(screen.queryByRole('dialog', { name: 'Pagamento simulado' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pagar' })).not.toBeInTheDocument()
    expect(chamadas('pagar_cobranca_simulada')).toHaveLength(0)
  })

  it('cancelada com cobrança vencida: assinar diz o motivo e que o pagamento é pelo suporte', async () => {
    falso.reiniciar({
      sessao: eduardo,
      rpc: {
        meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
        situacao_comercial: {
          data: [
            {
              ...bloqueada,
              valida_ate: '2027-05-06',
              cobranca_aberta_id: 'cob-1',
              cobranca_aberta_valor_centavos: 19900,
              cobranca_aberta_vencimento: '2027-05-07',
            },
          ],
        },
        assinar_plano_simulado: { error: { message: 'cobranca_em_atraso', code: 'P0001' } },
      },
    })
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/plano')

    expect(
      await screen.findByText(/Ninguém cria nem edita até o pagamento\. O pagamento é confirmado/),
    ).toBeInTheDocument()
    await usuario.click(screen.getByRole('radio', { name: /Escala/ }))
    await usuario.type(screen.getByLabelText('Nome de quem paga'), 'Filtroville Consultoria')
    await usuario.type(screen.getByLabelText('E-mail de cobrança'), 'financeiro@filtroville.test')
    await usuario.type(screen.getByLabelText('CNPJ ou CPF'), '52998224725')
    await usuario.click(screen.getByRole('button', { name: 'Assinar' }))
    expect(
      await screen.findByText(
        'Há cobrança vencida em aberto. Fale com o suporte do Grama para pagar e assinar de novo.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Verifique a conexão/)).not.toBeInTheDocument()
  })

  it('só leitura: todos veem a faixa; a Equipe não vê a página de plano', async () => {
    falso.reiniciar({
      sessao: ana,
      rpc: {
        meus_vinculos: { data: [vinculoFalso('Filtroville', 'equipe')] },
        situacao_comercial: { data: [bloqueada] },
      },
    })
    renderizarApp('/configuracoes/plano')
    expect(await screen.findByText('Somente leitura até o pagamento')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pagar' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Configurações' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Configurações' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Assinar' })).not.toBeInTheDocument()
  })
})

describe('Financeiro da central (ADR-0026)', () => {
  it('operador vê MRR, contagens e a lista por grupo', async () => {
    falso.reiniciar({
      sessao: operador,
      doisFatores: { nivel: 'aal2', fatores: [{ id: 'f1', status: 'verified' }] },
      rpc: {
        sou_operador: { data: true },
        central_resumo_financeiro: {
          data: [
            {
              pagantes: 2,
              em_teste: 3,
              beta: 1,
              internas: 2,
              em_atraso: 1,
              bloqueadas: 0,
              cancelados: 0,
              teste_encerrado: 1,
              teste_acabando: 1,
              mrr_centavos: 236500,
              ticket_medio_centavos: 118250,
              mensais: 1,
              anuais: 1,
              receita_essencial_centavos: 0,
              receita_equipe_centavos: 236500,
              receita_escala_centavos: 0,
            },
          ],
        },
        central_financeiro_lista: {
          data: [
            {
              id: 'c-a',
              nome: 'Filtroville',
              situacao: 'ativa',
              plano: 'equipe',
              ciclo: 'mensal',
              teste_ate: '2027-02-12',
              em_atraso_desde: null,
              mensal_centavos: 129000,
              total: 1,
            },
          ],
        },
      },
    })
    renderizarApp('/admin/financeiro')
    expect(await screen.findByRole('heading', { level: 1, name: 'Financeiro' })).toBeInTheDocument()
    const numeros = await screen.findByRole('region', { name: 'Números do Financeiro' })
    expect(within(numeros).getAllByText('R$ 2.365,00').length).toBeGreaterThan(0)
    expect(within(numeros).getByText('1 × 1')).toBeInTheDocument()
    const linha = await screen.findByRole('row', { name: /Filtroville/ })
    expect(within(linha).getByText('Equipe · Mensal')).toBeInTheDocument()
    expect(within(linha).getByText('R$ 1.290,00')).toBeInTheDocument()
  })
})
