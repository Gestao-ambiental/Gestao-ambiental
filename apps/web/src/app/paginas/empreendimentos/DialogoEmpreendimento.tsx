import { mascararCnpj, situacaoDoCnpj } from '@gestao-ambiental/domain'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'

import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  buscarParecidos,
  criarEmpreendimento,
  editarEmpreendimento,
  type Empreendimento,
  type Parecido,
} from '@/lib/api/empreendimentos'
import { mensagemDoErro } from '@/lib/erros'

const esquema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome do empreendimento'),
  cliente: z.string(),
  cnpj: z.string().refine((valor) => situacaoDoCnpj(valor) !== 'incompleto', 'CNPJ incompleto'),
  primeiraUnidade: z.string(),
})
type Dados = z.infer<typeof esquema>

function textoDoAviso(parecido: Parecido): string {
  const motivo =
    parecido.mesmoNome && parecido.mesmoCnpj
      ? 'com este nome e este CNPJ'
      : parecido.mesmoCnpj
        ? 'com este CNPJ'
        : 'com este nome'
  return `Já existe ${parecido.nome} ${motivo}.`
}

/**
 * Modal "Novo empreendimento" e "Editar" (Protótipo 08; EMP-01). Só o nome é obrigatório.
 * Nome ou CNPJ repetido mostra um aviso que não bloqueia: abrir o existente ou seguir.
 */
export function DialogoEmpreendimento({
  aberto,
  aoMudar,
  consultoriaId,
  existente,
  aoSalvar,
}: {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  consultoriaId: string
  /** Presente ao editar. */
  existente?: Empreendimento
  aoSalvar: (id: string) => void
}) {
  const navegar = useNavigate()
  const editando = Boolean(existente)
  // Id gerado aqui: salvar de novo depois de um erro de rede não cria outro empreendimento.
  const [id, setId] = useState(() => crypto.randomUUID())
  const [parecidos, setParecidos] = useState<Parecido[] | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)

  const valoresIniciais: Dados = {
    nome: existente?.nome ?? '',
    cliente: existente?.clienteNome ?? '',
    cnpj: mascararCnpj(existente?.cnpj ?? ''),
    primeiraUnidade: '',
  }

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<Dados>({
    resolver: zodResolver(esquema),
    mode: 'onTouched',
    values: valoresIniciais,
    resetOptions: { keepDirtyValues: true },
  })

  function fechar() {
    reset(valoresIniciais)
    setParecidos(null)
    setFalha(null)
    setId(crypto.randomUUID())
    aoMudar(false)
  }

  async function salvar(dados: Dados, confirmado: boolean) {
    setFalha(null)
    setSalvando(true)
    try {
      if (!confirmado) {
        const encontrados = await buscarParecidos(
          consultoriaId,
          dados.nome,
          dados.cnpj,
          existente?.id,
        )
        if (encontrados.length > 0) {
          setParecidos(encontrados)
          return
        }
      }
      const comuns = { nome: dados.nome, cliente: dados.cliente, cnpj: dados.cnpj }
      if (existente) {
        await editarEmpreendimento(existente.id, comuns)
        aoSalvar(existente.id)
      } else {
        await criarEmpreendimento(id, consultoriaId, {
          ...comuns,
          primeiraUnidade: dados.primeiraUnidade,
        })
        aoSalvar(id)
      }
      fechar()
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
    } finally {
      setSalvando(false)
    }
  }

  const enviar = handleSubmit((dados) => salvar(dados, false))
  const seguirMesmoAssim = handleSubmit((dados) => salvar(dados, true))
  const primeiro = parecidos?.[0]

  const campoCnpj = register('cnpj', {
    onChange: (evento: { target: { value: string } }) => {
      setValue('cnpj', mascararCnpj(evento.target.value))
    },
  })
  const campoNome = register('nome', {
    onChange: () => {
      setParecidos(null)
    },
  })

  return (
    <Dialogo
      aberto={aberto}
      aoMudar={(valor) => {
        if (!valor) fechar()
        else aoMudar(true)
      }}
      titulo={editando ? 'Editar empreendimento' : 'Novo empreendimento'}
      acoes={
        <>
          <Botao disabled={salvando} onClick={fechar}>
            Cancelar
          </Botao>
          <Botao
            type="submit"
            form="form-empreendimento"
            aparencia="primario"
            disabled={salvando}
            aria-busy={salvando || undefined}
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </Botao>
        </>
      }
    >
      <form
        id="form-empreendimento"
        noValidate
        onSubmit={(evento) => void enviar(evento)}
        className="flex flex-col gap-(--space-200)"
      >
        {primeiro ? (
          <MensagemSecao
            role="status"
            tom="atencao"
            acoes={
              <>
                <Botao
                  tamanho="compacto"
                  onClick={() => {
                    fechar()
                    void navegar(`/empreendimentos/${primeiro.id}`)
                  }}
                >
                  Abrir o existente
                </Botao>
                <Botao
                  tamanho="compacto"
                  aparencia="sutil"
                  disabled={salvando}
                  onClick={() => void seguirMesmoAssim()}
                >
                  {editando ? 'Salvar mesmo assim' : 'Criar mesmo assim'}
                </Botao>
              </>
            }
          >
            {textoDoAviso(primeiro)}
          </MensagemSecao>
        ) : null}
        {falha ? (
          <MensagemSecao role="alert" tom="perigo">
            {falha}
          </MensagemSecao>
        ) : null}
        <CampoTexto
          rotulo="Nome do empreendimento"
          required
          disabled={salvando}
          erro={errors.nome?.message}
          {...campoNome}
        />
        <div className="grid gap-(--space-200) sm:grid-cols-2">
          <CampoTexto
            rotulo="Cliente contratante"
            disabled={salvando}
            autoComplete="organization"
            {...register('cliente')}
          />
          <CampoTexto
            rotulo="CNPJ"
            placeholder="00.000.000/0000-00"
            disabled={salvando}
            autoComplete="off"
            erro={errors.cnpj?.message}
            {...campoCnpj}
          />
        </div>
        {editando ? null : (
          <CampoTexto
            rotulo="Primeira unidade"
            placeholder="Nome ou endereço"
            ajuda="Você pode adicionar unidades depois. Filiais são unidades do mesmo empreendimento."
            disabled={salvando}
            {...register('primeiraUnidade')}
          />
        )}
        <p className="text-xs text-(--text-subtle)">Só o nome é obrigatório.</p>
      </form>
    </Dialogo>
  )
}
