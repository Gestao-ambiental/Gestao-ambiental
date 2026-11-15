import {
  CATEGORIAS_DE_EMERGENCIA,
  DURACAO_DA_EMERGENCIA_HORAS,
  LIMITE_DO_MOTIVO_DE_SUPORTE,
  ROTULO_DA_CATEGORIA_DE_EMERGENCIA,
  type CategoriaDeEmergencia,
} from '@gestao-ambiental/domain'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { useAbrirModoSuporte } from '@/app/consultoria/modo-suporte'
import { HistoricoDeAcessos } from '@/app/suporte/HistoricoDeAcessos'
import { textoDoAcessoValendo } from '@/app/suporte/texto'
import { Botao } from '@/components/ui/botao'
import { OpcaoRadio } from '@/components/ui/caixa-selecao'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import {
  abrirAcessoDeEmergencia,
  acessoValendo,
  avisarGestaoPorEmail,
  entrarComoSuporte,
  listarAcessosNaCentral,
  proximaPaginaDeAcessos,
} from '@/lib/api/suporte'
import { mensagemDoErro } from '@/lib/erros'

import { classeCampo } from './comum'

const CHAVE = 'acessos-de-suporte'

/**
 * Acesso de emergência (Termos §13.3 b): categoria e motivo obrigatórios, 2 horas, só leitura. Depois
 * de abrir, pede o e-mail de aviso à Gestão; se o e-mail não sair, o acesso continua valendo e a
 * tela mostra o motivo antes de entrar.
 */
function DialogoEmergencia({
  aberto,
  aoMudar,
  consultoriaId,
  consultoriaNome,
  aoAbrir,
  aoEntrar,
}: {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  consultoriaId: string
  consultoriaNome: string
  aoAbrir: () => void
  aoEntrar: () => void
}) {
  const idMotivo = useId()
  const idErroMotivo = useId()
  const idErroCategoria = useId()
  const [categoria, setCategoria] = useState<CategoriaDeEmergencia | null>(null)
  const [motivo, setMotivo] = useState('')
  const [erros, setErros] = useState<{ categoria?: string; motivo?: string }>({})
  const [chave, setChave] = useState(() => crypto.randomUUID())
  const [emailNaoSaiu, setEmailNaoSaiu] = useState<string | null>(null)

  const abrir = useMutation({
    mutationFn: async ({
      escolhida,
      texto,
    }: {
      escolhida: CategoriaDeEmergencia
      texto: string
    }) => {
      const acessoId = await abrirAcessoDeEmergencia(chave, consultoriaId, escolhida, texto)
      return avisarGestaoPorEmail(acessoId)
    },
    onSuccess: (aviso) => {
      aoAbrir()
      if (aviso.enviado) {
        aoEntrar()
        return
      }
      setEmailNaoSaiu(aviso.motivo)
    },
  })

  function mudar(valor: boolean) {
    if (valor) {
      setCategoria(null)
      setMotivo('')
      setErros({})
      setChave(crypto.randomUUID())
      setEmailNaoSaiu(null)
      abrir.reset()
    }
    aoMudar(valor)
  }

  function enviar() {
    const texto = motivo.trim()
    const novos = {
      categoria: categoria ? undefined : 'Escolha a categoria',
      motivo: texto ? undefined : 'Informe o motivo',
    }
    setErros(novos)
    if (!categoria || !texto) return
    abrir.mutate({ escolhida: categoria, texto })
  }

  if (emailNaoSaiu) {
    return (
      <Dialogo
        aberto={aberto}
        aoMudar={mudar}
        titulo="Acesso de emergência aberto"
        acoes={
          <Botao aparencia="primario" onClick={aoEntrar}>
            Entrar como suporte
          </Botao>
        }
      >
        <MensagemSecao role="alert" tom="atencao">
          O e-mail para a Gestão não saiu ({emailNaoSaiu}). A Gestão vê o aviso no Grama.
        </MensagemSecao>
      </Dialogo>
    )
  }

  return (
    <Dialogo
      aberto={aberto}
      aoMudar={mudar}
      titulo="Acesso de emergência"
      descricao={`${consultoriaNome} · ${String(DURACAO_DA_EMERGENCIA_HORAS)} horas · somente leitura`}
      acoes={
        <>
          <Botao
            onClick={() => {
              mudar(false)
            }}
          >
            Cancelar
          </Botao>
          <Botao
            type="submit"
            form="form-emergencia"
            aparencia="perigo"
            disabled={abrir.isPending}
            aria-busy={abrir.isPending || undefined}
          >
            {abrir.isPending ? 'Abrindo…' : 'Abrir acesso de emergência'}
          </Botao>
        </>
      }
    >
      <form
        id="form-emergencia"
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault()
          enviar()
        }}
        className="flex flex-col gap-(--space-200)"
      >
        {abrir.isError ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErro(abrir.error)}
          </MensagemSecao>
        ) : null}
        <fieldset
          className="flex flex-col gap-(--space-100)"
          disabled={abrir.isPending}
          aria-describedby={erros.categoria ? idErroCategoria : undefined}
        >
          <legend className="mb-(--space-050) rotulo">Categoria</legend>
          {CATEGORIAS_DE_EMERGENCIA.map((opcao) => (
            <OpcaoRadio
              key={opcao}
              name="categoria-emergencia"
              rotulo={ROTULO_DA_CATEGORIA_DE_EMERGENCIA[opcao]}
              value={opcao}
              checked={categoria === opcao}
              aria-invalid={erros.categoria ? true : undefined}
              onChange={() => {
                setCategoria(opcao)
                setErros((atual) => ({ ...atual, categoria: undefined }))
              }}
            />
          ))}
          {erros.categoria ? (
            <span id={idErroCategoria} className="text-xs text-(--text-danger)">
              {erros.categoria}
            </span>
          ) : null}
        </fieldset>
        <div className="flex flex-col gap-(--space-050)">
          <label htmlFor={idMotivo} className="rotulo">
            Motivo
          </label>
          <textarea
            id={idMotivo}
            rows={3}
            maxLength={LIMITE_DO_MOTIVO_DE_SUPORTE}
            required
            disabled={abrir.isPending}
            aria-invalid={erros.motivo ? true : undefined}
            aria-describedby={erros.motivo ? idErroMotivo : undefined}
            value={motivo}
            onChange={(evento) => {
              setMotivo(evento.target.value)
              if (erros.motivo && evento.target.value.trim() !== '') {
                setErros((atual) => ({ ...atual, motivo: undefined }))
              }
            }}
            className={`${classeCampo} py-(--space-075)`}
          />
          {erros.motivo ? (
            <span id={idErroMotivo} className="text-xs text-(--text-danger)">
              {erros.motivo}
            </span>
          ) : null}
        </div>
      </form>
    </Dialogo>
  )
}

