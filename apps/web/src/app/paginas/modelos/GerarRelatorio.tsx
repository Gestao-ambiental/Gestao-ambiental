// Gerar relatório a partir de um modelo (ADR-0036, fatia 2): escolhe o modelo, o Grama preenche os
// campos com o cadastro e baixa o .docx. Nada fica guardado: a pessoa edita no Word e anexa o
// arquivo final como evidência.
import {
  nomeDoArquivoDoRelatorio,
  preencherModelo,
  rotuloDoCampo,
  valoresDoRelatorio,
} from '@gestao-ambiental/domain'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Botao } from '@/components/ui/botao'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  dadosParaRelatorio,
  listarModelosDeDocumento,
  obterModeloDeDocumento,
} from '@/lib/api/modelos-de-documento'
import { mensagemDoErro } from '@/lib/erros'

interface Props {
  empreendimentoId: string
  empreendimentoNome: string
  /** Na ocorrência: preenche também licença e condicionante. */
  ocorrenciaId?: string
  aberto: boolean
  aoMudar: (aberto: boolean) => void
}

export function DialogoGerarRelatorio({
  empreendimentoId,
  empreendimentoNome,
  ocorrenciaId,
  aberto,
  aoMudar,
}: Props) {
  const { atual } = useConsultoria()
  const idDoGrupo = useId()
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const [semValor, setSemValor] = useState<string[] | null>(null)
  const modelos = useQuery({
    queryKey: ['modelos-de-documento', atual.consultoriaId],
    queryFn: () => listarModelosDeDocumento(atual.consultoriaId),
    enabled: aberto,
  })
  const lista = modelos.data ?? []
  const selecionado = escolhido ?? lista[0]?.id ?? null

  const gerar = useMutation({
    mutationFn: async (modeloId: string) => {
      const [modelo, dados, word] = await Promise.all([
        obterModeloDeDocumento(modeloId),
        dadosParaRelatorio(empreendimentoId, ocorrenciaId ?? null),
        import('@/lib/docx-do-modelo'),
      ])
      if (!modelo || modelo.arquivado) throw new Error('modelo_arquivado')
      const preenchido = preencherModelo(modelo.conteudo, valoresDoRelatorio(dados))
      const arquivo = await word.gerarDocx(preenchido.documento)
      word.baixarArquivo(arquivo, nomeDoArquivoDoRelatorio(modelo.nome, empreendimentoNome))
      return preenchido.semValor
    },
    onSuccess: (faltando) => {
      if (faltando.length === 0) {
        aoMudar(false)
        return
      }
      setSemValor(faltando.map(rotuloDoCampo))
    },
  })

  function mudar(valor: boolean) {
    if (!valor) {
      setSemValor(null)
      gerar.reset()
    }
    aoMudar(valor)
  }

  const ehGestao = atual.papel === 'gestao'

  return (
    <Dialogo
      aberto={aberto}
      aoMudar={mudar}
      titulo="Gerar relatório"
      acoes={
        semValor ? (
          <Botao
            aparencia="primario"
            onClick={() => {
              mudar(false)
            }}
          >
            Fechar
          </Botao>
        ) : (
          <>
            <Botao
              onClick={() => {
                mudar(false)
              }}
            >
              Cancelar
            </Botao>
            <Botao
              aparencia="primario"
              iconeAntes="download"
              disabled={!selecionado || gerar.isPending}
              onClick={() => {
                if (selecionado) gerar.mutate(selecionado)
              }}
            >
              {gerar.isPending ? 'Gerando' : 'Baixar .docx'}
            </Botao>
          </>
        )
      }
    >
      {semValor ? (
        <MensagemSecao tom="atencao" role="status" titulo="Relatório baixado com campos em branco">
          {semValor.join(', ')}
        </MensagemSecao>
      ) : modelos.isPending ? (
        <p role="status" className="corpo text-(--text-subtle)">
          Carregando modelos
        </p>
      ) : modelos.isError ? (
        <MensagemSecao tom="perigo" role="alert">
          {mensagemDoErro(modelos.error)}
        </MensagemSecao>
      ) : lista.length === 0 ? (
        <div className="flex flex-col gap-(--space-100)">
          <p className="corpo-medio">Nenhum modelo cadastrado.</p>
          {ehGestao ? <Link to="/configuracoes/modelos/novo">Criar modelo</Link> : null}
        </div>
      ) : (
        <fieldset className="flex flex-col gap-(--space-050)">
          <legend className="mb-(--space-050) rotulo">Modelo</legend>
          <div className="flex max-h-[320px] flex-col overflow-y-auto rounded-(--radius) border">
            {lista.map((modelo) => (
              <label
                key={modelo.id}
                className="flex cursor-pointer items-center gap-(--space-100) border-b px-(--space-150) py-(--space-100) last:border-b-0 hover:bg-(--surface-hover)"
              >
                <input
                  type="radio"
                  name={idDoGrupo}
                  value={modelo.id}
                  checked={selecionado === modelo.id}
                  onChange={() => {
                    setEscolhido(modelo.id)
                  }}
                />
                <span className="corpo">{modelo.nome}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {gerar.isError ? (
        <MensagemSecao tom="perigo" role="alert">
          {mensagemDoErro(gerar.error)}
        </MensagemSecao>
      ) : null}
    </Dialogo>
  )
}

/** Botão discreto que abre o diálogo (seção Evidência e página do empreendimento). */
export function BotaoGerarRelatorio(props: Omit<Props, 'aberto' | 'aoMudar'>) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <Botao
        aparencia="sutil"
        iconeAntes="file-text"
        onClick={() => {
          setAberto(true)
        }}
      >
        Gerar relatório
      </Botao>
      <DialogoGerarRelatorio {...props} aberto={aberto} aoMudar={setAberto} />
    </>
  )
}
