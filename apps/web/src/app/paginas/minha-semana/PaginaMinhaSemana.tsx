import {
  agruparPorDia,
  diferencaEmDias,
  formatarDataCivil,
  hojeNoFuso,
  periodoDaMinhaSemana,
  situacaoDoPrazo,
  type DataCivil,
  type TipoLinhaDePrazo,
} from '@gestao-ambiental/domain'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { SeloSituacaoPrazo } from '@/app/paginas/visao/SeloSituacaoPrazo'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { Selo } from '@/components/ui/selo'
import {
  TAMANHO_PAGINA_MINHA_SEMANA,
  listarMinhaSemana,
  type ItemDaSemana,
} from '@/lib/api/minha-semana'
import { ehSemPermissao } from '@/lib/erros'
import { cn } from '@/lib/utils'

import { CHAVE_MINHA_SEMANA, destinoDoItem } from './destino-do-item'

/** Palavra do tipo, escrita antes do título (o tipo nunca vai só na cor ou na forma). */
const PALAVRA_DO_TIPO: Readonly<Record<string, string>> = {
  prazo: 'Condicionante',
  meta: 'Meta interna',
  exigencia: 'Exigência',
  acao_legal: 'Requisito legal',
}

/** Para o selo de situação: a meta segue a ocorrência; tipo desconhecido também. */
function tipoDaLinha(tipo: string): TipoLinhaDePrazo {
  return tipo === 'exigencia' || tipo === 'acao_legal' ? tipo : 'ocorrencia'
}

/** Marca escrita da consultoria quando ela não está ativa para escrita. */
function marcaDaConsultoria(item: ItemDaSemana): string | null {
  if (item.situacaoConsultoria === 'suspensa') return 'Suspensa'
  if (item.situacaoConsultoria === 'arquivada') return 'Arquivada'
  if (item.somenteLeitura) return 'Só leitura'
  return null
}

function ItemDaLista({
  item,
  hoje,
  aoAbrir,
}: {
  item: ItemDaSemana
  hoje: DataCivil
  aoAbrir: (item: ItemDaSemana) => void
}) {
  const destino = destinoDoItem(item)
  const marca = marcaDaConsultoria(item)
  // A meta tem data própria; o resto usa os dias calculados no banco, no fuso da consultoria.
  const dias = item.tipo === 'meta' ? diferencaEmDias(item.data, hoje) : item.dias
  const titulo = [item.codigo, item.titulo].filter(Boolean).join(' ')
  const apoio = [item.empreendimentoNome, item.unidadeNome, item.licenca]
    .filter(Boolean)
    .join(' · ')
  const conteudo = (
    <>
      <span className="flex flex-wrap items-center gap-x-(--e-2) gap-y-(--e-1)">
        <span className="rotulo text-(--tinta)">{item.consultoriaNome}</span>
        {marca ? <Selo tom="atencao">{marca}</Selo> : null}
        <span className="ml-auto">
          <SeloSituacaoPrazo
            situacao={situacaoDoPrazo({
              tipo: tipoDaLinha(item.tipo),
              dias,
              emConferencia: item.emConferencia,
            })}
          />
        </span>
      </span>
      <span className="min-w-0 break-words text-(--tinta)">
        <span className="font-[650]">{PALAVRA_DO_TIPO[item.tipo] ?? 'Prazo'}</span>
        <span aria-hidden> · </span>
        <span className="sr-only">: </span>
        {titulo}
      </span>
      {apoio ? <span className="truncate text-xs text-(--tinta-2)">{apoio}</span> : null}
    </>
  )
  const classes = 'flex w-full min-w-0 flex-col gap-(--e-1) px-(--e-4) py-(--e-3) text-left corpo'
  if (!destino) return <div className={classes}>{conteudo}</div>
  return (
    <button
      type="button"
      onClick={() => {
        aoAbrir(item)
      }}
      className={cn(
        classes,
        'cursor-pointer transicao-estado hover:bg-(--toque) focus-visible:bg-(--toque)',
      )}
    >
      {conteudo}
    </button>
  )
}

/**
 * Minha semana: os prazos da pessoa em todas as consultorias em que é membro ativo, numa lista só,
 * agrupada por dia. Abrir um item de outra consultoria troca para ela e abre o item lá.
 */
