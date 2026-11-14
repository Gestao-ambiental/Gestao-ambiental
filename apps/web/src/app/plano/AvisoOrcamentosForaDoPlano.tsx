import { Link } from 'react-router'

import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'

import { useDadosComerciais } from './situacao'

/**
 * Orçamentos fora do plano (ADR-0026): os orçamentos antigos continuam legíveis; criar e editar
 * falham no banco. Aqui só o aviso e o convite para o plano Equipe.
 */
export function AvisoOrcamentosForaDoPlano() {
  const dados = useDadosComerciais().data
  if (!dados || dados.situacao.orcamentosLiberados || dados.situacao.somenteLeitura) return null
  return (
    <MensagemSecao
      tom="informacao"
      role="status"
      titulo="Orçamentos fazem parte dos planos Equipe e Escala"
      acoes={
        <Botao asChild tamanho="compacto" aparencia="primario">
          <Link to="/configuracoes/plano">Conhecer o plano Equipe</Link>
        </Botao>
      }
    >
      Os orçamentos já feitos continuam aqui para consulta.
    </MensagemSecao>
  )
}
