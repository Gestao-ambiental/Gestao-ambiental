import {
  datasRenovacaoLao,
  diferencaEmDias,
  etapasRenovacaoLao,
  formatarDataCivil,
  situacaoDaRenovacao,
} from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { useRecursoLiberado } from '@/app/consultoria/recurso-liberado'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { BotaoMais } from '@/components/ui/botao-mais'
import { classeCampo } from '@/components/ui/estilos-campo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { urlDoArquivo } from '@/lib/api/ocorrencias'
import { definirAntecedencia, obterPlano, type PlanoRenovacao } from '@/lib/api/renovacoes'
import { formatarInstanteComHora } from '@/lib/datas'
import { ehSemPermissao, mensagemDoErro } from '@/lib/erros'
import { cn } from '@/lib/utils'

import { AcompanhamentoOrgao } from './AcompanhamentoOrgao'
import { DialogoProtocolo } from './DialogoProtocolo'
import { LinhaDoTrajeto } from './LinhaDoTrajeto'
import { SeloRenovacao } from './SeloRenovacao'
import { estacoesDaRenovacao } from './trajeto-da-renovacao'

const VOLTAR = { para: '/acompanhamentos', rotulo: 'Acompanhamentos' }

/** Um número do placar: dias até o marco, hoje, ou dias depois dele (em vermelho). */
function Marco({
  dias,
  rotulo,
  rotuloPassou,
}: {
  dias: number
  rotulo: string
  rotuloPassou: string
}) {
  const passou = dias < 0
  return (
    <div className="flex min-w-[150px] flex-1 flex-col items-start gap-(--e-1) px-(--e-5) py-(--e-4)">
      {dias === 0 ? (
        <span className="numero-grande rounded-(--raio-mini) bg-(--sinal) px-(--e-2) text-(--sinal-texto)">
          Hoje
        </span>
      ) : (
        <span className={cn('numero-grande', passou ? 'text-(--atraso-texto)' : 'text-(--tinta)')}>
          {Math.abs(dias)}
          <span className="ml-(--e-1) titulo-secao">{Math.abs(dias) === 1 ? 'dia' : 'dias'}</span>
        </span>
      )}
      <span className="corpo-medio text-(--tinta-2)">{passou ? rotuloPassou : rotulo}</span>
    </div>
  )
}

function Antecedencia({
  plano,
  podeEditar,
  rascunho,
  aoMudarRascunho,
  aoSalvar,
}: {
  plano: PlanoRenovacao
  podeEditar: boolean
  rascunho: string
  aoMudarRascunho: (valor: string) => void
  aoSalvar: () => Promise<void>
}) {
  const valido = /^\d{1,4}$/.test(rascunho)
  const dias = valido ? Number(rascunho) : plano.antecedencia
  const { inicioPreparacao, limiteProtocolo } = datasRenovacaoLao(
    plano.validade,
    dias,
    plano.diasLimite,
  )
  const salvar = useMutation({
    mutationFn: () => definirAntecedencia(plano.id, dias, plano.rowVersion),
    onSuccess: aoSalvar,
  })
  const mudou = valido && dias !== plano.antecedencia

  return (
    <div className="flex flex-col gap-(--e-1)">
      {salvar.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(salvar.error)}
        </MensagemSecao>
      ) : null}
      <label htmlFor="antecedencia" className="rotulo">
        Antecedência adicional (dias)
      </label>
      <div className="flex flex-wrap items-center gap-(--e-3)">
        <input
          id="antecedencia"
          inputMode="numeric"
          value={rascunho}
          disabled={!podeEditar}
          aria-invalid={valido ? undefined : true}
          aria-describedby="antecedencia-nota"
          onChange={(evento) => {
            aoMudarRascunho(evento.target.value.replace(/\D/g, '').slice(0, 4))
          }}
          className={cn(classeCampo, 'w-28 numero')}
        />
        <span
          id="antecedencia-nota"
          className={cn('text-xs numero', valido ? 'text-(--tinta-2)' : 'text-(--atraso-texto)')}
        >
          {valido
            ? `Início da preparação ${formatarDataCivil(inicioPreparacao)} · limite continua ${formatarDataCivil(limiteProtocolo)}`
            : 'Use um número inteiro de 0 ou mais.'}
        </span>
        {podeEditar && mudou ? (
          <Botao
            tamanho="compacto"
            aparencia="primario"
            disabled={salvar.isPending}
            onClick={() => {
              salvar.mutate()
            }}
          >
            {salvar.isPending ? 'Salvando…' : 'Salvar antecedência'}
          </Botao>
        ) : null}
      </div>
    </div>
  )
}

