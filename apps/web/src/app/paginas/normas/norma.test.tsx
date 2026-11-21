// /normas/:id (LEG-05; ADR-0050): cabeçalho, diferença estruturada e não estruturada, resumo
// revisado, afetados da carteira, aviso marcado como visto ao abrir, norma revogada e erros.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const CID = 'c-Filtroville'

function norma(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'n1',
    chave: 'sc;ima;instrucao_normativa;2',
    titulo: 'Instrução Normativa 02 do IMA',
    ementa: null,
    esfera: 'estadual',
    municipio_ibge: null,
    orgao: 'IMA',
    tipo: 'instrucao_normativa',
    numero: '2',
    ano: null,
    temas: [],
    url_oficial: 'https://in.ima.sc.gov.br/in02.pdf',
    fonte: 'ima_in',
    situacao_na_fonte: 'vigente',
    revogada_em: null,
    revogada_por: null,
    versoes: [
      {
        id: 'v2',
        numero: 2,
        publicada_em: '2026-11-19',
        publicada_em_texto: '19/11/2026',
        coletada_em: '2026-11-20T05:00:00Z',
        tem_texto: true,
      },
      {
        id: 'v1',
        numero: 1,
        publicada_em: null,
        publicada_em_texto: 'março de 2024',
        coletada_em: '2026-11-01T05:00:00Z',
        tem_texto: true,
      },
    ],
    mudancas: [
      {
        id: 'm2',
        tipo: 'alterada',
        detectada_em: '2026-11-20T05:00:00Z',
        publicada_em: '2026-11-20T15:00:00Z',
        diferenca: {
          estruturada: true,
          incluidos: [{ caminho: 'art9', rotulo: 'Art. 9º', texto: 'Fica criado o cadastro.' }],
          alterados: [
            {
              caminho: 'art6',
              rotulo: 'Art. 6º',
              antes: 'O prazo é de 30 dias.',
              depois: 'O prazo é de 60 dias.',
            },
          ],
          revogados: [{ caminho: 'art7', rotulo: 'Art. 7º', texto: 'Texto antigo.' }],
          iguais: 5,
        },
        resumo: {
          resumo: 'Amplia o prazo do relatório.',
          o_que_muda: ['Prazo passa a 60 dias'],
          confianca: 'alta',
        },
      },
      {
        id: 'm1',
        tipo: 'republicada',
        detectada_em: '2026-11-02T05:00:00Z',
        publicada_em: '2026-11-03T13:00:00Z',
        diferenca: { estruturada: false, mudou: true },
        resumo: null,
      },
    ],
    criterios: [],
    ...extra,
  }
}

function afetado(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    empreendimento_id: 'e1',
    empreendimento_nome: 'Posto Boa Vista',
    cliente_nome: 'Rede Sul Combustíveis',
    instrumento_id: 'i1',
    licenca: 'LAO 4821/2023',
    motivo: { criterio: 'atividade', valor: '47.30.00' },
    visto_em: null,
    ...extra,
  }
}

function cenario(rpc: NonNullable<Cenario['rpc']> = {}) {
  falso.reiniciar({
    sessao: sessaoDe('ana@filtroville.test', 'Ana Ribeiro'),
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', 'equipe')] },
      detalhe_da_norma: { data: norma() },
      afetados_pela_mudanca: { data: [] },
      marcar_mudanca_de_norma_vista: { data: 1 },
      ...rpc,
    },
  })
}

const chamadasDe = (nome: string) =>
  falso.cliente.rpc.mock.calls.filter(([chamada]) => chamada === nome)

