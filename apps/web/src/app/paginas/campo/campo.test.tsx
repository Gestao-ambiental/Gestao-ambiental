import { adicionarDias, hojeNoFuso } from '@gestao-ambiental/domain'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import { criarArmazem } from '@/lib/campo/armazem'
import { filaDeCampo } from '@/lib/campo/fila'
import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

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

/**
 * O checklist tem um h1 "Checklist" enquanto carrega e outro depois: esperar só pelo título
 * pode pegar o do carregamento, que sai do DOM logo em seguida. A lista só existe carregada.
 */
async function esperarChecklistCarregado() {
  await screen.findByRole('list', { name: 'Itens do checklist' })
  expect(screen.getByRole('heading', { level: 1, name: 'Checklist' })).toBeInTheDocument()
}

// Sinal do aparelho (ADR-0060): o teste liga e desliga; a fila e o React Query ouvem os eventos.
let conectado = true

function semSinal() {
  conectado = false
  window.dispatchEvent(new Event('offline'))
}

function voltaSinal() {
  conectado = true
  window.dispatchEvent(new Event('online'))
}

beforeAll(() => {
  // jsdom não rola: a lista de pendências leva ao item por âncora.
  Element.prototype.scrollIntoView = vi.fn()
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => conectado })
})

// Cada teste começa com o aparelho vazio: nada do rascunho de um teste passa para o seguinte.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  filaDeCampo.trocarArmazem(criarArmazem())
})

