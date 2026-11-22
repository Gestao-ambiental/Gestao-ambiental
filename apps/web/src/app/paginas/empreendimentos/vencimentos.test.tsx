// Seção Vencimentos do empreendimento e o diálogo (ADR-0046): substitui a seção Alvarás.
import { adicionarDias, hojeNoFuso } from '@gestao-ambiental/domain'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

import { ordenarVencimentos } from './vencimentos-do-empreendimento'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const eduardo = sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp')
const hoje = hojeNoFuso(new Date(), 'America/Sao_Paulo')

const TIPOS = [
  { id: 't-alvara', nome: 'Alvará', antecedencia_dias: 60, exige_pdf: true, ativo: true },
  { id: 't-art', nome: 'ART', antecedencia_dias: 30, exige_pdf: false, ativo: true },
  { id: 't-velho', nome: 'Licença antiga', antecedencia_dias: 60, exige_pdf: false, ativo: false },
]

function vencimento(
  id: string,
  numero: string | null,
  validoAte: string,
  extra: Partial<{
    anterior: string | null
    tipo: string
    tipoNome: string
    pdf: boolean
    instrumento: boolean
  }> = {},
) {
  return {
    id,
    row_version: 2,
    tipo_vencimento_id: extra.tipo ?? 't-alvara',
    unidade_id: 'u1',
    instrumento_id: extra.instrumento ? 'i1' : null,
    numero,
    orgao: 'Prefeitura de Joinville',
    notas: null,
    emitido_em: null,
    emitido_texto: null,
    valido_ate: validoAte,
    validade_texto: null,
    antecedencia_dias: 60,
    responsavel_tecnico_id: null,
    anterior_id: extra.anterior ?? null,
    tipo: { nome: extra.tipoNome ?? 'Alvará' },
    unidade: { nome: 'Matriz' },
    instrumento: extra.instrumento ? { numero: '1234/2024', tipo: { sigla: 'LAO' } } : null,
    responsavel_tecnico: null,
    documento:
      extra.pdf === false
        ? null
        : { versao: { caminho: `c-Filtroville/vencimento/${id}.pdf`, nome_original: `${id}.pdf` } },
  }
}

const SERIE = [
  vencimento('a2', '2200/2027', '2999-05-31', { anterior: 'a1', instrumento: true }),
  vencimento('a1', '1234/2026', '2026-05-31'),
  vencimento('art', 'ART 77', adicionarDias(hoje, 10), {
    tipo: 't-art',
    tipoNome: 'ART',
    pdf: false,
  }),
  vencimento('avcb', null, adicionarDias(hoje, -5), {
    tipo: 't-avcb',
    tipoNome: 'AVCB',
    pdf: false,
  }),
]

function cenario(papel: 'gestao' | 'equipe', vencimentos: unknown[] = SERIE): Cenario {
  return {
    sessao: eduardo,
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', papel)] },
      cadastrar_vencimento: (args) => ({ data: args.p_id }),
      renovar_vencimento: (args) => ({ data: args.p_id }),
      editar_vencimento: { data: 3 },
      trocar_pdf_vencimento: (args) => ({ data: args.p_versao_id }),
      excluir_vencimento: { data: null },
    },
    tabelas: {
      empreendimento: [{ id: 'e1', nome: 'Padaria Boa Vista', cnpj: null, cliente: null }],
      unidade: [{ id: 'u1', nome: 'Matriz', endereco: null }],
      vencimento: vencimentos,
      tipo_vencimento: TIPOS,
      membro: [{ id: 'm1', nome: 'Ana Ribeiro' }],
    },
  }
}

async function tabela() {
  const secao = await screen.findByRole('region', { name: 'Vencimentos' })
  return within(secao).findByRole('table', { name: 'Vencimentos do empreendimento' })
}

async function acaoDaLinha(nome: string, item: string) {
  const usuario = userEvent.setup()
  await usuario.click(within(await tabela()).getByRole('button', { name: `Ações de ${nome}` }))
  await usuario.click(await screen.findByRole('menuitem', { name: item }))
  return usuario
}

async function anexar(dialogo: HTMLElement, usuario: ReturnType<typeof userEvent.setup>) {
  const entrada = document.querySelector<HTMLInputElement>('[data-testid="pdf-do-vencimento"]')
  if (!entrada) throw new Error('campo de arquivo ausente')
  await usuario.upload(
    entrada,
    new File(['%PDF-1.4 vencimento'], 'novo.pdf', { type: 'application/pdf' }),
  )
  expect(await within(dialogo).findByText('novo.pdf')).toBeInTheDocument()
}

