import { formatarDataCivil } from '@gestao-ambiental/domain'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'

import type { PropsDaSecao } from '@/app/paginas/empreendimentos/secoes-do-empreendimento'
import { TituloDoPainel, classePainel } from '@/app/paginas/residuos/quadro'
import { Carregando } from '@/components/estados'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { listarExigencias } from '@/lib/api/exigencias'
import { mensagemDoErro } from '@/lib/erros'
import { useConsultoria } from '@/app/consultoria/contexto-consultoria'

import { tituloDaExigencia } from './apresentacao'
import { SeloDaExigencia } from './pecas'

const POR_PAGINA = 10

/**
 * Exigências do órgão no Empreendimento (ADR-0045): todas, abertas primeiro, 10 por página. Sem
 * nenhuma, a seção some; registrar fica no "…" do cabeçalho.
 */
export function SecaoExigenciasDoEmpreendimento({ empreendimento }: PropsDaSecao) {
  const { atual } = useConsultoria()
  const [pagina, setPagina] = useState(0)
  const exigencias = useQuery({
    queryKey: ['exigencias', atual.consultoriaId, 'empreendimento', empreendimento.id, pagina],
    queryFn: () =>
      listarExigencias(atual.consultoriaId, {
        empreendimentoId: empreendimento.id,
        situacao: 'todas',
        pagina,
        limite: POR_PAGINA,
      }),
    placeholderData: keepPreviousData,
  })

  if (exigencias.isSuccess && exigencias.data.total === 0) return null

  const total = exigencias.data?.total ?? 0
  const itens = exigencias.data?.itens ?? []
  const inicio = pagina * POR_PAGINA
  const fim = Math.min(total, inicio + itens.length)

  return (
    <section aria-labelledby="titulo-exigencias" className={classePainel}>
      <TituloDoPainel id="titulo-exigencias">Exigências do órgão</TituloDoPainel>
      {exigencias.isPending ? (
        <Carregando rotulo="Carregando exigências" linhas={2} className="border-0" />
      ) : exigencias.isError ? (
        <MensagemSecao role="alert" tom="perigo" className="m-(--e-3)">
          {mensagemDoErro(exigencias.error)}
        </MensagemSecao>
      ) : (
        <>
          <ul aria-label="Exigências do empreendimento" className="flex flex-col">
            {itens.map((e) => (
              <li
                key={e.id}
                className="flex min-h-(--linha) flex-wrap items-center gap-x-(--e-4) gap-y-(--e-1) border-b border-(--regra-leve) px-(--e-4) py-(--e-2) last:border-b-0"
              >
                <span className="flex min-w-0 flex-1 basis-56 flex-col">
                  <Link
                    to={`/exigencias/${e.id}`}
                    className="truncate corpo-medio text-(--tinta) numero"
                  >
                    {tituloDaExigencia(e)}
                  </Link>
                  <span className="truncate rotulo numero">
                    {[
                      e.numeroOficio ? e.assunto : null,
                      e.unidadeNome,
                      `prazo ${formatarDataCivil(e.prazoOficial)}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <SeloDaExigencia exigencia={e} />
              </li>
            ))}
          </ul>
          {total > POR_PAGINA ? (
            <div className="flex items-center gap-(--e-2) border-t px-(--e-4) py-(--e-2)">
              <span className="flex-1 rotulo numero" aria-live="polite">
                {inicio + 1}–{fim} de {total}
              </span>
              <BotaoIcone
                icone="chevron-left"
                rotulo="Exigências anteriores"
                disabled={pagina === 0}
                onClick={() => {
                  setPagina((p) => Math.max(0, p - 1))
                }}
              />
              <BotaoIcone
                icone="chevron-right"
                rotulo="Próximas exigências"
                disabled={fim >= total}
                onClick={() => {
                  setPagina((p) => p + 1)
                }}
              />
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
