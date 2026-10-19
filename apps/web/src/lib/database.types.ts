
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "auditoria": {
                  Row: {
                    "acao": Database["public"]['Enums']["acao_auditoria"],"antes": Json | null,"ator_membro_id": string | null,"consultoria_id": string,"depois": Json | null,"entidade": string,"entidade_id": string,"id": number,"instante": string,"motivo": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acao": Database["public"]['Enums']["acao_auditoria"],"antes"?: Json | null,"ator_membro_id"?: string | null,"consultoria_id": string,"depois"?: Json | null,"entidade": string,"entidade_id": string,"id"?: never,"instante"?: string,"motivo"?: string | null
                  }
                  Update: {
                    "acao"?: Database["public"]['Enums']["acao_auditoria"],"antes"?: Json | null,"ator_membro_id"?: string | null,"consultoria_id"?: string,"depois"?: Json | null,"entidade"?: string,"entidade_id"?: string,"id"?: never,"instante"?: string,"motivo"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "auditoria_ator_fk"
      columns: ["consultoria_id","ator_membro_id"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "auditoria_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    }
                  ]
                },"cliente": {
                  Row: {
                    "consultoria_id": string,"criado_em": string,"id": string,"nome": string,"nome_normalizado": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "consultoria_id": string,"criado_em"?: string,"id"?: string,"nome": string,"nome_normalizado"?: never
                  }
                  Update: {
                    "consultoria_id"?: string,"criado_em"?: string,"id"?: string,"nome"?: string,"nome_normalizado"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "cliente_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    }
                  ]
                },"condicionante": {
                  Row: {
                    "aceita_sem_edicao": boolean | null,"codigo": string,"consultoria_id": string,"criado_em": string,"extracao_id": string | null,"fonte_pagina": number | null,"id": string,"instrumento_id": string,"origem": string,"pai_id": string | null,"posicao": number,"proposta_ia": Json | null,"responsavel_id": string | null,"revisao": Database["public"]['Enums']["revisao_condicionante"],"versao_vigente_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "aceita_sem_edicao"?: boolean | null,"codigo": string,"consultoria_id": string,"criado_em"?: string,"extracao_id"?: string | null,"fonte_pagina"?: number | null,"id"?: string,"instrumento_id": string,"origem"?: string,"pai_id"?: string | null,"posicao": number,"proposta_ia"?: Json | null,"responsavel_id"?: string | null,"revisao"?: Database["public"]['Enums']["revisao_condicionante"],"versao_vigente_id"?: string | null
                  }
                  Update: {
                    "aceita_sem_edicao"?: boolean | null,"codigo"?: string,"consultoria_id"?: string,"criado_em"?: string,"extracao_id"?: string | null,"fonte_pagina"?: number | null,"id"?: string,"instrumento_id"?: string,"origem"?: string,"pai_id"?: string | null,"posicao"?: number,"proposta_ia"?: Json | null,"responsavel_id"?: string | null,"revisao"?: Database["public"]['Enums']["revisao_condicionante"],"versao_vigente_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "condicionante_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "condicionante_extracao_fk"
      columns: ["consultoria_id","extracao_id"]
isOneToOne: false
      referencedRelation: "extracao_ia"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "condicionante_instrumento_fk"
      columns: ["consultoria_id","instrumento_id"]
isOneToOne: false
      referencedRelation: "instrumento"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "condicionante_pai_fk"
      columns: ["consultoria_id","instrumento_id","pai_id"]
isOneToOne: false
      referencedRelation: "condicionante"
      referencedColumns: ["consultoria_id","instrumento_id","id"]
    },{
      foreignKeyName: "condicionante_responsavel_fk"
      columns: ["consultoria_id","responsavel_id"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "condicionante_versao_vigente_fk"
      columns: ["consultoria_id","versao_vigente_id"]
isOneToOne: false
      referencedRelation: "condicionante_versao"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"condicionante_versao": {
                  Row: {
                    "condicionante_id": string,"consultoria_id": string,"contagem": Database["public"]['Enums']["contagem_prazo"],"criado_em": string,"data_referencia": string | null,"fonte_regra": string | null,"id": string,"intervalo_ciclo": number | null,"natureza": Database["public"]['Enums']["natureza_condicionante"],"numero": number,"prazo_confirmado_em": string | null,"prazo_confirmado_por": string | null,"primeira_data": string | null,"recorrencia": Database["public"]['Enums']["recorrencia_prazo"] | null,"texto_literal": string,"titulo": string,"unidade_ciclo": Database["public"]['Enums']["unidade_ciclo"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "condicionante_id": string,"consultoria_id": string,"contagem"?: Database["public"]['Enums']["contagem_prazo"],"criado_em"?: string,"data_referencia"?: string | null,"fonte_regra"?: string | null,"id"?: string,"intervalo_ciclo"?: number | null,"natureza": Database["public"]['Enums']["natureza_condicionante"],"numero"?: number,"prazo_confirmado_em"?: string | null,"prazo_confirmado_por"?: string | null,"primeira_data"?: string | null,"recorrencia"?: Database["public"]['Enums']["recorrencia_prazo"] | null,"texto_literal"?: string,"titulo": string,"unidade_ciclo"?: Database["public"]['Enums']["unidade_ciclo"] | null
                  }
                  Update: {
                    "condicionante_id"?: string,"consultoria_id"?: string,"contagem"?: Database["public"]['Enums']["contagem_prazo"],"criado_em"?: string,"data_referencia"?: string | null,"fonte_regra"?: string | null,"id"?: string,"intervalo_ciclo"?: number | null,"natureza"?: Database["public"]['Enums']["natureza_condicionante"],"numero"?: number,"prazo_confirmado_em"?: string | null,"prazo_confirmado_por"?: string | null,"primeira_data"?: string | null,"recorrencia"?: Database["public"]['Enums']["recorrencia_prazo"] | null,"texto_literal"?: string,"titulo"?: string,"unidade_ciclo"?: Database["public"]['Enums']["unidade_ciclo"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "condicionante_versao_condicionante_fk"
      columns: ["consultoria_id","condicionante_id"]
isOneToOne: false
      referencedRelation: "condicionante"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "condicionante_versao_confirmado_por_fk"
      columns: ["consultoria_id","prazo_confirmado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "condicionante_versao_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    }
                  ]
                },"conferencia": {
                  Row: {
                    "conferente_id": string,"consultoria_id": string,"decidida_em": string,"decisao": Database["public"]['Enums']["decisao_conferencia"],"evidencia_id": string,"id": string,"motivo": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "conferente_id": string,"consultoria_id": string,"decidida_em"?: string,"decisao": Database["public"]['Enums']["decisao_conferencia"],"evidencia_id": string,"id"?: string,"motivo"?: string | null
                  }
                  Update: {
                    "conferente_id"?: string,"consultoria_id"?: string,"decidida_em"?: string,"decisao"?: Database["public"]['Enums']["decisao_conferencia"],"evidencia_id"?: string,"id"?: string,"motivo"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "conferencia_conferente_fk"
      columns: ["consultoria_id","conferente_id"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "conferencia_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conferencia_evidencia_fk"
      columns: ["consultoria_id","evidencia_id"]
isOneToOne: false
      referencedRelation: "evidencia"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"consultoria": {
                  Row: {
                    "conferencia_independente": boolean,"criada_em": string,"fuso": string,"id": string,"nome": string,"situacao": Database["public"]['Enums']["situacao_consultoria"]
                  }
                  ComputedFields: never
                  Insert: {
                    "conferencia_independente"?: boolean,"criada_em"?: string,"fuso"?: string,"id"?: string,"nome": string,"situacao"?: Database["public"]['Enums']["situacao_consultoria"]
                  }
                  Update: {
                    "conferencia_independente"?: boolean,"criada_em"?: string,"fuso"?: string,"id"?: string,"nome"?: string,"situacao"?: Database["public"]['Enums']["situacao_consultoria"]
                  }
                  Relationships: [
                    
                  ]
                },"convite": {
                  Row: {
                    "aceito_em": string | null,"aceito_por": string | null,"cancelado_em": string | null,"consultoria_id": string,"convidado_por": string,"criado_em": string,"email": string,"enviado_em": string,"expira_em": string,"id": string,"papel": Database["public"]['Enums']["papel_membro"],"situacao": Database["public"]['Enums']["situacao_convite"],"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aceito_em"?: string | null,"aceito_por"?: string | null,"cancelado_em"?: string | null,"consultoria_id": string,"convidado_por": string,"criado_em"?: string,"email": string,"enviado_em"?: string,"expira_em": string,"id"?: string,"papel": Database["public"]['Enums']["papel_membro"],"situacao"?: Database["public"]['Enums']["situacao_convite"],"token_hash": string
                  }
                  Update: {
                    "aceito_em"?: string | null,"aceito_por"?: string | null,"cancelado_em"?: string | null,"consultoria_id"?: string,"convidado_por"?: string,"criado_em"?: string,"email"?: string,"enviado_em"?: string,"expira_em"?: string,"id"?: string,"papel"?: Database["public"]['Enums']["papel_membro"],"situacao"?: Database["public"]['Enums']["situacao_convite"],"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "convite_aceito_por_fk"
      columns: ["consultoria_id","aceito_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "convite_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "convite_convidado_por_fk"
      columns: ["consultoria_id","convidado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"documento": {
                  Row: {
                    "consultoria_id": string,"criado_em": string,"entidade": string,"excluido_em": string | null,"id": string,"versao_vigente_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "consultoria_id": string,"criado_em"?: string,"entidade": string,"excluido_em"?: string | null,"id"?: string,"versao_vigente_id"?: string | null
                  }
                  Update: {
                    "consultoria_id"?: string,"criado_em"?: string,"entidade"?: string,"excluido_em"?: string | null,"id"?: string,"versao_vigente_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "documento_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documento_versao_vigente_fk"
      columns: ["consultoria_id","versao_vigente_id"]
isOneToOne: false
      referencedRelation: "documento_versao"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"documento_versao": {
                  Row: {
                    "autor_id": string,"caminho": string,"consultoria_id": string,"criado_em": string,"documento_id": string,"id": string,"mime": string,"nome_original": string,"numero": number,"sha256": string,"tamanho_bytes": number
                  }
                  ComputedFields: never
                  Insert: {
                    "autor_id": string,"caminho": string,"consultoria_id": string,"criado_em"?: string,"documento_id": string,"id"?: string,"mime": string,"nome_original": string,"numero": number,"sha256": string,"tamanho_bytes": number
                  }
                  Update: {
                    "autor_id"?: string,"caminho"?: string,"consultoria_id"?: string,"criado_em"?: string,"documento_id"?: string,"id"?: string,"mime"?: string,"nome_original"?: string,"numero"?: number,"sha256"?: string,"tamanho_bytes"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "documento_versao_autor_fk"
      columns: ["consultoria_id","autor_id"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "documento_versao_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documento_versao_documento_fk"
      columns: ["consultoria_id","documento_id"]
isOneToOne: false
      referencedRelation: "documento"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"empreendimento": {
                  Row: {
                    "cliente_id": string | null,"cnpj": string | null,"consultoria_id": string,"criado_em": string,"criado_por": string,"id": string,"nome": string,"nome_normalizado": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cliente_id"?: string | null,"cnpj"?: string | null,"consultoria_id": string,"criado_em"?: string,"criado_por": string,"id"?: string,"nome": string,"nome_normalizado"?: never
                  }
                  Update: {
                    "cliente_id"?: string | null,"cnpj"?: string | null,"consultoria_id"?: string,"criado_em"?: string,"criado_por"?: string,"id"?: string,"nome"?: string,"nome_normalizado"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "empreendimento_cliente_fk"
      columns: ["consultoria_id","cliente_id"]
isOneToOne: false
      referencedRelation: "cliente"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "empreendimento_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "empreendimento_criado_por_fk"
      columns: ["consultoria_id","criado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"etapa": {
                  Row: {
                    "concluida_em": string | null,"concluida_por": string | null,"consultoria_id": string,"criada_em": string,"criada_por": string,"horas_estimadas": number | null,"id": string,"meta": string | null,"modo": Database["public"]['Enums']["modo_etapa"],"ocorrencia_id": string,"posicao": number,"responsavel_externo": string | null,"responsavel_id": string | null,"titulo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "concluida_em"?: string | null,"concluida_por"?: string | null,"consultoria_id": string,"criada_em"?: string,"criada_por": string,"horas_estimadas"?: number | null,"id"?: string,"meta"?: string | null,"modo"?: Database["public"]['Enums']["modo_etapa"],"ocorrencia_id": string,"posicao": number,"responsavel_externo"?: string | null,"responsavel_id"?: string | null,"titulo": string
                  }
                  Update: {
                    "concluida_em"?: string | null,"concluida_por"?: string | null,"consultoria_id"?: string,"criada_em"?: string,"criada_por"?: string,"horas_estimadas"?: number | null,"id"?: string,"meta"?: string | null,"modo"?: Database["public"]['Enums']["modo_etapa"],"ocorrencia_id"?: string,"posicao"?: number,"responsavel_externo"?: string | null,"responsavel_id"?: string | null,"titulo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "etapa_concluida_por_fk"
      columns: ["consultoria_id","concluida_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "etapa_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "etapa_criada_por_fk"
      columns: ["consultoria_id","criada_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "etapa_ocorrencia_fk"
      columns: ["consultoria_id","ocorrencia_id"]
isOneToOne: false
      referencedRelation: "ocorrencia"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "etapa_responsavel_fk"
      columns: ["consultoria_id","responsavel_id"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"evidencia": {
                  Row: {
                    "consultoria_id": string,"data_execucao": string,"documento_versao_id": string,"enviada_em": string,"enviada_por": string,"id": string,"numero": number,"ocorrencia_id": string,"situacao": Database["public"]['Enums']["situacao_evidencia"]
                  }
                  ComputedFields: never
                  Insert: {
                    "consultoria_id": string,"data_execucao": string,"documento_versao_id": string,"enviada_em"?: string,"enviada_por": string,"id"?: string,"numero": number,"ocorrencia_id": string,"situacao"?: Database["public"]['Enums']["situacao_evidencia"]
                  }
                  Update: {
                    "consultoria_id"?: string,"data_execucao"?: string,"documento_versao_id"?: string,"enviada_em"?: string,"enviada_por"?: string,"id"?: string,"numero"?: number,"ocorrencia_id"?: string,"situacao"?: Database["public"]['Enums']["situacao_evidencia"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "evidencia_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "evidencia_enviada_por_fk"
      columns: ["consultoria_id","enviada_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "evidencia_ocorrencia_fk"
      columns: ["consultoria_id","ocorrencia_id"]
isOneToOne: false
      referencedRelation: "ocorrencia"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "evidencia_versao_fk"
      columns: ["consultoria_id","documento_versao_id"]
isOneToOne: false
      referencedRelation: "documento_versao"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"extracao_ia": {
                  Row: {
                    "concluida_em": string | null,"consultoria_id": string,"custo_micros": number | null,"detalhe": string | null,"documento_versao_id": string,"duracao_ms": number | null,"id": string,"iniciada_em": string,"instrumento_id": string,"itens_propostos": number | null,"modelo": string | null,"moeda": string,"motivo": string | null,"paginas": number | null,"resultado": Json | null,"situacao": string,"solicitada_por": string,"tokens_entrada": number | null,"tokens_saida": number | null,"versao_prompt": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "concluida_em"?: string | null,"consultoria_id": string,"custo_micros"?: number | null,"detalhe"?: string | null,"documento_versao_id": string,"duracao_ms"?: number | null,"id": string,"iniciada_em"?: string,"instrumento_id": string,"itens_propostos"?: number | null,"modelo"?: string | null,"moeda"?: string,"motivo"?: string | null,"paginas"?: number | null,"resultado"?: Json | null,"situacao"?: string,"solicitada_por": string,"tokens_entrada"?: number | null,"tokens_saida"?: number | null,"versao_prompt"?: string | null
                  }
                  Update: {
                    "concluida_em"?: string | null,"consultoria_id"?: string,"custo_micros"?: number | null,"detalhe"?: string | null,"documento_versao_id"?: string,"duracao_ms"?: number | null,"id"?: string,"iniciada_em"?: string,"instrumento_id"?: string,"itens_propostos"?: number | null,"modelo"?: string | null,"moeda"?: string,"motivo"?: string | null,"paginas"?: number | null,"resultado"?: Json | null,"situacao"?: string,"solicitada_por"?: string,"tokens_entrada"?: number | null,"tokens_saida"?: number | null,"versao_prompt"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "extracao_ia_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "extracao_ia_instrumento_fk"
      columns: ["consultoria_id","instrumento_id"]
isOneToOne: false
      referencedRelation: "instrumento"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "extracao_ia_solicitada_por_fk"
      columns: ["consultoria_id","solicitada_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "extracao_ia_versao_fk"
      columns: ["consultoria_id","documento_versao_id"]
isOneToOne: false
      referencedRelation: "documento_versao"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"instrumento": {
                  Row: {
                    "antecedencia_renovacao_dias": number,"assinado_em": string | null,"assinado_em_texto": string | null,"ativado_em": string | null,"ativado_por": string | null,"chave_ativacao": string | null,"consultoria_id": string,"criado_em": string,"criado_por": string,"documento_id": string | null,"emitido_em": string | null,"emitido_em_texto": string | null,"empreendimento_id": string,"id": string,"marco": Database["public"]['Enums']["marco_instrumento"] | null,"numero": string | null,"orgao": string | null,"publicado_em": string | null,"publicado_em_texto": string | null,"recebido_em": string | null,"recebido_em_texto": string | null,"row_version": number,"situacao": Database["public"]['Enums']["situacao_instrumento"],"tipo_id": string | null,"unidade_id": string,"validade": string | null,"validade_texto": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "antecedencia_renovacao_dias"?: number,"assinado_em"?: string | null,"assinado_em_texto"?: string | null,"ativado_em"?: string | null,"ativado_por"?: string | null,"chave_ativacao"?: string | null,"consultoria_id": string,"criado_em"?: string,"criado_por": string,"documento_id"?: string | null,"emitido_em"?: string | null,"emitido_em_texto"?: string | null,"empreendimento_id": string,"id"?: string,"marco"?: Database["public"]['Enums']["marco_instrumento"] | null,"numero"?: string | null,"orgao"?: string | null,"publicado_em"?: string | null,"publicado_em_texto"?: string | null,"recebido_em"?: string | null,"recebido_em_texto"?: string | null,"row_version"?: number,"situacao"?: Database["public"]['Enums']["situacao_instrumento"],"tipo_id"?: string | null,"unidade_id": string,"validade"?: string | null,"validade_texto"?: string | null
                  }
                  Update: {
                    "antecedencia_renovacao_dias"?: number,"assinado_em"?: string | null,"assinado_em_texto"?: string | null,"ativado_em"?: string | null,"ativado_por"?: string | null,"chave_ativacao"?: string | null,"consultoria_id"?: string,"criado_em"?: string,"criado_por"?: string,"documento_id"?: string | null,"emitido_em"?: string | null,"emitido_em_texto"?: string | null,"empreendimento_id"?: string,"id"?: string,"marco"?: Database["public"]['Enums']["marco_instrumento"] | null,"numero"?: string | null,"orgao"?: string | null,"publicado_em"?: string | null,"publicado_em_texto"?: string | null,"recebido_em"?: string | null,"recebido_em_texto"?: string | null,"row_version"?: number,"situacao"?: Database["public"]['Enums']["situacao_instrumento"],"tipo_id"?: string | null,"unidade_id"?: string,"validade"?: string | null,"validade_texto"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "instrumento_ativado_por_fk"
      columns: ["consultoria_id","ativado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "instrumento_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "instrumento_criado_por_fk"
      columns: ["consultoria_id","criado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "instrumento_documento_fk"
      columns: ["consultoria_id","documento_id"]
isOneToOne: false
      referencedRelation: "documento"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "instrumento_tipo_fk"
      columns: ["consultoria_id","tipo_id"]
isOneToOne: false
      referencedRelation: "tipo_instrumento"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "instrumento_unidade_fk"
      columns: ["consultoria_id","empreendimento_id","unidade_id"]
isOneToOne: false
      referencedRelation: "unidade"
      referencedColumns: ["consultoria_id","empreendimento_id","id"]
    }
                  ]
                },"membro": {
                  Row: {
                    "consultoria_id": string,"criado_em": string,"desligado_em": string | null,"email": string,"id": string,"nome": string,"papel": Database["public"]['Enums']["papel_membro"],"situacao": Database["public"]['Enums']["situacao_membro"],"usuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consultoria_id": string,"criado_em"?: string,"desligado_em"?: string | null,"email": string,"id"?: string,"nome": string,"papel": Database["public"]['Enums']["papel_membro"],"situacao"?: Database["public"]['Enums']["situacao_membro"],"usuario_id": string
                  }
                  Update: {
                    "consultoria_id"?: string,"criado_em"?: string,"desligado_em"?: string | null,"email"?: string,"id"?: string,"nome"?: string,"papel"?: Database["public"]['Enums']["papel_membro"],"situacao"?: Database["public"]['Enums']["situacao_membro"],"usuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "membro_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    }
                  ]
                },"ocorrencia": {
                  Row: {
                    "chave_idempotencia": string,"ciclo": number,"concluida_em": string | null,"concluida_por": string | null,"concluida_sem_evidencia": boolean,"condicionante_versao_id": string | null,"conferente_id": string | null,"consultoria_id": string,"criado_em": string,"id": string,"instrumento_id": string,"meta_interna": string | null,"prazo_oficial_atual": string,"prazo_oficial_original": string,"responsavel_id": string | null,"row_version": number,"situacao": Database["public"]['Enums']["situacao_ocorrencia"]
                  }
                  ComputedFields: never
                  Insert: {
                    "chave_idempotencia": string,"ciclo": number,"concluida_em"?: string | null,"concluida_por"?: string | null,"concluida_sem_evidencia"?: boolean,"condicionante_versao_id"?: string | null,"conferente_id"?: string | null,"consultoria_id": string,"criado_em"?: string,"id"?: string,"instrumento_id": string,"meta_interna"?: string | null,"prazo_oficial_atual": string,"prazo_oficial_original": string,"responsavel_id"?: string | null,"row_version"?: number,"situacao"?: Database["public"]['Enums']["situacao_ocorrencia"]
                  }
                  Update: {
                    "chave_idempotencia"?: string,"ciclo"?: number,"concluida_em"?: string | null,"concluida_por"?: string | null,"concluida_sem_evidencia"?: boolean,"condicionante_versao_id"?: string | null,"conferente_id"?: string | null,"consultoria_id"?: string,"criado_em"?: string,"id"?: string,"instrumento_id"?: string,"meta_interna"?: string | null,"prazo_oficial_atual"?: string,"prazo_oficial_original"?: string,"responsavel_id"?: string | null,"row_version"?: number,"situacao"?: Database["public"]['Enums']["situacao_ocorrencia"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "ocorrencia_concluida_por_fk"
      columns: ["consultoria_id","concluida_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "ocorrencia_conferente_fk"
      columns: ["consultoria_id","conferente_id"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "ocorrencia_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ocorrencia_instrumento_fk"
      columns: ["consultoria_id","instrumento_id"]
isOneToOne: false
      referencedRelation: "instrumento"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "ocorrencia_responsavel_fk"
      columns: ["consultoria_id","responsavel_id"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "ocorrencia_versao_fk"
      columns: ["consultoria_id","condicionante_versao_id"]
isOneToOne: false
      referencedRelation: "condicionante_versao"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"ocorrencia_historico": {
                  Row: {
                    "ator_id": string | null,"consultoria_id": string,"detalhe": string | null,"evidencia_numero": number | null,"id": number,"instante": string,"ocorrencia_id": string,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ator_id"?: string | null,"consultoria_id": string,"detalhe"?: string | null,"evidencia_numero"?: number | null,"id"?: never,"instante"?: string,"ocorrencia_id": string,"tipo": string
                  }
                  Update: {
                    "ator_id"?: string | null,"consultoria_id"?: string,"detalhe"?: string | null,"evidencia_numero"?: number | null,"id"?: never,"instante"?: string,"ocorrencia_id"?: string,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ocorrencia_historico_ator_fk"
      columns: ["consultoria_id","ator_id"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "ocorrencia_historico_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ocorrencia_historico_ocorrencia_fk"
      columns: ["consultoria_id","ocorrencia_id"]
isOneToOne: false
      referencedRelation: "ocorrencia"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"plano_renovacao": {
                  Row: {
                    "acompanhamento_dias": number | null,"antecedencia_dias": number,"consultoria_id": string,"criado_em": string,"dias_limite_protocolo": number,"id": string,"instrumento_id": string,"protocolado_em": string | null,"protocolo_numero": string | null,"protocolo_registrado_em": string | null,"protocolo_registrado_por": string | null,"protocolo_versao_id": string | null,"row_version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "acompanhamento_dias"?: number | null,"antecedencia_dias"?: number,"consultoria_id": string,"criado_em"?: string,"dias_limite_protocolo"?: number,"id"?: string,"instrumento_id": string,"protocolado_em"?: string | null,"protocolo_numero"?: string | null,"protocolo_registrado_em"?: string | null,"protocolo_registrado_por"?: string | null,"protocolo_versao_id"?: string | null,"row_version"?: number
                  }
                  Update: {
                    "acompanhamento_dias"?: number | null,"antecedencia_dias"?: number,"consultoria_id"?: string,"criado_em"?: string,"dias_limite_protocolo"?: number,"id"?: string,"instrumento_id"?: string,"protocolado_em"?: string | null,"protocolo_numero"?: string | null,"protocolo_registrado_em"?: string | null,"protocolo_registrado_por"?: string | null,"protocolo_versao_id"?: string | null,"row_version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "plano_renovacao_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plano_renovacao_instrumento_fk"
      columns: ["consultoria_id","instrumento_id"]
isOneToOne: false
      referencedRelation: "instrumento"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "plano_renovacao_protocolo_versao_fk"
      columns: ["consultoria_id","protocolo_versao_id"]
isOneToOne: false
      referencedRelation: "documento_versao"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "plano_renovacao_registrado_por_fk"
      columns: ["consultoria_id","protocolo_registrado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"tipo_instrumento": {
                  Row: {
                    "consultoria_id": string,"criado_em": string,"id": string,"nome": string,"sigla": string,"sigla_normalizada": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "consultoria_id": string,"criado_em"?: string,"id"?: string,"nome": string,"sigla": string,"sigla_normalizada"?: never
                  }
                  Update: {
                    "consultoria_id"?: string,"criado_em"?: string,"id"?: string,"nome"?: string,"sigla"?: string,"sigla_normalizada"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "tipo_instrumento_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    }
                  ]
                },"unidade": {
                  Row: {
                    "consultoria_id": string,"criado_em": string,"empreendimento_id": string,"endereco": string | null,"id": string,"nome": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consultoria_id": string,"criado_em"?: string,"empreendimento_id": string,"endereco"?: string | null,"id"?: string,"nome": string
                  }
                  Update: {
                    "consultoria_id"?: string,"criado_em"?: string,"empreendimento_id"?: string,"endereco"?: string | null,"id"?: string,"nome"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "unidade_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "unidade_empreendimento_fk"
      columns: ["consultoria_id","empreendimento_id"]
isOneToOne: false
      referencedRelation: "empreendimento"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "aceitar_convite":
{ Args: { "p_token": string }; Returns: string
                           },
"alterar_papel":
{ Args: { "p_membro_id": string,"p_papel": Database["public"]['Enums']["papel_membro"] }; Returns: undefined
                           },
"ativar_plano":
{ Args: { "p_chave": string,"p_instrumento_id": string,"p_row_version": number }; Returns: number
                           },
"atribuir_a_todos":
{ Args: { "p_instrumento_id": string,"p_membro_id": string }; Returns: undefined
                           },
"atribuir_ocorrencia":
{ Args: { "p_membro_id": string,"p_ocorrencia_id": string,"p_row_version": number }; Returns: number
                           },
"cancelar_convite":
{ Args: { "p_convite_id": string }; Returns: undefined
                           },
"concluir_etapa":
{ Args: { "p_etapa_id": string }; Returns: undefined
                           },
"concluir_extracao_ia":
{ Args: { "p_custo_micros": number,"p_duracao_ms": number,"p_id": string,"p_modelo": string,"p_paginas": number,"p_resultado": Json,"p_tokens_entrada": number,"p_tokens_saida": number,"p_versao_prompt": string }; Returns: number
                           },
"concluir_ocorrencia":
{ Args: { "p_ocorrencia_id": string,"p_row_version": number }; Returns: number
                           },
"concluir_sem_evidencia":
{ Args: { "p_justificativa": string,"p_ocorrencia_id": string,"p_row_version": number }; Returns: number
                           },
"conferir_evidencia":
{ Args: { "p_decisao": Database["public"]['Enums']["decisao_conferencia"],"p_evidencia_id": string,"p_motivo": string }; Returns: undefined
                           },
"confirmar_prazo":
{ Args: { "p_condicionante_id": string,"p_contagem": Database["public"]['Enums']["contagem_prazo"],"p_data_referencia": string,"p_fonte_regra": string,"p_intervalo": number,"p_primeira_data": string,"p_recorrencia": Database["public"]['Enums']["recorrencia_prazo"],"p_unidade": Database["public"]['Enums']["unidade_ciclo"] }; Returns: undefined
                           },
"consultar_convite":
{ Args: { "p_token": string }; Returns: {
              "consultoria_fuso": string,"consultoria_nome": string,"conta_com_senha": boolean,"convidado_por_nome": string,"email": string,"expira_em": string,"papel": Database["public"]['Enums']["papel_membro"],"situacao": string
            }[]
                           },
"contar_prazos":
{ Args: { "p_aba"?: string,"p_consultoria_id": string,"p_empreendimento_id"?: string,"p_responsavel_id"?: string,"p_sem_responsavel"?: boolean,"p_tipo_id"?: string }; Returns: {
              "atrasadas": number,"hoje": number,"proximos_7": number,"sem_responsavel": number,"total": number
            }[]
                           },
"criar_consultoria":
{ Args: { "p_id": string,"p_nome": string }; Returns: string
                           },
"criar_convite":
{ Args: { "p_consultoria_id": string,"p_email": string,"p_papel": Database["public"]['Enums']["papel_membro"] }; Returns: {
              "convite_id": string,"token": string
            }[]
                           },
"criar_empreendimento":
{ Args: { "p_cliente"?: string,"p_cnpj"?: string,"p_consultoria_id": string,"p_id": string,"p_nome": string,"p_primeira_unidade"?: string }; Returns: string
                           },
"criar_etapa":
{ Args: { "p_horas": number,"p_id": string,"p_meta": string,"p_modo": Database["public"]['Enums']["modo_etapa"],"p_ocorrencia_id": string,"p_responsavel_externo": string,"p_responsavel_id": string,"p_titulo": string }; Returns: string
                           },
"criar_instrumento":
{ Args: { "p_id": string,"p_unidade_id": string }; Returns: string
                           },
"criar_tipo_instrumento":
{ Args: { "p_consultoria_id": string,"p_nome": string,"p_sigla": string }; Returns: string
                           },
"criar_unidade":
{ Args: { "p_empreendimento_id": string,"p_endereco"?: string,"p_id": string,"p_nome": string }; Returns: string
                           },
"definir_acompanhamento":
{ Args: { "p_dias": number,"p_plano_id": string,"p_row_version": number }; Returns: number
                           },
"definir_antecedencia_renovacao":
{ Args: { "p_antecedencia": number,"p_plano_id": string,"p_row_version": number }; Returns: number
                           },
"definir_responsavel":
{ Args: { "p_condicionante_id": string,"p_membro_id": string }; Returns: undefined
                           },
"designar_conferente":
{ Args: { "p_membro_id": string,"p_ocorrencia_id": string }; Returns: undefined
                           },
"desligar_membro":
{ Args: { "p_membro_id": string,"p_motivo"?: string }; Returns: undefined
                           },
"editar_empreendimento":
{ Args: { "p_cliente": string,"p_cnpj": string,"p_id": string,"p_nome": string }; Returns: undefined
                           },
"editar_unidade":
{ Args: { "p_endereco": string,"p_id": string,"p_nome": string }; Returns: undefined
                           },
"empreendimentos_parecidos":
{ Args: { "p_cnpj"?: string,"p_consultoria_id": string,"p_ignorar"?: string,"p_nome": string }; Returns: {
              "id": string,"mesmo_cnpj": boolean,"mesmo_nome": boolean,"nome": string
            }[]
                           },
"enviar_evidencia":
{ Args: { "p_caminho": string,"p_data_execucao": string,"p_evidencia_id": string,"p_nome_original": string,"p_ocorrencia_id": string,"p_sha256": string,"p_versao_id": string }; Returns: number
                           },
"falhar_extracao_ia":
{ Args: { "p_custo_micros": number,"p_detalhe": string,"p_duracao_ms": number,"p_id": string,"p_modelo": string,"p_motivo": string,"p_paginas": number,"p_tokens_entrada": number,"p_tokens_saida": number,"p_versao_prompt": string }; Returns: undefined
                           },
"iniciar_extracao_ia":
{ Args: { "p_id": string,"p_instrumento_id": string }; Returns: {
              "caminho": string,"itens_propostos": number,"mime": string,"motivo": string,"nova": boolean,"situacao": string,"tamanho_bytes": number,"tipos": (string)[]
            }[]
                           },
"listar_aguardando_conferencia":
{ Args: { "p_consultoria_id": string,"p_deslocamento"?: number,"p_limite"?: number }; Returns: {
              "codigo": string,"conferente_nome": string,"empreendimento_nome": string,"enviada_em": string,"evidencia_numero": number,"ocorrencia_id": string,"responsavel_nome": string,"titulo": string,"total": number
            }[]
                           },
"listar_calendario":
{ Args: { "p_ate": string,"p_consultoria_id": string,"p_de": string,"p_responsavel_id"?: string,"p_sem_responsavel"?: boolean,"p_unidade_id"?: string }; Returns: {
              "codigo": string,"data": string,"dias": number,"empreendimento_nome": string,"id": string,"instrumento_id": string,"licenca": string,"responsavel_nome": string,"sem_responsavel": boolean,"tipo_evento": string,"titulo": string,"unidade_nome": string
            }[]
                           },
"listar_empreendimentos":
{ Args: { "p_busca"?: string,"p_consultoria_id": string,"p_deslocamento"?: number,"p_limite"?: number }; Returns: {
              "cliente_nome": string,"cnpj": string,"criado_em": string,"id": string,"licencas": Json,"nome": string,"total": number,"unidades": number
            }[]
                           },
"listar_prazos":
{ Args: { "p_aba"?: string,"p_consultoria_id": string,"p_deslocamento"?: number,"p_empreendimento_id"?: string,"p_faixa"?: string,"p_limite"?: number,"p_ordem"?: string,"p_responsavel_id"?: string,"p_sem_responsavel"?: boolean,"p_tipo_id"?: string }; Returns: {
              "codigo": string,"dias": number,"empreendimento_id": string,"empreendimento_nome": string,"id": string,"instrumento_id": string,"licenca": string,"prazo": string,"responsavel_id": string,"responsavel_nome": string,"row_version": number,"situacao_ocorrencia": Database["public"]['Enums']["situacao_ocorrencia"],"tipo_linha": string,"titulo": string,"total": number,"unidade_nome": string
            }[]
                           },
"listar_renovacoes":
{ Args: { "p_consultoria_id": string,"p_deslocamento"?: number,"p_limite"?: number }; Returns: {
              "acompanhamento_dias": number,"antecedencia_dias": number,"dias_limite_protocolo": number,"empreendimento_id": string,"empreendimento_nome": string,"hoje": string,"id": string,"instrumento_id": string,"licenca": string,"orgao": string,"protocolado_em": string,"protocolo_numero": string,"total": number,"unidade_nome": string,"validade": string
            }[]
                           },
"meus_vinculos":
{ Args: Record<PropertyKey, never>; Returns: {
              "consultoria_fuso": string,"consultoria_id": string,"consultoria_nome": string,"desligado_em": string,"membro_id": string,"papel": Database["public"]['Enums']["papel_membro"],"situacao": Database["public"]['Enums']["situacao_membro"]
            }[]
                           },
"obter_ocorrencia":
{ Args: { "p_id": string }; Returns: {
              "ciclo": number,"codigo": string,"concluida_em": string,"concluida_por_nome": string,"concluida_sem_evidencia": boolean,"conferencia_independente": boolean,"conferente_id": string,"conferente_nome": string,"consultoria_id": string,"data_referencia": string,"empreendimento_id": string,"empreendimento_nome": string,"hoje": string,"id": string,"instrumento_id": string,"licenca": string,"meta_interna": string,"prazo_ciclo_anterior": string,"prazo_oficial_atual": string,"prazo_oficial_original": string,"responsavel_id": string,"responsavel_nome": string,"row_version": number,"situacao": Database["public"]['Enums']["situacao_ocorrencia"],"texto_literal": string,"titulo": string,"unidade_nome": string
            }[]
                           },
"obter_plano_renovacao":
{ Args: { "p_instrumento_id": string }; Returns: {
              "acompanhamento_dias": number,"antecedencia_dias": number,"comprovante_caminho": string,"comprovante_nome": string,"comprovante_tamanho": number,"consultoria_id": string,"dias_limite_protocolo": number,"empreendimento_id": string,"empreendimento_nome": string,"hoje": string,"id": string,"instrumento_id": string,"licenca": string,"orgao": string,"protocolado_em": string,"protocolo_numero": string,"registrado_em": string,"registrado_por_nome": string,"row_version": number,"unidade_nome": string,"validade": string
            }[]
                           },
"reabrir_ocorrencia":
{ Args: { "p_motivo": string,"p_ocorrencia_id": string,"p_row_version": number }; Returns: number
                           },
"reenviar_convite":
{ Args: { "p_convite_id": string }; Returns: string
                           },
"registrar_pdf_instrumento":
{ Args: { "p_caminho": string,"p_instrumento_id": string,"p_nome_original": string,"p_sha256": string,"p_versao_id": string }; Returns: string
                           },
"registrar_protocolo":
{ Args: { "p_caminho": string,"p_data": string,"p_nome_original": string,"p_numero": string,"p_plano_id": string,"p_row_version": number,"p_sha256": string,"p_versao_id": string }; Returns: number
                           },
"revisar_condicionante":
{ Args: { "p_id": string,"p_revisao": Database["public"]['Enums']["revisao_condicionante"] }; Returns: undefined
                           },
"salvar_condicionante":
{ Args: { "p_codigo": string,"p_id": string,"p_instrumento_id": string,"p_natureza": Database["public"]['Enums']["natureza_condicionante"],"p_pai_id": string,"p_texto_literal": string,"p_titulo": string }; Returns: string
                           },
"salvar_identificacao":
{ Args: { "p_assinado_em": string,"p_emitido_em": string,"p_id": string,"p_marco": Database["public"]['Enums']["marco_instrumento"],"p_numero": string,"p_orgao": string,"p_publicado_em": string,"p_recebido_em": string,"p_row_version": number,"p_tipo_id": string,"p_unidade_id": string,"p_validade": string }; Returns: number
                           }
          }
          Enums: {
            "acao_auditoria": "insert"|"update"|"delete","contagem_prazo": "corridos"|"uteis","decisao_conferencia": "aprovada"|"devolvida","marco_instrumento": "emissao"|"assinatura"|"publicacao"|"recebimento","modo_etapa": "trabalho"|"espera_externa","natureza_condicionante": "obrigacao"|"agrupador"|"informacao_geral"|"condicao_continua","papel_membro": "gestao"|"equipe","recorrencia_prazo": "anual"|"semestral"|"trimestral"|"bimestral"|"mensal"|"unica"|"na_renovacao"|"continua"|"personalizada","revisao_condicionante": "pendente"|"aceita"|"descartada","situacao_consultoria": "ativa"|"suspensa"|"arquivada","situacao_convite": "pendente"|"aceito"|"cancelado","situacao_evidencia": "em_conferencia"|"aprovada"|"devolvida","situacao_instrumento": "rascunho"|"ativo","situacao_membro": "ativo"|"desligado","situacao_ocorrencia": "aberta"|"em_conferencia"|"concluida","unidade_ciclo": "mes"|"dia"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "acao_auditoria": ["insert", "update", "delete"],"contagem_prazo": ["corridos", "uteis"],"decisao_conferencia": ["aprovada", "devolvida"],"marco_instrumento": ["emissao", "assinatura", "publicacao", "recebimento"],"modo_etapa": ["trabalho", "espera_externa"],"natureza_condicionante": ["obrigacao", "agrupador", "informacao_geral", "condicao_continua"],"papel_membro": ["gestao", "equipe"],"recorrencia_prazo": ["anual", "semestral", "trimestral", "bimestral", "mensal", "unica", "na_renovacao", "continua", "personalizada"],"revisao_condicionante": ["pendente", "aceita", "descartada"],"situacao_consultoria": ["ativa", "suspensa", "arquivada"],"situacao_convite": ["pendente", "aceito", "cancelado"],"situacao_evidencia": ["em_conferencia", "aprovada", "devolvida"],"situacao_instrumento": ["rascunho", "ativo"],"situacao_membro": ["ativo", "desligado"],"situacao_ocorrencia": ["aberta", "em_conferencia", "concluida"],"unidade_ciclo": ["mes", "dia"]
          }
        }
} as const
