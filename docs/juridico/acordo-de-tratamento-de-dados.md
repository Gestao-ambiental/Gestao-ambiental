Minuta para revisão jurídica — não usar sem revisão de advogado.

# Acordo de Tratamento de Dados Pessoais (DPA) do Grama

Versão: minuta de 14/11/2026

## Resumo em linguagem simples

- Quando a consultoria cadastra no Grama dados de clientes, de pessoas citadas em licenças e documentos ou da própria equipe, **a consultoria decide o que fazer com esses dados (controladora)** e **o Grama apenas executa o serviço por ela (operador)**, como prevê a LGPD.
- O Grama só usa esses dados para fazer o sistema funcionar, conforme as instruções da consultoria. Não vende, não compartilha para outros fins e não usa para treinar IA.
- Os dados ficam no Supabase, em São Paulo. Alguns fornecedores (e-mail, hospedagem do site, IA) podem tratar dados fora do Brasil, com as garantias da LGPD.
- **A equipe do Grama não tem senha mestra.** Só acessa dados da consultoria com autorização da Gestão (até 48 horas) ou em emergência (até 2 horas), em modo leitura, com tudo registrado e visível para a consultoria.
- Em caso de incidente de segurança, o Grama avisa a consultoria em até 48 horas e ajuda a avisar a ANPD e as pessoas afetadas, quando necessário.
- Se alguém pedir acesso, correção ou exclusão dos próprios dados, o Grama ajuda a consultoria a responder.
- Ao fim do contrato, a consultoria pode exportar tudo antes da exclusão.

---

## 1. Partes e objeto

1.1. Este Acordo é celebrado entre:

a) a consultoria que contrata o Grama ("Consultoria" ou "Controladora"); e
b) [RAZÃO SOCIAL], CNPJ [CNPJ], com sede em [ENDEREÇO] ("Grama" ou "Operador").

1.2. Este Acordo regula o tratamento de dados pessoais feito pelo Grama em nome da Consultoria, na prestação do serviço descrito nos Termos de Uso, conforme a Lei 13.709/2018 (LGPD).

1.3. Este Acordo faz parte dos Termos de Uso. Em caso de conflito sobre proteção de dados pessoais, prevalece este Acordo.

## 2. Definições

Os termos usados aqui têm o sentido da LGPD (art. 5º), em especial: dado pessoal, dado pessoal sensível, titular, tratamento, controlador, operador, encarregado, incidente de segurança e ANPD. Também se aplicam as definições dos Termos de Uso (Gestão, Equipe, Pessoa Usuária, Operador do Grama, Conteúdo da Consultoria).

**Suboperador:** fornecedor contratado pelo Grama que trata dados pessoais da Consultoria para viabilizar o serviço.

## 3. Papéis de cada parte

3.1. **A Consultoria é a controladora** dos dados pessoais que ela e suas Pessoas Usuárias inserem no Grama, incluindo dados dos clientes dela, de representantes, responsáveis técnicos e outras pessoas citadas em licenças, documentos, orçamentos e propostas.

3.2. **O Grama é o operador** desses dados e só os trata conforme este Acordo e as instruções da Consultoria.

3.3. **O Grama é controlador** apenas dos dados que trata para fins próprios: manter a conta, autenticar acessos, cobrar, emitir nota fiscal, dar suporte, garantir a segurança, operar a central administrativa (seção 9) e cumprir obrigações legais.

3.4. Cabe à Consultoria, como controladora:

a) ter base legal para tratar os dados que insere no Grama;
b) informar os titulares sobre o tratamento, quando exigido;
c) inserir apenas os dados necessários ao seu trabalho, evitando dados sensíveis que não sejam indispensáveis;
d) responder aos pedidos dos titulares, com apoio do Grama (seção 12);
e) comunicar a ANPD e os titulares sobre incidentes, quando exigido, com apoio do Grama (seção 11).

## 4. Dados tratados e finalidade

4.1. As categorias de titulares e de dados estão no **Anexo I**.

