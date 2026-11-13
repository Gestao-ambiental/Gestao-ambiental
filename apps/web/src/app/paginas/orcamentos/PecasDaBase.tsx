// Peças da base de custos usadas em Custos e taxas e nos primeiros passos (ADR-0020): os mesmos
// campos, rótulos e regras nas duas telas.

import {
  FORMAS_DE_RECEBIMENTO,
  formatarCentavos,
  formatarReais,
  lerDuracao,
  MAXIMO_DE_FAIXAS,
  PROFISSOES,
  rotuloDaProfissao,
  resumoDaPessoa,
  UNIDADES_COM_FAIXAS,
  UNIDADES_DE_COBRANCA,
  type CodigoProfissao,
  type ComposicaoDaEquipe,
  type FormaDeRecebimento,
  type UnidadeDeCobranca,
} from '@gestao-ambiental/domain'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Fragment, type ReactNode } from 'react'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { SelecaoDaLista } from '@/components/selecao-da-lista'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import type { CustoDaProfissao } from '@/lib/api/orcamentos'
import { definirProfissaoECargo, type MembroAtivo } from '@/lib/api/perfil'
import { mensagemDoErro } from '@/lib/erros'

import { lerEstimativa, lerReaisOuZero, textoDasHoras } from './calculo'
import {
  contaDaHoraDeCusto,
  faixasIniciais,
  FONTE_ACEAMB,
  HORAS_ACEAMB_2026,
  lerInteiroOuNulo,
  lerReaisOuNulo,
  remuneracaoDaLinha,
  ROTULO_DA_FORMA,
  usaFaixas,
  type LinhaConta,
  type LinhaFaixa,
  type LinhaHora,
  type LinhaPessoa,
} from './campos-da-base'
import {
  ROTULO_DA_UNIDADE,
  SUFIXO_DA_UNIDADE,
  classeCabecalho,
  classeCampo,
  classeCelula,
  lerQuantidade,
  reaisDigitados,
} from './comum'

// ---------------------------------------------------------------------------
// Composição pela equipe
// ---------------------------------------------------------------------------

/**
 * Profissão principal da pessoa, escolhida na linha da equipe. Grava no cadastro (membro) na hora,
 * como na Equipe: não faz parte do rascunho. Cargo e outras formações ficam como estão.
 */
function ProfissaoDaPessoa({
  membro,
  profissaoAntiga,
  rotulo,
}: {
  membro: MembroAtivo
  profissaoAntiga: string | null
  rotulo: string
}) {
  const { atual } = useConsultoria()
  const queryClient = useQueryClient()
  const salvar = useMutation({
    mutationFn: (codigo: CodigoProfissao | '') =>
      definirProfissaoECargo(
        membro.id,
        codigo || null,
        membro.cargoCodigo,
        codigo ? undefined : [],
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['membros-ativos', atual.consultoriaId] }),
  })
  const idErro = `erro-profissao-${membro.id}`
  return (
    <div className="flex flex-col gap-(--space-050)">
      <SelecaoDaLista
        aria-label={rotulo}
        lista={PROFISSOES}
        valor={membro.profissao ?? ''}
        valorAntigo={membro.profissao ? null : profissaoAntiga}
        vazio="Não informada"
        disabled={salvar.isPending}
        aria-busy={salvar.isPending || undefined}
        aria-describedby={salvar.isError ? idErro : undefined}
        className={classeCampo}
        aoMudar={(codigo) => {
          salvar.mutate(codigo)
        }}
      />
      {salvar.isError ? (
        <span id={idErro} role="alert" className="text-xs text-(--text-danger)">
          {mensagemDoErro(salvar.error)}
        </span>
      ) : null}
    </div>
  )
}

