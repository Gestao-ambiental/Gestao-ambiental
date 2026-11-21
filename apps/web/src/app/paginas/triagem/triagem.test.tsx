import type { PapelMembro } from '@gestao-ambiental/domain'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ContextoConsultoria, type EstadoConsultoria } from '@/app/consultoria/contexto-consultoria'
import type { ResultadoDoLocal } from '@/lib/api/consulta-de-local'
import { falso } from '@/test/supabase-falso'

import { PaginaTriagem } from './PaginaTriagem'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))
// O Leaflet não desenha no jsdom: o mapa vira um botão que marca o Centro de Joinville.
vi.mock('./MapaDoLocal', () => ({
  default: ({
    aoEscolher,
  }: {
    aoEscolher: (c: { latitude: number; longitude: number }) => void
  }) => (
    <button
      type="button"
      onClick={() => {
        aoEscolher({ latitude: -26.3044, longitude: -48.8487 })
      }}
    >
      Marcar no mapa
    </button>
  ),
}))

const CENTRO: ResultadoDoLocal = {
  municipio: { codigoIbge: '4209102', nome: 'Joinville' },
  lote: { inscricaoImobiliaria: '13-20-23-7-239', quadra: null, lote: '239', areaM2: 2312.2588 },
  bairro: 'CENTRO',
  zoneamento: { setor: 'SA-01', macrozona: 'AUAP' },
  restricoes: [
    {
      tipo: 'inundacao',
      descricao: 'Dentro da mancha de inundação',
      fonte: 'SIMGeo Joinville, Mancha de inundação',
    },
  ],
  falhas: [],
  fontes: [],
}

beforeEach(() => {
  falso.reiniciar({ funcoes: { 'consultar-local': { data: CENTRO } } })
})

function consultoria(papel: PapelMembro): EstadoConsultoria {
  return {
    atual: {
      membroId: 'm1',
      consultoriaId: 'c1',
      consultoriaNome: 'Filtroville',
      fuso: 'America/Sao_Paulo',
      papel,
      situacao: 'ativo',
      desligadoEm: null,
    },
    suporte: null,
    abrirSuporte: () => Promise.resolve(),
    vinculos: [],
    trocar: () => undefined,
  }
}

function montar(caminho = '/triagem', papel: PapelMembro = 'gestao') {
  const usuario = userEvent.setup()
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const tela = render(
    <QueryClientProvider client={cliente}>
      <ContextoConsultoria.Provider value={consultoria(papel)}>
        <MemoryRouter initialEntries={[caminho]}>
          <PaginaTriagem />
        </MemoryRouter>
      </ContextoConsultoria.Provider>
    </QueryClientProvider>,
  )
  return { usuario, ...tela }
}

async function incluir(usuario: ReturnType<typeof userEvent.setup>, termo: string, codigo: string) {
  const busca = screen.getByRole('searchbox', { name: /Atividade/ })
  await usuario.clear(busca)
  await usuario.type(busca, termo)
  await usuario.click(screen.getByRole('button', { name: `Incluir ${codigo}` }))
}

