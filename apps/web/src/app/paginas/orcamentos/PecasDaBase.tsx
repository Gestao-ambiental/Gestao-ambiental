// Peças da base de custos usadas em Custos e taxas e nos primeiros passos (ADR-0020): os mesmos
// campos, rótulos e regras nas duas telas.

import {
  FORMAS_DE_RECEBIMENTO,
  formatarCentavos,
  formatarPontosBase,
  formatarReais,
  PROFISSOES,
  rotuloDaProfissao,
  resumoDaPessoa,
  type CodigoProfissao,
  type ComposicaoDaEquipe,
  type FormaDeRecebimento,
} from '@gestao-ambiental/domain'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type ReactNode } from 'react'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { SelecaoDaLista } from '@/components/selecao-da-lista'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { ItemDoPlacar, Placar } from '@/components/ui/placar'
import type { CustoDaProfissao } from '@/lib/api/orcamentos'
import { definirProfissaoECargo, type MembroAtivo } from '@/lib/api/perfil'
import { mensagemDoErro } from '@/lib/erros'

import { lerEstimativa, lerReaisOuZero, textoDasHoras } from './calculo'
import {
  CONTAS_SUGERIDAS,
  contaDaHoraDeCusto,
  lerInteiroOuNulo,
  remuneracaoDaLinha,
  ROTULO_DA_FORMA,
  type LinhaConta,
  type LinhaPessoa,
} from './campos-da-base'
import { classeCabecalho, classeCampo, classeCelula, reaisDigitados } from './comum'

// ---------------------------------------------------------------------------
// Composição pela equipe
// ---------------------------------------------------------------------------

/**
 * Caixa de seleção cujo texto escolhido quebra linha: o select nativo corta o valor ("Engenheiro
 * ambient"). O select continua nativo, transparente e por cima, ocupando a mesma área (teclado,
 * leitor de tela e a lista do sistema seguem iguais); o texto visível é só apresentação.
 */
function CaixaQueQuebra({ texto, children }: { texto: string; children: ReactNode }) {
  return (
    <div className={classeCaixaQueQuebra}>
      <span
        aria-hidden="true"
        data-texto-da-selecao=""
        className="col-start-1 row-start-1 flex min-h-[calc(var(--controle)-2px)] items-center gap-(--e-1) px-(--e-2) py-(--e-1)"
      >
        <span className="min-w-0 flex-1 break-words">{texto}</span>
        <Icone nome="chevron-down" className="text-(--tinta-2)" />
      </span>
      {children}
    </div>
  )
}

/** A moldura do campo (como em classeCampo) fica na caixa; o foco do select aparece nela. */
const classeCaixaQueQuebra =
  'grid w-full rounded-(--raio) border border-(--campo-borda) border-b-(--campo-borda) bg-(--campo) corpo text-(--tinta) transicao-estado focus-within:border-b-(--campo-borda-ativa) focus-within:shadow-[inset_0_-1px_0_0_var(--campo-borda-ativa)] focus-within:bg-(--campo-foco) has-[:disabled]:bg-(--off) has-[:disabled]:text-(--tinta-off) has-[[aria-invalid=true]]:border-(--atraso)'

/** O select de CaixaQueQuebra: transparente, na mesma célula da grade que o texto. */
const classeSelecaoSobreposta =
  'col-start-1 row-start-1 h-full w-full min-w-0 cursor-pointer appearance-none opacity-0 corpo disabled:cursor-not-allowed'

