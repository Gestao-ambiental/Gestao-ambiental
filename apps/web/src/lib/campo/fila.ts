// Fila de envio do Campo (ADR-0060). Tudo o que a técnica registra vai primeiro para o aparelho
// (armazem.ts) e depois ao servidor, na ordem de `ordemDeEnvio`. Falha de conexão deixa o registro
// "no aparelho" e a fila tenta de novo: quando o sinal volta (evento `online`), quando a tela abre
// e numa espera que dobra a cada falha. O aparelho só apaga o que o servidor confirmou, e só a
// versão confirmada: o que foi regravado durante o envio segue para a próxima volta.
// Os ids vêm do aparelho e as RPCs são idempotentes: repetir um envio não duplica nada.

import {
  esperaAntesDaTentativa,
  ordemDeEnvio,
  type ContagemDaFila,
  contarPendencias,
} from '@gestao-ambiental/domain'

import {
  adicionarFotoDaVistoria,
  registrarItemDaVistoria,
  salvarObservacaoDaVistoria,
} from '@/lib/api/vistorias'

import { criarArmazem, type Armazem, type RegistroDoAparelho } from './armazem'
import { ehFalhaDeConexao } from './falhas'

export type EstadoDoEnvio = 'no_aparelho' | 'enviando' | 'recusado'

export interface Pendencia {
  id: string
  registro: RegistroDoAparelho
  estado: EstadoDoEnvio
  /** Versão gravada no aparelho; só ela é apagada quando o servidor confirma. */
  versao: number
  /** Último erro: de conexão (segue tentando) ou a recusa do servidor. */
  erro: unknown
}

export interface EstadoDaFila {
  usuarioId: string | null
  /** O rascunho do aparelho já foi lido. */
  carregada: boolean
  pendencias: readonly Pendencia[]
  /** O aparelho diz que está sem conexão. */
  semConexao: boolean
  /** Próxima tentativa automática (ms desde 1970), se houver. */
  proximaTentativaEm: number | null
}

export type AoConfirmar = (registro: RegistroDoAparelho) => void

/** O que de fato fala com o servidor; os testes trocam por um falso se precisarem. */
export async function enviarAoServidor(registro: RegistroDoAparelho): Promise<void> {
  switch (registro.tipo) {
    case 'item':
      return registrarItemDaVistoria(registro.itemId, registro.resultado, registro.comentario)
    case 'observacao':
      return salvarObservacaoDaVistoria(registro.vistoriaId, registro.observacao)
    case 'foto': {
      const { dados } = registro
      return adicionarFotoDaVistoria({
        consultoriaId: dados.consultoriaId,
        fotoId: registro.fotoId,
        itemId: registro.itemId,
        arquivo: new File([dados.bytes], dados.nome, { type: dados.mime }),
        legenda: dados.legenda,
        capturadaEm: dados.capturadaEm,
        local: dados.local,
      })
    }
  }
}

function semConexaoAgora(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine
}

export class FilaDeCampo {
  private armazem: Armazem
  private estado: EstadoDaFila = {
    usuarioId: null,
    carregada: false,
    pendencias: [],
    semConexao: semConexaoAgora(),
    proximaTentativaEm: null,
  }
  private ouvintes = new Set<() => void>()
  private confirmacoes = new Set<AoConfirmar>()
  private rodando: Promise<void> | null = null
  private deNovo = false
  private falhasSeguidas = 0
  private relogio: ReturnType<typeof setTimeout> | null = null
  private carga: Promise<void> | null = null
  private ligada = false

  constructor(armazem: Armazem = criarArmazem()) {
    this.armazem = armazem
  }

  // ---- leitura (useSyncExternalStore) ------------------------------------

  obter = (): EstadoDaFila => this.estado

  assinar = (ouvinte: () => void): (() => void) => {
    this.ouvintes.add(ouvinte)
    return () => {
      this.ouvintes.delete(ouvinte)
    }
  }

  aoConfirmar(fn: AoConfirmar): () => void {
    this.confirmacoes.add(fn)
    return () => {
      this.confirmacoes.delete(fn)
    }
  }

  private mudar(parcial: Partial<EstadoDaFila>) {
    this.estado = { ...this.estado, ...parcial }
    for (const ouvinte of this.ouvintes) ouvinte()
  }

