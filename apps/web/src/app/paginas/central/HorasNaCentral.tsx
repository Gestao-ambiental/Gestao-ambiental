import { formatarHoras, formatarReais } from '@gestao-ambiental/domain'
import { useMutation, useQuery } from '@tanstack/react-query'

import { Carregando, EstadoErro, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import { enviarResumoDeTeste, obterHorasPoupadas } from '@/lib/api/indicadores-de-valor'
import { ehDoisFatoresNecessarios, ehSemPermissao } from '@/lib/erros'

import { RelerDoisFatores } from './ExigeDoisFatores'

const decimal = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

function variacaoEmHoras(atual: number, anterior: number | undefined): string | null {
  if (anterior === undefined) return null
  const diferenca = atual - anterior
  const texto = `${decimal.format(Math.abs(diferenca))} h`
  if (diferenca > 0) return `+${texto}`
  if (diferenca < 0) return `−${texto}`
  return texto
}

/**
 * Grupo "Horas devolvidas" (ADR-0027), do mês atual: total, cadastro, acompanhamento e R$, com a
 * variação do total contra o mês anterior. Agregado por consultoria (ou de todas); nunca por
 * pessoa. Consultoria que ainda junta dados fica fora da soma.
 */
export function HorasDevolvidas({ consultoriaId }: { consultoriaId: string | null }) {
  const consulta = useQuery({
    queryKey: ['central', 'horas', consultoriaId],
    queryFn: () => obterHorasPoupadas(consultoriaId),
  })

  let conteudo
  if (consulta.isPending) conteudo = <Carregando rotulo="Carregando as horas" linhas={1} />
  else if (consulta.isError) {
    if (ehDoisFatoresNecessarios(consulta.error)) conteudo = <RelerDoisFatores />
    else if (ehSemPermissao(consulta.error)) conteudo = <SemPermissao descricao={null} />
    else
      conteudo = (
        <EstadoErro
          titulo="Não foi possível carregar as horas."
          aoTentarDeNovo={() => void consulta.refetch()}
        />
      )
  } else {
    const [atual, anterior] = consulta.data
    if (!atual || atual.consultoriasComDados === 0) {
      conteudo = <p className="corpo text-(--text)">Juntando dados</p>
    } else {
      const cartoes = [
        {
          rotulo: 'Total',
          valor: formatarHoras(atual.horasTotal),
          variacao: variacaoEmHoras(atual.horasTotal, anterior?.horasTotal),
        },
        { rotulo: 'Cadastro', valor: formatarHoras(atual.horasCadastro), variacao: null },
        {
          rotulo: 'Acompanhamento',
          valor: formatarHoras(atual.horasAcompanhamento),
          variacao: null,
        },
        {
          rotulo: 'Em reais',
          valor:
            atual.reaisCentavos === null ? 'sem custo da hora' : formatarReais(atual.reaisCentavos),
          variacao: null,
        },
      ]
      conteudo = (
        <dl className="grid grid-cols-1 gap-(--space-100) sm:grid-cols-2 lg:grid-cols-4">
          {cartoes.map((c) => (
            <div
              key={c.rotulo}
              className="flex min-w-0 flex-col gap-(--space-025) rounded-(--radius-large) border bg-(--surface) p-(--space-150) shadow-cartao"
            >
              <dt className="rotulo">{c.rotulo}</dt>
              <dd className="flex flex-wrap items-baseline gap-x-(--space-100)">
                <span className="titulo-secao text-(--text) tabular-nums">{c.valor}</span>
                {c.variacao ? (
                  <span
                    className="corpo text-(--text) tabular-nums"
                    aria-label={`${c.variacao} contra o mês anterior`}
                  >
                    {c.variacao}
                  </span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      )
      if (atual.estimado || atual.consultoriasJuntando > 0) {
        conteudo = (
          <>
            {conteudo}
            <div className="flex flex-wrap gap-(--space-100)">
              {atual.estimado ? <Selo tom="revisao">Estimado</Selo> : null}
              {consultoriaId === null && atual.consultoriasJuntando > 0 ? (
                <Selo>{`${String(atual.consultoriasJuntando)} juntando dados`}</Selo>
              ) : null}
            </div>
          </>
        )
      }
    }
  }

  return (
    <section aria-label="Horas devolvidas" className="flex flex-col gap-(--space-075)">
      <h3 className="corpo-medio text-(--text)">Horas devolvidas</h3>
      {conteudo}
    </section>
  )
}

/** "Enviar resumo de teste para mim": o resumo do mês anterior desta consultoria, só para mim. */
export function ResumoDeTeste({ consultoriaId }: { consultoriaId: string }) {
  const envio = useMutation({ mutationFn: () => enviarResumoDeTeste(consultoriaId) })
  return (
    <div className="flex flex-col gap-(--space-100)">
      <div>
        <Botao
          iconeAntes="mail"
          disabled={envio.isPending}
          aria-busy={envio.isPending || undefined}
          onClick={() => {
            envio.mutate()
          }}
        >
          {envio.isPending ? 'Enviando…' : 'Enviar resumo de teste para mim'}
        </Botao>
      </div>
      {envio.isSuccess ? (
        <MensagemSecao role="status" tom="sucesso">
          Resumo de teste enviado para o seu e-mail.
        </MensagemSecao>
      ) : null}
      {envio.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {envio.error instanceof Error ? envio.error.message : 'Não foi possível enviar o resumo.'}
        </MensagemSecao>
      ) : null}
    </div>
  )
}
