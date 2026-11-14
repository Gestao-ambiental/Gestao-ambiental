import { useMutation } from '@tanstack/react-query'

import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { iniciarCadastroDoisFatores } from '@/lib/api/dois-fatores'
import { mensagemDoErro } from '@/lib/erros'

import { FormularioCodigo } from './FormularioCodigo'

interface Props {
  /** Chamado depois que o primeiro código foi aceito: fator ativo e sessão aal2. */
  aoAtivar: () => void
  /** Se informado, mostra "Cancelar" depois que o QR code aparece (volta ao começo). */
  aoCancelar?: () => void
}

/**
 * Cadastro do aplicativo autenticador (TOTP): QR code, chave para digitar e o primeiro código.
 * O fator só é criado quando a pessoa pede ("Ativar dois fatores"), nunca ao abrir a tela.
 */
export function CadastroDoisFatores({ aoAtivar, aoCancelar }: Props) {
  const cadastro = useMutation({ mutationFn: iniciarCadastroDoisFatores })
  const novo = cadastro.data

  if (!novo) {
    return (
      <div className="flex flex-col gap-(--space-150)">
        {cadastro.error ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErro(cadastro.error)}
          </MensagemSecao>
        ) : null}
        <div className="flex flex-wrap items-center gap-(--space-100)">
          <Botao
            aparencia="primario"
            iconeAntes="lock"
            disabled={cadastro.isPending}
            onClick={() => {
              cadastro.mutate()
            }}
          >
            {cadastro.isPending ? 'Gerando QR code…' : 'Ativar dois fatores'}
          </Botao>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-(--space-200)">
      <div className="flex flex-col gap-(--space-150) sm:flex-row sm:items-start">
        {/* Fundo branco nos dois temas: o leitor do aplicativo precisa do contraste do QR code. */}
        <img
          src={novo.qrCode}
          alt="QR code para o aplicativo autenticador"
          width={176}
          height={176}
          className="size-44 shrink-0 rounded-(--radius) border bg-white p-(--space-100)"
        />
        <dl className="flex min-w-0 flex-col gap-(--space-025)">
          <dt className="rotulo">Chave</dt>
          <dd>
            <code className="corpo break-all text-(--text) select-all">{novo.segredo}</code>
          </dd>
        </dl>
      </div>
      <FormularioCodigo
        fatorId={novo.fatorId}
        rotuloBotao="Ativar"
        aoConfirmar={aoAtivar}
        secundario={
          aoCancelar ? (
            <Botao
              aparencia="sutil"
              onClick={() => {
                cadastro.reset()
                aoCancelar()
              }}
            >
              Cancelar
            </Botao>
          ) : undefined
        }
      />
    </div>
  )
}
