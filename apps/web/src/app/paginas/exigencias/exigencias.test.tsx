import {
  adicionarDias,
  formatarDataCivil,
  hojeNoFuso,
  metaInternaSugerida,
  prazoDaExigencia,
} from '@gestao-ambiental/domain'
import { QueryClient } from '@tanstack/react-query'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const hoje = hojeNoFuso(new Date(), 'America/Sao_Paulo')

function exigencia(extra: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'x1',
    empreendimento_id: 'e1',
    empreendimento_nome: 'Metalúrgica Açores',
    unidade_id: 'u1',
    unidade_nome: 'Matriz',
    instrumento_id: 'i1',
    licenca: 'LAO 4821/2023',
    licenca_numero_processo: null,
    licenca_row_version: 6,
    numero_processo: '2026/0042',
    numero_oficio: '112/2026',
    orgao: 'IMA',
    assunto: 'Apresentar laudo complementar de ruído',
    notas: null,
    recebido_em: adicionarDias(hoje, -2),
    recebido_em_texto: formatarDataCivil(adicionarDias(hoje, -2)),
    prazo_dias: 5,
    prazo_contagem: 'corridos',
    prazo_oficial_original: adicionarDias(hoje, 3),
    prazo_oficial: adicionarDias(hoje, 3),
    prazo_oficial_texto: null,
    meta_interna: adicionarDias(hoje, 2),
    responsavel_id: null,
    responsavel_nome: null,
    situacao: 'aberta',
    primeira_resposta_em: null,
    respostas: 0,
    oficio_caminho: null,
    oficio_nome: null,
    criado_em: '2026-11-18T13:00:00Z',
    criado_por_nome: 'Eduardo Karnopp',
    row_version: 1,
    hoje,
    dias: 3,
    total: 1,
    ...extra,
  }
}

function cenario(
  papel: 'gestao' | 'equipe' = 'gestao',
  extra: Partial<Cenario> = {},
  membroId = 'm-eduardo',
): Cenario {
  return {
    sessao: sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp'),
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', papel, { membro_id: membroId })] },
      listar_exigencias: { data: [exigencia()] },
      listar_respostas_da_exigencia: { data: [] },
      ...extra.rpc,
    },
    tabelas: {
      empreendimento: [{ id: 'e1', nome: 'Metalúrgica Açores', cnpj: null, cliente: null }],
      unidade: [{ id: 'u1', nome: 'Matriz', endereco: null }],
      ...extra.tabelas,
    },
  }
}

function argumentosDa(nome: string): Record<string, unknown> {
  const chamada = falso.cliente.rpc.mock.calls.findLast(([n]) => n === nome)
  return chamada?.[1] ?? {}
}

const rpcOriginal = falso.cliente.rpc.getMockImplementation()

afterEach(() => {
  if (rpcOriginal) falso.cliente.rpc.mockImplementation(rpcOriginal)
})

