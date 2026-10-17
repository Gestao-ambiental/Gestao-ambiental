import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router'

import {
  CHAVE_MEUS_VINCULOS,
  gravarConsultoriaPreferida,
} from '@/app/consultoria/contexto-consultoria'
import type { AvisoDeAcesso } from '@/app/consultoria/RequerConsultoria'
import { NOMES_PAPEL } from '@/app/papeis'
import { useSessao, usuarioDaSessao } from '@/app/sessao/contexto-sessao'
import { Carregando, EstadoErro } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import { listarMeusVinculos } from '@/lib/api/acesso'
import { formatarInstanteComoData } from '@/lib/datas'

import { CabecalhoAcesso, RodapeAcesso } from './CabecalhoAcesso'

export function RodapeDaConta() {
  const { sessao, sair } = useSessao()
  const navegar = useNavigate()
  if (!sessao) return null
  return (
    <RodapeAcesso>
      <span>Conta: {usuarioDaSessao(sessao).email} ·</span>
      <Botao
        aparencia="link"
        className="h-auto"
        onClick={() => void sair().then(() => navegar('/entrar', { replace: true }))}
      >
        Sair
      </Botao>
    </RodapeAcesso>
  )
}

/**
 * /escolher-consultoria (Protótipo 04, ACC-04). Vínculos ativos entram com um clique; os
 * encerrados ficam por último, desabilitados, com a data do fim do acesso.
 */
export function PaginaEscolherConsultoria() {
  const { sessao } = useSessao()
  const usuarioId = sessao?.user.id ?? ''
  const local = useLocation()
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const aviso = (local.state as AvisoDeAcesso | null)?.aviso

  const consulta = useQuery({
    queryKey: [CHAVE_MEUS_VINCULOS, usuarioId],
    queryFn: listarMeusVinculos,
  })

  function entrar(consultoriaId: string) {
    gravarConsultoriaPreferida(usuarioId, consultoriaId)
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== CHAVE_MEUS_VINCULOS })
    void navegar('/', { replace: true })
  }

  const vinculos = consulta.data ?? []
  const ativos = vinculos.filter((v) => v.situacao === 'ativo')

  let corpo
  if (consulta.isPending) {
    corpo = <Carregando rotulo="Carregando suas consultorias" linhas={3} />
  } else if (consulta.isError) {
    corpo = <EstadoErro aoTentarDeNovo={() => void consulta.refetch()} />
  } else if (ativos.length === 0) {
    corpo = (
      <Botao aparencia="primario" larguraTotal asChild>
        <Link to="/criar-consultoria">Criar consultoria</Link>
      </Botao>
    )
  } else {
    corpo = null
  }

  const descricao =
    consulta.isSuccess && ativos.length === 0
      ? 'Você não participa de nenhuma consultoria. Peça um convite à gestão ou crie uma consultoria.'
      : ativos.length === 1
        ? 'Você participa de 1 consultoria. Escolha onde quer trabalhar agora.'
        : `Você participa de ${String(ativos.length)} consultorias. Escolha onde quer trabalhar agora.`

  return (
    <div className="flex flex-col gap-(--space-300)">
      <CabecalhoAcesso titulo="Escolher consultoria">
        {consulta.isSuccess ? descricao : null}
      </CabecalhoAcesso>
      {aviso ? <MensagemSecao tom="atencao">{aviso}</MensagemSecao> : null}
      {corpo}
      {consulta.isSuccess && vinculos.length > 0 ? (
        <ul
          className="flex flex-col overflow-hidden rounded-(--radius) border"
          aria-label="Suas consultorias"
        >
          {vinculos.map((vinculo) => {
            const encerrado = vinculo.situacao === 'desligado'
            return (
              <li key={vinculo.membroId} className="border-b last:border-b-0">
                <button
                  type="button"
                  disabled={encerrado}
                  onClick={() => {
                    entrar(vinculo.consultoriaId)
                  }}
                  className="flex min-h-11 w-full cursor-pointer items-center gap-(--space-150) px-(--space-150) py-(--space-100) text-left transicao-estado hover:bg-(--surface-hover) disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span
                      className={
                        encerrado ? 'truncate corpo text-(--text-disabled)' : 'truncate corpo-medio'
                      }
                    >
                      {vinculo.consultoriaNome}
                    </span>
                    {encerrado && vinculo.desligadoEm ? (
                      <span className="text-xs text-(--text-subtle)">
                        Acesso encerrado em{' '}
                        {formatarInstanteComoData(vinculo.desligadoEm, vinculo.fuso)}
                      </span>
                    ) : null}
                  </span>
                  {encerrado ? null : (
                    <>
                      <Selo>{NOMES_PAPEL[vinculo.papel]}</Selo>
                      <Icone nome="chevron-right" className="text-(--icon)" />
                    </>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
      <RodapeDaConta />
    </div>
  )
}
