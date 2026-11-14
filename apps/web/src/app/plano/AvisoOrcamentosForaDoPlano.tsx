import { CODIGOS_DE_PLANO } from '@gestao-ambiental/domain'
import { Link } from 'react-router'

import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'

import { useCatalogoComercial } from './catalogo'
import { useDadosComerciais } from './situacao'

/**
 * Orçamentos fora do plano (ADR-0026): os orçamentos antigos continuam legíveis; criar e editar
 * falham no banco. Aqui só o aviso e o convite para o plano Equipe.
 */
export function AvisoOrcamentosForaDoPlano() {
  const dados = useDadosComerciais().data
  const catalogo = useCatalogoComercial().data
  if (!dados || !catalogo || dados.situacao.orcamentosLiberados || dados.situacao.somenteLeitura)
    return null
  const comOrcamentos = CODIGOS_DE_PLANO.map((c) => catalogo.planos[c]).filter((p) => p.orcamentos)
  const nomes = comOrcamentos.map((p) => p.nome)
  const primeiro = comOrcamentos[0]
  return (
    <MensagemSecao
      tom="informacao"
      role="status"
      titulo={
        nomes.length > 1
          ? `Orçamentos fazem parte dos planos ${nomes.slice(0, -1).join(', ')} e ${String(nomes.at(-1))}`
          : `Orçamentos fazem parte do plano ${nomes.join('')}`
      }
      acoes={
        primeiro ? (
          <Botao asChild tamanho="compacto" aparencia="primario">
            <Link to="/configuracoes/plano">Conhecer o plano {primeiro.nome}</Link>
          </Botao>
        ) : null
      }
    >
      Os orçamentos já feitos continuam aqui para consulta.
    </MensagemSecao>
  )
}
