# 09 · Regras de negócio

**Regras de negócio — Gestão Ambiental (Nexo/Vigea)** · v0.1 · 05/10/2026
Os **requisitos funcionais** estão na página 02 e vão virar épicos e histórias no ClickUp — esta página não os repete. Aqui ficam só as **regras transversais**, que valem em várias histórias e seriam decididas de novo a cada uma se não estivessem escritas.
As regras da seção 1 foram **confirmadas pelo Eduardo no pacote do protótipo (05/10/2026)** e valem como decididas por decisão de 05/10; a referência `§x.y` aponta para a seção do pacote. Em divergência entre esta página e um card, **o card prevalece**.
* * *
## 1\. Decididas ✅
### Consultoria, acesso e papéis
*   Consultorias **não compartilham dados** por serem usuárias da mesma plataforma. Isolamento é regra do banco, não convenção (§1.2, ADR-0003).
*   Administração da plataforma (operadora) é separada da gestão operacional de cada consultoria e **não dá acesso a documentos nem mensagens** (§1.2, §10.5).
*   Papéis **Gestão** e **Equipe** no vínculo. Gestão administra equipe, instrumentos, atribuições, mudanças oficiais e confirmação final; Equipe executa etapas, envia evidência, comenta e encaminha (§3.5).
*   **Conferente** é designação por ocorrência. Com a política de **conferência independente** ativa, quem produziu a evidência não pode conferi-la (§3.5, §5.5).
*   Financeiro, exportação integral e outras capacidades sensíveis são **concessões** explícitas no vínculo, não item de menu escondido (§3.5).
*   Desligar um membro impede novas ações e **preserva a autoria histórica**; mudança de responsável não reescreve autoria de evidência anterior (§4.5).
*   **Bloquear tela** não é logout nem troca de pessoa: esconde conteúdo, exige senha, preserva contexto (§1.4, §6.6).
### Empreendimento e unidade
*   Empreendimento exige **só o nome**; cliente contratante, CNPJ e contatos são opcionais. Duplicidade é sinalizada, não proibida (§2.4).
*   Unidade é endereço/filial do empreendimento; instrumento, alvará e processo pertencem a uma **unidade** (§3.3).
*   Pedir apenas o dado necessário à ação atual; o resto fica recolhido. Zeros, datas de hoje ou nomes de exemplo **nunca** substituem dado ausente (§1.2, §2.4).
### Instrumento e marcos
*   Tipos de instrumento são **dados**, não catálogo fixo: LAO, LAP, LAI, AuA, alvará e tipos próprios da consultoria. Filtros usam os tipos realmente cadastrados (§1.4, §4.2).
*   Emissão, assinatura, publicação, recebimento e vencimento são **marcos distintos**; o texto do instrumento e a revisão humana determinam qual vale. O **texto original** da data é preservado junto do valor normalizado (§4.2).
*   Instrumento em **rascunho** pode ser salvo incompleto, mas **não ativado**. Ativar exige identificação revisada, marco confirmado, validade e condicionantes aplicáveis revisadas (§2.4).
*   Instrumento substituído é ligado ao antecessor; evidências e histórico ficam (§4.7, REN-03).
*   Processo de obtenção **não é** instrumento emitido e **não gera** condicionantes; ao receber a licença, há cadastro/revisão expressa (§4.7).
### Condicionantes
*   Condicionante, agrupador e informação geral são **naturezas distintas**. Cláusula geral (suspensão, cancelamento, "a empresa deve manter…") **não vira entrega periódica** por estar no PDF (§3.3, §4.4).
*   Guardar **código original, título, texto literal e subitens**. Uma entrega indica qual item a gerou; não relacionar itens por proximidade visual (§4.4).
*   **Agrupador** organiza; não duplica trabalho, não reserva horas, acompanha os filhos por ciclo (§4.4).
*   **Condição contínua** representa cumprimento permanente; **não** gera relatório periódico inventado (§4.3, §4.8).
*   Obrigação **na renovação** é específica e pode coexistir com série periódica (`extra_renovacao`) (§4.3).
*   Dependência entre itens pode exigir **prazo mínimo após a execução real** do outro (ex.: laudo 90 dias após limpeza). O exemplo de 90 dias não é regra universal (§4.4).
### Prazos e recorrência
*   Entrega única usa a data confirmada; periódica usa **marco + intervalo**, gerando até o fim da vigência com ciclo identificável (§4.3).
*   Ciclo = **unidade (mês ou dia) + intervalo**, com presets anual, semestral, trimestral, bimestral, mensal, única, na renovação, contínua. 🔁 O protótipo só expunha os presets; a versão final suporta intervalo configurável (§4.2, RF16).
*   Política de **fim de mês e bissexto** é a do `addMonths` do protótipo, portada com os testes — nunca "somar 30 dias" (§4.3, ADR-0007).
*   Datas são civis `YYYY-MM-DD`, exibidas `dd/mm/aaaa`; prazo não muda pelo fuso do aparelho (§4.3, ADR-0009).
*   **Data da tarefa, marco de cálculo, prazo de protocolo e validade não são intercambiáveis** (§1.2). `prazo_oficial_original` nunca é sobrescrito; `meta_interna` é plano; data real de execução é evidência (§3.3, §5.5).
*   **Conclusão atrasada não desloca** o restante da série (§4.3).
*   Alteração de assinatura, validade ou regra exige **prévia de impacto**; concluídas e evidências **não são apagadas** (§4.3, DEM-06).
*   Ausência de prazo no documento **não vira prazo inventado** (RF16).
### Responsáveis
*   Um responsável pode assumir todas as condicionantes **com confirmação**; exceções por item são possíveis (§1.2, §4.5).
*   Responsável da **etapa** pode diferir do responsável da **entrega** (§4.5).
*   "Sem responsável" **não é** segunda situação de atraso; mostra "Atribuir" (§4.5, §9.4).
*   Disponibilidade e substitutos são **informação para decisão**; **não há reatribuição automática** por alguém estar "livre" (§1.2, §4.5, §6.1).
### Execução, evidência e conferência
*   **Upload não conclui.** Evidência vai para conferência; conferente aprova ou devolve; **gestão conclui** (§3.4, §5.5).
*   Aprovar versão de documento **não conclui** processo; comentar **não é** protocolar; reserva concluída **não é** entrega aceita; pagamento **não valida** obrigação ambiental (§3.4).
*   Evidência guarda a **data real de execução**; data de upload não substitui coleta. Evidência fora do ciclo gera aviso (§4.4).
*   Concluir **sem evidência** é exceção com justificativa da gestão, auditada — nunca atalho silencioso (§5.5).
*   Atraso é **derivado da data**, não estado gravado (§3.4).
### Renovação de LAO
*   `limite de protocolo = vencimento − 120 dias corridos`; `início da preparação = limite − antecedência adicional`; antecedência **padrão 30 dias**, inteiro não negativo por instrumento (§4.6).
*   Trocar a antecedência de 30 para 60 **não muda** o limite de protocolo (§4.8).
*   Número de etapas preparatórias se adapta à antecedência: 0 dia só protocolo; 1 dia duas; abaixo de 30 três; a partir de 30 quatro etapas (§4.6).
*   Protocolo guarda **número, data e comprovante** e **não altera** a validade original nem as obrigações vigentes; depois do protocolo, acompanhar o órgão em intervalo configurado (§4.6).
*   Protocolo tempestivo, licença válida e nova licença emitida são **condições diferentes**; nunca prometer prorrogação automática (§4.6).
*   A regra dos 120 dias é **regra de produto para o recorte atual**, não afirmação jurídica universal; a versão final versiona regra por jurisdição e tipo (§4.6, RNF 9). **Não estender automaticamente a alvarás** nem a outros tipos sem fonte.
*   🔁 Textos antigos do protótipo mencionam "150/120"; **não** são especificação (§1.4).
### Alvará
*   Cadastro simples: unidade/endereço, PDF e validade; número, órgão e notas opcionais (§1.2, §4.7).
*   **Não cria** condicionantes, tarefas, eventos nem regra de 120 dias; aparece na visão da equipe como projeção de validade (§4.7, §4.8).
*   Renovado é **novo registro** ligado ao anterior (§4.7).
### Processo e dossiê
*   Layout "tipo SEI" na lógica, não na aparência: lista à esquerda, documento mais recente selecionado, prévia ampla à direita, retorno visível (§5.1, §5.2).
*   Editar título/descrição não altera o arquivo; **substituir** cria versão imutável e preserva a anterior; aprovação identifica a **versão** (§5.3).
*   Comentário ≠ encaminhamento ≠ solicitação ≠ protocolo; nenhum equivale a envio ao órgão ou e-mail (§5.4).
*   Concluir processo guarda a fase anterior para reabrir; **não declara regularidade** e **não encerra obrigações** de instrumento (§5.4).
*   Criar/substituir editável é bloqueado em processo fechado (§5.4).
### IA
*   A IA **sugere estrutura; uma pessoa habilitada aprova** (§1.1). Extração é rascunho; nunca aprova, conclui, protocola ou altera cadastro automaticamente (§8.6).
*   O prompt pede **só o que consta no documento**; campo ausente fica vazio; condicionante vem com texto literal, fonte e prazo. Não inferir periodicidade, marco ou conteúdo técnico inexistente (§8.6).
*   Limites: PDF até 10 MiB, uma chamada por extração, no máximo 300 itens, resposta validada por schema com datas coerentes e tipos permitidos (§8.6).
*   **IA indisponível ou recusada não impede cadastro manual** (§4.8).
*   Acurácia se mede contra **gabarito humano**, nunca por plausibilidade do texto; versão de prompt, modelo e regra são registradas (§8.7).
*   O PDF da licença é o **único** documento enviado à IA (RNF 9).
### Capacidade e jornada (onda 4)
*   Não presumir 8 horas por dia; jornada é cadastrada por pessoa e dia, com almoço; **almoço não é espaço livre** (§6.1, §6.2).
*   `jornada líquida = saída − entrada − intervalo`; `capacidade = líquida − ocupações`; `livres = capacidade − reservas`; **ausência de dado não é zero** e não significa livre (§6.3).
*   Reserva exige jornada, janela sem almoço, sem passado, sem colisão e pessoa responsável pela etapa; soma das reservas abertas ≤ horas restantes (§6.4).
*   Reatribuir ou alterar a demanda **não cancela** reserva silenciosamente (§6.4).
*   Espera externa **não consome jornada** nem aceita apontamento produtivo (§6.5).
*   Previsão é **determinística e explicável**, não probabilidade; nunca é garantia de não atraso e nunca reatribui equipe (§6.8, §6.9).
*   Meta mede demandas concluídas/aprovadas; não mede horas; atraso causado pelo órgão não é avaliação punitiva (§6.7).
### Comercial e financeiro (onda 5)
*   **Obtenção da licença, acompanhamento e outro serviço** são objetos comerciais diferentes; **honorário ≠ taxa do órgão** (§1.2, §7.1).
*   Preços iniciais do catálogo são **exemplo**, não tabela oficial; custo e margem são internos e não saem na proposta (§7.1).
*   Só rascunho é editável; proposta enviada muda por **revisão** preservando a anterior; mudar preço no catálogo **não altera** proposta enviada (§7.1).
*   Centavos por **maior resto**, soma igual ao total, sem parcela negativa (§7.1).
*   Hash de conteúdo do aceite não é assinatura qualificada; minuta exige revisão jurídica (§7.2).
*   Reabrir aprovado com pagamento é bloqueado; excluir orçamento não apaga cobranças nem tarefas (§7.2).
### Resíduos (onda 6)
*   Licença ausente, vencida, inativa ou classe incompatível **bloqueiam** contratação; região e validade próxima **avisam**; conferência é dos dados digitados, não consulta ao órgão (§7.3).
*   Propostas com escopos diferentes **não competem como iguais**; massa não compara com volume sem conversão; menor custo só entre elegíveis e comparáveis (§7.3).
*   Número de MTR único; coleta respeita contratação; CDF é registro interno, não emissão oficial (§7.3).
### Documentos por modelo (onda 7)
*   Modelo original **nunca** é editado; cada criação é cópia nova com snapshot dos dados usados; preencher campo não altera cadastro (§8.2).
*   Substituir editável volta a rascunho; PDF é versão separada; aprovação é explícita (§8.2).
*   Macros, ActiveX, embeds e relações externas são recusados (§8.4).
### Análise de lote (onda 9)
*   **"Não verificado" ≠ "sem restrição"**; falha de base aparece como não verificado (§7.4).
*   Indicador nunca promete viabilidade, licença ou ausência de passivo; revisão profissional é obrigatória (§7.4).
* * *
## 2\. Pendentes ⚠️
Dependem do Eduardo (produto) ou de fonte normativa. Cada pendência resolvida vira linha na seção 1 e, se tiver comportamento, história no backlog.
*   **Fases do processo de obtenção**: quais são e o que permite avançar.
*   **Política de conferência independente**: ligada por padrão ou escolha da consultoria.
*   **Validade do rascunho** de instrumento: expira? É listado como pendência?
*   **Intervalo de acompanhamento** do órgão após protocolo: valor padrão.
*   **Regra de renovação para LAP, LAI, AuA** e tipos próprios: fonte e prazo, ou "sem plano automático".
*   **Cota mensal de extrações** por consultoria e orçamento de IA.
*   **Retenção** após término do contrato.
*   **Quem vê a carteira**: Equipe vê tudo (padrão) ou só o próprio — por consultoria.
*   **Validação de CNPJ**: só formato ou consulta externa.
*   **Múltiplas assinaturas no PDF**: qual marco a IA deve propor quando há mais de uma data (hoje: propor todas, humano escolhe).