# Integração com o IMA: MTR, CDF e afins

Estudo para o Eduardo. Fontes acessadas em 14/11/2026. Marquei como **inferência** tudo o que é conclusão minha e não está escrito numa fonte.

---

## 1. Resposta curta

1. **Dá para integrar.** O IMA/SC publica manuais oficiais de uma API, a "Webservices de Integração". API é a porta pela qual um sistema conversa com outro sem passar pela tela. Por ela dá para emitir, consultar e cancelar MTR, receber carga e baixar o PDF do MTR e do CDF.
2. **Como funciona:** cada chamada leva o login e a senha de um usuário do Sistema MTR do cliente. Não existe chave própria para sistemas, não existe token e não existe ambiente de teste.
3. **Depende do IMA:** confirmar que um sistema de terceiro pode usar a API em nome do cliente, se ela responde em HTTPS (conexão criptografada) e se a emissão de CDF por API ainda funciona.
4. **Depende de você:** aceitar ou não que o Grama guarde a senha do MTR de cada cliente. Hoje a regra do projeto proíbe guardar segredo de terceiro. Pelo login por CPF, seria preciso guardar também o CPF de um usuário.
5. **Depende do cliente:** criar um usuário no MTR para a consultoria e assinar uma autorização. DMR e PGRS não têm API documentada e continuam pela tela do IMA.

---

## 2. O que existe hoje

| Sistema                                                   | Documentos                         | Tem API?                                                                                                                                                                                                                                                                                                    | Como autentica                                                                                                                                                                                                                                                                                         | Ambiente de teste                                             | Fonte                                                         |
| --------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------- |
| **Sistema MTR do IMA/SC** (versão 2.43, feito pela CONOB) | MTR, CDF, DMR, DMRSU, PGRS         | **Sim, para MTR e CDF.** Há manuais públicos para salvar MTR em lote, MTR complementar, receber, alterar o recebimento, aceite do gerador, cancelar, consultar a situação, baixar PDF do MTR e do CDF, listas de referência e emitir ou consultar CDF. **Não há API documentada para DMR, DMRSU nem PGRS.** | Em toda chamada vão CPF do usuário, senha, CNPJ/CPF do empreendimento e código da unidade. O modo antigo, sem CPF (senha + CNPJ + unidade), continua aceito. Nos downloads e nas listas de referência, a senha vai **dentro do endereço (URL)**. Alguns exemplos de resposta devolvem a própria senha. | **Não encontrado.** Nem a página oficial nem a busca acharam. | Página "Webservices de Integração" do IMA e manuais em PDF    |
| **MTR Nacional (SINIR/MMA)**                              | MTR, CDF, DMR, Inventário Nacional | **Existe, mas a especificação não é pública.** O Termo de Uso V4 confirma que há um Web Service em JSON aberto a todos os perfis. Nenhuma página oficial traz endereço, campos ou erros.                                                                                                                    | Login e senha, mais autorização do perfil. Há conflito sobre o gov.br: a página do SINIR diz que ele é exclusivo desde 01/08/2026, e a notícia do MMA (27/10/2026) diz que as credenciais próprias continuam valendo. Nenhuma das duas fala da API.                                                    | Não encontrado                                                | Termo de Uso V4, página do MTR no SINIR, notícia do MMA       |
| Outros estados (só como comparação)                       | MTR, CDF                           | Sim                                                                                                                                                                                                                                                                                                         | MG e ES: token que vale 1 hora. RJ (INEA): senha no endereço, como no IMA.                                                                                                                                                                                                                             | **Sim** em MG, RJ e RS                                        | Manuais da SEMAD/MG, do IEMA/ES e do INEA/RJ, página da FEPAM |

**O que a regra de SC diz (Portaria IMA nº 009/2026, em vigor desde 14/01/2026):**

