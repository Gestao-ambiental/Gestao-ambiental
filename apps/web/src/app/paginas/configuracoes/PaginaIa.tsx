// /configuracoes/ia (ADR-0061): a Gestão liga ou desliga a conferência de relatórios por IA. Vem
// desligada; ligar é o consentimento da consultoria para mandar o texto do relatório ao provedor, e
// fica registrado com quem ligou e quando. Desligada, só as regras fixas conferem o relatório. A
// tela só mostra; quem barra é o banco (reservar_conferencia_ia recusa sem a autorização).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { PaginaDeConfiguracoes } from '@/app/paginas/configuracoes/PaginaDeConfiguracoes'
import { Carregando, EstadoErro, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import { definirAutorizacaoDaIa, obterAutorizacaoDaIa } from '@/lib/api/autorizacao-ia'
import { formatarInstanteComoData } from '@/lib/datas'
import { ehSemPermissao, mensagemDoErro } from '@/lib/erros'

/** O que vai à IA quando a conferência está ligada (o mesmo que a política de privacidade diz). */
const ENVIO_DA_CONFERENCIA: readonly { rotulo: string; valor: string }[] = [
  {
    rotulo: 'Vai para a IA',
    valor: 'Texto do relatório e dados do cadastro: empreendimento, licença e condicionante',
  },
  { rotulo: 'Mascarado antes do envio', valor: 'CPF, e-mail e telefone' },
  { rotulo: 'Provedor', valor: 'OpenRouter, com provedores que não guardam nem treinam' },
  {
    rotulo: 'Limite',
    valor: '10 por pessoa e 25 por consultoria a cada 24 horas, somado com a leitura de licenças',
  },
  { rotulo: 'Sem a IA', valor: 'Só as regras fixas conferem: campos, CNPJ e datas' },
]

export function PaginaIa() {
  const { atual } = useConsultoria()
  if (atual.papel !== 'gestao') {
    return (
      <PaginaDeConfiguracoes>
        <SemPermissao />
      </PaginaDeConfiguracoes>
    )
  }
  return <ConferenciaPorIa />
}

function ConferenciaPorIa() {
  const { atual, suporte } = useConsultoria()
  const cid = atual.consultoriaId
  const queryClient = useQueryClient()
  const [confirmando, setConfirmando] = useState(false)

  const autorizacao = useQuery({
    queryKey: ['autorizacao-ia', cid],
    queryFn: () => obterAutorizacaoDaIa(cid),
  })
  const definir = useMutation({
    mutationFn: (autorizada: boolean) => definirAutorizacaoDaIa(cid, autorizada),
    onSuccess: async () => {
      setConfirmando(false)
      await queryClient.invalidateQueries({ queryKey: ['autorizacao-ia', cid] })
    },
  })

  return (
    <PaginaDeConfiguracoes>
      {autorizacao.isPending ? (
        <Carregando rotulo="Carregando a conferência por IA" />
      ) : autorizacao.isError ? (
        ehSemPermissao(autorizacao.error) ? (
          <SemPermissao />
        ) : (
          <EstadoErro aoTentarDeNovo={() => void autorizacao.refetch()} />
        )
      ) : (
        <section
          aria-labelledby="titulo-conferencia-ia"
          className="flex max-w-[720px] flex-col gap-(--e-4) rounded-(--raio-painel) border bg-(--folha) p-(--e-4)"
        >
          <div className="flex flex-wrap items-center justify-between gap-(--e-3)">
            <div className="flex flex-col gap-(--e-05)">
              <h2 id="titulo-conferencia-ia" className="titulo-secao">
                Conferência de relatórios por IA
              </h2>
              <Selo tom={autorizacao.data.autorizada ? 'sucesso' : 'padrao'}>
                {autorizacao.data.autorizada ? 'Ligada' : 'Desligada'}
              </Selo>
              {autorizacao.data.decididaEm ? (
                <span className="text-xs text-(--tinta-2)">
                  {autorizacao.data.autorizada ? 'Ligada' : 'Desligada'}
                  {autorizacao.data.decididaPor
                    ? ` por ${autorizacao.data.decididaPor}`
                    : ''} em {formatarInstanteComoData(autorizacao.data.decididaEm, atual.fuso)}
                </span>
              ) : null}
            </div>
            {suporte ? null : autorizacao.data.autorizada ? (
              <Botao
                disabled={definir.isPending}
                onClick={() => {
                  definir.mutate(false)
                }}
              >
                Desligar
              </Botao>
            ) : (
              <Botao
                aparencia="primario"
                onClick={() => {
                  setConfirmando(true)
                }}
              >
                Ligar
              </Botao>
            )}
          </div>

          {definir.isError && !confirmando ? (
            <MensagemSecao role="alert" tom="perigo">
              {mensagemDoErro(definir.error)}
            </MensagemSecao>
          ) : null}

          <dl className="flex flex-col">
            {ENVIO_DA_CONFERENCIA.map((linha) => (
              <div
                key={linha.rotulo}
                className="grid gap-(--e-05) border-t border-(--regra-leve) py-(--e-2) md:grid-cols-[200px_1fr] md:gap-(--e-3)"
              >
                <dt className="corpo-medio text-(--tinta-2)">{linha.rotulo}</dt>
                <dd className="corpo text-(--tinta)">{linha.valor}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <Dialogo
        aberto={confirmando}
        aoMudar={(abrir) => {
          if (!abrir) setConfirmando(false)
        }}
        titulo="Ligar a conferência por IA?"
        descricao="O texto dos relatórios anexados ou escritos no Grama passa a ir ao provedor de IA, com CPF, e-mail e telefone mascarados."
        acoes={
          <>
            <Botao
              disabled={definir.isPending}
              onClick={() => {
                setConfirmando(false)
              }}
            >
              Cancelar
            </Botao>
            <Botao
              aparencia="primario"
              disabled={definir.isPending}
              onClick={() => {
                definir.mutate(true)
              }}
            >
              Ligar e autorizar o envio
            </Botao>
          </>
        }
      >
        {definir.isError ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErro(definir.error)}
          </MensagemSecao>
        ) : null}
      </Dialogo>
    </PaginaDeConfiguracoes>
  )
}