describe('local do empreendimento na triagem', () => {
  it('marcar no mapa consulta o local e mostra município, inscrição, zoneamento e restrições', async () => {
    const { usuario } = montar()
    await usuario.click(await screen.findByRole('button', { name: 'Marcar no mapa' }))
    expect(screen.getByRole('textbox', { name: /Coordenadas/ })).toHaveValue('-26.30440, -48.84870')
    expect(await screen.findByText('Joinville (IBGE 4209102)')).toBeInTheDocument()
    expect(screen.getByText(/13-20-23-7-239 · lote de 2\.312 m² \(0,2312 ha\)/)).toBeInTheDocument()
    expect(screen.getByText('Setor SA-01, AUAP · bairro CENTRO')).toBeInTheDocument()
    expect(screen.getByText('Dentro da mancha de inundação')).toBeInTheDocument()
    expect(falso.cliente.functions.invoke).toHaveBeenCalledWith('consultar-local', {
      body: { latitude: -26.3044, longitude: -48.8487 },
    })
  })

  it('a área do lote preenche o AU(3) das atividades incluídas e das que vierem depois', async () => {
    const { usuario } = montar()
    await incluir(usuario, '12.80.10', '12.80.10')
    await usuario.type(screen.getByRole('textbox', { name: /Coordenadas/ }), '-26.3044, -48.8487')
    await usuario.click(screen.getByRole('button', { name: 'Consultar local' }))
    await usuario.click(
      await screen.findByRole('button', { name: 'Usar a área do lote como AU(3)' }),
    )
    const cartao = screen.getByRole('article', { name: /^12\.80\.10/ })
    expect(within(cartao).getByRole('textbox', { name: /AU\(3\)/ })).toHaveValue('0,2312')
    expect(within(cartao).getByText('Médio')).toBeInTheDocument()

    await incluir(usuario, '17.21.00', '17.21.00')
    const papel = screen.getByRole('article', { name: /^17\.21\.00/ })
    expect(within(papel).getByRole('textbox', { name: /AU\(3\)/ })).toHaveValue('0,2312')
  })

  it('coordenadas inválidas ou fora de SC avisam sem chamar a função', async () => {
    const { usuario } = montar()
    const campo = screen.getByRole('textbox', { name: /Coordenadas/ })
    await usuario.type(campo, 'Joinville')
    await usuario.click(screen.getByRole('button', { name: 'Consultar local' }))
    expect(screen.getByText(/Use latitude e longitude em graus/)).toBeInTheDocument()
    await usuario.clear(campo)
    await usuario.type(campo, '-23.55, -46.63')
    await usuario.click(screen.getByRole('button', { name: 'Consultar local' }))
    expect(screen.getByText('O ponto está fora de Santa Catarina.')).toBeInTheDocument()
    expect(falso.cliente.functions.invoke).not.toHaveBeenCalled()
  })

  it('erro da função aparece como alerta', async () => {
    falso.reiniciar({
      funcoes: {
        'consultar-local': {
          error: new FunctionsHttpError(
            new Response(JSON.stringify({ erro: 'sem_permissao' }), { status: 401 }),
          ),
        },
      },
    })
    const { usuario } = montar()
    await usuario.type(screen.getByRole('textbox', { name: /Coordenadas/ }), '-26.3044, -48.8487')
    await usuario.click(screen.getByRole('button', { name: 'Consultar local' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sua sessão expirou. Entre de novo.')
  })

  it('camada que falhou aparece como consulta incompleta; fora de Joinville avisa do SIMGeo', async () => {
    falso.reiniciar({
      funcoes: {
        'consultar-local': {
          data: {
            ...CENTRO,
            municipio: { codigoIbge: '4205407', nome: 'Florianópolis' },
            lote: null,
            bairro: null,
            zoneamento: null,
            restricoes: [],
            falhas: ['IMA/SC, Terra Indígena (FUNAI)'],
          },
        },
      },
    })
    const { usuario } = montar()
    await usuario.type(screen.getByRole('textbox', { name: /Coordenadas/ }), '-27.5969, -48.5482')
    await usuario.click(screen.getByRole('button', { name: 'Consultar local' }))
    expect(await screen.findByText('Consulta incompleta')).toBeInTheDocument()
    expect(screen.getByText(/Nenhuma restrição encontrada/)).toBeInTheDocument()
    expect(screen.getByText(/só em Joinville \(SIMGeo\)/)).toBeInTheDocument()
  })
})

describe('o que o simulador do IMA mostra: taxa, IN e TFASC', () => {
  it('trifásica no IMA mostra LAP, LAI, LAO e total pela classe porte,potencial', async () => {
    const { usuario } = montar()
    await incluir(usuario, '12.80.10', '12.80.10')
    const cartao = screen.getByRole('article', { name: /^12\.80\.10/ })
    const noIma = within(cartao).getByRole('region', { name: 'No IMA: 12.80.10' })
    // Antes de enquadrar, já mostra a IN e a TFASC, sem taxa.
    expect(within(noIma).queryByText('LAP')).not.toBeInTheDocument()
    expect(
      within(noIma).getByRole('link', {
        name: 'IN 19 · SERVIÇO INDUSTRIAL DE USINAGEM, SOLDAS E SEMELHANTES',
      }),
    ).toHaveAttribute('href', 'https://in.ima.sc.gov.br/instrucaoNormativa/visualizar/189')
    expect(within(noIma).getByText('Revogada no site do IMA')).toBeInTheDocument()
    expect(within(noIma).getByText(/^Paga TFASC/)).toBeInTheDocument()

    await usuario.type(within(cartao).getByRole('textbox', { name: /AU\(3\)/ }), '0,5')
    expect(within(noIma).getByText('R$ 1.129,72')).toBeInTheDocument()
    expect(within(noIma).getByText('R$ 2.810,36')).toBeInTheDocument()
    expect(within(noIma).getByText('R$ 5.620,79')).toBeInTheDocument()
    expect(within(noIma).getByText('R$ 9.560,87')).toBeInTheDocument()
    expect(within(noIma).getByText(/Classe M,M \(porte, potencial\)/)).toBeInTheDocument()
  })

  it('AuA mostra a taxa fixa; suinocultura usa a fórmula e pede o parâmetro', async () => {
    const { usuario } = montar()
    await incluir(usuario, '12.80.10', '12.80.10')
    await usuario.type(
      within(screen.getByRole('article', { name: /^12\.80\.10/ })).getByRole('textbox', {
        name: /AU\(3\)/,
      }),
      '0,01',
    )
    expect(screen.getByText('Taxa da AuA: R$ 68,56')).toBeInTheDocument()

    await incluir(usuario, '01.54.00', '01.54.00')
    const suinos = screen.getByRole('article', { name: /^01\.54\.00/ })
    await usuario.type(within(suinos).getByRole('textbox', { name: /CmáxC/ }), '1.000')
    const noIma = within(suinos).getByRole('region', { name: 'No IMA: 01.54.00' })
    expect(within(noIma).getByText('R$ 134,93')).toBeInTheDocument()
    expect(within(noIma).getByText(/Fórmula: Pr = 24,93 \+ 0,11 × NC/)).toBeInTheDocument()
  })

  it('no município não mostra taxa do IMA; potencial divergente do simulador é avisado', async () => {
    const { usuario } = montar()
    await usuario.selectOptions(
      screen.getByRole('combobox', { name: /Habilitação do município/ }),
      '1',
    )
    await incluir(usuario, '12.80.00', '12.80.00')
    const cartao = screen.getByRole('article', { name: /^12\.80\.00/ })
    await usuario.type(within(cartao).getByRole('textbox', { name: /AU\(3\)/ }), '0,15')
    expect(
      within(cartao).getByText('Licenciamento no município: a taxa é a do município.'),
    ).toBeInTheDocument()
    expect(within(cartao).queryByText('LAP')).not.toBeInTheDocument()

    await incluir(usuario, '17.21.00', '17.21.00')
    expect(
      within(screen.getByRole('article', { name: /^17\.21\.00/ })).getByText(
        /O simulador do IMA ainda usa potencial poluidor G; a resolução vigente diz M\./,
      ),
    ).toBeInTheDocument()
  })
})

describe('triagem aberta com ?empreendimento=', () => {
  const ID = '3c1d2e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f'

  it('mostra o empreendimento no link de volta', async () => {
    falso.reiniciar({
      tabelas: { empreendimento: [{ id: ID, nome: 'Metalúrgica Rio Cubatão', cnpj: null }] },
    })
    montar(`/triagem?empreendimento=${ID}`)
    expect(await screen.findByRole('link', { name: 'Metalúrgica Rio Cubatão' })).toHaveAttribute(
      'href',
      `/empreendimentos/${ID}`,
    )
    expect(falso.cliente.from).toHaveBeenCalledWith('empreendimento')
  })

  it('empreendimento que não vem (outra consultoria ou erro) abre a triagem sem ele', async () => {
    falso.reiniciar({ tabelas: { empreendimento: [] } })
    montar(`/triagem?empreendimento=${ID}`)
    await waitFor(() => {
      expect(falso.cliente.from).toHaveBeenCalledWith('empreendimento')
    })
    expect(screen.getByRole('heading', { name: 'Triagem de licenciamento' })).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('id que não é uuid nem consulta o banco', () => {
    montar('/triagem?empreendimento=abc')
    expect(falso.cliente.from).not.toHaveBeenCalledWith('empreendimento')
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('triagem de licenciamento (/triagem)', () => {
  it('começa vazia, com o aviso de que é triagem e não enquadramento oficial', () => {
    montar()
    expect(screen.getByRole('heading', { name: 'Triagem de licenciamento' })).toBeInTheDocument()
    expect(screen.getByText('Triagem, não enquadramento oficial')).toBeInTheDocument()
    expect(screen.getByText('Nenhuma atividade incluída')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Conclusão da triagem' })).not.toBeInTheDocument()
  })

  it('busca por palavra, inclui a atividade e enquadra pelo parâmetro digitado em formato brasileiro', async () => {
    const { usuario } = montar()
    await incluir(usuario, 'usinagem pintura', '12.80.10')

    const cartao = screen.getByRole('article', { name: /^12\.80\.10/ })
    expect(within(cartao).getByText(/Informe AU\(3\) para enquadrar/)).toBeInTheDocument()

    await usuario.type(within(cartao).getByRole('textbox', { name: /AU\(3\)/ }), '0,5')
    expect(within(cartao).getByText('Médio')).toBeInTheDocument()
    expect(within(cartao).getByText('RAP (Relatório Ambiental Prévio)')).toBeInTheDocument()
    expect(within(cartao).getByText('Porte Médio: 0,2 < AU(3) < 1 (RAP)')).toBeInTheDocument()

    const conclusao = screen.getByRole('region', { name: 'Conclusão da triagem' })
    expect(within(conclusao).getByText(/pela atividade 12\.80\.10/)).toBeInTheDocument()
  })

  it('o resultado mostra grande quem licencia, a modalidade, o estudo e a taxa em reais', async () => {
    const { usuario } = montar()
    await incluir(usuario, '12.80.10', '12.80.10')
    await usuario.type(
      within(screen.getByRole('article', { name: /^12\.80\.10/ })).getByRole('textbox', {
        name: /AU\(3\)/,
      }),
      '0,5',
    )
    const conclusao = screen.getByRole('region', { name: 'Conclusão da triagem' })
    expect(within(conclusao).getByText('Estado (IMA)')).toBeInTheDocument()
    expect(within(conclusao).getByText('LAP, LAI e LAO')).toBeInTheDocument()
    expect(within(conclusao).getByText('RAP')).toBeInTheDocument()
    // A mesma taxa total do cartão "No IMA", sem somar nada que a regra não some.
    expect(within(conclusao).getByText('R$ 9.560,87')).toBeInTheDocument()
  })

  it('as fontes legais ficam depois do resultado, num detalhe recolhível', () => {
    montar()
    expect(screen.getByText('Sobre as fontes')).toBeInTheDocument()
    expect(screen.getByText(/Confira com o órgão licenciador/)).not.toBeVisible()
  })

  it('porte mínimo vira AuA com estudo dispensado', async () => {
    const { usuario } = montar()
    await incluir(usuario, '12.80.10', '12.80.10')
    const cartao = screen.getByRole('article', { name: /^12\.80\.10/ })
    await usuario.type(within(cartao).getByRole('textbox', { name: /AU\(3\)/ }), '0,01')
    expect(within(cartao).getByText('Autorização Ambiental (AuA)')).toBeInTheDocument()
    expect(within(cartao).getByText('Dispensado (Art. 22)')).toBeInTheDocument()
  })

  it('valor inválido mostra o erro, e abaixo do limite fala da Certidão de Conformidade', async () => {
    const { usuario } = montar()
    await incluir(usuario, '01.54.01', '01.54.01')
    const cartao = screen.getByRole('article', { name: /^01\.54\.01/ })
    const campo = within(cartao).getByRole('textbox', { name: /CmáxM/ })

    await usuario.type(campo, 'abc')
    expect(within(cartao).getByText('Valor inválido')).toBeInTheDocument()

    await usuario.clear(campo)
    await usuario.type(campo, '10')
    expect(within(cartao).getByText('Abaixo do limite de licenciamento')).toBeInTheDocument()
    expect(
      within(cartao).getByText(/Certidão de Conformidade Ambiental, a CCA \(Art\. 14\)/),
    ).toBeInTheDocument()
  })

  it('com várias atividades, o estudo é o da mais complexa; remover tira da conclusão', async () => {
    const { usuario } = montar()
    await incluir(usuario, '12.80.10', '12.80.10')
    await usuario.type(
      within(screen.getByRole('article', { name: /^12\.80\.10/ })).getByRole('textbox', {
        name: /AU\(3\)/,
      }),
      '0,1',
    )
    await incluir(usuario, '17.21.00', '17.21.00')
    await usuario.type(
      within(screen.getByRole('article', { name: /^17\.21\.00/ })).getByRole('textbox', {
        name: /AU\(3\)/,
      }),
      '2',
    )

    const conclusao = screen.getByRole('region', { name: 'Conclusão da triagem' })
    expect(within(conclusao).getByText('EAS')).toBeInTheDocument()
    expect(
      within(conclusao).getByText('Estudo Ambiental Simplificado, pela atividade 17.21.00'),
    ).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Remover 17.21.00' }))
    expect(screen.queryByRole('article', { name: /^17\.21\.00/ })).not.toBeInTheDocument()
    expect(within(conclusao).getByText('RAP')).toBeInTheDocument()
    expect(
      within(conclusao).getByText('Relatório Ambiental Prévio, pela atividade 12.80.10'),
    ).toBeInTheDocument()
  })

  it('com o nível do município, diz quem licencia: município dentro das faixas da 251, Estado acima', async () => {
    const { usuario } = montar()
    expect(screen.getByRole('combobox', { name: /Habilitação do município/ })).toHaveValue('')
    await incluir(usuario, '12.80.00', '12.80.00')
    const cartao = screen.getByRole('article', { name: /^12\.80\.00/ })
    const campo = within(cartao).getByRole('textbox', { name: /AU\(3\)/ })
    await usuario.type(campo, '0,15')
    expect(within(cartao).getByText('Quem licencia: Estado (IMA)')).toBeInTheDocument()
    expect(within(cartao).getByText(/município sem habilitação informada/)).toBeInTheDocument()

    await usuario.selectOptions(
      screen.getByRole('combobox', { name: /Habilitação do município/ }),
      '1',
    )
    expect(within(cartao).getByText(/Quem licencia: município/)).toBeInTheDocument()
    const conclusao = screen.getByRole('region', { name: 'Conclusão da triagem' })
    expect(within(conclusao).getByText('Município')).toBeInTheDocument()
    expect(within(conclusao).getByText('Do município')).toBeInTheDocument()

    await usuario.clear(campo)
    await usuario.type(campo, '2')
    expect(within(cartao).getByText('Quem licencia: Estado (IMA)')).toBeInTheDocument()
    expect(
      within(cartao).getByText(/porte fora das faixas que o município pode licenciar/),
    ).toBeInTheDocument()
    expect(within(conclusao).getByText('Estado (IMA)')).toBeInTheDocument()
  })

  it('não inclui a mesma atividade duas vezes', async () => {
    const { usuario } = montar()
    await incluir(usuario, '12.80.10', '12.80.10')
    expect(screen.getByRole('button', { name: '12.80.10 já incluída' })).toBeDisabled()
    expect(screen.getAllByRole('article')).toHaveLength(1)
  })

  it('busca sem resultado avisa', async () => {
    const { usuario } = montar()
    await usuario.type(screen.getByRole('searchbox', { name: /Atividade/ }), 'xyzzy')
    expect(screen.getByRole('status')).toHaveTextContent('Nenhuma atividade do Anexo VI encontrada')
  })

  it('sem violações de acessibilidade com uma atividade enquadrada', async () => {
    const { usuario, container } = montar()
    await incluir(usuario, '00.12.03', '00.12.03')
    await usuario.type(
      within(screen.getByRole('article', { name: /^00\.12\.03/ })).getByRole('textbox', {
        name: /PA/,
      }),
      '10.000',
    )
    const r = await axe.run(container)
    expect(r.violations.map((v) => v.id)).toEqual([])
  })
})

const EMPREENDIMENTO = '3c1d2e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
const LAO = '7d1e2f3a-4b5c-4d6e-8f9a-0b1c2d3e4f5a'
const LAI = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d'

/** Linha de instrumento como a lista de licenças do empreendimento lê. */
function licenca(
  id: string,
  sigla: string,
  numero: string,
  plano: Record<string, unknown> | null,
): Record<string, unknown> {
  return {
    id,
    numero,
    orgao: 'IMA',
    situacao: 'ativo',
    validade: '2027-03-01',
    criado_em: '2026-01-10T12:00:00Z',
    antecedencia_renovacao_dias: 30,
    unidade_id: 'un1',
    tipo_id: 't1',
    marco: 'emissao',
    tipo: { sigla, nome: sigla },
    unidade: { nome: 'Matriz' },
    plano,
    condicionante: [{ count: 0 }],
  }
}

async function enquadrarUsinagem(usuario: ReturnType<typeof userEvent.setup>) {
  await incluir(usuario, '12.80.10', '12.80.10')
  await usuario.type(
    within(screen.getByRole('article', { name: /^12\.80\.10/ })).getByRole('textbox', {
      name: /AU\(3\)/,
    }),
    '0,5',
  )
}

describe('gravar na licença (ADR-0044)', () => {
  function cenario(gravar: { data?: unknown; error?: unknown } = { data: 1 }) {
    falso.reiniciar({
      tabelas: {
        empreendimento: [{ id: EMPREENDIMENTO, nome: 'Metalúrgica Rio Cubatão', cnpj: null }],
        instrumento: [
          licenca(LAO, 'LAO', '4821/2023', {
            antecedencia_dias: 30,
            dias_limite_protocolo: 120,
            protocolado_em: null,
          }),
          licenca(LAI, 'LAI', '77/2026', null),
        ],
      },
      rpc: { gravar_atividades_na_licenca: gravar },
    })
  }

  it('vinda do plano (&licenca=), grava as atividades enquadradas direto na licença', async () => {
    cenario()
    const { usuario } = montar(`/triagem?empreendimento=${EMPREENDIMENTO}&licenca=${LAO}`)
    await screen.findByRole('link', { name: 'Metalúrgica Rio Cubatão' })
    // Atividade sem parâmetro (pendente) não conta: sem enquadrada, não há o que gravar.
    await incluir(usuario, 'usinagem pintura', '12.80.10')
    expect(screen.queryByRole('button', { name: /^Gravar/ })).toBeNull()
    await usuario.type(
      within(screen.getByRole('article', { name: /^12\.80\.10/ })).getByRole('textbox', {
        name: /AU\(3\)/,
      }),
      '0,5',
    )
    // A pendente fica de fora do que é gravado.
    await incluir(usuario, '01.54.00', '01.54.00')

    await usuario.click(
      await screen.findByRole('button', { name: 'Gravar na licença: LAO 4821/2023' }),
    )
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('gravar_atividades_na_licenca', {
        p_consultoria_id: 'c1',
        p_instrumento_id: LAO,
        p_atividades: [
          {
            codigo: '12.80.10',
            descricao: expect.stringMatching(/pintura/i) as unknown,
            porte: 'medio',
            potencial: 'M',
            medidas: { 'AU(3)': 0.5 },
            fonte: 'Resolução CONSEMA 250/2024, consolidada até a Resolução CONSEMA 314/2026',
          },
        ],
      })
    })
    const aviso = await screen.findByRole('status')
    expect(aviso).toHaveTextContent('Gravado na LAO 4821/2023')
    expect(within(aviso).getByRole('link', { name: 'LAO 4821/2023' })).toHaveAttribute(
      'href',
      `/renovacoes/${LAO}`,
    )
  })

  it('sem a licença no endereço, escolhe no menu entre as licenças do empreendimento', async () => {
    cenario()
    const { usuario } = montar(`/triagem?empreendimento=${EMPREENDIMENTO}`)
    await screen.findByRole('link', { name: 'Metalúrgica Rio Cubatão' })
    await enquadrarUsinagem(usuario)

    // Com o empreendimento no menu, o botão diz só "Gravar" (a regra mudou no ADR-0050).
    await usuario.click(await screen.findByRole('button', { name: 'Gravar' }))
    expect(await screen.findByRole('menuitem', { name: 'LAO 4821/2023' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('menuitem', { name: 'LAI 77/2026' }))
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'gravar_atividades_na_licenca',
        expect.objectContaining({ p_instrumento_id: LAI }) as unknown,
      )
    })
    // Licença sem plano de renovação: o aviso não tem link.
    const aviso = await screen.findByRole('status')
    expect(aviso).toHaveTextContent('Gravado na LAI 77/2026')
    expect(within(aviso).queryByRole('link')).toBeNull()
  })

  it('erro ao gravar aparece na tela', async () => {
    cenario({ error: { message: 'atividades_invalidas', code: '22023' } })
    const { usuario } = montar(`/triagem?empreendimento=${EMPREENDIMENTO}&licenca=${LAO}`)
    await screen.findByRole('link', { name: 'Metalúrgica Rio Cubatão' })
    await enquadrarUsinagem(usuario)
    await usuario.click(
      await screen.findByRole('button', { name: 'Gravar na licença: LAO 4821/2023' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível gravar as atividades. Refaça a triagem.',
    )
  })

  it('a Equipe não vê a ação', async () => {
    cenario()
    const { usuario } = montar(`/triagem?empreendimento=${EMPREENDIMENTO}&licenca=${LAO}`, 'equipe')
    await screen.findByRole('link', { name: 'Metalúrgica Rio Cubatão' })
    await enquadrarUsinagem(usuario)
    expect(screen.queryByRole('button', { name: /^Gravar/ })).toBeNull()
    expect(falso.cliente.from).not.toHaveBeenCalledWith('instrumento')
  })

  it('sem empreendimento não há onde gravar', async () => {
    cenario()
    const { usuario } = montar()
    await enquadrarUsinagem(usuario)
    expect(screen.queryByRole('button', { name: /^Gravar/ })).toBeNull()
  })

  it('sem violações de acessibilidade com a ação e o aviso de gravado', async () => {
    cenario()
    const { usuario, container } = montar(
      `/triagem?empreendimento=${EMPREENDIMENTO}&licenca=${LAO}`,
    )
    await screen.findByRole('link', { name: 'Metalúrgica Rio Cubatão' })
    await enquadrarUsinagem(usuario)
    await usuario.click(
      await screen.findByRole('button', { name: 'Gravar na licença: LAO 4821/2023' }),
    )
    await screen.findByRole('status')
    const r = await axe.run(container)
    expect(r.violations.map((v) => v.id)).toEqual([])
  })
})

describe('gravar no empreendimento (ADR-0050, LEG-05)', () => {
  const EMPRESA = { id: EMPREENDIMENTO, nome: 'Metalúrgica Rio Cubatão', cnpj: null }

  function cenario({
    licencas = [],
    gravar = { data: 1 },
  }: {
    licencas?: Record<string, unknown>[]
    gravar?: { data?: unknown; error?: unknown }
  } = {}) {
    falso.reiniciar({
      tabelas: { empreendimento: [EMPRESA], instrumento: licencas },
      rpc: { gravar_atividades_no_empreendimento: gravar },
    })
  }

  it('sem licença, "Gravar no empreendimento" é a única ação e grava nele', async () => {
    cenario()
    const { usuario } = montar(`/triagem?empreendimento=${EMPREENDIMENTO}`)
    await screen.findByRole('link', { name: 'Metalúrgica Rio Cubatão' })
    await enquadrarUsinagem(usuario)

    await usuario.click(await screen.findByRole('button', { name: 'Gravar no empreendimento' }))
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('gravar_atividades_no_empreendimento', {
        p_consultoria_id: 'c1',
        p_empreendimento_id: EMPREENDIMENTO,
        p_atividades: [
          expect.objectContaining({
            codigo: '12.80.10',
            porte: 'medio',
            potencial: 'M',
            medidas: { 'AU(3)': 0.5 },
          }) as unknown,
        ],
      })
    })
    const aviso = await screen.findByRole('status')
    expect(aviso).toHaveTextContent('Gravado no empreendimento Metalúrgica Rio Cubatão')
    expect(within(aviso).getByRole('link', { name: 'Metalúrgica Rio Cubatão' })).toHaveAttribute(
      'href',
      `/empreendimentos/${EMPREENDIMENTO}`,
    )
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith(
      'gravar_atividades_na_licenca',
      expect.anything(),
    )
  })

  it('com licenças, "Gravar no empreendimento" é o primeiro item do menu', async () => {
    cenario({ licencas: [licenca(LAI, 'LAI', '77/2026', null)] })
    const { usuario } = montar(`/triagem?empreendimento=${EMPREENDIMENTO}`)
    await screen.findByRole('link', { name: 'Metalúrgica Rio Cubatão' })
    await enquadrarUsinagem(usuario)

    await usuario.click(await screen.findByRole('button', { name: 'Gravar' }))
    const itens = await screen.findAllByRole('menuitem')
    expect(itens.map((i) => i.textContent)).toEqual(['Gravar no empreendimento', 'LAI 77/2026'])
    await usuario.click(screen.getByRole('menuitem', { name: 'Gravar no empreendimento' }))
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'gravar_atividades_no_empreendimento',
        expect.objectContaining({ p_empreendimento_id: EMPREENDIMENTO }) as unknown,
      )
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Gravado no empreendimento')
  })

  it('erro da RPC aparece na tela', async () => {
    cenario({ gravar: { error: { message: 'empreendimento_invalido', code: '22023' } } })
    const { usuario } = montar(`/triagem?empreendimento=${EMPREENDIMENTO}`)
    await screen.findByRole('link', { name: 'Metalúrgica Rio Cubatão' })
    await enquadrarUsinagem(usuario)
    await usuario.click(await screen.findByRole('button', { name: 'Gravar no empreendimento' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Escolha um empreendimento desta consultoria.',
    )
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('a Equipe não vê a ação', async () => {
    cenario()
    const { usuario } = montar(`/triagem?empreendimento=${EMPREENDIMENTO}`, 'equipe')
    await screen.findByRole('link', { name: 'Metalúrgica Rio Cubatão' })
    await enquadrarUsinagem(usuario)
    expect(screen.queryByRole('button', { name: /^Gravar/ })).toBeNull()
  })
})

describe('município gravado na unidade (ADR-0050)', () => {
  const EMPRESA = { id: EMPREENDIMENTO, nome: 'Metalúrgica Rio Cubatão', cnpj: null }
  const MATRIZ = { id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b', nome: 'Matriz', endereco: null }
  const FILIAL = { id: '6f7a8b9c-0d1e-4f2a-9b3c-4d5e6f7a8b9c', nome: 'Filial', endereco: null }

  function cenario(unidades: Record<string, unknown>[]) {
    falso.reiniciar({
      tabelas: { empreendimento: [EMPRESA], unidade: unidades },
      funcoes: { 'consultar-local': { data: { ...CENTRO, municipioGravado: true } } },
    })
  }

  it('com uma unidade, a consulta leva a unidade e mostra que o município foi gravado', async () => {
    cenario([MATRIZ])
    const { usuario } = montar(`/triagem?empreendimento=${EMPREENDIMENTO}`)
    await screen.findByRole('link', { name: 'Metalúrgica Rio Cubatão' })
    await waitFor(() => {
      expect(falso.cliente.from).toHaveBeenCalledWith('unidade')
    })
    expect(screen.queryByRole('combobox', { name: 'Unidade' })).toBeNull()
    await usuario.type(screen.getByRole('textbox', { name: /Coordenadas/ }), '-26.3044, -48.8487')
    await usuario.click(screen.getByRole('button', { name: 'Consultar local' }))
    expect(await screen.findByText('Gravado na unidade')).toBeInTheDocument()
    expect(falso.cliente.functions.invoke).toHaveBeenCalledWith('consultar-local', {
      body: {
        latitude: -26.3044,
        longitude: -48.8487,
        consultoriaId: 'c1',
        unidadeId: MATRIZ.id,
      },
    })
  })

  it('com duas unidades, exige escolher a unidade antes de consultar', async () => {
    cenario([MATRIZ, FILIAL])
    const { usuario } = montar(`/triagem?empreendimento=${EMPREENDIMENTO}`)
    const seletor = await screen.findByRole('combobox', { name: 'Unidade' })
    await usuario.type(screen.getByRole('textbox', { name: /Coordenadas/ }), '-26.3044, -48.8487')
    await usuario.click(screen.getByRole('button', { name: 'Consultar local' }))
    expect(screen.getByText('Escolha a unidade.')).toBeInTheDocument()
    expect(seletor).toHaveAttribute('aria-invalid', 'true')
    expect(falso.cliente.functions.invoke).not.toHaveBeenCalled()

    await usuario.selectOptions(seletor, 'Filial')
    expect(screen.queryByText('Escolha a unidade.')).toBeNull()
    await usuario.click(screen.getByRole('button', { name: 'Consultar local' }))
    expect(await screen.findByText('Gravado na unidade')).toBeInTheDocument()
    expect(falso.cliente.functions.invoke).toHaveBeenCalledWith('consultar-local', {
      body: expect.objectContaining({ unidadeId: FILIAL.id, consultoriaId: 'c1' }) as unknown,
    })
  })

  it('sem violações de acessibilidade com o seletor de unidade e o erro', async () => {
    cenario([MATRIZ, FILIAL])
    const { usuario, container } = montar(`/triagem?empreendimento=${EMPREENDIMENTO}`)
    await screen.findByRole('combobox', { name: 'Unidade' })
    await usuario.type(screen.getByRole('textbox', { name: /Coordenadas/ }), '-26.3044, -48.8487')
    await usuario.click(screen.getByRole('button', { name: 'Consultar local' }))
    await screen.findByText('Escolha a unidade.')
    const r = await axe.run(container)
    expect(r.violations.map((v) => v.id)).toEqual([])
  })
})
