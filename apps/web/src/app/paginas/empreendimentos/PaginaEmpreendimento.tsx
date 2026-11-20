import {
  formatarDocumentoDoTitular,
  hojeNoFuso,
  rotuloDoDocumentoDoTitular,
} from '@gestao-ambiental/domain'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { listarUnidades, obterEmpreendimento, type Empreendimento } from '@/lib/api/empreendimentos'
import { ehSemPermissao } from '@/lib/erros'

import { AcoesDoEmpreendimento } from './acoes-do-empreendimento'
import { SecoesDoEmpreendimento } from './secoes-do-empreendimento'

const VOLTAR = { para: '/empreendimentos', rotulo: 'Empreendimentos' }

/** Linha abaixo do título: cliente contratante e documento do titular. */
function Meta({ empreendimento }: { empreendimento: Empreendimento }) {
  const documento = formatarDocumentoDoTitular(empreendimento.cnpj)
  return (
    <span className="flex flex-wrap gap-x-(--e-2)">
      <span className={empreendimento.clienteNome ? undefined : 'text-(--tinta-3)'}>
        {empreendimento.clienteNome ?? 'Cliente contratante não informado'}
      </span>
      <span aria-hidden="true">·</span>
      <span>
        {rotuloDoDocumentoDoTitular(empreendimento.cnpj)}{' '}
        {documento ? (
          <span className="numero text-(--tinta)">{documento}</span>
        ) : (
          <span className="text-(--tinta-3)">não informado</span>
        )}
      </span>
    </span>
  )
}

/**
 * /empreendimentos/:id (Protótipo 09; EMP-02). Título com o empreendimento, uma ação principal
 * ("Cadastrar licença", Gestão), o menu "…" (acoes-do-empreendimento) e as seções
 * (secoes-do-empreendimento).
 */
export function PaginaEmpreendimento() {
  const { id = '' } = useParams()
  const { atual } = useConsultoria()
  const local = useLocation()
  const aviso = (local.state as { aviso?: string } | null)?.aviso
  const [unidadeFiltro, setUnidadeFiltro] = useState<string | null>(null)

  const empreendimento = useQuery({
    queryKey: ['empreendimento', id],
    queryFn: () => obterEmpreendimento(id),
  })
  const unidades = useQuery({
    queryKey: ['unidades', id],
    queryFn: () => listarUnidades(id),
    enabled: Boolean(empreendimento.data),
  })

  if (empreendimento.isPending) {
    return (
      <Pagina titulo="Empreendimento" voltar={VOLTAR}>
        <Carregando rotulo="Carregando o empreendimento" linhas={4} />
      </Pagina>
    )
  }
  if (empreendimento.isError) {
    return (
      <Pagina titulo="Empreendimento" voltar={VOLTAR}>
        {ehSemPermissao(empreendimento.error) ? (
          <SemPermissao />
        ) : (
          <EstadoErro
            titulo="Não foi possível carregar o empreendimento."
            aoTentarDeNovo={() => void empreendimento.refetch()}
          />
        )}
      </Pagina>
    )
  }
  if (!empreendimento.data) {
    // Inexistente ou de outra consultoria: a RLS não distingue, e a tela também não.
    return (
      <Pagina titulo="Empreendimento não encontrado" voltar={VOLTAR}>
        <EstadoVazio
          icone="briefcase"
          titulo={`Ele não existe ou não é da ${atual.consultoriaNome}.`}
          acaoPrincipal={
            <Botao aparencia="primario" asChild>
              <Link to="/empreendimentos">Voltar para Empreendimentos</Link>
            </Botao>
          }
        />
      </Pagina>
    )
  }

  const dados = empreendimento.data
  const ehGestao = atual.papel === 'gestao'
  const cadastrarPara = ehGestao
    ? `/licencas/nova?empreendimento=${id}${unidadeFiltro ? `&unidade=${unidadeFiltro}` : ''}`
    : null
  const hoje = hojeNoFuso(new Date(), atual.fuso)

  return (
    <Pagina
      titulo={dados.nome}
      voltar={VOLTAR}
      meta={<Meta empreendimento={dados} />}
      acao={
        <>
          <AcoesDoEmpreendimento
            empreendimento={dados}
            unidades={unidades.data ?? []}
            ehGestao={ehGestao}
          />
          {cadastrarPara ? (
            <Botao aparencia="primario" asChild>
              <Link to={cadastrarPara}>
                <Icone nome="plus" />
                Cadastrar licença
              </Link>
            </Botao>
          ) : null}
        </>
      }
    >
      {aviso ? (
        <MensagemSecao role="status" tom="sucesso">
          {aviso}
        </MensagemSecao>
      ) : null}

      <SecoesDoEmpreendimento
        empreendimento={dados}
        unidades={unidades}
        hoje={hoje}
        ehGestao={ehGestao}
        unidadeFiltro={unidadeFiltro}
        aoFiltrarUnidade={setUnidadeFiltro}
      />
    </Pagina>
  )
}
