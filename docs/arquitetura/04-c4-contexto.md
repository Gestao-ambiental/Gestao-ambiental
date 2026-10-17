# 04 · C4 nível 1 — Contexto

**C4 nível 1 — Diagrama de Contexto · Gestão Ambiental (Nexo/Vigea)** · v0.1 · 05/10/2026
Base: one-pager (página "Contexto") e página "Requisitos não-funcionais".
O diagrama de contexto mostra o sistema como uma única caixa, quem interage com ele e com quais sistemas externos ele conversa. Sem detalhe interno — isso fica no nível 2 (Containers).
* * *
## Diagrama
**📊 \[Diagrama — cole aqui a imagem copiada no botão “Copiar imagem”\]**
Linhas cheias são integrações do MVP; tracejadas são fluxos humanos ou ondas futuras. Para a página do ClickUp, renderizar em [mermaid.live](http://mermaid.live) e anexar a imagem, como no AgroFuturo.
* * *
## Pessoas (atores)
**Gestão da consultoria** — usuário principal do MVP. No piloto, uma pessoa na Filtroville. Cadastra a consultoria e convida a equipe; cadastra empreendimentos e instrumentos; sobe o PDF, **revisa o que a IA propôs** e confirma; define prazos, recorrências e responsáveis; ativa o plano; aprova alterações de regra; conclui entregas e encerra processos. É quem responde pela consultoria.
**Equipe da consultoria** — cinco pessoas no piloto. Vê a visão da equipe e o calendário, executa etapas, anexa evidências, confere quando designada, comenta e encaminha. Não ativa instrumento, não muda regra oficial, não conclui sem ser gestão. Usa o celular em campo.
**Empreendimento / cliente da consultoria** — _fora do MVP_. Dono da licença. No MVP só existe como cadastro. O portal do cliente é feature futura e está no diagrama para deixar explícita a fronteira de permissões que o sistema já respeita desde o início: nada do que é interno da consultoria (notas, horas, custo, margem) pode vazar para ele.
**Operadora (Envora Ambiental)** — _logo após o MVP_. Gere consultorias, planos, limites e situação pela central administrativa, com identidade e permissões próprias, **sem acesso aos documentos e mensagens das consultorias**. No piloto, essa administração é feita direto no painel do Supabase pelo desenvolvedor.
* * *
## Sistema em foco
**Gestão Ambiental** — SaaS web para consultorias ambientais, com dados isolados por consultoria. Guarda empreendimentos e unidades, instrumentos emitidos e alvarás, condicionantes revisadas, ocorrências com etapas, evidências e conferências, planos de renovação, processos de obtenção com dossiê, e — nas ondas seguintes — capacidade da equipe, comercial, resíduos, documentos por modelo, chat e análise de lote. Português, Brasil, `America/Sao_Paulo`, datas civis.
* * *
## Sistemas externos
**OpenRouter** — porta de entrada para os modelos de IA que leem o PDF da licença e devolvem JSON estruturado (identificação + condicionantes com texto literal, fonte, natureza e periodicidade). Começa-se testando modelos GPT com o mesmo prompt do protótipo; a escolha é por custo-benefício contra o gabarito. **Dependência não bloqueante**: se cair, o cadastro manual continua. A chamada sai de uma Edge Function com chave do servidor; o navegador nunca fala com o provedor. **O PDF sai do Brasil** — ver RNF 9.
**Serviço de e-mail** — convites e recuperação de senha. No MVP, o SMTP do Supabase Auth; antes do go-live, SMTP customizado (Resend) por causa do limite de envio. E-mails operacionais (resumo de prazos) ficam fora do MVP e, quando entrarem, usam o mesmo provedor (ADR-0013). **Não bloqueante**.
**Órgão ambiental (IMA/SC, prefeituras)** — **fora do sistema**. Emite a licença e recebe os protocolos. Não há integração: o PDF chega por e-mail ou portal e uma pessoa o anexa; o protocolo é feito pela pessoa no portal do órgão e **registrado** no sistema (número, data, comprovante). O sistema nunca afirma regularidade perante o órgão.
**Google Workspace** — onda 7. Criar e copiar Google Docs por modelo, via OAuth com escopo `drive.file`. Sem configuração, o vínculo é manual por URL.
**Bases cartográficas** — onda 9. Limite municipal, hidrografia, lotes, zoneamento, tiles de mapa. Exigem política de atualização e licença de uso antes de entrar.
**Calendários externos** — exportação ICS na onda 2; sincronização com Google/Outlook fora do MVP.
* * *
## Entrada de instrumentos no sistema ✅
Dois caminhos, ambos com revisão humana obrigatória antes de qualquer prazo existir:
1. **PDF + IA** — o gestor sobe o PDF, a IA propõe, o gestor revisa item a item e ativa.
2. **Manual** — o gestor preenche tudo. É o caminho quando a IA está indisponível, quando o PDF é escaneado ou quando o gestor prefere.
Importação em lote (CSV/planilha) fica fora do MVP (IMP-01).
* * *
## Fronteiras e decisões relevantes
*   Toda autorização é aplicada **no servidor** (RLS + funções do banco). O portal do cliente e a central da operadora encontram a barreira pronta.
*   O sistema **não emite licença, não garante regularidade, não interpreta automaticamente o efeito jurídico de uma cláusula**. A IA sugere; uma pessoa habilitada aprova (pacote §1.1).
*   Nenhum gateway de pagamento, assinatura digital qualificada, bureau ou portal oficial de MTR faz parte do contexto.
*   O protótipo (Nexo) não é um sistema externo: ele é referência de regras e telas e será desligado quando a Filtroville estiver na versão nova.
* * *
## Pendências ⚠️
*   Definir, com o primeiro teste contra o gabarito, qual modelo via OpenRouter fica como padrão e qual é o fallback.
*   Confirmar quais provedores no OpenRouter aceitam PDF diretamente e quais exigem extração de texto antes (muda a Edge Function).