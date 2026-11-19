import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { PaginaTriagem } from './PaginaTriagem'

function montar() {
  const usuario = userEvent.setup()
  const tela = render(
    <MemoryRouter>
      <PaginaTriagem />
    </MemoryRouter>,
  )
  return { usuario, ...tela }
}

async function incluir(usuario: ReturnType<typeof userEvent.setup>, termo: string, codigo: string) {
  const busca = screen.getByRole('searchbox', { name: /Atividade/ })
  await usuario.clear(busca)
  await usuario.type(busca, termo)
  await usuario.click(screen.getByRole('button', { name: `Incluir ${codigo}` }))
}

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
    expect(
      within(conclusao).getByText(
        /EAS \(Estudo Ambiental Simplificado\), pela atividade 17\.21\.00/,
      ),
    ).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Remover 17.21.00' }))
    expect(screen.queryByRole('article', { name: /^17\.21\.00/ })).not.toBeInTheDocument()
    expect(
      within(conclusao).getByText(/RAP \(Relatório Ambiental Prévio\), pela atividade 12\.80\.10/),
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
    expect(within(conclusao).getByText('Órgão licenciador: município')).toBeInTheDocument()

    await usuario.clear(campo)
    await usuario.type(campo, '2')
    expect(within(cartao).getByText('Quem licencia: Estado (IMA)')).toBeInTheDocument()
    expect(
      within(cartao).getByText(/porte fora das faixas que o município pode licenciar/),
    ).toBeInTheDocument()
    expect(within(conclusao).getByText('Órgão licenciador: Estado (IMA)')).toBeInTheDocument()
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
