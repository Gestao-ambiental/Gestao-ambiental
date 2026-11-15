import { ROTULO_DA_CATEGORIA_DE_EMERGENCIA } from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  CHAVE_ACESSOS_DE_SUPORTE,
  CHAVE_AVISOS_DE_EMERGENCIA,
  useConsultoria,
} from '@/app/consultoria/contexto-consultoria'
import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { listarAvisosDeEmergencia, marcarAvisoComoVisto } from '@/lib/api/suporte'
import { formatarInstanteComHora } from '@/lib/datas'
import { mensagemDoErro } from '@/lib/erros'

/**
 * Faixa para a Gestão (ADR-0025; Termos §13.3 b): acesso de emergência do suporte, com data, hora,
 * operador, categoria e motivo, até um Gestão marcar como visto. Só para a Gestão de verdade: o
 * suporte, a Equipe e quem não é da consultoria não veem (o banco recusa).
 * Se a leitura falhar, a faixa não aparece; o registro continua em Equipe, "Acessos do suporte".
 */
export function AvisoDeEmergenciaDoSuporte() {
  const { atual, suporte } = useConsultoria()
  const ehGestao = atual.papel === 'gestao' && !suporte
  const cid = atual.consultoriaId
  const queryClient = useQueryClient()

  const avisos = useQuery({
    queryKey: [CHAVE_AVISOS_DE_EMERGENCIA, cid],
    queryFn: () => listarAvisosDeEmergencia(cid),
    enabled: ehGestao,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  })

  const visto = useMutation({
    mutationFn: marcarAvisoComoVisto,
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [CHAVE_AVISOS_DE_EMERGENCIA, cid] }),
        queryClient.invalidateQueries({ queryKey: [CHAVE_ACESSOS_DE_SUPORTE, cid] }),
      ]),
  })

  const itens = avisos.data ?? []
  if (!ehGestao || itens.length === 0) return null

  return (
    <section
      aria-label="Avisos do suporte"
      className="mb-(--space-200) flex flex-col gap-(--space-100)"
    >
      {itens.map((aviso) => (
        <MensagemSecao
          key={aviso.id}
          tom="atencao"
          titulo="Acesso de emergência do suporte"
          acoes={
            <Botao
              tamanho="compacto"
              disabled={visto.isPending}
              onClick={() => {
                visto.mutate(aviso.id)
              }}
            >
              Marcar como visto
            </Botao>
          }
        >
          <span className="block">
            {formatarInstanteComHora(aviso.inicio, atual.fuso)} · {aviso.operadorNome}
          </span>
          <span className="block">
            Categoria:{' '}
            {aviso.categoria ? ROTULO_DA_CATEGORIA_DE_EMERGENCIA[aviso.categoria] : 'Não informada'}
          </span>
          <span className="block break-words whitespace-pre-wrap">Motivo: {aviso.motivo}</span>
          {visto.isError && visto.variables === aviso.id ? (
            <span role="alert" className="block text-(--text-danger)">
              {mensagemDoErro(visto.error)}
            </span>
          ) : null}
        </MensagemSecao>
      ))}
    </section>
  )
}
