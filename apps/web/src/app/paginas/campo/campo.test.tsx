import { adicionarDias, hojeNoFuso } from '@gestao-ambiental/domain'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'
import { lerRascunhos, type RascunhoOffline } from '@/lib/vistoria-offline/rascunho'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const dispositivo = vi.hoisted(() => ({
  rascunhos: new Map<string, RascunhoOffline>(),
}))

vi.mock('@/lib/vistoria-offline/app', async (importar) => ({
  ...(await importar<typeof import('@/lib/vistoria-offline/app')>()),
  prepararAplicativo: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/lib/vistoria-offline/rascunho', async (importar) => ({
  ...(await importar<typeof import('@/lib/vistoria-offline/rascunho')>()),
  lerRascunhos: vi.fn((usuario: string, consultoria: string) =>
    Promise.resolve(
      Array.from(dispositivo.rascunhos.values()).filter(
        (r) => r.chave[0] === usuario && r.chave[1] === consultoria,
      ),
    ),
  ),
  gravarRascunho: vi.fn((r: RascunhoOffline, remover = false) => {
    const salvo = { ...r, versaoLocal: r.versaoLocal + 1 }
    if (remover) dispositivo.rascunhos.delete(r.visita.id)
    else dispositivo.rascunhos.set(r.visita.id, salvo)
    return Promise.resolve(salvo)
  }),
}))

const hoje = hojeNoFuso(new Date(), 'America/Sao_Paulo')

function linhaDaLista(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'v1',
    consultoria_id: 'c-Filtroville',
    ocorrencia_id: 'o1',
    titulo: 'Inspeção do abrigo de resíduos',
    responsavel_id: 'm-Filtroville',
    responsavel_nome: 'Ana Ribeiro',
    data_planejada: hoje,
    hora_planejada: '14:00:00',
    duracao_minutos: 45,
    situacao: 'planejada',
    iniciada_em: null,
    enviada_em: null,
    condicionante_codigo: '4.2',
    condicionante_titulo: 'Laudo de resíduos',
    empreendimento_id: 'e1',
    empreendimento_nome: 'Indústria Horizonte',
    unidade_id: 'u1',
    unidade_nome: 'Unidade Norte',
    licenca: 'LAO 4821/2023',
    total_itens: 4,
    itens_registrados: 0,
    hoje,
    row_version: 1,
    total: 1,
    ...extra,
  }
}

function vistoria(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'v1',
    consultoria_id: 'c-Filtroville',
    ocorrencia_id: 'o1',
    titulo: 'Inspeção do abrigo de resíduos',
    objetivo: 'Registrar as condições observadas.',
    responsavel_id: 'm-Filtroville',
    responsavel_nome: 'Ana Ribeiro',
    data_planejada: hoje,
    hora_planejada: '14:00:00',
    duracao_minutos: 45,
    situacao: 'em_andamento',
    observacao: null,
    iniciada_em: '2026-11-14T13:00:00Z',
    enviada_em: null,
    enviada_por_nome: null,
    criada_por_nome: 'Ana Ribeiro',
    criada_em: '2026-11-10T13:00:00Z',
    row_version: 2,
    ocorrencia_situacao: 'aberta',
    ciclo: 1,
    condicionante_codigo: '4.2',
    condicionante_titulo: 'Laudo de resíduos',
    prazo_oficial_atual: adicionarDias(hoje, 10),
    meta_interna: null,
    empreendimento_id: 'e1',
    empreendimento_nome: 'Indústria Horizonte',
    unidade_id: 'u1',
    unidade_nome: 'Unidade Norte',
    unidade_endereco: 'Rua das Palmeiras, 100',
    instrumento_id: 'i1',
    licenca: 'LAO 4821/2023',
    hoje,
    conferente_nome: null,
    conferencia_independente: true,
    pode_registrar: true,
    pode_conferir: false,
    ultima_decisao: null,
    ultima_decisao_motivo: null,
    ultima_decisao_em: null,
    ultima_decisao_conferente_nome: null,
    ...extra,
  }
}

function item(id: string, titulo: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    posicao: Number(id.slice(1)),
    titulo,
    descricao: null,
    resultado: 'pendente',
    comentario: null,
    ...extra,
  }
}

