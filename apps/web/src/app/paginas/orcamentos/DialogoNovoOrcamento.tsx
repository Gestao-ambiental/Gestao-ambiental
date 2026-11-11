import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { listarEmpreendimentos } from '@/lib/api/empreendimentos'
import { criarOrcamento } from '@/lib/api/orcamentos'
import { mensagemDoErro } from '@/lib/erros'

import { classeCampo } from './comum'

/**
 * "Novo orçamento": escolhe o empreendimento e diz o objeto. O resto se preenche no rascunho.
 * O id nasce aqui: repetir depois de um erro de rede não cria outro orçamento.
 */
export function DialogoNovoOrcamento({
  aberto,
  aoMudar,
  consultoriaId,
  aoCriar,
}: {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  consultoriaId: string
  aoCriar: (id: string) => void
}) {
  const [id, setId] = useState(() => crypto.randomUUID())
  const [empreendimentoId, setEmpreendimentoId] = useState('')
  const [objeto, setObjeto] = useState('')
  const [erros, setErros] = useState<{ empreendimento?: string; objeto?: string }>({})
  const [falha, setFalha] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const empreendimentos = useQuery({
    queryKey: ['empreendimentos', consultoriaId, '', 'para-orcamento'],
    queryFn: () => listarEmpreendimentos(consultoriaId, '', 0),
    enabled: aberto,
  })

  function fechar() {
    setId(crypto.randomUUID())
    setEmpreendimentoId('')
    setObjeto('')
    setErros({})
    setFalha(null)
    aoMudar(false)
  }

  async function criar() {
    const novosErros = {
      ...(empreendimentoId ? {} : { empreendimento: 'Escolha o empreendimento' }),
      ...(objeto.trim() ? {} : { objeto: 'Diga o que será orçado' }),
    }
    setErros(novosErros)
    if (Object.keys(novosErros).length > 0) return
    setFalha(null)
    setSalvando(true)
    try {
      await criarOrcamento(id, consultoriaId, empreendimentoId, objeto)
      aoCriar(id)
      fechar()
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
    } finally {
      setSalvando(false)
    }
  }

  const opcoes = empreendimentos.data?.itens ?? []

  return (
    <Dialogo
      aberto={aberto}
      aoMudar={(valor) => {
        if (!valor) fechar()
        else aoMudar(true)
      }}
      titulo="Novo orçamento"
      acoes={
        <>
          <Botao disabled={salvando} onClick={fechar}>
            Cancelar
          </Botao>
          <Botao
            type="submit"
            form="form-novo-orcamento"
            aparencia="primario"
            disabled={salvando}
            aria-busy={salvando || undefined}
          >
            {salvando ? 'Criando…' : 'Criar rascunho'}
          </Botao>
        </>
      }
    >
      <form
        id="form-novo-orcamento"
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault()
          void criar()
        }}
        className="flex flex-col gap-(--space-200)"
      >
        {falha ? (
          <MensagemSecao role="alert" tom="perigo">
            {falha}
          </MensagemSecao>
        ) : null}
        <div className="flex flex-col gap-(--space-050)">
          <label htmlFor="novo-orcamento-empreendimento" className="rotulo">
            Empreendimento
          </label>
          <select
            id="novo-orcamento-empreendimento"
            className={classeCampo}
            value={empreendimentoId}
            disabled={salvando || empreendimentos.isPending}
            aria-invalid={erros.empreendimento ? true : undefined}
            aria-describedby={
              erros.empreendimento ? 'novo-orcamento-empreendimento-erro' : undefined
            }
            onChange={(evento) => {
              setEmpreendimentoId(evento.target.value)
            }}
          >
            <option value="">
              {empreendimentos.isPending ? 'Carregando…' : 'Escolha o empreendimento'}
            </option>
            {opcoes.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
          {erros.empreendimento ? (
            <p id="novo-orcamento-empreendimento-erro" className="text-xs text-(--text-danger)">
              {erros.empreendimento}
            </p>
          ) : null}
          {empreendimentos.isSuccess && opcoes.length === 0 ? (
            <p className="text-xs text-(--text-subtle)">
              Cadastre o empreendimento antes, em Empreendimentos.
            </p>
          ) : null}
        </div>
        <CampoTexto
          rotulo="O que será orçado"
          placeholder="Ex.: Licenciamento (LO)"
          required
          value={objeto}
          disabled={salvando}
          erro={erros.objeto}
          onChange={(evento) => {
            setObjeto(evento.target.value)
          }}
        />
      </form>
    </Dialogo>
  )
}
