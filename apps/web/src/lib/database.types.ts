
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
"cancelar_convite":
{ Args: { "p_convite_id": string }; Returns: undefined
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
"desligar_membro":
{ Args: { "p_membro_id": string,"p_motivo"?: string }; Returns: undefined
                           },
"criar_empreendimento":
{ Args: { "p_cliente"?: string,"p_cnpj"?: string,"p_consultoria_id": string,"p_id": string,"p_nome": string,"p_primeira_unidade"?: string }; Returns: string
                           },
"criar_unidade":
{ Args: { "p_empreendimento_id": string,"p_endereco"?: string,"p_id": string,"p_nome": string }; Returns: string
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
              "cliente_nome": string,"cnpj": string,"criado_em": string,"id": string,"nome": string,"total": number,"unidades": number
            }[]
                           },
"meus_vinculos":
{ Args: Record<PropertyKey, never>; Returns: {
              "consultoria_fuso": string,"consultoria_id": string,"consultoria_nome": string,"desligado_em": string,"membro_id": string,"papel": Database["public"]['Enums']["papel_membro"],"situacao": Database["public"]['Enums']["situacao_membro"]
            }[]
                           },
"reenviar_convite":
{ Args: { "p_convite_id": string }; Returns: string
                           }
          }
          Enums: {
            "acao_auditoria": "insert"|"update"|"delete","papel_membro": "gestao"|"equipe","situacao_consultoria": "ativa"|"suspensa"|"arquivada","situacao_convite": "pendente"|"aceito"|"cancelado","situacao_membro": "ativo"|"desligado"
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
            "acao_auditoria": ["insert", "update", "delete"],"papel_membro": ["gestao", "equipe"],"situacao_consultoria": ["ativa", "suspensa", "arquivada"],"situacao_convite": ["pendente", "aceito", "cancelado"],"situacao_membro": ["ativo", "desligado"]
          }
        }
} as const
