// Caixa de seleção de uma lista fixa do Grama (profissão e cargo, ADR-0021), com grupos. Sem texto
// livre: um valor antigo fora da lista aparece como opção própria até a pessoa escolher outro.

import { gruposDaLista, type ItemDaLista } from '@gestao-ambiental/domain'
import type { SelectHTMLAttributes } from 'react'

export function SelecaoDaLista<C extends string>({
  lista,
  valor,
  aoMudar,
  vazio = 'Escolha',
  valorAntigo,
  ...resto
}: {
  lista: readonly ItemDaLista<C>[]
  /** Código escolhido, ou '' para nenhum. */
  valor: C | ''
  aoMudar: (codigo: C | '') => void
  /** Texto da opção vazia. */
  vazio?: string
  /** Texto antigo (digitado antes da lista), mostrado enquanto nada da lista foi escolhido. */
  valorAntigo?: string | null
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'>) {
  const antigo = valor === '' && valorAntigo ? valorAntigo : null
  return (
    <select
      {...resto}
      value={antigo ? '__antigo__' : valor}
      onChange={(e) => {
        const escolhido = e.target.value
        if (escolhido === '__antigo__') return
        aoMudar(lista.some((i) => i.codigo === escolhido) ? (escolhido as C) : '')
      }}
    >
      {antigo ? <option value="__antigo__">{antigo} (antigo, escolha na lista)</option> : null}
      <option value="">{vazio}</option>
      {gruposDaLista(lista).map((g) => (
        <optgroup key={g.grupo} label={g.grupo}>
          {g.itens.map((i) => (
            <option key={i.codigo} value={i.codigo}>
              {i.rotulo}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