- O MTR é responsabilidade do **gerador** (art. 2º, XIV). Transporte com origem e destino em SC usa **só** o sistema do IMA (art. 6º, I). O SINIR entra apenas em alguns casos de transporte interestadual (art. 6º).
- O **CDF** só pode ser emitido pelo **destinador** que fez a destinação. A emissão é vedada a transportador, armazenador temporário e **gerenciador de resíduos** (art. 10).
- A **DMR** passa a ser **trimestral** a partir de julho/2026 e é entregue dentro do mês seguinte ao trimestre. A DMR do 1º semestre de 2026 vai no 3º trimestre de 2026 (art. 7º). Prefeituras e aterros de RSU entregam também a **DMRSU mensal** (art. 8º).
- O **PGRS** dos geradores sujeitos a licenciamento estadual é feito no Sistema MTR do IMA (art. 13).
- O sistema não cobra taxa (art. 9º).
- A portaria **não fala** de API, consultor, procurador nem prazo para emitir o CDF.

**Problemas nos manuais do IMA (fato):**

- Os endereços misturam `http` e `https` e três domínios: mtr.ima.sc.gov.br, mtr.fatma.sc.gov.br e ima.sc.gov.br/mtrservice.
- O manual novo chamado "emiteCdf" descreve na verdade uma **consulta** e foi copiado do sistema gaúcho (cita "MTR FEPAM"). O manual antigo, de 2021, descreve a **emissão** de CDF no mesmo endereço. Os dois se contradizem.
- Um exemplo do manual de geração em lote aponta para o endereço errado.
- A página institucional www.ima.sc.gov.br/mtr/ está desatualizada: ainda fala em DMR semestral e cita portarias revogadas.

**Mercado:** a meuResíduo anunciou em 2021 que integra o MTR do IMA, inclusive com emissão de CDF. Foconet, Urupê, EConti e Resitrack dizem integrar com o "IMA", sem explicar como. Nenhum fornecedor conta como guarda a senha do cliente.

---

## 3. Caminhos possíveis

### (a) Integração oficial pela API do IMA

**O que permite (pelos manuais):**

- **Emitir MTR em lote** pelo gerador. Os campos obrigatórios são gerador, transportador, destinador, data, responsável e itens (resíduo com código IBAMA, quantidade, classe, acondicionamento, tecnologia, estado físico e unidade). Se a unidade for m³, é preciso informar a densidade.
- **Evitar MTR duplicado.** O campo `seuCodigoReferencia` leva o código interno do Grama e volta junto com o número do MTR criado. Assim, se a mesma chamada for repetida por erro, dá para reconhecer o MTR que já existe.
- **Consultar a situação do MTR:** 1 Salvo, 3 Recebido, 4 Cancelado, 9 Em Armazenamento Temporário.
- **Cancelar MTR.** Só o gerador cancela, e na prática a justificativa é exigida.
- **Receber o MTR** quando o cliente é destinador.
- **Baixar o PDF do CDF** e ler as listas oficiais de resíduo, classe, unidade e outras.
- **Emitir CDF**, só se o cliente for **destinador**, só com a credencial dele e só se o IMA confirmar que esse serviço ainda funciona.

**Riscos:**

- **Não há ambiente de teste.** Todo teste acontece em produção, com MTR de verdade e efeito legal.
- **A senha trafega de forma frágil.** Ela vai no endereço das chamadas de download e de listas, e às vezes volta na resposta. Se o IMA só responder em `http`, a senha passa sem criptografia. Nesse caso, eu não seguiria.
- **Os manuais têm erros e contradições**, e o código de erro 999 ("erro não catalogado") é genérico.
- **Inferência:** o IMA pode desligar o login por CNPJ, já que chama o login por CPF de opção mais segura. A página não dá data para isso.
- **Não há termo de uso da API, cadastro de integrador, limite de chamadas nem garantia de disponibilidade.**
- **Inferência:** o Grama não pode emitir CDF como consultoria. Pela portaria, só o destinador emite.

**Esforço:** **médio a alto.** Exige guarda segura de senha, uma Edge Function (código que roda no servidor da Supabase, longe do navegador), tradução das listas oficiais, tratamento dos códigos de erro e testes cuidadosos em produção. Isso é estimativa minha, não vem de fonte.

### (b) O que dá para fazer SEM integração

Nada disso precisa de senha do cliente nem de aval do IMA.