4.2. **Finalidade única:** prestar o serviço do Grama à Consultoria — guardar, organizar e exibir os dados; calcular prazos; enviar avisos e e-mails do sistema; gerar orçamentos e propostas; fazer a leitura por IA quando a Consultoria pedir; dar suporte; e manter a segurança.

4.3. O Grama **não** vende dados, **não** usa os dados da Consultoria para publicidade, **não** os compartilha com terceiros fora do que este Acordo prevê e **não** os usa para treinar modelos de IA.

4.4. O Grama não pede CPF das Pessoas Usuárias. Na contratação de um plano, quem paga e não tem CNPJ informa o próprio CPF, que segue direto para o processador de pagamentos (Asaas) e não é guardado pelo Grama.

## 5. Instruções da Consultoria

5.1. Os Termos de Uso, este Acordo e as configurações feitas pela Gestão no sistema são as instruções da Consultoria ao Grama.

5.2. Instruções adicionais devem ser dadas por escrito pela Gestão. Se uma instrução exigir esforço fora do serviço contratado, o Grama pode condicioná-la a acordo comercial.

5.3. O Grama avisará a Consultoria se entender que uma instrução viola a LGPD ou outra lei, e poderá deixar de cumpri-la até que seja esclarecida.

## 6. Obrigações do Grama

O Grama se compromete a:

a) tratar os dados apenas para as finalidades da seção 4;
b) manter as medidas de segurança do **Anexo II**;
c) garantir que todas as pessoas autorizadas a tratar os dados tenham dever de sigilo;
d) limitar o acesso interno ao mínimo necessário (seções 8 e 9);
e) contratar suboperadores apenas nas condições da seção 10;
f) avisar incidentes conforme a seção 11;
g) apoiar a Consultoria nos pedidos dos titulares (seção 12) e nas suas obrigações perante a ANPD;
h) manter registro das operações de tratamento que realiza (art. 37 da LGPD);
i) devolver ou excluir os dados ao fim do contrato, conforme a seção 14.

## 7. Segurança e isolamento entre consultorias

7.1. O Grama mantém medidas técnicas e administrativas para proteger os dados contra acesso não autorizado, perda, alteração e vazamento. As principais estão no **Anexo II**.

7.2. Os dados de cada Consultoria ficam isolados no banco de dados: uma Pessoa Usuária só vê dados das consultorias das quais é membro ativo, e esse controle é feito no próprio banco, não apenas na tela.

7.3. O Grama pode atualizar as medidas de segurança, desde que não reduza o nível de proteção.

## 8. Acesso de suporte aos dados da Consultoria

> **Cláusula destacada.**
>
> 8.1. **Não existe senha mestra.** Nenhuma pessoa do Grama tem acesso livre aos dados da Consultoria.
>
> 8.2. **Quem pode acessar:** apenas Operadores do Grama nomeados, com verificação em duas etapas ativa. A lista de pessoas nomeadas é mantida pelo Grama e informada à Consultoria quando ela pedir.
>
> 8.3. **Quando pode acessar:**
>
> a) **Com autorização da Gestão**, por até **48 horas** a cada autorização. A Gestão pode encerrar o acesso a qualquer momento.
>
> b) **Em emergência**, sem autorização prévia, por até **2 horas**, apenas em caso de incidente de segurança, falha grave que impeça o uso do Grama, ou ordem legal ou judicial. O motivo é registrado e **a Gestão é avisada imediatamente**.
>
> 8.4. **Somente leitura por padrão.** Qualquer alteração de dados exige permissão expressa da Gestão para aquela alteração.
>
> 8.5. **Tudo registrado e visível.** Cada acesso de suporte gera registro com quem acessou, quando, de que modo (autorizado ou emergência), por qual motivo, por quanto tempo, cada entrada do Operador e quem encerrou. Como o acesso é somente leitura, o suporte não altera nenhum dado. A Gestão da Consultoria vê esses registros no sistema.
>
> 8.6. **Sigilo:** os Operadores do Grama mantêm sigilo sobre tudo o que virem.
>
> 8.7. **Finalidade limitada** a suporte, segurança e cumprimento de obrigação legal.

