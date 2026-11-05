import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { NOMES_PAPEL } from '@/app/papeis'
import { useSessao, usuarioDaSessao } from '@/app/sessao/contexto-sessao'
import { Carregando, EstadoErro, SemPermissao } from '@/components/estados'
import { Avatar } from '@/components/ui/avatar'
import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  conferirFoto,
  definirCargo,
  enviarFoto,
  meuPerfil,
  removerFoto,
  TAMANHO_MAXIMO_CARGO,
  type MembroAtivo,
  type ProblemaDaFoto,
} from '@/lib/api/perfil'
import { ehSemPermissao, mensagemDoErro } from '@/lib/erros'

import { Pagina } from '../Pagina'

const PROBLEMAS_DA_FOTO: Record<ProblemaDaFoto, string> = {
  tipo: 'Envie uma imagem PNG ou JPEG.',
  vazio: 'Este arquivo está vazio.',
  grande_demais: 'A imagem passa de 2 MB.',
}

/**
 * /perfil: foto e cargo da pessoa nesta consultoria. Aparecem no seletor de responsável (foto e,
 * embaixo do nome, o cargo). Cada consultoria tem o seu: o perfil é do vínculo.
 */
export function PaginaPerfil() {
  const { atual } = useConsultoria()
  const perfil = useQuery({
    queryKey: ['meu-perfil', atual.membroId],
    queryFn: () => meuPerfil(atual.membroId),
  })

  if (ehSemPermissao(perfil.error)) {
    return (
      <Pagina titulo="Meu perfil">
        <SemPermissao />
      </Pagina>
    )
  }
  return (
    <Pagina titulo="Meu perfil">
      {perfil.isPending ? (
        <Carregando rotulo="Carregando perfil" linhas={3} />
      ) : perfil.isError ? (
        <EstadoErro aoTentarDeNovo={() => void perfil.refetch()} />
      ) : (
        <Perfil perfil={perfil.data} />
      )}
    </Pagina>
  )
}

function Perfil({ perfil }: { perfil: MembroAtivo }) {
  const { sessao } = useSessao()
  const { atual } = useConsultoria()
  const queryClient = useQueryClient()
  const entrada = useRef<HTMLInputElement>(null)
  const [problema, setProblema] = useState<string | null>(null)
  const [cargo, setCargo] = useState(perfil.cargo ?? '')
  const [cargoSalvo, setCargoSalvo] = useState(false)
  const email = sessao ? usuarioDaSessao(sessao).email : ''

  async function atualizar() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['meu-perfil', atual.membroId] }),
      queryClient.invalidateQueries({ queryKey: ['membros-ativos', atual.consultoriaId] }),
    ])
  }

  const foto = useMutation({
    mutationFn: (arquivo: File) =>
      enviarFoto({ id: perfil.id, consultoriaId: atual.consultoriaId }, arquivo),
    onSuccess: atualizar,
  })
  const tirar = useMutation({ mutationFn: () => removerFoto(perfil.id), onSuccess: atualizar })
  const salvarCargo = useMutation({
    mutationFn: () => definirCargo(perfil.id, cargo),
    onSuccess: async () => {
      setCargoSalvo(true)
      await atualizar()
    },
  })

  const erroDaFoto =
    problema ?? ((foto.error ?? tirar.error) ? mensagemDoErro(foto.error ?? tirar.error) : null)
  const ocupado = foto.isPending || tirar.isPending
  const mudouCargo = cargo.trim() !== (perfil.cargo ?? '')

  return (
    <div className="flex max-w-[560px] flex-col gap-(--space-300)">
      <section aria-labelledby="titulo-foto" className="flex flex-col gap-(--space-150)">
        <h2 id="titulo-foto" className="titulo-secao">
          Foto
        </h2>
        <div className="flex items-center gap-(--space-200)">
          <Avatar nome={perfil.nome} fotoUrl={perfil.fotoUrl} tamanho="perfil" />
          <div className="flex min-w-0 flex-col gap-(--space-050)">
            <span className="corpo-medio text-(--text)">{perfil.nome}</span>
            <span className="rotulo">{email}</span>
            <span className="rotulo">
              {perfil.cargo ?? (perfil.papel ? NOMES_PAPEL[perfil.papel] : '')}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-(--space-100)">
          <input
            ref={entrada}
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(evento) => {
              const arquivo = evento.target.files?.[0]
              evento.target.value = ''
              if (!arquivo) return
              const motivo = conferirFoto(arquivo)
              setProblema(motivo ? PROBLEMAS_DA_FOTO[motivo] : null)
              if (!motivo) foto.mutate(arquivo)
            }}
          />
          <Botao
            iconeAntes="upload"
            disabled={ocupado}
            onClick={() => {
              entrada.current?.click()
            }}
          >
            {foto.isPending ? 'Enviando…' : perfil.fotoUrl ? 'Trocar foto' : 'Enviar foto'}
          </Botao>
          {perfil.fotoUrl ? (
            <Botao
              aparencia="sutil"
              iconeAntes="trash-2"
              disabled={ocupado}
              onClick={() => {
                setProblema(null)
                tirar.mutate()
              }}
            >
              {tirar.isPending ? 'Tirando…' : 'Tirar foto'}
            </Botao>
          ) : null}
          <span className="rotulo">PNG ou JPEG, até 2 MB.</span>
        </div>
        {erroDaFoto ? (
          <MensagemSecao role="alert" tom="perigo">
            {erroDaFoto}
          </MensagemSecao>
        ) : null}
      </section>

      <section aria-labelledby="titulo-cargo" className="flex flex-col gap-(--space-150)">
        <h2 id="titulo-cargo" className="titulo-secao">
          Cargo
        </h2>
        <form
          className="flex flex-col gap-(--space-150)"
          onSubmit={(evento) => {
            evento.preventDefault()
            if (mudouCargo) salvarCargo.mutate()
          }}
        >
          <CampoTexto
            rotulo="Cargo"
            value={cargo}
            maxLength={TAMANHO_MAXIMO_CARGO}
            placeholder="Ex.: Analista ambiental"
            ajuda="Aparece embaixo do seu nome quando alguém escolhe o responsável."
            erro={salvarCargo.error ? mensagemDoErro(salvarCargo.error) : undefined}
            onChange={(evento) => {
              setCargo(evento.target.value)
              setCargoSalvo(false)
            }}
          />
          <div className="flex items-center gap-(--space-150)">
            <Botao
              type="submit"
              aparencia="primario"
              disabled={!mudouCargo || salvarCargo.isPending}
            >
              {salvarCargo.isPending ? 'Salvando…' : 'Salvar cargo'}
            </Botao>
            {cargoSalvo && !mudouCargo ? (
              <span role="status" className="rotulo">
                Cargo salvo.
              </span>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  )
}