  private mudarPendencia(id: string, parcial: Partial<Pendencia> | null) {
    this.mudar({
      pendencias:
        parcial === null
          ? this.estado.pendencias.filter((p) => p.id !== id)
          : this.estado.pendencias.map((p) => (p.id === id ? { ...p, ...parcial } : p)),
    })
  }

  // ---- usuário -----------------------------------------------------------

  /**
   * Conta da sessão. Entrar com outra conta apaga do aparelho o rascunho das outras; sair só
   * esquece a memória (o rascunho volta quando a mesma pessoa entrar de novo).
   */
  definirUsuario(usuarioId: string | null): Promise<void> {
    if (usuarioId === this.estado.usuarioId && this.carga) return this.carga
    this.pararRelogio()
    this.falhasSeguidas = 0
    this.mudar({ usuarioId, carregada: false, pendencias: [], proximaTentativaEm: null })
    if (!usuarioId) {
      this.carga = null
      return Promise.resolve()
    }
    this.ligarEventos()
    const carga = (async () => {
      await this.armazem.limparOutros(usuarioId)
      const linhas = await this.armazem.listar(usuarioId)
      if (this.estado.usuarioId !== usuarioId) return
      this.mudar({
        carregada: true,
        pendencias: linhas.map((l) => ({
          id: l.id,
          registro: l.registro,
          versao: l.versao,
          estado: 'no_aparelho',
          erro: null,
        })),
      })
      void this.processar()
    })().catch(() => {
      // Sem acesso ao armazenamento: segue com a fila vazia, só em memória.
      if (this.estado.usuarioId === usuarioId) this.mudar({ carregada: true })
    })
    this.carga = carga
    return carga
  }

  private ligarEventos() {
    if (this.ligada || typeof window === 'undefined') return
    this.ligada = true
    window.addEventListener('online', this.aoVoltarConexao)
    window.addEventListener('offline', this.aoPerderConexao)
    document.addEventListener('visibilitychange', this.aoVoltarParaATela)
  }

  private aoVoltarConexao = () => {
    this.mudar({ semConexao: false })
    this.falhasSeguidas = 0
    void this.processar()
  }

  private aoPerderConexao = () => {
    this.mudar({ semConexao: true })
  }

  private aoVoltarParaATela = () => {
    if (document.visibilityState === 'visible') void this.processar()
  }

  // ---- escrita -----------------------------------------------------------

  /**
   * Grava no aparelho e só então tenta enviar. Rejeita se não couber no aparelho; nesse caso nada
   * mudou e a tela avisa.
   */
  async registrar(registro: RegistroDoAparelho): Promise<void> {
    const { usuarioId } = this.estado
    if (!usuarioId) throw new Error('sem_sessao')
    await this.carga
    const linha = await this.armazem.guardar(usuarioId, registro)
    if (this.estado.usuarioId !== usuarioId) return
    pedirArmazenamentoPersistente()
    const nova: Pendencia = {
      id: linha.id,
      registro,
      versao: linha.versao,
      estado: 'no_aparelho',
      erro: null,
    }
    const existe = this.estado.pendencias.some((p) => p.id === linha.id)
    this.mudar({
      pendencias: existe
        ? this.estado.pendencias.map((p) =>
            // Em envio, segue "enviando": a volta atual vê a versão nova e manda de novo.
            p.id === linha.id
              ? { ...nova, estado: p.estado === 'enviando' ? p.estado : nova.estado }
              : p,
          )
        : [...this.estado.pendencias, nova],
    })
    this.falhasSeguidas = 0
    void this.processar()
  }

  /** Apaga do aparelho um registro que o servidor recusou (a técnica decide). */
  async descartar(id: string): Promise<void> {
    await this.armazem.apagar(id)
    this.mudarPendencia(id, null)
  }

  /** "Enviar agora" ou "Tentar de novo": inclui os recusados. */
  tentarDeNovo(): Promise<void> {
    this.falhasSeguidas = 0
    this.mudar({
      pendencias: this.estado.pendencias.map((p) =>
        p.estado === 'recusado' ? { ...p, estado: 'no_aparelho' } : p,
      ),
    })
    return this.processar()
  }

