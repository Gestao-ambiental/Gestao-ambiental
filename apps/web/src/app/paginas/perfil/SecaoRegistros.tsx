import {
  CONSELHOS,
  conselhoSugerido,
  hojeNoFuso,
  profissoesComRegistro,
  rotuloDaProfissaoDaPessoa,
  rotuloDaSituacaoDoRegistro,
  situacaoDoRegistro,
  UFS,
  type CodigoConselho,
  type CodigoProfissao,
  type DataCivil,
} from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Carregando, EstadoErro } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { CampoData } from '@/components/ui/campo-data'
import { CampoTexto } from '@/components/ui/campo-texto'
import { ConfirmacaoSalva } from '@/components/ui/confirmacao-salva'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { classeCampo } from '@/components/ui/estilos-campo'
import { Selo } from '@/components/ui/selo'
import type { MembroAtivo } from '@/lib/api/perfil'
import {
  declararRegistroProfissional,
  definirCadastroFederal,
  listarRegistrosDoMembro,
  removerRegistroProfissional,
  type RegistroProfissional,
} from '@/lib/api/registros-profissionais'
import { mensagemDoErro } from '@/lib/erros'

import { detalheDoRegistro, TOM_DA_SITUACAO } from './exibicao-do-registro'

/**
 * Registro no conselho de cada profissão concluída da pessoa (ADR-0021). A pessoa informa; a
 * Gestão confirma na Equipe. Escolher uma profissão que já tem registro carrega o que está salvo.
 */
