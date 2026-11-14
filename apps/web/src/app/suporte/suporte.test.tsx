import { rotuloDoFimDoSuporte } from '@gestao-ambiental/domain'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { describe, expect, it, vi } from 'vitest'

import { formatarInstanteComHora } from '@/lib/datas'
import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario, type CenarioDoisFatores } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const SP = 'America/Sao_Paulo'
const HORA = 60 * 60_000
const eduardo = sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp')
const ana = sessaoDe('ana@filtroville.test', 'Ana Ribeiro')
const operador = sessaoDe('kadu@grama.test', 'Kadu Operador')
const COM_DOIS_FATORES: CenarioDoisFatores = {
  nivel: 'aal2',
  fatores: [{ id: 'fator-1', status: 'verified' }],
}

function daqui(ms: number) {
  return new Date(Date.now() + ms).toISOString()
}

function acesso(extra: Record<string, unknown> = {}) {
  return {
    id: 'ac-1',
    modo: 'autorizado',
    categoria: null,
    motivo: 'Erro ao gerar a proposta',
    inicio: '2026-11-14T13:00:00Z',
    fim_previsto: daqui(2 * HORA),
    ativo: true,
    encerrado_em: null,
    encerramento: null,
    encerrado_por_nome: null,
    autorizado_por_nome: 'Eduardo Karnopp',
    aberto_por_nome: null,
    entradas: [{ nome: 'Kadu Operador', instante: '2026-11-14T13:05:00Z' }],
    aviso_visto_em: null,
    aviso_visto_por_nome: null,
    total: 1,
    ...extra,
  }
}

const emergenciaEncerrada = acesso({
  id: 'ac-0',
  modo: 'emergencia',
  categoria: 'falha_grave',
  motivo: 'Sistema fora para a consultoria',
  inicio: '2026-11-10T13:00:00Z',
  fim_previsto: '2026-11-10T15:00:00Z',
  ativo: false,
  encerrado_em: '2026-11-10T14:00:00Z',
  encerramento: 'operador',
  encerrado_por_nome: 'Kadu Operador',
  autorizado_por_nome: null,
  aberto_por_nome: 'Kadu Operador',
  entradas: [{ nome: 'Kadu Operador', instante: '2026-11-10T13:00:00Z' }],
  aviso_visto_em: '2026-11-10T13:30:00Z',
  aviso_visto_por_nome: 'Eduardo Karnopp',
  total: 2,
})

function chamadas(nome: string) {
  return falso.cliente.rpc.mock.calls.filter(([rpc]) => rpc === nome)
}

// ---------------------------------------------------------------------------
// Gestão
// ---------------------------------------------------------------------------

function cenarioDaGestao(
  rpc: Cenario['rpc'] = {},
  sessao = eduardo,
  papel: 'gestao' | 'equipe' = 'gestao',
) {
  falso.reiniciar({
    sessao,
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', papel)] },
      listar_acessos_de_suporte: { data: [] },
      avisos_de_suporte_pendentes: { data: [] },
      autorizar_acesso_de_suporte: (args) => ({ data: args.p_id }),
      encerrar_acesso_de_suporte: { data: null },
      ...rpc,
    },
  })
}

