import { errosDaLinhaDeBase, type LinhaDeBase } from '@gestao-ambiental/domain'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { responderLinhaDeBase } from '@/lib/api/indicadores-de-valor'
import { mensagemDoErro } from '@/lib/erros'

const PERGUNTAS: { campo: keyof LinhaDeBase; rotulo: string; unidade: string }[] = [
  {
    campo: 'licencasAtivas',
    rotulo: 'Quantas licenças ativas vocês acompanham hoje?',
    unidade: 'licenças',
  },
  {
    campo: 'horasSemanaConferindo',
    rotulo: 'Quantas horas por semana a equipe gasta conferindo prazos e cobrando pessoas?',
    unidade: 'h por semana',
  },
  {
    campo: 'minutosPorCondicionante',
    rotulo: 'Quantos minutos leva para cadastrar uma condicionante à mão?',
    unidade: 'min',
  },
  {
    campo: 'surpresasPorMes',
    rotulo: 'Quantas vezes por mês um prazo pegou a equipe de surpresa?',
    unidade: 'vezes por mês',
  },
]

const VAZIO: Record<keyof LinhaDeBase, string> = {
  licencasAtivas: '',
  horasSemanaConferindo: '',
  minutosPorCondicionante: '',
  surpresasPorMes: '',
}

/**
 * Linha de base (ADR-0027, ADR-0057): as 4 perguntas da Gestão. As respostas chegam do quiz do site
 * quando a consultoria é criada; aqui a Gestão preenche ou corrige, por Configurações. Não abre
 * sozinho.
 */
export function DialogoLinhaDeBase({
  aberto,
  aoMudar,
}: {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
}) {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const queryClient = useQueryClient()
  const [respostas, setRespostas] = useState(VAZIO)
  const [erros, setErros] = useState<Partial<Record<keyof LinhaDeBase, string>>>({})
  const [falha, setFalha] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  function fechar() {
    setRespostas(VAZIO)
    setErros({})
    setFalha(null)
    aoMudar(false)
  }

  async function enviar() {
    const encontrados = errosDaLinhaDeBase(respostas)
    setErros(encontrados)
    if (Object.keys(encontrados).length > 0) return
    const numero = (campo: keyof LinhaDeBase) => Number(respostas[campo].trim().replace(',', '.'))
    setFalha(null)
    setSalvando(true)
    try {
      await responderLinhaDeBase(cid, {
        licencasAtivas: numero('licencasAtivas'),
        horasSemanaConferindo: numero('horasSemanaConferindo'),
        minutosPorCondicionante: numero('minutosPorCondicionante'),
        surpresasPorMes: numero('surpresasPorMes'),
      })
      await queryClient.invalidateQueries({ queryKey: ['linha-de-base', cid] })
      fechar()
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialogo
      aberto={aberto}
      aoMudar={(valor) => {
        if (!valor) fechar()
      }}
      titulo="Antes do Grama"
      largura={560}
      acoes={
        <>
          <Botao disabled={salvando} onClick={fechar}>
            Cancelar
          </Botao>
          <Botao
            type="submit"
            form="form-linha-de-base"
            aparencia="primario"
            disabled={salvando}
            aria-busy={salvando || undefined}
          >
            {salvando ? 'Salvando…' : 'Salvar respostas'}
          </Botao>
        </>
      }
    >
      <form
        id="form-linha-de-base"
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault()
          void enviar()
        }}
        className="flex flex-col gap-(--e-4)"
      >
        {falha ? (
          <MensagemSecao role="alert" tom="perigo">
            {falha}
          </MensagemSecao>
        ) : null}
        {PERGUNTAS.map(({ campo, rotulo, unidade }) => (
          <CampoTexto
            key={campo}
            rotulo={rotulo}
            inputMode="decimal"
            value={respostas[campo]}
            erro={erros[campo]}
            disabled={salvando}
            acessorio={<span className="text-xs text-(--tinta-2)">{unidade}</span>}
            onChange={(evento) => {
              const valor = evento.target.value
              setRespostas((a) => ({ ...a, [campo]: valor }))
            }}
          />
        ))}
      </form>
    </Dialogo>
  )
}
