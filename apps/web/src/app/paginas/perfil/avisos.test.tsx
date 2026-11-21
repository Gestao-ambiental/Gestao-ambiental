// Perfil › Avisos (ADR-0047): resumo diário ligado por padrão, desligar com controle de versão e o
// link do calendário (aparece uma vez ao gerar, com copiar; gerar de novo e revogar pedem confirmação).
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const ana = sessaoDe('ana@filtroville.test', 'Ana Ribeiro')
const TOKEN = 'b'.repeat(64)
const URL_DO_FEED = `https://projeto.supabase.test/functions/v1/feed-calendario/${TOKEN}.ics`

const SEM_PREFERENCIA = {
  resumo_diario: true,
  row_version: 0,
  link_ativo: false,
  link_criado_em: null,
  link_ultimo_acesso_em: null,
}
const COM_LINK = {
  resumo_diario: false,
  row_version: 2,
  link_ativo: true,
  link_criado_em: '2026-11-18T13:00:00Z',
  link_ultimo_acesso_em: '2026-11-19T02:30:00Z',
}

function cenario(rpc: Cenario['rpc'] = {}): Cenario {
  return {
    sessao: ana,
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', 'equipe', { membro_id: 'm-ana' })] },
      meus_avisos: { data: [SEM_PREFERENCIA] },
      definir_resumo_diario: { data: 1 },
      gerar_link_do_calendario: { data: TOKEN },
      revogar_link_do_calendario: { data: true },
      ...rpc,
    },
    tabelas: {
      membro: [
        {
          id: 'm-ana',
          nome: 'Ana Ribeiro',
          papel: 'equipe',
          cargo: null,
          foto: null,
          profissao: 'biologo',
          outras_profissoes: [],
          profissao_em_curso: false,
          genero: 'feminino',
        },
      ],
    },
  }
}

async function secao() {
  const titulo = await screen.findByRole('heading', { name: 'Avisos' })
  const elemento = titulo.closest('section')
  if (!elemento) throw new Error('seção Avisos não encontrada')
  return within(elemento)
}

function chamadas(nome: string) {
  return falso.cliente.rpc.mock.calls.filter(([n]) => n === nome)
}