export function Equipe({
  linhas,
  membros,
  membrosCarregando,
  custoPorProfissao,
  previa,
  aoMudar,
  aoAdicionar,
  aoRemover,
  aoVoltar,
}: {
  linhas: LinhaPessoa[]
  membros: readonly MembroAtivo[]
  membrosCarregando: boolean
  custoPorProfissao: readonly CustoDaProfissao[]
  previa: ComposicaoDaEquipe | null
  aoMudar: (id: string, alterar: (p: LinhaPessoa) => LinhaPessoa) => void
  aoAdicionar: () => void
  aoRemover: (id: string) => void
  aoVoltar: () => void
}) {
  return (
    <div className="flex flex-col gap-(--space-150)">
      {/* relative: textos sr-only (absolutos) ficam presos à área que rola, não à página. */}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse corpo">
          <thead>
            <tr>
              <th scope="col" className={classeCabecalho}>
                Pessoa
              </th>
              <th scope="col" className={`${classeCabecalho} w-44`}>
                Profissão
              </th>
              <th scope="col" className={`${classeCabecalho} w-44`}>
                Como recebe
              </th>
              <th scope="col" className={`${classeCabecalho} w-40 text-right`}>
                Custo (R$)
              </th>
              <th scope="col" className={`${classeCabecalho} w-36 text-right`}>
                Horas
              </th>
              <th scope="col" className={`${classeCabecalho} w-28 text-right`}>
                Hora de custo
              </th>
              <th scope="col" className={`${classeCabecalho} w-12`}>
                <span className="sr-only">Remover</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((p, indice) => {
              const n = String(indice + 1)
              const lida = remuneracaoDaLinha(p)
              const resumo = typeof lida === 'string' ? null : resumoDaPessoa(lida)
              // Cada membro uma vez: os já escolhidos em outras linhas saem da lista.
              const escolhidos = new Set(linhas.filter((x) => x.id !== p.id).map((x) => x.membroId))
              const opcoes = membros.filter((m) => !escolhidos.has(m.id))
              const membroSumiu = p.membroId !== '' && !membros.some((m) => m.id === p.membroId)
              const membroDaLinha = membros.find((m) => m.id === p.membroId) ?? null
              const numero = (
                rotulo: string,
                chave:
                  | 'custo'
                  | 'horas'
                  | 'diaria'
                  | 'horasDiaria'
                  | 'dias'
                  | 'projeto'
                  | 'horasProjeto',
                opcoesDoCampo: {
                  reais?: boolean
                  placeholder?: string
                  legenda?: string
                  /** Aviso ligado ao campo (ex.: capacidade não calculada). */
                  aviso?: string | null
                },
              ) => {
                const valor = p[chave]
                const invalido = opcoesDoCampo.reais
                  ? lerReaisOuNulo(valor) === undefined
                  : lerInteiroOuNulo(valor) === undefined
                const idAviso = `aviso-${chave}-${p.id}`
                const campoDaPessoa = (
                  <label className="flex items-center justify-end gap-(--space-050)">
                    <input
                      aria-label={`${rotulo} da linha ${n}`}
                      aria-describedby={opcoesDoCampo.aviso ? idAviso : undefined}
                      inputMode={opcoesDoCampo.reais ? 'decimal' : 'numeric'}
                      placeholder={opcoesDoCampo.placeholder}
                      aria-invalid={invalido || undefined}
                      className={`${classeCampo} text-right tabular-nums`}
                      value={valor}
                      onChange={(e) => {
                        const novo = opcoesDoCampo.reais ? reaisDigitados(e) : e.target.value
                        aoMudar(p.id, (x) => ({ ...x, [chave]: novo }))
                      }}
                    />
                    {opcoesDoCampo.legenda ? (
                      <span className="w-14 shrink-0 text-xs text-(--text-subtle)">
                        {opcoesDoCampo.legenda}
                      </span>
                    ) : null}
                  </label>
                )
                // Estrutura sempre igual: o campo não é recriado quando o aviso aparece ou some
                // (senão a digitação se perde no meio). O aviso não é erro.
                return (
                  <div className="flex flex-col items-end gap-(--space-050)">
                    {campoDaPessoa}
                    {opcoesDoCampo.aviso ? (
                      <span
                        id={idAviso}
                        className="max-w-56 text-right text-xs text-(--text-subtle)"
                      >
                        {opcoesDoCampo.aviso}
                      </span>
                    ) : null}
                  </div>
                )
              }
              let custo: ReactNode
              let horas: ReactNode
              if (p.forma === 'diaria') {
                custo = numero('Custo por diária', 'diaria', { reais: true, legenda: 'diária' })
                horas = (
                  <div className="flex flex-col gap-(--space-050)">
                    {numero('Horas por diária', 'horasDiaria', { legenda: 'h/diária' })}
                    {numero('Dias no mês', 'dias', {
                      placeholder: 'Opcional',
                      legenda: 'dias/mês',
                    })}
                  </div>
                )
              } else if (p.forma === 'projeto') {
                custo = numero('Custo do projeto', 'projeto', { reais: true, legenda: 'projeto' })
                horas = (
                  <div className="flex flex-col gap-(--space-050)">
                    {numero('Horas do projeto', 'horasProjeto', { legenda: 'h/projeto' })}
                    {numero('Horas no mês', 'horas', {
                      placeholder: 'Opcional',
                      legenda: 'h/mês',
                    })}
                  </div>
                )
              } else {
                custo = numero('Custo mensal', 'custo', { reais: true, legenda: 'mês' })
                horas = numero('Horas no mês', 'horas', {
                  placeholder: '173',
                  legenda: 'h/mês',
                })
              }
              return (
                <tr key={p.id} className="align-top">
                  <td className={classeCelula}>
                    <select
                      aria-label={`Pessoa da linha ${n}`}
                      className={classeCampo}
                      value={p.membroId}
                      aria-invalid={p.membroId === '' || membroSumiu || undefined}
                      aria-busy={membrosCarregando || undefined}
                      onChange={(e) => {
                        const valor = e.target.value
                        aoMudar(p.id, (x) => ({ ...x, membroId: valor }))
                      }}
                    >
                      <option value="">{membrosCarregando ? 'Carregando…' : 'Escolha'}</option>
                      {membroSumiu ? <option value={p.membroId}>Membro desligado</option> : null}
                      {opcoes.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nome}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={classeCelula}>
                    {/* Profissão principal do cadastro da pessoa, gravada na hora (ADR-0021). */}
                    {membroDaLinha ? (
                      <ProfissaoDaPessoa
                        membro={membroDaLinha}
                        profissaoAntiga={p.profissao.trim() || null}
                        rotulo={`Profissão da linha ${n}`}
                      />
                    ) : (
                      <span className="flex min-h-(--size-control) items-center">
                        {p.profissao.trim() ? `${p.profissao.trim()} (antigo)` : '—'}
                      </span>
                    )}
                  </td>
                  <td className={classeCelula}>
                    <select
                      aria-label={`Como recebe na linha ${n}`}
                      className={classeCampo}
                      value={p.forma}
                      aria-invalid={p.forma === '' || undefined}
                      aria-describedby={p.forma === '' ? `forma-pendente-${n}` : undefined}
                      onChange={(e) => {
                        const valor = e.target.value as FormaDeRecebimento | ''
                        aoMudar(p.id, (x) => ({ ...x, forma: valor }))
                      }}
                    >
                      {p.forma === '' ? <option value="">Ainda não informado</option> : null}
                      {FORMAS_DE_RECEBIMENTO.map((f) => (
                        <option key={f} value={f}>
                          {ROTULO_DA_FORMA[f]}
                        </option>
                      ))}
                    </select>
                    {p.forma === '' ? (
                      <span
                        id={`forma-pendente-${n}`}
                        className="mt-(--space-025) block text-xs text-(--text-subtle)"
                      >
                        Confirme como esta pessoa recebe
                      </span>
                    ) : null}
                  </td>
                  <td className={classeCelula}>{custo}</td>
                  <td className={classeCelula}>{horas}</td>
                  <td className={`${classeCelula} text-right tabular-nums text-(--text-subtle)`}>
                    {resumo?.horaDeCustoCentavos == null
                      ? '—'
                      : formatarCentavos(resumo.horaDeCustoCentavos)}{' '}
                    <span className="sr-only">por hora, na linha {n}</span>
                    {resumo?.horaDeCustoCentavos != null && typeof lida !== 'string' ? (
                      <details className="mt-(--space-025) text-left text-xs">
                        <summary className="cursor-pointer">
                          Ver cálculo <span className="sr-only">da hora de custo da linha {n}</span>
                        </summary>
                        <span className="mt-(--space-025) block max-w-48">
                          {contaDaHoraDeCusto(lida, resumo.horaDeCustoCentavos)}
                        </span>
                      </details>
                    ) : null}
                  </td>
                  <td className={classeCelula}>
                    <BotaoIcone
                      icone="trash-2"
                      rotulo={`Remover linha ${n} da equipe`}
                      onClick={() => {
                        aoRemover(p.id)
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-(--space-100)">
        <Botao aparencia="link" iconeAntes="plus" onClick={aoAdicionar}>
          Adicionar pessoa
        </Botao>
        <Botao aparencia="link" onClick={aoVoltar}>
          Digitar o custo da hora e as horas
        </Botao>
      </div>
      <dl
        aria-label="Resultado da equipe"
        className="grid max-w-3xl gap-(--space-100) sm:grid-cols-2 lg:grid-cols-3"
      >
        <CartaoDoResultado
          rotulo="Custo médio por hora da equipe"
          valor={
            previa?.horaTecnicaCentavos == null
              ? 'pendente'
              : formatarReais(previa.horaTecnicaCentavos)
          }
        />
        <CartaoDoResultado
          rotulo="Horas da equipe por mês"
          valor={previa ? `${textoDasHoras(previa.horasFaturaveisMes)} h` : 'pendente'}
        />
        {custoPorProfissao.map((c) => (
          <CartaoDoResultado
            key={c.profissao}
            rotulo={`Custo por hora de ${c.profissao}`}
            valor={formatarReais(c.horaTecnicaCentavos)}
          />
        ))}
      </dl>
    </div>
  )
}

/** Um número do resultado da equipe, em cartão (rótulo em cima, valor grande embaixo). */
export function CartaoDoResultado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex flex-col gap-(--space-025) rounded-(--radius) border p-(--space-150)">
      <dt className="text-xs text-(--text-subtle)">{rotulo}</dt>
      <dd className="titulo-secao tabular-nums text-(--text)">{valor}</dd>
    </div>
  )
}

export function Grupo({
  id,
  titulo,
  children,
}: {
  /** Âncora para a lista "Falta configurar". */
  id?: string
  titulo: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      aria-label={titulo}
      className="flex scroll-mt-(--space-200) flex-col gap-(--space-150) border-b p-(--space-200) last:border-b-0"
    >
      <h2 className="titulo-secao text-(--text)">{titulo}</h2>
      {children}
    </section>
  )
}

export function Linha({
  id,
  rotulo,
  apoio,
  children,
}: {
  id: string
  rotulo: string
  apoio?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid items-center gap-(--space-100) sm:grid-cols-[260px_160px_1fr]">
      <label htmlFor={id} className="corpo text-(--text)">
        {rotulo}
      </label>
      {children}
      {apoio ? <span className="text-xs text-(--text-subtle)">{apoio}</span> : <span />}
    </div>
  )
}

export function ContasDoMes({
  linhas,
  total,
  aoMudar,
  aoAdicionar,
  aoSugerir,
  aoRemover,
  children,
}: {
  linhas: readonly LinhaConta[]
  total: number
  aoMudar: (id: string, alterar: (l: LinhaConta) => LinhaConta) => void
  aoAdicionar: (descricao: string) => void
  aoSugerir: () => void
  aoRemover: (id: string) => void
  /** Campo do total, mostrado enquanto não há contas detalhadas. */
  children: React.ReactNode
}) {
  if (linhas.length === 0) {
    return (
      <>
        {children}
        <div className="flex flex-wrap gap-(--space-100)">
          <Botao aparencia="link" iconeAntes="list" onClick={aoSugerir}>
            Detalhar contas do mês
          </Botao>
        </div>
      </>
    )
  }
  return (
    <section aria-label="Contas do mês" className="flex flex-col gap-(--space-100)">
      <div className="flex flex-col gap-(--space-025)">
        <h3 className="corpo-medio text-(--text)">Contas do mês</h3>
      </div>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse corpo">
          <thead>
            <tr>
              <th scope="col" className={classeCabecalho}>
                Conta
              </th>
              <th scope="col" className={`${classeCabecalho} w-40 text-right`}>
                Valor por mês (R$)
              </th>
              <th scope="col" className={`${classeCabecalho} w-12`}>
                <span className="sr-only">Remover</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, indice) => {
              const n = String(indice + 1)
              return (
                <tr key={l.id}>
                  <td className={classeCelula}>
                    <input
                      aria-label={`Conta ${n}`}
                      className={classeCampo}
                      value={l.descricao}
                      onChange={(e) => {
                        const valor = e.target.value
                        aoMudar(l.id, (x) => ({ ...x, descricao: valor }))
                      }}
                    />
                  </td>
                  <td className={classeCelula}>
                    <input
                      aria-label={`Valor por mês da conta ${n}`}
                      inputMode="decimal"
                      placeholder="0,00"
                      aria-invalid={lerReaisOuZero(l.valor) === null || undefined}
                      className={`${classeCampo} text-right tabular-nums`}
                      value={l.valor}
                      onChange={(e) => {
                        const valor = reaisDigitados(e)
                        aoMudar(l.id, (x) => ({ ...x, valor }))
                      }}
                    />
                  </td>
                  <td className={classeCelula}>
                    <BotaoIcone
                      icone="trash-2"
                      rotulo={`Remover conta ${n}`}
                      onClick={() => {
                        aoRemover(l.id)
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className={`${classeCelula} text-left corpo-medio`}>
                Total do mês
              </th>
              <td className={`${classeCelula} text-right corpo-medio tabular-nums`}>
                {formatarCentavos(total)}
              </td>
              <td className={classeCelula} />
            </tr>
          </tfoot>
        </table>
      </div>
      <div>
        <Botao
          aparencia="link"
          iconeAntes="plus"
          onClick={() => {
            aoAdicionar('')
          }}
        >
          Adicionar conta
        </Botao>
      </div>
    </section>
  )
}

/**
 * Tabela de preços da consultoria (ADR-0018): uma linha por profissão e serviço, atividade ou nível,
 * na unidade em que cobram, com faixas e mínimo opcionais. Usada em Custos e taxas e nos primeiros
 * passos (ADR-0020).
 */
export function TabelaDePrecos({
  horas,
  comAtalhoAceamb = true,
  aoMudar,
}: {
  horas: readonly LinhaHora[]
  /**
   * Atalho histórico da tabela ACEAMB em Custos e taxas. Os primeiros passos não oferecem tabela
   * de referência: cada consultoria digita os próprios preços (ADR-0020).
   */
  comAtalhoAceamb?: boolean
  aoMudar: (alterar: (linhas: LinhaHora[]) => LinhaHora[]) => void
}) {
  return (
    <>
      {horas.length > 0 ? (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse corpo">
            <thead>
              <tr>
                <th scope="col" className={classeCabecalho}>
                  Profissão
                </th>
                <th scope="col" className={classeCabecalho}>
                  Serviço, atividade ou nível
                </th>
                <th scope="col" className={`${classeCabecalho} w-44`}>
                  Unidade
                </th>
                <th scope="col" className={`${classeCabecalho} w-32 text-right`}>
                  Preço (R$)
                </th>
                <th scope="col" className={`${classeCabecalho} w-32 text-right`}>
                  Preço mínimo (R$)
                </th>
                <th scope="col" className={`${classeCabecalho} w-28 text-right`}>
                  Tempo por unidade
                </th>
                <th scope="col" className={classeCabecalho}>
                  Fonte
                </th>
                <th scope="col" className={`${classeCabecalho} w-12`}>
                  <span className="sr-only">Remover</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {horas.map((l, indice) => {
                const n = String(indice + 1)
                const mudarHora = (alterar: (x: LinhaHora) => LinhaHora) => {
                  aoMudar((a) => a.map((x) => (x.id === l.id ? alterar(x) : x)))
                }
                const comFaixas = usaFaixas(l)
                const sufixo = SUFIXO_DA_UNIDADE[l.unidade]
                const mudarFaixas = (alterar: (f: LinhaFaixa[]) => LinhaFaixa[]) => {
                  mudarHora((x) => ({ ...x, faixas: alterar(x.faixas) }))
                }
                return (
                  <Fragment key={l.id}>
                    <tr>
                      <td className={classeCelula}>
                        {/* Profissão da lista fixa do Grama; texto antigo aparece até trocar. */}
                        <SelecaoDaLista
                          aria-label={`Profissão da hora ${n}`}
                          lista={PROFISSOES}
                          valor={PROFISSOES.find((x) => x.rotulo === l.profissao)?.codigo ?? ''}
                          valorAntigo={l.profissao.trim() || null}
                          aria-invalid={l.profissao.trim() === '' || undefined}
                          className={classeCampo}
                          aoMudar={(codigo) => {
                            const rotulo = codigo ? rotuloDaProfissao(codigo) : ''
                            mudarHora((x) => ({ ...x, profissao: rotulo }))
                          }}
                        />
                      </td>
                      <td className={classeCelula}>
                        <input
                          aria-label={`Atividade ou nível da hora ${n}`}
                          className={classeCampo}
                          value={l.atividade}
                          onChange={(e) => {
                            const valor = e.target.value
                            mudarHora((x) => ({ ...x, atividade: valor }))
                          }}
                        />
                      </td>
                      <td className={classeCelula}>
                        <select
                          aria-label={`Unidade da linha ${n}`}
                          className={classeCampo}
                          value={l.unidade}
                          onChange={(e) => {
                            const valor = e.target.value as UnidadeDeCobranca
                            // Faixas só em m², ha, diária e campanha; mínimo nunca no pacote.
                            mudarHora((x) => ({
                              ...x,
                              unidade: valor,
                              faixas: UNIDADES_COM_FAIXAS.includes(valor) ? x.faixas : [],
                              minimo: valor === 'pacote' ? '' : x.minimo,
                            }))
                          }}
                        >
                          {UNIDADES_DE_COBRANCA.map((u) => (
                            <option key={u} value={u}>
                              {ROTULO_DA_UNIDADE[u]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={classeCelula}>
                        {comFaixas ? (
                          <span className="block text-right text-(--text-subtle)">Por faixas</span>
                        ) : (
                          <input
                            aria-label={`Preço da linha ${n}`}
                            inputMode="decimal"
                            aria-invalid={lerReaisOuZero(l.valor) === null || undefined}
                            className={`${classeCampo} text-right tabular-nums`}
                            value={l.valor}
                            onChange={(e) => {
                              const valor = reaisDigitados(e)
                              mudarHora((x) => ({ ...x, valor }))
                            }}
                          />
                        )}
                        {UNIDADES_COM_FAIXAS.includes(l.unidade) && !comFaixas ? (
                          <Botao
                            aparencia="link"
                            className="mt-(--space-050) text-xs"
                            onClick={() => {
                              mudarHora((x) => ({ ...x, faixas: faixasIniciais(x.valor) }))
                            }}
                          >
                            Usar faixas <span className="sr-only">de quantidade na linha {n}</span>
                          </Botao>
                        ) : null}
                      </td>
                      <td className={classeCelula}>
                        {l.unidade === 'pacote' ? (
                          <span className="block text-right text-(--text-subtle)">—</span>
                        ) : (
                          <input
                            aria-label={`Preço mínimo da linha ${n}`}
                            inputMode="decimal"
                            placeholder="Opcional"
                            aria-invalid={lerEstimativa(l.minimo) === undefined || undefined}
                            className={`${classeCampo} text-right tabular-nums`}
                            value={l.minimo}
                            onChange={(e) => {
                              const valor = reaisDigitados(e)
                              mudarHora((x) => ({ ...x, minimo: valor }))
                            }}
                          />
                        )}
                      </td>
                      <td className={classeCelula}>
                        {l.unidade === 'hora' ? (
                          <span className="block text-right text-(--text-subtle)">—</span>
                        ) : (
                          <input
                            aria-label={`Tempo por unidade da linha ${n}`}
                            inputMode="decimal"
                            placeholder="Opcional"
                            aria-invalid={
                              (l.tempo.trim() !== '' && lerDuracao(l.tempo) === null) || undefined
                            }
                            className={`${classeCampo} text-right tabular-nums`}
                            value={l.tempo}
                            onChange={(e) => {
                              const valor = e.target.value
                              mudarHora((x) => ({ ...x, tempo: valor }))
                            }}
                          />
                        )}
                      </td>
                      <td className={classeCelula}>
                        <input
                          aria-label={`Fonte da hora ${n}`}
                          placeholder="Opcional"
                          className={classeCampo}
                          value={l.fonte}
                          onChange={(e) => {
                            const valor = e.target.value
                            mudarHora((x) => ({ ...x, fonte: valor }))
                          }}
                        />
                      </td>
                      <td className={classeCelula}>
                        <BotaoIcone
                          icone="trash-2"
                          rotulo={`Remover preço ${n}`}
                          onClick={() => {
                            aoMudar((a) => a.filter((x) => x.id !== l.id))
                          }}
                        />
                      </td>
                    </tr>
                    {comFaixas ? (
                      <tr>
                        <td colSpan={8} className={classeCelula}>
                          {/* Fica à esquerda, visível, mesmo com a tabela rolada de lado (celular). */}
                          <fieldset className="sticky left-0 flex max-w-[calc(100vw-5rem)] flex-col gap-(--space-075) border-l-2 border-(--border-input) pl-(--space-150) sm:max-w-none">
                            <legend className="mb-(--space-050) text-xs text-(--text-subtle)">
                              Faixas de quantidade da linha {n}: progressivas, cada trecho paga o
                              valor da sua faixa.
                            </legend>
                            {l.faixas.map((f, i) => {
                              const k = String(i + 1)
                              const ultima = i === l.faixas.length - 1
                              const ateAnterior = (l.faixas[i - 1]?.ate ?? '').trim()
                              const anterior =
                                i === 0 ? '0' : ateAnterior === '' ? '…' : ateAnterior
                              const ateInvalido =
                                !ultima && f.ate.trim() !== '' && !lerQuantidade(f.ate)
                              return (
                                <div
                                  key={f.id}
                                  className="flex flex-wrap items-center gap-(--space-100) text-xs"
                                >
                                  {ultima ? (
                                    <span className="w-48">
                                      Acima de {anterior} {sufixo.slice(1)}
                                    </span>
                                  ) : (
                                    <label className="flex w-48 items-center gap-(--space-050)">
                                      Até
                                      <input
                                        aria-label={`Até quanto vale a faixa ${k} da linha ${n}`}
                                        inputMode="decimal"
                                        aria-invalid={ateInvalido || undefined}
                                        className={`${classeCampo} w-24 text-right tabular-nums`}
                                        value={f.ate}
                                        onChange={(e) => {
                                          const valor = e.target.value
                                          mudarFaixas((a) =>
                                            a.map((x) =>
                                              x.id === f.id ? { ...x, ate: valor } : x,
                                            ),
                                          )
                                        }}
                                      />
                                      {sufixo.slice(1)}
                                    </label>
                                  )}
                                  <label className="flex items-center gap-(--space-050)">
                                    R$
                                    <input
                                      aria-label={`Valor por unidade da faixa ${k} da linha ${n}`}
                                      inputMode="decimal"
                                      aria-invalid={
                                        lerEstimativa(f.valor) === undefined || undefined
                                      }
                                      className={`${classeCampo} w-28 text-right tabular-nums`}
                                      value={f.valor}
                                      onChange={(e) => {
                                        const valor = reaisDigitados(e)
                                        mudarFaixas((a) =>
                                          a.map((x) => (x.id === f.id ? { ...x, valor } : x)),
                                        )
                                      }}
                                    />
                                    {sufixo}
                                  </label>
                                  {!ultima && l.faixas.length > 2 ? (
                                    <BotaoIcone
                                      icone="trash-2"
                                      rotulo={`Remover faixa ${k} da linha ${n}`}
                                      onClick={() => {
                                        mudarFaixas((a) => a.filter((x) => x.id !== f.id))
                                      }}
                                    />
                                  ) : null}
                                </div>
                              )
                            })}
                            <div className="flex flex-wrap gap-(--space-150)">
                              {l.faixas.length < MAXIMO_DE_FAIXAS ? (
                                <Botao
                                  aparencia="link"
                                  iconeAntes="plus"
                                  onClick={() => {
                                    // A nova entra antes da última, que continua aberta.
                                    mudarFaixas((a) => [
                                      ...a.slice(0, -1),
                                      { id: crypto.randomUUID(), ate: '', valor: '' },
                                      ...a.slice(-1),
                                    ])
                                  }}
                                >
                                  Adicionar faixa <span className="sr-only">na linha {n}</span>
                                </Botao>
                              ) : null}
                              <Botao
                                aparencia="link"
                                onClick={() => {
                                  mudarHora((x) => ({
                                    ...x,
                                    valor: x.faixas[0]?.valor ?? x.valor,
                                    faixas: [],
                                  }))
                                }}
                              >
                                Usar preço único <span className="sr-only">na linha {n}</span>
                              </Botao>
                            </div>
                          </fieldset>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-(--space-150)">
        <Botao
          aparencia="link"
          iconeAntes="plus"
          onClick={() => {
            aoMudar((a) => [
              ...a,
              {
                id: crypto.randomUUID(),
                profissao: '',
                atividade: '',
                unidade: 'hora',
                valor: '',
                tempo: '',
                fonte: '',
                minimo: '',
                faixas: [],
              },
            ])
          }}
        >
          Adicionar preço
        </Botao>
        {comAtalhoAceamb && horas.every((h) => h.fonte !== FONTE_ACEAMB) ? (
          <Botao
            aparencia="link"
            iconeAntes="list"
            onClick={() => {
              aoMudar((a) => [
                ...a,
                ...HORAS_ACEAMB_2026.map((h) => ({
                  id: crypto.randomUUID(),
                  ...h,
                  fonte: FONTE_ACEAMB,
                })),
              ])
            }}
          >
            Usar tabela ACEAMB corrigida (ago/2026)
          </Botao>
        ) : null}
      </div>
    </>
  )
}