describe('vencimentos do empreendimento (ADR-0046)', () => {
  beforeEach(() => {
    falso.reiniciar(cenario('gestao'))
  })

  it('quadro: vigentes pela validade, renovado embaixo, situação por extenso e licença', async () => {
    const { container } = renderizarApp('/empreendimentos/e1')
    const quadro = await tabela()
    const linhas = within(quadro).getAllByRole('row').slice(1)
    expect(linhas.map((l) => within(l).getAllByRole('cell')[1]?.textContent)).toEqual([
      'AVCBPrefeitura de Joinville',
      'ART ART 77Prefeitura de Joinville',
      'Alvará 2200/2027LAO 1234/2024 · Prefeitura de Joinville',
      'Alvará 1234/2026Prefeitura de Joinville',
    ])
    const [vencido, aVencer, vigente, renovado] = linhas as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ]
    expect(within(vencido).getByText('Vencido')).toBeInTheDocument()
    expect(within(aVencer).getByText('A vencer')).toBeInTheDocument()
    expect(within(vigente).getByText('Vigente')).toBeInTheDocument()
    expect(within(vigente).getByText('31/05/2999')).toBeInTheDocument()
    expect(within(renovado).getByText('Renovado')).toBeInTheDocument()
    expect(
      within(quadro).getByRole('button', { name: 'Abrir PDF de Alvará 1234/2026' }),
    ).toBeInTheDocument()
    // O "Novo" não fica solto na seção: está no "…" do empreendimento.
    expect(screen.queryByRole('button', { name: 'Novo vencimento' })).not.toBeInTheDocument()

    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })

  it('o renovado não se renova nem se exclui de novo', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/empreendimentos/e1')
    await usuario.click(
      within(await tabela()).getByRole('button', { name: 'Ações de Alvará 1234/2026' }),
    )
    const itens = await screen.findAllByRole('menuitem')
    expect(itens.map((i) => i.textContent)).toEqual(['Editar', 'Trocar PDF'])
  })

  it('renovar exige validade e o PDF do Alvará e manda o anterior com o row_version', async () => {
    renderizarApp('/empreendimentos/e1')
    const usuario = await acaoDaLinha('Alvará 2200/2027', 'Renovar')
    const dialogo = await screen.findByRole('dialog', { name: 'Renovar Alvará 2200/2027' })
    // Tipo e unidade vêm do anterior e não mudam; a licença ligada vem pré-preenchida.
    expect(await within(dialogo).findByLabelText('Tipo *')).toBeDisabled()
    expect(within(dialogo).getByLabelText('Unidade')).toBeDisabled()
    expect(within(dialogo).getByLabelText('Licença')).toHaveDisplayValue('LAO 1234/2024')
    expect(within(dialogo).getByLabelText('Órgão')).toHaveValue('Prefeitura de Joinville')

    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar vencimento' }))
    expect(await within(dialogo).findByText('Informe a validade')).toBeInTheDocument()
    expect(within(dialogo).getByText('Anexe o PDF')).toBeInTheDocument()
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('renovar_vencimento', expect.anything())

    await usuario.type(within(dialogo).getByLabelText('Válido até *'), '31/05/2028')
    await usuario.type(within(dialogo).getByLabelText('Número'), '3100/2028')
    await anexar(dialogo, usuario)
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar vencimento' }))

    await vi.waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'renovar_vencimento',
        expect.objectContaining({
          p_anterior_id: 'a2',
          p_row_version_anterior: 2,
          p_valido_ate: '2028-05-31',
          p_numero: '3100/2028',
          p_instrumento_id: 'i1',
          p_antecedencia_dias: 60,
          p_nome_original: 'novo.pdf',
          p_caminho: expect.stringMatching(
            /^c-Filtroville\/vencimento\/[0-9a-f-]+\.pdf$/,
          ) as unknown,
        }) as unknown,
      )
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('trocar o PDF depois de um erro gera versão nova; repetir com o mesmo PDF não', async () => {
    // O Storage não sobrescreve: com o mesmo caminho, o objeto ficaria com o PDF antigo e a linha
    // da versão com o nome e o SHA-256 do novo.
    const base = cenario('gestao')
    falso.reiniciar({
      ...base,
      rpc: {
        ...base.rpc,
        renovar_vencimento: { error: { code: 'P0001', message: 'conflito_de_versao' } },
      },
    })
    renderizarApp('/empreendimentos/e1')
    const usuario = await acaoDaLinha('Alvará 2200/2027', 'Renovar')
    const dialogo = await screen.findByRole('dialog', { name: 'Renovar Alvará 2200/2027' })
    await usuario.type(within(dialogo).getByLabelText('Válido até *'), '31/05/2028')
    const entrada = document.querySelector<HTMLInputElement>('[data-testid="pdf-do-vencimento"]')
    if (!entrada) throw new Error('campo de arquivo ausente')
    const chamadas = () =>
      falso.cliente.rpc.mock.calls
        .filter(([nome]) => nome === 'renovar_vencimento')
        .map(([, args]) => args as Record<string, string>)
    const enviar = async (vezes: number) => {
      await usuario.click(await within(dialogo).findByRole('button', { name: 'Salvar vencimento' }))
      await vi.waitFor(() => {
        expect(chamadas()).toHaveLength(vezes)
      })
    }

    await usuario.upload(entrada, new File(['%PDF-1.4 a'], 'a.pdf', { type: 'application/pdf' }))
    expect(await within(dialogo).findByText('a.pdf')).toBeInTheDocument()
    await enviar(1)
    await enviar(2)
    await usuario.upload(entrada, new File(['%PDF-1.4 b'], 'b.pdf', { type: 'application/pdf' }))
    expect(await within(dialogo).findByText('b.pdf')).toBeInTheDocument()
    await enviar(3)

    const [primeira, repetida, trocada] = chamadas()
    expect(repetida?.p_versao_id).toBe(primeira?.p_versao_id)
    expect(trocada?.p_versao_id).not.toBe(primeira?.p_versao_id)
    expect(trocada?.p_nome_original).toBe('b.pdf')
    expect(trocada?.p_caminho).toBe(`c-Filtroville/vencimento/${trocada?.p_versao_id ?? ''}.pdf`)
  })

  it('"Novo vencimento" no "…" do empreendimento: tipo ativo, antecedência do tipo, PDF opcional', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/empreendimentos/e1')
    await tabela()
    await usuario.click(screen.getByRole('button', { name: 'Mais ações' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Novo vencimento' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo vencimento' })

    const tipo = await within(dialogo).findByLabelText('Tipo *')
    // Tipo desativado não serve para vencimento novo.
    expect(within(tipo).queryByRole('option', { name: /Licença antiga/ })).not.toBeInTheDocument()
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar vencimento' }))
    expect(await within(dialogo).findByText('Escolha o tipo')).toBeInTheDocument()

    await usuario.selectOptions(tipo, 'ART')
    expect(within(dialogo).getByLabelText('Antecedência em dias *')).toHaveValue('30')
    expect(within(dialogo).getByText('PDF')).toBeInTheDocument()
    await usuario.selectOptions(
      within(dialogo).getByLabelText('Responsável técnico'),
      'Ana Ribeiro',
    )
    await usuario.type(within(dialogo).getByLabelText('Número'), 'ART 99')
    await usuario.type(within(dialogo).getByLabelText('Válido até *'), '31/12/2027')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar vencimento' }))

    await vi.waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'cadastrar_vencimento',
        expect.objectContaining({
          p_empreendimento_id: 'e1',
          p_tipo_vencimento_id: 't-art',
          p_unidade_id: null,
          p_valido_ate: '2027-12-31',
          p_numero: 'ART 99',
          p_antecedencia_dias: 30,
          p_responsavel_tecnico_id: 'm1',
          p_versao_id: null,
        }) as unknown,
      )
    })
  })

  it('emissão depois da validade é recusada na tela', async () => {
    renderizarApp('/empreendimentos/e1')
    const usuario = await acaoDaLinha('ART ART 77', 'Editar')
    const dialogo = await screen.findByRole('dialog', { name: 'Editar ART ART 77' })
    await usuario.type(await within(dialogo).findByLabelText('Emitido em'), '01/01/2199')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar vencimento' }))
    expect(
      await within(dialogo).findByText('A emissão não pode ser depois da validade'),
    ).toBeInTheDocument()
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('editar_vencimento', expect.anything())
  })

  it('editar manda todos os campos com o row_version', async () => {
    renderizarApp('/empreendimentos/e1')
    const usuario = await acaoDaLinha('Alvará 2200/2027', 'Editar')
    const dialogo = await screen.findByRole('dialog', { name: 'Editar Alvará 2200/2027' })
    const numero = await within(dialogo).findByLabelText('Número')
    expect(numero).toHaveValue('2200/2027')
    await usuario.clear(numero)
    await usuario.type(numero, '2201/2027')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar vencimento' }))
    await vi.waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'editar_vencimento',
        expect.objectContaining({
          p_vencimento_id: 'a2',
          p_row_version: 2,
          p_tipo_vencimento_id: 't-alvara',
          p_unidade_id: 'u1',
          p_numero: '2201/2027',
          p_valido_ate: '2999-05-31',
        }) as unknown,
      )
    })
  })

  it('trocar o PDF pede o arquivo e grava uma versão nova', async () => {
    renderizarApp('/empreendimentos/e1')
    const usuario = await acaoDaLinha('Alvará 2200/2027', 'Trocar PDF')
    const dialogo = await screen.findByRole('dialog', { name: 'Trocar PDF · Alvará 2200/2027' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar PDF' }))
    expect(await within(dialogo).findByText('Anexe o PDF')).toBeInTheDocument()
    await anexar(dialogo, usuario)
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar PDF' }))
    await vi.waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'trocar_pdf_vencimento',
        expect.objectContaining({ p_vencimento_id: 'a2', p_nome_original: 'novo.pdf' }) as unknown,
      )
    })
  })

  it('exclusão pede confirmação; recusa do banco aparece no diálogo e o item fica', async () => {
    const base = cenario('gestao')
    falso.reiniciar({
      ...base,
      rpc: {
        ...base.rpc,
        excluir_vencimento: { error: { code: 'P0001', message: 'vencimento_ja_renovado' } },
      },
    })
    renderizarApp('/empreendimentos/e1')
    const usuario = await acaoDaLinha('Alvará 2200/2027', 'Excluir')
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir Alvará 2200/2027?' })
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('excluir_vencimento', expect.anything())
    await usuario.click(within(dialogo).getByRole('button', { name: 'Excluir vencimento' }))
    expect(
      await within(dialogo).findByText('Este vencimento já foi renovado. Recarregue a página.'),
    ).toBeInTheDocument()
    expect(falso.cliente.rpc).toHaveBeenCalledWith('excluir_vencimento', {
      p_vencimento_id: 'a2',
      p_row_version: 2,
    })
    // O diálogo esconde o resto da tela do leitor de tela; o item continua lá.
    expect(screen.getAllByText('Alvará 2200/2027').length).toBeGreaterThan(0)
  })

  it('a Equipe vê os vencimentos e o PDF, mas sem o "…" de cada linha', async () => {
    falso.reiniciar(cenario('equipe'))
    renderizarApp('/empreendimentos/e1')
    const quadro = await tabela()
    expect(within(quadro).getByText('Alvará 2200/2027')).toBeInTheDocument()
    expect(within(quadro).queryByRole('button', { name: /^Ações de/ })).not.toBeInTheDocument()
    expect(
      within(quadro).getByRole('button', { name: 'Abrir PDF de Alvará 2200/2027' }),
    ).toBeInTheDocument()
  })

  it('sem vencimento, a seção some (Gestão e Equipe)', async () => {
    for (const papel of ['gestao', 'equipe'] as const) {
      falso.reiniciar(cenario(papel, []))
      const { unmount } = renderizarApp('/empreendimentos/e1')
      await screen.findByRole('region', { name: 'Licenças' })
      await waitFor(() => {
        expect(falso.cliente.from).toHaveBeenCalledWith('vencimento')
      })
      await new Promise((resolver) => setTimeout(resolver, 20))
      expect(screen.queryByRole('region', { name: 'Vencimentos' })).not.toBeInTheDocument()
      unmount()
    }
  })

  it('erro ao carregar: mensagem e "tentar de novo"', async () => {
    const original = falso.cliente.from.getMockImplementation()
    if (!original) throw new Error('falso sem implementação de from')
    falso.cliente.from.mockImplementation((nome: string) => {
      if (nome !== 'vencimento') return original(nome)
      const construtor = {
        select: () => construtor,
        eq: () => construtor,
        is: () => construtor,
        order: () => construtor,
        range: () => Promise.resolve({ data: null, error: { code: '08006', message: 'rede' } }),
      }
      return construtor as unknown as ReturnType<typeof original>
    })
    try {
      renderizarApp('/empreendimentos/e1')
      expect(
        await screen.findByText('Não foi possível carregar os vencimentos.'),
      ).toBeInTheDocument()
      const secao = screen.getByRole('region', { name: 'Vencimentos' })
      expect(within(secao).getByRole('button', { name: /tentar de novo/i })).toBeInTheDocument()
    } finally {
      falso.cliente.from.mockImplementation(original)
    }
  })
})

describe('ordem dos vencimentos', () => {
  it('vigentes pela validade mais próxima; renovados do mais novo ao mais antigo', () => {
    const v = (id: string, validoAte: string, renovado: boolean) =>
      ({ id, validoAte, renovado }) as Parameters<typeof ordenarVencimentos>[0][number]
    expect(
      ordenarVencimentos([
        v('r1', '2024-01-01', true),
        v('b', '2028-01-01', false),
        v('r2', '2025-01-01', true),
        v('a', '2027-01-01', false),
      ]).map((x) => x.id),
    ).toEqual(['a', 'b', 'r2', 'r1'])
  })
})
