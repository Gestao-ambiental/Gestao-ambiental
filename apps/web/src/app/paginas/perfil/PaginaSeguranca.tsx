import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { CadastroDoisFatores } from '@/app/dois-fatores/CadastroDoisFatores'
import { FormularioCodigo } from '@/app/dois-fatores/FormularioCodigo'
import { CHAVE_DOIS_FATORES, useDoisFatores } from '@/app/dois-fatores/estado'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import { removerDoisFatores, type EstadoDoisFatores } from '@/lib/api/dois-fatores'
import { mensagemDoErro } from '@/lib/erros'

type Modo = 'ver' | 'remover'

function Remover({
  estado,
  aoRemover,
  aoCancelar,
}: {
  estado: EstadoDoisFatores & { fatorId: string }
  aoRemover: () => void
  aoCancelar: () => void
}) {
  const remover = useMutation({
    mutationFn: () => removerDoisFatores(estado.fatorId),
    onSuccess: aoRemover,
  })
  const cancelar = (
    <Botao aparencia="sutil" disabled={remover.isPending} onClick={aoCancelar}>
      Cancelar
    </Botao>
  )
  const erro = remover.error ? (
    <MensagemSecao role="alert" tom="perigo">
      {mensagemDoErro(remover.error)}
    </MensagemSecao>
  ) : null

  // O Auth só remove o fator numa sessão que confirmou o código (aal2).
  if (!estado.sessaoConfirmada) {
    return (
      <div className="flex flex-col gap-(--space-150)">
        {erro}
        <FormularioCodigo
          fatorId={estado.fatorId}
          rotuloBotao="Confirmar e remover"
          aoConfirmar={() => {
            remover.mutate()
          }}
          secundario={cancelar}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-(--space-150)">
      {erro}
      <div className="flex flex-wrap items-center gap-(--space-100)">
        <Botao
          aparencia="perigo"
          disabled={remover.isPending}
          onClick={() => {
            remover.mutate()
          }}
        >
          {remover.isPending ? 'Removendo…' : 'Remover dois fatores'}
        </Botao>
        {cancelar}
      </div>
    </div>
  )
}

/**
 * /seguranca (ADR-0024): dois fatores da conta (aplicativo autenticador). Opcional fora da central
 * administrativa, obrigatório para operar a central. Ativar: QR code, chave e o primeiro código.
 * Remover: exige a sessão confirmada com o código.
 */
export function PaginaSeguranca() {
  const queryClient = useQueryClient()
  const estado = useDoisFatores()
  const [modo, setModo] = useState<Modo>('ver')
  const [aviso, setAviso] = useState<string | null>(null)

  const concluir = (texto: string) => {
    setModo('ver')
    setAviso(texto)
    void queryClient.invalidateQueries({ queryKey: [CHAVE_DOIS_FATORES] })
  }

  let conteudo
  if (estado.isPending) {
    conteudo = <Carregando rotulo="Carregando a segurança da conta" linhas={2} />
  } else if (estado.isError) {
    conteudo = (
      <EstadoErro
        titulo="Não foi possível carregar os dois fatores."
        descricao="Verifique a conexão e tente de novo."
        aoTentarDeNovo={() => void estado.refetch()}
      />
    )
  } else {
    const { fatorId } = estado.data
    const iniciar = (proximo: Modo) => () => {
      setAviso(null)
      setModo(proximo)
    }
    conteudo = (
      <div className="flex flex-col gap-(--space-150)">
        <div className="flex flex-wrap items-center gap-(--space-100)">
          <span className="corpo text-(--text)">Situação</span>
          {fatorId ? <Selo tom="sucesso">Ativados</Selo> : <Selo>Desativados</Selo>}
        </div>
        {aviso ? (
          <MensagemSecao role="status" tom="sucesso">
            {aviso}
          </MensagemSecao>
        ) : null}
        {fatorId === null ? (
          <CadastroDoisFatores
            aoAtivar={() => {
              concluir('Dois fatores ativados.')
            }}
            aoCancelar={() => {
              setAviso(null)
            }}
          />
        ) : null}
        {fatorId !== null && modo !== 'remover' ? (
          <Botao className="self-start" onClick={iniciar('remover')}>
            Remover dois fatores
          </Botao>
        ) : null}
        {fatorId !== null && modo === 'remover' ? (
          <Remover
            estado={{ ...estado.data, fatorId }}
            aoRemover={() => {
              concluir('Dois fatores removidos.')
            }}
            aoCancelar={iniciar('ver')}
          />
        ) : null}
      </div>
    )
  }

  return (
    <Pagina titulo="Segurança">
      <section
        aria-labelledby="titulo-dois-fatores"
        className="flex max-w-2xl flex-col gap-(--space-150)"
      >
        <h2 id="titulo-dois-fatores" className="titulo-secao">
          Dois fatores
        </h2>
        {conteudo}
      </section>
    </Pagina>
  )
}