export function SecaoRegistros({ perfil }: { perfil: MembroAtivo }) {
  const { atual } = useConsultoria()
  const hoje = hojeNoFuso(new Date(), atual.fuso)
  const queryClient = useQueryClient()
  const id = useId()
  const [profissao, setProfissao] = useState<CodigoProfissao | ''>('')
  const [conselho, setConselho] = useState<CodigoConselho | ''>('')
  const [numero, setNumero] = useState('')
  const [uf, setUf] = useState('')
  const [validoAte, setValidoAte] = useState<DataCivil | null>(null)
  const [falta, setFalta] = useState<'profissao' | 'conselho' | 'numero' | null>(null)
  const [registroSalvo, setRegistroSalvo] = useState(false)

  const elegiveis = profissoesComRegistro(perfil)
  const registros = useQuery({
    queryKey: ['registros-do-membro', perfil.id],
    queryFn: () => listarRegistrosDoMembro(perfil.id),
  })

  async function atualizar() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['registros-do-membro', perfil.id] }),
      queryClient.invalidateQueries({ queryKey: ['registros-a-confirmar', atual.consultoriaId] }),
    ])
  }

  function limpar() {
    setProfissao('')
    setConselho('')
    setNumero('')
    setUf('')
    setValidoAte(null)
    setFalta(null)
  }

  function escolherProfissao(codigo: CodigoProfissao | '') {
    setProfissao(codigo)
    setRegistroSalvo(false)
    setFalta(null)
    const salvo = registros.data?.find((r) => r.profissao === codigo)
    setConselho(salvo?.conselho ?? (codigo ? (conselhoSugerido(codigo) ?? '') : ''))
    setNumero(salvo?.numero ?? '')
    setUf(salvo?.uf ?? '')
    setValidoAte(salvo?.validoAte ?? null)
  }

  const salvar = useMutation({
    mutationFn: (dados: { profissao: CodigoProfissao; conselho: CodigoConselho }) =>
      declararRegistroProfissional({
        membroId: perfil.id,
        profissao: dados.profissao,
        conselho: dados.conselho,
        numero,
        uf: uf || null,
        validoAte,
      }),
    onSuccess: async () => {
      limpar()
      setRegistroSalvo(true)
      await atualizar()
    },
  })
  const remover = useMutation({
    mutationFn: (registro: RegistroProfissional) =>
      removerRegistroProfissional(registro.id, registro.rowVersion),
    onSuccess: atualizar,
  })
  const erro = salvar.error ?? remover.error

  function nomeDaProfissao(codigo: CodigoProfissao) {
    return rotuloDaProfissaoDaPessoa(codigo, perfil.genero)
  }

  // Sem registro salvo e sem profissão concluída (formação em curso), não há o que mostrar.
  if (registros.isSuccess && registros.data.length === 0 && elegiveis.length === 0) return null

  return (
    <section
      aria-labelledby="titulo-registros"
      className="flex flex-col gap-(--e-3) border-t pt-(--e-6)"
    >
      <h2 id="titulo-registros" className="titulo-secao text-(--tinta)">
        Registro profissional
      </h2>

      {registros.isPending ? (
        <Carregando rotulo="Carregando registros" linhas={2} />
      ) : registros.isError ? (
        <EstadoErro aoTentarDeNovo={() => void registros.refetch()} />
      ) : registros.data.length === 0 ? null : (
        <ul className="flex flex-col overflow-hidden rounded-(--raio-painel) border bg-(--folha)">
          {registros.data.map((registro) => {
            const situacao = situacaoDoRegistro(registro, hoje)
            return (
              <li
                key={registro.id}
                className="flex min-h-(--linha) items-center gap-(--e-3) border-b border-(--regra-leve) py-(--e-2) pr-(--e-2) pl-(--e-4) last:border-b-0"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate corpo-medio text-(--tinta)">
                    {nomeDaProfissao(registro.profissao)}
                  </span>
                  <span className="rotulo numero">{detalheDoRegistro(registro)}</span>
                </div>
                <Selo tom={TOM_DA_SITUACAO[situacao]}>{rotuloDaSituacaoDoRegistro(situacao)}</Selo>
                <BotaoIcone
                  icone="trash-2"
                  rotulo={`Remover registro de ${nomeDaProfissao(registro.profissao)}`}
                  disabled={remover.isPending}
                  onClick={() => {
                    remover.mutate(registro)
                  }}
                />
              </li>
            )
          })}
        </ul>
      )}

      {erro ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(erro)}
        </MensagemSecao>
      ) : null}

      {elegiveis.length === 0 ? null : (
        <form
          className="grid grid-cols-1 gap-(--e-3) sm:grid-cols-2"
          noValidate
          onSubmit={(evento) => {
            evento.preventDefault()
            if (!profissao) {
              setFalta('profissao')
            } else if (!conselho) {
              setFalta('conselho')
            } else if (!numero.trim()) {
              setFalta('numero')
            } else {
              salvar.mutate({ profissao, conselho })
            }
          }}
        >
          <div className="flex flex-col gap-(--e-1)">
            <label
              htmlFor={`${id}-profissao`}
              className="flex min-h-5 items-center rotulo text-(--tinta)"
            >
              Profissão do registro
            </label>
            <select
              id={`${id}-profissao`}
              className={classeCampo}
              value={profissao}
              aria-invalid={falta === 'profissao' ? true : undefined}
              aria-describedby={falta === 'profissao' ? `${id}-profissao-erro` : undefined}
              onChange={(evento) => {
                escolherProfissao(evento.target.value as CodigoProfissao | '')
              }}
            >
              <option value="">Escolha a profissão</option>
              {elegiveis.map((codigo) => (
                <option key={codigo} value={codigo}>
                  {nomeDaProfissao(codigo)}
                </option>
              ))}
            </select>
            {falta === 'profissao' ? (
              <span
                id={`${id}-profissao-erro`}
                className="text-xs font-[650] text-(--atraso-texto)"
              >
                Escolha a profissão
              </span>
            ) : null}
          </div>
          <div className="flex flex-col gap-(--e-1)">
            <label
              htmlFor={`${id}-conselho`}
              className="flex min-h-5 items-center rotulo text-(--tinta)"
            >
              Conselho
            </label>
            <select
              id={`${id}-conselho`}
              className={classeCampo}
              value={conselho}
              aria-invalid={falta === 'conselho' ? true : undefined}
              aria-describedby={falta === 'conselho' ? `${id}-conselho-erro` : undefined}
              onChange={(evento) => {
                setConselho(evento.target.value as CodigoConselho | '')
                setFalta(null)
              }}
            >
              <option value="">Escolha o conselho</option>
              {CONSELHOS.map((item) => (
                <option key={item.codigo} value={item.codigo}>
                  {item.rotulo}
                </option>
              ))}
            </select>
            {falta === 'conselho' ? (
              <span id={`${id}-conselho-erro`} className="text-xs font-[650] text-(--atraso-texto)">
                Escolha o conselho
              </span>
            ) : null}
          </div>
          <CampoTexto
            rotulo="Número do registro"
            value={numero}
            maxLength={30}
            erro={falta === 'numero' ? 'Informe o número do registro' : undefined}
            onChange={(evento) => {
              setNumero(evento.target.value)
              setFalta(null)
            }}
          />
          <div className="flex flex-col gap-(--e-1)">
            <label htmlFor={`${id}-uf`} className="flex min-h-5 items-center rotulo text-(--tinta)">
              UF do registro
            </label>
            <select
              id={`${id}-uf`}
              className={classeCampo}
              value={uf}
              onChange={(evento) => {
                setUf(evento.target.value)
              }}
            >
              <option value="">Sem UF</option>
              {UFS.map((sigla) => (
                <option key={sigla} value={sigla}>
                  {sigla}
                </option>
              ))}
            </select>
          </div>
          <CampoData
            rotulo="Registro válido até"
            valor={validoAte}
            hoje={hoje}
            aoMudar={setValidoAte}
          />
          {/* Regra 1.3 do padrão de botões: sem profissão escolhida não há o que salvar, então o
          botão não aparece; logo depois de salvar, fica a confirmação. */}
          <div className="flex items-end empty:hidden">
            <BarraDeSalvar
              mudou={Boolean(profissao)}
              salvando={salvar.isPending}
              salvo={registroSalvo}
              rotulo="Salvar registro"
              confirmacao="Registro salvo."
            />
          </div>
        </form>
      )}
    </section>
  )
}