describe('acesso de suporte: Gestão na Equipe (ADR-0025)', () => {
  it('sem autorização: permite por 24 horas com motivo e o banco recebe a escolha', async () => {
    cenarioDaGestao()
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/equipe')

    const secao = await screen.findByRole('region', { name: 'Acessos do suporte' })
    expect(await within(secao).findByText('Sem autorização')).toBeInTheDocument()
    expect(within(secao).getByText('Nenhum acesso do suporte')).toBeInTheDocument()

    await usuario.click(within(secao).getByRole('button', { name: 'Permitir acesso do suporte' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Permitir acesso do suporte' })
    const opcoes = within(dialogo)
      .getAllByRole('radio')
      .map((r) => r.getAttribute('value'))
    expect(opcoes).toEqual(['2', '24', '48'])
    expect(within(dialogo).getByRole('radio', { name: '2 horas' })).toBeChecked()

    await usuario.click(within(dialogo).getByRole('radio', { name: '24 horas' }))
    await usuario.type(
      within(dialogo).getByRole('textbox', { name: 'Motivo (opcional)' }),
      '  Proposta não gera PDF  ',
    )
    await usuario.click(within(dialogo).getByRole('button', { name: 'Permitir acesso' }))

    expect(await screen.findByText('Acesso do suporte permitido.')).toBeInTheDocument()
    const [chamada] = chamadas('autorizar_acesso_de_suporte')
    expect(chamada?.[1]).toMatchObject({
      p_consultoria_id: 'c-Filtroville',
      p_horas: 24,
      p_motivo: 'Proposta não gera PDF',
    })
    expect(chamada?.[1]?.p_id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('autorização valendo: mostra até quando e encerra na hora', async () => {
    const valendo = acesso()
    cenarioDaGestao({ listar_acessos_de_suporte: { data: [valendo] } })
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/equipe')

    const secao = await screen.findByRole('region', { name: 'Acessos do suporte' })
    expect(
      await within(secao).findByText(
        `Autorizado até ${formatarInstanteComHora(valendo.fim_previsto, SP)}`,
      ),
    ).toBeInTheDocument()
    expect(
      within(secao).queryByRole('button', { name: 'Permitir acesso do suporte' }),
    ).not.toBeInTheDocument()

    await usuario.click(within(secao).getByRole('button', { name: 'Encerrar acesso do suporte' }))
    expect(await within(secao).findByText('Acesso do suporte encerrado.')).toBeInTheDocument()
    expect(chamadas('encerrar_acesso_de_suporte')[0]?.[1]).toEqual({ p_acesso_id: 'ac-1' })
  })

  it('histórico: modo, quem, categoria, motivo, encerramento, entradas e aviso visto', async () => {
    cenarioDaGestao({
      listar_acessos_de_suporte: {
        data: [acesso({ total: 2 }), emergenciaEncerrada],
      },
    })
    renderizarApp('/configuracoes/equipe')

    const lista = await screen.findByRole('list', { name: 'Histórico de acessos do suporte' })
    const [autorizado, emergencia] = Array.from(lista.querySelectorAll<HTMLElement>(':scope > li'))
    if (!autorizado || !emergencia) throw new Error('histórico sem os dois acessos')
    expect(within(autorizado).getByText('Autorizado')).toBeInTheDocument()
    // Selo e encerramento: ainda valendo.
    expect(within(autorizado).getAllByText('Valendo')).toHaveLength(2)
    expect(within(autorizado).getByText('Erro ao gerar a proposta')).toBeInTheDocument()
    expect(within(autorizado).getByText('Kadu Operador em 14/11/2026 às 10:05')).toBeInTheDocument()

    const item = emergencia
    expect(within(item).getByText('Emergência')).toBeInTheDocument()
    expect(within(item).getByText('Encerrado')).toBeInTheDocument()
    expect(within(item).getByText('Falha grave que impede o uso')).toBeInTheDocument()
    expect(
      within(item).getByText('Pelo suporte (Kadu Operador) em 10/11/2026 às 11:00'),
    ).toBeInTheDocument()
    expect(
      within(item).getByText('Visto por Eduardo Karnopp em 10/11/2026 às 10:30'),
    ).toBeInTheDocument()
  })

  it('erro ao carregar o histórico mostra o erro com "Tentar de novo"', async () => {
    cenarioDaGestao({
      listar_acessos_de_suporte: { error: { code: '08006', message: 'falha de rede' } },
    })
    renderizarApp('/configuracoes/equipe')
    const secao = await screen.findByRole('region', { name: 'Acessos do suporte' })
    expect(await within(secao).findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar os acessos do suporte.',
    )
    expect(within(secao).getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('não tem violações de acessibilidade detectáveis pelo axe (seção e diálogo)', async () => {
    cenarioDaGestao({
      listar_acessos_de_suporte: {
        data: [
          acesso({
            ativo: false,
            total: 2,
            encerramento: 'prazo',
            encerrado_em: '2026-11-14T15:00:00Z',
          }),
          emergenciaEncerrada,
        ],
      },
    })
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/equipe')
    const secao = await screen.findByRole('region', { name: 'Acessos do suporte' })
    await within(secao).findByRole('list', { name: 'Histórico de acessos do suporte' })
    const resultado = await axe.run(secao, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])

    await usuario.click(within(secao).getByRole('button', { name: 'Permitir acesso do suporte' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Permitir acesso do suporte' })
    const doDialogo = await axe.run(dialogo, { rules: { 'color-contrast': { enabled: false } } })
    expect(doDialogo.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})

describe('acesso de suporte: aviso de emergência para a Gestão', () => {
  const aviso = {
    id: 'ac-9',
    categoria: 'incidente_de_seguranca',
    motivo: 'Tentativas de acesso suspeitas',
    inicio: '2026-11-14T13:00:00Z',
    fim_previsto: '2026-11-14T15:00:00Z',
    operador_nome: 'Kadu Operador',
  }

  it('faixa com data, hora, operador, categoria e motivo, até marcar como visto', async () => {
    let vistos = 0
    cenarioDaGestao({
      avisos_de_suporte_pendentes: () => ({ data: vistos > 0 ? [] : [aviso] }),
      marcar_aviso_de_suporte_visto: () => {
        vistos += 1
        return { data: null }
      },
    })
    const usuario = userEvent.setup()
    renderizarApp('/')

    const faixa = await screen.findByRole('region', { name: 'Avisos do suporte' })
    expect(within(faixa).getByText('Acesso de emergência do suporte')).toBeInTheDocument()
    expect(within(faixa).getByText('14/11/2026 às 10:00 · Kadu Operador')).toBeInTheDocument()
    expect(within(faixa).getByText('Categoria: Incidente de segurança')).toBeInTheDocument()
    expect(within(faixa).getByText('Motivo: Tentativas de acesso suspeitas')).toBeInTheDocument()

    await usuario.click(within(faixa).getByRole('button', { name: 'Marcar como visto' }))
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Avisos do suporte' })).not.toBeInTheDocument()
    })
    expect(chamadas('marcar_aviso_de_suporte_visto')[0]?.[1]).toEqual({ p_acesso_id: 'ac-9' })
  })

  it('Equipe não vê a faixa (nem consulta)', async () => {
    cenarioDaGestao({ avisos_de_suporte_pendentes: { data: [aviso] } }, ana, 'equipe')
    renderizarApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Visão da equipe' })
    expect(screen.queryByRole('region', { name: 'Avisos do suporte' })).not.toBeInTheDocument()
    expect(chamadas('avisos_de_suporte_pendentes')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Operador
// ---------------------------------------------------------------------------

const detalhe = {
  id: 'c-b',
  nome: 'Verde Sul Ambiental',
  criada_em: '2026-11-02T15:00:00Z',
  fuso: SP,
  situacao: 'ativa',
  situacao_motivo: null,
  situacao_alterada_em: null,
  situacao_alterada_por_nome: null,
  row_version: 1,
  gestao: [{ nome: 'Gustavo Pereira', email: 'gustavo@verdesul.test' }],
  pessoas_ativas: 2,
  orcamentos: 0,
  empreendimentos: 0,
  licencas: 0,
}

function meuAcesso(fim: string, modo = 'autorizado') {
  return {
    acesso_id: 'ac-1',
    consultoria_id: 'c-b',
    consultoria_nome: 'Verde Sul Ambiental',
    consultoria_fuso: SP,
    modo,
    fim_previsto: fim,
  }
}

function cenarioDoOperador(rpc: Cenario['rpc'] = {}, extra: Partial<Cenario> = {}) {
  falso.reiniciar({
    sessao: operador,
    doisFatores: COM_DOIS_FATORES,
    rpc: {
      sou_operador: { data: true },
      meus_vinculos: { data: [] },
      central_detalhar_consultoria: { data: [detalhe] },
      central_listar_pessoas: { data: [] },
      central_historico_situacao: { data: [] },
      central_uso_por_modulo: { data: [] },
      central_acessos_de_suporte: { data: [] },
      meus_acessos_de_suporte: { data: [] },
      sair_do_acesso_de_suporte: { data: null },
      ...rpc,
    },
    ...extra,
  })
}

/** Operador já dentro da consultoria como suporte (a escolha feita na central). */
function emModoSuporte() {
  window.localStorage.setItem(`grama:suporte:${operador.user.id}`, 'c-b')
}

describe('acesso de suporte: operador na central (ADR-0025)', () => {
  it('com autorização: mostra até quando, entra e navega só lendo, com a faixa e o horário', async () => {
    const fim = daqui(2 * HORA)
    let entrou = false
    cenarioDoOperador({
      central_acessos_de_suporte: { data: [acesso({ fim_previsto: fim, entradas: [] })] },
      entrar_como_suporte: () => {
        entrou = true
        return { data: 'ac-1' }
      },
      meus_acessos_de_suporte: () => ({ data: entrou ? [meuAcesso(fim)] : [] }),
    })
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/admin/consultorias/c-b')

    const secao = await screen.findByRole('region', { name: 'Acesso de suporte' })
    expect(
      await within(secao).findByText(`Autorizado até ${formatarInstanteComHora(fim, SP)}`),
    ).toBeInTheDocument()
    expect(
      within(secao).queryByRole('button', { name: 'Acesso de emergência' }),
    ).not.toBeInTheDocument()

    await usuario.click(within(secao).getByRole('button', { name: 'Entrar como suporte' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/')
    })

    const faixa = await screen.findByRole('region', { name: 'Acesso de suporte' })
    expect(within(faixa).getByRole('status')).toHaveTextContent(
      `Acesso de suporte · somente leitura · ${rotuloDoFimDoSuporte(fim, SP, new Date())}`,
    )
    expect(router.state.location.pathname).toBe('/')
    expect(chamadas('entrar_como_suporte')[0]?.[1]).toEqual({ p_consultoria_id: 'c-b' })
    // O rail mostra a consultoria como suporte; o suporte não registra uso.
    expect(screen.getAllByText('Suporte').length).toBeGreaterThan(0)
    expect(chamadas('registrar_uso')).toHaveLength(0)
  })

  it('"Sair do acesso de suporte" encerra no banco e volta para a consultoria na central', async () => {
    emModoSuporte()
    cenarioDoOperador({ meus_acessos_de_suporte: { data: [meuAcesso(daqui(HORA))] } })
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/')

    const faixa = await screen.findByRole('region', { name: 'Acesso de suporte' })
    await usuario.click(within(faixa).getByRole('button', { name: 'Sair do acesso de suporte' }))

    expect(await screen.findByText('Você saiu do acesso de suporte.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/consultorias/c-b')
    expect(chamadas('sair_do_acesso_de_suporte')[0]?.[1]).toEqual({ p_consultoria_id: 'c-b' })
    expect(window.localStorage.getItem(`grama:suporte:${operador.user.id}`)).toBeNull()
  })

  it('acesso encerrado pela Gestão ou vencido: o app sai do modo suporte e avisa', async () => {
    emModoSuporte()
    cenarioDoOperador({ meus_acessos_de_suporte: { data: [] } })
    const { router } = renderizarApp('/')
    expect(await screen.findByText('O acesso de suporte terminou.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/consultorias/c-b')
  })

  it('na Equipe, o suporte lê o histórico sem as ações da Gestão', async () => {
    emModoSuporte()
    cenarioDoOperador({
      meus_acessos_de_suporte: { data: [meuAcesso(daqui(HORA))] },
      listar_acessos_de_suporte: { data: [acesso()] },
    })
    renderizarApp('/configuracoes/equipe')

    const secao = await screen.findByRole('heading', { level: 2, name: 'Acessos do suporte' })
    expect(secao).toBeInTheDocument()
    expect(
      await screen.findByRole('list', { name: 'Histórico de acessos do suporte' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Convidar pessoa' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Encerrar acesso do suporte' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Permitir acesso do suporte' }),
    ).not.toBeInTheDocument()
    // Sem vínculo: nem cadastro a completar, nem foto de perfil, nem faixa de aviso da Gestão.
    expect(chamadas('avisos_de_suporte_pendentes')).toHaveLength(0)
  })

  it('escrita em modo suporte mostra "Acesso de suporte é somente leitura"', async () => {
    emModoSuporte()
    cenarioDoOperador({
      meus_acessos_de_suporte: { data: [meuAcesso(daqui(HORA))] },
      listar_empreendimentos: { data: [] },
      empreendimentos_parecidos: { data: [] },
      criar_empreendimento: {
        error: { code: '42501', message: 'acesso_de_suporte_somente_leitura' },
      },
    })
    const usuario = userEvent.setup()
    renderizarApp('/empreendimentos')

    await usuario.click(await screen.findByRole('button', { name: 'Novo empreendimento' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo empreendimento' })
    await usuario.type(within(dialogo).getByLabelText('Nome do empreendimento'), 'Intruso')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'Acesso de suporte é somente leitura.',
    )
  })

  it('escrita recusada antes de gravar (sem_permissao) também vira "somente leitura"', async () => {
    emModoSuporte()
    cenarioDoOperador({
      meus_acessos_de_suporte: { data: [meuAcesso(daqui(HORA))] },
      listar_empreendimentos: { data: [] },
      empreendimentos_parecidos: { data: [] },
      criar_empreendimento: { error: { code: '42501', message: 'sem_permissao' } },
    })
    const usuario = userEvent.setup()
    renderizarApp('/empreendimentos')

    await usuario.click(await screen.findByRole('button', { name: 'Novo empreendimento' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo empreendimento' })
    await usuario.type(within(dialogo).getByLabelText('Nome do empreendimento'), 'Intruso')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'Acesso de suporte é somente leitura.',
    )
  })
})

describe('acesso de suporte: emergência pela central', () => {
  async function abrirDialogo() {
    const usuario = userEvent.setup()
    const resultado = renderizarApp('/admin/consultorias/c-b')
    const secao = await screen.findByRole('region', { name: 'Acesso de suporte' })
    expect(await within(secao).findByText('Sem autorização')).toBeInTheDocument()
    await usuario.click(within(secao).getByRole('button', { name: 'Acesso de emergência' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Acesso de emergência' })
    return { usuario, dialogo, ...resultado }
  }

  it('exige categoria e motivo; abre, avisa a Gestão por e-mail e entra', async () => {
    const fim = daqui(2 * HORA)
    let aberto = false
    cenarioDoOperador(
      {
        abrir_acesso_de_emergencia: (args) => {
          aberto = true
          return { data: args.p_id }
        },
        meus_acessos_de_suporte: () => ({ data: aberto ? [meuAcesso(fim, 'emergencia')] : [] }),
      },
      { funcoes: { 'avisar-acesso-de-suporte': { data: { enviados: 1 } } } },
    )
    const { usuario, dialogo, router } = await abrirDialogo()

    await usuario.click(within(dialogo).getByRole('button', { name: 'Abrir acesso de emergência' }))
    expect(within(dialogo).getByText('Escolha a categoria')).toBeInTheDocument()
    expect(within(dialogo).getByText('Informe o motivo')).toBeInTheDocument()
    expect(within(dialogo).getByRole('textbox', { name: 'Motivo' })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(chamadas('abrir_acesso_de_emergencia')).toHaveLength(0)

    await usuario.click(
      within(dialogo).getByRole('radio', { name: 'Falha grave que impede o uso' }),
    )
    await usuario.type(within(dialogo).getByRole('textbox', { name: 'Motivo' }), 'Sistema fora')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Abrir acesso de emergência' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/')
    })

    const faixa = await screen.findByRole('region', { name: 'Acesso de suporte' })
    expect(within(faixa).getByRole('status')).toHaveTextContent('somente leitura')
    expect(router.state.location.pathname).toBe('/')
    const [chamada] = chamadas('abrir_acesso_de_emergencia')
    expect(chamada?.[1]).toMatchObject({
      p_consultoria_id: 'c-b',
      p_categoria: 'falha_grave',
      p_motivo: 'Sistema fora',
    })
    expect(falso.cliente.functions.invoke).toHaveBeenCalledWith('avisar-acesso-de-suporte', {
      body: { acessoId: chamada?.[1]?.p_id },
    })
  })

  it('e-mail que não sai: o acesso continua e a tela diz por quê antes de entrar', async () => {
    const fim = daqui(2 * HORA)
    let aberto = false
    cenarioDoOperador(
      {
        abrir_acesso_de_emergencia: (args) => {
          aberto = true
          return { data: args.p_id }
        },
        meus_acessos_de_suporte: () => ({ data: aberto ? [meuAcesso(fim, 'emergencia')] : [] }),
      },
      {
        funcoes: {
          'avisar-acesso-de-suporte': {
            error: new FunctionsHttpError(
              new Response(JSON.stringify({ erro: 'configuracao_ausente' }), { status: 503 }),
            ),
          },
        },
      },
    )
    const { usuario, dialogo, router } = await abrirDialogo()
    await usuario.click(within(dialogo).getByRole('radio', { name: 'Ordem legal ou judicial' }))
    await usuario.type(within(dialogo).getByRole('textbox', { name: 'Motivo' }), 'Ofício 123')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Abrir acesso de emergência' }))

    const aviso = await screen.findByRole('dialog', { name: 'Acesso de emergência aberto' })
    expect(within(aviso).getByRole('alert')).toHaveTextContent(
      'O e-mail para a Gestão não saiu (o envio de e-mail não está configurado).',
    )
    await usuario.click(within(aviso).getByRole('button', { name: 'Entrar como suporte' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/')
    })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Acesso de suporte · somente leitura',
    )
  })

  it('o banco recusando mostra a mensagem no diálogo', async () => {
    cenarioDoOperador({
      abrir_acesso_de_emergencia: {
        error: { code: 'P0001', message: 'acesso_de_suporte_ativo' },
      },
    })
    const { usuario, dialogo } = await abrirDialogo()
    await usuario.click(within(dialogo).getByRole('radio', { name: 'Incidente de segurança' }))
    await usuario.type(within(dialogo).getByRole('textbox', { name: 'Motivo' }), 'Vazamento')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Abrir acesso de emergência' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'Já há acesso de suporte valendo nesta consultoria.',
    )
    expect(falso.cliente.functions.invoke).not.toHaveBeenCalled()
  })

  it('não tem violações de acessibilidade detectáveis pelo axe (diálogo de emergência)', async () => {
    cenarioDoOperador()
    const { dialogo } = await abrirDialogo()
    const resultado = await axe.run(dialogo, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})
