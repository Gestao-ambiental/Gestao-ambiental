// Importar planilha (ADR-0043): histórico, arquivo lido (CPF descartado antes de enviar),
// mapeamento, conferência em três abas, correção da linha, limite do plano, efetivar, desfazer e
// os estados vazio, carregando, erro e sem permissão.
import { dadosVazios } from '@gestao-ambiental/domain'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { utils, write } from 'xlsx'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

import { lerPlanilha } from './ler-planilha'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))
// O jsdom não tem Web Worker: a leitura roda direto (a mesma função que o Worker embrulha).
vi.mock('./ler-no-worker', () => ({
  lerArquivoNoWorker: async (arquivo: File) =>
    lerPlanilha(await arquivo.arrayBuffer(), arquivo.name),
}))

const eduardo = sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp')
const semContraste = { rules: { 'color-contrast': { enabled: false } } }

function importacao(extra: Record<string, unknown> = {}) {
  return {
    id: 'imp1',
    entidade: 'licenca',
    nome_arquivo: 'carteira.xlsx',
    total_linhas: 3,
    situacao: 'em_conferencia',
    criado_em: '2026-11-20T13:00:00Z',
    efetivada_em: null,
    row_version: 3,
    resumo: {
      row_version: 3,
      total: 3,
      prontas: 1,
      com_aviso: 1,
      com_erro: 1,
      puladas: 0,
      a_criar: { empreendimentos: 2, unidades: 2, licencas: 2 },
      limite: {
        recurso: 'empreendimentos',
        quantidade: 11,
        limite: 10,
        precisa_confirmar: false,
        adicionais_centavos: 0,
      },
    },
    resultado: null,
    resultado_desfazer: null,
    ...extra,
  }
}

const linhaComErro = {
  numero_linha: 4,
  dados: {
    ...dadosVazios(),
    empreendimento: 'Têxtil Vale',
    tipo: 'LAO',
    numero: '77/2021',
    orgao: 'IMA',
    emitido_em: '2021-03-01',
    emitido_em_texto: '01/03/2021',
    validade_texto: '04/04/27',
  },
  erros: [{ codigo: 'data_invalida', campo: 'validade' }],
  avisos: [],
  grupo: 'erro',
  resultado: null,
  motivo_mantida: null,
  empreendimento_id: null,
  instrumento_id: null,
}

function cenario(papel: 'gestao' | 'equipe' = 'gestao', extra: Partial<Cenario> = {}): Cenario {
  return {
    sessao: eduardo,
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', papel)] },
      ...extra.rpc,
    },
    tabelas: { importacao: [importacao()], importacao_linha: [linhaComErro], ...extra.tabelas },
  }
}

