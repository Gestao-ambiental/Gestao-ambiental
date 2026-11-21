import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { AbasDeFiltro } from '@/components/ui/abas'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { Selo } from '@/components/ui/selo'
import {
  CHAVES_DE_NORMAS,
  ROTULO_DA_MUDANCA,
  TAMANHO_PAGINA_MUDANCAS,
  listarMudancasDaConsultoria,
  type MudancaNaCarteira,
} from '@/lib/api/normas'
import { formatarInstanteComoData } from '@/lib/datas'
import { ehSemPermissao } from '@/lib/erros'

type Filtro = 'todas' | 'novas'

function quantos(n: number, singular: string, varios: string): string {
  return `${String(n)} ${n === 1 ? singular : varios}`
}

function Ficha({ children }: { children: string }) {
  return (
    <li className="rounded-(--raio-mini) bg-(--aperto) px-(--e-2) py-(--e-05) text-xs font-[750] text-(--tinta-2) numero">
      {children}
    </li>
  )
}

function CartaoDeMudanca({ item, fuso }: { item: MudancaNaCarteira; fuso: string }) {
  const destino = `/normas/${item.normaId}?mudanca=${item.mudancaId}`
  return (
    <li className="relative flex flex-col gap-(--e-2) border-b border-(--regra-leve) px-(--e-4) py-(--e-3) transicao-estado last:border-b-0 hover:bg-(--toque)">
      <div className="flex flex-wrap items-start justify-between gap-x-(--e-3) gap-y-(--e-1)">
        <h3 className="min-w-0 flex-1 corpo-medio text-(--tinta)">
          {/* O link cobre o cartão inteiro; o foco aparece no próprio título. */}
          <Link
            to={destino}
            className="text-(--tinta) no-underline after:absolute after:inset-0 hover:underline"
          >
            {item.normaTitulo}
          </Link>
        </h3>
        {item.naoVista ? <Selo tom="atencao">Nova</Selo> : null}
      </div>
      <p className="text-xs text-(--tinta-2) numero">
        {ROTULO_DA_MUDANCA[item.tipo]} · publicada em{' '}
        {formatarInstanteComoData(item.publicadaEm, fuso)}
      </p>
      {item.resumo ? <p className="line-clamp-3 corpo text-(--tinta)">{item.resumo}</p> : null}
      <ul className="flex flex-wrap gap-(--e-2)" aria-label="Alcance na carteira">
        <Ficha>{quantos(item.licencas, 'licença', 'licenças')}</Ficha>
        <Ficha>{quantos(item.clientes, 'cliente', 'clientes')}</Ficha>
        <Ficha>{quantos(item.empreendimentos, 'empreendimento', 'empreendimentos')}</Ficha>
      </ul>
    </li>
  )
}

/** Aba Normas de Acompanhamentos (LEG-05; ADR-0050): mudanças publicadas que afetam a carteira. */
export function AbaNormas() {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [pagina, setPagina] = useState(0)
  const soNovas = filtro === 'novas'

  const consulta = useQuery({
    queryKey: [CHAVES_DE_NORMAS.mudancas, cid, filtro, pagina],
    queryFn: () => listarMudancasDaConsultoria(cid, pagina, soNovas),
    placeholderData: keepPreviousData,
  })

  function trocarFiltro(novo: Filtro) {
    setFiltro(novo)
    setPagina(0)
  }

  let conteudo
  if (consulta.isPending) {
    conteudo = <Carregando rotulo="Carregando mudanças de norma" linhas={4} />
  } else if (consulta.isError) {
    conteudo = ehSemPermissao(consulta.error) ? (
      <SemPermissao />
    ) : (
      <EstadoErro
        titulo="Não foi possível carregar as mudanças de norma."
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  } else if (consulta.data.total === 0) {
    conteudo = (
      <EstadoVazio
        icone="inbox"
        titulo={soNovas ? 'Nenhuma mudança nova' : 'Nenhuma mudança que afete a carteira'}
      />
    )
  } else {
    const { itens, total } = consulta.data
    const inicio = pagina * TAMANHO_PAGINA_MUDANCAS
    const fim = Math.min(total, inicio + itens.length)
    conteudo = (
      <div className="flex flex-col overflow-hidden rounded-(--raio-painel) border bg-(--folha)">
        <ul className="flex flex-col" aria-label="Mudanças de norma">
          {itens.map((item) => (
            <CartaoDeMudanca key={item.mudancaId} item={item} fuso={atual.fuso} />
          ))}
        </ul>
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
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-(--e-3)">
      <AbasDeFiltro
        rotulo="Filtrar mudanças de norma"
        abas={[
          { valor: 'todas', rotulo: 'Todas' },
          { valor: 'novas', rotulo: 'Só novas' },
        ]}
        valor={filtro}
        aoMudar={trocarFiltro}
        className="self-start"
      />
      {conteudo}
    </div>
  )
}
