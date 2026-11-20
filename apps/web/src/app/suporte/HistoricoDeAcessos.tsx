import { ROTULO_DA_CATEGORIA_DE_EMERGENCIA } from '@gestao-ambiental/domain'
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query'

import { Carregando, EstadoErro, EstadoVazio } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Selo } from '@/components/ui/selo'
import type { AcessoDeSuporte, PaginaDeAcessos } from '@/lib/api/suporte'
import { formatarInstanteComHora } from '@/lib/datas'

function encerramento(acesso: AcessoDeSuporte, fuso: string): string {
  if (acesso.ativo || !acesso.encerradoEm) return 'Valendo'
  const quando = formatarInstanteComHora(acesso.encerradoEm, fuso)
  if (acesso.encerramento === 'gestao') {
    return `Pela Gestão (${acesso.encerradoPorNome ?? 'sem nome'}) em ${quando}`
  }
  if (acesso.encerramento === 'operador') {
    return `Pelo suporte (${acesso.encerradoPorNome ?? 'sem nome'}) em ${quando}`
  }
  return `Pelo prazo em ${quando}`
}

function Item({ acesso, fuso }: { acesso: AcessoDeSuporte; fuso: string }) {
  const emergencia = acesso.modo === 'emergencia'
  const linhas: [string, string][] = [
    emergencia
      ? ['Aberto por', acesso.abertoPorNome ?? 'Sem nome']
      : ['Autorizado por', acesso.autorizadoPorNome ?? 'Sem nome'],
    ['Início', formatarInstanteComHora(acesso.inicio, fuso)],
    ['Fim previsto', formatarInstanteComHora(acesso.fimPrevisto, fuso)],
    ['Encerramento', encerramento(acesso, fuso)],
  ]
  if (emergencia) {
    linhas.splice(1, 0, [
      'Categoria',
      acesso.categoria ? ROTULO_DA_CATEGORIA_DE_EMERGENCIA[acesso.categoria] : 'Não informada',
    ])
    linhas.push([
      'Aviso à Gestão',
      acesso.avisoVistoEm
        ? `Visto por ${acesso.avisoVistoPorNome ?? 'sem nome'} em ${formatarInstanteComHora(acesso.avisoVistoEm, fuso)}`
        : 'Ainda não visto',
    ])
  }

  return (
    <li className="flex flex-col gap-(--e-2) border-b px-(--e-3) py-(--e-3) last:border-b-0">
      <span className="flex flex-wrap items-center gap-(--e-15)">
        <Selo tom={emergencia ? 'perigo' : 'andamento'}>
          {emergencia ? 'Emergência' : 'Autorizado'}
        </Selo>
        {acesso.ativo ? <Selo tom="sucesso">Valendo</Selo> : <Selo>Encerrado</Selo>}
      </span>
      <dl className="grid grid-cols-1 gap-x-(--e-4) gap-y-(--e-15) sm:grid-cols-2">
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo} className="flex min-w-0 flex-col">
            <dt className="rotulo">{rotulo}</dt>
            <dd className="break-words">{valor}</dd>
          </div>
        ))}
        {acesso.motivo ? (
          <div className="flex min-w-0 flex-col sm:col-span-2">
            <dt className="rotulo">Motivo</dt>
            <dd className="break-words whitespace-pre-wrap">{acesso.motivo}</dd>
          </div>
        ) : null}
        <div className="flex min-w-0 flex-col sm:col-span-2">
          <dt className="rotulo">Entradas do suporte</dt>
          <dd>
            {acesso.entradas.length === 0 ? (
              'Nenhuma'
            ) : (
              <ul className="flex flex-col">
                {acesso.entradas.map((entrada) => (
                  <li key={`${entrada.nome}-${entrada.instante}`}>
                    {entrada.nome} em {formatarInstanteComHora(entrada.instante, fuso)}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>
    </li>
  )
}

/**
 * Histórico dos acessos de suporte (Termos §13.5): quem, quando, modo, categoria, motivo, duração,
 * encerramento e entradas efetivas. Na Equipe (Gestão) e no detalhe da consultoria (central).
 */
export function HistoricoDeAcessos({
  consulta,
  fuso,
}: {
  consulta: UseInfiniteQueryResult<InfiniteData<PaginaDeAcessos>>
  fuso: string
}) {
  if (consulta.isPending) return <Carregando rotulo="Carregando acessos do suporte" linhas={2} />
  if (consulta.isError) {
    return (
      <EstadoErro
        titulo="Não foi possível carregar os acessos do suporte."
        descricao="Verifique a conexão e tente de novo."
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  }
  const itens = consulta.data.pages.flatMap((p) => p.itens)
  if (itens.length === 0) return <EstadoVazio icone="clock" titulo="Nenhum acesso do suporte" />

  return (
    <div className="flex flex-col gap-(--e-2)">
      <ol
        aria-label="Histórico de acessos do suporte"
        className="flex flex-col rounded-(--raio-painel) border bg-(--folha) shadow-cartao"
      >
        {itens.map((acesso) => (
          <Item key={acesso.id} acesso={acesso} fuso={fuso} />
        ))}
      </ol>
      {consulta.hasNextPage ? (
        <Botao
          className="self-start"
          disabled={consulta.isFetchingNextPage}
          onClick={() => void consulta.fetchNextPage()}
        >
          Mostrar mais acessos
        </Botao>
      ) : null}
    </div>
  )
}