describe('aba Exigências do órgão em Acompanhamentos', () => {
  beforeEach(() => {
    falso.reiniciar(cenario())
  })

  it('lista as abertas pelo prazo, com ofício, licença, responsável e situação', async () => {
    renderizarApp('/acompanhamentos?aba=exigencias')
    const painel = await screen.findByRole('tabpanel', { name: /Exigências do órgão/ })
    const tabela = await within(painel).findByRole('table')

    expect(
      within(tabela).getByRole('link', { name: /112\/2026.*Apresentar laudo/ }),
    ).toHaveAttribute('href', '/exigencias/x1')
    expect(within(tabela).getByText('LAO 4821/2023')).toBeInTheDocument()
    expect(within(tabela).getByText('Sem responsável')).toBeInTheDocument()
    expect(within(tabela).getByText('Aberta')).toBeInTheDocument()
    expect(within(tabela).getByText(formatarDataCivil(adicionarDias(hoje, 3)))).toBeInTheDocument()
    expect(argumentosDa('listar_exigencias')).toMatchObject({
      p_consultoria_id: 'c-Filtroville',
      p_situacao: 'abertas',
      p_limite: 25,
      p_deslocamento: 0,
    })
    expect(within(painel).getByRole('button', { name: 'Registrar exigência' })).toBeInTheDocument()
    expect(screen.getByText('1–1 de 1')).toBeInTheDocument()
  })

  it('situação calculada: atrasada e respondida fora do prazo', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          listar_exigencias: {
            data: [
              exigencia({ id: 'x1', prazo_oficial: adicionarDias(hoje, -1), dias: -1, total: 2 }),
              exigencia({
                id: 'x2',
                numero_oficio: '98/2026',
                situacao: 'respondida',
                prazo_oficial: adicionarDias(hoje, -5),
                primeira_resposta_em: adicionarDias(hoje, -3),
                total: 2,
              }),
            ],
          },
        },
      }),
    )
    renderizarApp('/acompanhamentos?aba=exigencias&situacao=todas')
    const tabela = await screen.findByRole('table')
    expect(within(tabela).getByText('Atrasada')).toBeInTheDocument()
    expect(within(tabela).getByText('Respondida fora do prazo')).toBeInTheDocument()
    expect(argumentosDa('listar_exigencias')).toMatchObject({ p_situacao: null })
  })

  it('o filtro Respondidas vai para o endereço e para a consulta', async () => {
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/acompanhamentos?aba=exigencias')
    await screen.findByRole('table')
    await usuario.click(screen.getByRole('button', { name: 'Respondidas' }))
    expect(router.state.location.search).toBe('?aba=exigencias&situacao=respondidas')
    await waitFor(() => {
      expect(argumentosDa('listar_exigencias')).toMatchObject({ p_situacao: 'respondidas' })
    })
  })

  it('Equipe vê a lista, sem a ação de registrar', async () => {
    falso.reiniciar(cenario('equipe'))
    renderizarApp('/acompanhamentos?aba=exigencias')
    await screen.findByRole('table')
    expect(screen.queryByRole('button', { name: 'Registrar exigência' })).toBeNull()
  })

  it('vazio, carregando, erro e sem permissão', async () => {
    falso.reiniciar(cenario('gestao', { rpc: { listar_exigencias: { data: [] } } }))
    const primeiro = renderizarApp('/acompanhamentos?aba=exigencias')
    expect(await screen.findByText('Nenhuma exigência aberta.')).toBeInTheDocument()
    primeiro.unmount()

    falso.reiniciar(cenario())
    const original = falso.cliente.rpc.getMockImplementation()
    falso.cliente.rpc.mockImplementation((nome: string, args?: Record<string, unknown>) =>
      nome === 'listar_exigencias'
        ? new Promise<never>(() => undefined)
        : (original?.(nome, args) ?? Promise.resolve({ data: null, error: null })),
    )
    const segundo = renderizarApp('/acompanhamentos?aba=exigencias')
    expect(await screen.findByText('Carregando exigências')).toBeInTheDocument()
    segundo.unmount()
    if (original) falso.cliente.rpc.mockImplementation(original)

    falso.reiniciar(
      cenario('gestao', { rpc: { listar_exigencias: { error: { message: 'falha' } } } }),
    )
    const terceiro = renderizarApp('/acompanhamentos?aba=exigencias')
    expect(await screen.findByText('Não foi possível carregar as exigências.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    terceiro.unmount()

    falso.reiniciar(
      cenario('gestao', {
        rpc: { listar_exigencias: { error: { code: '42501', message: 'sem_permissao' } } },
      }),
    )
    renderizarApp('/acompanhamentos?aba=exigencias')
    expect(await screen.findByText('Você não tem acesso a esta área')).toBeInTheDocument()
  })

  it('não tem violações de acessibilidade detectáveis pelo axe', async () => {
    const { container } = renderizarApp('/acompanhamentos?aba=exigencias')
    await screen.findByRole('table')
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})

describe('seção Exigências do órgão no Empreendimento', () => {
  it('some quando o empreendimento não tem exigência', async () => {
    falso.reiniciar(cenario('gestao', { rpc: { listar_exigencias: { data: [] } } }))
    renderizarApp('/empreendimentos/e1')
    await screen.findByRole('heading', { level: 1, name: /Metalúrgica Açores/ })
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'listar_exigencias',
        expect.objectContaining({ p_empreendimento_id: 'e1', p_limite: 10 }) as unknown,
      )
    })
    expect(screen.queryByRole('heading', { name: 'Exigências do órgão' })).toBeNull()
  })

  it('mostra as exigências com link para o detalhe', async () => {
    falso.reiniciar(cenario())
    renderizarApp('/empreendimentos/e1')
    const secao = await screen.findByRole('region', { name: 'Exigências do órgão' })
    expect(await within(secao).findByRole('link', { name: 'Ofício 112/2026' })).toHaveAttribute(
      'href',
      '/exigencias/x1',
    )
    expect(within(secao).getByText('Aberta')).toBeInTheDocument()
  })
})

