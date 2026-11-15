// Como a consultoria cobra (decisões do Eduardo, 13/11/2026): a tabela de preços em dois blocos
// (hora de profissional e serviços) e a visita técnica por visita ou por km rodado. Usadas em
// Custos e taxas e no passo 3 dos primeiros passos (ADR-0020): os mesmos campos nas duas telas.

import {
  formatarReais,
  lerDuracao,
  MAXIMO_DE_FAIXAS,
  PROFISSOES,
  rotuloDaProfissao,
  UNIDADES_COM_FAIXAS,
  UNIDADES_DE_COBRANCA,
  type UnidadeDeCobranca,
} from '@gestao-ambiental/domain'
import { Fragment, useId } from 'react'

import { SelecaoDaLista } from '@/components/selecao-da-lista'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { OpcaoRadio } from '@/components/ui/caixa-selecao'

import { lerEstimativa, lerReaisOuZero } from './calculo'
import {
  ehHoraDeProfissional,
  faixasIniciais,
  FONTE_ACEAMB,
  HORAS_ACEAMB_2026,
  lerConsumo,
  novaLinhaDePreco,
  usaFaixas,
  valorDoKmDigitado,
  type CamposDeDeslocamento,
  type LinhaFaixa,
  type LinhaHora,
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
import { Linha } from './PecasDaBase'

/** Unidades do bloco "Serviços": todas menos a hora. */
const UNIDADES_DE_SERVICO = UNIDADES_DE_COBRANCA.filter((u) => u !== 'hora')

type MudarLinhas = (alterar: (linhas: LinhaHora[]) => LinhaHora[]) => void

/**
 * Tabela de preços em dois blocos. "Hora de profissional": linhas por hora, com profissão e nível.
 * "Serviços": linhas por m², hectare, diária, campanha ou pacote, com "Quem faz" opcional (sem ele,
 * o custo usa a média da equipe). A lista continua uma só; o bloco vem da unidade.
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
  aoMudar: MudarLinhas
}) {
  const id = useId()
  const profissionais = horas.filter(ehHoraDeProfissional)
  const servicos = horas.filter((l) => !ehHoraDeProfissional(l))
  const mudarLinha = (linhaId: string, alterar: (l: LinhaHora) => LinhaHora) => {
    aoMudar((a) => a.map((x) => (x.id === linhaId ? alterar(x) : x)))
  }
  const remover = (linhaId: string) => {
    aoMudar((a) => a.filter((x) => x.id !== linhaId))
  }
  return (
    <div className="flex flex-col gap-(--space-300)">
      <section aria-labelledby={`${id}-hora`} className="flex flex-col gap-(--space-100)">
        <h3 id={`${id}-hora`} className="corpo-medio text-(--text)">
          Hora de profissional
        </h3>
        {profissionais.length > 0 ? (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse corpo">
              <thead>
                <tr>
                  <th scope="col" className={classeCabecalho}>
                    Profissão
                  </th>
                  <th scope="col" className={classeCabecalho}>
                    Nível
                  </th>
                  <th scope="col" className={`${classeCabecalho} w-36 text-right`}>
                    R$ por hora
                  </th>
                  <th scope="col" className={`${classeCabecalho} w-36 text-right`}>
                    Preço mínimo (R$)
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
                {profissionais.map((l, indice) => (
                  <LinhaDeProfissional
                    key={l.id}
                    linha={l}
                    n={String(indice + 1)}
                    aoMudar={(alterar) => {
                      mudarLinha(l.id, alterar)
                    }}
                    aoRemover={() => {
                      remover(l.id)
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-(--space-150)">
          <Botao
            aparencia="link"
            iconeAntes="plus"
            onClick={() => {
              aoMudar((a) => [...a, novaLinhaDePreco('hora')])
            }}
          >
            Adicionar profissional
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
      </section>

      <section aria-labelledby={`${id}-servicos`} className="flex flex-col gap-(--space-100)">
        <h3 id={`${id}-servicos`} className="corpo-medio text-(--text)">
          Serviços
        </h3>
        {servicos.length > 0 ? (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[1240px] border-collapse corpo">
              <thead>
                <tr>
                  <th scope="col" className={classeCabecalho}>
                    Serviço
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
                  <th scope="col" className={`${classeCabecalho} w-56`}>
                    Quem faz
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
                {servicos.map((l, indice) => (
                  <LinhaDeServico
                    key={l.id}
                    linha={l}
                    n={String(indice + 1)}
                    aoMudar={(alterar) => {
                      mudarLinha(l.id, alterar)
                    }}
                    aoRemover={() => {
                      remover(l.id)
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <div>
          <Botao
            aparencia="link"
            iconeAntes="plus"
            onClick={() => {
              aoMudar((a) => [...a, novaLinhaDePreco('servico')])
            }}
          >
            Adicionar serviço
          </Botao>
        </div>
      </section>
    </div>
  )
}

function LinhaDeProfissional({
  linha: l,
  n,
  aoMudar,
  aoRemover,
}: {
  linha: LinhaHora
  n: string
  aoMudar: (alterar: (l: LinhaHora) => LinhaHora) => void
  aoRemover: () => void
}) {
  return (
    <tr>
      <td className={classeCelula}>
        {/* Profissão da lista fixa do Grama; texto antigo aparece até trocar. */}
        <SelecaoDaLista
          aria-label={`Profissão do profissional ${n}`}
          lista={PROFISSOES}
          valor={PROFISSOES.find((x) => x.rotulo === l.profissao)?.codigo ?? ''}
          valorAntigo={l.profissao.trim() || null}
          aria-invalid={l.profissao.trim() === '' || undefined}
          className={classeCampo}
          aoMudar={(codigo) => {
            const rotulo = codigo ? rotuloDaProfissao(codigo) : ''
            aoMudar((x) => ({ ...x, profissao: rotulo }))
          }}
        />
      </td>
      <td className={classeCelula}>
        <input
          aria-label={`Nível do profissional ${n}`}
          placeholder="Ex.: Júnior"
          className={classeCampo}
          value={l.atividade}
          onChange={(e) => {
            const valor = e.target.value
            aoMudar((x) => ({ ...x, atividade: valor }))
          }}
        />
      </td>
      <td className={classeCelula}>
        <input
          aria-label={`Preço por hora do profissional ${n}`}
          inputMode="decimal"
          aria-invalid={lerReaisOuZero(l.valor) === null || undefined}
          className={`${classeCampo} text-right tabular-nums`}
          value={l.valor}
          onChange={(e) => {
            const valor = reaisDigitados(e)
            aoMudar((x) => ({ ...x, valor }))
          }}
        />
      </td>
      <td className={classeCelula}>
        <input
          aria-label={`Preço mínimo do profissional ${n}`}
          inputMode="decimal"
          placeholder="Opcional"
          aria-invalid={lerEstimativa(l.minimo) === undefined || undefined}
          className={`${classeCampo} text-right tabular-nums`}
          value={l.minimo}
          onChange={(e) => {
            const valor = reaisDigitados(e)
            aoMudar((x) => ({ ...x, minimo: valor }))
          }}
        />
      </td>
      <td className={classeCelula}>
        <input
          aria-label={`Fonte do profissional ${n}`}
          placeholder="Opcional"
          className={classeCampo}
          value={l.fonte}
          onChange={(e) => {
            const valor = e.target.value
            aoMudar((x) => ({ ...x, fonte: valor }))
          }}
        />
      </td>
      <td className={classeCelula}>
        <BotaoIcone icone="trash-2" rotulo={`Remover profissional ${n}`} onClick={aoRemover} />
      </td>
    </tr>
  )
}

