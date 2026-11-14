import {
  DURACOES_DE_SUPORTE_HORAS,
  LIMITE_DO_MOTIVO_DE_SUPORTE,
  rotuloDaDuracaoDeSuporte,
  type DuracaoDeSuporte,
} from '@gestao-ambiental/domain'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'

import {
  CHAVE_ACESSOS_DE_SUPORTE,
  CHAVE_AVISOS_DE_EMERGENCIA,
  useConsultoria,
} from '@/app/consultoria/contexto-consultoria'
import { classeCampo } from '@/app/paginas/central/comum'
import { Botao } from '@/components/ui/botao'
import { OpcaoRadio } from '@/components/ui/caixa-selecao'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import {
  acessoValendo,
  autorizarAcessoDeSuporte,
  encerrarAcessoDeSuporte,
  listarAcessosDeSuporte,
  proximaPaginaDeAcessos,
} from '@/lib/api/suporte'
import { mensagemDoErro } from '@/lib/erros'

import { HistoricoDeAcessos } from './HistoricoDeAcessos'
import { textoDoAcessoValendo } from './texto'

type Aviso = { tom: 'sucesso' | 'perigo'; texto: string } | null

function DialogoPermitir({
  aberto,
  aoMudar,
  consultoriaId,
  aoPermitir,
}: {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  consultoriaId: string
  aoPermitir: () => void
}) {
  const idMotivo = useId()
  const [horas, setHoras] = useState<DuracaoDeSuporte>(2)
  const [motivo, setMotivo] = useState('')
  const [chave, setChave] = useState(() => crypto.randomUUID())
  const autorizar = useMutation({
    mutationFn: () => autorizarAcessoDeSuporte(chave, consultoriaId, horas, motivo.trim()),
    onSuccess: () => {
      aoMudar(false)
      aoPermitir()
    },
  })

  function mudar(valor: boolean) {
    if (valor) {
      setHoras(2)
      setMotivo('')
      setChave(crypto.randomUUID())
      autorizar.reset()
    }
    aoMudar(valor)
  }

  return (
    <Dialogo
      aberto={aberto}
      aoMudar={mudar}
      titulo="Permitir acesso do suporte"
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
            form="form-permitir-suporte"
            aparencia="primario"
            disabled={autorizar.isPending}
          >
            {autorizar.isPending ? 'Permitindo…' : 'Permitir acesso'}
          </Botao>
        </>
      }
    >
      <form
        id="form-permitir-suporte"
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault()
          autorizar.mutate()
        }}
        className="flex flex-col gap-(--space-200)"
      >
        {autorizar.isError ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErro(autorizar.error)}
          </MensagemSecao>
        ) : null}
        <fieldset className="flex flex-col gap-(--space-100)" disabled={autorizar.isPending}>
          <legend className="mb-(--space-050) rotulo">Duração</legend>
          {DURACOES_DE_SUPORTE_HORAS.map((opcao) => (
            <OpcaoRadio
              key={opcao}
              name="duracao-suporte"
              rotulo={rotuloDaDuracaoDeSuporte(opcao)}
              value={String(opcao)}
              checked={horas === opcao}
              onChange={() => {
                setHoras(opcao)
                setChave(crypto.randomUUID())
              }}
            />
          ))}
        </fieldset>
        <div className="flex flex-col gap-(--space-050)">
          <label htmlFor={idMotivo} className="rotulo">
            Motivo (opcional)
          </label>
          <textarea
            id={idMotivo}
            rows={3}
            maxLength={LIMITE_DO_MOTIVO_DE_SUPORTE}
            value={motivo}
            disabled={autorizar.isPending}
            onChange={(evento) => {
              setMotivo(evento.target.value)
              setChave(crypto.randomUUID())
            }}
            className={`${classeCampo} py-(--space-075)`}
          />
        </div>
      </form>
    </Dialogo>
  )
}

/**
 * "Acessos do suporte" na Equipe (ADR-0025; Termos §13): a Gestão permite o acesso por 2, 24 ou
 * 48 horas, encerra a qualquer momento (corta na hora) e vê o histórico. Em modo suporte, só o
 * histórico (o banco recusaria as ações de qualquer forma).
 */
export function AcessosDoSuporte() {
  const { atual, suporte } = useConsultoria()
  const cid = atual.consultoriaId
  const queryClient = useQueryClient()
  const [permitirAberto, setPermitirAberto] = useState(false)
  const [aviso, setAviso] = useState<Aviso>(null)

  const consulta = useInfiniteQuery({
    queryKey: [CHAVE_ACESSOS_DE_SUPORTE, cid],
    queryFn: ({ pageParam }) => listarAcessosDeSuporte(cid, pageParam),
    initialPageParam: 0,
    getNextPageParam: proximaPaginaDeAcessos,
  })

  const atualizar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: [CHAVE_ACESSOS_DE_SUPORTE, cid] }),
      queryClient.invalidateQueries({ queryKey: [CHAVE_AVISOS_DE_EMERGENCIA, cid] }),
    ])

  const encerrar = useMutation({
    mutationFn: encerrarAcessoDeSuporte,
    onSuccess: () => {
      setAviso({ tom: 'sucesso', texto: 'Acesso do suporte encerrado.' })
    },
    onError: (erro) => {
      setAviso({ tom: 'perigo', texto: mensagemDoErro(erro) })
    },
    onSettled: atualizar,
  })

  const itens = consulta.data?.pages.flatMap((p) => p.itens) ?? []
  const valendo = consulta.isSuccess ? acessoValendo(itens, new Date()) : null

  return (
    <section aria-labelledby="titulo-acessos-suporte" className="flex flex-col gap-(--space-100)">
      <div className="flex flex-wrap items-center justify-between gap-(--space-100)">
        <h2 id="titulo-acessos-suporte" className="titulo-secao text-(--text)">
          Acessos do suporte
        </h2>
        {!suporte && consulta.isSuccess ? (
          valendo ? (
            <Botao
              iconeAntes="lock"
              disabled={encerrar.isPending}
              onClick={() => {
                setAviso(null)
                encerrar.mutate(valendo.id)
              }}
            >
              Encerrar acesso do suporte
            </Botao>
          ) : (
            <Botao
              iconeAntes="user"
              onClick={() => {
                setAviso(null)
                setPermitirAberto(true)
              }}
            >
              Permitir acesso do suporte
            </Botao>
          )
        ) : null}
      </div>

      {consulta.isSuccess ? (
        <p className="flex flex-wrap items-center gap-(--space-075)">
          {valendo ? <Selo tom="sucesso">Valendo</Selo> : null}
          <span>{textoDoAcessoValendo(valendo, atual.fuso)}</span>
        </p>
      ) : null}

      {aviso ? (
        <MensagemSecao role={aviso.tom === 'sucesso' ? 'status' : 'alert'} tom={aviso.tom}>
          {aviso.texto}
        </MensagemSecao>
      ) : null}

      <HistoricoDeAcessos consulta={consulta} fuso={atual.fuso} />

      {suporte ? null : (
        <DialogoPermitir
          aberto={permitirAberto}
          aoMudar={setPermitirAberto}
          consultoriaId={cid}
          aoPermitir={() => {
            setAviso({ tom: 'sucesso', texto: 'Acesso do suporte permitido.' })
            void atualizar()
          }}
        />
      )}
    </section>
  )
}
