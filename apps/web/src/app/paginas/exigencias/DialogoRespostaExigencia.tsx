import { zodResolver } from '@hookform/resolvers/zod'
import { formatarDataCivil, type DataCivil } from '@gestao-ambiental/domain'
import { useMutation } from '@tanstack/react-query'
import { useId, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Botao } from '@/components/ui/botao'
import { CampoData } from '@/components/ui/campo-data'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { anexarAExigencia, responderExigencia, type Exigencia } from '@/lib/api/exigencias'
import { mensagemDoErro } from '@/lib/erros'

import { CampoPdf } from './pecas'

export type TipoDoRegistro = 'resposta' | 'anexo'

const TITULOS: Record<TipoDoRegistro, string> = {
  resposta: 'Registrar resposta',
  anexo: 'Anexar documento',
}

/**
 * Resposta protocolada (data do protocolo e número ou PDF) ou anexo (PDF com descrição). Só
 * acrescenta ao histórico; a primeira resposta encerra a exigência. Gestão ou responsável.
 */
export function DialogoRespostaExigencia({
  tipo,
  exigencia,
  aoFechar,
  aoSalvar,
}: {
  tipo: TipoDoRegistro
  exigencia: Exigencia
  aoFechar: () => void
  aoSalvar: () => void | Promise<void>
}) {
  const { atual } = useConsultoria()
  const ids = useId()
  const formulario = `${ids}-formulario`
  // Gerados uma vez por abertura: repetir depois de erro de rede não duplica a linha.
  const [respostaId] = useState(() => crypto.randomUUID())
  // Arquivo novo, versão nova: o Storage não sobrescreve o objeto de uma tentativa anterior.
  const [versaoId, setVersaoId] = useState(() => crypto.randomUUID())
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erroDoPdf, setErroDoPdf] = useState<string | undefined>()
  const ehResposta = tipo === 'resposta'

  const esquema = useMemo(
    () =>
      z.object({
        protocoladoEm: z.string().nullable(),
        protocoloNumero: z.string().trim().max(60, 'Use até 60 caracteres'),
        descricao: z.string().trim().max(300, 'Use até 300 caracteres'),
      }),
    [],
  )
  type Dados = z.infer<typeof esquema>
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors, isSubmitted },
  } = useForm<Dados>({
    resolver: zodResolver(esquema),
    defaultValues: { protocoladoEm: null, protocoloNumero: '', descricao: '' },
  })
  const protocoladoEm = useWatch({ control, name: 'protocoladoEm' }) as DataCivil | null

  const salvar = useMutation({
    mutationFn: async (d: Dados) => {
      if (ehResposta) {
        const data = d.protocoladoEm as DataCivil
        await responderExigencia(
          atual.consultoriaId,
          respostaId,
          exigencia.id,
          {
            protocoladoEm: data,
            protocoladoEmTexto: formatarDataCivil(data),
            protocoloNumero: d.protocoloNumero,
            descricao: d.descricao,
          },
          arquivo,
          versaoId,
        )
        return
      }
      if (!arquivo) throw new Error('pdf_incompleto')
      await anexarAExigencia(
        atual.consultoriaId,
        respostaId,
        exigencia.id,
        d.descricao,
        arquivo,
        versaoId,
      )
    },
    onSuccess: aoSalvar,
  })

  function enviar(d: Dados) {
    let valido = true
    if (ehResposta) {
      if (!d.protocoladoEm) {
        setError('protocoladoEm', { message: 'Informe a data do protocolo' })
        valido = false
      } else if (d.protocoladoEm > exigencia.hoje) {
        setError('protocoladoEm', { message: 'A data do protocolo não pode estar no futuro' })
        valido = false
      } else if (d.protocoladoEm < exigencia.recebidoEm) {
        setError('protocoladoEm', { message: 'O protocolo não pode ser antes do recebimento' })
        valido = false
      }
      if (!d.protocoloNumero && !arquivo) {
        setError('protocoloNumero', { message: 'Informe o número do protocolo ou anexe o PDF' })
        valido = false
      }
    } else {
      if (!d.descricao) {
        setError('descricao', { message: 'Informe a descrição' })
        valido = false
      }
      if (!arquivo) {
        setErroDoPdf('Anexe o PDF')
        valido = false
      }
    }
    if (valido) salvar.mutate(d)
  }

  return (
    <Dialogo
      aberto
      aoMudar={(aberto) => {
        if (!aberto) aoFechar()
      }}
      titulo={TITULOS[tipo]}
      acoes={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" form={formulario} aparencia="primario" disabled={salvar.isPending}>
            {salvar.isPending ? 'Salvando…' : TITULOS[tipo]}
          </Botao>
        </>
      }
    >
      <form
        id={formulario}
        noValidate
        aria-label={TITULOS[tipo]}
        className="flex flex-col gap-(--e-3)"
        onSubmit={(evento) => void handleSubmit(enviar)(evento)}
      >
        {salvar.isError ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErro(salvar.error)}
          </MensagemSecao>
        ) : null}
        {ehResposta ? (
          <>
            <CampoData
              rotulo="Protocolado em *"
              hoje={exigencia.hoje}
              minimo={exigencia.recebidoEm}
              maximo={exigencia.hoje}
              motivoDoLimite="Entre o recebimento e hoje"
              valor={protocoladoEm}
              erro={errors.protocoladoEm?.message}
              aoMudar={(data) => {
                setValue('protocoladoEm', data, { shouldValidate: isSubmitted })
              }}
            />
            <CampoTexto
              rotulo="Número do protocolo"
              maxLength={60}
              erro={errors.protocoloNumero?.message}
              {...register('protocoloNumero')}
            />
          </>
        ) : null}
        <CampoTexto
          rotulo={ehResposta ? 'Descrição' : 'Descrição *'}
          maxLength={300}
          erro={errors.descricao?.message}
          {...register('descricao')}
        />
        <CampoPdf
          rotulo={ehResposta ? 'PDF do protocolo' : 'PDF *'}
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
