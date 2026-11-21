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

  // Nada a confirmar: a seção some, como os convites pendentes.
  if (pendentes.isSuccess && pendentes.data.length === 0 && !erro) return null

  return (
    <section aria-labelledby="titulo-registros" className="flex flex-col gap-(--e-3)">
      <div className="flex items-center gap-(--e-2)">
        <h2 id="titulo-registros" className="titulo-secao text-(--tinta)">
          Registros a confirmar
        </h2>
        {pendentes.isSuccess ? (
          <span className="min-w-6 rounded-(--raio-mini) bg-(--aperto) px-(--e-1) text-center text-xs font-semibold text-(--tinta-2) numero">
            {pendentes.data.length}
          </span>
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
      ) : pendentes.data.length === 0 ? null : (
        <ul className="flex flex-col overflow-hidden rounded-(--raio-painel) border bg-(--folha)">
          {pendentes.data.map((registro) => {
            const situacao = situacaoDoRegistro(registro, hoje)
            const descricao = `${rotuloDaProfissao(registro.profissao)} de ${registro.membroNome}`
            return (
              <li
                key={registro.id}
                className="flex min-h-(--linha) flex-wrap items-center gap-x-(--e-3) gap-y-(--e-2) border-b border-(--regra-leve) px-(--e-4) py-(--e-2) last:border-b-0"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate corpo-medio text-(--tinta)">{registro.membroNome}</span>
                  <span className="rotulo numero">
                    {rotuloDaProfissao(registro.profissao)} · {detalheDoRegistro(registro)}
                  </span>
                </div>
                <Selo tom={TOM_DA_SITUACAO[situacao]}>{rotuloDaSituacaoDoRegistro(situacao)}</Selo>
                <div className="flex gap-(--e-1)">
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