describe('meu perfil: avisos', () => {
  beforeEach(() => {
    falso.reiniciar(cenario())
    vi.stubEnv('VITE_SUPABASE_URL', 'https://projeto.supabase.test')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anonima')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('sem preferência gravada: o resumo diário vem ligado e não há link', async () => {
    renderizarApp('/perfil')
    const avisos = await secao()
    expect(await avisos.findByRole('checkbox', { name: 'Resumo diário por e-mail' })).toBeChecked()
    expect(avisos.getByRole('button', { name: 'Gerar link' })).toBeInTheDocument()
    expect(avisos.queryByText(/Ativo desde/)).not.toBeInTheDocument()
    expect(falso.cliente.rpc).toHaveBeenCalledWith('meus_avisos', {
      p_consultoria_id: 'c-Filtroville',
    })
  })

  it('desliga o resumo mandando a versão lida', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/perfil')
    const avisos = await secao()

    await usuario.click(await avisos.findByRole('checkbox', { name: 'Resumo diário por e-mail' }))

    expect(falso.cliente.rpc).toHaveBeenCalledWith('definir_resumo_diario', {
      p_consultoria_id: 'c-Filtroville',
      p_ligado: false,
      p_row_version: 0,
    })
  })

  it('conflito de versão: mostra a mensagem e relê a preferência', async () => {
    falso.reiniciar(
      cenario({
        definir_resumo_diario: { error: { code: 'P0001', message: 'conflito_de_versao' } },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/perfil')
    const avisos = await secao()
    await usuario.click(await avisos.findByRole('checkbox', { name: 'Resumo diário por e-mail' }))

    expect(await avisos.findByRole('alert')).toHaveTextContent(/alterado em outro lugar/)
    await waitFor(() => {
      expect(chamadas('meus_avisos').length).toBeGreaterThanOrEqual(2)
    })
  })

  it('gera o link, mostra o endereço uma vez e copia', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/perfil')
    const avisos = await secao()

    await usuario.click(await avisos.findByRole('button', { name: 'Gerar link' }))

    const campo = await avisos.findByRole('textbox', { name: 'Endereço do calendário' })
    expect(campo).toHaveValue(URL_DO_FEED)
    expect(campo).toHaveAttribute('readonly')
    expect(falso.cliente.rpc).toHaveBeenCalledWith('gerar_link_do_calendario', {
      p_consultoria_id: 'c-Filtroville',
    })

    await usuario.click(avisos.getByRole('button', { name: 'Copiar' }))
    expect(await avisos.findByText('Copiado')).toBeInTheDocument()
    await expect(navigator.clipboard.readText()).resolves.toBe(URL_DO_FEED)

    // O endereço só vive na tela: nada no armazenamento do navegador.
    for (const armazenamento of [window.localStorage, window.sessionStorage]) {
      for (let i = 0; i < armazenamento.length; i++) {
        expect(armazenamento.getItem(armazenamento.key(i) ?? '')).not.toContain(TOKEN)
      }
    }
  })

  it('com link ativo: mostra desde quando e o último uso no fuso da consultoria', async () => {
    falso.reiniciar(cenario({ meus_avisos: { data: [COM_LINK] } }))
    renderizarApp('/perfil')
    const avisos = await secao()

    expect(
      await avisos.findByText('Ativo desde 18/11/2026 · último uso 18/11/2026'),
    ).toBeInTheDocument()
    expect(avisos.getByRole('checkbox', { name: 'Resumo diário por e-mail' })).not.toBeChecked()
    expect(avisos.queryByRole('button', { name: 'Gerar link' })).not.toBeInTheDocument()
    expect(
      avisos.queryByRole('textbox', { name: 'Endereço do calendário' }),
    ).not.toBeInTheDocument()
  })

  it('gerar novo link pede confirmação; cancelar não chama o banco', async () => {
    falso.reiniciar(cenario({ meus_avisos: { data: [COM_LINK] } }))
    const usuario = userEvent.setup()
    renderizarApp('/perfil')
    const avisos = await secao()

    await usuario.click(await avisos.findByRole('button', { name: 'Gerar novo link' }))
    let dialogo = await screen.findByRole('dialog', { name: 'Gerar novo link?' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(chamadas('gerar_link_do_calendario')).toHaveLength(0)

    await usuario.click(avisos.getByRole('button', { name: 'Gerar novo link' }))
    dialogo = await screen.findByRole('dialog', { name: 'Gerar novo link?' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Gerar novo link' }))

    expect(await avisos.findByRole('textbox', { name: 'Endereço do calendário' })).toHaveValue(
      URL_DO_FEED,
    )
    expect(chamadas('gerar_link_do_calendario')).toHaveLength(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('revoga com confirmação e o endereço some', async () => {
    let ativo = true
    falso.reiniciar(
      cenario({
        meus_avisos: () => ({ data: [ativo ? COM_LINK : { ...COM_LINK, link_ativo: false }] }),
        gerar_link_do_calendario: { data: TOKEN },
        revogar_link_do_calendario: () => {
          ativo = false
          return { data: true }
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/perfil')
    const avisos = await secao()

    await usuario.click(await avisos.findByRole('button', { name: 'Gerar novo link' }))
    await usuario.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Gerar novo link' }),
    )
    await avisos.findByRole('textbox', { name: 'Endereço do calendário' })

    await usuario.click(avisos.getByRole('button', { name: 'Revogar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Revogar o link do calendário?' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Revogar' }))

    expect(falso.cliente.rpc).toHaveBeenCalledWith('revogar_link_do_calendario', {
      p_consultoria_id: 'c-Filtroville',
    })
    expect(await avisos.findByRole('button', { name: 'Gerar link' })).toBeInTheDocument()
    expect(
      avisos.queryByRole('textbox', { name: 'Endereço do calendário' }),
    ).not.toBeInTheDocument()
  })

  it('falha ao gerar: mostra o erro e não mostra endereço', async () => {
    falso.reiniciar(
      cenario({
        gerar_link_do_calendario: {
          error: { code: 'P0001', message: 'acesso_de_suporte_somente_leitura' },
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/perfil')
    const avisos = await secao()

    await usuario.click(await avisos.findByRole('button', { name: 'Gerar link' }))

    expect(await avisos.findByRole('alert')).toHaveTextContent(
      'Acesso de suporte é somente leitura.',
    )
    expect(
      avisos.queryByRole('textbox', { name: 'Endereço do calendário' }),
    ).not.toBeInTheDocument()
  })

  it('erro ao carregar: tentar de novo', async () => {
    let falhar = true
    falso.reiniciar(
      cenario({
        meus_avisos: () =>
          falhar ? { error: { code: 'XX000', message: 'falha' } } : { data: [SEM_PREFERENCIA] },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/perfil')
    const avisos = await secao()

    await usuario.click(await avisos.findByRole('button', { name: 'Tentar de novo' }))
    falhar = false
    await usuario.click(avisos.getByRole('button', { name: 'Tentar de novo' }))
    expect(await avisos.findByRole('checkbox', { name: 'Resumo diário por e-mail' })).toBeChecked()
  })

  it('sem permissão: estado próprio, sem controles', async () => {
    falso.reiniciar(
      cenario({ meus_avisos: { error: { code: '42501', message: 'sem_permissao' } } }),
    )
    renderizarApp('/perfil')
    const avisos = await secao()

    expect(await avisos.findByText('Você não tem acesso a esta área')).toBeInTheDocument()
    expect(avisos.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('não tem violações de acessibilidade detectáveis pelo axe', async () => {
    const usuario = userEvent.setup()
    const { container } = renderizarApp('/perfil')
    const avisos = await secao()
    await usuario.click(await avisos.findByRole('button', { name: 'Gerar link' }))
    await avisos.findByRole('textbox', { name: 'Endereço do calendário' })
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})
