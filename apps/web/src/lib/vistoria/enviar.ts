import { EXTENSOES, sha256 } from '@/lib/api/ocorrencias'
import { obterSupabase } from '@/lib/supabase'

import type { VistoriaNoDispositivo } from './dispositivo'

export async function enviarVistoria(vistoria: VistoriaNoDispositivo, usuario: string) {
  const { envio, ocorrencia, evidenciaId, rascunho } = vistoria
  const foto = rascunho.foto
  if (!envio || !foto) throw new Error('Revise o registro e confira se a foto foi anexada.')
  const supabase = obterSupabase()
  const sessao = await supabase.auth.getSession()
  if (sessao.error || sessao.data.session?.user.id !== usuario) {
    throw new Error('Entre com a mesma conta para enviar a vistoria.')
  }

  // Uma repetição depois de perda de sinal usa o mesmo caminho e a mesma chave da evidência.
  const tipo = foto.arquivo.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const caminho = `${ocorrencia.consultoriaId}/evidencia/${foto.versaoId}.${EXTENSOES[tipo]}`
  const resumo = await sha256(foto.arquivo)
  const { error: erroUpload } = await supabase.storage
    .from('arquivos')
    .upload(caminho, foto.arquivo, {
      contentType: tipo,
      upsert: false,
    })
  // Se uma tentativa já fez upload, a RPC ainda checa o dono e o MIME do objeto.
  if (
    erroUpload &&
    !(
      'statusCode' in erroUpload &&
      ['409', '400'].includes(String(erroUpload.statusCode)) &&
      /already exists|duplicate/i.test(erroUpload.message)
    )
  )
    throw erroUpload

  const { data, error } = await supabase.rpc('enviar_vistoria', {
    p_ocorrencia_id: ocorrencia.id,
    p_evidencia_id: evidenciaId,
    p_versao_id: foto.versaoId,
    p_caminho: caminho,
    p_nome_original: foto.arquivo.name,
    p_sha256: resumo,
    p_data_execucao: envio.dataExecucao,
    p_vistoria: envio.registro,
  })
  if (error) throw error
  return data
}