describe('Registrar exigência pelo "…" do Empreendimento', () => {
  it('calcula o prazo pelo domínio, manda o prazo e mostra o erro do banco', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          listar_exigencias: { data: [] },
          registrar_exigencia: { error: { code: '22023', message: 'prazo_divergente' } },
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/empreendimentos/e1')
    await screen.findByRole('heading', { level: 1, name: /Metalúrgica Açores/ })
    await usuario.click(screen.getByRole('button', { name: 'Mais ações' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Registrar exigência' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Registrar exigência' })

    const recebido = adicionarDias(hoje, -2)
    const { prazoOficial, metaInterna } = prazoDaExigencia(recebido, 5, 'uteis')
    await usuario.type(within(dialogo).getByLabelText('Assunto *'), 'Laudo de ruído')
    await usuario.type(within(dialogo).getByLabelText('Recebido em *'), formatarDataCivil(recebido))
    await usuario.type(within(dialogo).getByLabelText('Dias'), '5')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Úteis' }))
    expect(within(dialogo).getByText(formatarDataCivil(prazoOficial))).toBeInTheDocument()
    expect(within(dialogo).getByLabelText('Meta interna *')).toHaveValue(
      formatarDataCivil(metaInterna),
    )

    await usuario.click(within(dialogo).getByRole('button', { name: 'Registrar exigência' }))
    expect(
      await within(dialogo).findByText(
        'O prazo não confere com o recebimento e os dias. Recarregue e tente de novo.',
      ),
    ).toBeInTheDocument()
    expect(argumentosDa('registrar_exigencia')).toMatchObject({
      p_unidade_id: 'u1',
      p_assunto: 'Laudo de ruído',
      p_recebido_em: recebido,
      p_recebido_em_texto: formatarDataCivil(recebido),
      p_prazo_dias: 5,
      p_prazo_contagem: 'uteis',
      p_prazo_oficial: prazoOficial,
      p_meta_interna: metaInterna,
      p_prazo_oficial_texto: null,
    })
  })

  it('sem assunto e sem recebimento não chama o banco', async () => {
    falso.reiniciar(cenario('gestao', { rpc: { listar_exigencias: { data: [] } } }))
    const usuario = userEvent.setup()
    renderizarApp('/empreendimentos/e1')
    await screen.findByRole('heading', { level: 1, name: /Metalúrgica Açores/ })
    await usuario.click(screen.getByRole('button', { name: 'Mais ações' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Registrar exigência' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Registrar exigência' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Registrar exigência' }))
    expect(await within(dialogo).findByText('Informe o assunto')).toBeInTheDocument()
    expect(within(dialogo).getByText('Informe a data de recebimento')).toBeInTheDocument()
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('registrar_exigencia', expect.anything())
  })
})

describe('detalhe /exigencias/:id', () => {
  it('mostra os dados, o histórico e as ações da Gestão', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          listar_respostas_da_exigencia: {
            data: [
              {
                id: 'r1',
                tipo: 'prorrogacao',
                protocolo_numero: null,
                protocolado_em: null,
                protocolado_em_texto: null,
                prazo_anterior: '2026-11-23',
                prazo_novo: '2026-12-10',
                prazo_novo_texto: '10/12/2026',
                meta_interna_anterior: '2026-11-23',
                meta_interna_nova: '2026-12-09',
                motivo: 'Órgão deferiu o pedido',
                descricao: null,
                documento_caminho: null,
                documento_nome: null,
                registrado_por: 'm-eduardo',
                registrado_por_nome: 'Eduardo Karnopp',
                registrado_em: '2026-11-19T15:00:00Z',
              },
            ],
          },
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/exigencias/x1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Ofício 112/2026' })).toBeVisible()
    expect(argumentosDa('listar_exigencias')).toMatchObject({ p_exigencia_id: 'x1', p_limite: 1 })

    const dados = screen.getByRole('complementary', { name: 'Dados da exigência' })
    expect(within(dados).getByText('2026/0042')).toBeInTheDocument()
    expect(within(dados).getByText('5 dias corridos')).toBeInTheDocument()
    expect(within(dados).getByText(formatarDataCivil(adicionarDias(hoje, -2)))).toBeInTheDocument()

    const historico = await screen.findByRole('list', { name: 'Histórico da exigência' })
    expect(within(historico).getByText('Prorrogação')).toBeInTheDocument()
    expect(within(historico).getByText('Prazo 23/11/2026 → 10/12/2026')).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Registrar resposta' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Mais ações' }))
    const itens = (await screen.findAllByRole('menuitem')).map((i) => i.textContent)
    expect(itens).toEqual([
      'Anexar documento',
      'Prorrogar prazo',
      'Atribuir responsável',
      'Editar',
      'Gravar processo na licença',
      'Excluir',
    ])
  })

  it('"Gravar processo na licença" manda o processo com a versão da licença', async () => {
    falso.reiniciar(cenario('gestao', { rpc: { definir_processo_da_licenca: { data: 7 } } }))
    const usuario = userEvent.setup()
    renderizarApp('/exigencias/x1')
    await screen.findByRole('heading', { level: 1, name: 'Ofício 112/2026' })
    await usuario.click(screen.getByRole('button', { name: 'Mais ações' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Gravar processo na licença' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith('definir_processo_da_licenca', {
      p_instrumento_id: 'i1',
      p_row_version: 6,
      p_numero_processo: '2026/0042',
    })
  })

  it('respondida: sem prorrogar, atribuir nem excluir', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          listar_exigencias: {
            data: [
              exigencia({
                situacao: 'respondida',
                primeira_resposta_em: hoje,
                respostas: 1,
                licenca_numero_processo: '2026/0042',
              }),
            ],
          },
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/exigencias/x1')
    await screen.findByRole('heading', { level: 1, name: 'Ofício 112/2026' })
    expect(screen.getAllByText('Respondida').length).toBeGreaterThan(0)
    await usuario.click(screen.getByRole('button', { name: 'Mais ações' }))
    const itens = (await screen.findAllByRole('menuitem')).map((i) => i.textContent)
    expect(itens).toEqual(['Anexar documento', 'Editar'])
  })

  it('Equipe responsável registra resposta; a não responsável só vê', async () => {
    falso.reiniciar(
      cenario(
        'equipe',
        {
          rpc: {
            listar_exigencias: {
              data: [exigencia({ responsavel_id: 'm-ana', responsavel_nome: 'Ana Ribeiro' })],
            },
          },
        },
        'm-ana',
      ),
    )
    const primeiro = renderizarApp('/exigencias/x1')
    await screen.findByRole('heading', { level: 1, name: 'Ofício 112/2026' })
    expect(screen.getByRole('button', { name: 'Registrar resposta' })).toBeInTheDocument()
    primeiro.unmount()

    falso.reiniciar(
      cenario(
        'equipe',
        {
          rpc: {
            listar_exigencias: {
              data: [exigencia({ responsavel_id: 'm-ana', responsavel_nome: 'Ana Ribeiro' })],
            },
          },
        },
        'm-bruno',
      ),
    )
    renderizarApp('/exigencias/x1')
    await screen.findByRole('heading', { level: 1, name: 'Ofício 112/2026' })
    expect(screen.queryByRole('button', { name: 'Registrar resposta' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mais ações' })).toBeNull()
  })

  it('erro da RPC de resposta aparece no diálogo', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          responder_exigencia: {
            error: { code: '22023', message: 'protocolo_antes_do_recebimento' },
          },
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/exigencias/x1')
    await screen.findByRole('heading', { level: 1, name: 'Ofício 112/2026' })
    await usuario.click(screen.getByRole('button', { name: 'Registrar resposta' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Registrar resposta' })
    await usuario.type(within(dialogo).getByLabelText('Protocolado em *'), formatarDataCivil(hoje))
    await usuario.type(within(dialogo).getByLabelText('Número do protocolo'), 'IMA-2026-991')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Registrar resposta' }))
    expect(
      await within(dialogo).findByText('O protocolo não pode ser antes do recebimento'),
    ).toBeInTheDocument()
    expect(argumentosDa('responder_exigencia')).toMatchObject({
      p_exigencia_id: 'x1',
      p_protocolado_em: hoje,
      p_protocolo_numero: 'IMA-2026-991',
    })
  })

  it('trocar o PDF depois de um erro gera versão nova; repetir com o mesmo PDF não', async () => {
    // O Storage não sobrescreve: com o mesmo caminho, o objeto ficaria com o PDF antigo e a linha
    // da versão com o nome e o SHA-256 do novo.
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          responder_exigencia: { error: { code: '22023', message: 'data_do_protocolo_futura' } },
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/exigencias/x1')
    await screen.findByRole('heading', { level: 1, name: 'Ofício 112/2026' })
    await usuario.click(screen.getByRole('button', { name: 'Registrar resposta' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Registrar resposta' })
    await usuario.type(within(dialogo).getByLabelText('Protocolado em *'), formatarDataCivil(hoje))
    const entrada = document.querySelector<HTMLInputElement>('[data-testid="pdf-da-exigencia"]')
    if (!entrada) throw new Error('campo de arquivo ausente')
    const chamadas = () =>
      falso.cliente.rpc.mock.calls
        .filter(([n]) => n === 'responder_exigencia')
        .map(([, a]) => a as Record<string, string>)
    const enviar = async (vezes: number) => {
      await usuario.click(within(dialogo).getByRole('button', { name: 'Registrar resposta' }))
      await waitFor(() => {
        expect(chamadas()).toHaveLength(vezes)
      })
      await within(dialogo).findByText('A data do protocolo não pode estar no futuro')
    }

    await usuario.upload(
      entrada,
      new File(['%PDF-1.4 primeiro'], 'protocolo-a.pdf', { type: 'application/pdf' }),
    )
    expect(await within(dialogo).findByText('protocolo-a.pdf')).toBeInTheDocument()
    await enviar(1)
    await enviar(2)
    await usuario.upload(
      entrada,
      new File(['%PDF-1.4 segundo'], 'protocolo-b.pdf', { type: 'application/pdf' }),
    )
    expect(await within(dialogo).findByText('protocolo-b.pdf')).toBeInTheDocument()
    await enviar(3)

    const [primeira, repetida, trocada] = chamadas()
    expect(repetida?.p_versao_id).toBe(primeira?.p_versao_id)
    expect(repetida?.p_resposta_id).toBe(primeira?.p_resposta_id)
    expect(trocada?.p_versao_id).not.toBe(primeira?.p_versao_id)
    expect(trocada?.p_nome_original).toBe('protocolo-b.pdf')
    expect(trocada?.p_caminho).toBe(
      `c-Filtroville/exigencia_resposta/${trocada?.p_versao_id ?? ''}.pdf`,
    )
  })

  it('resposta sem número e sem PDF não vai ao banco', async () => {
    falso.reiniciar(cenario())
    const usuario = userEvent.setup()
    renderizarApp('/exigencias/x1')
    await screen.findByRole('heading', { level: 1, name: 'Ofício 112/2026' })
    await usuario.click(screen.getByRole('button', { name: 'Registrar resposta' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Registrar resposta' })
    await usuario.type(within(dialogo).getByLabelText('Protocolado em *'), formatarDataCivil(hoje))
    await usuario.click(within(dialogo).getByRole('button', { name: 'Registrar resposta' }))
    expect(
      await within(dialogo).findByText('Informe o número do protocolo ou anexe o PDF'),
    ).toBeInTheDocument()
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('responder_exigencia', expect.anything())
  })

  it('prorrogação sugere a meta e manda o novo prazo', async () => {
    falso.reiniciar(cenario('gestao', { rpc: { prorrogar_exigencia: { data: 2 } } }))
    const usuario = userEvent.setup()
    renderizarApp('/exigencias/x1')
    await screen.findByRole('heading', { level: 1, name: 'Ofício 112/2026' })
    await usuario.click(screen.getByRole('button', { name: 'Mais ações' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Prorrogar prazo' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Prorrogar prazo' })
    const novo = adicionarDias(hoje, 30)
    const meta = metaInternaSugerida(novo)
    await usuario.type(
      within(dialogo).getByLabelText('Novo prazo do órgão *'),
      formatarDataCivil(novo),
    )
    expect(within(dialogo).getByLabelText('Meta interna *')).toHaveValue(formatarDataCivil(meta))
    await usuario.type(within(dialogo).getByLabelText('Motivo *'), 'Ofício de deferimento')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Prorrogar prazo' }))
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'prorrogar_exigencia',
        expect.objectContaining({
          p_exigencia_id: 'x1',
          p_row_version: 1,
          p_prazo_novo: novo,
          p_meta_interna: meta,
          p_motivo: 'Ofício de deferimento',
        }) as unknown,
      )
    })
  })

  it('depois de prorrogar, o placar da Visão, o Calendário e a busca também recarregam', async () => {
    const invalidar = vi.spyOn(QueryClient.prototype, 'invalidateQueries')
    falso.reiniciar(cenario('gestao', { rpc: { prorrogar_exigencia: { data: 2 } } }))
    const usuario = userEvent.setup()
    renderizarApp('/exigencias/x1')
    await screen.findByRole('heading', { level: 1, name: 'Ofício 112/2026' })
    await usuario.click(screen.getByRole('button', { name: 'Mais ações' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Prorrogar prazo' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Prorrogar prazo' })
    await usuario.type(
      within(dialogo).getByLabelText('Novo prazo do órgão *'),
      formatarDataCivil(adicionarDias(hoje, 30)),
    )
    await usuario.type(within(dialogo).getByLabelText('Motivo *'), 'Deferida')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Prorrogar prazo' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Prorrogar prazo' })).toBeNull()
    })
    const chaves = invalidar.mock.calls.map(([filtro]) => JSON.stringify(filtro?.queryKey))
    invalidar.mockRestore()
    for (const chave of [
      ['exigencia', 'x1'],
      ['exigencias'],
      ['prazos'],
      ['prazos-contadores'],
      ['prazos-totais'],
      ['calendario'],
      ['busca-global'],
    ]) {
      expect(chaves).toContain(JSON.stringify(chave))
    }
  })

  it('não encontrada (outra consultoria ou excluída)', async () => {
    falso.reiniciar(cenario('gestao', { rpc: { listar_exigencias: { data: [] } } }))
    renderizarApp('/exigencias/x9')
    expect(
      await screen.findByRole('heading', { name: 'Exigência não encontrada', level: 2 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver exigências' })).toHaveAttribute(
      'href',
      '/acompanhamentos?aba=exigencias',
    )
  })

  it('erro ao carregar mostra tentar de novo', async () => {
    falso.reiniciar(
      cenario('gestao', { rpc: { listar_exigencias: { error: { message: 'falha' } } } }),
    )
    renderizarApp('/exigencias/x1')
    expect(await screen.findByText('Não foi possível carregar a exigência.')).toBeInTheDocument()
  })

  it('não tem violações de acessibilidade detectáveis pelo axe', async () => {
    falso.reiniciar(cenario())
    const { container } = renderizarApp('/exigencias/x1')
    await screen.findByRole('heading', { level: 1, name: 'Ofício 112/2026' })
    await screen.findByText('Nenhuma resposta registrada.')
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})
