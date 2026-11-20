import {
  RESULTADOS_DO_ITEM,
  ROTULO_DA_PENDENCIA,
  ROTULO_DO_RESULTADO,
  aceitaRegistro,
  pendenciasDoEnvio,
  progressoDaVistoria,
} from '@gestao-ambiental/domain'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'

import { Carregando, EstadoErro } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { enviarVistoria, type Vistoria } from '@/lib/api/vistorias'
import { mensagemDoErroDaVistoria } from '@/lib/erros'

import {
  recarregarVistoria,
  useFotosDaVistoria,
  useItensDaVistoria,
  useVistoria,
} from './consultas'
import { classeAlvo, classeCartao } from './estilos'
import {
  BarraDeAcao,
  BarraDeProgresso,
  CampoObservacao,
  ColunaCampo,
  ComVistoria,
  VoltarPara,
} from './pecas'

function Envio({ vistoria }: { vistoria: Vistoria }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const itens = useItensDaVistoria(vistoria.id, true)
  const fotos = useFotosDaVistoria(vistoria.id, true)
  const editavel = vistoria.podeRegistrar && aceitaRegistro(vistoria.situacao)
  const checklist = `/campo/${vistoria.id}/checklist`

  const enviar = useMutation({
    mutationFn: () => enviarVistoria(vistoria.id, vistoria.rowVersion),
    onSuccess: async () => {
      await recarregarVistoria(queryClient, vistoria.id)
      await navigate(`/campo/${vistoria.id}`)
    },
  })

  const voltar = <VoltarPara para={checklist} rotulo="Checklist" />
  const cabecalho = (
    <header className="flex flex-col gap-(--e-1)">
      <p className="text-xs text-(--tinta-2)">{vistoria.titulo}</p>
      <h1 className="titulo-tela text-(--tinta)">Conferir envio</h1>
    </header>
  )

  if (itens.isError || fotos.isError) {
    return (
      <ColunaCampo>
        {voltar}
        {cabecalho}
        <EstadoErro
          titulo="Não foi possível carregar o resumo."
          aoTentarDeNovo={() => {
            void itens.refetch()
            void fotos.refetch()
          }}
        />
      </ColunaCampo>
    )
  }
  if (itens.isPending || fotos.isPending) {
    return (
      <ColunaCampo>
        {voltar}
        {cabecalho}
        <Carregando rotulo="Carregando o resumo" linhas={4} />
      </ColunaCampo>
    )
  }

  const progresso = progressoDaVistoria(itens.data)
  const pendencias = pendenciasDoEnvio(itens.data)
  const bloqueado = !editavel || pendencias.length > 0 || itens.data.length === 0

  return (
    <ColunaCampo>
      {voltar}
      {cabecalho}
      <BarraDeProgresso {...progresso} />

      <dl className={`${classeCartao} grid grid-cols-2 gap-(--e-2) p-(--e-3)`}>
        {RESULTADOS_DO_ITEM.map((resultado) => (
          <div key={resultado} className="flex flex-col">
            <dt className="text-xs text-(--tinta-2)">{ROTULO_DO_RESULTADO[resultado]}</dt>
            <dd className="corpo-medio">
              {itens.data.filter((i) => i.resultado === resultado).length}
            </dd>
          </div>
        ))}
        <div className="flex flex-col">
          <dt className="text-xs text-(--tinta-2)">Fotos</dt>
          <dd className="corpo-medio">{fotos.data.length}</dd>
        </div>
      </dl>

      <section aria-labelledby="titulo-pendencias" className="flex flex-col gap-(--e-15)">
        <h2 id="titulo-pendencias" className="titulo-secao">
          Pendências
        </h2>
        {pendencias.length === 0 ? (
          <p className="corpo text-(--tinta-2)">Nenhuma pendência</p>
        ) : (
          <ul className={`${classeCartao} flex flex-col`}>
            {pendencias.map((p) => (
              <li
                key={p.itemId}
                className="flex min-h-11 items-center justify-between gap-(--e-2) border-b px-(--e-3) py-(--e-15) last:border-b-0"
              >
                <Link to={`${checklist}#item-${p.itemId}`}>{p.titulo}</Link>
                <span className="text-xs text-(--atraso-texto)">
                  {ROTULO_DA_PENDENCIA[p.motivo]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CampoObservacao vistoria={vistoria} editavel={editavel} />

      {enviar.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErroDaVistoria(enviar.error)}
        </MensagemSecao>
      ) : null}

      <BarraDeAcao>
        <Botao asChild className={`${classeAlvo} flex-1`}>
          <Link to={checklist}>Voltar</Link>
        </Botao>
        <Botao
          aparencia="primario"
          iconeDepois="send"
          className={`${classeAlvo} flex-[2]`}
          disabled={bloqueado || enviar.isPending}
          onClick={() => {
            enviar.mutate()
          }}
        >
          {enviar.isPending ? 'Enviando…' : 'Enviar para conferência'}
        </Botao>
      </BarraDeAcao>
    </ColunaCampo>
  )
}

/** /campo/:id/envio (ADR-0033 §5): resumo, pendências com link para o item e envio. */
export function PaginaEnvio() {
  const { id = '' } = useParams()
  const consulta = useVistoria(id)
  return (
    <ComVistoria
      consulta={consulta}
      voltar={<VoltarPara para={`/campo/${id}/checklist`} rotulo="Checklist" />}
    >
      {(vistoria) => <Envio vistoria={vistoria} />}
    </ComVistoria>
  )
}