/** Nome do campo de valor conforme a forma de recebimento ("Salário mensal da linha 1"). */
const ROTULO_DO_VALOR: Record<FormaDeRecebimento | '', string> = {
  '': 'Salário mensal',
  clt: 'Salário mensal',
  pro_labore: 'Pró-labore mensal',
  estagio: 'Bolsa mensal',
  diaria: 'Valor da diária',
  projeto: 'Valor do projeto',
}

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
  // O mesmo texto da opção escolhida em SelecaoDaLista.
  const texto = membro.profissao
    ? rotuloDaProfissao(membro.profissao)
    : profissaoAntiga
      ? `${profissaoAntiga} (antigo, escolha na lista)`
      : 'Não informada'
  return (
    <div className="flex flex-col gap-(--e-1)">
      <CaixaQueQuebra texto={texto}>
        <SelecaoDaLista
          aria-label={rotulo}
          lista={PROFISSOES}
          valor={membro.profissao ?? ''}
          valorAntigo={membro.profissao ? null : profissaoAntiga}
          vazio="Não informada"
          vazioSoSemValor
          disabled={salvar.isPending}
          aria-busy={salvar.isPending || undefined}
          aria-describedby={salvar.isError ? idErro : undefined}
          className={classeSelecaoSobreposta}
          aoMudar={(codigo) => {
            salvar.mutate(codigo)
          }}
        />
      </CaixaQueQuebra>
      {salvar.isError ? (
        <span id={idErro} role="alert" className="text-xs text-(--atraso-texto)">
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
  // Com a quebra de linha, a célula cresce: o respiro em cima e embaixo separa as linhas.
  const celula = `${classeCelula} py-(--e-1)`
  return (
    <div className="flex flex-col gap-(--e-3)">
      {/* relative: textos sr-only (absolutos) ficam presos à área que rola, não à página. */}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse corpo">
          <thead>
            <tr>
              {/* Cabeçalho e campo começam no mesmo ponto, à esquerda, em todas as colunas. */}
              <th scope="col" className={`${classeCabecalho} w-[16%]`}>
                Pessoa
              </th>
              <th scope="col" className={`${classeCabecalho} w-[22%]`}>
                Profissão
              </th>
              <th scope="col" className={`${classeCabecalho} w-[16%]`}>
                Como recebe
              </th>
              <th scope="col" className={`${classeCabecalho} w-[16%]`}>
                Salário (R$)
              </th>
              <th scope="col" className={`${classeCabecalho} w-[15%]`}>
                Horas
              </th>
              <th scope="col" className={`${classeCabecalho} w-[10%]`}>
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
              const vazioDaPessoa = membrosCarregando ? 'Carregando…' : 'Escolha'
              const textoDaPessoa = membroSumiu
                ? 'Membro desligado'
                : (membroDaLinha?.nome ?? vazioDaPessoa)
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
                  ? lerEstimativa(valor) === undefined
                  : lerInteiroOuNulo(valor) === undefined
                const idAviso = `aviso-${chave}-${p.id}`
                // O campo começa na borda da célula, como o cabeçalho; a legenda fica à direita,
                // com largura fixa para os campos da coluna terem o mesmo tamanho.
                const campoDaPessoa = (
                  <label className="flex items-center gap-(--e-1)">
                    <input
                      aria-label={`${rotulo} da linha ${n}`}
                      aria-describedby={opcoesDoCampo.aviso ? idAviso : undefined}
                      inputMode={opcoesDoCampo.reais ? 'decimal' : 'numeric'}
                      placeholder={opcoesDoCampo.placeholder}
                      aria-invalid={invalido || undefined}
                      className={`${classeCampo} flex-1 text-right numero ${opcoesDoCampo.reais ? 'min-w-24' : 'min-w-20'}`}
                      value={valor}
                      onChange={(e) => {
                        const novo = opcoesDoCampo.reais ? reaisDigitados(e) : e.target.value
                        aoMudar(p.id, (x) => ({ ...x, [chave]: novo }))
                      }}
                    />
                    {opcoesDoCampo.legenda ? (
                      <span className="w-14 shrink-0 text-xs text-(--tinta-2)">
                        {opcoesDoCampo.legenda}
                      </span>
                    ) : null}
                  </label>
                )
                // Estrutura sempre igual: o campo não é recriado quando o aviso aparece ou some
                // (senão a digitação se perde no meio). O aviso não é erro.
                return (
                  <div className="flex flex-col gap-(--e-1)">
                    {campoDaPessoa}
                    {opcoesDoCampo.aviso ? (
                      <span id={idAviso} className="max-w-56 text-xs text-(--tinta-2)">
                        {opcoesDoCampo.aviso}
                      </span>
                    ) : null}
                  </div>
                )
              }
              let custo: ReactNode
              let horas: ReactNode
              if (p.forma === 'diaria') {
                custo = numero(ROTULO_DO_VALOR.diaria, 'diaria', { reais: true, legenda: 'diária' })
                horas = (
                  <div className="flex flex-col gap-(--e-1)">
                    {numero('Horas por diária', 'horasDiaria', { legenda: 'h/diária' })}
                    {numero('Dias no mês', 'dias', {
                      placeholder: 'Opcional',
                      legenda: 'dias/mês',
                    })}
                  </div>
                )
              } else if (p.forma === 'projeto') {
                custo = numero(ROTULO_DO_VALOR.projeto, 'projeto', {
                  reais: true,
                  legenda: 'projeto',
                })
                horas = (
                  <div className="flex flex-col gap-(--e-1)">
                    {numero('Horas do projeto', 'horasProjeto', { legenda: 'h/projeto' })}
                    {numero('Horas no mês', 'horas', {
                      placeholder: 'Opcional',
                      legenda: 'h/mês',
                    })}
                  </div>
                )
              } else {
                custo = numero(ROTULO_DO_VALOR[p.forma], 'custo', { reais: true, legenda: 'mês' })
                horas = numero('Horas no mês', 'horas', {
                  placeholder: '173',
                  legenda: 'h/mês',
                })
              }
              return (
                <tr key={p.id} className="align-top">
                  <td className={celula}>
                    <CaixaQueQuebra texto={textoDaPessoa}>
                      <select
                        aria-label={`Pessoa da linha ${n}`}
                        className={classeSelecaoSobreposta}
                        value={p.membroId}
                        aria-invalid={p.membroId === '' || membroSumiu || undefined}
                        aria-busy={membrosCarregando || undefined}
                        onChange={(e) => {
                          const valor = e.target.value
                          aoMudar(p.id, (x) => ({ ...x, membroId: valor }))
                        }}
                      >
                        <option value="">{vazioDaPessoa}</option>
                        {membroSumiu ? <option value={p.membroId}>Membro desligado</option> : null}
                        {opcoes.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nome}
                          </option>
                        ))}
                      </select>
                    </CaixaQueQuebra>
                  </td>
                  <td className={celula}>
                    {/* Profissão principal do cadastro da pessoa, gravada na hora (ADR-0021). */}
                    {membroDaLinha ? (
                      <ProfissaoDaPessoa
                        membro={membroDaLinha}
                        profissaoAntiga={p.profissao.trim() || null}
                        rotulo={`Profissão da linha ${n}`}
                      />
                    ) : (
                      <span className="flex min-h-(--controle) items-center">
                        {p.profissao.trim() ? `${p.profissao.trim()} (antigo)` : '—'}
                      </span>
                    )}
                  </td>
                  <td className={celula}>
                    <CaixaQueQuebra
                      texto={p.forma === '' ? 'Ainda não informado' : ROTULO_DA_FORMA[p.forma]}
                    >
                      <select
                        aria-label={`Como recebe na linha ${n}`}
                        className={classeSelecaoSobreposta}
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
                    </CaixaQueQuebra>
                    {p.forma === '' ? (
                      <span
                        id={`forma-pendente-${n}`}
                        className="mt-(--e-05) block text-xs text-(--tinta-2)"
                      >
                        Confirme como esta pessoa recebe
                      </span>
                    ) : null}
                  </td>
                  <td className={celula}>{custo}</td>
                  <td className={celula}>{horas}</td>
                  <td className={`${celula} numero text-(--tinta-2)`}>
                    {resumo?.horaDeCustoCentavos == null
                      ? '—'
                      : formatarCentavos(resumo.horaDeCustoCentavos)}{' '}
                    <span className="sr-only">por hora, na linha {n}</span>
                    {resumo?.horaDeCustoCentavos != null && typeof lida !== 'string' ? (
                      <details className="mt-(--e-05) text-xs">
                        <summary className="cursor-pointer">
                          Ver cálculo <span className="sr-only">da hora de custo da linha {n}</span>
                        </summary>
                        <span className="mt-(--e-05) block max-w-48">
                          {contaDaHoraDeCusto(lida, resumo.horaDeCustoCentavos)}
                        </span>
                      </details>
                    ) : null}
                  </td>
                  <td className={celula}>
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
      <div className="flex flex-wrap items-center justify-between gap-(--e-2)">
        <Botao aparencia="link" iconeAntes="plus" onClick={aoAdicionar}>
          Adicionar pessoa
        </Botao>
        {/* Troca de modo é ação da seção (terciário, 38px), não link de 22px. */}
        <Botao aparencia="sutil" onClick={aoVoltar}>
          Digitar o custo da hora e as horas
        </Botao>
      </div>
      <Placar rotulo="Resultado da equipe" tamanho="compacto" moldura={false} className="border-t">
        <ItemDoPlacar
          rotulo="Custo médio por hora da equipe"
          valor={
            previa?.horaTecnicaCentavos == null
              ? 'pendente'
              : formatarReais(previa.horaTecnicaCentavos)
          }
          apagado={previa?.horaTecnicaCentavos == null}
        />
        <ItemDoPlacar
          rotulo="Horas da equipe por mês"
          valor={previa ? `${textoDasHoras(previa.horasFaturaveisMes)} h` : 'pendente'}
          apagado={!previa}
        />
        {/* Por profissão, só o que difere da média: o mesmo valor repetido não diz nada. */}
        {custoPorProfissao
          .filter((c) => c.horaTecnicaCentavos !== previa?.horaTecnicaCentavos)
          .map((c) => (
            <ItemDoPlacar
              key={c.profissao}
              rotulo={`Custo por hora de ${c.profissao}`}
              valor={formatarReais(c.horaTecnicaCentavos)}
            />
          ))}
      </Placar>
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
      className="flex scroll-mt-(--e-4) flex-col gap-(--e-3) border-b p-(--e-4) last:border-b-0"
    >
      <h2 className="titulo-secao text-(--tinta)">{titulo}</h2>
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
    <div className="grid items-center gap-(--e-2) sm:grid-cols-[260px_160px_1fr]">
      <label htmlFor={id} className="corpo text-(--tinta)">
        {rotulo}
      </label>
      {children}
      {apoio ? <span className="text-xs text-(--tinta-2)">{apoio}</span> : <span />}
    </div>
  )
}

