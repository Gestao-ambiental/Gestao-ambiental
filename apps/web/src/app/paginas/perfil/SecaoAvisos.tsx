import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Carregando, EstadoErro, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { CaixaSelecao } from '@/components/ui/caixa-selecao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  CHAVE_MEUS_AVISOS,
  definirResumoDiario,
  gerarLinkDoCalendario,
  lerMeusAvisos,
  revogarLinkDoCalendario,
  type MeusAvisos,
} from '@/lib/api/avisos'
import { formatarInstanteComoData } from '@/lib/datas'
import { codigoDoErro, ehSemPermissao, mensagemDoErro } from '@/lib/erros'

type Confirmacao = 'gerar' | 'revogar' | null

/**
 * Perfil › Avisos (ADR-0047): o resumo diário por e-mail (ligado por padrão) e o link do calendário
 * da própria pessoa. O endereço do link só aparece ao gerar e fica só nesta tela (nunca em cache
 * nem em armazenamento do navegador): o banco guarda o hash.
 */
export function SecaoAvisos() {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const avisos = useQuery({
    queryKey: [CHAVE_MEUS_AVISOS, cid],
    queryFn: () => lerMeusAvisos(cid),
  })

  let conteudo
  if (avisos.isPending) {
    conteudo = <Carregando rotulo="Carregando avisos" linhas={2} />
  } else if (ehSemPermissao(avisos.error)) {
    conteudo = <SemPermissao />
  } else if (avisos.isError) {
    conteudo = <EstadoErro aoTentarDeNovo={() => void avisos.refetch()} />
  } else {
    conteudo = (
      <Avisos
        avisos={avisos.data}
        consultoriaId={cid}
        fuso={atual.fuso}
        recarregar={() => void avisos.refetch()}
      />
    )
  }

  return (
    <section
      aria-labelledby="titulo-avisos"
      className="flex flex-col gap-(--e-4) border-t pt-(--e-6)"
    >
      <h2 id="titulo-avisos" className="titulo-secao text-(--tinta)">
        Avisos
      </h2>
      {conteudo}
    </section>
  )
}

