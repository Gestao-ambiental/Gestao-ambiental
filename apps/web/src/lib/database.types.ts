
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
                    "codigo": string,"consultoria_id": string,"criado_em": string,"id": string,"instrumento_id": string,"origem": string,"pai_id": string | null,"posicao": number,"responsavel_id": string | null,"revisao": Database["public"]['Enums']["revisao_condicionante"],"versao_vigente_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "codigo": string,"consultoria_id": string,"criado_em"?: string,"id"?: string,"instrumento_id": string,"origem"?: string,"pai_id"?: string | null,"posicao": number,"responsavel_id"?: string | null,"revisao"?: Database["public"]['Enums']["revisao_condicionante"],"versao_vigente_id"?: string | null
                  }
                  Update: {
                    "codigo"?: string,"consultoria_id"?: string,"criado_em"?: string,"id"?: string,"instrumento_id"?: string,"origem"?: string,"pai_id"?: string | null,"posicao"?: number,"responsavel_id"?: string | null,"revisao"?: Database["public"]['Enums']["revisao_condicionante"],"versao_vigente_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "condicionante_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
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
                },"consultoria": {
                  Row: {
                    "criada_em": string,"fuso": string,"id": string,"nome": string,"situacao": Database["public"]['Enums']["situacao_consultoria"]
                  }
                  ComputedFields: never
                  Insert: {
                    "criada_em"?: string,"fuso"?: string,"id"?: string,"nome": string,"situacao"?: Database["public"]['Enums']["situacao_consultoria"]
                  }
                  Update: {
                    "criada_em"?: string,"fuso"?: string,"id"?: string,"nome"?: string,"situacao"?: Database["public"]['Enums']["situacao_consultoria"]
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
                    "chave_idempotencia": string,"ciclo": number,"condicionante_versao_id": string | null,"consultoria_id": string,"criado_em": string,"id": string,"instrumento_id": string,"meta_interna": string | null,"prazo_oficial_atual": string,"prazo_oficial_original": string,"responsavel_id": string | null,"row_version": number,"situacao": Database["public"]['Enums']["situacao_ocorrencia"]
                  }
                  ComputedFields: never
                  Insert: {
                    "chave_idempotencia": string,"ciclo": number,"condicionante_versao_id"?: string | null,"consultoria_id": string,"criado_em"?: string,"id"?: string,"instrumento_id": string,"meta_interna"?: string | null,"prazo_oficial_atual": string,"prazo_oficial_original": string,"responsavel_id"?: string | null,"row_version"?: number,"situacao"?: Database["public"]['Enums']["situacao_ocorrencia"]
                  }
                  Update: {
                    "chave_idempotencia"?: string,"ciclo"?: number,"condicionante_versao_id"?: string | null,"consultoria_id"?: string,"criado_em"?: string,"id"?: string,"instrumento_id"?: string,"meta_interna"?: string | null,"prazo_oficial_atual"?: string,"prazo_oficial_original"?: string,"responsavel_id"?: string | null,"row_version"?: number,"situacao"?: Database["public"]['Enums']["situacao_ocorrencia"]
                  }
                  Relationships: [
                    {
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
"cancelar_convite":
{ Args: { "p_convite_id": string }; Returns: undefined
                           },
"confirmar_prazo":
{ Args: { "p_condicionante_id": string,"p_contagem": Database["public"]['Enums']["contagem_prazo"],"p_data_referencia": string,"p_fonte_regra": string,"p_intervalo": number,"p_primeira_data": string,"p_recorrencia": Database["public"]['Enums']["recorrencia_prazo"],"p_unidade": Database["public"]['Enums']["unidade_ciclo"] }; Returns: undefined
                           },
"consultar_convite":
{ Args: { "p_token": string }; Returns: {
              "consultoria_fuso": string,"consultoria_nome": string,"conta_com_senha": boolean,"convidado_por_nome": string,"email": string,"expira_em": string,"papel": Database["public"]['Enums']["papel_membro"],"situacao": string
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
"criar_instrumento":
{ Args: { "p_id": string,"p_unidade_id": string }; Returns: string
                           },
"criar_tipo_instrumento":
{ Args: { "p_consultoria_id": string,"p_nome": string,"p_sigla": string }; Returns: string
                           },
"criar_unidade":
{ Args: { "p_empreendimento_id": string,"p_endereco"?: string,"p_id": string,"p_nome": string }; Returns: string
                           },
"definir_responsavel":
{ Args: { "p_condicionante_id": string,"p_membro_id": string }; Returns: undefined
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
"listar_empreendimentos":
{ Args: { "p_busca"?: string,"p_consultoria_id": string,"p_deslocamento"?: number,"p_limite"?: number }; Returns: {
              "cliente_nome": string,"cnpj": string,"criado_em": string,"id": string,"licencas": Json,"nome": string,"total": number,"unidades": number
            }[]
                           },
"meus_vinculos":
{ Args: Record<PropertyKey, never>; Returns: {
              "consultoria_fuso": string,"consultoria_id": string,"consultoria_nome": string,"desligado_em": string,"membro_id": string,"papel": Database["public"]['Enums']["papel_membro"],"situacao": Database["public"]['Enums']["situacao_membro"]
            }[]
                           },
"reenviar_convite":
{ Args: { "p_convite_id": string }; Returns: string
                           },
"registrar_pdf_instrumento":
{ Args: { "p_caminho": string,"p_instrumento_id": string,"p_nome_original": string,"p_sha256": string,"p_versao_id": string }; Returns: string
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
            "acao_auditoria": "insert"|"update"|"delete","contagem_prazo": "corridos"|"uteis","marco_instrumento": "emissao"|"assinatura"|"publicacao"|"recebimento","natureza_condicionante": "obrigacao"|"agrupador"|"informacao_geral"|"condicao_continua","papel_membro": "gestao"|"equipe","recorrencia_prazo": "anual"|"semestral"|"trimestral"|"bimestral"|"mensal"|"unica"|"na_renovacao"|"continua"|"personalizada","revisao_condicionante": "pendente"|"aceita"|"descartada","situacao_consultoria": "ativa"|"suspensa"|"arquivada","situacao_convite": "pendente"|"aceito"|"cancelado","situacao_instrumento": "rascunho"|"ativo","situacao_membro": "ativo"|"desligado","situacao_ocorrencia": "aberta"|"em_conferencia"|"concluida","unidade_ciclo": "mes"|"dia"
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
            "acao_auditoria": ["insert", "update", "delete"],"contagem_prazo": ["corridos", "uteis"],"marco_instrumento": ["emissao", "assinatura", "publicacao", "recebimento"],"natureza_condicionante": ["obrigacao", "agrupador", "informacao_geral", "condicao_continua"],"papel_membro": ["gestao", "equipe"],"recorrencia_prazo": ["anual", "semestral", "trimestral", "bimestral", "mensal", "unica", "na_renovacao", "continua", "personalizada"],"revisao_condicionante": ["pendente", "aceita", "descartada"],"situacao_consultoria": ["ativa", "suspensa", "arquivada"],"situacao_convite": ["pendente", "aceito", "cancelado"],"situacao_instrumento": ["rascunho", "ativo"],"situacao_membro": ["ativo", "desligado"],"situacao_ocorrencia": ["aberta", "em_conferencia", "concluida"],"unidade_ciclo": ["mes", "dia"]
          }
        }
} as const