/** Cadastro Técnico Federal do Ibama: número (só dígitos) e validade. */
export function SecaoCadastroFederal({ perfil }: { perfil: MembroAtivo }) {
  const { atual } = useConsultoria()
  const hoje = hojeNoFuso(new Date(), atual.fuso)
  const queryClient = useQueryClient()
  const [numero, setNumero] = useState(perfil.ctfNumero ?? '')
  const [validoAte, setValidoAte] = useState<DataCivil | null>(perfil.ctfValidoAte)
  const [salvo, setSalvo] = useState(false)

  const salvar = useMutation({
    mutationFn: () => definirCadastroFederal(perfil.id, numero, validoAte),
    onSuccess: async () => {
      setSalvo(true)
      await queryClient.invalidateQueries({ queryKey: ['meu-perfil', atual.membroId] })
    },
  })
  const mudou = numero.trim() !== (perfil.ctfNumero ?? '') || validoAte !== perfil.ctfValidoAte

  return (
    <section aria-labelledby="titulo-ctf" className="flex flex-col gap-(--e-3) border-t pt-(--e-6)">
      <h2 id="titulo-ctf" className="titulo-secao text-(--tinta)">
        Cadastro Técnico Federal
      </h2>
      <form
        className="grid grid-cols-1 gap-(--e-3) sm:grid-cols-2"
        onSubmit={(evento) => {
          evento.preventDefault()
          if (mudou) salvar.mutate()
        }}
      >
        <CampoTexto
          rotulo="Número no cadastro"
          inputMode="numeric"
          value={numero}
          maxLength={20}
          erro={salvar.error ? mensagemDoErro(salvar.error) : undefined}
          onChange={(evento) => {
            setNumero(evento.target.value)
            setSalvo(false)
          }}
        />
        <CampoData
          rotulo="Cadastro válido até"
          valor={validoAte}
          hoje={hoje}
          aoMudar={(data) => {
            setValidoAte(data)
            setSalvo(false)
          }}
        />
        <div className="empty:hidden sm:col-span-2">
          <BarraDeSalvar
            mudou={mudou}
            salvando={salvar.isPending}
            salvo={salvo}
            rotulo="Salvar cadastro"
            confirmacao="Cadastro salvo."
          />
        </div>
      </form>
    </section>
  )
}

/**
 * Rodapé de uma seção que salva sozinha. Um primário por vez (docs/design-system/botoes-e-campos.md,
 * regra 1.3): sem alteração, não há botão verde apagado; aparece só a confirmação, logo depois de
 * salvar, ou nada. Com alteração, o Salvar volta como primário.
 */
export function BarraDeSalvar({
  mudou,
  salvando,
  salvo,
  rotulo,
  confirmacao,
}: {
  mudou: boolean
  salvando: boolean
  salvo: boolean
  rotulo: string
  confirmacao: string
}) {
  if (mudou || salvando) {
    return (
      <div className="flex items-center gap-(--e-3)">
        <Botao
          type="submit"
          aparencia="primario"
          disabled={salvando}
          aria-busy={salvando || undefined}
        >
          {salvando ? 'Salvando…' : rotulo}
        </Botao>
      </div>
    )
  }
  if (!salvo) return null
  return (
    <div className="flex items-center gap-(--e-3)">
      <ConfirmacaoSalva>{confirmacao}</ConfirmacaoSalva>
    </div>
  )
}