export function ContasDoMes({
  linhas,
  total,
  aoMudarLinhas,
  children,
}: {
  linhas: readonly LinhaConta[]
  total: number
  /** Toda mudança da lista (editar, adicionar, sugerir e remover) passa por aqui. */
  aoMudarLinhas: (alterar: (linhas: LinhaConta[]) => LinhaConta[]) => void
  /** Campo do total, mostrado enquanto não há contas detalhadas. */
  children: React.ReactNode
}) {
  function mudar(id: string, alterar: (l: LinhaConta) => LinhaConta) {
    aoMudarLinhas((a) => a.map((l) => (l.id === id ? alterar(l) : l)))
  }
  function sugerir() {
    aoMudarLinhas((a) => [
      ...a,
      ...CONTAS_SUGERIDAS.filter((nome) => !a.some((l) => l.descricao === nome)).map(
        (descricao) => ({ id: crypto.randomUUID(), descricao, valor: '' }),
      ),
    ])
  }
  if (linhas.length === 0) {
    return (
      <>
        {children}
        <div className="flex flex-wrap gap-(--e-2)">
          <Botao aparencia="sutil" iconeAntes="list" onClick={sugerir}>
            Detalhar contas do mês
          </Botao>
        </div>
      </>
    )
  }
  return (
    <section aria-label="Contas do mês" className="flex flex-col gap-(--e-2)">
      <div className="flex flex-col gap-(--e-05)">
        <h3 className="corpo-medio text-(--tinta)">Contas do mês</h3>
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
                        mudar(l.id, (x) => ({ ...x, descricao: valor }))
                      }}
                    />
                  </td>
                  <td className={classeCelula}>
                    <input
                      aria-label={`Valor por mês da conta ${n}`}
                      inputMode="decimal"
                      placeholder="0,00"
                      aria-invalid={lerReaisOuZero(l.valor) === null || undefined}
                      className={`${classeCampo} text-right numero`}
                      value={l.valor}
                      onChange={(e) => {
                        const valor = reaisDigitados(e)
                        mudar(l.id, (x) => ({ ...x, valor }))
                      }}
                    />
                  </td>
                  <td className={classeCelula}>
                    <BotaoIcone
                      icone="trash-2"
                      rotulo={`Remover conta ${n}`}
                      onClick={() => {
                        aoMudarLinhas((a) => a.filter((x) => x.id !== l.id))
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
              <td className={`${classeCelula} text-right corpo-medio numero`}>
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
            aoMudarLinhas((a) => [...a, { id: crypto.randomUUID(), descricao: '', valor: '' }])
          }}
        >
          Adicionar conta
        </Botao>
      </div>
    </section>
  )
}

/** Margem desejada abaixo da mínima: os orçamentos pela margem nascem com o aviso de margem baixa. */
export function AvisoDeMargemBaixa({
  desejada,
  minima,
}: {
  desejada: number | null | undefined
  minima: number | null | undefined
}) {
  if (desejada == null || minima == null || desejada >= minima) return null
  return (
    <MensagemSecao tom="atencao">
      A margem desejada ({formatarPontosBase(desejada)}) está abaixo da mínima (
      {formatarPontosBase(minima)}): os orçamentos calculados pela margem vão nascer com o aviso de
      margem baixa.
    </MensagemSecao>
  )
}
