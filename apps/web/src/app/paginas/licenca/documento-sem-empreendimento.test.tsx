import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

// pdf.js precisa de worker de verdade; aqui o texto do PDF vem pronto.
const textoDoPdf = vi.fn<() => Promise<string>>()
vi.mock('@/components/pdf/ler-texto-do-pdf', () => ({ lerTextoDoPdf: () => textoDoPdf() }))

const LAO = `LICENÇA AMBIENTAL DE OPERAÇÃO - LAO Nº 4521/2023
Razão Social: INDÚSTRIA HORIZONTE LTDA.   CNPJ: 11.222.333/0001-81
Endereço do Empreendimento: Rua Dona Francisca, 8300, Joinville/SC`

const EXISTENTE = {
  id: 'e1',
  nome: 'Indústria Horizonte',
  cliente_nome: null,
  cnpj: '11222333000181',
  unidades: 1,
  criado_em: '2026-10-01T12:00:00Z',
  licencas: [],
  total: 1,
}

/** Consultoria sem empreendimento: a lista cresce quando a RPC de cadastro é chamada. */
function cenario(extra: Partial<Cenario['rpc']> = {}): Cenario {
  const empreendimentos: unknown[] = []
  const unidades: { id: string; nome: string; endereco: string | null }[] = []
  return {
    sessao: sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp'),
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
      listar_empreendimentos: () => ({ data: empreendimentos }),
      empreendimentos_parecidos: { data: [] },
      cadastrar_empreendimento_com_unidade: (args) => {
        empreendimentos.push({ ...EXISTENTE, id: args.p_empreendimento_id, nome: args.p_nome })
        unidades.push({
          id: String(args.p_unidade_id),
          nome: String(args.p_unidade_nome),
          endereco: null,
        })
        return { data: args.p_unidade_id }
      },
      criar_instrumento: (args) => ({ data: args.p_id }),
      ...extra,
    },
    tabelas: { unidade: unidades },
  }
}

async function enviarPdf(usuario: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('button', { name: 'Escolher arquivo' })
  const entrada = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (!entrada) throw new Error('campo de arquivo ausente')
  await usuario.upload(
    entrada,
    new File(['%PDF-1.4 licença'], 'LAO 4521-2023.pdf', { type: 'application/pdf' }),
  )
}

describe('passo Documento sem empreendimento cadastrado', () => {
  beforeEach(() => {
    textoDoPdf.mockReset()
    textoDoPdf.mockResolvedValue(LAO)
  })

  it('lista vazia diz o que fazer e cadastra o empreendimento na hora, sem sair do fluxo', async () => {
    falso.reiniciar(cenario())
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/licencas/nova')

    expect(await screen.findByText('Nenhum empreendimento cadastrado ainda.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ler do PDF' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Cadastrar agora' }))

    const form = screen.getByRole('form', { name: 'Novo empreendimento' })
    await usuario.click(within(form).getByRole('button', { name: 'Cadastrar e usar' }))
    expect(within(form).getByText('Informe o nome')).toBeInTheDocument()
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith(
      'cadastrar_empreendimento_com_unidade',
      expect.anything(),
    )

    await usuario.type(within(form).getByLabelText('Nome do empreendimento'), 'Posto Vale Verde')
    await usuario.click(within(form).getByRole('button', { name: 'Cadastrar e usar' }))

    expect(await screen.findByRole('combobox', { name: 'Unidade' })).toHaveDisplayValue('Matriz')
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'cadastrar_empreendimento_com_unidade',
      expect.objectContaining({ p_nome: 'Posto Vale Verde', p_unidade_nome: 'Matriz' }) as unknown,
    )

    await usuario.click(screen.getByRole('radio', { name: 'Cadastrar manualmente' }))
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/\/identificacao$/)
    })
  })

  it('PDF primeiro: lê o titular e cadastra o empreendimento com um clique de confirmação', async () => {
    falso.reiniciar(cenario())
    const usuario = userEvent.setup()
    renderizarApp('/licencas/nova')
    await enviarPdf(usuario)

    const sugestao = await screen.findByRole('region', { name: 'Titular encontrado no PDF' })
    expect(within(sugestao).getByText('Indústria Horizonte Ltda.')).toBeInTheDocument()
    expect(within(sugestao).getByText('11.222.333/0001-81')).toBeInTheDocument()
    // Nada é criado sem a confirmação.
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith(
      'cadastrar_empreendimento_com_unidade',
      expect.anything(),
    )

    await usuario.click(
      within(sugestao).getByRole('button', { name: 'Cadastrar Indústria Horizonte Ltda.' }),
    )
    expect(await screen.findByRole('combobox', { name: 'Unidade' })).toHaveDisplayValue(
      'Unidade Joinville',
    )
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'cadastrar_empreendimento_com_unidade',
      expect.objectContaining({
        p_nome: 'Indústria Horizonte Ltda.',
        p_cnpj: '11222333000181',
        p_unidade_nome: 'Unidade Joinville',
        p_unidade_endereco: 'Rua Dona Francisca, 8300, Joinville/SC',
      }) as unknown,
    )
  })

  it('titular já cadastrado (mesmo CNPJ): sugere usar o empreendimento existente', async () => {
    falso.reiniciar({
      ...cenario({
        listar_empreendimentos: { data: [EXISTENTE] },
        empreendimentos_parecidos: {
          data: [{ id: 'e1', nome: 'Indústria Horizonte', mesmo_nome: false, mesmo_cnpj: true }],
        },
      }),
      tabelas: { unidade: [{ id: 'u1', nome: 'Matriz', endereco: null }] },
    })
    const usuario = userEvent.setup()
    renderizarApp('/licencas/nova')
    await enviarPdf(usuario)

    const sugestao = await screen.findByRole('region', { name: 'Titular encontrado no PDF' })
    await usuario.click(within(sugestao).getByRole('button', { name: 'Usar Indústria Horizonte' }))
    expect(screen.getByRole('combobox', { name: 'Empreendimento' })).toHaveValue('e1')
    expect(await screen.findByRole('combobox', { name: 'Unidade' })).toHaveValue('u1')
  })

  it('erro do banco ao cadastrar aparece na hora e não avança', async () => {
    falso.reiniciar(
      cenario({
        cadastrar_empreendimento_com_unidade: {
          error: { code: '42501', message: 'sem_permissao' },
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/licencas/nova')
    await enviarPdf(usuario)
    const sugestao = await screen.findByRole('region', { name: 'Titular encontrado no PDF' })
    await usuario.click(
      within(sugestao).getByRole('button', { name: 'Cadastrar Indústria Horizonte Ltda.' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Você não tem permissão para esta ação.',
    )
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
  })

  it('PDF sem texto: diz que não achou o titular e mantém o cadastro manual', async () => {
    textoDoPdf.mockResolvedValue('')
    falso.reiniciar(cenario())
    const usuario = userEvent.setup()
    renderizarApp('/licencas/nova')
    await enviarPdf(usuario)
    expect(await screen.findByText('Não achamos o titular no texto do PDF.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cadastrar agora' })).toBeInTheDocument()
  })

  it('"Extrair com IA" desabilitado diz o porquê em uma linha (sem PDF)', async () => {
    falso.reiniciar(cenario())
    renderizarApp('/licencas/nova')
    const ia = await screen.findByRole('radio', { name: 'Extrair com IA' })
    expect(ia).toBeDisabled()
    expect(ia).toHaveAccessibleDescription(
      'Envie o PDF da licença para a IA ler. O manual aceita sem PDF.',
    )
  })
})
