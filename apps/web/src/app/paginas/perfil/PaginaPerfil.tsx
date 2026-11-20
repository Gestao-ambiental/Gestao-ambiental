import type { CodigoCargo, CodigoProfissao, GeneroDaPessoa } from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { CHAVE_MEU_CADASTRO, useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { NOMES_PAPEL } from '@/app/papeis'
import { useSessao, usuarioDaSessao } from '@/app/sessao/contexto-sessao'
import { CampoGenero } from '@/components/campos-da-pessoa'
import { Carregando, EstadoErro, SemPermissao } from '@/components/estados'
import { Avatar } from '@/components/ui/avatar'
import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  conferirFoto,
  definirMeuGenero,
  definirProfissaoECargo,
  enviarFoto,
  meuPerfil,
  removerFoto,
  type MembroAtivo,
  type ProblemaDaFoto,
} from '@/lib/api/perfil'
import { ehSemPermissao, mensagemDoErro } from '@/lib/erros'

import { CamposProfissaoECargo } from '../equipe/CamposProfissaoECargo'
import { Pagina } from '../Pagina'

const PROBLEMAS_DA_FOTO: Record<ProblemaDaFoto, string> = {
  tipo: 'Envie uma imagem PNG ou JPEG.',
  vazio: 'Este arquivo está vazio.',
  grande_demais: 'A imagem passa de 2 MB.',
}