function arquivoXlsx(linhas: unknown[][], nome = 'carteira.xlsx'): File {
  const livro = utils.book_new()
  utils.book_append_sheet(livro, utils.aoa_to_sheet(linhas), 'Carteira')
  const bytes = write(livro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new File([bytes], nome, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

beforeEach(() => {
  falso.reiniciar(cenario())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('histórico de importações', () => {
  it('lista com tipo, linhas, situação e link para a importação; sem violações do axe', async () => {
    const { container } = renderizarApp('/configuracoes/importar')
    const link = await screen.findByRole('link', { name: 'carteira.xlsx' })
    expect(link).toHaveAttribute('href', '/configuracoes/importar/imp1')
    const linha = screen.getByRole('row', { name: /carteira\.xlsx/ })
    expect(within(linha).getByText('Licenças', { selector: 'td' })).toBeInTheDocument()
    expect(within(linha).getByText('Em conferência')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Importar planilha' })).toBeInTheDocument()
    // A aba Importar fica marcada em Configurações.
    const abas = screen.getByRole('navigation', { name: 'Configurações' })
    expect(within(abas).getByRole('link', { name: 'Importar' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    const resultado = await axe.run(container, semContraste)
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })

  it('vazio: a ação fica no estado vazio e leva a uma importação nova', async () => {
    falso.reiniciar(cenario('gestao', { tabelas: { importacao: [] } }))
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/configuracoes/importar')
    const vazio = await screen.findByRole('region', { name: 'Nenhuma importação' })
    expect(screen.getAllByRole('button', { name: 'Importar planilha' })).toHaveLength(1)
    await usuario.click(within(vazio).getByRole('button', { name: 'Importar planilha' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/configuracoes/importar/nova')
    })
  })

  it('erro ao carregar mostra "Tentar de novo"', async () => {
    const original = falso.cliente.from.getMockImplementation()
    falso.cliente.from.mockImplementation((tabela: string) => {
      if (tabela !== 'importacao' || !original) return original?.(tabela) as never
      const falha = {
        select: () => falha,
        eq: () => falha,
        order: () => falha,
        range: () => falha,
        then: (resolver: (valor: unknown) => unknown) =>
          Promise.resolve({ data: null, error: { message: 'Failed to fetch' }, count: null }).then(
            resolver,
          ),
      }
      return falha as never
    })
    renderizarApp('/configuracoes/importar')
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    if (original) falso.cliente.from.mockImplementation(original)
  })

  it('a Equipe vê "sem permissão" nas três telas', async () => {
    falso.reiniciar(cenario('equipe'))
    for (const caminho of [
      '/configuracoes/importar',
      '/configuracoes/importar/nova',
      '/configuracoes/importar/imp1',
    ]) {
      const { unmount } = renderizarApp(caminho)
      expect(
        await screen.findByRole('heading', { name: 'Você não tem acesso a esta área' }),
      ).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Importar planilha' })).not.toBeInTheDocument()
      unmount()
    }
    expect(falso.cliente.from).not.toHaveBeenCalledWith('importacao')
  })
})

describe('nova importação', () => {
  it('lê o .xlsx, descarta a coluna de CPF, sugere as colunas e manda conferir', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          criar_importacao: (args) => ({ data: args.p_id }),
          enviar_linhas_da_importacao: (args) => ({ data: (args.p_linhas as unknown[]).length }),
          conferir_importacao: { data: importacao().resumo },
        },
        tabelas: { importacao_mapeamento: [] },
      }),
    )
    const usuario = userEvent.setup()
    const { router, container } = renderizarApp('/configuracoes/importar/nova?entidade=licenca')

    expect(await screen.findByRole('region', { name: 'Nenhum arquivo escolhido' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Licenças' })).toHaveAttribute('aria-pressed', 'true')
    await usuario.upload(
      screen.getByLabelText('Arquivo da planilha'),
      arquivoXlsx([
        ['Empresa', 'CPF do sócio', 'Tipo', 'Nº', 'Órgão emissor', 'Emissão', 'Vencimento'],
        ['Metalúrgica', '529.982.247-25', 'LAO', '4821/2023', 'IMA', '15/03/2023', '04/04/2027'],
        ['Têxtil Vale', '111.444.777-35', 'LAO', '77/2021', 'IMA', '01/03/2021', '04/04/27'],
      ]),
    )

    expect(await screen.findByText('CPF do sócio')).toBeInTheDocument()
    expect(screen.getByText('Descartada')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Empreendimento/)).toHaveValue('Empresa')
    expect(screen.getByLabelText(/^Número/)).toHaveValue('Nº')
    expect(screen.getByLabelText(/^Validade/)).toHaveValue('Vencimento')
    expect(screen.getByLabelText(/^Cliente/)).toHaveValue('')
    // As colunas descartadas nem aparecem como opção.
    expect(
      within(screen.getByLabelText(/^Cliente/)).queryByRole('option', { name: 'CPF do sócio' }),
    ).not.toBeInTheDocument()
    const resultado = await axe.run(container, semContraste)
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])

    await usuario.click(screen.getByRole('button', { name: 'Conferir 2 linhas' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/configuracoes\/importar\/[0-9a-f-]{36}$/)
    })

    const chamadas = falso.cliente.rpc.mock.calls.map(([nome]) => nome)
    expect(chamadas.filter((n) => n !== 'meus_vinculos' && n !== 'catalogo_comercial')).toEqual(
      expect.arrayContaining([
        'criar_importacao',
        'enviar_linhas_da_importacao',
        'conferir_importacao',
      ]),
    )
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'criar_importacao',
      expect.objectContaining({
        p_entidade: 'licenca',
        p_nome_arquivo: 'carteira.xlsx',
        p_total_linhas: 2,
        p_mapeamento: {
          empreendimento: 'Empresa',
          tipo: 'Tipo',
          numero: 'Nº',
          orgao: 'Órgão emissor',
          emitido_em: 'Emissão',
          validade: 'Vencimento',
        },
      }) as unknown,
    )
    const envio = falso.cliente.rpc.mock.calls.find(([n]) => n === 'enviar_linhas_da_importacao')
    expect(envio?.[1]?.p_linhas).toEqual([
      {
        numero_linha: 2,
        dados: {
          ...dadosVazios(),
          empreendimento: 'Metalúrgica',
          tipo: 'LAO',
          numero: '4821/2023',
          orgao: 'IMA',
          emitido_em: '2023-03-15',
          emitido_em_texto: '15/03/2023',
          validade: '2027-04-04',
          validade_texto: '04/04/2027',
        },
      },
      expect.objectContaining({ numero_linha: 3 }) as unknown,
    ])
    // Nada de CPF sai do aparelho: nem formatado nem só os dígitos (o id aleatório da importação
    // pode conter "529", então a busca é pelo CPF inteiro).
    const enviado = JSON.stringify(falso.cliente.rpc.mock.calls)
    for (const cpf of ['529.982.247-25', '52998224725', '111.444.777-35', '11144477735']) {
      expect(enviado).not.toContain(cpf)
    }
  })

  it('planilha sem cabeçalho com CPF na 1ª linha, ou CPF no nome do arquivo: nada disso sai', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          criar_importacao: (args) => ({ data: args.p_id }),
          enviar_linhas_da_importacao: (args) => ({ data: (args.p_linhas as unknown[]).length }),
          conferir_importacao: { data: importacao().resumo },
        },
        tabelas: { importacao_mapeamento: [] },
      }),
    )
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/configuracoes/importar/nova')
    await screen.findByRole('region', { name: 'Nenhum arquivo escolhido' })
    await usuario.upload(
      screen.getByLabelText('Arquivo da planilha'),
      arquivoXlsx(
        [
          ['Metalúrgica', '529.982.247-25'],
          ['Têxtil Vale', 'Rede X'],
        ],
        'carteira 529.982.247-25.xlsx',
      ),
    )
    // A coluna cujo "cabeçalho" é um CPF sai como coluna de CPF, e não vira opção.
    expect(await screen.findByText('Descartada')).toBeInTheDocument()
    expect(
      within(screen.getByLabelText(/^Cliente/)).queryByRole('option', { name: /529/ }),
    ).not.toBeInTheDocument()
    await usuario.selectOptions(screen.getByLabelText(/^Empreendimento/), 'Metalúrgica')
    await usuario.click(screen.getByRole('button', { name: 'Conferir 1 linha' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/configuracoes\/importar\/[0-9a-f-]{36}$/)
    })
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'criar_importacao',
      expect.objectContaining({ p_nome_arquivo: 'carteira.xlsx' }) as unknown,
    )
    const enviado = JSON.stringify(falso.cliente.rpc.mock.calls)
    expect(enviado).not.toContain('529.982.247-25')
    expect(enviado).not.toContain('52998224725')
  })

  it('lembra o último mapeamento da consultoria', async () => {
    falso.reiniciar(
      cenario('gestao', {
        tabelas: { importacao_mapeamento: [{ mapeamento: { empreendimento: 'Razão' } }] },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/importar/nova')
    await screen.findByRole('region', { name: 'Nenhum arquivo escolhido' })
    await usuario.upload(
      screen.getByLabelText('Arquivo da planilha'),
      arquivoXlsx([
        ['Empreendimento', 'Razão'],
        ['A', 'B'],
      ]),
    )
    await waitFor(() => {
      expect(screen.getByLabelText(/^Empreendimento/)).toHaveValue('Razão')
    })
  })

  it('sem coluna para um obrigatório, aponta o campo e não envia nada', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/importar/nova')
    await screen.findByRole('region', { name: 'Nenhum arquivo escolhido' })
    await usuario.upload(
      screen.getByLabelText('Arquivo da planilha'),
      arquivoXlsx([
        ['Nome fantasia', 'Cliente'],
        ['A', 'B'],
      ]),
    )
    await usuario.click(await screen.findByRole('button', { name: 'Conferir 1 linha' }))
    const campo = screen.getByLabelText(/^Empreendimento/)
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(campo).toHaveAccessibleDescription('Escolha a coluna')
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('criar_importacao', expect.anything())

    // Escolher a coluna tira o erro.
    await usuario.selectOptions(campo, 'Nome fantasia')
    expect(campo).not.toHaveAttribute('aria-invalid')
  })

  it('arquivo em outro formato não é lido', async () => {
    const usuario = userEvent.setup({ applyAccept: false })
    renderizarApp('/configuracoes/importar/nova')
    await screen.findByRole('region', { name: 'Nenhum arquivo escolhido' })
    await usuario.upload(
      screen.getByLabelText('Arquivo da planilha'),
      new File(['x'], 'carteira.xls', { type: 'application/vnd.ms-excel' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Envie um arquivo .xlsx ou .csv.')
  })

  it('o banco recusa o lote: a mensagem aparece e a tela fica', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          criar_importacao: (args) => ({ data: args.p_id }),
          enviar_linhas_da_importacao: { error: { message: 'cpf_nao_aceito', code: '22023' } },
        },
      }),
    )
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/configuracoes/importar/nova')
    await screen.findByRole('region', { name: 'Nenhum arquivo escolhido' })
    await usuario.upload(
      screen.getByLabelText('Arquivo da planilha'),
      arquivoXlsx([['Empreendimento'], ['Metalúrgica']]),
    )
    await usuario.click(await screen.findByRole('button', { name: 'Conferir 1 linha' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/ainda tem CPF/)
    expect(router.state.location.pathname).toBe('/configuracoes/importar/nova')
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('conferir_importacao', expect.anything())
  })

  it('"Baixar modelo" gera o .xlsx no navegador', async () => {
    const criarUrl = vi.fn(() => 'blob:modelo')
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: criarUrl, revokeObjectURL: vi.fn() }),
    )
    const clique = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/importar/nova')
    await usuario.click(await screen.findByRole('button', { name: 'Mais ações' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Baixar modelo' }))
    await waitFor(() => {
      expect(criarUrl).toHaveBeenCalledTimes(1)
    })
    expect(clique).toHaveBeenCalledTimes(1)
    clique.mockRestore()
  })
})

