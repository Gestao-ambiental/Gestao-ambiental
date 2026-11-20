// Coluna da conferência por IA ao lado do texto do relatório (ADR-0040). Mostra a última conferência
// (e de que versão ela é), os apontamentos não ignorados e as ações de cada um. Escolher um cartão
// leva ao trecho sublinhado; "Aplicar sugestão" troca o trecho e marca o apontamento como resolvido.
import type { Editor } from '@tiptap/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { CartaoDoApontamento } from '@/app/conferencia/Apontamentos'
import { SEM_NOVA_TENTATIVA, situacaoDaConferencia } from '@/app/conferencia/rotulos'
import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { conferenciaDoRelatorio, ignorarApontamento } from '@/lib/api/conferencia-ia'
import type { Relatorio } from '@/lib/api/relatorios'
import { mensagemDoErro } from '@/lib/erros'

import {
  acharTrecho,
  aplicarSugestao,
  irAoTrecho,
  mostrarApontamentos,
  type ApontamentoNoTexto,
} from './apontamentos-no-texto'

export function ColunaDaConferencia({
  relatorio,
  editor,
  podeEditar,
  podeRevisar,
  ativo,
  aoEscolher,
  conferindo,
  aoConferir,
  aoAplicar,
}: {
  relatorio: Relatorio
  editor: Editor | null
  podeEditar: boolean
  podeRevisar: boolean
  ativo: number | null
  aoEscolher: (indice: number | null) => void
  conferindo: boolean
  aoConferir: () => void
  aoAplicar: () => void
}) {
  const queryClient = useQueryClient()
  const chave = ['relatorio', relatorio.id, 'conferencia']
  const conferencia = useQuery({
    queryKey: chave,
    queryFn: () => conferenciaDoRelatorio(relatorio.id),
    refetchInterval: (consulta) =>
      consulta.state.data?.situacao === 'em_andamento' ? 4000 : false,
  })
  const ignorar = useMutation({
    mutationFn: ({ conferenciaId, indice }: { conferenciaId: string; indice: number }) =>
      ignorarApontamento(conferenciaId, indice),
    onSettled: () => queryClient.invalidateQueries({ queryKey: chave }),
  })

  const dados = conferencia.data ?? null
  const visiveis: ApontamentoNoTexto[] = (dados?.apontamentos ?? [])
    .map((apontamento, indice) => ({ indice, apontamento }))
    .filter(({ indice }) => !dados?.ignorados.includes(indice))

  // Sublinha no texto o que está na lista (e destaca o escolhido).
  const assinatura = `${dados?.id ?? ''}:${visiveis.map((v) => v.indice).join(',')}`
  useEffect(() => {
    if (editor && !editor.isDestroyed) mostrarApontamentos(editor, visiveis, ativo)
    // A assinatura resume a lista: refazer só quando ela, o editor ou o ativo mudam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, assinatura, ativo])

  const emAndamento = conferindo || dados?.situacao === 'em_andamento'
  const daVersao =
    dados?.relatorioVersao && dados.relatorioVersao !== relatorio.versao
      ? `Da versão ${String(dados.relatorioVersao)}`
      : null
  const podeAgir = podeEditar || podeRevisar
  const podeConferir =
    podeAgir &&
    !emAndamento &&
    (dados?.situacao !== 'falhou' || !SEM_NOVA_TENTATIVA.has(dados.motivo ?? ''))

  return (
    <section
      aria-label="Conferência da IA"
      className="flex w-full flex-col gap-(--e-3) lg:sticky lg:top-(--e-4) lg:w-[360px] lg:shrink-0"
    >
      <div className="flex flex-col gap-(--e-1) border-b border-(--regra-forte) pb-(--e-2)">
        <h2 className="titulo-secao text-(--tinta)">Conferência da IA</h2>
        <span role="status" className="corpo text-(--tinta-2)">
          {conferencia.isPending
            ? 'Carregando'
            : situacaoDaConferencia(emAndamento, dados, visiveis.length)}
          {daVersao && !emAndamento ? <span className="numero"> · {daVersao}</span> : null}
        </span>
      </div>
      {podeConferir ? (
        <Botao iconeAntes="sparkles" disabled={conferindo} onClick={aoConferir}>
          {relatorio.situacao === 'em_revisao' ? 'Conferir com IA' : 'Conferir antes de enviar'}
        </Botao>
      ) : null}
      {conferencia.isError ? (
        <MensagemSecao tom="perigo" role="alert">
          {mensagemDoErro(conferencia.error)}
        </MensagemSecao>
      ) : null}
      {ignorar.isError ? (
        <MensagemSecao tom="perigo" role="alert">
          {mensagemDoErro(ignorar.error)}
        </MensagemSecao>
      ) : null}
      {dados?.situacao === 'concluida' && dados.resumo && !emAndamento ? (
        <p className="corpo text-(--tinta)">{dados.resumo}</p>
      ) : null}
      {visiveis.length > 0 && !emAndamento && dados ? (
        <ul aria-label="Apontamentos da IA" className="flex flex-col">
          {visiveis.map(({ indice, apontamento }) => {
            const noTexto = editor ? acharTrecho(editor.state.doc, apontamento.trecho) : null
            return (
              <CartaoDoApontamento
                key={indice}
                apontamento={apontamento}
                ativo={ativo === indice}
                aoEscolher={() => {
                  aoEscolher(indice)
                  if (editor) irAoTrecho(editor, apontamento)
                }}
                acoes={
                  podeAgir ? (
                    <>
                      {podeEditar && apontamento.substituicao && noTexto ? (
                        <Botao
                          tamanho="compacto"
                          onClick={() => {
                            if (editor && aplicarSugestao(editor, apontamento)) {
                              aoAplicar()
                              ignorar.mutate({ conferenciaId: dados.id, indice })
                            }
                          }}
                        >
                          Aplicar sugestão
                        </Botao>
                      ) : null}
                      <Botao
                        aparencia="sutil"
                        tamanho="compacto"
                        disabled={ignorar.isPending}
                        onClick={() => {
                          ignorar.mutate({ conferenciaId: dados.id, indice })
                        }}
                      >
                        Ignorar
                      </Botao>
                    </>
                  ) : null
                }
              />
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
