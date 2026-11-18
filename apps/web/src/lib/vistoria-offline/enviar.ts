import { listarMeusVinculos } from '@/lib/api/acesso'
import { subirFotoDaVistoria } from '@/lib/api/vistorias'
import { obterSupabase } from '@/lib/supabase'

import type { RascunhoOffline } from './rascunho'

function textoOpcional(valor: string | null): string | null {
  const aparado = valor?.trim() ?? ''
  return aparado === '' ? null : aparado
}

export async function sincronizarVistoria(rascunho: RascunhoOffline): Promise<number> {
  const [usuario, consultoria, id] = rascunho.chave
  if (!rascunho.envioId) throw new Error('Revise a vistoria antes de enviar.')

  const supabase = obterSupabase()
  const sessao = await supabase.auth.getSession()
  if (sessao.error || sessao.data.session?.user.id !== usuario) {
    throw new Error('Entre com a mesma conta para enviar a vistoria.')
  }

  const vinculos = await listarMeusVinculos()
  if (
    !vinculos.some(
      (v) =>
        v.consultoriaId === consultoria &&
        v.membroId === rascunho.membroId &&
        v.situacao === 'ativo',
    )
  ) {
    throw new Error('O vínculo que preparou esta vistoria precisa estar ativo para enviar.')
  }

  const fotos = []
  for (const foto of rascunho.fotos) {
    const arquivo = await subirFotoDaVistoria({
      consultoriaId: consultoria,
      fotoId: foto.id,
      arquivo: foto.arquivo,
    })
    fotos.push({
      id: foto.id,
      item_id: foto.itemId,
      caminho: arquivo.caminho,
      sha256: arquivo.hash,
      nome_original: foto.arquivo.name,
      legenda: textoOpcional(foto.legenda),
      capturada_em: foto.criadaEm,
      latitude: foto.local.latitude,
      longitude: foto.local.longitude,
      precisao_m: foto.local.precisaoM,
      local_origem: foto.local.origem,
      local_manual: foto.local.localManual,
    })
  }

  const bases = new Map(rascunho.base.itens.map((item) => [item.id, item]))
  const { data, error } = await supabase.rpc('sincronizar_vistoria_offline', {
    p_id: id,
    p_envio_id: rascunho.envioId,
    p_row_version: rascunho.visita.rowVersion,
    p_observacao: { original: rascunho.base.observacao, atual: textoOpcional(rascunho.observacao) },
    p_itens: rascunho.itens.map((item) => ({
      id: item.id,
      resultado_original: bases.get(item.id)?.resultado ?? null,
      comentario_original: bases.get(item.id)?.comentario ?? null,
      resultado: item.resultado,
      comentario: textoOpcional(item.comentario),
    })),
    p_fotos: fotos,
  })
  if (error) throw error
  return data
}
