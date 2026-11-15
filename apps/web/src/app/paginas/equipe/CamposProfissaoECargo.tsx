// Profissão principal, outras formações concluídas e cargo, escolhidos nas listas fixas do Grama
// (ADR-0021). Usado no Perfil e na Equipe. As profissões aparecem escritas no gênero da pessoa;
// "Ainda estou cursando" marca a principal como em curso ("Estudante de …" junto do nome).

import {
  CARGOS,
  MAXIMO_DE_OUTRAS_PROFISSOES,
  profissoesParaOGenero,
  rotuloDaProfissaoDaPessoa,
  type CodigoCargo,
  type CodigoProfissao,
  type GeneroDaPessoa,
} from '@gestao-ambiental/domain'
import { useId } from 'react'

import { CampoEmCurso } from '@/components/campos-da-pessoa'
import { SelecaoDaLista } from '@/components/selecao-da-lista'
import { BotaoIcone } from '@/components/ui/botao-icone'

import { classeCampo } from '../orcamentos/comum'

export function CamposProfissaoECargo({
  profissao,
  emCurso,
  outras,
  cargo,
  cargoAntigo,
  genero = null,
  rotuloEmCurso,
  aoMudarProfissao,
  aoMudarEmCurso,
  aoMudarOutras,
  aoMudarCargo,
  desabilitado,
}: {
  profissao: CodigoProfissao | ''
  /** A principal ainda em curso. */
  emCurso: boolean
  outras: readonly CodigoProfissao[]
  cargo: CodigoCargo | ''
  /** Cargo digitado antes da lista, mostrado até alguém escolher um da lista. */
  cargoAntigo: string | null
  /** Gênero da pessoa: muda só como a profissão é escrita. */
  genero?: GeneroDaPessoa | null
  /** Rótulo da caixa de "em curso"; padrão: "Ainda estou cursando". */
  rotuloEmCurso?: string
  aoMudarProfissao: (codigo: CodigoProfissao | '') => void
  aoMudarEmCurso: (emCurso: boolean) => void
  aoMudarOutras: (codigos: CodigoProfissao[]) => void
  aoMudarCargo: (codigo: CodigoCargo | '') => void
  desabilitado?: boolean
}) {
  const idProfissao = useId()
  const idCargo = useId()
  const idOutras = useId()
  const idAdicionar = useId()
  // Escolher como principal uma das outras tira ela das outras (igual ao banco).
  const outrasVisiveis = outras.filter((o) => o !== profissao)
  const profissoes = profissoesParaOGenero(genero)
  const rotulo = (codigo: CodigoProfissao) => rotuloDaProfissaoDaPessoa(codigo, genero)
  const disponiveis = profissoes.filter(
    (p) => p.codigo !== profissao && !outrasVisiveis.includes(p.codigo),
  )
  const podeAdicionar =
    profissao !== '' && outrasVisiveis.length < MAXIMO_DE_OUTRAS_PROFISSOES && !desabilitado
  return (
    <div className="flex flex-col gap-(--space-150)">
      <div className="grid gap-(--space-150) sm:grid-cols-2">
        <div className="flex flex-col gap-(--space-050)">
          <label htmlFor={idProfissao} className="rotulo">
            Profissão
          </label>
          <SelecaoDaLista
            id={idProfissao}
            lista={profissoes}
            valor={profissao}
            aoMudar={(codigo) => {
              aoMudarProfissao(codigo)
              aoMudarOutras(codigo ? outrasVisiveis.filter((o) => o !== codigo) : [])
            }}
            vazio="Não informada"
            vazioSoSemValor
            disabled={desabilitado}
            className={classeCampo}
          />
          <CampoEmCurso
            rotulo={rotuloEmCurso}
            marcado={emCurso}
            aoMudar={aoMudarEmCurso}
            desabilitado={profissao === '' || desabilitado}
          />
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
            className={classeCampo}
          />
        </div>
      </div>
      <div role="group" aria-labelledby={idOutras} className="flex flex-col gap-(--space-050)">
        <span id={idOutras} className="rotulo">
          Outras formações concluídas
        </span>
        {outrasVisiveis.length > 0 ? (
          <ul className="flex flex-wrap gap-(--space-100)">
            {outrasVisiveis.map((codigo) => (
              <li
                key={codigo}
                className="flex items-center gap-(--space-050) rounded-(--radius) border border-(--border) py-(--space-025) pr-(--space-025) pl-(--space-100) corpo"
              >
                {rotulo(codigo)}
                <BotaoIcone
                  icone="x"
                  tamanho="compacto"
                  rotulo={`Tirar ${rotulo(codigo)}`}
                  disabled={desabilitado}
                  onClick={() => {
                    aoMudarOutras(outrasVisiveis.filter((o) => o !== codigo))
                  }}
                />
              </li>
            ))}
          </ul>
        ) : null}
        <label htmlFor={idAdicionar} className="sr-only">
          Adicionar outra formação
        </label>
        <SelecaoDaLista
          id={idAdicionar}
          lista={disponiveis}
          valor=""
          aoMudar={(codigo) => {
            if (codigo) aoMudarOutras([...outrasVisiveis, codigo])
          }}
          vazio={profissao === '' ? 'Escolha a profissão primeiro' : 'Adicionar outra formação'}
          disabled={!podeAdicionar}
          className={`${classeCampo} sm:max-w-[calc(50%-var(--space-075))]`}
        />
      </div>
    </div>
  )
}
