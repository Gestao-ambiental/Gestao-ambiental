// "Gravar" da triagem: grava as atividades enquadradas numa licença do empreendimento (ADR-0044),
// para a taxa da renovação vir sugerida no orçamento, ou no próprio empreendimento (ADR-0050,
// LEG-05), quando ainda não há licença. Só a Gestão (as RPCs conferem).
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'

import { Botao } from '@/components/ui/botao'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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

/** Empreendimento da triagem, como aparece no link de volta. */
export interface EmpreendimentoParaGravar {
  id: string
  nome: string
}

/** Onde as atividades vão: uma licença do empreendimento ou o próprio empreendimento. */
export type DestinoDaGravacao =
  | { tipo: 'licenca'; licenca: LicencaParaGravar }
  | { tipo: 'empreendimento'; empreendimento: EmpreendimentoParaGravar }

const NA_LICENCA = 'Gravar na licença'
const NO_EMPREENDIMENTO = 'Gravar no empreendimento'

/**
 * Ação principal da triagem com empreendimento. Com `licencaPedida` (vinda do plano de renovação)
 * que seja deste empreendimento, grava direto nela. Sem licenças, grava no empreendimento. Com
 * licenças, um menu: o empreendimento primeiro, depois as licenças dele. É primário só quando não
 * há outro primário à vista (um primário por tela, docs/design-system/botoes-e-campos.md).
 */
export function AcaoGravar({
  empreendimento,
  licencaPedida,
  gravando,
  primario = true,
  aoGravar,
}: {
  empreendimento: EmpreendimentoParaGravar
  licencaPedida: string | null
  gravando: boolean
  primario?: boolean
  aoGravar: (destino: DestinoDaGravacao) => void
}) {
  const aparencia = primario ? 'primario' : 'padrao'
  const licencas = useQuery({
    queryKey: ['licencas-para-triagem', empreendimento.id],
    // Primeira página (50): empreendimento com mais licenças é raro; as mais novas vêm antes.
    queryFn: () => listarLicencasDoEmpreendimento(empreendimento.id, 0),
    select: (pagina): LicencaParaGravar[] =>
      pagina.itens.map((l) => ({
        id: l.id,
        rotulo: [l.sigla, l.numero].filter(Boolean).join(' ') || 'Licença sem número',
        temPlano: l.diasLimite !== null,
      })),
  })
  const gravarNoEmpreendimento = () => {
    aoGravar({ tipo: 'empreendimento', empreendimento })
  }

  if (licencas.isPending) {
    return (
      <Botao aparencia={aparencia} disabled>
        Gravar
      </Botao>
    )
  }
  const lista = licencas.data ?? []
  const pedida = lista.find((l) => l.id === licencaPedida)
  if (pedida) {
    return (
      <Botao
        aparencia={aparencia}
        disabled={gravando}
        aria-label={`${NA_LICENCA}: ${pedida.rotulo}`}
        onClick={() => {
          aoGravar({ tipo: 'licenca', licenca: pedida })
        }}
      >
        {gravando ? 'Gravando…' : NA_LICENCA}
      </Botao>
    )
  }
  if (!licencas.isError && lista.length === 0) {
    return (
      <Botao aparencia={aparencia} disabled={gravando} onClick={gravarNoEmpreendimento}>
        {gravando ? 'Gravando…' : NO_EMPREENDIMENTO}
      </Botao>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Botao aparencia={aparencia} iconeDepois="chevron-down" disabled={gravando}>
          {gravando ? 'Gravando…' : 'Gravar'}
        </Botao>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={gravarNoEmpreendimento}>{NO_EMPREENDIMENTO}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Na licença</DropdownMenuLabel>
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
                aoGravar({ tipo: 'licenca', licenca })
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

/** Retorno da gravação: sucesso com link (plano de renovação ou empreendimento) ou o erro. */
export function RetornoDaGravacao({
  gravada,
  erro,
}: {
  gravada: DestinoDaGravacao | null
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
  if (gravada.tipo === 'empreendimento') {
    return (
      <MensagemSecao role="status" tom="sucesso">
        Gravado no empreendimento{' '}
        <Link to={`/empreendimentos/${gravada.empreendimento.id}`}>
          {gravada.empreendimento.nome}
        </Link>
      </MensagemSecao>
    )
  }
  const { licenca } = gravada
  return (
    <MensagemSecao role="status" tom="sucesso">
      Gravado na{' '}
      {licenca.temPlano ? (
        <Link to={`/renovacoes/${licenca.id}`} className="numero">
          {licenca.rotulo}
        </Link>
      ) : (
        <span className="numero">{licenca.rotulo}</span>
      )}
    </MensagemSecao>
  )
}
