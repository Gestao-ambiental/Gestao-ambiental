# ADR-0060: Vistoria sem sinal, etapa 1 (rascunho no aparelho e envio quando o sinal volta)

- Situação: proposta (camada `camada/vistoria-sem-sinal`)
- Data: 21/11/2026
- Revê: ADR-0033 §2.4 ("Sem modo offline")

## Contexto

As técnicas de campo perdem o sinal no meio da vistoria. Hoje cada item grava no servidor na hora. Quando a gravação falha, a tela marca "Não salvou" só na memória, e fechar ou recarregar perde o comentário e a foto. Elas pediram três coisas: marcar itens e tirar fotos sem sinal, fechar e reabrir a tela sem perder nada, e saber o que está salvo e o que falta enviar.

O Eduardo aprovou a etapa 1: um rascunho no aparelho, enviado quando o sinal voltar.

## Decisão

1. **Tudo vai primeiro para o aparelho.** O resultado e o comentário do item, a observação geral e cada foto são gravados num IndexedDB (`grama-campo`, loja `registros`) antes de qualquer envio. A foto guarda:
   - os bytes, o nome, o tipo e o SHA-256;
   - o instante da escolha, a legenda e o local;
   - o `fotoId` gerado no aparelho.

   Cada linha leva o id do usuário e uma versão, que sobe a cada regravação.

2. **Fila de envio** (`apps/web/src/lib/campo/fila.ts`, regras puras em `packages/domain/src/fila-de-campo.ts`):
   - **Primeira tentativa:** logo depois de gravar no aparelho.
   - **Ordem:** os resultados dos itens, depois as fotos, depois a observação. Dentro de cada tipo, vale a ordem do registro. Cada foto leva o próprio `itemId`, então nunca muda de item.
   - **Último vence:** item e observação têm uma chave só, e o registro novo substitui o anterior. Cada foto tem a sua chave.
   - **Falha de conexão:** é rede fora, tempo esgotado, 401, 408, 429 ou 5xx. Na dúvida, a falha conta como de conexão. O registro fica "no aparelho" e a volta para. A fila tenta de novo:
     - no evento `online`;
     - ao reabrir a tela;
     - quando a aba volta a ficar visível;
     - depois de uma espera de 2 s que dobra a cada falha, até 2 min.
   - **Recusa:** é o banco dizendo não, por exemplo `vistoria_fechada`. A fila para de tentar aquele registro e segue com os outros. A tela mostra o motivo, com "Tentar de novo" e "Descartar".
   - **Sem duplicar:** os ids vêm do aparelho e as RPCs já eram idempotentes. A `adicionar_foto_da_vistoria` é idempotente pelo `fotoId`, e o upload com `upsert:false` aceita o objeto que já existe. A `registrar_item_da_vistoria` regrava o mesmo valor.
   - **Foto repetida:** a mesma imagem escolhida de novo no mesmo item é recusada pelo SHA-256, comparando com as fotos do item no servidor e no aparelho. Em outro item, a mesma imagem é aceita.
3. **Na tela:**
   - **Cada item** diz "Salvo no servidor", "No aparelho, falta enviar", "Enviando…" ou "Não enviado: <motivo>". A foto que falta enviar aparece com borda tracejada e "(no aparelho, falta enviar)" no nome acessível.
   - **A vistoria** (checklist, detalhe e envio) mostra quantos registros faltam enviar, com o botão "Enviar agora", ou "Tudo salvo no servidor". O progresso conta o que a técnica registrou, no servidor ou no aparelho.
   - **Reabrir a tela** recupera o rascunho do aparelho.
   - **A foto** volta ao checklist assim que é guardada no aparelho, sem esperar o servidor.
   - **"Enviar para conferência"** com registros no aparelho envia esses registros primeiro. Se sobrar algum, a vistoria não segue e a tela avisa quantos faltam.
   - **Sem sinal,** a vistoria, os itens e as fotos já lidos continuam na tela. O cache de consultas do Campo dura um dia.
4. **Limpeza:**
   - O aparelho só apaga um registro quando o servidor confirma, e só a versão que foi enviada. O que foi regravado durante o envio segue na volta seguinte.
   - Entrar com outra conta apaga do aparelho as linhas de qualquer outro usuário, porque o celular pode ser compartilhado.
   - Sair só esquece a memória: a mesma conta, ao entrar de novo, recupera o rascunho.
   - Consequência: se a técnica sai com registros não enviados e outra pessoa entra no mesmo celular, os registros da técnica se perdem.
5. **Segurança:**
   - O IndexedDB guarda só o registro e o id do usuário. Nada de token, sessão, segredo ou CPF.
   - O envio usa a sessão normal do Supabase, com a chave anônima e o JWT. Se a sessão vencer sem sinal, o 401 deixa o registro no aparelho até a sessão renovar.
   - A RLS e as RPCs não mudaram, e não há migration nesta etapa.
6. **Sem IndexedDB** (navegador antigo ou bloqueado): a fila funciona só em memória, como antes.

## Fora desta etapa

- **Abrir uma vistoria sem nenhuma conexão desde o início.** É preciso ter lido a vistoria com sinal ao menos uma vez.
- **Service worker com cache do app.** Recarregar a página sem sinal não abre o app, porque o navegador não tem os arquivos. O rascunho continua no aparelho e aparece quando o app abrir de novo.
- **Agendar ou iniciar vistoria, e conferir, sem sinal.** Continuam exigindo conexão.
- **Excluir foto sem sinal.**

## Consequências

- **Regras que mudaram de propósito.** A tela não mostra mais "Não salvou" por falha de conexão, nem pede confirmação ao sair com um comentário que só falhou no envio, porque o registro está no aparelho. A foto não fica mais presa na tela da câmera quando o envio falha.
- **Ocupação do aparelho.** Cada foto ocupa até 25 MB enquanto não sobe. O app pede ao navegador armazenamento persistente (`navigator.storage.persist`) para o rascunho não ser apagado por falta de espaço. Se não couber, a tela diz "Não salvou no aparelho".
- **Testes.**
  - Domínio: `fila-de-campo.test.ts`.
  - Armazém e fila: `armazem.test.ts` e `fila.test.ts`, com `fake-indexeddb`.
  - Tela: `campo.test.tsx` cobre ficar sem sinal, marcar, fotografar, recarregar, voltar o sinal e enviar uma vez só, além da foto repetida, do envio da vistoria com registros no aparelho, da recusa do servidor e da ausência de token no aparelho.