/**
 * Acesso de suporte no detalhe da consultoria (ADR-0025): estado da autorização, "Entrar como
 * suporte" quando há acesso valendo, "Acesso de emergência" quando não há, e o histórico.
 */
export function AcessoDeSuporteNaCentral({
  consultoriaId,
  consultoriaNome,
  fuso,
}: {
  consultoriaId: string
  consultoriaNome: string
  fuso: string
}) {
  const queryClient = useQueryClient()
  const abrirModoSuporte = useAbrirModoSuporte()
  const [emergenciaAberta, setEmergenciaAberta] = useState(false)

  const consulta = useInfiniteQuery({
    queryKey: ['central', CHAVE, consultoriaId],
    queryFn: ({ pageParam }) => listarAcessosNaCentral(consultoriaId, pageParam),
    initialPageParam: 0,
    getNextPageParam: proximaPaginaDeAcessos,
  })

  const entrar = useMutation({
    mutationFn: () => entrarComoSuporte(consultoriaId),
    onSuccess: () => {
      abrirModoSuporte(consultoriaId)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['central', CHAVE, consultoriaId] }),
  })

  const itens = consulta.data?.pages.flatMap((p) => p.itens) ?? []
  const valendo = consulta.isSuccess ? acessoValendo(itens, new Date()) : null

  return (
    <section aria-labelledby="central-suporte" className="flex flex-col gap-(--space-100)">
      <div className="flex flex-wrap items-center justify-between gap-(--space-100)">
        <h2 id="central-suporte" className="titulo-secao text-(--text)">
          Acesso de suporte
        </h2>
        {consulta.isSuccess ? (
          valendo ? (
            <Botao
              aparencia="primario"
              iconeAntes="arrow-right"
              disabled={entrar.isPending}
              onClick={() => {
                entrar.mutate()
              }}
            >
              Entrar como suporte
            </Botao>
          ) : (
            <Botao
              iconeAntes="triangle-alert"
              onClick={() => {
                setEmergenciaAberta(true)
              }}
            >
              Acesso de emergência
            </Botao>
          )
        ) : null}
      </div>

      {consulta.isSuccess ? (
        <p className="flex flex-wrap items-center gap-(--space-075)">
          {valendo ? <Selo tom="sucesso">Valendo</Selo> : null}
          <span>{textoDoAcessoValendo(valendo, fuso)}</span>
        </p>
      ) : null}

      {entrar.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(entrar.error)}
        </MensagemSecao>
      ) : null}

      <HistoricoDeAcessos consulta={consulta} fuso={fuso} />

      <DialogoEmergencia
        aberto={emergenciaAberta}
        aoMudar={setEmergenciaAberta}
        consultoriaId={consultoriaId}
        consultoriaNome={consultoriaNome}
        aoAbrir={() => {
          void queryClient.invalidateQueries({ queryKey: ['central', CHAVE, consultoriaId] })
        }}
        aoEntrar={() => {
          setEmergenciaAberta(false)
          abrirModoSuporte(consultoriaId)
        }}
      />
    </section>
  )
}