## 9. Central administrativa

9.1. Para operação, cobrança, suporte e segurança, os Operadores do Grama veem dados cadastrais e de uso da Consultoria: nome da Consultoria; nome e e-mail das Pessoas Usuárias e seus papéis; quantidade de empreendimentos, licenças e orçamentos; atividade de uso; e situação de pagamento.

9.2. Nesses dados, o Grama atua como controlador (seção 3.3).

9.3. **Fora do acesso de suporte da seção 8, os Operadores do Grama não acessam documentos, licenças, orçamentos nem o conteúdo deles.**

9.4. **Registro de uso:** o Grama registra, por Pessoa Usuária, os dias e as áreas do sistema usadas (licenças e prazos, orçamentos, propostas, equipe e conta), com o horário do primeiro e do último uso em cada dia. Esse registro serve para suporte e melhoria do serviço, é visto só pelos Operadores do Grama (nem a Gestão da Consultoria o vê) e não inclui o conteúdo do que foi feito. O Grama também mede, por tarefa (cadastro de licença com IA, cadastro de condicionante à mão, acompanhamento de licenças e prazos e orçamento), o tempo ativo em que a tela fica aberta com uso, e guarda as respostas da Gestão às perguntas sobre a rotina antes do Grama (licenças acompanhadas, horas por semana conferindo prazos, minutos por condicionante e prazos que pegaram a equipe de surpresa). Com isso o Grama estima as horas devolvidas à equipe: a Gestão vê só o total da Consultoria, os Operadores veem totais por Consultoria e ninguém vê o tempo de uma pessoa.

## 10. Suboperadores

10.1. A Consultoria autoriza o Grama a usar os suboperadores do **Anexo III**.

10.2. O Grama exige de cada suboperador obrigações de proteção de dados compatíveis com este Acordo e responde perante a Consultoria pelos atos deles, nos limites da LGPD.

10.3. Para incluir ou trocar suboperador, o Grama avisa a Gestão com pelo menos [PRAZO] de antecedência. A Consultoria pode se opor por motivo razoável ligado à proteção de dados. Se as partes não chegarem a acordo, a Consultoria pode cancelar sem multa antes da mudança.

10.4. Em situação urgente de segurança ou continuidade, o Grama pode trocar um suboperador sem o aviso prévio, avisando a Gestão logo em seguida.

## 11. Incidentes de segurança

11.1. O Grama avisará a Consultoria **em até 48 horas** depois de tomar conhecimento de incidente de segurança que envolva dados pessoais da Consultoria.

11.2. O aviso inicial trará o que já se souber; o restante será complementado assim que possível:

a) o que aconteceu e quando;
b) quais dados e quais titulares podem ter sido afetados (categorias e quantidade estimada);
c) riscos prováveis;
d) medidas tomadas e a tomar para conter e reduzir os efeitos;
e) contato no Grama para acompanhar o caso.

11.3. O Grama apoiará a Consultoria a comunicar a ANPD e os titulares, quando exigido, fornecendo as informações técnicas de que dispuser.

11.4. O Grama manterá registro dos incidentes e das medidas adotadas.

11.5. Quem decide e faz a comunicação à ANPD e aos titulares sobre dados que a Consultoria controla é a Consultoria. O Grama só comunica diretamente se a lei o exigir ou se a Consultoria pedir por escrito.

## 12. Direitos dos titulares

12.1. A Consultoria, como controladora, responde aos pedidos dos titulares (art. 18 da LGPD): confirmação, acesso, correção, anonimização, bloqueio, eliminação, portabilidade, informação sobre compartilhamento e revisão de decisões automatizadas, entre outros.

12.2. O Grama apoia a Consultoria com as funções do sistema (consultar, corrigir, exportar e excluir dados) e, quando necessário, com ajuda técnica adicional.

