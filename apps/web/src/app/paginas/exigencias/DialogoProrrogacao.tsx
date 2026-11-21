import { zodResolver } from '@hookform/resolvers/zod'
import {
  adicionarDias,
  formatarDataCivil,
  metaInternaSugerida,
  metaInternaValida,
  prorrogacaoValida,
  type DataCivil,
} from '@gestao-ambiental/domain'
import { useMutation } from '@tanstack/react-query'
import { useId, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Botao } from '@/components/ui/botao'
import { CampoData } from '@/components/ui/campo-data'
import { Dialogo } from '@/components/ui/dialogo'
import { classeAreaTexto } from '@/components/ui/estilos-campo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { prorrogarExigencia, type Exigencia } from '@/lib/api/exigencias'
import { mensagemDoErro } from '@/lib/erros'

import { CampoPdf, ErroDoCampo } from './pecas'

/**
 * Prorrogação (só Gestão, só exigência aberta): novo prazo do órgão depois do atual, meta interna
 * sugerida pelo domínio e motivo. O prazo original nunca muda; a linha fica no histórico.
 */
export function DialogoProrrogacao({
  exigencia,
  aoFechar,
  aoSalvar,
}: {
  exigencia: Exigencia
  aoFechar: () => void
  aoSalvar: () => void | Promise<void>
}) {
  const { atual } = useConsultoria()
  const ids = useId()
  const formulario = `${ids}-formulario`
  const [respostaId] = useState(() => crypto.randomUUID())
  // Arquivo novo, versão nova: o Storage não sobrescreve o objeto de uma tentativa anterior.
  const [versaoId, setVersaoId] = useState(() => crypto.randomUUID())
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erroDoPdf, setErroDoPdf] = useState<string | undefined>()
  const [metaEditada, setMetaEditada] = useState(false)

  const esquema = useMemo(
    () =>
      z
        .object({
          prazoNovo: z.string().nullable(),
          metaInterna: z.string().nullable(),
          motivo: z
            .string()
            .trim()
            .min(1, 'Informe o motivo')
            .max(2000, 'Use até 2.000 caracteres'),
        })
        .superRefine((v, ctx) => {
          if (!v.prazoNovo) {
            ctx.addIssue({ code: 'custom', path: ['prazoNovo'], message: 'Informe o novo prazo' })
            return
          }
          if (!prorrogacaoValida(exigencia.prazoOficial, v.prazoNovo as DataCivil)) {
            ctx.addIssue({
              code: 'custom',
              path: ['prazoNovo'],
              message: 'O novo prazo precisa ser depois do prazo atual',
            })
          }
          if (!v.metaInterna) {
            ctx.addIssue({
              code: 'custom',
              path: ['metaInterna'],
              message: 'Informe a meta interna',
            })
          } else if (
            !metaInternaValida(
              v.metaInterna as DataCivil,
              exigencia.recebidoEm,
              v.prazoNovo as DataCivil,
            )
          ) {
            ctx.addIssue({
              code: 'custom',
              path: ['metaInterna'],
              message: 'A meta interna fica entre o recebimento e o prazo',
            })
          }
        }),
    [exigencia.prazoOficial, exigencia.recebidoEm],
  )
  type Dados = z.infer<typeof esquema>
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitted },
  } = useForm<Dados>({
    resolver: zodResolver(esquema),
    defaultValues: { prazoNovo: null, metaInterna: null, motivo: '' },
  })
  const prazoNovo = useWatch({ control, name: 'prazoNovo' }) as DataCivil | null
  const metaInterna = useWatch({ control, name: 'metaInterna' }) as DataCivil | null
  const opcoes = { shouldValidate: isSubmitted }

  const salvar = useMutation({
    mutationFn: (d: Dados) => {
      const novo = d.prazoNovo as DataCivil
      return prorrogarExigencia(
        atual.consultoriaId,
        respostaId,
        exigencia,
        {
          prazoNovo: novo,
          prazoNovoTexto: formatarDataCivil(novo),
          metaInterna: d.metaInterna as DataCivil,
          motivo: d.motivo,
        },
        arquivo,
        versaoId,
      )
    },
    onSuccess: aoSalvar,
  })

  return (
    <Dialogo
      aberto
      aoMudar={(aberto) => {
        if (!aberto) aoFechar()
      }}
      titulo="Prorrogar prazo"
      acoes={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" form={formulario} aparencia="primario" disabled={salvar.isPending}>
            {salvar.isPending ? 'Salvando…' : 'Prorrogar prazo'}
          </Botao>
        </>
      }
    >
      <form
        id={formulario}
        noValidate
        aria-label="Prorrogar prazo"
        className="flex flex-col gap-(--e-3)"
        onSubmit={(evento) =>
          void handleSubmit((dados) => {
            salvar.mutate(dados)
          })(evento)
        }
      >
        {salvar.isError ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErro(salvar.error)}
          </MensagemSecao>
        ) : null}
        <p className="corpo">
          Prazo atual{' '}
          <span className="corpo-medio numero">{formatarDataCivil(exigencia.prazoOficial)}</span>
        </p>
        <CampoData
          rotulo="Novo prazo do órgão *"
          hoje={exigencia.hoje}
          minimo={adicionarDias(exigencia.prazoOficial, 1)}
          motivoDoLimite="O novo prazo precisa ser depois do prazo atual"
          valor={prazoNovo}
          erro={errors.prazoNovo?.message}
          aoMudar={(data) => {
            setValue('prazoNovo', data, opcoes)
            if (!metaEditada) {
              setValue(
                'metaInterna',
                data ? metaInternaSugerida(data, exigencia.recebidoEm) : null,
                opcoes,
              )
            }
          }}
        />
        <CampoData
          rotulo="Meta interna *"
          hoje={exigencia.hoje}
          minimo={exigencia.recebidoEm}
          maximo={prazoNovo ?? undefined}
          motivoDoLimite="A meta interna fica entre o recebimento e o prazo"
          valor={metaInterna}
          erro={errors.metaInterna?.message}
          aoMudar={(data) => {
            setMetaEditada(true)
            setValue('metaInterna', data, opcoes)
          }}
        />
        <div className="flex flex-col gap-(--e-1)">
          <label
            htmlFor={`${ids}-motivo`}
            className="flex min-h-5 items-center rotulo text-(--tinta)"
          >
            Motivo *
          </label>
          <textarea
            id={`${ids}-motivo`}
            className={classeAreaTexto}
            maxLength={2000}
            aria-invalid={errors.motivo ? true : undefined}
            aria-describedby={errors.motivo ? `${ids}-motivo-erro` : undefined}
            {...register('motivo')}
          />
          <ErroDoCampo id={`${ids}-motivo-erro`}>{errors.motivo?.message}</ErroDoCampo>
        </div>
        <CampoPdf
          rotulo="PDF da prorrogação"
          arquivo={arquivo}
          erro={erroDoPdf}
          desabilitado={salvar.isPending}
          aoEscolher={(escolhido) => {
            setErroDoPdf(undefined)
            setArquivo(escolhido)
            setVersaoId(crypto.randomUUID())
          }}
          aoErrar={setErroDoPdf}
        />
      </form>
    </Dialogo>
  )
}
