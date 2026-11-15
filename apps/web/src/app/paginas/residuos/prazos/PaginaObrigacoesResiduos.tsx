// Resíduos, fase 1 (docs/estudos/integracao-ima-mtr.md, seções 3b e 5): obrigações de resíduos por
// empreendimento e os próximos prazos calculados. Protótipo para revisão.
//
// A Gestão liga e desliga DMR trimestral, DMRSU mensal, Inventário Nacional e RAPP do IBAMA; a
// Equipe só vê. O botão some para a Equipe por apresentação: quem recusa é o banco
// (definir_obrigacao_residuo devolve sem_permissao). Prazos nunca são gravados.

import {
  ROTULO_DA_OBRIGACAO_RESIDUO,
  formatarDataCivil,
  hojeNoFuso,
  proximosPrazosDaObrigacaoResiduo,
} from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useSearchParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import { listarEmpreendimentos } from '@/lib/api/empreendimentos'
import {
  definirObrigacaoResiduo,
  obrigacoesDoEmpreendimento,
  type ObrigacaoDeResiduo,
} from '@/lib/api/residuos'
import { ehSemPermissao, mensagemDoErro } from '@/lib/erros'

import { ProximosPrazosDeResiduos } from './ProximosPrazosDeResiduos'
import { CHAVE_PRAZOS_RESIDUO } from './prazos-de-residuos'

const classeSelect =
  'h-(--size-control) w-full max-w-[320px] rounded-(--radius) border border-(--border-input) border-b-(--border-input-accessible) bg-(--surface-input) px-(--space-100) corpo text-(--text) outline-none focus:border-b-(--border-input-active) focus:shadow-[inset_0_-1px_0_0_var(--border-input-active)]'

const classeCelula = 'h-10 px-(--space-100) whitespace-nowrap first:pl-(--space-150)'

