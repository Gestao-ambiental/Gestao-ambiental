import {
  RESULTADOS_DO_ITEM,
  ROTULO_DA_PENDENCIA,
  ROTULO_DO_RESULTADO,
  aceitaRegistro,
  aplicarRascunho,
  pendenciasDoEnvio,
  progressoDaVistoria,
} from '@gestao-ambiental/domain'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'

import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { enviarVistoria, type Vistoria } from '@/lib/api/vistorias'
import { contagemDaVistoria, filaDeCampo } from '@/lib/campo/fila'
import { mensagemDoErroDaVistoria } from '@/lib/erros'
import { cn } from '@/lib/utils'

import {
  recarregarVistoria,
  useFotosDaVistoria,
  useItensDaVistoria,
  useVistoria,
} from './consultas'
import { classeAcaoPrincipal, classeAcaoSecundaria, classePainel } from './estilos'
import {
  BarraDeAcao,
  BarraDeProgresso,
  CampoObservacao,
  ColunaCampo,
  ComVistoria,
  PainelDoEnvio,
  VoltarPara,
} from './pecas'
import { useRascunhoDaVistoria } from './rascunho'

/** Ainda há registros desta vistoria só no aparelho: ela não segue antes deles. */
class RegistrosNoAparelho extends Error {
  constructor(readonly quantos: number) {
    super('registros_no_aparelho')
  }
}