afterEach(() => {
  if (!conectado) voltaSinal()
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
      expect.objectContaining({
        p_consultoria_id: 'c-Filtroville',
        p_somente_minhas: true,
        p_deslocamento: 0,
      }),
    )
  })

  it('com dois vínculos pede só as vistorias da consultoria selecionada', async () => {
    const sessao = sessaoDe('ana@filtroville.test', 'Ana Ribeiro')
    window.localStorage.setItem(`grama:consultoria:${sessao.user.id}`, 'c-Verdeplan')
    falso.reiniciar(
      cenario({
        rpc: {
          meus_vinculos: {
            data: [vinculoFalso('Filtroville', 'equipe'), vinculoFalso('Verdeplan', 'equipe')],
          },
        },
      }),
    )
    renderizarApp('/campo')

    expect(
      await screen.findByRole('link', { name: 'Abrir vistoria Inspeção do abrigo de resíduos' }),
    ).toBeInTheDocument()
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'listar_vistorias',
      expect.objectContaining({ p_consultoria_id: 'c-Verdeplan' }),
    )
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith(
      'listar_vistorias',
      expect.objectContaining({ p_consultoria_id: 'c-Filtroville' }),
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
    await esperarChecklistCarregado()
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

  it('aprovar pede confirmação antes de gravar', async () => {
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

    await usuario.click(await screen.findByRole('button', { name: 'Aprovar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Aprovar vistoria?' })
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('conferir_vistoria', expect.anything())

    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('conferir_vistoria', expect.anything())

    await usuario.click(screen.getByRole('button', { name: 'Aprovar' }))
    const confirmar = await screen.findByRole('dialog', { name: 'Aprovar vistoria?' })
    await usuario.click(within(confirmar).getByRole('button', { name: 'Aprovar' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith('conferir_vistoria', {
      p_id: 'v1',
      p_decisao: 'aprovada',
      p_motivo: null,
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

  it('não conforme sem comentário não grava; com comentário grava e mostra "Salvo no servidor"', async () => {
    falso.reiniciar(cenario())
    const usuario = userEvent.setup()
    renderizarApp('/campo/v1/checklist')

    await screen.findByRole('heading', { level: 1, name: 'Checklist' })
    expect(await screen.findByText('0 de 2 itens')).toBeInTheDocument()
    expect(screen.getByText('Tudo salvo no servidor')).toBeInTheDocument()
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
    expect(await area.findByText('Salvo no servidor')).toBeInTheDocument()
    expect(falso.cliente.rpc).toHaveBeenCalledWith('registrar_item_da_vistoria', {
      p_item_id: 'i1',
      p_resultado: 'nao_conforme',
      p_comentario: 'Piso rachado',
    })
    expect(screen.getByText('1 de 2 itens')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getByText('Tudo salvo no servidor')).toBeInTheDocument()
  })

  it('comentário opcional fica recolhido até "Comentar" e grava ao sair do campo', async () => {
    falso.reiniciar(cenario())
    const usuario = userEvent.setup()
    renderizarApp('/campo/v1/checklist')

    await esperarChecklistCarregado()
    const area = areaDoItem('i1')
    expect(area.queryByLabelText('Comentário')).not.toBeInTheDocument()
    expect(area.getByRole('link', { name: 'Tirar foto: Registrar área visitada' })).toHaveAttribute(
      'href',
      '/campo/v1/itens/i1/foto',
    )
    const respostas = within(screen.getByRole('group', { name: 'Registrar área visitada' }))
    await usuario.click(respostas.getByRole('button', { name: 'Conforme' }))
    expect(await area.findByText('Salvo no servidor')).toBeInTheDocument()

    await usuario.click(area.getByRole('button', { name: 'Comentar' }))
    const campo = area.getByLabelText('Comentário')
    expect(campo).toHaveFocus()
    await usuario.type(campo, 'Área limpa')
    await usuario.tab()
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenLastCalledWith('registrar_item_da_vistoria', {
        p_item_id: 'i1',
        p_resultado: 'conforme',
        p_comentario: 'Área limpa',
      })
    })
  })

  // Regra mudou de propósito (ADR-0060): o que falha por conexão não some nem fica só na memória;
  // fica no aparelho, conta no progresso e vai sozinho quando a conexão responde.
  it('falha de conexão deixa o registro no aparelho e "Enviar agora" manda depois', async () => {
    let falhar = true
    falso.reiniciar(
      cenario({
        rpc: {
          registrar_item_da_vistoria: () =>
            falhar ? { error: { message: 'TypeError: Failed to fetch' } } : { data: null },
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/campo/v1/checklist')

    const grupo = await screen.findByRole('group', { name: 'Identificar acompanhante' })
    await usuario.click(within(grupo).getByRole('button', { name: 'Conforme' }))
    const area = areaDoItem('i2')
    expect(await area.findByText('No aparelho, falta enviar')).toBeInTheDocument()
    expect(screen.getByText('1 registro no aparelho, falta enviar')).toBeInTheDocument()
    expect(screen.getByText('1 de 2 itens')).toBeInTheDocument()

    falhar = false
    await usuario.click(screen.getByRole('button', { name: 'Enviar agora' }))
    expect(await area.findByText('Salvo no servidor')).toBeInTheDocument()
    expect(screen.getByText('Tudo salvo no servidor')).toBeInTheDocument()
    expect(screen.getByText('1 de 2 itens')).toBeInTheDocument()
  })

  // Regra mudou de propósito (ADR-0060): com o comentário guardado no aparelho, sair para a foto
  // não pergunta mais; nada se perde.
  it('sem sinal, sair para a foto não pede confirmação e o comentário continua lá', async () => {
    falso.reiniciar(cenario())
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/campo/v1/checklist')

    await screen.findByText('0 de 2 itens')
    semSinal()
    const area = areaDoItem('i1')
    const grupo = screen.getByRole('group', { name: 'Registrar área visitada' })
    await usuario.click(within(grupo).getByRole('button', { name: 'Não conforme' }))
    await usuario.type(area.getByLabelText('Comentário (obrigatório)'), 'Abrigo sem cobertura')

    await usuario.click(area.getByRole('link', { name: 'Tirar foto: Registrar área visitada' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/campo/v1/itens/i1/foto')
    })
    expect(screen.queryByRole('dialog', { name: 'Sair sem salvar?' })).not.toBeInTheDocument()
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith(
      'registrar_item_da_vistoria',
      expect.anything(),
    )

    await router.navigate('/campo/v1/checklist')
    await esperarChecklistCarregado()
    expect(areaDoItem('i1').getByLabelText(/Comentário/)).toHaveValue('Abrigo sem cobertura')
    expect(areaDoItem('i1').getByText('No aparelho, falta enviar')).toBeInTheDocument()
    expect(
      screen.getByText('Sem conexão. Envia sozinho quando o sinal voltar.'),
    ).toBeInTheDocument()
  })

  it('recusa do servidor para de tentar, mostra o motivo e deixa descartar', async () => {
    falso.reiniciar(
      cenario({ rpc: { registrar_item_da_vistoria: { error: { message: 'vistoria_fechada' } } } }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/campo/v1/checklist')

    const grupo = await screen.findByRole('group', { name: 'Registrar área visitada' })
    await usuario.click(within(grupo).getByRole('button', { name: 'Conforme' }))
    const area = areaDoItem('i1')
    expect(
      await area.findByText(
        /Não enviado: Esta vistoria não aceita mais registros. Recarregue para ver a situação./,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('1 recusado pelo servidor.')).toBeInTheDocument()
    const tentativas = () =>
      falso.cliente.rpc.mock.calls.filter(([nome]) => nome === 'registrar_item_da_vistoria')
    expect(tentativas()).toHaveLength(1)

    // Voltar a conexão não reenvia o recusado sozinho.
    voltaSinal()
    await new Promise((resolver) => setTimeout(resolver, 50))
    expect(tentativas()).toHaveLength(1)

    await usuario.click(area.getByRole('button', { name: 'Descartar' }))
    expect(await screen.findByText('Tudo salvo no servidor')).toBeInTheDocument()
    expect(screen.getByText('0 de 2 itens')).toBeInTheDocument()
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

    await esperarChecklistCarregado()
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

  // Regra mudou de propósito (ADR-0060): a foto não espera o servidor na tela da câmera; vai para
  // o aparelho, aparece no item como "falta enviar" e a recusa se resolve no checklist.
  it('com GPS grava a coordenada; recusa fica no item e "Tentar de novo" reenvia o mesmo id', async () => {
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
    await esperarChecklistCarregado()
    const area = within(document.getElementById('item-i1') ?? document.body)
    expect(
      await area.findByText(/Não enviado: A foto não chegou ao armazenamento. Tente de novo./),
    ).toBeInTheDocument()
    expect(
      area.getByRole('img', { name: 'Foto 1 (no aparelho, falta enviar)' }),
    ).toBeInTheDocument()

    falhar = false
    await usuario.click(area.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Tudo salvo no servidor')).toBeInTheDocument()
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

describe('sem sinal (ADR-0060)', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'geolocation')
  })

  function areaDe(id: string) {
    const elemento = document.getElementById(`item-${id}`)
    if (!elemento) throw new Error(`item ${id} ausente`)
    return within(elemento)
  }

  /**
   * Servidor que guarda o que recebe: o que confirmou aparece na releitura. `escritasCaem` simula
   * sinal fraco: a leitura passa e a gravação cai.
   */
  function servidorQueGuarda() {
    const rede = { escritasCaem: false }
    const caiu = () => !navigator.onLine || rede.escritasCaem
    const itens = ITENS.map((i) => ({ ...i }))
    const fotos: Record<string, unknown>[] = []
    const cena = cenario({
      rpc: {
        registrar_item_da_vistoria: (args) => {
          if (caiu()) return { error: { message: 'TypeError: Failed to fetch' } }
          const alvo = itens.find((i) => i.id === args.p_item_id)
          if (alvo)
            Object.assign(alvo, { resultado: args.p_resultado, comentario: args.p_comentario })
          return { data: null }
        },
        adicionar_foto_da_vistoria: (args) => {
          if (caiu()) return { error: { message: 'TypeError: Failed to fetch' } }
          if (!fotos.some((f) => f.id === args.p_foto_id))
            fotos.push({
              id: args.p_foto_id,
              item_id: args.p_item_id,
              caminho: args.p_caminho,
              legenda: args.p_legenda,
              capturada_em: args.p_capturada_em,
              sha256: args.p_sha256,
            })
          return { data: args.p_foto_id }
        },
      },
      tabelas: { vistoria_item: itens, vistoria_foto: fotos },
    })
    return { cena, fotos, rede }
  }

  async function fotografar(
    usuario: ReturnType<typeof userEvent.setup>,
    arquivo = new File(['jpg'], 'abrigo.jpg', { type: 'image/jpeg' }),
  ) {
    await usuario.click(
      areaDe('i1').getByRole('link', { name: 'Tirar foto: Registrar área visitada' }),
    )
    await usuario.click(await screen.findByRole('button', { name: 'Seguir sem local' }))
    const entrada = document.querySelector<HTMLInputElement>('input[type="file"]')
    if (!entrada) throw new Error('campo de arquivo ausente')
    await usuario.upload(entrada, arquivo)
    await usuario.click(await screen.findByRole('button', { name: 'Vincular foto' }))
  }

  function semGps() {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_ok: PositionCallback, erro: PositionErrorCallback) => {
          erro({ code: 2, PERMISSION_DENIED: 1 } as GeolocationPositionError)
        },
      },
    })
  }

  it('marca, fotografa, recarrega, volta o sinal e envia uma vez só', async () => {
    const { cena, fotos, rede } = servidorQueGuarda()
    falso.reiniciar(cena)
    semGps()
    const usuario = userEvent.setup()
    const primeira = renderizarApp('/campo/v1/checklist')
    await esperarChecklistCarregado()

    semSinal()
    const grupo = screen.getByRole('group', { name: 'Registrar área visitada' })
    await usuario.click(within(grupo).getByRole('button', { name: 'Conforme' }))
    expect(await areaDe('i1').findByText('No aparelho, falta enviar')).toBeInTheDocument()

    await fotografar(usuario)
    await esperarChecklistCarregado()
    expect(await screen.findByText('2 registros no aparelho, falta enviar')).toBeInTheDocument()
    expect(
      areaDe('i1').getByRole('img', { name: 'Foto 1 (no aparelho, falta enviar)' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Sem conexão. Envia sozinho quando o sinal voltar.'),
    ).toBeInTheDocument()
    expect(falso.cliente.storage.from().upload).not.toHaveBeenCalled()

    // Fecha e reabre com sinal fraco (lê, mas não grava): o rascunho volta do aparelho.
    rede.escritasCaem = true
    voltaSinal()
    primeira.unmount()
    filaDeCampo.descarregar()
    renderizarApp('/campo/v1/checklist')
    await esperarChecklistCarregado()
    expect(await screen.findByText('2 registros no aparelho, falta enviar')).toBeInTheDocument()
    expect(
      within(screen.getByRole('group', { name: 'Registrar área visitada' })).getByRole('button', {
        name: 'Conforme',
      }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('1 de 2 itens')).toBeInTheDocument()

    // O sinal volta: envia sozinho, cada registro uma vez, a foto no item certo.
    rede.escritasCaem = false
    voltaSinal()
    expect(await screen.findByText('Tudo salvo no servidor')).toBeInTheDocument()
    await waitFor(() => {
      expect(fotos).toHaveLength(1)
    })
    expect(fotos[0]).toMatchObject({ item_id: 'i1' })
    const caminhos = new Set(falso.cliente.storage.from().upload.mock.calls.map(([c]) => c))
    expect([...caminhos]).toEqual([fotos[0]?.caminho])
    // As tentativas com sinal fraco repetem o mesmo registro; nenhuma outra versão foi enviada.
    const chamadas = (nome: string) =>
      falso.cliente.rpc.mock.calls.filter(([n]) => n === nome).map(([, args]) => args)
    expect(new Set(chamadas('registrar_item_da_vistoria').map((a) => JSON.stringify(a)))).toEqual(
      new Set([JSON.stringify({ p_item_id: 'i1', p_resultado: 'conforme', p_comentario: null })]),
    )
    expect(screen.getByText('1 de 2 itens')).toBeInTheDocument()

    // Com tudo confirmado, o aparelho fica vazio e voltar o sinal de novo não reenvia nada.
    expect(await criarArmazem().listar('u-ana@filtroville.test')).toEqual([])
    const antes = falso.cliente.rpc.mock.calls.length
    voltaSinal()
    await new Promise((resolver) => setTimeout(resolver, 50))
    expect(
      falso.cliente.rpc.mock.calls
        .slice(antes)
        .filter(
          ([nome]) =>
            nome === 'registrar_item_da_vistoria' || nome === 'adicionar_foto_da_vistoria',
        ),
    ).toEqual([])
  })

  it('a mesma imagem duas vezes no mesmo item não duplica', async () => {
    const { cena } = servidorQueGuarda()
    falso.reiniciar(cena)
    semGps()
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/campo/v1/checklist')
    await esperarChecklistCarregado()
    semSinal()

    await fotografar(usuario)
    await esperarChecklistCarregado()
    expect(await screen.findByText('1 registro no aparelho, falta enviar')).toBeInTheDocument()

    await fotografar(usuario, new File(['jpg'], 'de-novo.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByText('Esta imagem já está neste item.')).toBeInTheDocument()
    await router.navigate('/campo/v1/checklist')
    await esperarChecklistCarregado()
    expect(screen.getByText('1 registro no aparelho, falta enviar')).toBeInTheDocument()
  })

  it('concluir com registros no aparelho avisa e só envia a vistoria depois deles', async () => {
    const { cena } = servidorQueGuarda()
    falso.reiniciar(cena)
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/campo/v1/checklist')
    await esperarChecklistCarregado()
    semSinal()

    for (const titulo of ['Registrar área visitada', 'Identificar acompanhante']) {
      const grupo = screen.getByRole('group', { name: titulo })
      await usuario.click(within(grupo).getByRole('button', { name: 'Conforme' }))
    }
    expect(await screen.findByText('2 registros no aparelho, falta enviar')).toBeInTheDocument()
    await router.navigate('/campo/v1/envio')

    const enviar = await screen.findByRole('button', { name: 'Enviar registros e vistoria' })
    expect(screen.getByText('Nenhuma pendência')).toBeInTheDocument()
    await usuario.click(enviar)
    expect(await screen.findByText('Vistoria não enviada')).toBeInTheDocument()
    expect(screen.getByText(/Faltam 2 registros chegar ao servidor./)).toBeInTheDocument()
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('enviar_vistoria', expect.anything())

    // Com sinal: primeiro os registros, depois a vistoria.
    voltaSinal()
    await usuario.click(screen.getByRole('button', { name: 'Enviar registros e vistoria' }))
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('enviar_vistoria', {
        p_id: 'v1',
        p_row_version: 2,
      })
    })
    const nomes = falso.cliente.rpc.mock.calls
      .map(([nome]) => nome)
      .filter((nome) => nome === 'registrar_item_da_vistoria' || nome === 'enviar_vistoria')
    expect(nomes.slice(-3)).toEqual([
      'registrar_item_da_vistoria',
      'registrar_item_da_vistoria',
      'enviar_vistoria',
    ])
  })

  it('não guarda token nem sessão no aparelho', async () => {
    const { cena } = servidorQueGuarda()
    falso.reiniciar(cena)
    const usuario = userEvent.setup()
    renderizarApp('/campo/v1/checklist')
    await esperarChecklistCarregado()
    semSinal()
    const grupo = screen.getByRole('group', { name: 'Registrar área visitada' })
    await usuario.click(within(grupo).getByRole('button', { name: 'Conforme' }))
    await screen.findByText('1 registro no aparelho, falta enviar')

    const linhas = await criarArmazem().listar('u-ana@filtroville.test')
    expect(linhas).toHaveLength(1)
    expect(JSON.stringify(linhas)).not.toMatch(/token|refresh|access/i)
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
