// Conferência do relatório anexado por IA na seção Evidência (ADR-0037). Aparece para quem enviou e
// para quem confere. A IA só aponta: aprovar ou devolver continua com a Gestão. Quem enviou dispara
// a conferência ao abrir a evidência sem conferência; repetir não chama a IA de novo.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { CartaoDoApontamento } from '@/app/conferencia/Apontamentos'
import { SEM_NOVA_TENTATIVA, situacaoDaConferencia } from '@/app/conferencia/rotulos'
import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { listarConferenciasIa, pedirConferenciaIa } from '@/lib/api/conferencia-ia'
import { temTextoParaConferir, type Evidencia, type Ocorrencia } from '@/lib/api/ocorrencias'
import { mensagemDoErro } from '@/lib/erros'

export function ConferenciaDaIa({
  ocorrencia,
  evidencia,
}: {
  ocorrencia: Ocorrencia
  evidencia: Evidencia
}) {
  const { atual } = useConsultoria()
  const queryClient = useQueryClient()
  const enviei = evidencia.enviadaPorId === atual.membroId
  // Quem pode pedir de novo: quem enviou, o conferente ou a Gestão (o banco confere de novo).
  const possoPedir =
    enviei || ocorrencia.conferenteId === atual.membroId || atual.papel === 'gestao'
  const chave = ['ocorrencia', ocorrencia.id, 'conferencia-ia', evidencia.id]
  const conferencia = useQuery({
    queryKey: chave,
    queryFn: async () => (await listarConferenciasIa([evidencia.id])).get(evidencia.id) ?? null,
    refetchInterval: (consulta) =>
      consulta.state.data?.situacao === 'em_andamento' ? 4000 : false,
  })
  const pedir = useMutation({
    mutationFn: () => pedirConferenciaIa({ evidenciaId: evidencia.id }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: chave }),
  })

  const temTexto = temTextoParaConferir(evidencia.arquivo.mime)
  const pedidoAutomatico = useRef(false)
  const deveDisparar =
    conferencia.isSuccess &&
    conferencia.data === null &&
    enviei &&
    temTexto &&
    evidencia.situacao === 'em_conferencia'
  useEffect(() => {
    if (!deveDisparar || pedidoAutomatico.current) return
    pedidoAutomatico.current = true
    pedir.mutate()
  }, [deveDisparar, pedir])

  if (!temTexto || conferencia.isPending) return null
  if (conferencia.isError) {
    return (
      <MensagemSecao tom="perigo" role="alert" className="mt-(--e-3)">
        {mensagemDoErro(conferencia.error)}
      </MensagemSecao>
    )
  }

  const dados = conferencia.data
  const conferindo = pedir.isPending || dados?.situacao === 'em_andamento'
  const apontamentos = dados?.apontamentos ?? []
  const podeRefazer =
    possoPedir &&
    !conferindo &&
    (dados === null || (dados.situacao === 'falhou' && !SEM_NOVA_TENTATIVA.has(dados.motivo ?? '')))

  return (
    <section aria-label="Conferência da IA" className="mt-(--e-4) flex flex-col gap-(--e-2)">
      <div className="flex flex-wrap items-center gap-x-(--e-3) gap-y-(--e-1)">
        <h3 className="titulo-secao text-(--tinta)">Conferência da IA</h3>
        <span role="status" className="flex-1 corpo text-(--tinta-2)">
          {situacaoDaConferencia(conferindo, dados, apontamentos.length)}
        </span>
        {podeRefazer ? (
          <Botao
            aparencia="sutil"
            tamanho="compacto"
            iconeAntes="sparkles"
            onClick={() => {
              pedir.mutate()
            }}
          >
            {dados ? 'Conferir de novo' : 'Conferir com IA'}
          </Botao>
        ) : null}
      </div>
      {pedir.isError ? (
        <MensagemSecao tom="perigo" role="alert">
          {mensagemDoErro(pedir.error)}
        </MensagemSecao>
      ) : null}
      {dados?.situacao === 'concluida' && dados.resumo ? (
        <p className="corpo text-(--tinta)">{dados.resumo}</p>
      ) : null}
      {apontamentos.length > 0 && !conferindo ? (
        <ul aria-label="Apontamentos da IA" className="flex flex-col border-t border-(--regra)">
          {apontamentos.map((apontamento, indice) => (
            <CartaoDoApontamento key={indice} apontamento={apontamento} />
          ))}
        </ul>
      ) : null}
    </section>
  )
}
