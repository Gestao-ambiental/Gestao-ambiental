import { formatarReais, passagemDoLimite } from '@gestao-ambiental/domain'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Botao } from '@/components/ui/botao'
import { Dialogo } from '@/components/ui/dialogo'
import { confirmarAdicional, type RecursoDoAdicional } from '@/lib/api/plano'
import { mensagemDoErro } from '@/lib/erros'

import { useCatalogoComercial } from './catalogo'
import { CHAVE_SITUACAO_COMERCIAL, useDadosComerciais } from './situacao'

const NOME_DO_RECURSO: Record<RecursoDoAdicional, { titulo: string; um: string }> = {
  pessoas: { titulo: 'Pessoas', um: 'pessoa' },
  empreendimentos: { titulo: 'Empreendimentos ativos', um: 'empreendimento' },
}

interface Props {
  recurso: RecursoDoAdicional
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  /** Depois da confirmação gravada no banco: refaz a ação (convidar, ativar a licença). */
  aoConfirmado: () => void
}

/**
 * Antes da ação que passa do limite do plano (ADR-0026), a Gestão vê o adicional (R$ 20 por mês por
 * pessoa ou empreendimento a mais) e o novo valor mensal, e confirma. A confirmação fica registrada
 * no banco (confirmar_adicional); sem ela, o banco recusa a ação.
 */
export function DialogoAdicional({ recurso, aberto, aoMudar, aoConfirmado }: Props) {
  const { atual } = useConsultoria()
  const queryClient = useQueryClient()
  const dados = useDadosComerciais().data
  const catalogo = useCatalogoComercial().data
  const nome = NOME_DO_RECURSO[recurso]
  const s = dados?.situacao
  const uso = dados
    ? {
        // Para convidar, cada convite pendente já reserva uma vaga.
        pessoas: dados.uso.pessoas + dados.uso.convitesPendentes,
        empreendimentos: dados.uso.empreendimentos,
      }
    : null
  const passagem =
    s && uso && catalogo
      ? passagemDoLimite(recurso, uso, s.planoVigente, s.cicloVigente, s.limites, catalogo)
      : null

  const confirmar = useMutation({
    mutationFn: () => confirmarAdicional(atual.consultoriaId, recurso),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [CHAVE_SITUACAO_COMERCIAL] })
      aoMudar(false)
      aoConfirmado()
    },
  })

  return (
    <Dialogo
      aberto={aberto}
      aoMudar={(novo) => {
        if (!confirmar.isPending) aoMudar(novo)
      }}
      titulo="Passa do limite do plano"
      descricao={
        catalogo
          ? `Cada ${nome.um} a mais custa ${formatarReais(catalogo.configuracao.adicionalMensalCentavos)} por mês.`
          : null
      }
      acoes={
        <>
          <Botao
            disabled={confirmar.isPending}
            onClick={() => {
              aoMudar(false)
            }}
          >
            Cancelar
          </Botao>
          <Botao
            aparencia="primario"
            disabled={confirmar.isPending}
            onClick={() => {
              confirmar.mutate()
            }}
          >
            Confirmar e continuar
          </Botao>
        </>
      }
    >
      {passagem && catalogo && s?.planoVigente ? (
        <dl className="grid grid-cols-[1fr_auto] gap-x-(--space-200) gap-y-(--space-075)">
          <dt>{nome.titulo}</dt>
          <dd className="text-right tabular-nums">
            {passagem.quantidade} de {passagem.limite} no plano{' '}
            {catalogo.planos[s.planoVigente].nome}
          </dd>
          <dt>Adicionais por mês</dt>
          <dd className="text-right tabular-nums">{formatarReais(passagem.adicionaisDepois)}</dd>
          <dt className="corpo-medio">
            {s.cicloVigente === 'anual' ? 'Novo valor mensal equivalente' : 'Novo valor mensal'}
          </dt>
          <dd className="text-right corpo-medio tabular-nums">
            {formatarReais(passagem.mensalDepois)}
          </dd>
        </dl>
      ) : null}
      {confirmar.isError ? (
        <p role="alert" className="text-(--text-danger)">
          {mensagemDoErro(confirmar.error)}
        </p>
      ) : null}
    </Dialogo>
  )
}
