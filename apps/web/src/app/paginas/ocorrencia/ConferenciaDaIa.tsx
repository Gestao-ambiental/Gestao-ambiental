// Conferência do relatório por IA na seção Evidência (ADR-0036, fatia 3). Aparece para quem enviou
// e para quem confere. A IA só aponta: aprovar ou devolver continua com a Gestão. Quem enviou dispara
// a conferência ao abrir a evidência sem conferência; repetir não chama a IA de novo (o banco e a
// função devolvem a situação).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import {
  listarConferenciasIa,
  pedirConferenciaIa,
  type Apontamento,
  type CategoriaDoApontamento,
} from '@/lib/api/conferencia-ia'
import { temTextoParaConferir, type Evidencia } from '@/lib/api/ocorrencias'
import { mensagemDoErro } from '@/lib/erros'

const CATEGORIAS: Record<CategoriaDoApontamento, string> = {
  empreendimento: 'Empreendimento',
  licenca: 'Licença',
  condicionante: 'Condicionante',
  datas: 'Datas',
  consistencia: 'Consistência',
  escrita: 'Escrita',
}

const MOTIVOS: Record<string, string> = {
  ia_fora_do_plano: 'o plano não inclui IA',
  tipo_sem_texto: 'imagem não tem texto para conferir',
  arquivo_sem_texto: 'o arquivo não tem texto legível',
  arquivo_grande_demais: 'arquivo acima de 15 MB',
  texto_longo_demais: 'texto longo demais para a IA',
  limite_atingido: 'limite de uso da IA nas últimas 24 horas',
}

/** Motivos em que tentar de novo não muda nada (o arquivo é o mesmo). */
const SEM_NOVA_TENTATIVA = new Set([
  'tipo_sem_texto',
  'arquivo_sem_texto',
  'arquivo_grande_demais',
  'texto_longo_demais',
])

function ItemDoApontamento({ apontamento }: { apontamento: Apontamento }) {
  return (
    <li className="flex flex-col gap-(--space-025) border-b px-(--space-150) py-(--space-100) last:border-b-0">
      <span className="flex flex-wrap items-center gap-(--space-100)">
        {apontamento.gravidade === 'corrigir' ? (
          <Selo tom="perigo">Corrigir</Selo>
        ) : (
          <Selo tom="atencao">Verificar</Selo>
        )}
        <span className="text-xs text-(--text-subtle)">
          {CATEGORIAS[apontamento.categoria]}
          {apontamento.origem === 'regra' ? ' · regra fixa' : ''}
        </span>
      </span>
      <span className="corpo-medio">{apontamento.problema}</span>
      {apontamento.trecho ? (
        <span className="corpo text-(--text-subtle)">“{apontamento.trecho}”</span>
      ) : null}
      {apontamento.sugestao ? <span className="corpo">{apontamento.sugestao}</span> : null}
    </li>
  )
}

export function ConferenciaDaIa({
  ocorrenciaId,
  evidencia,
  enviei,
  possoPedir,
}: {
  ocorrenciaId: string
  evidencia: Evidencia
  /** Quem enviou: dispara a conferência sozinho se ela ainda não existe. */
  enviei: boolean
  /** Quem enviou, o conferente ou a Gestão (o banco confere de novo). */
  possoPedir: boolean
}) {
  const queryClient = useQueryClient()
  const chave = ['ocorrencia', ocorrenciaId, 'conferencia-ia', evidencia.id]
  const conferencia = useQuery({
    queryKey: chave,
    queryFn: async () => (await listarConferenciasIa([evidencia.id])).get(evidencia.id) ?? null,
    refetchInterval: (consulta) =>
      consulta.state.data?.situacao === 'em_andamento' ? 4000 : false,
  })
  const pedir = useMutation({
    mutationFn: () => pedirConferenciaIa(evidencia.id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: chave }),
  })

  const temTexto = temTextoParaConferir(evidencia.arquivo.mime)
  const pedidoAutomatico = useRef(false)
  const semConferencia = conferencia.isSuccess && conferencia.data === null
  const deveDisparar =
    semConferencia && enviei && temTexto && evidencia.situacao === 'em_conferencia'
  useEffect(() => {
    if (!deveDisparar || pedidoAutomatico.current) return
    pedidoAutomatico.current = true
    pedir.mutate()
  }, [deveDisparar, pedir])

  if (!temTexto || conferencia.isPending) return null
  if (conferencia.isError) {
    return (
      <MensagemSecao tom="perigo" role="alert">
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

  let situacao: string
  if (conferindo) situacao = 'Conferindo'
  else if (!dados) situacao = 'Não conferido'
  else if (dados.situacao === 'falhou')
    situacao = `Não conferido pela IA: ${MOTIVOS[dados.motivo ?? ''] ?? 'IA indisponível agora'}`
  else if (apontamentos.length === 0) situacao = 'Sem apontamentos'
  else
    situacao =
      apontamentos.length === 1 ? '1 apontamento' : `${String(apontamentos.length)} apontamentos`

  return (
    <section aria-label="Conferência da IA" className="flex flex-col gap-(--space-100)">
      <div className="flex flex-wrap items-center gap-(--space-100)">
        <h3 className="corpo-medio text-(--text)">Conferência da IA</h3>
        <span role="status" className="flex-1 corpo text-(--text-subtle)">
          {situacao}
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
        <p className="corpo">{dados.resumo}</p>
      ) : null}
      {apontamentos.length > 0 && !conferindo ? (
        <ul aria-label="Apontamentos da IA" className="flex flex-col rounded-(--radius) border">
          {apontamentos.map((apontamento, indice) => (
            <ItemDoApontamento key={indice} apontamento={apontamento} />
          ))}
        </ul>
      ) : null}
    </section>
  )
}