function LinhaDeServico({
  linha: l,
  n,
  aoMudar,
  aoRemover,
}: {
  linha: LinhaHora
  n: string
  aoMudar: (alterar: (l: LinhaHora) => LinhaHora) => void
  aoRemover: () => void
}) {
  const comFaixas = usaFaixas(l)
  const sufixo = SUFIXO_DA_UNIDADE[l.unidade]
  const mudarFaixas = (alterar: (f: LinhaFaixa[]) => LinhaFaixa[]) => {
    aoMudar((x) => ({ ...x, faixas: alterar(x.faixas) }))
  }
  return (
    <Fragment>
      <tr>
        <td className={classeCelula}>
          <input
            aria-label={`Serviço ${n}`}
            placeholder="Ex.: Inventário de fauna"
            aria-invalid={l.atividade.trim() === '' || undefined}
            className={classeCampo}
            value={l.atividade}
            onChange={(e) => {
              const valor = e.target.value
              aoMudar((x) => ({ ...x, atividade: valor }))
            }}
          />
        </td>
        <td className={classeCelula}>
          <select
            aria-label={`Unidade do serviço ${n}`}
            className={classeCampo}
            value={l.unidade}
            onChange={(e) => {
              const valor = e.target.value as UnidadeDeCobranca
              // Faixas só em m², ha, diária e campanha; mínimo nunca no pacote.
              aoMudar((x) => ({
                ...x,
                unidade: valor,
                faixas: UNIDADES_COM_FAIXAS.includes(valor) ? x.faixas : [],
                minimo: valor === 'pacote' ? '' : x.minimo,
              }))
            }}
          >
            {UNIDADES_DE_SERVICO.map((u) => (
              <option key={u} value={u}>
                {ROTULO_DA_UNIDADE[u]}
              </option>
            ))}
          </select>
        </td>
        <td className={classeCelula}>
          {comFaixas ? (
            <span className="block text-right text-(--text)">Por faixas</span>
          ) : (
            <input
              aria-label={`Preço do serviço ${n}`}
              inputMode="decimal"
              aria-invalid={lerReaisOuZero(l.valor) === null || undefined}
              className={`${classeCampo} text-right tabular-nums`}
              value={l.valor}
              onChange={(e) => {
                const valor = reaisDigitados(e)
                aoMudar((x) => ({ ...x, valor }))
              }}
            />
          )}
          {UNIDADES_COM_FAIXAS.includes(l.unidade) && !comFaixas ? (
            <Botao
              aparencia="link"
              className="mt-(--space-050) text-xs"
              onClick={() => {
                aoMudar((x) => ({ ...x, faixas: faixasIniciais(x.valor) }))
              }}
            >
              Usar faixas <span className="sr-only">de quantidade no serviço {n}</span>
            </Botao>
          ) : null}
        </td>
        <td className={classeCelula}>
          {l.unidade === 'pacote' ? (
            <span className="block text-right text-(--text-subtle)">—</span>
          ) : (
            <input
              aria-label={`Preço mínimo do serviço ${n}`}
              inputMode="decimal"
              placeholder="Opcional"
              aria-invalid={lerEstimativa(l.minimo) === undefined || undefined}
              className={`${classeCampo} text-right tabular-nums`}
              value={l.minimo}
              onChange={(e) => {
                const valor = reaisDigitados(e)
                aoMudar((x) => ({ ...x, minimo: valor }))
              }}
            />
          )}
        </td>
        <td className={classeCelula}>
          <input
            aria-label={`Tempo por unidade do serviço ${n}`}
            inputMode="decimal"
            placeholder="Opcional"
            aria-invalid={(l.tempo.trim() !== '' && lerDuracao(l.tempo) === null) || undefined}
            className={`${classeCampo} text-right tabular-nums`}
            value={l.tempo}
            onChange={(e) => {
              const valor = e.target.value
              aoMudar((x) => ({ ...x, tempo: valor }))
            }}
          />
        </td>
        <td className={classeCelula}>
          {/* Opcional: sem "Quem faz", o custo do serviço usa a média da equipe. */}
          <SelecaoDaLista
            aria-label={`Quem faz o serviço ${n}`}
            lista={PROFISSOES}
            valor={PROFISSOES.find((x) => x.rotulo === l.profissao)?.codigo ?? ''}
            valorAntigo={l.profissao.trim() || null}
            vazio="Qualquer pessoa da equipe"
            className={classeCampo}
            aoMudar={(codigo) => {
              const rotulo = codigo ? rotuloDaProfissao(codigo) : ''
              aoMudar((x) => ({ ...x, profissao: rotulo }))
            }}
          />
        </td>
        <td className={classeCelula}>
          <input
            aria-label={`Fonte do serviço ${n}`}
            placeholder="Opcional"
            className={classeCampo}
            value={l.fonte}
            onChange={(e) => {
              const valor = e.target.value
              aoMudar((x) => ({ ...x, fonte: valor }))
            }}
          />
        </td>
        <td className={classeCelula}>
          <BotaoIcone icone="trash-2" rotulo={`Remover serviço ${n}`} onClick={aoRemover} />
        </td>
      </tr>
      {comFaixas ? (
        <tr>
          <td colSpan={8} className={classeCelula}>
            {/* Fica à esquerda, visível, mesmo com a tabela rolada de lado (celular). */}
            <fieldset className="sticky left-0 flex max-w-[calc(100vw-5rem)] flex-col gap-(--space-075) border-l-2 border-(--border-input) pl-(--space-150) sm:max-w-none">
              <legend className="mb-(--space-050) text-xs text-(--text)">
                Faixas de quantidade do serviço {n}
              </legend>
              {l.faixas.map((f, i) => {
                const k = String(i + 1)
                const ultima = i === l.faixas.length - 1
                const ateAnterior = (l.faixas[i - 1]?.ate ?? '').trim()
                const anterior = i === 0 ? '0' : ateAnterior === '' ? '…' : ateAnterior
                const ateInvalido = !ultima && f.ate.trim() !== '' && !lerQuantidade(f.ate)
                return (
                  <div key={f.id} className="flex flex-wrap items-center gap-(--space-100) text-xs">
                    {ultima ? (
                      <span className="w-48">
                        Acima de {anterior} {sufixo.slice(1)}
                      </span>
                    ) : (
                      <label className="flex w-48 items-center gap-(--space-050)">
                        Até
                        <input
                          aria-label={`Até quanto vale a faixa ${k} do serviço ${n}`}
                          inputMode="decimal"
                          aria-invalid={ateInvalido || undefined}
                          className={`${classeCampo} w-24 text-right tabular-nums`}
                          value={f.ate}
                          onChange={(e) => {
                            const valor = e.target.value
                            mudarFaixas((a) =>
                              a.map((x) => (x.id === f.id ? { ...x, ate: valor } : x)),
                            )
                          }}
                        />
                        {sufixo.slice(1)}
                      </label>
                    )}
                    <label className="flex items-center gap-(--space-050)">
                      R$
                      <input
                        aria-label={`Valor por unidade da faixa ${k} do serviço ${n}`}
                        inputMode="decimal"
                        aria-invalid={lerEstimativa(f.valor) === undefined || undefined}
                        className={`${classeCampo} w-28 text-right tabular-nums`}
                        value={f.valor}
                        onChange={(e) => {
                          const valor = reaisDigitados(e)
                          mudarFaixas((a) => a.map((x) => (x.id === f.id ? { ...x, valor } : x)))
                        }}
                      />
                      {sufixo}
                    </label>
                    {!ultima && l.faixas.length > 2 ? (
                      <BotaoIcone
                        icone="trash-2"
                        rotulo={`Remover faixa ${k} do serviço ${n}`}
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
                    Adicionar faixa <span className="sr-only">no serviço {n}</span>
                  </Botao>
                ) : null}
                <Botao
                  aparencia="link"
                  onClick={() => {
                    aoMudar((x) => ({ ...x, valor: x.faixas[0]?.valor ?? x.valor, faixas: [] }))
                  }}
                >
                  Usar preço único <span className="sr-only">no serviço {n}</span>
                </Botao>
              </div>
            </fieldset>
          </td>
        </tr>
      ) : null}
    </Fragment>
  )
}

/**
 * Visita técnica e deslocamento: a consultoria escolhe cobrar por visita (valor fixo) ou por km
 * rodado (combustível ÷ consumo + acréscimo). Só aparecem os campos da escolha.
 */
export function Deslocamento({
  campos,
  prefixo,
  aoMudar,
}: {
  campos: CamposDeDeslocamento
  /** Prefixo dos ids dos campos ("base", "pp"). */
  prefixo: string
  aoMudar: (alterar: (c: CamposDeDeslocamento) => CamposDeDeslocamento) => void
}) {
  const nome = useId()
  const digitouKm =
    campos.consumo.trim() !== '' ||
    campos.combustivel.trim() !== '' ||
    campos.acrescimo.trim() !== ''
  const km = valorDoKmDigitado(campos)
  const consumoInvalido = lerConsumo(campos.consumo) === undefined
  return (
    <div className="flex flex-col gap-(--space-150)">
      <fieldset className="flex flex-col gap-(--space-100)">
        <legend className="mb-(--space-075) corpo-medio text-(--text)">
          Como vocês cobram a visita
        </legend>
        <div className="grid gap-(--space-100) sm:max-w-xl sm:grid-cols-2">
          <OpcaoRadio
            name={nome}
            value="visita"
            rotulo="Cobramos por visita"
            checked={campos.modo === 'visita'}
            onChange={() => {
              aoMudar((c) => ({ ...c, modo: 'visita' }))
            }}
          />
          <OpcaoRadio
            name={nome}
            value="km"
            rotulo="Cobramos por km rodado"
            checked={campos.modo === 'km'}
            onChange={() => {
              aoMudar((c) => ({ ...c, modo: 'km' }))
            }}
          />
        </div>
      </fieldset>
      {campos.modo === 'visita' ? (
        <Linha id={`${prefixo}-visita`} rotulo="Valor de uma visita técnica (R$)">
          <input
            id={`${prefixo}-visita`}
            inputMode="decimal"
            aria-invalid={lerEstimativa(campos.visita) === undefined || undefined}
            className={`${classeCampo} text-right tabular-nums`}
            value={campos.visita}
            onChange={(e) => {
              const valor = reaisDigitados(e)
              aoMudar((c) => ({ ...c, visita: valor }))
            }}
          />
        </Linha>
      ) : (
        <>
          <Linha id={`${prefixo}-consumo`} rotulo="Consumo do carro (km/l)">
            <input
              id={`${prefixo}-consumo`}
              inputMode="decimal"
              aria-invalid={consumoInvalido || undefined}
              className={`${classeCampo} text-right tabular-nums`}
              value={campos.consumo}
              onChange={(e) => {
                const valor = e.target.value
                aoMudar((c) => ({ ...c, consumo: valor }))
              }}
            />
          </Linha>
          <Linha id={`${prefixo}-combustivel`} rotulo="Preço do combustível (R$/l)">
            <input
              id={`${prefixo}-combustivel`}
              inputMode="decimal"
              aria-invalid={lerEstimativa(campos.combustivel) === undefined || undefined}
              className={`${classeCampo} text-right tabular-nums`}
              value={campos.combustivel}
              onChange={(e) => {
                const valor = reaisDigitados(e)
                aoMudar((c) => ({ ...c, combustivel: valor }))
              }}
            />
          </Linha>
          <Linha id={`${prefixo}-acrescimo`} rotulo="Acréscimo por km (R$)">
            <input
              id={`${prefixo}-acrescimo`}
              inputMode="decimal"
              placeholder="Opcional"
              aria-invalid={lerEstimativa(campos.acrescimo) === undefined || undefined}
              className={`${classeCampo} text-right tabular-nums`}
              value={campos.acrescimo}
              onChange={(e) => {
                const valor = reaisDigitados(e)
                aoMudar((c) => ({ ...c, acrescimo: valor }))
              }}
            />
          </Linha>
          <p aria-live="polite" className="corpo text-(--text)">
            Valor do km:{' '}
            <span className="corpo-medio tabular-nums">
              {!digitouKm
                ? 'não cadastrado'
                : km === null
                  ? 'pendente'
                  : `${formatarReais(km)} por km`}
            </span>
          </p>
        </>
      )}
    </div>
  )
}
