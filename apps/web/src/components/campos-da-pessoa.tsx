// Gênero e formação da própria pessoa (ADR-0021): criar conta, conta nova pelo convite, completar
// cadastro e Perfil. O gênero só muda como a profissão é escrita junto do nome; a lista de
// formações acompanha o gênero escolhido. Formação ainda em curso aparece como "Estudante de …".

import {
  GENEROS,
  profissoesParaOGenero,
  type CodigoProfissao,
  type GeneroDaPessoa,
} from '@gestao-ambiental/domain'
import { useId, type Ref } from 'react'

import { classeCampo } from '@/app/paginas/orcamentos/comum'
import { SelecaoDaLista } from '@/components/selecao-da-lista'
import { CaixaSelecao, OpcaoRadio } from '@/components/ui/caixa-selecao'

function ErroDoCampo({ id, children }: { id: string; children: string }) {
  return (
    <span id={id} className="text-xs text-(--text-danger)">
      {children}
    </span>
  )
}

/** Grupo de opções (rádio): Feminino, Masculino, Prefiro não dizer. */
export function CampoGenero({
  valor,
  aoMudar,
  aoSair,
  erro,
  desabilitado,
  ref,
}: {
  valor: GeneroDaPessoa | ''
  aoMudar: (genero: GeneroDaPessoa) => void
  aoSair?: () => void
  erro?: string
  desabilitado?: boolean
  /** Primeira opção, para o formulário pôr o foco no campo com erro. */
  ref?: Ref<HTMLInputElement>
}) {
  const id = useId()
  const erroId = `${id}-erro`
  return (
    <fieldset disabled={desabilitado} className="flex min-w-0 flex-col gap-(--space-050)">
      <legend className="mb-(--space-050) rotulo">Gênero</legend>
      <div className="flex flex-wrap gap-(--space-100)">
        {GENEROS.map((g, indice) => (
          <OpcaoRadio
            key={g.codigo}
            ref={indice === 0 ? ref : undefined}
            name={`${id}-genero`}
            value={g.codigo}
            rotulo={g.rotulo}
            checked={valor === g.codigo}
            onChange={() => {
              aoMudar(g.codigo)
            }}
            onBlur={aoSair}
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? erroId : undefined}
            className={erro ? 'border-(--border-danger)' : undefined}
          />
        ))}
      </div>
      {erro ? <ErroDoCampo id={erroId}>{erro}</ErroDoCampo> : null}
    </fieldset>
  )
}

/** Formação (profissão principal) da lista fixa, escrita no gênero escolhido. */
export function CampoFormacao({
  genero,
  valor,
  aoMudar,
  aoSair,
  erro,
  desabilitado,
  rotulo = 'Formação',
  ref,
}: {
  genero: GeneroDaPessoa | null
  valor: CodigoProfissao | ''
  aoMudar: (codigo: CodigoProfissao | '') => void
  aoSair?: () => void
  erro?: string
  desabilitado?: boolean
  rotulo?: string
  ref?: Ref<HTMLSelectElement>
}) {
  const id = useId()
  const erroId = `${id}-erro`
  return (
    <div className="flex flex-col gap-(--space-050)">
      <label htmlFor={id} className="rotulo">
        {rotulo}
      </label>
      <SelecaoDaLista
        id={id}
        ref={ref}
        lista={profissoesParaOGenero(genero)}
        valor={valor}
        aoMudar={aoMudar}
        onBlur={aoSair}
        disabled={desabilitado}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? erroId : undefined}
        className={classeCampo}
      />
      {erro ? <ErroDoCampo id={erroId}>{erro}</ErroDoCampo> : null}
    </div>
  )
}

/** "Ainda estou cursando", logo abaixo da formação: junto do nome vira "Estudante de …". */
export function CampoEmCurso({
  marcado,
  aoMudar,
  aoSair,
  desabilitado,
  rotulo = 'Ainda estou cursando',
  ref,
}: {
  marcado: boolean
  aoMudar: (marcado: boolean) => void
  aoSair?: () => void
  desabilitado?: boolean
  rotulo?: string
  ref?: Ref<HTMLInputElement>
}) {
  return (
    <CaixaSelecao
      ref={ref}
      rotulo={rotulo}
      checked={marcado}
      onChange={(evento) => {
        aoMudar(evento.target.checked)
      }}
      onBlur={aoSair}
      disabled={desabilitado}
      className="self-start"
    />
  )
}
