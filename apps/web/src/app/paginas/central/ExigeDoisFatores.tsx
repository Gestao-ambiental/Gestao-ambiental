import { useQueryClient } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'

import { CadastroDoisFatores } from '@/app/dois-fatores/CadastroDoisFatores'
import { FormularioCodigo } from '@/app/dois-fatores/FormularioCodigo'
import { CHAVE_DOIS_FATORES, useDoisFatores } from '@/app/dois-fatores/estado'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro } from '@/components/estados'

const classeCartao =
  'flex max-w-xl flex-col gap-(--e-4) rounded-(--raio-painel) border bg-(--folha) p-(--e-4) sm:p-(--e-6)'

/**
 * A central exige dois fatores (ADR-0024). Sem fator cadastrado: cadastra o aplicativo
 * autenticador. Com fator e sessão só com senha (aal1): pede o código. Com aal2: segue. É só
 * apresentação: as RPCs da central recusam no banco quem não tem aal2.
 */
export function ExigeDoisFatores({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const estado = useDoisFatores()

  const liberar = () => {
    void queryClient.invalidateQueries({ queryKey: [CHAVE_DOIS_FATORES] })
    void queryClient.invalidateQueries({ queryKey: ['central'] })
  }

  if (estado.isPending) return <Carregando rotulo="Conferindo os dois fatores" linhas={3} />
  if (estado.isError) {
    return (
      <EstadoErro
        titulo="Não foi possível conferir os dois fatores."
        descricao="Verifique a conexão e tente de novo."
        aoTentarDeNovo={() => void estado.refetch()}
      />
    )
  }
  if (estado.data.sessaoConfirmada) return children

  if (estado.data.fatorId) {
    return (
      <Pagina titulo="Confirme o código">
        <div className={classeCartao}>
          <FormularioCodigo fatorId={estado.data.fatorId} aoConfirmar={liberar} />
        </div>
      </Pagina>
    )
  }

  return (
    <Pagina titulo="Ative os dois fatores">
      <div className={classeCartao}>
        <CadastroDoisFatores aoAtivar={liberar} />
      </div>
    </Pagina>
  )
}

/**
 * O banco pediu dois fatores numa tela da central que já passou pelo portão (ex.: o fator foi
 * removido em outra aba). Relê o estado ao aparecer: o portão volta a pedir o código ou o cadastro.
 */
export function RelerDoisFatores() {
  const queryClient = useQueryClient()
  const reler = () => {
    void queryClient.invalidateQueries({ queryKey: [CHAVE_DOIS_FATORES] })
    void queryClient.invalidateQueries({ queryKey: ['central'] })
  }
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: [CHAVE_DOIS_FATORES] })
  }, [queryClient])
  return (
    <EstadoErro
      titulo="Confirme o código do aplicativo autenticador para continuar."
      descricao={null}
      aoTentarDeNovo={reler}
    />
  )
}