describe('conferência', () => {
  it('três abas com contagem, abre a primeira com linhas e mostra os problemas', async () => {
    const { container } = renderizarApp('/configuracoes/importar/imp1')
    const abas = await screen.findByRole('tablist', { name: 'Linhas da planilha' })
    expect(
      within(abas)
        .getAllByRole('tab')
        .map((a) => a.textContent),
    ).toEqual(['Prontas 1', 'Com aviso 1', 'Com erro 1'])
    expect(within(abas).getByRole('tab', { name: /Prontas/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(await screen.findByText('Validade: data inválida')).toBeInTheDocument()
    // Erro e aviso não se distinguem só pela cor: o ícone tem forma e nome.
    const problema = screen.getByText('Validade: data inválida').closest('li') as HTMLElement
    expect(within(problema).getByRole('img', { name: 'Erro' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Importar 2 linhas' })).toBeEnabled()
    const resultado = await axe.run(container, semContraste)
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })

  it('passa do limite: só importa com a confirmação do adicional, que vai ao banco', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          efetivar_importacao: {
            data: {
              row_version: 4,
              linhas_criadas: 2,
              linhas_puladas: 0,
              linhas_com_erro: 1,
              empreendimentos_criados: 2,
              unidades_criadas: 2,
              licencas_criadas: 2,
              desfazer_ate: '2026-11-21T13:00:00Z',
            },
          },
        },
        tabelas: {
          importacao: [
            importacao({
              resumo: {
                ...importacao().resumo,
                limite: {
                  recurso: 'empreendimentos',
                  quantidade: 12,
                  limite: 10,
                  precisa_confirmar: true,
                  adicionais_centavos: 104000,
                },
              },
            }),
          ],
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/importar/imp1')
    expect(await screen.findByText('Passa do limite do plano')).toBeInTheDocument()
    expect(screen.getByText('12 de 10')).toBeInTheDocument()
    expect(screen.getByText('R$ 1.040,00')).toBeInTheDocument()
    const importar = screen.getByRole('button', { name: 'Importar 2 linhas' })
    expect(importar).toBeDisabled()

    await usuario.click(
      screen.getByRole('checkbox', { name: 'Confirmo os adicionais de R$ 1.040,00 por mês' }),
    )
    await usuario.click(importar)
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('efetivar_importacao', {
        p_importacao_id: 'imp1',
        p_row_version: 3,
        p_confirmar_adicional: true,
      })
    })
  })

  it('conflito de versão ao importar vira mensagem na tela', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          efetivar_importacao: { error: { message: 'conflito_de_versao', code: 'P0001' } },
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/importar/imp1')
    await usuario.click(await screen.findByRole('button', { name: 'Importar 2 linhas' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/alterado em outro lugar/)
  })

  it('o banco pede a confirmação do adicional: a tela confere de novo e mostra a mensagem', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          efetivar_importacao: {
            error: { message: 'adicional_nao_confirmado', code: 'P0001' },
          },
          conferir_importacao: { data: importacao().resumo },
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/importar/imp1')
    await usuario.click(await screen.findByRole('button', { name: 'Importar 2 linhas' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/limite do plano/)
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('conferir_importacao', {
        p_importacao_id: 'imp1',
      })
    })
  })

  it('"Corrigir" envia só a linha corrigida e confere de novo', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          enviar_linhas_da_importacao: { data: 3 },
          conferir_importacao: { data: importacao().resumo },
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/importar/imp1')
    await usuario.click(await screen.findByRole('tab', { name: /Com erro/ }))
    await usuario.click(await screen.findByRole('button', { name: 'Corrigir a linha 4' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Corrigir a linha 4' })
    const validade = within(dialogo).getByLabelText('Validade')
    expect(validade).toHaveValue('04/04/27')
    expect(validade).toHaveAccessibleDescription('Validade: data inválida')

    await usuario.clear(validade)
    await usuario.type(validade, '04/04/2027')
    expect(validade).not.toHaveAttribute('aria-invalid')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar e conferir' }))
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('conferir_importacao', {
        p_importacao_id: 'imp1',
      })
    })
    expect(falso.cliente.rpc).toHaveBeenCalledWith('enviar_linhas_da_importacao', {
      p_importacao_id: 'imp1',
      p_linhas: [
        {
          numero_linha: 4,
          dados: expect.objectContaining({
            validade: '2027-04-04',
            validade_texto: '04/04/2027',
            emitido_em: '2021-03-01',
          }) as unknown,
        },
      ],
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('importação de outra consultoria (ou inexistente) aparece como não encontrada', async () => {
    falso.reiniciar(cenario('gestao', { tabelas: { importacao: [] } }))
    renderizarApp('/configuracoes/importar/outra')
    expect(await screen.findByText('Importação não encontrada')).toBeInTheDocument()
  })
})

describe('depois de importar', () => {
  const efetivada = () =>
    importacao({
      situacao: 'efetivada',
      efetivada_em: new Date().toISOString(),
      row_version: 4,
      resultado: {
        row_version: 4,
        linhas_criadas: 2,
        linhas_puladas: 0,
        linhas_com_erro: 1,
        empreendimentos_criados: 2,
        unidades_criadas: 2,
        licencas_criadas: 2,
        desfazer_ate: new Date(Date.now() + 86_400_000).toISOString(),
      },
    })

  it('mostra o resultado e desfaz pelo "…", com confirmação', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          desfazer_importacao: {
            data: {
              row_version: 5,
              linhas_desfeitas: 2,
              linhas_mantidas: 0,
              empreendimentos_desfeitos: 2,
              unidades_desfeitas: 2,
              licencas_desfeitas: 2,
              mantidas: [],
            },
          },
        },
        tabelas: { importacao: [efetivada()] },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/importar/imp1')
    const placar = await screen.findByRole('group', { name: 'Resultado da importação' })
    expect(within(placar).getByText('Licenças criadas')).toBeInTheDocument()
    expect(screen.getByText('Importada')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Mais ações' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Desfazer importação' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Desfazer importação?' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('desfazer_importacao', {
        p_importacao_id: 'imp1',
        p_row_version: 4,
      })
    })
  })

  it('passadas 24 h, "Desfazer importação" some', async () => {
    falso.reiniciar(
      cenario('gestao', {
        tabelas: {
          importacao: [{ ...efetivada(), efetivada_em: '2026-01-01T13:00:00Z' }],
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/importar/imp1')
    await usuario.click(await screen.findByRole('button', { name: 'Mais ações' }))
    expect(await screen.findByRole('menuitem', { name: 'Baixar erros (.csv)' })).toBeVisible()
    expect(screen.queryByRole('menuitem', { name: 'Desfazer importação' })).not.toBeInTheDocument()
  })

  it('desfeita: mostra o que ficou e por quê', async () => {
    falso.reiniciar(
      cenario('gestao', {
        tabelas: {
          importacao: [
            importacao({
              situacao: 'desfeita',
              efetivada_em: '2026-11-20T13:00:00Z',
              resultado: efetivada().resultado,
              resultado_desfazer: {
                row_version: 5,
                linhas_desfeitas: 1,
                linhas_mantidas: 1,
                empreendimentos_desfeitos: 1,
                unidades_desfeitas: 1,
                licencas_desfeitas: 1,
                mantidas: [{ numero_linha: 4, motivo: 'tem_dependentes' }],
              },
            }),
          ],
          importacao_linha: [
            { ...linhaComErro, resultado: 'criada', motivo_mantida: 'tem_dependentes', erros: [] },
          ],
        },
      }),
    )
    renderizarApp('/configuracoes/importar/imp1')
    const ficaram = await screen.findByRole('region', { name: 'Ficaram' })
    expect(await within(ficaram).findByText('Tem outros dados ligados')).toBeInTheDocument()
    expect(within(ficaram).getByText('Têxtil Vale')).toBeInTheDocument()
    expect(screen.getByText('Desfeita')).toBeInTheDocument()
  })
})
