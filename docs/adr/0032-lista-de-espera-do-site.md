# ADR-0032: Lista de espera do site

- **Situação:** aceito em 15/11/2026, como protótipo funcional. O Kadu revisa. O número 0031 fica reservado para o ADR do terceirizado.
- **Pedido do Eduardo:** os botões "Acessar beta" do site gramaapp.com.br passam a levar a um cadastro de lista de espera, com nome e um contato (e-mail ou WhatsApp).
- **Arquivos:**
  - migration `20261115010000_lista_de_espera.sql`;
  - teste `supabase/tests/500_lista_de_espera.test.sql`;
  - domínio `packages/domain/src/lista-de-espera.ts`, com teste;
  - central `apps/web/src/app/paginas/central/PaginaCentralListaDeEspera.tsx`, com teste;
  - site: página `lista-de-espera.html`, com o script `lista-de-espera.js`, no projeto do site (fora deste repositório).

## Decisão

### Onde o cadastro fica

O cadastro fica no Supabase do beta, na tabela `private.lista_de_espera`, para que tudo continue num lugar só. Essa tabela fica fora da API: RLS forçada e nenhum privilégio para `anon` ou `authenticated`. Ela não tem `consultoria_id`, porque quem se cadastra ainda não é cliente.

### Como o site grava

O site grava pela RPC `public.entrar_lista_de_espera(nome, contato)`, liberada para `anon` e security definer, com a chave pública do beta. Essa chave já é pública no app.

- **Nome:** de 2 a 120 caracteres, com os espaços normalizados.
- **E-mail:** fica em minúsculas.
- **WhatsApp:** fica só com dígitos e ganha o DDI 55 quando vier sem ele. Precisa ter um DDD válido e 8 ou 9 dígitos.
- **Contato repetido:** não grava de novo e não dá erro, para não revelar quem já está na lista.
- **Teto:** 10 tentativas por hora por origem (IP lido dos headers da requisição, `cf-connecting-ip`, `x-real-ip` ou o primeiro `x-forwarded-for`; gravado só como hash e apagado depois de 1 hora) e 1000 cadastros por hora no total. Passou disso, a RPC recusa com `muitas_tentativas`. Isso segura robô sem captcha. Até 19/11/2026 o teto era só global (200 por hora), e um robô sozinho travava os visitantes de verdade (migration `20261119300100_lista_de_espera_limites_e_resumo_do_aviso.sql`).
- **Domínio:** `normalizarContato` aplica a mesma regra.

### Quem lê

Só o operador da plataforma, com dois fatores. A leitura é pela RPC `central_lista_de_espera`, que é paginada e mostra os cadastros mais recentes primeiro. Na central, a página "Lista de espera" mostra o nome, o contato com link (mailto ou wa.me) e a data do cadastro.

### O site

- **Botões:** todos os "Acessar beta" levam para `/lista-de-espera`.
- **Formulário:** a página tem nome, contato e um campo escondido contra robô.
- **Segurança:** o `_headers` libera a conexão com o Supabase do beta só nessa página.
- **Clientes do beta:** `beta.gramaapp.com.br` continua no ar para quem já usa, como a Envora.

## Fora desta decisão

- Avisar por e-mail a cada cadastro novo.
- Marcar quem já foi contatado.
- Convidar direto da lista para o beta.