export function PaginaMinhaSemana() {
  const { atual, trocar } = useConsultoria()
  const navegar = useNavigate()
  const hoje = hojeNoFuso(new Date(), atual.fuso)
  const [semana, setSemana] = useState(0)
  const [pagina, setPagina] = useState(0)
  const { de, ate } = periodoDaMinhaSemana(hoje, semana)

  const consulta = useQuery({
    queryKey: [CHAVE_MINHA_SEMANA, de, ate, pagina],
    queryFn: () => listarMinhaSemana(de, ate, pagina),
    placeholderData: keepPreviousData,
  })

  function irParaSemana(nova: number) {
    setSemana(Math.max(0, nova))
    setPagina(0)
  }

  function abrir(item: ItemDaSemana) {
    const destino = destinoDoItem(item)
    if (!destino) return
    if (item.consultoriaId === atual.consultoriaId) void navegar(destino)
    else trocar(item.consultoriaId, destino)
  }

  const periodo =
    de === null
      ? `Até ${formatarDataCivil(ate)}`
      : `${formatarDataCivil(de)} a ${formatarDataCivil(ate)}`

  let conteudo
  if (consulta.isPending) {
    conteudo = <Carregando rotulo="Carregando sua semana" linhas={6} />
  } else if (consulta.isError) {
    conteudo = ehSemPermissao(consulta.error) ? (
      <SemPermissao />
    ) : (
      <EstadoErro
        titulo="Não foi possível carregar sua semana"
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  } else if (consulta.data.itens.length === 0) {
    conteudo = (
      <EstadoVazio
        icone="calendar-check"
        titulo={semana === 0 ? 'Nada com você até o fim da semana' : 'Nada com você nesta semana'}
        acaoPrincipal={
          <Botao
            iconeDepois="chevron-right"
            onClick={() => {
              irParaSemana(semana + 1)
            }}
          >
            Próxima semana
          </Botao>
        }
      />
    )
  } else {
    const { itens, total } = consulta.data
    const dias = agruparPorDia(itens, hoje)
    const inicio = pagina * TAMANHO_PAGINA_MINHA_SEMANA
    const fim = inicio + itens.length
    conteudo = (
      <section
        aria-label="Prazos da semana"
        className="overflow-hidden rounded-(--raio-painel) border bg-(--folha)"
      >
        <ol className="flex flex-col">
          {dias.map((dia) => (
            <li key={dia.data} className="border-b last:border-b-0">
              <h2
                className={cn(
                  'border-b bg-(--papel) px-(--e-4) py-(--e-2) rotulo',
                  dia.passado ? 'text-(--atraso-texto)' : 'text-(--tinta)',
                )}
              >
                {dia.rotulo}
                {dia.passado ? ' · prazo passado' : ''}
              </h2>
              <ul className="flex flex-col divide-y" aria-label={dia.rotulo}>
                {dia.itens.map((item) => (
                  <li key={`${item.consultoriaId}:${item.tipo}:${item.id}`}>
                    <ItemDaLista item={item} hoje={hoje} aoAbrir={abrir} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        <div className="flex items-center gap-(--e-2) border-t px-(--e-4) py-(--e-2)">
          <span className="flex-1 rotulo numero" aria-live="polite">
            {inicio + 1}–{fim} de {total}
          </span>
          <BotaoIcone
            icone="chevron-left"
            rotulo="Página anterior"
            disabled={pagina === 0}
            onClick={() => {
              setPagina((p) => Math.max(0, p - 1))
            }}
          />
          <BotaoIcone
            icone="chevron-right"
            rotulo="Próxima página"
            disabled={fim >= total}
            onClick={() => {
              setPagina((p) => p + 1)
            }}
          />
        </div>
      </section>
    )
  }

  return (
    <Pagina
      titulo="Minha semana"
      meta={<span className="numero">{periodo}</span>}
      acao={
        <div className="flex items-center gap-(--e-1)">
          <BotaoIcone
            icone="chevron-left"
            rotulo="Semana anterior"
            disabled={semana === 0}
            onClick={() => {
              irParaSemana(semana - 1)
            }}
          />
          <Botao
            disabled={semana === 0}
            onClick={() => {
              irParaSemana(0)
            }}
          >
            Esta semana
          </Botao>
          <BotaoIcone
            icone="chevron-right"
            rotulo="Próxima semana"
            onClick={() => {
              irParaSemana(semana + 1)
            }}
          />
        </div>
      }
    >
      {conteudo}
    </Pagina>
  )
}
