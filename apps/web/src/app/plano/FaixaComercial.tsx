import { formatarDataCivil, formatarReais } from '@gestao-ambiental/domain'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'

import { useDadosComerciais } from './situacao'

function BotaoPlano() {
  return (
    <Botao asChild tamanho="compacto">
      <Link to="/configuracoes/plano">Plano e cobrança</Link>
    </Botao>
  )
}

/**
 * Faixas da situação comercial (ADR-0026), no topo das telas do shell:
 * - todos: "Somente leitura até o pagamento" (atraso de mais de 2 dias úteis, teste acabado sem
 *   plano ou assinatura cancelada depois do período pago);
 * - Gestão: cobrança vencida (com o dia em que fica somente leitura) e cobrança que vence hoje.
 * Se a leitura falhar, a faixa não aparece; o banco continua decidindo a escrita.
 */
export function FaixaComercial() {
  const { atual, suporte } = useConsultoria()
  const consulta = useDadosComerciais()
  const dados = consulta.data
  if (!dados) return null
  const s = dados.situacao
  const gestao = atual.papel === 'gestao' && !suporte
  const aberta = dados.cobrancaAberta

  if (s.somenteLeitura) {
    return (
      <MensagemSecao
        tom="perigo"
        role="status"
        titulo="Somente leitura até o pagamento"
        className="mb-(--space-200)"
        acoes={gestao ? <BotaoPlano /> : undefined}
      >
        {s.situacao === 'teste_encerrado'
          ? 'O teste acabou. Ninguém cria nem edita até a Gestão escolher um plano.'
          : 'Ninguém cria nem edita até o pagamento.'}
      </MensagemSecao>
    )
  }

  if (!gestao) return null

  if (s.situacao === 'em_atraso' && s.emAtrasoDesde && s.bloqueioEm) {
    return (
      <MensagemSecao
        tom="atencao"
        role="status"
        titulo="Cobrança vencida"
        className="mb-(--space-200)"
        acoes={<BotaoPlano />}
      >
        {aberta ? `${formatarReais(aberta.valorCentavos)} · ` : ''}
        Venceu em {formatarDataCivil(s.emAtrasoDesde)}. Sem pagamento, a consultoria fica somente
        leitura a partir de {formatarDataCivil(s.bloqueioEm)}.
      </MensagemSecao>
    )
  }

  if (s.venceHoje) {
    return (
      <MensagemSecao
        tom="informacao"
        role="status"
        titulo="A cobrança do Grama vence hoje"
        className="mb-(--space-200)"
        acoes={<BotaoPlano />}
      >
        {aberta ? formatarReais(aberta.valorCentavos) : null}
      </MensagemSecao>
    )
  }

  return null
}
