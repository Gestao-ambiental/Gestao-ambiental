import { useEffect } from 'react'
import { Link, useParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Icone } from '@/components/ui/icone'
import { ehSemPermissao } from '@/lib/erros'

import { useDadosDaOcorrencia } from './dados'
import { PainelAtividade } from './PainelAtividade'

/**
 * /ocorrencias/:id/atividade: a Atividade em tela própria no celular (Tela 16 v2, seção 1). No
 * desktop o mesmo painel fica ao lado da ocorrência.
 */
export function PaginaAtividadeOcorrencia() {
  const { id = '' } = useParams()
  const { atual } = useConsultoria()
  const dados = useDadosDaOcorrencia(id)
  const { ocorrencia, atividade, evidencias, membros, urls } = dados

  const codigo = ocorrencia.data?.codigo
  useEffect(() => {
    document.title = `Atividade${codigo ? ` · Condicionante ${codigo}` : ''} · Grama`
  }, [codigo])

  const cabecalho = (
    <header className="flex h-12 shrink-0 items-center gap-(--space-100) border-b px-(--space-100)">
      <Link
        to={`/ocorrencias/${id}`}
        aria-label="Voltar para a ocorrência"
        title="Voltar para a ocorrência"
        className="inline-flex size-(--size-control) items-center justify-center rounded-(--radius) text-(--icon) transicao-estado hover:bg-(--surface-hover)"
      >
        <Icone nome="chevron-left" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <h1 id="titulo-atividade" className="corpo font-medium">
          Atividade
        </h1>
        {codigo ? (
          <span className="truncate text-xs text-(--text-subtle)">Condicionante {codigo}</span>
        ) : null}
      </div>
    </header>
  )

  if (ocorrencia.isPending) {
    return (
      <div className="flex h-full flex-col">
        {cabecalho}
        <div className="p-(--space-200)">
          <Carregando rotulo="Carregando a atividade" linhas={5} />
        </div>
      </div>
    )
  }
  if (ocorrencia.isError || !ocorrencia.data) {
    return (
      <div className="flex h-full flex-col">
        {cabecalho}
        <div className="p-(--space-200)">
          {ocorrencia.isError ? (
            ehSemPermissao(ocorrencia.error) ? (
              <SemPermissao />
            ) : (
              <EstadoErro
                titulo="Não foi possível carregar a atividade."
                aoTentarDeNovo={() => void ocorrencia.refetch()}
              />
            )
          ) : (
            <EstadoVazio
              icone="file-text"
              titulo="Ocorrência não encontrada"
              descricao={`Ela não existe ou não é da ${atual.consultoriaNome}.`}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <PainelAtividade
      className="h-full"
      cabecalho={cabecalho}
      ocorrencia={ocorrencia.data}
      eventos={atividade.data}
      carregando={atividade.isPending}
      comErro={atividade.isError}
      aoTentarDeNovo={() => void atividade.refetch()}
      evidencias={evidencias.data ?? []}
      membros={membros.data ?? []}
      urls={urls}
      fuso={atual.fuso}
      aoComentar={dados.recarregar}
    />
  )
}
