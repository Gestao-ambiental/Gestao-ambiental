// "Gravar na licença" da triagem (ADR-0044): grava as atividades enquadradas numa licença do
// empreendimento, para a taxa da renovação vir sugerida no orçamento. Só a Gestão (a RPC confere).
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'

import { Botao } from '@/components/ui/botao'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { listarLicencasDoEmpreendimento } from '@/lib/api/licencas'
import { mensagemDoErro } from '@/lib/erros'

/** Licença onde gravar, com o rótulo "SIGLA número" e se tem plano de renovação. */
export interface LicencaParaGravar {
  id: string
  rotulo: string
  temPlano: boolean
}

const ROTULO = 'Gravar na licença'

/**
 * Ação principal da triagem com empreendimento. Com `licencaPedida` (vinda do plano de renovação)
 * que seja deste empreendimento, grava direto nela; senão, um menu com as licenças dele.
 */
export function AcaoGravarNaLicenca({
  empreendimentoId,
  licencaPedida,
  gravando,
  aoGravar,
}: {
  empreendimentoId: string
  licencaPedida: string | null
  gravando: boolean
  aoGravar: (licenca: LicencaParaGravar) => void
}) {
  const licencas = useQuery({
    queryKey: ['licencas-para-triagem', empreendimentoId],
    // Primeira página (50): empreendimento com mais licenças é raro; as mais novas vêm antes.
    queryFn: () => listarLicencasDoEmpreendimento(empreendimentoId, 0),
    select: (pagina): LicencaParaGravar[] =>
      pagina.itens.map((l) => ({
        id: l.id,
        rotulo: [l.sigla, l.numero].filter(Boolean).join(' ') || 'Licença sem número',
        temPlano: l.diasLimite !== null,
      })),
  })

  if (licencas.isPending) {
    return (
      <Botao aparencia="primario" disabled>
        {ROTULO}
      </Botao>
    )
  }
  const lista = licencas.data ?? []
  const pedida = lista.find((l) => l.id === licencaPedida)
  if (pedida) {
    return (
      <Botao
        aparencia="primario"
        disabled={gravando}
        aria-label={`${ROTULO}: ${pedida.rotulo}`}
        onClick={() => {
          aoGravar(pedida)
        }}
      >
        {gravando ? 'Gravando…' : ROTULO}
      </Botao>
    )
  }
  if (!licencas.isError && lista.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Botao aparencia="primario" iconeDepois="chevron-down" disabled={gravando}>
          {gravando ? 'Gravando…' : ROTULO}
        </Botao>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {licencas.isError ? (
          <DropdownMenuItem
            onSelect={() => {
              void licencas.refetch()
            }}
          >
            Não foi possível carregar as licenças. Tentar de novo
          </DropdownMenuItem>
        ) : (
          lista.map((licenca) => (
            <DropdownMenuItem
              key={licenca.id}
              className="numero"
              onSelect={() => {
                aoGravar(licenca)
              }}
            >
              {licenca.rotulo}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Retorno da gravação: sucesso com link para o plano (quando há) ou o erro. */
export function RetornoDaGravacao({
  gravada,
  erro,
}: {
  gravada: LicencaParaGravar | null
  erro: unknown
}) {
  if (erro) {
    return (
      <MensagemSecao role="alert" tom="perigo">
        {mensagemDoErro(erro)}
      </MensagemSecao>
    )
  }
  if (!gravada) return null
  return (
    <MensagemSecao role="status" tom="sucesso">
      Gravado na{' '}
      {gravada.temPlano ? (
        <Link to={`/renovacoes/${gravada.id}`} className="numero">
          {gravada.rotulo}
        </Link>
      ) : (
        <span className="numero">{gravada.rotulo}</span>
      )}
    </MensagemSecao>
  )
}
