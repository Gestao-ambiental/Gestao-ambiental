import { formatarDataCivil, formatarReais } from '@gestao-ambiental/domain'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'

import { PAGAMENTO_PELO_SUPORTE, useDadosComerciais } from './situacao'

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
 * Com cobrança em aberto, a Gestão lê que o pagamento é confirmado pelo suporte do Grama: até a
 * integração com o Asaas, ela não paga pelo Grama.
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
        className="mb-(--e-4)"
        acoes={gestao ? <BotaoPlano /> : undefined}
      >
        {s.situacao === 'teste_encerrado'
          ? 'O teste acabou. Ninguém cria nem edita até a Gestão escolher um plano.'
          : 'Ninguém cria nem edita até o pagamento.'}
        {gestao && aberta ? ` ${PAGAMENTO_PELO_SUPORTE}` : null}
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
        className="mb-(--e-4)"
        acoes={<BotaoPlano />}
      >
        {aberta ? `${formatarReais(aberta.valorCentavos)} · ` : ''}
        Venceu em {formatarDataCivil(s.emAtrasoDesde)}. Sem pagamento, a consultoria fica somente
        leitura a partir de {formatarDataCivil(s.bloqueioEm)}. {PAGAMENTO_PELO_SUPORTE}
      </MensagemSecao>
    )
  }

  if (s.venceHoje) {
    return (
      <MensagemSecao
        tom="informacao"
        role="status"
        titulo="A cobrança do Grama vence hoje"
        className="mb-(--e-4)"
        acoes={<BotaoPlano />}
      >
        {aberta ? `${formatarReais(aberta.valorCentavos)} · ` : ''}
        {PAGAMENTO_PELO_SUPORTE}
      </MensagemSecao>
    )
  }

  return null
}