- **Lembretes no calendário:** DMR trimestral (mês seguinte ao trimestre), DMRSU mensal para prefeituras e aterros, Inventário Nacional (até 31/03) e RAPP do IBAMA (01/02 a 31/03). Isso se encaixa no que o Grama já faz: transformar obrigação em prazo da equipe.
- **Registro de MTR e CDF por cliente:** a equipe digita ou anexa o PDF de cada MTR emitido no IMA e de cada CDF recebido.
- **Conferência CDF x MTR:** apontar MTR sem CDF e CDF com quantidade diferente do MTR. Um artigo comercial (Seven Resíduos) cita essas dores: CDF que some na auditoria e CDF com quantidade diferente do MTR.
- **Painel de resíduos por cliente:** quantidade por resíduo, destinador e período. Serve de base para preparar a DMR, que continua sendo entregue na tela do IMA.
- **Importar PDF ou planilha:** ler o PDF do MTR ou do CDF para preencher os campos. A leitura automática por IA está no épico 9, que só entra se sobrar tempo.
- **Uso secundário:** o painel público do IMA (lançado em 12/11/2026) tem dados desde 2020, com cerca de 120 dias de atraso e download em janelas de até 6 meses. Serve para comparação e mercado, não para a rotina.

**Riscos:** baixos. O trabalho manual continua: alguém emite no IMA e registra no Grama.
**Esforço:** **baixo a médio.** É o mesmo tipo de coisa que o Grama já faz com condicionantes.

### (c) Automação de navegador (robô que clica na tela do IMA)

- **Não recomendo.** Primeiro, porque **existe API oficial**, então não há motivo para imitar um usuário na tela. Segundo, porque **não li o Termo de Uso do Sistema MTR-SC**: o PDF não foi legível, e não sei se ele permite robô.
- **Riscos:** quebra a cada mudança de tela, pode ser bloqueado e pode violar os termos de uso. Também guarda a mesma senha, então não resolve o problema da credencial.
- Nenhum fornecedor declarou usar esse método, e não encontrei posição oficial sobre ele.

---

## 4. Credenciais: como ficaria a guarda e o que vai no contrato

**O conflito com as regras atuais do Grama (fato):**

- A regra do projeto diz que segredo nunca fica no front, no repositório nem em log. A API do IMA não tem chave de sistema: o único jeito de chamá-la é com a **senha de um usuário do cliente**.
- No login por CPF, o Grama também guardaria o **CPF** desse usuário, e a regra do projeto proíbe CPF no banco. O login antigo por CNPJ dispensa o CPF, mas pode ser desligado no futuro (inferência).

**Como eu desenharia, se você aprovar (inferência, não validada com o IMA):**

1. **Um usuário próprio para o Grama em cada cliente.** O administrador do cliente cria no MTR um usuário "Normal" para a consultoria. Nunca a senha do administrador. Para revogar, o cliente apaga esse usuário.
2. **Senha num cofre.** Usar o Supabase Vault, onde a senha fica criptografada no banco. Só a Edge Function a lê. A tela recebe a senha uma vez, no cadastro, e depois nunca mais a mostra.
3. **Chamadas só pela Edge Function.** O navegador nunca fala com o IMA.
4. **Nada de log.** Nunca registrar o endereço das chamadas nem o corpo de pedidos e respostas, porque a senha aparece nos dois.
5. **Só HTTPS.** Se o IMA não responder em HTTPS, a integração para aí.
6. **Auditoria.** Registrar quem pediu cada emissão ou cancelamento (`membro_id`), quando e qual o número do MTR, sem a senha.
7. **Aviso de falha de login** (erro 900), para o cliente trocar a senha sem o Grama ficar insistindo.

**O que deveria constar no contrato ou acordo de dados com o cliente** (sugestão minha, **validar com advogado**):

- A **autorização expressa** do cliente para que a consultoria, pelo Grama, acesse o Sistema MTR do IMA com um usuário dedicado.
- O **escopo**: só consultar, ou também emitir e cancelar MTR.
- Que a **responsabilidade legal continua do gerador.** A portaria põe o MTR na conta do gerador, e a Lei 12.305 (art. 27, §1º) diz que contratar terceiros não tira do gerador a responsabilidade por danos.
- **Como revogar**: o cliente apaga o usuário ou troca a senha, e o Grama apaga a credencial.
- **Tratamento de dados pessoais**: CPF do usuário (se for o login por CPF), finalidade, guarda e exclusão.
- Que o **CDF não é emitido pela consultoria.**
- **Não encontrei** regra do IMA sobre procuração ou sobre consultoria operando em nome do cliente. Isso também vai para a pergunta ao IMA.