describe('página da norma', () => {
  it('cabeçalho com órgão, tipo, situação e fonte oficial em nova aba', async () => {
    cenario()
    renderizarApp('/normas/n1')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Instrução Normativa 02 do IMA' }),
    ).toBeInTheDocument()
    expect(screen.getByText('IMA · Instrução normativa')).toBeInTheDocument()
    expect(screen.getByText('Vigente')).toBeInTheDocument()
    const fonte = screen.getByRole('link', { name: /Fonte oficial/ })
    expect(fonte).toHaveAttribute('href', 'https://in.ima.sc.gov.br/in02.pdf')
    expect(fonte).toHaveAttribute('target', '_blank')
    expect(fonte.getAttribute('rel')).toContain('noopener')
    expect(falso.cliente.rpc).toHaveBeenCalledWith('detalhe_da_norma', { p_norma_id: 'n1' })
  })

  it('diferença estruturada com Antes e Depois, resumo revisado e versões', async () => {
    cenario()
    renderizarApp('/normas/n1')
    const aberta = await screen.findByRole('button', { name: /Texto alterado/, expanded: true })
    expect(aberta).toHaveTextContent('publicada em 20/11/2026')

    expect(screen.getByText('Resumo por IA · revisado em 20/11/2026')).toBeInTheDocument()
    expect(screen.getByText('Amplia o prazo do relatório.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'O que muda' })).toBeInTheDocument()
    expect(screen.getByText('Prazo passa a 60 dias')).toBeInTheDocument()

    expect(screen.getByRole('heading', { name: 'Alterados (1)' })).toBeInTheDocument()
    expect(screen.getByText('Antes')).toBeInTheDocument()
    expect(screen.getByText('Depois')).toBeInTheDocument()
    expect(screen.getByText('O prazo é de 30 dias.').tagName).toBe('DEL')
    expect(screen.getByText('O prazo é de 60 dias.').tagName).toBe('INS')
    expect(screen.getByText('Fica criado o cadastro.').tagName).toBe('INS')
    expect(screen.getByText('Texto antigo.').tagName).toBe('DEL')

    const versoes = screen.getByRole('region', { name: 'Versões da norma' })
    const linhas = within(versoes).getAllByRole('row')
    expect(linhas[1]).toHaveTextContent('219/11/202620/11/2026')
    expect(linhas[2]).toHaveTextContent('1março de 202401/11/2026')
  })

  it('a mudança da URL abre primeiro; a não estruturada diz "Texto mudou"', async () => {
    const usuario = userEvent.setup()
    cenario()
    renderizarApp('/normas/n1?mudanca=m1')
    const botoes = await screen.findAllByRole('button', { expanded: true })
    expect(botoes).toHaveLength(1)
    expect(botoes[0]).toHaveTextContent('Republicada')
    expect(screen.getByText('Texto mudou')).toBeInTheDocument()
    expect(screen.queryByText('Resumo por IA', { exact: false })).not.toBeInTheDocument()

    const outra = screen.getByRole('button', { name: /Texto alterado/ })
    expect(outra).toHaveAttribute('aria-expanded', 'false')
    await usuario.click(outra)
    expect(outra).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByText('O prazo é de 60 dias.')).toBeInTheDocument()
  })

  it('afetados da carteira com link, cliente, licença e motivo; marca o aviso como visto', async () => {
    cenario({
      afetados_pela_mudanca: (args) => ({
        data:
          args.p_mudanca_id === 'm2'
            ? [
                afetado(),
                afetado({
                  empreendimento_id: 'e2',
                  empreendimento_nome: 'Metalúrgica Rio Cubatão',
                  cliente_nome: null,
                  instrumento_id: null,
                  licenca: null,
                  motivo: { criterio: 'competencia', valor: 'estadual' },
                }),
              ]
            : [],
      }),
    })
    const { queryClient } = renderizarApp('/normas/n1?mudanca=m2')
    queryClient.setQueryData(['normas-nao-vistas', CID], 3)

    const tabela = await screen.findByRole('region', { name: 'Afetados na carteira' })
    expect(within(tabela).getByRole('link', { name: 'Posto Boa Vista' })).toHaveAttribute(
      'href',
      '/empreendimentos/e1',
    )
    const [, primeira, segunda] = within(tabela).getAllByRole('row')
    expect(primeira).toHaveTextContent('Rede Sul Combustíveis')
    expect(primeira).toHaveTextContent('LAO 4821/2023')
    expect(primeira).toHaveTextContent('Atividade 47.30.00')
    expect(segunda).toHaveTextContent('Licenças do IMA')

    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('marcar_mudanca_de_norma_vista', {
        p_consultoria_id: CID,
        p_mudanca_id: 'm2',
      })
    })
    await waitFor(() => {
      expect(queryClient.getQueryState(['normas-nao-vistas', CID])?.isInvalidated).toBe(true)
    })
    expect(chamadasDe('marcar_mudanca_de_norma_vista')).toHaveLength(1)
  })

  it('aviso já visto não é marcado de novo', async () => {
    cenario({
      afetados_pela_mudanca: { data: [afetado({ visto_em: '2026-11-20T16:00:00Z' })] },
    })
    renderizarApp('/normas/n1')
    await screen.findByRole('region', { name: 'Afetados na carteira' })
    expect(chamadasDe('marcar_mudanca_de_norma_vista')).toHaveLength(0)
  })

  it('norma revogada mostra a data e a norma que revogou', async () => {
    cenario({
      detalhe_da_norma: (args) => ({
        data:
          args.p_norma_id === 'n2'
            ? norma({ id: 'n2', titulo: 'Instrução Normativa 05 do IMA', mudancas: [] })
            : norma({
                situacao_na_fonte: 'revogada',
                revogada_em: '2026-10-01',
                revogada_por: 'n2',
                mudancas: [],
              }),
      }),
    })
    renderizarApp('/normas/n1')
    expect(await screen.findByText('Revogada')).toBeInTheDocument()
    expect(screen.getByText('em 01/10/2026')).toBeInTheDocument()
    expect(
      await screen.findByRole('link', { name: 'Instrução Normativa 05 do IMA' }),
    ).toHaveAttribute('href', '/normas/n2')
    expect(screen.getByText('Nenhuma mudança publicada')).toBeInTheDocument()
  })

  it('norma inexistente', async () => {
    cenario({ detalhe_da_norma: { data: null } })
    renderizarApp('/normas/n9')
    expect(await screen.findByRole('heading', { name: 'Norma não encontrada' })).toBeInTheDocument()
  })

  it('erro ao carregar a norma mostra o aviso com "Tentar de novo"', async () => {
    cenario({ detalhe_da_norma: { error: { message: 'falhou' } } })
    renderizarApp('/normas/n1')
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Não foi possível carregar a norma.')
    expect(within(alerta).getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('erro ao carregar os afetados fica na própria mudança', async () => {
    cenario({ afetados_pela_mudanca: { error: { message: 'falhou' } } })
    renderizarApp('/normas/n1')
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Não foi possível carregar os afetados.')
    expect(screen.getByText('O prazo é de 60 dias.')).toBeInTheDocument()
  })
})