function TabelaDeObrigacoes({ empreendimentoId }: { empreendimentoId: string }) {
  const { atual } = useConsultoria()
  const ehGestao = atual.papel === 'gestao'
  const hoje = hojeNoFuso(new Date(), atual.fuso)
  const queryClient = useQueryClient()
  const [erro, setErro] = useState<string | null>(null)

  const obrigacoes = useQuery({
    queryKey: ['obrigacoes-residuo', empreendimentoId],
    queryFn: () => obrigacoesDoEmpreendimento(empreendimentoId),
  })

  const definir = useMutation({
    mutationFn: (o: ObrigacaoDeResiduo) =>
      definirObrigacaoResiduo(empreendimentoId, o.tipo, !o.ativa, o.observacao),
    onMutate: () => {
      setErro(null)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['obrigacoes-residuo', empreendimentoId] }),
        queryClient.invalidateQueries({ queryKey: [CHAVE_PRAZOS_RESIDUO] }),
      ])
    },
    onError: (e) => {
      setErro(mensagemDoErro(e))
    },
  })

  if (obrigacoes.isError) {
    return ehSemPermissao(obrigacoes.error) ? (
      <SemPermissao descricao={null} />
    ) : (
      <EstadoErro
        titulo="Não foi possível carregar as obrigações."
        aoTentarDeNovo={() => void obrigacoes.refetch()}
      />
    )
  }
  if (obrigacoes.isPending) return <Carregando rotulo="Carregando as obrigações" linhas={4} />

  return (
    <div className="flex flex-col gap-(--space-100)">
      {erro ? (
        <MensagemSecao role="alert" tom="perigo" titulo="Não foi possível salvar">
          {erro}
        </MensagemSecao>
      ) : null}
      <div className="overflow-x-auto rounded-(--radius-large) border bg-(--surface) shadow-cartao">
        <table className="w-full border-collapse corpo" aria-label="Obrigações de resíduos">
          <thead>
            <tr>
              {['Obrigação', 'Situação', 'Próximo prazo', ...(ehGestao ? ['Ação'] : [])].map(
                (coluna) => (
                  <th
                    key={coluna}
                    scope="col"
                    className="h-10 border-b px-(--space-100) text-left whitespace-nowrap rotulo first:pl-(--space-150)"
                  >
                    {coluna}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {obrigacoes.data.map((o) => {
              const rotulo = ROTULO_DA_OBRIGACAO_RESIDUO[o.tipo]
              const proximo = o.ativa ? proximosPrazosDaObrigacaoResiduo(o.tipo, hoje, 1)[0] : null
              const salvando = definir.isPending && definir.variables.tipo === o.tipo
              return (
                <tr key={o.tipo} className="border-b last:border-b-0">
                  <th scope="row" className={`${classeCelula} text-left font-normal`}>
                    {rotulo}
                  </th>
                  <td className={classeCelula}>
                    <Selo tom={o.ativa ? 'sucesso' : 'padrao'}>
                      {o.ativa ? 'Ligada' : 'Desligada'}
                    </Selo>
                  </td>
                  <td className={classeCelula}>
                    {proximo ? (
                      <>
                        <span className="corpo-medio">{formatarDataCivil(proximo.prazo)}</span>
                        <span> · {proximo.referencia}</span>
                      </>
                    ) : (
                      <>
                        <span aria-hidden="true">—</span>
                        <span className="sr-only">Sem prazo</span>
                      </>
                    )}
                  </td>
                  {ehGestao ? (
                    <td className={classeCelula}>
                      <Botao
                        tamanho="compacto"
                        aparencia={o.ativa ? 'padrao' : 'primario'}
                        disabled={definir.isPending}
                        aria-label={`${o.ativa ? 'Desligar' : 'Ligar'} ${rotulo}`}
                        onClick={() => {
                          definir.mutate(o)
                        }}
                      >
                        {salvando ? 'Salvando' : o.ativa ? 'Desligar' : 'Ligar'}
                      </Botao>
                    </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * /residuos/prazos (sugestão de rota): escolha do empreendimento pela URL (?empreendimento=),
 * obrigações dele e os próximos prazos. Sem empreendimento: os prazos da consultoria inteira.
 */
export function PaginaObrigacoesResiduos() {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const [parametros, setParametros] = useSearchParams()
  const empreendimentoId = parametros.get('empreendimento')
  const idSelect = useId()

  // Primeira página de empreendimentos (50), como os outros filtros por empreendimento do app.
  const empreendimentos = useQuery({
    queryKey: ['empreendimentos', cid, '', 'residuos-prazos'],
    queryFn: () => listarEmpreendimentos(cid, '', 0),
  })

  let corpo
  if (empreendimentos.isError) {
    corpo = ehSemPermissao(empreendimentos.error) ? (
      <SemPermissao descricao={null} />
    ) : (
      <EstadoErro
        titulo="Não foi possível carregar os empreendimentos."
        aoTentarDeNovo={() => void empreendimentos.refetch()}
      />
    )
  } else if (empreendimentos.isPending) {
    corpo = <Carregando rotulo="Carregando os empreendimentos" linhas={3} />
  } else if (empreendimentos.data.itens.length === 0) {
    corpo = <EstadoVazio icone="briefcase" titulo="Nenhum empreendimento cadastrado" />
  } else {
    const escolhido = empreendimentos.data.itens.find((e) => e.id === empreendimentoId) ?? null
    corpo = (
      <>
        <div className="flex flex-col gap-(--space-050)">
          <label htmlFor={idSelect} className="rotulo text-(--text)">
            Empreendimento
          </label>
          <select
            id={idSelect}
            className={classeSelect}
            value={escolhido?.id ?? ''}
            onChange={(evento) => {
              const valor = evento.target.value
              setParametros(valor ? { empreendimento: valor } : {}, { replace: true })
            }}
          >
            <option value="">Todos os empreendimentos</option>
            {empreendimentos.data.itens.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </div>

        {escolhido ? (
          <section aria-label="Obrigações" className="flex flex-col gap-(--space-100)">
            <h2 className="titulo-secao text-(--text)">Obrigações de {escolhido.nome}</h2>
            <TabelaDeObrigacoes key={escolhido.id} empreendimentoId={escolhido.id} />
          </section>
        ) : null}

        <ProximosPrazosDeResiduos
          empreendimentoId={escolhido?.id ?? null}
          semEmpreendimento={escolhido !== null}
          limite={Number.POSITIVE_INFINITY}
          titulo={escolhido ? `Próximos prazos de ${escolhido.nome}` : 'Próximos prazos'}
        />
      </>
    )
  }

  return (
    <div className="flex flex-col gap-(--space-200)">
      <Pagina titulo="Prazos de resíduos">{null}</Pagina>
      {corpo}
    </div>
  )
}
