import type { DataCivil } from '@gestao-ambiental/domain'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { CampoData } from './campo-data'

const HOJE = '2026-11-05' as DataCivil

function Campo({
  inicial = null,
  aoMudar,
  ...resto
}: {
  inicial?: DataCivil | null
  aoMudar?: (data: DataCivil | null) => void
  maximo?: DataCivil
  motivoDoLimite?: string
  nota?: string
}) {
  const [valor, setValor] = useState<DataCivil | null>(inicial)
  return (
    <CampoData
      rotulo="Validade confirmada *"
      hoje={HOJE}
      valor={valor}
      aoMudar={(data) => {
        setValor(data)
        aoMudar?.(data)
      }}
      {...resto}
    />
  )
}

describe('CampoData', () => {
  it('põe as barras ao digitar e devolve a data civil', async () => {
    const usuario = userEvent.setup()
    const aoMudar = vi.fn()
    render(<Campo aoMudar={aoMudar} />)
    const campo = screen.getByLabelText('Validade confirmada *')
    await usuario.type(campo, '15022027')
    expect(campo).toHaveValue('15/02/2027')
    expect(aoMudar).toHaveBeenLastCalledWith('2027-02-15')
  })

  it('data que não existe vira erro no campo e valor vazio', async () => {
    const usuario = userEvent.setup()
    const aoMudar = vi.fn()
    render(<Campo inicial={'2027-02-15'} aoMudar={aoMudar} />)
    const campo = screen.getByLabelText('Validade confirmada *')
    await usuario.clear(campo)
    await usuario.type(campo, '31/02/2027')
    expect(campo).toHaveAccessibleDescription('Essa data não existe. Use dd/mm/aaaa')
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(aoMudar).toHaveBeenLastCalledWith(null)
  })

  it('data incompleta avisa ao sair do campo', async () => {
    const usuario = userEvent.setup()
    render(<Campo />)
    const campo = screen.getByLabelText('Validade confirmada *')
    await usuario.type(campo, '1402')
    await usuario.tab()
    expect(campo).toHaveAccessibleDescription('Data incompleta. Use dd/mm/aaaa')
  })

  it('calendário abre no mês da data, com a nota, e escolher um dia fecha', async () => {
    const usuario = userEvent.setup()
    render(<Campo inicial={'2027-02-15'} nota="Limite de protocolo: 18/10/2026" />)
    await usuario.click(
      screen.getByRole('button', { name: 'Abrir calendário de Validade confirmada' }),
    )
    const grade = await screen.findByRole('grid', { name: 'fevereiro de 2027' })
    expect(screen.getByText('Limite de protocolo: 18/10/2026')).toBeInTheDocument()
    // O foco vai para o dia escolhido; as setas andam pelos dias.
    expect(within(grade).getByRole('button', { name: '15 de fevereiro de 2027' })).toHaveFocus()
    await usuario.keyboard('{ArrowRight}{ArrowDown}')
    expect(within(grade).getByRole('button', { name: '23 de fevereiro de 2027' })).toHaveFocus()
    await usuario.keyboard('{Enter}')
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Validade confirmada *')).toHaveValue('23/02/2027')
  })

  it('troca de mês pelo seletor de meses e de anos', async () => {
    const usuario = userEvent.setup()
    render(<Campo inicial={'2027-02-15'} />)
    await usuario.click(
      screen.getByRole('button', { name: 'Abrir calendário de Validade confirmada' }),
    )
    await usuario.click(await screen.findByRole('button', { name: /escolher mês e ano/ }))
    await usuario.click(screen.getByRole('button', { name: /escolher ano/ }))
    await usuario.click(screen.getByRole('button', { name: '2029' }))
    await usuario.click(screen.getByRole('button', { name: 'agosto de 2029' }))
    expect(screen.getByRole('grid', { name: 'agosto de 2029' })).toBeInTheDocument()
  })

  it('"Hoje" escolhe o dia da consultoria; "Limpar" esvazia', async () => {
    const usuario = userEvent.setup()
    const aoMudar = vi.fn()
    render(<Campo aoMudar={aoMudar} />)
    const abrir = screen.getByRole('button', { name: 'Abrir calendário de Validade confirmada' })
    await usuario.click(abrir)
    expect(await screen.findByRole('button', { name: 'Limpar' })).toBeDisabled()
    await usuario.click(screen.getByRole('button', { name: 'Hoje' }))
    expect(aoMudar).toHaveBeenLastCalledWith('2026-11-05')

    await usuario.click(abrir)
    await usuario.click(await screen.findByRole('button', { name: 'Limpar' }))
    expect(aoMudar).toHaveBeenLastCalledWith(null)
    expect(screen.getByLabelText('Validade confirmada *')).toHaveValue('')
  })

  it('datas depois do máximo ficam bloqueadas, no calendário e ao digitar', async () => {
    const usuario = userEvent.setup()
    const aoMudar = vi.fn()
    render(
      <Campo
        aoMudar={aoMudar}
        maximo={HOJE}
        motivoDoLimite="Datas futuras ficam bloqueadas para emissão"
      />,
    )
    await usuario.click(
      screen.getByRole('button', { name: 'Abrir calendário de Validade confirmada' }),
    )
    const amanha = await screen.findByRole('button', { name: '6 de novembro de 2026' })
    expect(amanha).toHaveAttribute('aria-disabled', 'true')
    await usuario.click(amanha)
    expect(aoMudar).not.toHaveBeenCalled()
    expect(screen.getByText('Datas futuras ficam bloqueadas para emissão')).toBeInTheDocument()

    await usuario.keyboard('{Escape}')
    const campo = screen.getByLabelText('Validade confirmada *')
    await usuario.type(campo, '06/11/2026')
    expect(campo).toHaveAccessibleDescription('Datas futuras ficam bloqueadas para emissão')
    expect(aoMudar).not.toHaveBeenCalled()
  })
})