function Envio({ vistoria }: { vistoria: Vistoria }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const itens = useItensDaVistoria(vistoria.id, true)
  const fotos = useFotosDaVistoria(vistoria.id, true)
  const rascunho = useRascunhoDaVistoria(vistoria.id)
  const editavel = vistoria.podeRegistrar && aceitaRegistro(vistoria.situacao)
  const checklist = `/campo/${vistoria.id}/checklist`

  // Primeiro esvazia a fila do aparelho; só com tudo no servidor a vistoria segue (ADR-0060).
  // `always`: sem sinal, a resposta vem na hora em vez de esperar a rede.
  const enviar = useMutation({
    networkMode: 'always',
    mutationFn: async () => {
      if (contagemDaVistoria(filaDeCampo.obter().pendencias, vistoria.id).total > 0) {
        await filaDeCampo.tentarDeNovo()
        const restam = contagemDaVistoria(filaDeCampo.obter().pendencias, vistoria.id).total
        if (restam > 0) throw new RegistrosNoAparelho(restam)
      }
      return enviarVistoria(vistoria.id, vistoria.rowVersion)
    },
    onSuccess: async () => {
      await recarregarVistoria(queryClient, vistoria.id)
      await navigate(`/campo/${vistoria.id}`)
    },
  })

  const moldura = {
    titulo: 'Conferir envio',
    voltar: { para: checklist, rotulo: 'Checklist' },
    meta: vistoria.titulo,
  }

  if ((itens.isError && !itens.data) || (fotos.isError && !fotos.data)) {
    return (
      <ColunaCampo>
        <Pagina {...moldura}>
          <EstadoErro
            titulo="Não foi possível carregar o resumo."
            aoTentarDeNovo={() => {
              void itens.refetch()
              void fotos.refetch()
            }}
          />
        </Pagina>
      </ColunaCampo>
    )
  }
  if (!itens.data || !fotos.data || !rascunho.carregado) {
    return (
      <ColunaCampo>
        <Pagina {...moldura}>
          <Carregando rotulo="Carregando o resumo" linhas={4} />
        </Pagina>
      </ColunaCampo>
    )
  }

  // O que a técnica registrou, no servidor ou ainda no aparelho.
  const vistos = aplicarRascunho(itens.data, rascunho.registros)
  const progresso = progressoDaVistoria(vistos)
  const pendencias = pendenciasDoEnvio(vistos)
  const noAparelho = rascunho.contagem.total
  const bloqueado = !editavel || pendencias.length > 0 || vistos.length === 0
  const fotosNoAparelho = rascunho.registros.filter((r) => r.tipo === 'foto').length
  const contagens = [
    ...RESULTADOS_DO_ITEM.map((resultado) => ({
      rotulo: ROTULO_DO_RESULTADO[resultado],
      valor: vistos.filter((i) => i.resultado === resultado).length,
    })),
    { rotulo: 'Fotos', valor: fotos.data.length + fotosNoAparelho },
  ]

  return (
    <ColunaCampo comBarra>
      <Pagina {...moldura}>
        <BarraDeProgresso {...progresso} />
        <PainelDoEnvio vistoriaId={vistoria.id} />

        <dl
          className={cn(
            classePainel,
            'grid grid-cols-2 gap-px overflow-hidden bg-(--regra) md:grid-cols-5',
          )}
        >
          {contagens.map(({ rotulo, valor }, indice) => (
            <div
              key={rotulo}
              className={cn(
                'flex flex-col-reverse justify-end gap-(--e-05) bg-(--folha) px-(--e-4) py-(--e-3)',
                indice === contagens.length - 1 && 'col-span-2 md:col-span-1',
              )}
            >
              <dt className="corpo-medio text-(--tinta-2)">{rotulo}</dt>
              <dd
                className={cn(
                  'numero-contagem',
                  valor === 0 ? 'text-(--tinta-3)' : 'text-(--tinta)',
                )}
              >
                {valor}
              </dd>
            </div>
          ))}
        </dl>

        <section aria-labelledby="titulo-pendencias" className="flex flex-col gap-(--e-3)">
          <h2 id="titulo-pendencias" className="titulo-secao text-(--tinta)">
            Pendências
          </h2>
          {pendencias.length === 0 ? (
            <p className="inline-flex items-center gap-(--e-2) corpo-medio text-(--ok-texto)">
              <Icone nome="circle-check" />
              Nenhuma pendência
            </p>
          ) : (
            <ul className={cn(classePainel, 'flex flex-col overflow-hidden')}>
              {pendencias.map((p) => (
                <li
                  key={p.itemId}
                  className="relative flex min-h-(--linha) items-center justify-between gap-(--e-3) border-b border-(--regra-leve) px-(--e-4) py-(--e-2) transicao-estado last:border-b-0 hover:bg-(--toque)"
                >
                  <Link
                    to={`${checklist}#item-${p.itemId}`}
                    className="corpo-medio text-(--tinta) after:absolute after:inset-0 after:content-['']"
                  >
                    {p.titulo}
                  </Link>
                  <span className="flex shrink-0 items-center gap-(--e-2) corpo text-(--atraso-texto)">
                    {ROTULO_DA_PENDENCIA[p.motivo]}
                    <Icone nome="chevron-right" className="text-(--icone)" />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <CampoObservacao vistoria={vistoria} editavel={editavel} />

        {enviar.isError ? (
          enviar.error instanceof RegistrosNoAparelho ? (
            <MensagemSecao role="alert" tom="atencao" titulo="Vistoria não enviada">
              {enviar.error.quantos === 1
                ? 'Falta 1 registro chegar ao servidor.'
                : `Faltam ${String(enviar.error.quantos)} registros chegar ao servidor.`}{' '}
              Envie de novo quando houver conexão.
            </MensagemSecao>
          ) : (
            <MensagemSecao role="alert" tom="perigo">
              {mensagemDoErroDaVistoria(enviar.error)}
            </MensagemSecao>
          )
        ) : null}

        <BarraDeAcao>
          <Botao aparencia="sutil" asChild className={classeAcaoSecundaria}>
            <Link to={checklist}>Voltar</Link>
          </Botao>
          <Botao
            aparencia="primario"
            iconeDepois="send"
            className={classeAcaoPrincipal}
            disabled={bloqueado || enviar.isPending}
            onClick={() => {
              enviar.mutate()
            }}
          >
            {enviar.isPending
              ? 'Enviando…'
              : noAparelho > 0
                ? 'Enviar registros e vistoria'
                : 'Enviar para conferência'}
          </Botao>
        </BarraDeAcao>
      </Pagina>
    </ColunaCampo>
  )
}

/**
 * /campo/:id/envio (ADR-0033 §5, ADR-0060): resumo, pendências com link para o item e envio. Com
 * registros no aparelho, envia primeiro esses e só então a vistoria.
 */
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