12.3. Se o Grama receber diretamente um pedido de titular sobre dados que a Consultoria controla, ele encaminhará o pedido à Gestão em até [PRAZO] e não responderá ao titular sem instrução da Consultoria, salvo para informar que o pedido foi encaminhado.

## 13. Prestação de contas e auditoria

13.1. O Grama fornecerá, mediante pedido da Gestão, as informações razoavelmente necessárias para demonstrar o cumprimento deste Acordo (por exemplo, descrição das medidas de segurança, lista de suboperadores e registros de acesso de suporte).

13.2. Auditorias ou inspeções adicionais serão combinadas por escrito, com aviso prévio de [PRAZO], em horário comercial, sem expor dados de outras consultorias nem comprometer a segurança do sistema. Os custos são de [QUEM ARCA COM OS CUSTOS DE AUDITORIA].

## 14. Fim do contrato: exportação, retenção e exclusão

14.1. **Antes de qualquer exclusão, a Consultoria pode exportar seus dados e documentos** em formato legível e reutilizável [CONFIRMAR formatos].

14.2. Após o fim do contrato, os dados ficam guardados por [PRAZO DE RETENÇÃO], para permitir exportação e eventual retorno. O Grama avisa a Gestão antes da exclusão definitiva.

14.3. Encerrado esse prazo, o Grama exclui os dados da Consultoria, inclusive dos suboperadores, e das cópias de segurança em até [PRAZO DE REMOÇÃO DOS BACKUPS].

14.4. O Grama pode manter apenas o que a lei exigir (por exemplo, registros de cobrança e fiscais, registros de acesso exigidos pelo Marco Civil da Internet) ou o necessário para exercício de direitos, pelo prazo legal, com acesso restrito.

## 15. Responsabilidade

15.1. Cada parte responde pelos danos que causar por descumprir a LGPD ou este Acordo, nos termos dos arts. 42 a 45 da LGPD.

15.2. O Grama responde como operador apenas quando descumprir a LGPD ou as instruções lícitas da Consultoria.

15.3. Os limites de responsabilidade dos Termos de Uso se aplicam a este Acordo no que a lei permitir.

## 16. Encarregado (DPO)

16.1. Encarregado pelo tratamento de dados pessoais do Grama: [NOME DO ENCARREGADO], contato [E-MAIL DO ENCARREGADO].

16.2. A Consultoria deve indicar à Gestão do Grama o contato do seu próprio encarregado, quando tiver um.

## 17. Vigência

17.1. Este Acordo vale enquanto o Grama tratar dados pessoais em nome da Consultoria, inclusive durante o período de retenção posterior ao fim do contrato.

17.2. As obrigações de sigilo e de exclusão continuam valendo após o fim do contrato.

## 18. Lei aplicável e foro

Este Acordo segue as leis do Brasil. Fica eleito o foro de [FORO].

---

## Anexo I — Titulares e categorias de dados

| Titulares                                                                                                                                        | Dados                                                                                                                                                                       | Origem                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Pessoas Usuárias da Consultoria (Gestão e Equipe)                                                                                                | Nome, e-mail, papel, dados profissionais informados no cadastro (profissão, cargo, formação), gênero quando informado, registros de atividade e de acesso [CONFIRMAR lista] | Cadastro e uso do sistema            |
| Clientes da Consultoria e seus representantes                                                                                                    | Nome, e-mail, telefone, cargo, empresa [CONFIRMAR lista]                                                                                                                    | Inseridos pela Consultoria           |
| Pessoas citadas em licenças e documentos (responsáveis técnicos, representantes legais, servidores de órgãos ambientais, proprietários de áreas) | Nome, registro profissional, assinatura, endereço e outros dados presentes nos documentos enviados                                                                          | Documentos enviados pela Consultoria |
| Destinatários de orçamentos e propostas                                                                                                          | Nome, e-mail, empresa                                                                                                                                                       | Inseridos pela Consultoria           |

