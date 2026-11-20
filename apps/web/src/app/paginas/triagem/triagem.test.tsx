import { FunctionsHttpError } from '@supabase/supabase-js'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

function montar(caminho = '/triagem') {
  const usuario = userEvent.setup()
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const tela = render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={[caminho]}>
        <PaginaTriagem />
      </MemoryRouter>
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