  // ---- envio -------------------------------------------------------------

  /** Envia o que der. Resolve quando a volta acaba (com ou sem sobras). */
  processar(): Promise<void> {
    if (this.rodando) {
      this.deNovo = true
      return this.rodando
    }
    this.rodando = (async () => {
      try {
        do {
          this.deNovo = false
          await this.umaVolta()
        } while (this.querOutraVolta())
      } finally {
        this.rodando = null
      }
    })()
    return this.rodando
  }

  /** Lido fora do laço: outra chamada pode ter pedido mais uma volta durante esta. */
  private querOutraVolta(): boolean {
    return this.deNovo
  }

  private async umaVolta() {
    const { usuarioId } = this.estado
    if (!usuarioId || !this.estado.carregada) return
    this.pararRelogio()
    const enviados = new Set<string>()
    for (;;) {
      if (semConexaoAgora()) {
        this.mudar({ semConexao: true })
        return
      }
      const proxima = ordemDeEnvio(
        this.estado.pendencias
          .filter((p) => p.estado === 'no_aparelho' && !enviados.has(p.id))
          .map((p) => ({ ...p.registro, pendencia: p })),
      )[0]?.pendencia
      if (!proxima) {
        this.falhasSeguidas = 0
        this.mudar({ proximaTentativaEm: null, semConexao: false })
        return
      }
      const { versao } = proxima
      this.mudarPendencia(proxima.id, { estado: 'enviando' })
      try {
        await enviarAoServidor(proxima.registro)
      } catch (erro) {
        if (this.estado.usuarioId !== usuarioId) return
        if (ehFalhaDeConexao(erro)) {
          this.mudarPendencia(proxima.id, { estado: 'no_aparelho', erro })
          this.agendar()
          return
        }
        this.mudarPendencia(proxima.id, { estado: 'recusado', erro })
        continue
      }
      if (this.estado.usuarioId !== usuarioId) return
      enviados.add(proxima.id)
      const apagou = await this.armazem.confirmar(proxima.id, versao)
      if (apagou) this.mudarPendencia(proxima.id, null)
      else {
        // Regravado durante o envio: a versão nova vai na próxima volta.
        this.mudarPendencia(proxima.id, { estado: 'no_aparelho', erro: null })
        this.deNovo = true
      }
      for (const fn of this.confirmacoes) fn(proxima.registro)
    }
  }

  private agendar() {
    this.falhasSeguidas += 1
    const espera = esperaAntesDaTentativa(this.falhasSeguidas)
    this.pararRelogio()
    this.relogio = setTimeout(() => {
      this.relogio = null
      void this.processar()
    }, espera)
    this.mudar({ proximaTentativaEm: Date.now() + espera, semConexao: semConexaoAgora() })
  }

  private pararRelogio() {
    if (this.relogio) clearTimeout(this.relogio)
    this.relogio = null
  }

  /** Para os testes: esquece a memória como se a página recarregasse (o aparelho continua). */
  descarregar() {
    this.pararRelogio()
    this.carga = null
    this.falhasSeguidas = 0
    this.estado = {
      usuarioId: null,
      carregada: false,
      pendencias: [],
      semConexao: semConexaoAgora(),
      proximaTentativaEm: null,
    }
    this.armazem.fechar()
  }

  /** Para os testes: troca o armazenamento (aparelho novo). */
  trocarArmazem(armazem: Armazem) {
    this.descarregar()
    this.armazem = armazem
  }
}

let pediuPersistencia = false
/** Pede ao navegador para não apagar o rascunho por falta de espaço (sem perguntar nada). */
function pedirArmazenamentoPersistente() {
  if (pediuPersistencia) return
  pediuPersistencia = true
  if (typeof navigator === 'undefined' || !('storage' in navigator)) return
  const { storage } = navigator as { storage?: { persist?: () => Promise<boolean> } }
  void storage?.persist?.().catch(() => false)
}

export const filaDeCampo = new FilaDeCampo()

export function contagemDaVistoria(
  pendencias: readonly Pendencia[],
  vistoriaId: string,
): ContagemDaFila {
  return contarPendencias(
    pendencias.filter((p) => p.registro.vistoriaId === vistoriaId).map((p) => p.registro),
  )
}