/**
 * /renovacoes/:instrumentoId (Protótipo 17, artboards 02 a 06; REN-01, REN-02): quanto falta para
 * o limite de protocolo e o vencimento, a linha de trajeto da renovação, a antecedência, as etapas
 * preparatórias calculadas e o registro do protocolo. Protocolar não prorroga a licença.
 */
export function PaginaPlanoRenovacao() {
  const { instrumentoId = '' } = useParams()
  const { atual } = useConsultoria()
  const queryClient = useQueryClient()
  const ehGestao = atual.papel === 'gestao'
  const orcamentosNoPlano = useRecursoLiberado('orcamentos').data === true
  const [protocoloAberto, setProtocoloAberto] = useState(false)
  const [rascunho, setRascunho] = useState<string | null>(null)

  const plano = useQuery({
    queryKey: ['plano-renovacao', instrumentoId],
    queryFn: () => obterPlano(instrumentoId),
  })
  const abrirComprovante = useMutation({
    mutationFn: urlDoArquivo,
    onSuccess: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
  })

  async function recarregar() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['plano-renovacao', instrumentoId] }),
      queryClient.invalidateQueries({ queryKey: ['renovacoes'] }),
    ])
  }

  if (plano.isPending) {
    return (
      <Pagina titulo="Renovação" voltar={VOLTAR}>
        <Carregando rotulo="Carregando o plano de renovação" linhas={5} />
      </Pagina>
    )
  }
  if (plano.isError) {
    return (
      <Pagina titulo="Renovação" voltar={VOLTAR}>
        {ehSemPermissao(plano.error) ? (
          <SemPermissao />
        ) : (
          <EstadoErro
            titulo="Não foi possível carregar o plano de renovação."
            aoTentarDeNovo={() => void plano.refetch()}
          />
        )}
      </Pagina>
    )
  }
  if (!plano.data) {
    // Inexistente, de outra consultoria ou licença sem plano (só LAO ativa tem).
    return (
      <Pagina titulo="Renovação" voltar={VOLTAR}>
        <EstadoVazio
          icone="file-text"
          titulo="Plano de renovação não encontrado"
          descricao="Só LAO ativa tem plano de renovação, e ela precisa ser desta consultoria."
          acaoPrincipal={
            <Botao aparencia="primario" asChild>
              <Link to="/acompanhamentos">Voltar para Acompanhamentos</Link>
            </Botao>
          }
        />
      </Pagina>
    )
  }

  const dados = plano.data
  const protocolado = dados.protocoladoEm !== null
  const podeEditar = ehGestao && !protocolado
  const textoRascunho = rascunho ?? String(dados.antecedencia)
  const diasPrevia = /^\d{1,4}$/.test(textoRascunho) ? Number(textoRascunho) : dados.antecedencia
  const { inicioPreparacao, limiteProtocolo } = datasRenovacaoLao(
    dados.validade,
    diasPrevia,
    dados.diasLimite,
  )
  const etapas = etapasRenovacaoLao(dados.validade, diasPrevia, dados.diasLimite)
  const situacao = situacaoDaRenovacao({
    vencimento: dados.validade,
    antecedencia: dados.antecedencia,
    diasLimite: dados.diasLimite,
    protocoladoEm: dados.protocoladoEm,
    acompanhamentoDias: dados.acompanhamentoDias,
    hoje: dados.hoje,
  })
  const estacoes = estacoesDaRenovacao({
    inicio: inicioPreparacao,
    limite: limiteProtocolo,
    vencimento: dados.validade,
    protocoladoEm: dados.protocoladoEm,
    hoje: dados.hoje,
  })

  return (
    <Pagina
      titulo={`Renovação da ${dados.licenca}`}
      voltar={VOLTAR}
      meta={
        <span className="flex flex-wrap items-center gap-x-(--e-3) gap-y-(--e-1)">
          <span>
            <Link to={`/empreendimentos/${dados.empreendimentoId}`}>
              {dados.empreendimentoNome}
            </Link>
            {dados.orgao ? ` · ${dados.orgao}` : ''}
          </span>
          <SeloRenovacao situacao={situacao} hoje={dados.hoje} />
        </span>
      }
      acao={
        <>
          <BotaoMais
            itens={[
              {
                // ADR-0044: a tela nova abre o editor se a licença já tem orçamento vivo.
                rotulo: 'Gerar orçamento',
                icone: 'receipt',
                para: `/orcamentos/novo?renovacao=${dados.instrumentoId}`,
                oculto: !(ehGestao && orcamentosNoPlano),
              },
              {
                rotulo: 'Triar atividades',
                icone: 'signpost',
                para: `/triagem?empreendimento=${dados.empreendimentoId}&licenca=${dados.instrumentoId}`,
              },
            ]}
          />
          {podeEditar ? (
            <Botao
              aparencia="primario"
              onClick={() => {
                setProtocoloAberto(true)
              }}
            >
              Registrar protocolo
            </Botao>
          ) : null}
        </>
      }
    >
      {protocolado && dados.protocoladoEm ? (
        <MensagemSecao
          tom="sucesso"
          titulo={`Protocolada em ${formatarDataCivil(dados.protocoladoEm)} · protocolo ${dados.protocoloNumero ?? ''}`}
        >
          <span className="flex flex-wrap items-center gap-x-(--e-2)">
            {dados.comprovante ? (
              <button
                type="button"
                onClick={() => {
                  if (dados.comprovante) abrirComprovante.mutate(dados.comprovante.caminho)
                }}
                className="cursor-pointer text-(--link) hover:underline"
              >
                {dados.comprovante.nome}
              </button>
            ) : null}
            {dados.registradoPorNome && dados.registradoEm ? (
              <span className="text-xs text-(--tinta-2)">
                Registrado por {dados.registradoPorNome} em{' '}
                {formatarInstanteComHora(dados.registradoEm, atual.fuso)}
              </span>
            ) : null}
          </span>
          <span className="mt-(--e-2) block">
            <AcompanhamentoOrgao
              key={dados.rowVersion}
              plano={dados}
              protocoladoEm={dados.protocoladoEm}
              hoje={dados.hoje}
              podeEditar={ehGestao}
              aoSalvar={recarregar}
            />
          </span>
        </MensagemSecao>
      ) : null}
      {abrirComprovante.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(abrirComprovante.error)}
        </MensagemSecao>
      ) : null}

      <section
        aria-label="Prazos da renovação"
        className="flex flex-col overflow-hidden rounded-(--raio-painel) border bg-(--folha)"
      >
        <div className="flex flex-wrap divide-x border-b">
          {protocolado ? null : (
            <Marco
              dias={diferencaEmDias(limiteProtocolo, dados.hoje)}
              rotulo="até o limite de protocolo"
              rotuloPassou="depois do limite de protocolo"
            />
          )}
          <Marco
            dias={diferencaEmDias(dados.validade, dados.hoje)}
            rotulo="até o vencimento"
            rotuloPassou="de licença vencida"
          />
        </div>
        <div className="px-(--e-5) py-(--e-5)">
          <LinhaDoTrajeto estacoes={estacoes} />
        </div>
        <div className="flex flex-col gap-(--e-2) border-t px-(--e-5) py-(--e-4)">
          <Antecedencia
            key={dados.rowVersion}
            plano={dados}
            podeEditar={podeEditar}
            rascunho={textoRascunho}
            aoMudarRascunho={setRascunho}
            aoSalvar={async () => {
              setRascunho(null)
              await recarregar()
            }}
          />
          {!ehGestao ? (
            <p className="text-xs text-(--tinta-2)">
              Só a Gestão muda a antecedência e registra o protocolo.
            </p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="titulo-etapas-renovacao" className="flex flex-col gap-(--e-3)">
        <h2 id="titulo-etapas-renovacao" className="titulo-secao text-(--tinta)">
          Etapas preparatórias
        </h2>
        <ol className="flex flex-col overflow-hidden rounded-(--raio-painel) border bg-(--folha)">
          {etapas.map((etapa) => (
            <li
              key={etapa.titulo}
              className={cn(
                'flex min-h-(--linha) items-center gap-(--e-4) border-b border-(--regra-leve) px-(--e-4) py-(--e-2) last:border-b-0',
                etapa.prazo === dados.hoje && 'bg-(--sinal-fundo)',
              )}
            >
              <span
                className={cn(
                  'w-[88px] shrink-0 corpo-medio numero',
                  etapa.prazo < dados.hoje ? 'text-(--tinta-2)' : 'text-(--tinta)',
                )}
              >
                {formatarDataCivil(etapa.prazo)}
              </span>
              <span className="corpo text-(--tinta)">{etapa.titulo}</span>
            </li>
          ))}
        </ol>
      </section>

      <MensagemSecao tom="informacao">
        Protocolar no prazo não prorroga a licença automaticamente. A validade original continua{' '}
        {formatarDataCivil(dados.validade)}.
      </MensagemSecao>

      {podeEditar ? (
        <DialogoProtocolo
          key={String(protocoloAberto)}
          plano={dados}
          aberto={protocoloAberto}
          aoMudar={setProtocoloAberto}
          aoRegistrar={async () => {
            setProtocoloAberto(false)
            await recarregar()
          }}
        />
      ) : null}
    </Pagina>
  )
}
