# ADR-0061: Conferência de relatórios por IA só com a autorização da Gestão

- **Situação:** aceito em 21/11/2026, na correção da auditoria do ChatGPT sobre o PR #44. O Eduardo autorizou corrigir tudo; o Kadu revisa.
- **Altera:** ADR-0036 (item 8 das decisões por padrão) e ADR-0037 (onde roda e cota). Camada `camada/ia-e-relatorio-mensal`.

## Contexto

A política de privacidade do site (seção 4), os termos (seção 4) e o RNF 9 dizem: só o PDF da licença vai à IA, e só quando alguém da equipe escolhe ler com IA; evidências, outros documentos e mensagens não vão. A conferência por IA (ADR-0037 e ADR-0040) fazia outra coisa:

| Ponto           | Política                                   | Código antes                                                                                                                                                            |
| --------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dados ao modelo | só o PDF da licença                        | texto inteiro do relatório (evidência .pdf/.docx ou relatório escrito no Grama) e o cadastro: empreendimento, cliente, CNPJ, unidade, endereço, licença e condicionante |
| Anonimização    | não diz                                    | nenhuma                                                                                                                                                                 |
| Plano           | planos com IA                              | recurso `ia` do plano (Essencial não; teste, beta e conta interna sim)                                                                                                  |
| Consentimento   | quem usa escolhe; termo aceito pela Gestão | nenhum: a tela disparava sozinha ao anexar                                                                                                                              |
| Limite          | cota por consultoria                       | cota somada com a extração: 10 por pessoa, 25 por consultoria e 100 no projeto em 24 horas                                                                              |

A ADR-0036 deixou em aberto ("falta confirmar com o Kadu se isso entra no aviso de privacidade"). Sem decisão registrada, vale o lado mais conservador para os dados do cliente.

## Decisão

1. **Desligada por padrão.** Nada do relatório vai à IA até a Gestão da consultoria ligar em Configurações › IA. Ligar pede confirmação e fica registrado (quem e quando) na tabela `autorizacao_ia`, só de acréscimo, com auditoria. Desligar é um clique. A Equipe não vê a aba.
2. **O banco barra.** `reservar_conferencia_ia` recusa com `ia_nao_autorizada` antes da chamada paga; a conferência termina com esse motivo e grava só os apontamentos das regras fixas, que continuam rodando sempre (não mandam nada para fora).
3. **Dados pessoais mascarados.** Antes do envio, CPF (com pontuação ou 11 dígitos com dígito verificador válido), e-mail e telefone com DDD viram `[CPF]`, `[e-mail]` e `[telefone]`. CNPJ, datas e números de protocolo ficam, porque a conferência compara com o cadastro. O prompt (`conferencia-v3`) diz que os marcadores não são campo sem preencher.
4. **Plano e limite não mudam:** recurso `ia` do plano e a cota somada com a extração.
5. **A extração de licença não muda:** já era escolhida por quem usa, como a política diz.

## Consequências

- Migration `20261122041500_autorizacao_ia_da_conferencia.sql` e pgTAP 796 (com o negativo de outra consultoria); 690 e 700 passam a ligar a autorização antes de reservar (regra mudada de propósito).
- Consultoria que usava a conferência por IA passa a ver "Não conferido pela IA: a Gestão não ligou a conferência por IA" até ligar.
- O RNF 9 e o Anexo III do acordo de tratamento foram atualizados. A política pública e os termos do site precisam do texto de `docs/juridico/texto-site-ia-conferencia.md` **antes** de alguma consultoria ligar a conferência; até lá, desligada, o site continua certo.