/**
 * /perfil: foto, gênero, profissão e cargo da pessoa nesta consultoria. Aparecem no seletor de
 * responsável (foto e, embaixo do nome, o cargo). Cada consultoria tem o seu: o perfil é do vínculo.
 * Profissão e cargo vêm das listas fixas do Grama (ADR-0021). O gênero é só da própria pessoa, vale
 * em todos os vínculos e muda como a profissão é escrita.
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
  const [profissao, setProfissao] = useState<CodigoProfissao | ''>(perfil.profissao ?? '')
  const [emCurso, setEmCurso] = useState(perfil.profissaoEmCurso)
  const [outras, setOutras] = useState<CodigoProfissao[]>(perfil.outrasProfissoes)
  const [cargo, setCargo] = useState<CodigoCargo | ''>(perfil.cargoCodigo ?? '')
  const [genero, setGenero] = useState<GeneroDaPessoa | ''>(perfil.genero ?? '')
  const [salvo, setSalvo] = useState(false)
  const [generoSalvo, setGeneroSalvo] = useState(false)
  const email = sessao ? usuarioDaSessao(sessao).email : ''

  async function atualizar() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['meu-perfil', atual.membroId] }),
      queryClient.invalidateQueries({ queryKey: ['membros-ativos', atual.consultoriaId] }),
    ])
  }

  const salvarGenero = useMutation({
    mutationFn: (escolhido: GeneroDaPessoa) => definirMeuGenero(escolhido),
    onSuccess: async () => {
      setGeneroSalvo(true)
      await Promise.all([
        atualizar(),
        queryClient.invalidateQueries({ queryKey: [CHAVE_MEU_CADASTRO] }),
        queryClient.invalidateQueries({ queryKey: ['membros', atual.consultoriaId] }),
      ])
    },
  })
  const generoMudou = genero !== (perfil.genero ?? '')

  const foto = useMutation({
    mutationFn: (arquivo: File) =>
      enviarFoto({ id: perfil.id, consultoriaId: atual.consultoriaId }, arquivo),
    onSuccess: atualizar,
  })
  const tirar = useMutation({ mutationFn: () => removerFoto(perfil.id), onSuccess: atualizar })
  const salvar = useMutation({
    mutationFn: () =>
      definirProfissaoECargo(perfil.id, profissao || null, cargo || null, outras, emCurso),
    onSuccess: async () => {
      setSalvo(true)
      await atualizar()
    },
  })

  const erroDaFoto =
    problema ?? ((foto.error ?? tirar.error) ? mensagemDoErro(foto.error ?? tirar.error) : null)
  const ocupado = foto.isPending || tirar.isPending
  const mudou =
    profissao !== (perfil.profissao ?? '') ||
    emCurso !== perfil.profissaoEmCurso ||
    cargo !== (perfil.cargoCodigo ?? '') ||
    outras.join() !== perfil.outrasProfissoes.join()

  return (
    <div className="flex max-w-[640px] flex-col gap-(--e-8)">
      <section aria-labelledby="titulo-foto" className="flex flex-col gap-(--e-4)">
        <h2 id="titulo-foto" className="sr-only">
          Foto
        </h2>
        <div className="flex items-center gap-(--e-4)">
          <Avatar nome={perfil.nome} fotoUrl={perfil.fotoUrl} tamanho="perfil" />
          <div className="flex min-w-0 flex-col gap-(--e-05)">
            <span className="titulo-painel text-(--tinta)">{perfil.nome}</span>
            <span className="truncate corpo text-(--tinta-2)">{email}</span>
            <span className="corpo text-(--tinta-2)">
              {perfil.cargo ?? (perfil.papel ? NOMES_PAPEL[perfil.papel] : '')}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-(--e-2)">
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

      <section
        aria-labelledby="titulo-genero"
        className="flex flex-col gap-(--e-3) border-t pt-(--e-6)"
      >
        {/* A legenda do campo já diz "Gênero" na tela; o título fica só para leitor de tela. */}
        <h2 id="titulo-genero" className="sr-only">
          Gênero
        </h2>
        <form
          className="flex flex-col gap-(--e-3)"
          onSubmit={(evento) => {
            evento.preventDefault()
            if (genero && generoMudou) salvarGenero.mutate(genero)
          }}
        >
          <CampoGenero
            valor={genero}
            aoMudar={(escolhido) => {
              setGenero(escolhido)
              setGeneroSalvo(false)
            }}
            desabilitado={salvarGenero.isPending}
          />
          {salvarGenero.error ? (
            <MensagemSecao role="alert" tom="perigo">
              {mensagemDoErro(salvarGenero.error)}
            </MensagemSecao>
          ) : null}
          <div className="flex items-center gap-(--e-3)">
            <Botao
              type="submit"
              aparencia={generoMudou ? 'primario' : 'padrao'}
              disabled={!genero || !generoMudou || salvarGenero.isPending}
            >
              {salvarGenero.isPending ? 'Salvando…' : 'Salvar gênero'}
            </Botao>
            {generoSalvo && !generoMudou ? (
              <span role="status" className="rotulo">
                Gênero salvo.
              </span>
            ) : null}
          </div>
        </form>
      </section>

      <section
        aria-labelledby="titulo-cargo"
        className="flex flex-col gap-(--e-3) border-t pt-(--e-6)"
      >
        <h2 id="titulo-cargo" className="titulo-secao text-(--tinta)">
          Profissão e cargo
        </h2>
        <form
          className="flex flex-col gap-(--e-3)"
          onSubmit={(evento) => {
            evento.preventDefault()
            if (mudou) salvar.mutate()
          }}
        >
          <CamposProfissaoECargo
            profissao={profissao}
            outras={outras}
            cargo={cargo}
            cargoAntigo={perfil.cargoAntigo}
            genero={genero || null}
            desabilitado={salvar.isPending}
            emCurso={emCurso}
            aoMudarProfissao={(codigo) => {
              setProfissao(codigo)
              setSalvo(false)
            }}
            aoMudarEmCurso={(marcado) => {
              setEmCurso(marcado)
              setSalvo(false)
            }}
            aoMudarOutras={(codigos) => {
              setOutras(codigos)
              setSalvo(false)
            }}
            aoMudarCargo={(codigo) => {
              setCargo(codigo)
              setSalvo(false)
            }}
          />
          {salvar.error ? (
            <MensagemSecao role="alert" tom="perigo">
              {mensagemDoErro(salvar.error)}
            </MensagemSecao>
          ) : null}
          <div className="flex items-center gap-(--e-3)">
            <Botao
              type="submit"
              aparencia={mudou ? 'primario' : 'padrao'}
              disabled={!mudou || salvar.isPending}
            >
              {salvar.isPending ? 'Salvando…' : 'Salvar profissão e cargo'}
            </Botao>
            {salvo && !mudou ? (
              <span role="status" className="rotulo">
                Profissão e cargo salvos.
              </span>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  )
}
