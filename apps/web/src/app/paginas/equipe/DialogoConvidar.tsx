import { VALIDADE_CONVITE_DIAS } from '@gestao-ambiental/domain'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { campoEmail } from '@/app/paginas/acesso/esquemas'
import { DESCRICAO_PAPEL } from '@/app/papeis'
import { Botao } from '@/components/ui/botao'
import { OpcaoRadio } from '@/components/ui/caixa-selecao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { criarConvite, enviarEmailDoConvite } from '@/lib/api/acesso'
import { mensagemDoErro } from '@/lib/erros'

const esquema = z.object({ email: campoEmail, papel: z.enum(['equipe', 'gestao']) })
type Dados = z.infer<typeof esquema>

export type ResultadoConvite =
  { tipo: 'enviado'; email: string } | { tipo: 'sem_email'; email: string; motivo: string }

/** Modal "Convidar pessoa" (Protótipo 07): e-mail e papel; o convite vale 7 dias. */
export function DialogoConvidar({
  aberto,
  aoMudar,
  consultoriaId,
  aoConvidar,
}: {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  consultoriaId: string
  aoConvidar: (resultado: ResultadoConvite) => void
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Dados>({
    resolver: zodResolver(esquema),
    defaultValues: { email: '', papel: 'equipe' },
  })

  const convite = useMutation({
    mutationFn: async ({ email, papel }: Dados): Promise<ResultadoConvite> => {
      const token = await criarConvite(consultoriaId, email, papel)
      try {
        await enviarEmailDoConvite(email, token)
        return { tipo: 'enviado', email }
      } catch (erro) {
        // O convite existe e vale; só o e-mail não saiu. "Reenviar" tenta de novo com token novo.
        return { tipo: 'sem_email', email, motivo: mensagemDoErro(erro) }
      }
    },
    onSuccess: (resultado) => {
      aoConvidar(resultado)
      reset()
      aoMudar(false)
    },
  })

  return (
    <Dialogo
      aberto={aberto}
      aoMudar={(valor) => {
        if (!valor) {
          reset()
          convite.reset()
        }
        aoMudar(valor)
      }}
      titulo="Convidar pessoa"
      acoes={
        <>
          <Botao
            onClick={() => {
              aoMudar(false)
            }}
          >
            Cancelar
          </Botao>
          <Botao
            type="submit"
            form="form-convidar"
            aparencia="primario"
            disabled={convite.isPending}
          >
            {convite.isPending ? 'Enviando…' : 'Enviar convite'}
          </Botao>
        </>
      }
    >
      <form
        id="form-convidar"
        noValidate
        onSubmit={(evento) =>
          void handleSubmit((dados) => {
            convite.mutate(dados)
          })(evento)
        }
        className="flex flex-col gap-(--space-200)"
      >
        {convite.isError ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErro(convite.error)}
          </MensagemSecao>
        ) : null}
        <CampoTexto
          rotulo="E-mail"
          type="email"
          autoComplete="off"
          ajuda={`O convite vale por ${String(VALIDADE_CONVITE_DIAS)} dias.`}
          erro={errors.email?.message}
          {...register('email')}
        />
        <fieldset className="flex flex-col gap-(--space-100)">
          <legend className="mb-(--space-050) rotulo">Papel</legend>
          <OpcaoRadio
            rotulo="Equipe"
            descricao={DESCRICAO_PAPEL.equipe}
            value="equipe"
            {...register('papel')}
          />
          <OpcaoRadio
            rotulo="Gestão"
            descricao={DESCRICAO_PAPEL.gestao}
            value="gestao"
            {...register('papel')}
          />
        </fieldset>
      </form>
    </Dialogo>
  )
}
