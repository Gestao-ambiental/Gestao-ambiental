// Profissão (no que a pessoa é formada) e cargo (para o que foi contratada), escolhidos nas listas
// fixas do Grama (ADR-0021). Usado no Perfil e na Equipe.

import {
  CARGOS,
  PROFISSOES,
  type CodigoCargo,
  type CodigoProfissao,
} from '@gestao-ambiental/domain'
import { useId } from 'react'

import { SelecaoDaLista } from '@/components/selecao-da-lista'

import { classeCampo } from '../orcamentos/comum'

export function CamposProfissaoECargo({
  profissao,
  cargo,
  cargoAntigo,
  aoMudarProfissao,
  aoMudarCargo,
  desabilitado,
}: {
  profissao: CodigoProfissao | ''
  cargo: CodigoCargo | ''
  /** Cargo digitado antes da lista, mostrado até alguém escolher um da lista. */
  cargoAntigo: string | null
  aoMudarProfissao: (codigo: CodigoProfissao | '') => void
  aoMudarCargo: (codigo: CodigoCargo | '') => void
  desabilitado?: boolean
}) {
  const idProfissao = useId()
  const idCargo = useId()
  const idAjudaProfissao = useId()
  const idAjudaCargo = useId()
  return (
    <div className="grid gap-(--space-150) sm:grid-cols-2">
      <div className="flex flex-col gap-(--space-050)">
        <label htmlFor={idProfissao} className="rotulo">
          Profissão
        </label>
        <SelecaoDaLista
          id={idProfissao}
          lista={PROFISSOES}
          valor={profissao}
          aoMudar={aoMudarProfissao}
          vazio="Não informada"
          disabled={desabilitado}
          aria-describedby={idAjudaProfissao}
          className={classeCampo}
        />
        <span id={idAjudaProfissao} className="text-xs text-(--text-subtle)">
          No que a pessoa é formada.
        </span>
      </div>
      <div className="flex flex-col gap-(--space-050)">
        <label htmlFor={idCargo} className="rotulo">
          Cargo
        </label>
        <SelecaoDaLista
          id={idCargo}
          lista={CARGOS}
          valor={cargo}
          aoMudar={aoMudarCargo}
          vazio="Não informado"
          valorAntigo={cargoAntigo}
          disabled={desabilitado}
          aria-describedby={idAjudaCargo}
          className={classeCampo}
        />
        <span id={idAjudaCargo} className="text-xs text-(--text-subtle)">
          Para o que foi contratada. Aparece embaixo do nome ao escolher o responsável.
        </span>
      </div>
    </div>
  )
}
