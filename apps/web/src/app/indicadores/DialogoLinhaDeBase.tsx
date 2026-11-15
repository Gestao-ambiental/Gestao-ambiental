import {
  adiarLinhaDeBase,
  errosDaLinhaDeBase,
  precisaResponderLinhaDeBase,
  type LinhaDeBase,
} from '@gestao-ambiental/domain'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { useSessao } from '@/app/sessao/contexto-sessao'
import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { obterUltimaLinhaDeBase, responderLinhaDeBase } from '@/lib/api/indicadores-de-valor'
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

const prefixoAdiada = 'grama:linha-de-base:adiada:'

function lerAdiada(chave: string): string | null {
  try {
    return window.localStorage.getItem(prefixoAdiada + chave)
  } catch {
    return null
  }
}

function gravarAdiada(chave: string, ate: string): void {
  try {
    window.localStorage.setItem(prefixoAdiada + chave, ate)
  } catch {
    // Sem armazenamento: o diálogo volta no próximo acesso.
  }
}

/**
 * Linha de base (ADR-0027): as 4 perguntas à Gestão, quando a consultoria nunca respondeu ou a
 * última resposta tem mais de 90 dias. "Responder depois" adia 7 dias para esta pessoa, neste
 * navegador. Não aparece no modo suporte nem para a Equipe.
 */
export function DialogoLinhaDeBase() {
  const { atual, suporte } = useConsultoria()
  const { sessao } = useSessao()
  const cid = atual.consultoriaId
  const chaveAdiada = `${sessao?.user.id ?? ''}:${cid}`
  const ehGestao = atual.papel === 'gestao' && !suporte
  const queryClient = useQueryClient()
  const [adiada, setAdiada] = useState(() => lerAdiada(chaveAdiada))
  const [respostas, setRespostas] = useState(VAZIO)
  const [erros, setErros] = useState<Partial<Record<keyof LinhaDeBase, string>>>({})
  const [falha, setFalha] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const ultima = useQuery({
    queryKey: ['linha-de-base', cid],
    queryFn: () => obterUltimaLinhaDeBase(cid),
    enabled: ehGestao,
    retry: false,
  })

  const aberto =
    ehGestao &&
    ultima.isSuccess &&
    ultima.data !== undefined &&
    precisaResponderLinhaDeBase(ultima.data, new Date(), adiada)

  function responderDepois() {
    const ate = adiarLinhaDeBase(new Date())
    gravarAdiada(chaveAdiada, ate)
    setAdiada(ate)
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
        if (!valor) responderDepois()
      }}
      titulo="Antes do Grama"
      largura={560}
      acoes={
        <>
          <Botao disabled={salvando} onClick={responderDepois}>
            Responder depois
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
        className="flex flex-col gap-(--space-200)"
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
            acessorio={<span className="text-xs text-(--text-subtle)">{unidade}</span>}
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