---

## 5. Recomendação e plano em fases

**Recomendação:** começar pelo que não depende de senha (fase 1) e, em paralelo, perguntar ao IMA. Integrar só depois da resposta, e só para leitura no começo.

| Fase                                                   | O que entra                                                                                                                                                                                                                                                                                             | Depende de                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **0. Perguntar ao IMA**                                | E-mail para mtr@ima.sc.gov.br: (1) um sistema de terceiro pode usar a API em nome do cliente? (2) há ambiente de teste? (3) qual é o endereço oficial e ele responde em HTTPS? (4) o `/emiteCDF` emite ou consulta? (5) o login por CNPJ vai acabar? (6) há termo de uso da API ou regra de procuração? | Você enviar o e-mail                                                                 |
| **1. Protótipo sem integração** (primeiro a construir) | Calendário de DMR, DMRSU, Inventário e RAPP; cadastro de MTR e CDF por cliente com anexo do PDF; conferência CDF x MTR (falta CDF, quantidade diferente); painel de resíduos por cliente                                                                                                                | Só decisão de produto                                                                |
| **2. Integração só de leitura**                        | Consultar a situação dos MTRs, baixar o PDF do CDF e usar as listas oficiais de resíduo e classe. Começar com **um** cliente-piloto                                                                                                                                                                     | Resposta do IMA, sua decisão sobre senha e CPF, contrato assinado, HTTPS funcionando |
| **3. Emissão de MTR pelo Grama**                       | Emitir em lote com `seuCodigoReferencia` contra duplicidade, e cancelar                                                                                                                                                                                                                                 | Fase 2 estável e um cliente que aceite testar em produção                            |
| **4. Só se houver destinador cliente**                 | Receber MTR e emitir CDF com a credencial do destinador                                                                                                                                                                                                                                                 | O IMA confirmar a emissão de CDF por API                                             |

Pelas regras do projeto (inferência), a escrita multi-tabela da fase 1 vai em RPC, e as fases 2 a 4 vão em Edge Function com cofre. Fica fora: DMR, DMRSU e PGRS por API, porque não há manual para eles.

---

## 6. Perguntas para você decidir

1. Você aceita abrir uma exceção para o Grama guardar a **senha do MTR de cada cliente**, num cofre e só na Edge Function?
2. Se sim, qual login usar: o **por CNPJ** (sem CPF, mas pode acabar) ou o **por CPF** (exige outra exceção à regra de CPF)?
3. Você mesmo manda o e-mail ao IMA com as perguntas da fase 0?
4. Podemos começar pela **fase 1** (lembretes, registro, conferência CDF x MTR, painel) antes de qualquer integração?
5. Algum cliente da Filtroville é **destinador**, ou são todos geradores? Isso decide se a emissão de CDF entra no plano.
6. Qual cliente da Filtroville toparia ser o piloto da integração, sabendo que não há ambiente de teste?

---

## 7. Fontes (acesso em 14/11/2026)

**IMA/SC**

