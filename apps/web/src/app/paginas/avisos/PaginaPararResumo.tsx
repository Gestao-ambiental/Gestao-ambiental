import { useMutation } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router'

import { EstadoErro } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { pararResumoPorLink } from '@/lib/api/avisos'
import { codigoDoErro, mensagemDoErro } from '@/lib/erros'

import { CabecalhoAcesso, RodapeAcesso } from '../acesso/CabecalhoAcesso'

/**
 * /avisos/parar#<token> (ADR-0047): descadastro do resumo diário sem login, pelo link do e-mail.
 * O token vem no fragmento (não vai para o log do servidor). Abrir a página nunca desliga nada:
 * só o botão (POST), porque antivírus e pré-visualizações abrem links sozinhos.
 */
export function PaginaPararResumo() {
  const { hash } = useLocation()
  const token = hash.replace(/^#/, '').trim()
  const parar = useMutation({ mutationFn: () => pararResumoPorLink(token) })

  const linkInvalido = !token || codigoDoErro(parar.error) === 'link_invalido'

  let conteudo
  if (parar.isSuccess) {
    conteudo = (
      <MensagemSecao role="status" tom="sucesso">
        Pronto. O resumo diário foi desligado.
      </MensagemSecao>
    )
  } else if (linkInvalido) {
    conteudo = (
      <MensagemSecao role="alert" tom="perigo" titulo="Link inválido">
        {mensagemDoErro(new Error('link_invalido'))}
      </MensagemSecao>
    )
  } else if (parar.isError) {
    conteudo = (
      <EstadoErro
        titulo="Não foi possível desligar"
        aoTentarDeNovo={() => {
          parar.mutate()
        }}
      />
    )
  } else {
    conteudo = (
      <Botao
        aparencia="primario"
        larguraTotal
        disabled={parar.isPending}
        onClick={() => {
          parar.mutate()
        }}
      >
        {parar.isPending ? 'Desligando…' : 'Parar de receber'}
      </Botao>
    )
  }

  return (
    <div className="flex flex-col gap-(--e-6)">
      <CabecalhoAcesso titulo="Parar de receber o resumo diário" tituloDaAba="Resumo diário" />
      {conteudo}
      <RodapeAcesso>
        <Link to="/entrar">Entrar no Grama</Link>
      </RodapeAcesso>
    </div>
  )
}
