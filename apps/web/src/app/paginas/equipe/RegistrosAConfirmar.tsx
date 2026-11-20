import {
  hojeNoFuso,
  rotuloDaProfissao,
  rotuloDaSituacaoDoRegistro,
  situacaoDoRegistro,
} from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Carregando, EstadoErro } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import {
  confirmarRegistroProfissional,
  listarRegistrosAConfirmar,
  removerRegistroProfissional,
  type RegistroAConfirmar,
} from '@/lib/api/registros-profissionais'
import { mensagemDoErro } from '@/lib/erros'

import { detalheDoRegistro, TOM_DA_SITUACAO } from '../perfil/exibicao-do-registro'

/**
 * Registros profissionais informados pela equipe e ainda não confirmados (Gestão). Confirmar marca
 * o registro como conferido; recusar remove (fica no histórico). Nada atribui responsável.
 */
export function RegistrosAConfirmar() {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const hoje = hojeNoFuso(new Date(), atual.fuso)
  const queryClient = useQueryClient()

  const pendentes = useQuery({
    queryKey: ['registros-a-confirmar', cid],
    queryFn: () => listarRegistrosAConfirmar(cid),
  })

  async function atualizar(registro: RegistroAConfirmar) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['registros-a-confirmar', cid] }),
      queryClient.invalidateQueries({ queryKey: ['registros-do-membro', registro.membroId] }),
    ])
  }

  const confirmar = useMutation({
    mutationFn: (registro: RegistroAConfirmar) =>
      confirmarRegistroProfissional(registro.id, registro.rowVersion),
    onSuccess: (_, registro) => atualizar(registro),
  })
  const recusar = useMutation({
    mutationFn: (registro: RegistroAConfirmar) =>
      removerRegistroProfissional(registro.id, registro.rowVersion),
    onSuccess: (_, registro) => atualizar(registro),
  })
  const ocupado = confirmar.isPending || recusar.isPending
  const erro = confirmar.error ?? recusar.error

  return (
    <section aria-labelledby="titulo-registros" className="flex flex-col gap-(--space-100)">
      <div className="flex items-baseline gap-(--space-100)">
        <h2 id="titulo-registros" className="titulo-secao text-(--text)">
          Registros a confirmar
        </h2>
        {pendentes.isSuccess ? (
          <span className="text-xs text-(--text-subtle)">{pendentes.data.length}</span>
        ) : null}
      </div>
      {erro ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(erro)}
        </MensagemSecao>
      ) : null}
      {pendentes.isPending ? (
        <Carregando rotulo="Carregando registros" linhas={2} />
      ) : pendentes.isError ? (
        <EstadoErro aoTentarDeNovo={() => void pendentes.refetch()} />
      ) : pendentes.data.length === 0 ? (
        <p className="corpo text-(--text-subtle)">Nenhum registro aguardando confirmação.</p>
      ) : (
        <ul className="flex flex-col rounded-(--radius-large) border bg-(--surface) shadow-cartao">
          {pendentes.data.map((registro) => {
            const situacao = situacaoDoRegistro(registro, hoje)
            const descricao = `${rotuloDaProfissao(registro.profissao)} de ${registro.membroNome}`
            return (
              <li
                key={registro.id}
                className="flex flex-wrap items-center gap-(--space-150) border-b px-(--space-150) py-(--space-100) last:border-b-0"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="corpo-medio text-(--text)">{registro.membroNome}</span>
                  <span className="rotulo">
                    {rotuloDaProfissao(registro.profissao)} · {detalheDoRegistro(registro)}
                  </span>
                </div>
                <Selo tom={TOM_DA_SITUACAO[situacao]}>{rotuloDaSituacaoDoRegistro(situacao)}</Selo>
                <div className="flex gap-(--space-100)">
                  <Botao
                    tamanho="compacto"
                    disabled={ocupado}
                    aria-label={`Confirmar registro de ${descricao}`}
                    onClick={() => {
                      confirmar.mutate(registro)
                    }}
                  >
                    Confirmar
                  </Botao>
                  <Botao
                    tamanho="compacto"
                    aparencia="sutil"
                    disabled={ocupado}
                    aria-label={`Recusar registro de ${descricao}`}
                    onClick={() => {
                      recusar.mutate(registro)
                    }}
                  >
                    Recusar
                  </Botao>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
