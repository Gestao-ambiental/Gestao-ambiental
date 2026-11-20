import {
  ROTULO_DA_SITUACAO_DO_MTR,
  ROTULO_DA_UNIDADE_DE_RESIDUO,
  SITUACOES_DO_MTR,
  UNIDADES_DE_RESIDUO,
  ehSituacaoMtr,
  ehUnidadeResiduo,
  formatarCnpj,
  lerQuantidade,
  mascararCnpj,
  situacaoDoCnpj,
  type DataCivil,
  type SituacaoMtr,
  type UnidadeResiduo,
} from '@gestao-ambiental/domain'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { CampoData } from '@/components/ui/campo-data'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  editarMtr,
  enviarPdfResiduo,
  registrarMtr,
  type DadosDoMtr,
  type Mtr,
} from '@/lib/api/residuos'
import { mensagemDoErro } from '@/lib/erros'

import { CampoObservacao, CampoPdf, CampoSelecao } from './campos'
import { cnpjDoCampo, quantidadeParaTexto } from './comum'

const MAXIMO_DE_ITENS = 100

interface ItemNoFormulario {
  /** Chave local da linha (estável entre renderizações). */
  chave: string
  /** Item já gravado (edição); mandar o id o mantém. */
  id?: string
  codigo: string
  descricao: string
  classe: string
  quantidade: string
  unidade: UnidadeResiduo
}

function itemVazio(): ItemNoFormulario {
  return {
    chave: crypto.randomUUID(),
    codigo: '',
    descricao: '',
    classe: '',
    quantidade: '',
    unidade: 't',
  }
}

type Erros = Record<string, string | undefined>

/**
 * Registrar ou editar MTR (resíduos, fase 1): número e situação digitados do Sistema MTR do IMA,
 * transportador, destinador, resíduos com quantidade e unidade, e o PDF. O id nasce quando o
 * diálogo abre: repetir o envio depois de erro de rede não duplica o MTR. Monte o diálogo só
 * enquanto estiver aberto, para o formulário começar limpo a cada vez.
 */
