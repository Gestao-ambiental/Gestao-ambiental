import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import type { Instrumento } from '@/lib/api/licencas'

import { MolduraCadastro } from './MolduraCadastro'
import type { ChavePasso } from './passos'
import { useInstrumento } from './usar-rascunho'

function MolduraSimples({ passo, children }: { passo: ChavePasso; children: ReactNode }) {
  return (
    <MolduraCadastro passo={passo} sairPara="/empreendimentos">
      {children}
    </MolduraCadastro>
  )
}

/** Só a Gestão cadastra licença (decisão de 17/10/2026); o banco recusa a Equipe de qualquer forma. */
export function SoGestao({ passo, children }: { passo: ChavePasso; children: ReactNode }) {
  const { atual } = useConsultoria()
  if (atual.papel !== 'gestao') {
    return (
      <MolduraSimples passo={passo}>
        <SemPermissao descricao="Só a gestão da consultoria cadastra e ativa licenças." />
      </MolduraSimples>
    )
  }
  return children
}

/**
 * Carrega o rascunho do passo e cobre os estados: carregando, erro, não encontrado (inexistente
 * ou de outra consultoria) e já ativo (o assistente não muda licença ativa).
 */
export function GuardaRascunho({
  id,
  passo,
  children,
}: {
  id: string
  passo: ChavePasso
  children: (instrumento: Instrumento) => ReactNode
}) {
  const consulta = useInstrumento(id)

  let conteudo: ReactNode
  if (consulta.isPending) {
    conteudo = <Carregando rotulo="Carregando o rascunho" linhas={5} />
  } else if (consulta.isError) {
    conteudo = (
      <EstadoErro
        titulo="Não foi possível carregar o rascunho."
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  } else if (!consulta.data) {
    conteudo = (
      <EstadoVazio
        icone="file-text"
        titulo="Licença não encontrada"
        descricao="Ela não existe ou não é desta consultoria."
        acaoPrincipal={
          <Botao aparencia="primario" asChild>
            <Link to="/empreendimentos">Ir para Empreendimentos</Link>
          </Botao>
        }
      />
    )
  } else if (consulta.data.situacao === 'ativo') {
    conteudo = (
      <EstadoVazio
        icone="circle-check"
        titulo="Esta licença já está ativa"
        descricao="Depois de ativado, o plano não muda pelo cadastro. Mudanças de validade, marco ou regra passam por revisão da gestão."
        acaoPrincipal={
          <Botao aparencia="primario" asChild>
            <Link to={`/empreendimentos/${consulta.data.empreendimentoId}`}>
              Ver o empreendimento
            </Link>
          </Botao>
        }
      />
    )
  } else {
    return <SoGestao passo={passo}>{children(consulta.data)}</SoGestao>
  }

  return (
    <SoGestao passo={passo}>
      <MolduraSimples passo={passo}>{conteudo}</MolduraSimples>
    </SoGestao>
  )
}