const ITENS = [item('i1', 'Registrar área visitada'), item('i2', 'Identificar acompanhante')]

function cenario(
  extra: { rpc?: Cenario['rpc']; tabelas?: Cenario['tabelas']; papel?: 'gestao' | 'equipe' } = {},
): Cenario {
  return {
    sessao: sessaoDe('ana@filtroville.test', 'Ana Ribeiro'),
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', extra.papel ?? 'equipe')] },
      listar_vistorias: { data: [linhaDaLista()] },
      obter_vistoria: { data: [vistoria()] },
      registrar_item_da_vistoria: { data: null },
      salvar_observacao_da_vistoria: { data: null },
      iniciar_vistoria: { data: 2 },
      enviar_vistoria: { data: 3 },
      conferir_vistoria: { data: 4 },
      adicionar_foto_da_vistoria: { data: 'f1' },
      ...extra.rpc,
    },
    tabelas: { vistoria_item: ITENS, vistoria_foto: [], ...extra.tabelas },
  }
}

beforeAll(() => {
  // jsdom não rola: a lista de pendências leva ao item por âncora.
  Element.prototype.scrollIntoView = vi.fn()
})

describe('vistoria preparada no aparelho', () => {
  beforeEach(() => {
    dispositivo.rascunhos.clear()
    falso.reiniciar(
      cenario({
        rpc: {
          sincronizar_vistoria_offline: {
            error: { code: 'P0001', message: 'conflito_vistoria_offline' },
          },
        },
      }),
    )
  })

  it('guarda o checklist original, preserva edição e mantém o rascunho quando o servidor acusa conflito', async () => {
    const pessoa = userEvent.setup()
    const { router } = renderizarApp('/campo/v1')
    await pessoa.click(await screen.findByRole('button', { name: 'Preparar para usar sem sinal' }))
    await screen.findByRole('heading', { name: 'Checklist' })
    expect(router.state.location.pathname).toBe('/campo/offline/v1')
    expect(lerRascunhos).toHaveBeenCalled()
    await pessoa.selectOptions(
      screen.getByLabelText('Resultado de Registrar área visitada'),
      'conforme',
    )
    await pessoa.selectOptions(
      screen.getByLabelText('Resultado de Identificar acompanhante'),
      'nao_aplicavel',
    )
    await pessoa.type(screen.getByLabelText('Observação geral'), 'Abrigo limpo.')
    await pessoa.click(screen.getByRole('button', { name: 'Revisar envio' }))
    expect(await screen.findByRole('heading', { name: 'Conferir envio' })).toBeVisible()
    await pessoa.click(screen.getByRole('button', { name: 'Enviar para conferência' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O rascunho continua salvo neste aparelho',
    )
    expect(dispositivo.rascunhos.get('v1')).toMatchObject({
      observacao: 'Abrigo limpo.',
      revisado: true,
      base: { itens: [{ resultado: 'pendente' }, { resultado: 'pendente' }] },
    })
  })
})

describe('Minhas vistorias (/campo)', () => {
  beforeEach(() => {
    falso.reiniciar(cenario())
  })

  it('agrupa pelo hoje do banco em Atrasadas, Hoje, Próximas e Enviadas', async () => {
    falso.reiniciar(
      cenario({
        rpc: {
          listar_vistorias: {
            data: [
              linhaDaLista({
                id: 'a',
                titulo: 'Atrasada',
                data_planejada: adicionarDias(hoje, -2),
              }),
              linhaDaLista({ id: 'h', titulo: 'De hoje' }),
              linhaDaLista({ id: 'p', titulo: 'Próxima', data_planejada: adicionarDias(hoje, 3) }),
              linhaDaLista({
                id: 'e',
                titulo: 'Já enviada',
                situacao: 'enviada',
                enviada_em: '2026-11-13T15:00:00Z',
              }),
              linhaDaLista({ id: 'c', titulo: 'Cancelada', situacao: 'cancelada' }),
            ].map((linha) => ({ ...linha, total: 5 })),
          },
        },
      }),
    )
    renderizarApp('/campo')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Minhas vistorias' }),
    ).toBeInTheDocument()
    const grupos = await screen.findAllByRole('heading', { level: 2 })
    expect(grupos.map((g) => g.textContent)).toEqual(['Atrasadas', 'Hoje', 'Próximas', 'Enviadas'])
    const atrasadas = screen.getByRole('region', { name: 'Atrasadas' })
    expect(within(atrasadas).getByRole('link', { name: 'Atrasada' })).toHaveAttribute(
      'href',
      '/campo/a',
    )
    expect(within(atrasadas).getByText(/2 dias de atraso/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir vistoria De hoje' })).toHaveAttribute(
      'href',
      '/campo/h',
    )
    expect(screen.queryByText('Cancelada')).not.toBeInTheDocument()
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'listar_vistorias',
      expect.objectContaining({ p_somente_minhas: true, p_deslocamento: 0 }),
    )
  })

  it('sem vistorias mostra o vazio; "Todas" pede as da equipe', async () => {
    falso.reiniciar(cenario({ rpc: { listar_vistorias: { data: [] } } }))
    const usuario = userEvent.setup()
    renderizarApp('/campo')

    expect(await screen.findByRole('heading', { name: 'Nenhuma vistoria' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Todas' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Todas as vistorias' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'true')
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'listar_vistorias',
      expect.objectContaining({ p_somente_minhas: false }),
    )
  })

  it('erro de permissão mostra "sem acesso"', async () => {
    falso.reiniciar(
      cenario({
        rpc: { listar_vistorias: { error: { code: '42501', message: 'sem_permissao' } } },
      }),
    )
    renderizarApp('/campo')
    expect(
      await screen.findByRole('heading', { name: 'Você não tem acesso a esta área' }),
    ).toBeInTheDocument()
  })
})

describe('detalhe da visita (/campo/:id)', () => {
  it('planejada: "Começar vistoria" inicia e abre o checklist', async () => {
    falso.reiniciar(
      cenario({ rpc: { obter_vistoria: { data: [vistoria({ situacao: 'planejada' })] } } }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/campo/v1')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Inspeção do abrigo de resíduos' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Hoje às 14:00')).toBeInTheDocument()
    expect(screen.getByText('Rua das Palmeiras, 100')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Começar vistoria' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith('iniciar_vistoria', { p_id: 'v1' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Checklist' })).toBeInTheDocument()
  })

  it('quem confere devolve só com motivo', async () => {
    falso.reiniciar(
      cenario({
        papel: 'gestao',
        rpc: {
          obter_vistoria: {
            data: [vistoria({ situacao: 'enviada', pode_registrar: false, pode_conferir: true })],
          },
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/campo/v1')

    await usuario.click(await screen.findByRole('button', { name: 'Devolver' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Devolver vistoria' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Devolver' }))
    expect(within(dialogo).getByText('Informe o motivo')).toBeInTheDocument()
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('conferir_vistoria', expect.anything())

    await usuario.type(within(dialogo).getByLabelText('Motivo'), 'Falta foto do abrigo')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Devolver' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith('conferir_vistoria', {
      p_id: 'v1',
      p_decisao: 'devolvida',
      p_motivo: 'Falta foto do abrigo',
      p_row_version: 2,
    })
  })

  it('vistoria de outra consultoria ou inexistente', async () => {
    falso.reiniciar(cenario({ rpc: { obter_vistoria: { data: [] } } }))
    renderizarApp('/campo/v9')
    expect(await screen.findAllByText('Vistoria não encontrada')).not.toHaveLength(0)
  })
})

describe('checklist (/campo/:id/checklist)', () => {
  function areaDoItem(id: string) {
    const elemento = document.getElementById(`item-${id}`)
    if (!elemento) throw new Error(`item ${id} ausente`)
    return within(elemento)
  }

  it('não conforme sem comentário não grava; com comentário grava e mostra "Salvo"', async () => {
    falso.reiniciar(cenario())
    const usuario = userEvent.setup()
    renderizarApp('/campo/v1/checklist')

    await screen.findByRole('heading', { level: 1, name: 'Checklist' })
    expect(await screen.findByText('0 de 2 itens')).toBeInTheDocument()
    const grupo = screen.getByRole('group', { name: 'Registrar área visitada' })
    await usuario.click(within(grupo).getByRole('button', { name: 'Não conforme' }))

    const area = areaDoItem('i1')
    expect(area.getByText('Informe o comentário')).toBeInTheDocument()
    expect(within(grupo).getByRole('button', { name: 'Não conforme' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith(
      'registrar_item_da_vistoria',
      expect.anything(),
    )

    await usuario.type(area.getByLabelText('Comentário (obrigatório)'), 'Piso rachado')
    await usuario.tab()
    expect(falso.cliente.rpc).toHaveBeenCalledWith('registrar_item_da_vistoria', {
      p_item_id: 'i1',
      p_resultado: 'nao_conforme',
      p_comentario: 'Piso rachado',
    })
    expect(await area.findByText('Salvo')).toBeInTheDocument()
    expect(screen.getByText('1 de 2 itens')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
  })

  it('erro de gravação avisa "Não salvou" e tenta de novo', async () => {
    let falhar = true
    falso.reiniciar(
      cenario({
        rpc: {
          registrar_item_da_vistoria: () =>
            falhar ? { error: { message: 'erro de rede' } } : { data: null },
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/campo/v1/checklist')

    const grupo = await screen.findByRole('group', { name: 'Identificar acompanhante' })
    await usuario.click(within(grupo).getByRole('button', { name: 'Conforme' }))
    const area = areaDoItem('i2')
    expect(await area.findByText(/Não salvou/)).toBeInTheDocument()
    expect(screen.getByText('0 de 2 itens')).toBeInTheDocument()

    falhar = false
    await usuario.click(area.getByRole('button', { name: 'Tentar de novo' }))
    expect(await area.findByText('Salvo')).toBeInTheDocument()
    expect(screen.getByText('1 de 2 itens')).toBeInTheDocument()
  })

  it('não tem violações de acessibilidade detectáveis pelo axe', async () => {
    falso.reiniciar(cenario())
    const { container } = renderizarApp('/campo/v1/checklist')
    await screen.findByText('0 de 2 itens')
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })

  it('enviada fica só leitura', async () => {
    falso.reiniciar(
      cenario({
        rpc: {
          obter_vistoria: { data: [vistoria({ situacao: 'enviada', pode_registrar: false })] },
        },
        tabelas: {
          vistoria_item: [item('i1', 'Registrar área visitada', { resultado: 'conforme' })],
        },
      }),
    )
    renderizarApp('/campo/v1/checklist')
    await screen.findByRole('heading', { level: 1, name: 'Checklist' })
    expect(await screen.findByText('Conforme')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Não conforme' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Tirar foto/ })).not.toBeInTheDocument()
  })
})

describe('foto e localização (/campo/:id/itens/:itemId/foto)', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'geolocation')
  })

  function geolocalizacao(executar: (ok: PositionCallback, erro: PositionErrorCallback) => void) {
    const getCurrentPosition = vi.fn(executar)
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    })
    return getCurrentPosition
  }

  async function escolherFoto(usuario: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole('button', { name: 'Tirar foto' })
    const entrada = document.querySelector<HTMLInputElement>('input[type="file"]')
    if (!entrada) throw new Error('campo de arquivo ausente')
    expect(entrada).toHaveAttribute('capture', 'environment')
    await usuario.upload(entrada, new File(['jpg'], 'abrigo.jpg', { type: 'image/jpeg' }))
  }

  it('localização negada oferece descrever o local e vincula com upload e RPC', async () => {
    falso.reiniciar(cenario())
    const pedido = geolocalizacao((_ok, erro) => {
      erro({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError)
    })
    const usuario = userEvent.setup()
    renderizarApp('/campo/v1/itens/i1/foto')

    expect(await screen.findByText('Localização negada')).toBeInTheDocument()
    expect(pedido).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 0,
    })
    await usuario.click(screen.getByRole('button', { name: 'Descrever o local' }))
    await escolherFoto(usuario)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Revisar evidência' }),
    ).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Vincular foto' }))
    expect(screen.getByText('Descreva o local')).toBeInTheDocument()

    await usuario.type(screen.getByLabelText('Descrição do local'), 'Portão norte')
    await usuario.type(screen.getByLabelText('Legenda (opcional)'), 'Vista geral')
    await usuario.click(screen.getByRole('button', { name: 'Vincular foto' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Checklist' })).toBeInTheDocument()
    const upload = falso.cliente.storage.from().upload
    expect(upload).toHaveBeenCalledTimes(1)
    const caminho = upload.mock.calls[0]?.[0] ?? ''
    expect(caminho).toMatch(/^c-Filtroville\/vistoria\/[0-9a-f-]{36}\.jpg$/)
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'adicionar_foto_da_vistoria',
      expect.objectContaining({
        p_item_id: 'i1',
        p_caminho: caminho,
        p_foto_id: caminho.slice('c-Filtroville/vistoria/'.length, -'.jpg'.length),
        p_nome_original: 'abrigo.jpg',
        p_legenda: 'Vista geral',
        p_local_origem: 'manual',
        p_local_manual: 'Portão norte',
        p_latitude: null,
        p_longitude: null,
        p_precisao_m: null,
      }),
    )
  })

  it('com GPS mostra a precisão e grava a coordenada; erro mantém a foto para tentar de novo', async () => {
    let falhar = true
    falso.reiniciar(
      cenario({
        rpc: {
          adicionar_foto_da_vistoria: () =>
            falhar ? { error: { message: 'arquivo_nao_encontrado' } } : { data: 'f1' },
        },
      }),
    )
    geolocalizacao((ok) => {
      ok({
        coords: { latitude: -26.3045123, longitude: -48.8451234, accuracy: 8.24 },
      } as GeolocationPosition)
    })
    const usuario = userEvent.setup()
    renderizarApp('/campo/v1/itens/i1/foto')

    expect(await screen.findByText('Precisão ± 8 m')).toBeInTheDocument()
    await escolherFoto(usuario)
    await usuario.click(await screen.findByRole('button', { name: 'Vincular foto' }))
    expect(
      await screen.findByText('A foto não chegou ao armazenamento. Tente de novo.'),
    ).toBeInTheDocument()

    falhar = false
    await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Checklist' })).toBeInTheDocument()
    const chamadas = falso.cliente.rpc.mock.calls.filter(
      ([nome]) => nome === 'adicionar_foto_da_vistoria',
    )
    expect(chamadas).toHaveLength(2)
    // Mesmo id nas duas tentativas: o banco não duplica.
    expect(chamadas[0]?.[1]).toEqual(chamadas[1]?.[1])
    expect(chamadas[1]?.[1]).toMatchObject({
      p_local_origem: 'aparelho',
      p_latitude: -26.304512,
      p_longitude: -48.845123,
      p_precisao_m: 8.2,
      p_local_manual: null,
    })
  })
})

describe('conferir envio (/campo/:id/envio)', () => {
  it('pendências bloqueiam o envio e levam ao item', async () => {
    falso.reiniciar(
      cenario({
        tabelas: {
          vistoria_item: [
            item('i1', 'Registrar área visitada', { resultado: 'conforme' }),
            item('i2', 'Identificar acompanhante'),
          ],
        },
      }),
    )
    renderizarApp('/campo/v1/envio')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Conferir envio' }),
    ).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Identificar acompanhante' })).toHaveAttribute(
      'href',
      '/campo/v1/checklist#item-i2',
    )
    expect(screen.getByText('Sem resultado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar para conferência' })).toBeDisabled()
  })

  it('sem pendências envia com a versão e volta ao detalhe', async () => {
    falso.reiniciar(
      cenario({
        tabelas: {
          vistoria_item: [
            item('i1', 'Registrar área visitada', { resultado: 'conforme' }),
            item('i2', 'Identificar acompanhante', {
              resultado: 'requer_avaliacao',
              comentario: 'Ninguém da empresa presente',
            }),
          ],
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/campo/v1/envio')

    await usuario.click(await screen.findByRole('button', { name: 'Enviar para conferência' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith('enviar_vistoria', {
      p_id: 'v1',
      p_row_version: 2,
    })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Inspeção do abrigo de resíduos' }),
    ).toBeInTheDocument()
  })
})