- Página "Webservices de Integração": https://www.ima.sc.gov.br/webservices-de-integracao/
- Manual Salvar Manifesto Lote: https://www.ima.sc.gov.br/wp-content/uploads/2026/07/SalvaManifestoLote.pdf
- Manual Gera Manifesto Lote (códigos de retorno e seuCodigoReferencia): https://www.ima.sc.gov.br/wp-content/uploads/2026/07/GeraManifestoManifestoLote.pdf
- Manual Recebimento de Manifesto: https://www.ima.sc.gov.br/wp-content/uploads/2026/07/RecebimentoManifesto.pdf
- Manual Consulta de Manifesto: https://www.ima.sc.gov.br/wp-content/uploads/2026/07/ConsultaManifesto.pdf
- Manual Cancela Manifesto: https://www.ima.sc.gov.br/wp-content/uploads/2026/07/CancelaManifesto.pdf
- Manual "emiteCdf" (na verdade, consulta): https://www.ima.sc.gov.br/wp-content/uploads/2026/07/emiteCdf.pdf
- Manual Emissão do CDF (2021, login por CNPJ): https://www.ima.sc.gov.br/wp-content/uploads/2026/07/emiteCdf-1.pdf
- Manual buscaPdfCdf: https://www.ima.sc.gov.br/wp-content/uploads/2026/07/buscaPdfCdf.pdf
- Manual APIs de referência: https://www.ima.sc.gov.br/wp-content/uploads/2026/07/Manual-WEB-Service-APIs-de-referencia.pdf
- Portaria IMA 009/2026 (PDF oficial): https://mtr.ima.sc.gov.br/documentos/Portaria_IMA_009_2026_MTR.pdf
- Portaria IMA 009/2026 (LegisWeb): https://www.legisweb.com.br/legislacao/?id=489465
- Portal do Sistema MTR-SC: https://mtr.ima.sc.gov.br/
- Orientação de cadastro: https://mtr.ima.sc.gov.br/documentos/ajudaCadastro.pdf
- Página institucional do MTR (desatualizada): https://www.ima.sc.gov.br/mtr/
- Acordo de Cooperação IMA/CPRH 01/2025: https://www.ima.sc.gov.br/wp-content/uploads/2026/07/ACORDO-DE-COOPERACAO-TECNICA-IMA-01.2025-1.pdf
- Painel público do MTR (notícia): https://floripamanha.org/2026/11/ima-disponibiliza-painel-interativo-com-informacoes-sobre-transporte-e-destinacao-de-residuos-em-santa-catarina/

**Nacional**

- Termo de Uso V4 do MTR Nacional: https://portal-api.sinir.gov.br/wp-content/uploads/2025/07/mtr-termo-de-uso-e-politica-de-privacidade-V4_24.05.2024.pdf
- Página do MTR no SINIR: https://sinir.gov.br/sistemas/mtr/
- Notícia do MMA sobre o login gov.br: https://www.gov.br/mma/pt-br/noticias/mtr-nacional-passa-a-contar-com-login-unico-gov-br-para-acesso-ao-sistema
- Portaria MMA 280/2020 (LegisWeb): https://www.legisweb.com.br/legislacao/?id=397699
- Lei 12.305/2010: https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2010/lei/l12305.htm
- Inventário Nacional de Resíduos Sólidos: https://www.gov.br/pt-br/servicos/declarar-informacoes-sobre-o-inventario-nacional-de-residuos-solidos
- Prazo do RAPP (IBAMA): https://www.gov.br/ibama/pt-br/assuntos/notas/2026/prazo-de-entrega-do-rapp-inicia-em-1o-de-fevereiro-e-encerra-em-31-de-marco

**Outros estados (comparação)**

- Manual de webservice do MTR-MG: https://semad.mg.gov.br/documents/d/semad/manual-webservice-sistema-mtr_14022025-pdf
- GetToken do MTR-ES: https://iema.es.gov.br/Media/iema/MTR-ES/GetToken.pdf
- Manual de webservice do INEA/RJ: https://www.inea.rj.gov.br/wp-content/uploads/2026/03/Manual-webservice-INEA-vers%C3%A3o-atualizada_Vfinal-1.pdf
- Manuais de integração da FEPAM/RS: https://fepam.rs.gov.br/manuais-de-integracao-para-o-desenvolvimento-de-webservices

**Mercado**

- meuResíduo integra o MTR do IMA (2021): https://meuresiduo.com/geral/meuresiduo-integra-o-sistema-de-mtr-da-ima-em-sua-plataforma
- Urupê: https://urupe.eco.br/
- Foconet: https://residuos.foconet.com.br/
- EConti: https://www.econtisolucoes.com.br/software-gest%C3%A3o-de-res%C3%ADduos
- Resitrack: https://resitrack.com.br/
- Seven Resíduos (dores com CDF): https://sevenresiduos.com.br/terceirizar-gestao-de-residuos-industriais-cdf-auditoria/

**Pontos que ficaram sem verificação:** o Termo de Uso do Sistema MTR-SC (PDF ilegível), o Manual do Usuário v5.01, se a API está ativa e responde em HTTPS (nenhum endereço foi chamado, de propósito) e os manuais de MTR complementar, alteração e aceite de recebimento e PDF do MTR, que não foram lidos.