function Avisos({
  avisos,
  consultoriaId,
  fuso,
  recarregar,
}: {
  avisos: MeusAvisos
  consultoriaId: string
  fuso: string
  recarregar: () => void
}) {
  const queryClient = useQueryClient()
  const [novoLink, setNovoLink] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<Confirmacao>(null)
  const [copia, setCopia] = useState<'copiado' | 'falhou' | null>(null)

  async function atualizar() {
    await queryClient.invalidateQueries({ queryKey: [CHAVE_MEUS_AVISOS, consultoriaId] })
  }

  const resumo = useMutation({
    mutationFn: (ligado: boolean) => definirResumoDiario(consultoriaId, ligado, avisos.rowVersion),
    onSuccess: atualizar,
    onError: (erro) => {
      // Outra aba mudou antes: traz a versão atual (a mensagem fica até a próxima escolha).
      if (codigoDoErro(erro) === 'conflito_de_versao') recarregar()
    },
  })
  const gerar = useMutation({
    mutationFn: () => gerarLinkDoCalendario(consultoriaId),
    onSuccess: async (url) => {
      setNovoLink(url)
      setCopia(null)
      await atualizar()
    },
    onSettled: () => {
      setConfirmar(null)
    },
  })
  const revogar = useMutation({
    mutationFn: () => revogarLinkDoCalendario(consultoriaId),
    onSuccess: async () => {
      setNovoLink(null)
      setCopia(null)
      await atualizar()
    },
    onSettled: () => {
      setConfirmar(null)
    },
  })
  const ocupadoNoLink = gerar.isPending || revogar.isPending
  const erroDoLink = gerar.error ?? revogar.error
  const ligado = resumo.isPending ? resumo.variables : avisos.resumoDiario

  async function copiar(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopia('copiado')
    } catch {
      setCopia('falhou')
    }
  }

  const desde = avisos.linkCriadoEm ? formatarInstanteComoData(avisos.linkCriadoEm, fuso) : null
  const ultimoUso = avisos.linkUltimoAcessoEm
    ? formatarInstanteComoData(avisos.linkUltimoAcessoEm, fuso)
    : null

  return (
    <>
      <div className="flex flex-col gap-(--e-2)">
        <CaixaSelecao
          className="max-md:min-h-(--controle-toque)"
          rotulo="Resumo diário por e-mail"
          checked={ligado}
          disabled={resumo.isPending}
          onChange={(evento) => {
            resumo.mutate(evento.target.checked)
          }}
        />
        {resumo.error ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErro(resumo.error)}
          </MensagemSecao>
        ) : null}
      </div>

      <div className="flex flex-col gap-(--e-3)">
        <h3 className="corpo-medio text-(--tinta)">Link do calendário</h3>
        {avisos.linkAtivo && desde ? (
          <p className="rotulo numero">
            Ativo desde {desde}
            {ultimoUso ? ` · último uso ${ultimoUso}` : ''}
          </p>
        ) : null}

        {novoLink ? (
          <div className="flex flex-col gap-(--e-2) sm:flex-row sm:items-end">
            <CampoTexto
              className="min-w-0 flex-1"
              rotulo="Endereço do calendário"
              value={novoLink}
              readOnly
              spellCheck={false}
              onFocus={(evento) => {
                evento.currentTarget.select()
              }}
            />
            <div className="flex items-center gap-(--e-2)">
              <Botao iconeAntes="copy" onClick={() => void copiar(novoLink)}>
                Copiar
              </Botao>
              <span aria-live="polite" className="rotulo">
                {copia === 'copiado'
                  ? 'Copiado'
                  : copia === 'falhou'
                    ? 'Não foi possível copiar.'
                    : ''}
              </span>
            </div>
          </div>
        ) : null}

        {erroDoLink ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErro(erroDoLink)}
          </MensagemSecao>
        ) : null}

        <div className="flex flex-wrap items-center gap-(--e-2)">
          {avisos.linkAtivo ? (
            <>
              <Botao
                iconeAntes="refresh-cw"
                disabled={ocupadoNoLink}
                onClick={() => {
                  setConfirmar('gerar')
                }}
              >
                Gerar novo link
              </Botao>
              <Botao
                aparencia="perigo"
                disabled={ocupadoNoLink}
                onClick={() => {
                  setConfirmar('revogar')
                }}
              >
                Revogar
              </Botao>
            </>
          ) : (
            <Botao
              iconeAntes="calendar"
              disabled={ocupadoNoLink}
              onClick={() => {
                gerar.mutate()
              }}
            >
              {gerar.isPending ? 'Gerando…' : 'Gerar link'}
            </Botao>
          )}
        </div>
      </div>

      <Dialogo
        aberto={confirmar === 'gerar'}
        aoMudar={(aberto) => {
          if (!aberto) setConfirmar(null)
        }}
        titulo="Gerar novo link?"
        descricao="O link atual para de funcionar."
        acoes={
          <>
            <Botao
              onClick={() => {
                setConfirmar(null)
              }}
            >
              Cancelar
            </Botao>
            <Botao
              aparencia="primario"
              disabled={gerar.isPending}
              onClick={() => {
                gerar.mutate()
              }}
            >
              {gerar.isPending ? 'Gerando…' : 'Gerar novo link'}
            </Botao>
          </>
        }
      />
      <Dialogo
        aberto={confirmar === 'revogar'}
        aoMudar={(aberto) => {
          if (!aberto) setConfirmar(null)
        }}
        titulo="Revogar o link do calendário?"
        descricao="O calendário assinado para de atualizar."
        acoes={
          <>
            <Botao
              onClick={() => {
                setConfirmar(null)
              }}
            >
              Cancelar
            </Botao>
            <Botao
              aparencia="perigo"
              disabled={revogar.isPending}
              onClick={() => {
                revogar.mutate()
              }}
            >
              {revogar.isPending ? 'Revogando…' : 'Revogar'}
            </Botao>
          </>
        }
      />
    </>
  )
}
