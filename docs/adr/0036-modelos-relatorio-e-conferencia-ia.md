# ADR-0036: Modelos de documento, relatório em .docx e conferência por IA

- **Situação:** aceito em 19/11/2026, a pedido do Eduardo. O Kadu revisa.
- **Desenho mostrado ao Eduardo:** https://claude.ai/artifact/2XPKDDqdLcLGoE626vcFM6

## Contexto

O Eduardo pediu três coisas:

1. Um editor de texto para a consultoria cadastrar documentos e textos padrão, numa área de configuração fora do dia a dia.
2. Ao fazer um relatório para um empreendimento, puxar o modelo já com os dados do cadastro e exportar para Word.
3. Quando a pessoa anexa o relatório para a Gestão conferir, uma IA confere antes (consistência, dados do empreendimento e da licença, condicionantes citadas, datas, erros). O resultado aparece para quem enviou e para quem confere.

Já existiam o anexo da evidência (PDF, PNG ou JPG, imutável e versionado) e a conferência pela Gestão (aprovar ou devolver com motivo). Também existia a extração de licença por IA (`extrair-licenca`); o plano e a cota dela estão na `camada/vistoria-geral`. Não existiam editor, modelo de documento nem exportação .docx.

## Decisão

### Fatia 1: modelos de documento (`camada/modelos-de-documento`)

- Tabela `modelo_documento` com RLS forçada. Todo membro ativo lê; só a Gestão cria, edita e arquiva, sempre pelas RPCs `salvar_modelo_documento` (controle otimista, nome único entre os ativos) e `arquivar_modelo_documento` (exclusão lógica). Tem auditoria e as travas de suporte e de só leitura comercial.
- O conteúdo é a árvore JSON do editor (TipTap 3, sobre ProseMirror). O banco confere só a raiz `doc` e o tamanho (500 mil caracteres).
- **Campo** é um nó inline `{type: "campo", attrs: {chave}}`. A lista de campos, a validação e o preenchimento ficam em `packages/domain/src/modelo-documento.ts`. Campo sem valor sai como `[Rótulo]`, para a pessoa ver o que falta.
- As telas ficam em `/configuracoes/modelos` e `/configuracoes/modelos/:id`. Entram pelo menu da conta, só para a Gestão, e não pelo menu principal.
- Recursos do editor: título 1 a 3, negrito, itálico, sublinhado, listas, alinhamento e tabela. Não há link, código nem imagem: o .docx precisa saber converter tudo o que o editor aceita.

### Fatia 2: relatório em .docx (mesma camada)

- A RPC `dados_para_relatorio(empreendimento, ocorrência?)` faz uma leitura só. É `security invoker`: a RLS decide o acesso.
- O .docx é gerado no navegador com a biblioteca `docx`, carregada sob demanda. Não usa rede nem segredo, e o Grama não guarda o rascunho.

### Fatia 3: conferência por IA (`camada/conferencia-ia`, sobre a `camada/vistoria-geral`)

Esta fatia está descrita no PR dela.

## Decisões de produto tomadas por padrão

O Eduardo pediu para seguir as recomendações e ajustar depois. Por isso cada item abaixo pode mudar.

1. Só a Gestão cria e edita modelos; a Equipe usa.
2. O rascunho do relatório não fica no Grama: a pessoa baixa, edita no Word e anexa o arquivo final.
3. A evidência passa a aceitar .docx, para a Gestão corrigir no Word (fatia 3).
4. A IA não bloqueia o envio: ela só aponta, e a Gestão decide.
5. A cota da conferência soma com a da extração: 10 por pessoa, 25 por consultoria e 100 no projeto em 24 horas.
6. Cada versão reenviada é conferida de novo e conta na cota.
7. O papel timbrado (logo, cabeçalho e rodapé) fica para depois. A logo da proposta (`identidade`) pode ser reaproveitada.
8. O texto do relatório vai ao provedor de IA como já vai o da licença: OpenRouter, provedores sem coleta de dados. Falta confirmar com o Kadu se isso entra no aviso de privacidade.

## Consequências

- Duas dependências novas no web: `@tiptap/*` 3.32.2 e `docx` 9.15.2 (MIT), com mais de duas semanas de publicadas.
- Com a camada `ui-limpa`, as telas novas passam a usar `Pagina` com `acaoPrincipal` e `mais`.
