import { type DataCivil } from '@gestao-ambiental/domain'
import { useMutation } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'

import { classeCampo } from '@/app/paginas/orcamentos/comum'
import { Botao } from '@/components/ui/botao'
import { CampoData } from '@/components/ui/campo-data'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { editarAlvara, registrarAlvara, type Alvara } from '@/lib/api/alvaras'
import type { Unidade } from '@/lib/api/empreendimentos'
import { conferirPdf, type ProblemaDoPdf } from '@/lib/api/licencas'
import { mensagemDoErro } from '@/lib/erros'

const PROBLEMAS: Record<ProblemaDoPdf, string> = {
  nao_pdf: 'Este arquivo não é um PDF válido.',
  grande_demais: 'O arquivo passa de 25 MB.',
  vazio: 'O arquivo está vazio.',
}

export type ModoDoAlvara =
  { tipo: 'novo' } | { tipo: 'renovar'; anterior: Alvara } | { tipo: 'editar'; alvara: Alvara }

const TITULOS = { novo: 'Novo alvará', renovar: 'Renovar alvará', editar: 'Editar alvará' }

/**
 * Cadastro do alvará (ALV-01): unidade, validade e PDF obrigatórios; número, órgão e notas
 * opcionais. Renovar (ALV-02) cria um novo ligado ao anterior, que fica guardado.
 */
export function DialogoAlvara({
  modo,
  consultoriaId,
  unidades,
  hoje,
  aoFechar,
  aoSalvar,
}: {
  modo: ModoDoAlvara
  consultoriaId: string
  unidades: readonly Unidade[]
  hoje: DataCivil
  aoFechar: () => void
  aoSalvar: () => Promise<void>
}) {
  const id = useId()
  const entrada = useRef<HTMLInputElement>(null)
  // Id gerado aqui: repetir depois de erro de rede não registra outro alvará.
  const [versaoId] = useState(() => crypto.randomUUID())
  const base = modo.tipo === 'editar' ? modo.alvara : modo.tipo === 'renovar' ? modo.anterior : null
  const [unidadeId, setUnidadeId] = useState(base?.unidadeId ?? unidades[0]?.id ?? '')
  const [validade, setValidade] = useState<DataCivil | null>(
    modo.tipo === 'editar' ? modo.alvara.validade : null,
  )
  const [numero, setNumero] = useState(modo.tipo === 'editar' ? (modo.alvara.numero ?? '') : '')
  const [orgao, setOrgao] = useState(base?.orgao ?? '')
  const [notas, setNotas] = useState(modo.tipo === 'editar' ? (modo.alvara.notas ?? '') : '')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erros, setErros] = useState<{ unidade?: string; validade?: string; arquivo?: string }>({})

  const salvar = useMutation({
    mutationFn: async () => {
      if (!validade) throw new Error('sem validade')
      const dados = { validade, numero, orgao, notas }
      if (modo.tipo === 'editar') {
        await editarAlvara(modo.alvara, dados)
        return
      }
      if (!arquivo) throw new Error('sem PDF')
      await registrarAlvara(
        consultoriaId,
        versaoId,
        unidadeId,
        dados,
        arquivo,
        modo.tipo === 'renovar' ? modo.anterior.id : null,
      )
    },
    onSuccess: aoSalvar,
  })

  async function escolher(escolhido: File | undefined) {
    if (!escolhido) return
    const problema = await conferirPdf(escolhido)
    if (problema) {
      setErros((e) => ({ ...e, arquivo: PROBLEMAS[problema] }))
      return
    }
    setErros((e) => ({ ...e, arquivo: undefined }))
    setArquivo(escolhido)
  }

  function enviar() {
    const novos: typeof erros = {}
    if (!unidadeId) novos.unidade = 'Escolha a unidade'
    if (!validade) novos.validade = 'Informe a validade'
    if (modo.tipo !== 'editar' && !arquivo) novos.arquivo = 'Anexe o PDF do alvará'
    setErros(novos)
    if (Object.keys(novos).length === 0) salvar.mutate()
  }

  return (
    <Dialogo
      aberto
      aoMudar={(aberto) => {
        if (!aberto) aoFechar()
      }}
      titulo={TITULOS[modo.tipo]}
      acoes={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao aparencia="primario" disabled={salvar.isPending} onClick={enviar}>
            {salvar.isPending ? 'Salvando…' : 'Salvar alvará'}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-(--space-150)">
        {salvar.isError ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErro(salvar.error)}
          </MensagemSecao>
        ) : null}
        <div className="flex flex-col gap-(--space-050)">
          <label htmlFor={`${id}-unidade`} className="rotulo">
            Unidade *
          </label>
          <select
            id={`${id}-unidade`}
            className={classeCampo}
            value={unidadeId}
            disabled={modo.tipo !== 'novo'}
            aria-invalid={erros.unidade ? true : undefined}
            onChange={(evento) => {
              setUnidadeId(evento.target.value)
              setErros((e) => ({ ...e, unidade: undefined }))
            }}
          >
            {unidades.length === 0 ? <option value="">Nenhuma unidade</option> : null}
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
          {erros.unidade ? (
            <span role="alert" className="text-xs text-(--text-danger)">
              {erros.unidade}
            </span>
          ) : null}
        </div>
        <CampoData
          rotulo="Validade *"
          hoje={hoje}
          valor={validade}
          erro={erros.validade}
          aoMudar={(nova) => {
            setValidade(nova)
            setErros((e) => ({ ...e, validade: undefined }))
          }}
        />
        <CampoTexto
          rotulo="Número"
          value={numero}
          maxLength={60}
          onChange={(evento) => {
            setNumero(evento.target.value)
          }}
        />
        <CampoTexto
          rotulo="Órgão"
          value={orgao}
          maxLength={120}
          onChange={(evento) => {
            setOrgao(evento.target.value)
          }}
        />
        <CampoTexto
          rotulo="Notas"
          value={notas}
          maxLength={2000}
          onChange={(evento) => {
            setNotas(evento.target.value)
          }}
        />
        {modo.tipo === 'editar' ? null : (
          <div className="flex flex-col gap-(--space-050)">
            <span className="rotulo" id={`${id}-rotulo-pdf`}>
              PDF do alvará *
            </span>
            <div className="flex items-center gap-(--space-100) rounded-(--radius) border border-dashed border-(--border-strong) p-(--space-100)">
              <Icone nome="paperclip" className="text-(--icon)" />
              <span className="min-w-0 flex-1 truncate corpo">
                {arquivo ? arquivo.name : 'PDF até 25 MB'}
              </span>
              <Botao
                tamanho="compacto"
                aria-describedby={`${id}-rotulo-pdf`}
                onClick={() => {
                  entrada.current?.click()
                }}
              >
                {arquivo ? 'Trocar' : 'Escolher arquivo'}
              </Botao>
              <input
                ref={entrada}
                type="file"
                accept="application/pdf"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                data-testid="pdf-do-alvara"
                onChange={(evento) => {
                  void escolher(evento.target.files?.[0])
                  evento.target.value = ''
                }}
              />
            </div>
            {erros.arquivo ? (
              <span role="alert" className="text-xs text-(--text-danger)">
                {erros.arquivo}
              </span>
            ) : null}
          </div>
        )}
      </div>
    </Dialogo>
  )
}