export function DialogoMtr({
  aoMudar,
  empreendimentoId,
  consultoriaId,
  hoje,
  existente,
  aoSalvar,
}: {
  aoMudar: (aberto: boolean) => void
  empreendimentoId: string
  consultoriaId: string
  hoje: DataCivil
  existente?: Mtr
  /** Chamado quando o MTR foi gravado (mesmo que o PDF falhe depois), para recarregar a lista. */
  aoSalvar: () => void
}) {
  const [id] = useState(() => existente?.id ?? crypto.randomUUID())
  const [numero, setNumero] = useState(existente?.numero ?? '')
  const [emitidoEm, setEmitidoEm] = useState<DataCivil | null>(existente?.emitidoEm ?? null)
  const [situacao, setSituacao] = useState<SituacaoMtr>(existente?.situacao ?? 'salvo')
  const [transportador, setTransportador] = useState(existente?.transportadorNome ?? '')
  const [transportadorCnpj, setTransportadorCnpj] = useState(
    formatarCnpj(existente?.transportadorCnpj),
  )
  const [destinador, setDestinador] = useState(existente?.destinadorNome ?? '')
  const [destinadorCnpj, setDestinadorCnpj] = useState(formatarCnpj(existente?.destinadorCnpj))
  const [observacao, setObservacao] = useState(existente?.observacao ?? '')
  const [itens, setItens] = useState<ItemNoFormulario[]>(() =>
    existente && existente.itens.length > 0
      ? existente.itens.map((item) => ({
          chave: item.id,
          id: item.id,
          codigo: item.residuoCodigo,
          descricao: item.residuoDescricao,
          classe: item.classe ?? '',
          quantidade: quantidadeParaTexto(item.quantidade),
          unidade: item.unidade,
        }))
      : [itemVazio()],
  )
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erros, setErros] = useState<Erros>({})
  // Depois que os dados foram gravados nesta abertura, tentar de novo só reenvia o PDF.
  const [gravado, setGravado] = useState(false)

  function limpar(chave: string) {
    setErros((e) => ({ ...e, [chave]: undefined }))
  }

  function mudarItem(chave: string, mudanca: Partial<ItemNoFormulario>) {
    setItens((lista) => lista.map((i) => (i.chave === chave ? { ...i, ...mudanca } : i)))
  }

  function dados(): DadosDoMtr | null {
    const novos: Erros = {}
    if (!numero.trim()) novos.numero = 'Informe o número do MTR'
    if (!emitidoEm) novos.emitidoEm = 'Informe a data de emissão'
    else if (emitidoEm > hoje) novos.emitidoEm = 'A data de emissão não pode estar no futuro'
    if (!transportador.trim()) novos.transportador = 'Informe o transportador'
    if (situacaoDoCnpj(transportadorCnpj) === 'incompleto')
      novos.transportadorCnpj = 'CNPJ incompleto'
    if (!destinador.trim()) novos.destinador = 'Informe o destinador'
    if (situacaoDoCnpj(destinadorCnpj) === 'incompleto') novos.destinadorCnpj = 'CNPJ incompleto'
    const lidos = itens.map((item) => {
      if (!item.codigo.trim()) novos[`${item.chave}-codigo`] = 'Informe o código'
      if (!item.descricao.trim()) novos[`${item.chave}-descricao`] = 'Informe a descrição'
      const quantidade = lerQuantidade(item.quantidade)
      if (quantidade === null)
        novos[`${item.chave}-quantidade`] = 'Use um número maior que zero, até 4 casas'
      return { item, quantidade }
    })
    setErros(novos)
    if (Object.keys(novos).length > 0 || !emitidoEm) return null
    return {
      numero: numero.trim(),
      emitidoEm,
      situacao,
      transportadorNome: transportador.trim(),
      transportadorCnpj: cnpjDoCampo(transportadorCnpj),
      destinadorNome: destinador.trim(),
      destinadorCnpj: cnpjDoCampo(destinadorCnpj),
      observacao: observacao.trim() || null,
      itens: lidos.map(({ item, quantidade }) => ({
        ...(item.id ? { id: item.id } : {}),
        residuoCodigo: item.codigo.trim(),
        residuoDescricao: item.descricao.trim(),
        classe: item.classe.trim() || null,
        quantidade: quantidade ?? 0,
        unidade: item.unidade,
      })),
    }
  }

  const salvar = useMutation({
    mutationFn: async (dadosDoMtr: DadosDoMtr) => {
      if (!gravado) {
        if (existente) await editarMtr(id, existente.rowVersion, dadosDoMtr)
        else await registrarMtr(id, empreendimentoId, dadosDoMtr)
        setGravado(true)
        aoSalvar()
      }
      if (arquivo) await enviarPdfResiduo('mtr', id, consultoriaId, arquivo)
    },
    onSuccess: () => {
      aoMudar(false)
    },
  })

  function enviar() {
    const prontos = dados()
    if (prontos) salvar.mutate(prontos)
  }

  const titulo = existente ? `Editar MTR ${existente.numero}` : 'Registrar MTR'

  return (
    <Dialogo
      aberto
      aoMudar={aoMudar}
      titulo={titulo}
      largura={760}
      acoes={
        <>
          <Botao
            onClick={() => {
              aoMudar(false)
            }}
          >
            Cancelar
          </Botao>
          <Botao aparencia="primario" disabled={salvar.isPending} onClick={enviar}>
            {salvar.isPending ? 'Salvando…' : existente ? 'Salvar MTR' : 'Registrar MTR'}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-(--e-4)">
        {salvar.isError ? (
          <MensagemSecao role="alert" tom="perigo">
            {gravado
              ? `MTR salvo, mas o PDF não foi enviado. ${mensagemDoErro(salvar.error)}`
              : mensagemDoErro(salvar.error)}
          </MensagemSecao>
        ) : null}

        <div className="grid gap-(--e-3) sm:grid-cols-3">
          <CampoTexto
            rotulo="Número do MTR *"
            value={numero}
            erro={erros.numero}
            maxLength={60}
            onChange={(evento) => {
              setNumero(evento.target.value)
              limpar('numero')
            }}
          />
          <CampoData
            rotulo="Emissão *"
            hoje={hoje}
            maximo={hoje}
            motivoDoLimite="A data de emissão não pode estar no futuro"
            valor={emitidoEm}
            erro={erros.emitidoEm}
            aoMudar={(data) => {
              setEmitidoEm(data)
              limpar('emitidoEm')
            }}
          />
          <CampoSelecao
            rotulo="Situação no IMA *"
            value={situacao}
            onChange={(evento) => {
              if (ehSituacaoMtr(evento.target.value)) setSituacao(evento.target.value)
            }}
          >
            {SITUACOES_DO_MTR.map((s) => (
              <option key={s} value={s}>
                {ROTULO_DA_SITUACAO_DO_MTR[s]}
              </option>
            ))}
          </CampoSelecao>
        </div>

        <div className="grid gap-(--e-3) sm:grid-cols-2">
          <CampoTexto
            rotulo="Transportador *"
            value={transportador}
            erro={erros.transportador}
            maxLength={200}
            onChange={(evento) => {
              setTransportador(evento.target.value)
              limpar('transportador')
            }}
          />
          <CampoTexto
            rotulo="CNPJ do transportador"
            value={transportadorCnpj}
            erro={erros.transportadorCnpj}
            inputMode="text"
            onChange={(evento) => {
              setTransportadorCnpj(mascararCnpj(evento.target.value))
              limpar('transportadorCnpj')
            }}
          />
          <CampoTexto
            rotulo="Destinador *"
            value={destinador}
            erro={erros.destinador}
            maxLength={200}
            onChange={(evento) => {
              setDestinador(evento.target.value)
              limpar('destinador')
            }}
          />
          <CampoTexto
            rotulo="CNPJ do destinador"
            value={destinadorCnpj}
            erro={erros.destinadorCnpj}
            onChange={(evento) => {
              setDestinadorCnpj(mascararCnpj(evento.target.value))
              limpar('destinadorCnpj')
            }}
          />
        </div>

        <section aria-labelledby="titulo-residuos-mtr" className="flex flex-col gap-(--e-3)">
          <h3 id="titulo-residuos-mtr" className="titulo-secao">
            Resíduos
          </h3>
          {itens.map((item, indice) => {
            const ordem = String(indice + 1)
            return (
              <fieldset
                key={item.chave}
                className="relative flex min-w-0 flex-col gap-(--e-2) rounded-(--raio) border p-(--e-3)"
              >
                <legend className="float-left w-full pr-(--e-8) corpo-medio">
                  Resíduo {ordem}
                </legend>
                {itens.length > 1 ? (
                  <BotaoIcone
                    icone="trash-2"
                    rotulo={`Remover resíduo ${ordem}`}
                    tamanho="compacto"
                    className="absolute top-(--e-2) right-(--e-2)"
                    onClick={() => {
                      setItens((lista) => lista.filter((i) => i.chave !== item.chave))
                    }}
                  />
                ) : null}
                <div className="clear-both grid gap-(--e-2) sm:grid-cols-[140px_1fr]">
                  <CampoTexto
                    rotulo={`Código do resíduo ${ordem} *`}
                    value={item.codigo}
                    erro={erros[`${item.chave}-codigo`]}
                    maxLength={20}
                    onChange={(evento) => {
                      mudarItem(item.chave, { codigo: evento.target.value })
                      limpar(`${item.chave}-codigo`)
                    }}
                  />
                  <CampoTexto
                    rotulo={`Descrição do resíduo ${ordem} *`}
                    value={item.descricao}
                    erro={erros[`${item.chave}-descricao`]}
                    maxLength={300}
                    onChange={(evento) => {
                      mudarItem(item.chave, { descricao: evento.target.value })
                      limpar(`${item.chave}-descricao`)
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-(--e-2) sm:grid-cols-3">
                  <CampoTexto
                    rotulo={`Classe do resíduo ${ordem}`}
                    value={item.classe}
                    maxLength={20}
                    className="col-span-2 sm:col-span-1"
                    onChange={(evento) => {
                      mudarItem(item.chave, { classe: evento.target.value })
                    }}
                  />
                  <CampoTexto
                    rotulo={`Quantidade do resíduo ${ordem} *`}
                    value={item.quantidade}
                    erro={erros[`${item.chave}-quantidade`]}
                    inputMode="decimal"
                    onChange={(evento) => {
                      mudarItem(item.chave, { quantidade: evento.target.value })
                      limpar(`${item.chave}-quantidade`)
                    }}
                  />
                  <CampoSelecao
                    rotulo={`Unidade do resíduo ${ordem} *`}
                    value={item.unidade}
                    onChange={(evento) => {
                      if (ehUnidadeResiduo(evento.target.value))
                        mudarItem(item.chave, { unidade: evento.target.value })
                    }}
                  >
                    {UNIDADES_DE_RESIDUO.map((u) => (
                      <option key={u} value={u}>
                        {ROTULO_DA_UNIDADE_DE_RESIDUO[u]}
                      </option>
                    ))}
                  </CampoSelecao>
                </div>
              </fieldset>
            )
          })}
          {itens.length < MAXIMO_DE_ITENS ? (
            <div>
              <Botao
                iconeAntes="plus"
                onClick={() => {
                  setItens((lista) => [...lista, itemVazio()])
                }}
              >
                Adicionar resíduo
              </Botao>
            </div>
          ) : null}
        </section>

        <CampoObservacao valor={observacao} aoMudar={setObservacao} />

        <CampoPdf
          rotulo="PDF do MTR"
          arquivo={arquivo}
          atual={existente?.pdf ?? null}
          erro={erros.arquivo}
          aoEscolher={(escolhido) => {
            setArquivo(escolhido)
            limpar('arquivo')
          }}
          aoErro={(mensagem) => {
            setErros((e) => ({ ...e, arquivo: mensagem }))
          }}
        />
      </div>
    </Dialogo>
  )
}