**Dados sensíveis:** o Grama não foi feito para tratar dados sensíveis. Se algum documento enviado contiver dados sensíveis, eles serão tratados apenas como parte do documento, com as mesmas medidas de segurança.

**CPF:** o Grama não guarda CPF em campos próprios. O CPF de quem paga o plano (quando não há CNPJ) só passa pelo Grama a caminho do processador de pagamentos. Pode haver CPF dentro de documentos enviados pela Consultoria.

## Anexo II — Medidas de segurança

1. **Isolamento entre consultorias no banco de dados:** regras de acesso por linha (RLS) habilitadas e forçadas em todas as tabelas de dados; acesso permitido só a membros ativos da consultoria.
2. **Vínculos protegidos:** registros de uma consultoria não podem ser ligados a registros de outra, mesmo que o identificador seja conhecido.
3. **Papéis:** o papel de cada pessoa (Gestão ou Equipe) é controlado no banco de dados, não no aparelho.
4. **Autenticação:** e-mail e senha; verificação em duas etapas obrigatória para Operadores do Grama.
5. **Criptografia em trânsito:** toda comunicação por HTTPS/TLS.
6. **Criptografia em repouso:** conforme oferecida pelo Supabase [CONFIRMAR].
7. **Arquivos:** guardados em área privada; não são substituídos, cada nova versão vira um novo arquivo, com registro de nome original, tipo, tamanho, código de integridade (SHA-256), autor e data e hora. A exclusão de arquivos pelo usuário é lógica até o fim do prazo de retenção.
8. **Auditoria:** registro de alterações nas entidades críticas (licenças, condicionantes, ocorrências, conferências, renovações e vínculos de pessoas), sem possibilidade de edição do registro.
9. **Convites:** o link de convite não fica guardado em texto; o sistema guarda apenas uma versão cifrada (hash).
10. **Chaves e segredos:** nunca no navegador, no código-fonte ou em logs; chaves de acesso total ao banco usadas apenas em funções do servidor, migrações e integração contínua.
11. **Acesso de suporte:** conforme a seção 8.
12. **Ambientes separados:** testes (staging) e produção em projetos distintos.
13. **Cópias de segurança:** conforme oferecidas pelo Supabase [CONFIRMAR frequência e retenção].

## Anexo III — Suboperadores

| Suboperador        | Função                                                                           | Dados tratados                                                                            | Local do tratamento             | Transferência internacional                                        |
| ------------------ | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| Supabase           | Banco de dados, arquivos, autenticação e funções do servidor                     | Todos os dados do Grama                                                                   | Brasil (região São Paulo)       | Possível acesso de suporte pela empresa fora do Brasil [CONFIRMAR] |
| Vercel             | Hospedagem do site (front)                                                       | Dados de navegação e registros técnicos de acesso (endereço IP, navegador)                | Rede global [CONFIRMAR regiões] | Sim, possível (por exemplo, Estados Unidos) [CONFIRMAR]            |
| Resend             | Envio de e-mails do sistema                                                      | E-mail e nome do destinatário, conteúdo dos e-mails (avisos de prazo, convites, cobrança) | [CONFIRMAR]                     | Sim, possível (por exemplo, Estados Unidos) [CONFIRMAR]            |
| Asaas              | Cobrança, pagamento e nota fiscal                                                | Dados cadastrais e de cobrança da Consultoria e da pessoa responsável pelo pagamento      | Brasil [CONFIRMAR]              | Não previsto [CONFIRMAR]                                           |
| [FORNECEDOR DE IA] | Leitura de documentos por IA (só nos planos com IA e quando a Consultoria pedir) | Conteúdo dos documentos enviados para leitura                                             | [CONFIRMAR]                     | Sim, possível [CONFIRMAR]; sem uso para treino de modelos          |

**Base para transferência internacional:** quando houver transferência para fora do Brasil, ela se apoiará em um dos mecanismos do art. 33 da LGPD, preferencialmente cláusulas-padrão contratuais aprovadas pela ANPD ou outro mecanismo admitido pela regulamentação vigente [CONFIRMAR mecanismo por fornecedor].

