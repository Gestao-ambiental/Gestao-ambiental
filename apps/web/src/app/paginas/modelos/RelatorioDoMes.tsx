// Relatório mensal ao cliente (P6, ADR-0052): "…" do empreendimento › Gerar relatório do mês. A
// Gestão escolhe o mês; o Grama preenche o modelo-semente "Resumo para o cliente" (licenças e
// validades, entregas, protocolos e próximos 90 dias) e baixa o .docx ou abre no editor.
import {
  NOME_DO_RESUMO_PARA_O_CLIENTE,
  hojeNoFuso,
  mesPorExtenso,
  mesesDoResumo,
  modeloResumoParaOCliente,
  nomeDoArquivoDoRelatorio,
  preencherModelo,
  valoresDoRelatorioMensal,
} from '@gestao-ambiental/domain'
import { useMutation } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useNavigate } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Botao } from '@/components/ui/botao'
import { Dialogo } from '@/components/ui/dialogo'
import { classeSelecao } from '@/components/ui/estilos-campo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { dadosParaRelatorioMensal } from '@/lib/api/relatorio-mensal'
import { criarRelatorio } from '@/lib/api/relatorios'
import { mensagemDoErro } from '@/lib/erros'

interface Props {
  empreendimentoId: string
  empreendimentoNome: string
  aberto: boolean
  aoMudar: (aberto: boolean) => void
}

async function preencher(empreendimentoId: string, mes: string) {
  const dados = await dadosParaRelatorioMensal(empreendimentoId, mes)
  const { valores, listas } = valoresDoRelatorioMensal(dados)
  return preencherModelo(modeloResumoParaOCliente(), valores, listas).documento
}

export function DialogoRelatorioDoMes({
  empreendimentoId,
  empreendimentoNome,
  aberto,
  aoMudar,
}: Props) {
  const { atual } = useConsultoria()
  const idDoMes = useId()
  // O mês anterior vem escolhido: o relatório costuma sair no começo do mês seguinte.
  const [meses] = useState(() => mesesDoResumo(hojeNoFuso(new Date(), atual.fuso)))
  const [mes, setMes] = useState(() => meses[1] ?? meses[0] ?? '')
  const titulo = `${NOME_DO_RESUMO_PARA_O_CLIENTE} - ${mesPorExtenso(mes)}`

  const baixar = useMutation({
    mutationFn: async () => {
      const [documento, word] = await Promise.all([
        preencher(empreendimentoId, mes),
        import('@/lib/docx-do-modelo'),
      ])
      const arquivo = await word.gerarDocx(documento)
      word.baixarArquivo(arquivo, nomeDoArquivoDoRelatorio(titulo, empreendimentoNome))
    },
    onSuccess: () => {
      aoMudar(false)
    },
  })

  const navegar = useNavigate()
  const escrever = useMutation({
    mutationFn: async () => {
      const documento = await preencher(empreendimentoId, mes)
      const id = crypto.randomUUID()
      await criarRelatorio({
        id,
        empreendimentoId,
        ocorrenciaId: null,
        modeloId: null,
        titulo,
        conteudo: documento,
      })
      return id
    },
    onSuccess: (id) => {
      void navegar(`/relatorios/${id}`)
    },
  })

  const ocupado = baixar.isPending || escrever.isPending
  const erro = baixar.error ?? escrever.error

  return (
    <Dialogo
      aberto={aberto}
      aoMudar={(valor) => {
        if (!valor) {
          baixar.reset()
          escrever.reset()
        }
        aoMudar(valor)
      }}
      titulo="Relatório do mês"
      acoes={
        <>
          <Botao
            iconeAntes="download"
            disabled={ocupado || !mes}
            onClick={() => {
              baixar.mutate()
            }}
          >
            {baixar.isPending ? 'Gerando' : 'Baixar .docx'}
          </Botao>
          <Botao
            aparencia="primario"
            iconeAntes="pencil"
            disabled={ocupado || !mes}
            onClick={() => {
              escrever.mutate()
            }}
          >
            {escrever.isPending ? 'Abrindo' : 'Escrever no Grama'}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-(--e-1)">
        <label htmlFor={idDoMes} className="rotulo text-(--tinta)">
          Mês
        </label>
        <select
          id={idDoMes}
          value={mes}
          className={classeSelecao}
          onChange={(evento) => {
            setMes(evento.target.value)
          }}
        >
          {meses.map((m) => (
            <option key={m} value={m}>
              {mesPorExtenso(m)}
            </option>
          ))}
        </select>
      </div>
      {erro ? (
        <MensagemSecao tom="perigo" role="alert">
          {mensagemDoErro(erro)}
        </MensagemSecao>
      ) : null}
    </Dialogo>
  )
}