---

## Pontos para o advogado revisar

1. **Divisão controlador/operador (seção 3):** confirmar que o Grama é controlador só nos dados de conta, cobrança, suporte, segurança e central administrativa, e qual a base legal de cada um.
2. **Transferência internacional (Anexo III):** verificar, para cada fornecedor, onde os dados são tratados e qual mecanismo do art. 33 será usado; avaliar a necessidade de cláusulas-padrão da ANPD (Resolução CD/ANPD nº 19/2024) e o prazo de adequação.
3. **Prazo de aviso de incidente (11.1):** confirmar se 48 horas é compatível com o prazo do controlador para comunicar a ANPD (Resolução CD/ANPD nº 15/2024 — verificar o prazo vigente).
4. **Comunicação direta pelo Grama (11.5):** avaliar quando o operador pode ou deve comunicar diretamente.
5. **Acesso emergencial por ordem legal ou judicial (8.3.b):** prever o caso em que a ordem proíbe avisar a Consultoria.
6. **Encarregado (16):** confirmar se o Grama precisa nomear encarregado ou se pode usar a dispensa para agentes de pequeno porte (Resolução CD/ANPD nº 2/2022 e nº 18/2024), mantendo um canal de contato.
7. **Auditoria (13.2):** definir aviso prévio, frequência máxima e quem paga.
8. **Retenção e backups (14):** alinhar prazos com obrigações fiscais, Marco Civil da Internet (registros de acesso) e art. 16 da LGPD.
9. **Dados sensíveis e CPF em documentos (Anexo I):** avaliar se é preciso cláusula específica para documentos que contenham dados sensíveis ou de crianças.
10. **Responsabilidade (15):** checar compatibilidade dos limites dos Termos de Uso com os arts. 42 a 45 da LGPD.
11. **Registro de operações (6.h):** confirmar o formato mínimo exigido do operador.
12. **Contrato com o fornecedor de IA:** garantir por escrito o não uso para treino e a retenção mínima do lado do fornecedor.

## Campos a preencher

| Campo                                                                           | Onde      | Quem define                  |
| ------------------------------------------------------------------------------- | --------- | ---------------------------- |
| [RAZÃO SOCIAL]                                                                  | 1.1       | Sócios                       |
| [CNPJ]                                                                          | 1.1       | Sócios (ainda não definido)  |
| [ENDEREÇO]                                                                      | 1.1       | Sócios                       |
| [NOME DO ENCARREGADO]                                                           | 16.1      | Sócios                       |
| [E-MAIL DO ENCARREGADO]                                                         | 16.1      | Sócios                       |
| [FORO]                                                                          | 18        | Sócios e advogado            |
| [PRAZO] de aviso de novo suboperador                                            | 10.3      | Sócios                       |
| [PRAZO] de encaminhamento de pedido de titular                                  | 12.3      | Sócios                       |
| [PRAZO] de aviso prévio de auditoria                                            | 13.2      | Sócios e advogado            |
| [QUEM ARCA COM OS CUSTOS DE AUDITORIA]                                          | 13.2      | Sócios e advogado            |
| [PRAZO DE RETENÇÃO] após o fim do contrato                                      | 14.2      | Sócios e advogado            |
| [PRAZO DE REMOÇÃO DOS BACKUPS]                                                  | 14.3      | Sócios, com base no Supabase |
| [FORNECEDOR DE IA]                                                              | Anexo III | Sócios                       |
| [CONFIRMAR] formatos de exportação                                              | 14.1      | Produto                      |
| [CONFIRMAR] lista de dados por titular                                          | Anexo I   | Produto                      |
| [CONFIRMAR] criptografia em repouso e backups do Supabase                       | Anexo II  | Técnico                      |
| [CONFIRMAR] local de tratamento e mecanismo de transferência de cada fornecedor | Anexo III | Técnico e advogado           |
